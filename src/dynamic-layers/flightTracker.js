/**
 * Flight Tracker - Real-time flight tracking layer
 * 
 * Uses OpenSky Network API for real-time flight data
 * https://opensky-network.org/apidoc/rest.html
 * 
 * This module is designed to be map-agnostic - it provides GeoJSON data
 * that can be consumed by any map library (MapBox, MapLibre, Cesium, etc.)
 */

// OpenSky Network API endpoint
const OPENSKY_API_URL = 'https://opensky-network.org/api/states/all'
const OPENSKY_AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'

// API Credentials
const CREDENTIALS = {
  clientId: 'moshew-api-client',
  clientSecret: '96D4RcTVw2GcGirC2cETtlQPWH6OTMic'
}

let accessToken = null
let tokenExpiration = 0

// Update interval (OpenSky free tier: minimum 10 seconds between requests)
export const FLIGHT_UPDATE_INTERVAL = 1000 // 1 second

// Bounding box radius in degrees (approximately 50km at mid-latitudes)
const BBOX_RADIUS = 0.5

/**
 * Calculate bounding box around a center point
 * @param {number} lon - Longitude
 * @param {number} lat - Latitude
 * @param {number} radius - Radius in degrees
 * @returns {Object} Bounding box { lamin, lomin, lamax, lomax }
 */
function getBoundingBox(lon, lat, radius = BBOX_RADIUS) {
  return {
    lamin: lat - radius,
    lamax: lat + radius,
    lomin: lon - radius,
    lomax: lon + radius
  }
}

/**
 * Get OAuth access token from OpenSky Network
 */
