import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon issue with bundlers
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
})

L.Marker.prototype.options.icon = DefaultIcon

import { CONTINENTS, INITIAL_ZOOM } from '../components/LocationSelector'
import { loadMapStyle, getReligionIconUrls, getIconUrl, loadReligiousBuildings, loadPowerLines } from '../utils/mapStyleConfig'
import { flightTracker } from '../dynamic-layers/flightTracker'

const RELIGION_COLORS = {
  jewish: '#3b82f6',
  muslim: '#10b981',
  christian: '#ef4444',
  buddhist: '#f59e0b',
  hindu: '#8b5cf6',
  shinto: '#ec4899',
  default: '#64748b'
}

// Helper for radius interpolation
function getRadiusForZoom(zoom) {
  if (zoom <= 10) return 2; // Smaller at low zoom
  if (zoom >= 18) return 10;
  return 2 + (zoom - 10) * ((10 - 2) / (18 - 10));
}

const MapLeaflet = forwardRef(({ currentLocation, viewMode, isActive, onTileLoad, layers, initialCamera }, ref) => {
  const mapContainer = useRef(null)
  const mapInstance = useRef(null)
  const isMapLoaded = useRef(false)
  
  // Layer references
  const powerLinesLayer = useRef(null)
  const religiousBuildingsLayer = useRef(null)
  const flightLayer = useRef(null)
  const flightPathLayer = useRef(null)
  
  // State to track initial location to prevent unwanted flyTo on mount
  const initialLocationRef = useRef(currentLocation)
  const initialCameraOnMount = useRef(initialCamera)

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getCamera: () => {
      if (!mapInstance.current) return null
      const center = mapInstance.current.getCenter()
      const zoom = mapInstance.current.getZoom()
      return {
        center: [center.lng, center.lat], // Return [lng, lat]
        zoom: zoom,
        pitch: 0, // Leaflet is 2D
        bearing: 0 // Leaflet is 2D
      }
    },
    flyTo: (continentKey, cityKey) => {
      const continent = CONTINENTS[continentKey]
      if (!continent) return
      const location = continent.locations[cityKey]
      if (!location || !mapInstance.current) return

      // Leaflet uses [lat, lng]
      mapInstance.current.flyTo([location.coords[1], location.coords[0]], INITIAL_ZOOM, {
        duration: 2
      })
    }
  }))

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return

    // Determine initial view
    let center = [40.7128, -74.0060] // Default NY
    let zoom = 13

    if (initialCamera) {
      center = [initialCamera.center[1], initialCamera.center[0]] // [lat, lng]
      zoom = initialCamera.zoom
    } else if (currentLocation) {
      const continent = CONTINENTS[currentLocation.continent]
      if (continent) {
        const city = continent.locations[currentLocation.city]
        if (city) {
          center = [city.coords[1], city.coords[0]]
        }
      }
    }

    const map = L.map(mapContainer.current, {
      center: center,
      zoom: zoom,
      zoomControl: false,
      attributionControl: false
    })

    // Add Esri World Imagery (Satellite) tiles
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19
    }).addTo(map)

    mapInstance.current = map
    isMapLoaded.current = true

    // Trigger tile load callback (simulated)
    if (onTileLoad) {
      map.on('load', () => onTileLoad(1))
      map.on('moveend', () => onTileLoad(1))
    }

    // Load Map Style (just for metadata)
    loadMapStyle().then((style) => {
      // We just need the style loaded to ensure we have metadata if needed
      // Data loading is now lazy in the visibility effect
    })

    // Update radius on zoom
    const handleZoomEnd = () => {
      if (religiousBuildingsLayer.current) {
        const currentZoom = map.getZoom()
        const newRadius = getRadiusForZoom(currentZoom)
        religiousBuildingsLayer.current.eachLayer(layer => {
          if (layer.setRadius) {
            layer.setRadius(newRadius)
          }
        })
      }
    }

    map.on('zoomend', handleZoomEnd)

    return () => {
      map.off('zoomend', handleZoomEnd)
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [])

  // Handle Location Changes
  useEffect(() => {
    if (!mapInstance.current || !currentLocation) return

    // If we initialized with a specific camera (initialCamera), 
    // we want to avoid flying to the currentLocation on mount.
    // We only fly if the location has actually changed since mount.
    if (initialCameraOnMount.current && currentLocation === initialLocationRef.current) {
      return
    }

    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return
    const location = continent.locations[currentLocation.city]
    if (!location) return

    mapInstance.current.flyTo([location.coords[1], location.coords[0]], INITIAL_ZOOM, {
      duration: 2
    })
  }, [currentLocation])

  // Handle Layer Visibility
  useEffect(() => {
    if (!mapInstance.current) return
    
    const handlePowerLines = async () => {
      if (layers['power-lines']?.visible) {
        if (!powerLinesLayer.current) {
          try {
            const data = await loadPowerLines()
            powerLinesLayer.current = L.geoJSON(data, {
              style: {
                color: '#ffdc00',
                weight: 4,
                opacity: 0.8
              }
            })
          } catch (err) {
            console.error('Failed to load power lines:', err)
            return
          }
        }
        
        if (powerLinesLayer.current && !mapInstance.current.hasLayer(powerLinesLayer.current)) {
          powerLinesLayer.current.addTo(mapInstance.current)
        }
      } else {
        if (powerLinesLayer.current && mapInstance.current.hasLayer(powerLinesLayer.current)) {
          mapInstance.current.removeLayer(powerLinesLayer.current)
        }
      }
    }

    const handleReligiousBuildings = async () => {
      if (layers['religious-buildings']?.visible) {
        if (!religiousBuildingsLayer.current) {
          try {
            const data = await loadReligiousBuildings()
            religiousBuildingsLayer.current = L.geoJSON(data, {
              pointToLayer: (feature, latlng) => {
                const religion = feature.properties.religion || 'default'
                const color = RELIGION_COLORS[religion] || RELIGION_COLORS.default
                
                // Calculate radius based on initial zoom
                const currentZoom = mapInstance.current.getZoom()
                const radius = getRadiusForZoom(currentZoom)

                return L.circleMarker(latlng, {
                  radius: radius,
                  fillColor: color,
                  color: '#fff',
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.8
                })
              },
              onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.name) {
                  layer.bindPopup(feature.properties.name)
                }
              }
            })
          } catch (err) {
            console.error('Failed to load religious buildings:', err)
            return
          }
        }

        if (religiousBuildingsLayer.current && !mapInstance.current.hasLayer(religiousBuildingsLayer.current)) {
          religiousBuildingsLayer.current.addTo(mapInstance.current)
        }
      } else {
        if (religiousBuildingsLayer.current && mapInstance.current.hasLayer(religiousBuildingsLayer.current)) {
          mapInstance.current.removeLayer(religiousBuildingsLayer.current)
        }
      }
    }

    handlePowerLines()
    handleReligiousBuildings()
    
  }, [layers])

  // Handle Flights Layer
  useEffect(() => {
    if (!mapInstance.current) return

    const isVisible = layers['flight-tracking']?.visible
    
    if (isVisible) {
      // Initialize layers if needed
      if (!flightLayer.current) {
        flightLayer.current = L.layerGroup().addTo(mapInstance.current)
      }
      if (!flightPathLayer.current) {
        flightPathLayer.current = L.layerGroup().addTo(mapInstance.current)
      }
      
      // Add to map if not already
      if (!mapInstance.current.hasLayer(flightLayer.current)) {
        flightLayer.current.addTo(mapInstance.current)
      }
      if (!mapInstance.current.hasLayer(flightPathLayer.current)) {
        flightPathLayer.current.addTo(mapInstance.current)
      }

      // Update center
      const center = mapInstance.current.getCenter()
      flightTracker.setCenter(center.lng, center.lat)

      const unsubscribe = flightTracker.subscribe((data, paths) => {
        if (!flightLayer.current || !flightPathLayer.current) return

        // Update Aircrafts
        flightLayer.current.clearLayers()
        if (data && data.features) {
          data.features.forEach(feature => {
            const [lon, lat] = feature.geometry.coordinates
            const { heading, callsign, altitudeFeet, velocityKnots } = feature.properties
            
            const marker = L.circleMarker([lat, lon], {
              radius: 4,
              fillColor: '#fbbf24', // Yellow
              color: '#fff',
              weight: 1,
              opacity: 1,
              fillOpacity: 0.9
            })

            marker.bindPopup(`
              <div style="font-family: sans-serif;">
                <div style="font-weight: bold; margin-bottom: 4px;">${callsign}</div>
                <div>Alt: ${altitudeFeet} ft</div>
                <div>Spd: ${velocityKnots} kts</div>
                <div>Hdg: ${heading}°</div>
              </div>
            `)
            marker.addTo(flightLayer.current)
          })
        }

        // Update Paths
        flightPathLayer.current.clearLayers()
        if (paths && paths.features) {
          L.geoJSON(paths, {
            style: {
              color: '#ffffff',
              weight: 2,
              opacity: 0.6,
              dashArray: '5, 5'
            }
          }).addTo(flightPathLayer.current)
        }
      })

      // Update center when map moves
      const handleMoveEnd = () => {
        const center = mapInstance.current.getCenter()
        flightTracker.setCenter(center.lng, center.lat)
      }
      mapInstance.current.on('moveend', handleMoveEnd)

      return () => {
        unsubscribe()
        if (mapInstance.current) {
          mapInstance.current.off('moveend', handleMoveEnd)
        }
      }
    } else {
      // Hide/Remove layers
      if (flightLayer.current) {
        flightLayer.current.clearLayers()
        if (mapInstance.current.hasLayer(flightLayer.current)) {
          mapInstance.current.removeLayer(flightLayer.current)
        }
      }
      if (flightPathLayer.current) {
        flightPathLayer.current.clearLayers()
        if (mapInstance.current.hasLayer(flightPathLayer.current)) {
          mapInstance.current.removeLayer(flightPathLayer.current)
        }
      }
    }
  }, [layers['flight-tracking']?.visible])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%', background: '#000' }} />
})

export default MapLeaflet
