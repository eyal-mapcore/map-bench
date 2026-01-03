import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { Tile3DLayer } from '@deck.gl/geo-layers'
import { IconLayer, LineLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import { Tiles3DLoader } from '@loaders.gl/3d-tiles'
import 'maplibre-gl/dist/maplibre-gl.css'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from '../components/LocationSelector'
import { DEFAULT_RELIGION_ICONS, getIconUrl } from '../utils/mapStyleConfig'
import { flightTracker } from '../dynamic-layers/flightTracker'

// Height for floating religious icons above buildings (meters)
const RELIGIOUS_ICON_HEIGHT = 50

// API Keys - set in .env file
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_3D_TILES_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`

// Map style - loaded from JSON file following MapLibre Style Specification
const MAP_STYLE_URL = '/map-style.json'

const MapLibre = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad, layers = {}, initialCamera = null }, ref) => {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const overlay = useRef(null)
  const currentViewMode = useRef(viewMode)
  const isMapLoaded = useRef(false)
  const isActiveRef = useRef(isActive)
  const powerLinesLayerAdded = useRef(false)
  const mapInitialized = useRef(false) // Track if we've actually created a map
  const hasSkippedFirstFlyTo = useRef(false) // Track if we've skipped first flyTo (for initialCamera)
  const religiousBuildingsData = useRef(null)
  const flightData = useRef({ type: 'FeatureCollection', features: [] })
  const flightPaths = useRef({ type: 'FeatureCollection', features: [] })
  const layersStateRef = useRef(layers)
  const animationRef = useRef(null)
  const currentTime = useRef(Date.now() / 1000)
  
  // Lazy loading flags - track which layers have been loaded
  const loadedLayers = useRef({
    'power-lines': false,
    'religious-buildings': false
  })
  
  // Store initialCamera value at first render for use in effects
  const initialCameraOnMount = useRef(initialCamera)

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    flyTo: (continentKey, cityKey) => {
      const continent = CONTINENTS[continentKey]
      if (!continent) return
      const location = continent.locations[cityKey]
      if (!location || !map.current) return

      const pitch = currentViewMode.current === '3d' ? INITIAL_PITCH : 0
      map.current.flyTo({
        center: location.coords,
        zoom: INITIAL_ZOOM,
        pitch: pitch,
        bearing: INITIAL_BEARING,
        duration: 3000
      })
    },
    getCamera: () => {
      if (!map.current) return null
      return {
        center: map.current.getCenter().toArray(),
        zoom: map.current.getZoom(),
        pitch: map.current.getPitch(),
        bearing: map.current.getBearing()
      }
    },
    setCamera: (camera) => {
      if (!map.current || !camera) return
      map.current.jumpTo({
        center: camera.center,
        zoom: camera.zoom,
        pitch: camera.pitch,
        bearing: camera.bearing
      })
    }
  }), [])

  const createTile3DLayer = useCallback(() => {
    return new Tile3DLayer({
      id: 'google-3d-tiles',
      data: GOOGLE_3D_TILES_URL,
      loader: Tiles3DLoader,
      loadOptions: {
        '3d-tiles': {
          loadGLTF: true,
          decodeQuantizedPositions: false
        }
      },
      screenSpaceError: 8,
      refinementStrategy: 'best-available',
      maximumMemoryUsage: 1024 * 1024 * 1024,
      opacity: 1,
      onTilesetLoad: () => console.log('✓ Google 3D Tileset loaded (MapLibre)'),
      onTileLoad: () => {
        if (onTileLoad) {
          onTileLoad()
        }
      },
      onTileError: () => {}
    })
  }, [onTileLoad])

  // Create deck.gl layers for 3D elevated religious buildings
  const createReligious3DLayers = useCallback(() => {
    if (!religiousBuildingsData.current) return []
    
    const features = religiousBuildingsData.current.features || []
    
    // Line layer - dashed white lines from ground to elevated icon
    const linesLayer = new LineLayer({
      id: 'religious-buildings-3d-lines',
      data: features,
      getSourcePosition: d => [...d.geometry.coordinates, 0],
      getTargetPosition: d => [...d.geometry.coordinates, RELIGIOUS_ICON_HEIGHT],
      getColor: [255, 255, 255, 200],
      getWidth: 2,
      widthUnits: 'pixels',
      getDashArray: [4, 4],
      dashJustified: true,
      extensions: [new PathStyleExtension({ dash: true })]
    })

    // Icon layer - elevated icons
    const iconsLayer = new IconLayer({
      id: 'religious-buildings-3d-icons',
      data: features,
      getPosition: d => [...d.geometry.coordinates, RELIGIOUS_ICON_HEIGHT],
      getIcon: d => {
        const religion = d.properties?.religion || 'default'
        return {
          url: getIconUrl(DEFAULT_RELIGION_ICONS, religion),
          width: 64,
          height: 64,
          anchorY: 32
        }
      },
      getSize: 32,
      sizeUnits: 'pixels',
      billboard: true,
      pickable: true
    })

    return [linesLayer, iconsLayer]
  }, [])

  // Create deck.gl layer for flight tracking
  const createFlightLayers = useCallback((time) => {
    const layers = []
    
    // 1. Flight Paths (TripsLayer for flowing effect)
    if (flightPaths.current && flightPaths.current.features?.length) {
      layers.push(new TripsLayer({
        id: 'flight-paths-layer',
        data: flightPaths.current.features,
        getPath: d => d.geometry.coordinates.map(p => [p[0], p[1], p[2]]),
        getTimestamps: d => d.geometry.coordinates.map(p => p[3] || 0),
        getColor: [59, 130, 246],
        opacity: 0.8,
        widthMinPixels: 3,
        rounded: true,
        trailLength: 180,
        currentTime: time,
        shadowEnabled: false
      }))
    }

    // 2. Aircraft Icons
    if (flightData.current && flightData.current.features?.length) {
      layers.push(new IconLayer({
        id: 'flight-tracking-layer',
        data: flightData.current.features,
        getPosition: d => d.geometry.coordinates,
        getIcon: d => ({
          url: '/sprites/airplane-fr24.svg',
          width: 64,
          height: 64,
          mask: false
        }),
        getSize: 25,
        sizeUnits: 'pixels',
        getColor: [255, 255, 255, 255],
        getAngle: d => 360 - (d.properties.heading || 0),
        billboard: false,
        pickable: true,
        onHover: ({ object, x, y }) => {
          if (object) {
            const tooltip = document.getElementById('flight-tooltip')
            if (tooltip) {
              const props = object.properties
              tooltip.innerHTML = `
                <strong>${props.callsign}</strong><br/>
                גובה: ${props.altitudeFeet.toLocaleString()} ft<br/>
                מהירות: ${props.velocityKnots} קשר<br/>
                כיוון: ${Math.round(props.heading)}°
              `
              tooltip.style.display = 'block'
              tooltip.style.left = `${x + 10}px`
              tooltip.style.top = `${y + 10}px`
            }
          } else {
            const tooltip = document.getElementById('flight-tooltip')
            if (tooltip) tooltip.style.display = 'none'
          }
        }
      }))
    }
    
    return layers
  }, [])

  // Lazy load layer data on first toggle
  const loadLayerData = useCallback(async (layerId) => {
    // Skip if already loaded
    if (loadedLayers.current[layerId]) {
      return true
    }
    
    console.log(`🔄 MapLibre: Lazy loading ${layerId} data...`)
    
    try {
      if (layerId === 'religious-buildings') {
        // Load GeoJSON data
        const response = await fetch('/data/religious-buildings.geojson')
        religiousBuildingsData.current = await response.json()
        
        // Load religious building icons as SVG images (only on first toggle)
        const religionIcons = ['jewish', 'christian', 'muslim', 'buddhist', 'hindu', 'shinto', 'default']
        
        for (const religion of religionIcons) {
          try {
            const img = new Image(24, 24)
            img.src = `/sprites/${religion}.svg`
            await new Promise((resolve, reject) => {
              img.onload = resolve
              img.onerror = reject
            })
            if (map.current && !map.current.hasImage(`icon-${religion}`)) {
              map.current.addImage(`icon-${religion}`, img, { sdf: false })
            }
          } catch (e) {
            console.warn(`Failed to load icon: ${religion}`, e)
          }
        }
        
        loadedLayers.current['religious-buildings'] = true
        console.log('✓ MapLibre: Religious buildings data & icons loaded (lazy)')
        return true
      }
      
      if (layerId === 'power-lines') {
        // Power lines data is already in the style JSON, just mark as loaded
        loadedLayers.current['power-lines'] = true
        console.log('✓ MapLibre: Power lines layer ready (lazy)')
        return true
      }
      
      return true
    } catch (e) {
      console.warn(`Failed to load ${layerId} data:`, e)
      return false
    }
  }, [])

  useEffect(() => {
    // Skip if map already exists (React Strict Mode double-render protection)
    if (map.current || mapInitialized.current) return
    mapInitialized.current = true

    // Use initialCamera if provided (when switching from another map), otherwise use location
    let center, zoom, pitch, bearing
    const cameraToUse = initialCameraOnMount.current
    
    if (cameraToUse) {
      center = cameraToUse.center
      zoom = cameraToUse.zoom
      pitch = cameraToUse.pitch
      bearing = cameraToUse.bearing
    } else {
      const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
      center = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords
      zoom = INITIAL_ZOOM
      pitch = viewMode === '3d' ? INITIAL_PITCH : 0
      bearing = INITIAL_BEARING
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE_URL,
      center: center,
      zoom: zoom,
      pitch: pitch,
      bearing: bearing,
      antialias: true,
      maxPitch: 85,
      attributionControl: false
    })

    map.current.on('load', async () => {
      isMapLoaded.current = true
      
      // Build initial deck.gl layers
      const deckLayers = []
      if (viewMode === '3d') {
        deckLayers.push(createTile3DLayer())
        // Note: Religious buildings data loaded lazily when layer is first enabled
      }
      
      // Add flight tracking layers if visible
      if (layersStateRef.current['flight-tracking']?.visible) {
        deckLayers.push(...createFlightLayers(currentTime.current))
      }
      
      overlay.current = new MapboxOverlay({ interleaved: true, layers: deckLayers })
      map.current.addControl(overlay.current)

      // Note: Religious icons are loaded lazily when the layer is first enabled

      // Layers are now defined in the style JSON file (map-style.json)
      // Apply initial visibility state IMMEDIATELY (no setTimeout to avoid flash)
      powerLinesLayerAdded.current = true
      console.log('✓ MapLibre: Style loaded with layers from map-style.json')
      
      // Apply initial layer visibility state immediately (no flash!)
      const powerLinesVisible = layersStateRef.current['power-lines']?.visible
      const religiousBuildingsVisible = layersStateRef.current['religious-buildings']?.visible
      const is3D = currentViewMode.current === '3d'

      // Toggle power lines layer visibility
      const powerLinesVisibility = powerLinesVisible ? 'visible' : 'none'
      if (map.current.getLayer('power-lines-layer')) {
        map.current.setLayoutProperty('power-lines-layer', 'visibility', powerLinesVisibility)
      }
      if (map.current.getLayer('power-lines-glow')) {
        map.current.setLayoutProperty('power-lines-glow', 'visibility', powerLinesVisibility)
      }

      // Toggle religious buildings layer visibility
      const religiousVisibility = religiousBuildingsVisible && !is3D ? 'visible' : 'none'
      if (map.current.getLayer('religious-buildings-circle')) {
        map.current.setLayoutProperty('religious-buildings-circle', 'visibility', religiousVisibility)
      }
      if (map.current.getLayer('religious-buildings-icon')) {
        map.current.setLayoutProperty('religious-buildings-icon', 'visibility', religiousVisibility)
      }
      if (map.current.getLayer('religious-buildings-label')) {
        map.current.setLayoutProperty('religious-buildings-label', 'visibility', religiousVisibility)
      }

      // Update deck.gl layers for 3D religious buildings
      if (overlay.current && is3D && religiousBuildingsVisible) {
        const deckLayers = [createTile3DLayer(), ...createReligious3DLayers()]
        overlay.current.setProps({ layers: deckLayers })
      }

      console.log('✓ MapLibre: Initial layer state applied (no flash)')
    })

    return () => {
      // Cancel animation loop
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      
      if (map.current) {
        if (overlay.current) {
          try {
            if (map.current.hasControl(overlay.current)) {
              map.current.removeControl(overlay.current)
            }
            overlay.current.finalize()
          } catch (e) {
            console.warn('Error cleaning up MapboxOverlay:', e)
          }
          overlay.current = null
        }
        
        map.current.remove()
        map.current = null
      }
      // Reset refs for next mount (important for React Strict Mode)
      mapInitialized.current = false
      isMapLoaded.current = false
      powerLinesLayerAdded.current = false
      hasSkippedFirstFlyTo.current = false
      // Reset lazy loading flags
      loadedLayers.current = {
        'power-lines': false,
        'religious-buildings': false
      }
      religiousBuildingsData.current = null
    }
  }, [createTile3DLayer])
  
  // Handle location changes from parent
  useEffect(() => {
    if (!map.current) return

    // Skip the first flyTo if we used initialCamera (preserves camera state when switching maps)
    if (initialCameraOnMount.current && !hasSkippedFirstFlyTo.current) {
      hasSkippedFirstFlyTo.current = true
      return
    }

    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return
    const location = continent.locations[currentLocation.city]
    if (!location) return

    const pitch = viewMode === '3d' ? INITIAL_PITCH : 0
    map.current.flyTo({
      center: location.coords,
      zoom: INITIAL_ZOOM,
      pitch: pitch,
      bearing: INITIAL_BEARING,
      duration: 3000
    })
  }, [currentLocation, viewMode])

  // Helper to update deck.gl overlay layers
  const updateOverlayLayers = useCallback(() => {
    if (!overlay.current || !isMapLoaded.current) return
    
    const is3D = currentViewMode.current === '3d'
    const deckLayers = []
    
    // Add 3D tiles if in 3D mode and active
    if (is3D && isActiveRef.current) {
      deckLayers.push(createTile3DLayer())
    }
    
    // Add 3D religious buildings if in 3D mode and visible
    if (is3D && layersStateRef.current['religious-buildings']?.visible) {
      deckLayers.push(...createReligious3DLayers())
    }
    
    // Add flight tracking layers if visible
    if (layersStateRef.current['flight-tracking']?.visible) {
      deckLayers.push(...createFlightLayers(currentTime.current))
    }
    
    overlay.current.setProps({ layers: deckLayers })
  }, [createTile3DLayer, createReligious3DLayers, createFlightLayers])

  // Animation loop for TripsLayer
  useEffect(() => {
    const animate = () => {
      currentTime.current = Date.now() / 1000
      
      // Only update if flight tracking is visible to save performance
      if (layersStateRef.current['flight-tracking']?.visible) {
        updateOverlayLayers()
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [updateOverlayLayers])

  // Initialize Flight Tracker
  useEffect(() => {
    const isVisible = layers['flight-tracking']?.visible
    
    if (isVisible) {
      // Update center
      const continent = CONTINENTS[currentLocation.continent]
      if (continent) {
        const location = continent.locations[currentLocation.city]
        if (location) {
          flightTracker.setCenter(location.coords[0], location.coords[1])
        }
      }

      // Subscribe to updates
      const unsubscribe = flightTracker.subscribe((data, paths) => {
        flightData.current = data
        flightPaths.current = paths
        updateOverlayLayers()
      })

      return () => {
        unsubscribe()
      }
    }
  }, [layers, currentLocation, updateOverlayLayers])

  // Handle view mode changes (2D/3D)
  useEffect(() => {
    if (!map.current || !isMapLoaded.current) return
    currentViewMode.current = viewMode

    const is3D = viewMode === '3d'
    const targetPitch = is3D ? INITIAL_PITCH : 0

    // Animate pitch change
    map.current.easeTo({
      pitch: targetPitch,
      duration: 1000
    })

    // Update deck.gl layers based on view mode
    updateOverlayLayers()
  }, [viewMode, updateOverlayLayers])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    if (!overlay.current || !isMapLoaded.current) return

    updateOverlayLayers()
  }, [isActive, updateOverlayLayers])

  // Apply current layer visibility state - called both on initial load and when layers change
  // Supports lazy loading - data is fetched only on first toggle
  const applyLayersState = useCallback(async () => {
    if (!map.current || !isMapLoaded.current || !powerLinesLayerAdded.current) return

    const currentLayers = layersStateRef.current
    const powerLinesVisible = currentLayers['power-lines']?.visible
    const religiousBuildingsVisible = currentLayers['religious-buildings']?.visible
    const is3D = currentViewMode.current === '3d'

    // Lazy load power lines data on first toggle
    if (powerLinesVisible && !loadedLayers.current['power-lines']) {
      await loadLayerData('power-lines')
    }

    // Lazy load religious buildings data on first toggle
    if (religiousBuildingsVisible && !loadedLayers.current['religious-buildings']) {
      await loadLayerData('religious-buildings')
    }

    // Toggle power lines layer visibility
    const powerLinesVisibility = powerLinesVisible ? 'visible' : 'none'
    
    if (map.current.getLayer('power-lines-layer')) {
      map.current.setLayoutProperty('power-lines-layer', 'visibility', powerLinesVisibility)
    }
    if (map.current.getLayer('power-lines-glow')) {
      map.current.setLayoutProperty('power-lines-glow', 'visibility', powerLinesVisibility)
    }

    // Toggle religious buildings layer visibility
    // In 3D mode: hide native layers, use deck.gl elevated layers
    // In 2D mode: show native layers
    const religiousVisibility = religiousBuildingsVisible && !is3D ? 'visible' : 'none'
    
    if (map.current.getLayer('religious-buildings-circle')) {
      map.current.setLayoutProperty('religious-buildings-circle', 'visibility', religiousVisibility)
    }
    if (map.current.getLayer('religious-buildings-icon')) {
      map.current.setLayoutProperty('religious-buildings-icon', 'visibility', religiousVisibility)
    }
    if (map.current.getLayer('religious-buildings-label')) {
      map.current.setLayoutProperty('religious-buildings-label', 'visibility', religiousVisibility)
    }

    // Update deck.gl layers (3D mode)
    updateOverlayLayers()
  }, [updateOverlayLayers, loadLayerData])

  // Handle layer visibility changes from LayersPanel
  useEffect(() => {
    layersStateRef.current = layers
    applyLayersState()
  }, [layers, applyLayersState])

  return (
    <>
      <div 
        ref={mapContainer} 
        style={{
          width: '100%',
          height: '100vh',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
      {/* Flight tooltip */}
      <div 
        id="flight-tooltip"
        style={{
          display: 'none',
          position: 'fixed',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 1000,
          direction: 'rtl'
        }}
      />
    </>
  )
})

MapLibre.displayName = 'MapLibre'

export default MapLibre