async function getAccessToken() {
  const now = Date.now()
  if (accessToken && now < tokenExpiration) {
    return accessToken
  }

  try {
    const params = new URLSearchParams()
    params.append('grant_type', 'client_credentials')
    params.append('client_id', CREDENTIALS.clientId)
    params.append('client_secret', CREDENTIALS.clientSecret)

    const response = await fetch(OPENSKY_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`)
    }

    const data = await response.json()
    accessToken = data.access_token
    // Set expiration slightly before actual expiry (expires_in is in seconds)
    tokenExpiration = now + (data.expires_in * 1000) - 60000
    
    return accessToken
  } catch (error) {
    console.error('Failed to get access token:', error)
    return null
  }
}

/**
 * Fetch flight data from OpenSky Network API
 * @param {number} lon - Center longitude
 * @param {number} lat - Center latitude
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function fetchFlights(lon, lat) {
  // Fetch global data (no bounding box)
  const url = new URL(OPENSKY_API_URL)
  
  // Get Access Token
  const token = await getAccessToken()
  const headers = {}
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  try {
    const response = await fetch(url.toString(), { headers })
    
    if (!response.ok) {
      // OpenSky returns 429 if rate limited
      if (response.status === 429) {
        // Silently handle rate limit
        const error = new Error('Rate limited')
        error.status = 429
        throw error
      }
      
      if (response.status === 401) {
        console.error('⚠️ FlightTracker: Authentication failed (401). Please verify your OpenSky credentials.')
      }
      
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    return convertToGeoJSON(data)
  } catch (error) {
    if (error.status === 429) throw error
    console.error('⚠️ FlightTracker: Failed to fetch flights:', error.message)
    return createEmptyGeoJSON()
  }
}

/**
 * Convert OpenSky API response to GeoJSON
 * 
 * OpenSky state vector format (index):
 * 0: icao24 - ICAO 24-bit address
 * 1: callsign - Callsign (can be null)
 * 2: origin_country - Country of origin
 * 3: time_position - Unix timestamp of last position update
 * 4: last_contact - Unix timestamp of last contact
 * 5: longitude - WGS-84 longitude
 * 6: latitude - WGS-84 latitude
 * 7: baro_altitude - Barometric altitude in meters
 * 8: on_ground - Boolean, true if on ground
 * 9: velocity - Velocity in m/s
 * 10: true_track - True track angle in degrees (0 = north)
 * 11: vertical_rate - Vertical rate in m/s
 * 12: sensors - IDs of receivers
 * 13: geo_altitude - Geometric altitude in meters
 * 14: squawk - Transponder code
 * 15: spi - Special purpose indicator
 * 16: position_source - Source of position (0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM)
 * 
 * @param {Object} data - OpenSky API response
 * @returns {Object} GeoJSON FeatureCollection
 */
function convertToGeoJSON(data) {
  if (!data || !data.states || !Array.isArray(data.states)) {
    return createEmptyGeoJSON()
  }
  
  const features = data.states
    .filter(state => {
      // Filter out aircraft on ground or without valid position
      const lon = state[5]
      const lat = state[6]
      const onGround = state[8]
      return lon !== null && lat !== null && !onGround
    })
    .map(state => {
      const lon = state[5]
      const lat = state[6]
      const altitude = state[7] || state[13] || 0 // baro_altitude or geo_altitude
      const heading = state[10] || 0 // true_track
      const velocity = state[9] || 0
      const verticalRate = state[11] || 0
      const callsign = (state[1] || '').trim()
      const icao24 = state[0]
      const originCountry = state[2]
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat, altitude]
        },
        properties: {
          id: icao24,
          callsign: callsign || icao24.toUpperCase(),
          icao24: icao24,
          originCountry: originCountry,
          altitude: Math.round(altitude),
          altitudeFeet: Math.round(altitude * 3.28084),
          heading: heading,
          velocity: Math.round(velocity),
          velocityKnots: Math.round(velocity * 1.94384),
          verticalRate: Math.round(verticalRate),
          // For icon rotation (MapBox uses bearing in degrees)
          bearing: heading
        }
      }
    })
  
  console.log(`✈️ FlightTracker: ${features.length} aircraft in range`)
  
  return {
    type: 'FeatureCollection',
    features: features,
    timestamp: data.time || Date.now() / 1000
  }
}

/**
 * Create an empty GeoJSON FeatureCollection
 */
function createEmptyGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: [],
    timestamp: Date.now() / 1000
  }
}

/**
 * FlightTracker class for managing real-time updates
 */
export class FlightTracker {
  constructor(options = {}) {
    this.onUpdate = options.onUpdate || (() => {})
    this.interval = options.interval || FLIGHT_UPDATE_INTERVAL
    this.center = null
    this.timerId = null
    this.isRunning = false
    this.lastData = createEmptyGeoJSON()
    // Map to store flight paths: icao24 -> array of coordinates [lon, lat, alt]
    this.flightPaths = new Map()
    this.subscribers = new Set()
    this.useLocalData = false
    this.cachedLocalData = null
    this.disableTimeout = null
  }
  
  /**
   * Subscribe to flight updates
   * @param {Function} callback - Function to call with (data, paths)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    // If we have a pending disable, cancel it (new subscriber arrived)
    if (this.disableTimeout) {
      clearTimeout(this.disableTimeout)
      this.disableTimeout = null
    }

    // If this is the first subscriber, start tracking
    if (this.subscribers.size === 0 && !this.isRunning) {
      this.enable()
    }

    this.subscribers.add(callback)
    // Send current data immediately
    callback(this.lastData, this.getPaths())
    
    return () => {
      this.subscribers.delete(callback)
      
      // If no subscribers left, schedule disable
      if (this.subscribers.size === 0) {
        // Debounce disable to allow for map switching without data loss
        this.disableTimeout = setTimeout(() => {
          this.disable()
          this.disableTimeout = null
        }, 500) // 500ms grace period
      }
    }
  }

  /**
   * Notify all subscribers with current data
   */
  notifySubscribers() {
    const paths = this.getPaths()
    this.subscribers.forEach(cb => cb(this.lastData, paths))
    // Legacy support
    if (this.onUpdate) this.onUpdate(this.lastData)
  }

  /**
   * Enable tracking (called when layer is turned on)
   */
  enable() {
    if (!this.isRunning) {
      this.isRunning = true
      this._fetch()
      this.timerId = setInterval(() => {
        if (this.isRunning) {
          this._fetch()
        }
      }, this.interval)
      console.log('✈️ FlightTracker: Enabled')
    }
  }

  /**
   * Disable tracking (called when layer is turned off)
   */
  disable() {
    this.isRunning = false
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
    // Clear history
    this.flightPaths.clear()
    this.lastData = createEmptyGeoJSON()
    this.notifySubscribers()
    console.log('✈️ FlightTracker: Disabled')
  }

  /**
   * Start tracking around a location (Legacy support, use setCenter + enable)
   * @param {number} lon - Center longitude
   * @param {number} lat - Center latitude
   */
  start(lon, lat) {
    this.setCenter(lon, lat)
    this.enable()
  }
  
  /**
   * Update the center location (e.g., when user changes city)
   * @param {number} lon - New center longitude
   * @param {number} lat - New center latitude
   */
  setCenter(lon, lat) {
    const oldCenter = this.center
    this.center = { lon, lat }
    
    // If location changed significantly and running, fetch immediately
    if (this.isRunning && oldCenter) {
      const distance = Math.sqrt(
        Math.pow(lon - oldCenter.lon, 2) + 
        Math.pow(lat - oldCenter.lat, 2)
      )
      if (distance > 0.1) {
        this._fetch()
      }
    }
  }
  
  /**
   * Stop tracking (Legacy support, use disable)
   */
  stop() {
    this.disable()
  }
  
  /**
   * Get the last fetched data
   * @returns {Object} GeoJSON FeatureCollection
   */
  getData() {
    return this.lastData
  }

  /**
   * Get flight paths as GeoJSON
   * @returns {Object} GeoJSON FeatureCollection of LineStrings
   */
  getPaths() {
    const features = []
    
    this.flightPaths.forEach((coordinates, icao24) => {
      if (coordinates.length < 2) return
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {
          icao24: icao24
        }
      })
    })
    
    return {
      type: 'FeatureCollection',
      features: features
    }
  }

  /**
   * Extrapolate positions based on velocity and heading
   */
  extrapolatePositions(lastData) {
    const now = Date.now() / 1000
    const dt = now - lastData.timestamp
    
    if (dt <= 0) return lastData
    
    const newFeatures = lastData.features.map(f => {
      const [lon, lat, alt] = f.geometry.coordinates
      const v = f.properties.velocity || 0
      const heading = f.properties.heading || 0
      
      // R = 6371000 meters
      const R = 6371000
      // Convert heading to radians (0 is North, clockwise)
      const headingRad = heading * Math.PI / 180
      
      const dy = v * Math.cos(headingRad) * dt
      const dx = v * Math.sin(headingRad) * dt
      
      const dLat = (dy / R) * (180 / Math.PI)
      const dLon = (dx / (R * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI)
      
      return {
        ...f,
        geometry: {
          ...f.geometry,
          coordinates: [lon + dLon, lat + dLat, alt]
        }
      }
    })
    
    return {
      ...lastData,
      features: newFeatures,
      timestamp: now
    }
  }

  /**
   * Load fallback data from local file
   */
  async loadFallbackData() {
    if (this.cachedLocalData) {
      // Return a copy with updated timestamp to avoid reference issues
      return {
        ...this.cachedLocalData,
        timestamp: Date.now() / 1000
      }
    }

    try {
      console.log('✈️ FlightTracker: Loading fallback data...')
      const response = await fetch('/data/opensky-network.gepjson')
      if (!response.ok) throw new Error('Failed to load fallback file')
      const jsonData = await response.json()
      this.cachedLocalData = convertToGeoJSON(jsonData)
      return {
        ...this.cachedLocalData,
        timestamp: Date.now() / 1000
      }
    } catch (e) {
      console.error("Failed to load fallback data", e)
      return createEmptyGeoJSON()
    }
  }
  
  /**
   * Internal fetch method
   */
  async _fetch() {
    // If not running, don't fetch
    if (!this.isRunning) return

    // If no center, we can still fetch if we want global, but let's wait for center
    if (!this.center) return
    
    let data = null

    // Always use local data (skip OpenSky API to avoid rate limits)
    // Keep the API code for future use when needed
    const USE_API = false // Set to true to enable OpenSky API
    
    if (!USE_API || this.useLocalData) {
      // If we have previous data, extrapolate positions to create movement
      if (this.lastData && this.lastData.features && this.lastData.features.length > 0) {
        data = this.extrapolatePositions(this.lastData)
      } else {
        data = await this.loadFallbackData()
      }
    } else {
      try {
        data = await fetchFlights(this.center.lon, this.center.lat)
      } catch (error) {
        if (error.status === 429) {
          // Silently switch to local data
          this.useLocalData = true
          data = await this.loadFallbackData()
        } else {
          // Other errors, keep last data or empty
          console.error('Flight fetch error:', error)
          return
        }
      }
    }
    
    // Update flight paths
    if (data && data.features) {
      const currentIcao24s = new Set()
      
      data.features.forEach(feature => {
        const icao24 = feature.properties.icao24
        const coords = feature.geometry.coordinates // [lon, lat, alt]
        const timestamp = data.timestamp || Date.now() / 1000
        
        currentIcao24s.add(icao24)
        
        if (!this.flightPaths.has(icao24)) {
          this.flightPaths.set(icao24, [])
        }
        
        const path = this.flightPaths.get(icao24)
        
        // Add new point if it's different from the last one
        const lastPoint = path[path.length - 1]
        if (!lastPoint || 
            lastPoint[0] !== coords[0] || 
            lastPoint[1] !== coords[1]) {
          // Store [lon, lat, alt, timestamp]
          path.push([...coords, timestamp])
          
          // Limit path length to prevent memory issues (e.g., last 30 points)
          if (path.length > 30) {
            path.shift()
          }
        }
      })
      
      // Optional: Clean up paths for aircraft that are no longer in range
      // For now, we keep them to show where they went
    }
    
    this.lastData = data
    this.notifySubscribers()
  }
}

// Export singleton instance
export const flightTracker = new FlightTracker()

// Default export for backward compatibility (but users should use named export 'flightTracker')
export default FlightTracker

