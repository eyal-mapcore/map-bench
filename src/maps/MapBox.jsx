import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { Tile3DLayer } from '@deck.gl/geo-layers'
import { IconLayer, LineLayer, ScatterplotLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import { Tiles3DLoader } from '@loaders.gl/3d-tiles'
import 'mapbox-gl/dist/mapbox-gl.css'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from '../components/LocationSelector'
import { DEFAULT_RELIGION_ICONS, getIconUrl } from '../utils/mapStyleConfig'
import { flightTracker } from '../dynamic-layers/flightTracker'

// Height for floating religious icons above buildings (meters)
const RELIGIOUS_ICON_HEIGHT = 50

// API Keys - set in .env file
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_3D_TILES_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`

// Map style - loaded from JSON file following MapLibre/Mapbox Style Specification
const MAP_STYLE_URL = '/map-style.json'

const MapBox = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad, layers = {}, initialCamera = null }, ref) => {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const overlay = useRef(null)
  const currentViewMode = useRef(viewMode)
  const isMapLoaded = useRef(false)
  const isActiveRef = useRef(isActive)
  const styleLayersReady = useRef(false)
  const mapInitialized = useRef(false) // Track if we've actually created a map
  const hasSkippedFirstFlyTo = useRef(false) // Track if we've skipped first flyTo (for initialCamera)
  const religiousBuildingsData = useRef(null)
  const layersStateRef = useRef(layers)
  
  // Flight tracking
  const flightData = useRef({ type: 'FeatureCollection', features: [] })
  const flightPaths = useRef({ type: 'FeatureCollection', features: [] })
  const animationRef = useRef(null)
  const currentTime = useRef(Date.now() / 1000)
  const aircraftIconLoaded = useRef(null) // Pre-loaded aircraft icon
  const fullStyleRef = useRef(null)
  const religiousIconsLoaded = useRef(false)
  const isFlightLayerInitializing = useRef(false)
  
  // Store initialCamera value at first render for use in effects
  const initialCameraOnMount = useRef(initialCamera)
  // Store initial location to prevent unwanted flyTo on mount
  const initialLocationRef = useRef(currentLocation)

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
        },
        gltf: {
          normalize: true
        }
      },
      screenSpaceError: 8,
      refinementStrategy: 'best-available',
      maximumMemoryUsage: 1024 * 1024 * 1024,
      opacity: 1,
      onTilesetLoad: () => console.log('✓ Google 3D Tileset loaded'),
      onTileLoad: (tile) => {
        const content = tile.content;
        if (content && content.gltf && content.gltf.meshes) {
          content.gltf.meshes.forEach(mesh => {
            mesh.primitives?.forEach(primitive => {
              if (primitive.indices) {
                if (primitive.indices.value instanceof Uint8Array) {
                  primitive.indices.value = new Uint16Array(primitive.indices.value);
                  if (primitive.indices.componentType === 5121) {
                    primitive.indices.componentType = 5123;
                  }
                } else if (primitive.indices instanceof Uint8Array) {
                  primitive.indices = new Uint16Array(primitive.indices);
                }
              }
            });
          });
        }
        if (onTileLoad) {
          onTileLoad(tile)
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
    
    // Flight Paths are now handled via native Mapbox layer
    // See updateFlightLayer() function
    
    return layers
  }, [])

  // Update native Mapbox flight layer (not deck.gl)
  const updateFlightLayer = useCallback(() => {
    if (!map.current) return
    
    // Update icons
    if (flightData.current && flightData.current.features?.length) {
      const source = map.current.getSource('flight-data')
      if (source) {
        source.setData(flightData.current)
      }
    }

    // Update paths
    if (flightPaths.current && flightPaths.current.features?.length) {
      const source = map.current.getSource('flight-paths-data')
      if (source) {
        source.setData(flightPaths.current)
      }
    }
  }, [])

  // Initialize native Mapbox flight layer
  const initFlightLayer = useCallback(async () => {
    if (!map.current || isFlightLayerInitializing.current) return
    
    isFlightLayerInitializing.current = true

    try {
      // 1. Flight Paths Layer
      if (!map.current.getSource('flight-paths-data')) {
        map.current.addSource('flight-paths-data', {
          type: 'geojson',
          data: flightPaths.current || { type: 'FeatureCollection', features: [] }
        })

        map.current.addLayer({
          id: 'flight-paths-layer',
          type: 'line',
          source: 'flight-paths-data',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'visible' // Set visible - initFlightLayer is only called when layer should be visible
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-dasharray': [2, 2]
          }
        })
      }

      // 2. Aircraft Icons Layer
      // Load aircraft icon (Lazy)
      if (!map.current.hasImage('aircraft-icon')) {
        try {
          const img = new Image(64, 64)
          img.src = '/sprites/airplane-fr24.svg'
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
          })
          if (map.current && !map.current.hasImage('aircraft-icon')) {
            map.current.addImage('aircraft-icon', img, { sdf: false })
            console.log('✓ MapBox: Aircraft icon loaded (Lazy)')
          }
        } catch (e) {
          console.warn('Failed to load aircraft icon:', e)
          // Don't return here, try to continue with other layers or retry later
        }
      }
      
      // Add source if not exists
      if (!map.current.getSource('flight-data')) {
        map.current.addSource('flight-data', {
          type: 'geojson',
          data: flightData.current || { type: 'FeatureCollection', features: [] }
        })
      }
      
      // Add layer if not exists
      if (!map.current.getLayer('flight-icons')) {
        map.current.addLayer({
          id: 'flight-icons',
          type: 'symbol',
          source: 'flight-data',
          layout: {
            'icon-image': 'aircraft-icon',
            'icon-size': 0.4, // ~25px (64px * 0.4 = 25.6px)
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            // Elevate icons based on altitude (meters) - scale down for visual effect
            'symbol-z-elevate': true,
            'visibility': 'visible' // Set visible - initFlightLayer is only called when layer should be visible
          }
        })

        // Add hover popup
        map.current.on('mouseenter', 'flight-icons', (e) => {
          map.current.getCanvas().style.cursor = 'pointer'
          if (e.features && e.features[0]) {
            const props = e.features[0].properties
            const tooltip = document.getElementById('flight-tooltip')
            if (tooltip) {
              tooltip.innerHTML = `
                <strong>${props.callsign}</strong><br/>
                גובה: ${props.altitudeFeet?.toLocaleString() || 'N/A'} ft<br/>
                מהירות: ${props.velocityKnots || 'N/A'} קשר<br/>
                כיוון: ${Math.round(props.heading || 0)}°
              `
              tooltip.style.display = 'block'
              tooltip.style.left = `${e.point.x + 10}px`
              tooltip.style.top = `${e.point.y + 10}px`
            }
          }
        })
        
        map.current.on('mouseleave', 'flight-icons', () => {
          map.current.getCanvas().style.cursor = ''
          const tooltip = document.getElementById('flight-tooltip')
          if (tooltip) tooltip.style.display = 'none'
        })
        
        console.log('✓ MapBox: Native flight layer initialized')
      }

      // CRITICAL: Check visibility state again after async operations
      // This handles the race condition where user toggles layer OFF while we were loading the icon
      const isVisible = layersStateRef.current['flight-tracking']?.visible
      
      if (!isVisible) {
        // User turned off layer while we were initializing - hide it
        if (map.current.getLayer('flight-icons')) {
          map.current.setLayoutProperty('flight-icons', 'visibility', 'none')
        }
        if (map.current.getLayer('flight-paths-layer')) {
          map.current.setLayoutProperty('flight-paths-layer', 'visibility', 'none')
        }
      }

    } finally {
      isFlightLayerInitializing.current = false
    }
  }, [updateFlightLayer])

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

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: center,
      zoom: zoom,
      pitch: pitch,
      bearing: bearing,
      antialias: true,
      maxPitch: 85,
      attributionControl: false
    })

    // Hide basemap labels IMMEDIATELY when style loads (before tiles render)
    // This prevents the flash of labels appearing then disappearing
    map.current.once('style.load', () => {
      const powerLinesVisible = layersStateRef.current['power-lines']?.visible
      const religiousBuildingsVisible = layersStateRef.current['religious-buildings']?.visible
      const flightTrackingVisible = layersStateRef.current['flight-tracking']?.visible
      const shouldHideBasemap = powerLinesVisible || religiousBuildingsVisible || flightTrackingVisible

      if (shouldHideBasemap && map.current) {
        const style = map.current.getStyle()
        if (style && style.layers) {
          style.layers.forEach(layer => {
            if (layer.type === 'raster' || layer.type === 'background') return
            if (layer.type === 'symbol' || layer.type === 'line' || layer.type === 'fill' || layer.type === 'fill-extrusion') {
              try {
                map.current.setLayoutProperty(layer.id, 'visibility', 'none')
              } catch (e) {}
            }
          })
        }
        console.log('✓ Mapbox: Basemap labels hidden immediately on style.load')
      }
    })

    map.current.on('load', async () => {
      isMapLoaded.current = true
      
      // Religious buildings data for 3D mode is now lazy loaded in applyLayersState

      
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
      
      if (viewMode === '3d') {
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      }

      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 60.0],
          'sky-atmosphere-sun-intensity': 15
        }
      })

      // Load layers from style JSON (same as MapLibre)
      try {
        const styleResponse = await fetch(MAP_STYLE_URL)
        const styleJson = await styleResponse.json()
        fullStyleRef.current = styleJson
        
        // Add sources from style JSON (skip heavy ones)
        for (const [sourceId, sourceConfig] of Object.entries(styleJson.sources || {})) {
          // Skip satellite source - we use Mapbox's own
          if (sourceId === 'satellite') continue
          
          // Skip heavy sources for lazy loading
          if (sourceId === 'power-lines' || sourceId === 'religious-buildings') continue
          
          if (!map.current.getSource(sourceId)) {
            map.current.addSource(sourceId, sourceConfig)
          }
        }

        // Get current layer visibility state
        const powerLinesVisible = layersStateRef.current['power-lines']?.visible
        const religiousBuildingsVisible = layersStateRef.current['religious-buildings']?.visible
        const is3D = currentViewMode.current === '3d'

        // Add layers from style JSON (skip satellite layer and heavy layers)
        for (const layer of (styleJson.layers || [])) {
          if (layer.id === 'satellite-layer') continue
          
          // Skip heavy layers for lazy loading
          if (layer.id.startsWith('power-lines') || layer.id.startsWith('religious-buildings')) continue
          
          // Clone layer to avoid modifying the original
          const layerCopy = JSON.parse(JSON.stringify(layer))
          
          // Replace MapLibre fonts with Mapbox-compatible fonts
          if (layerCopy.layout?.['text-font']) {
            layerCopy.layout['text-font'] = ['DIN Offc Pro Medium', 'Arial Unicode MS Regular']
          }
          
          if (!map.current.getLayer(layerCopy.id)) {
            map.current.addLayer(layerCopy)
          }
        }
        
        styleLayersReady.current = true
        console.log('✓ Mapbox: Base layers loaded from map-style.json')
        
        // Apply initial layer visibility state immediately
        // This will trigger loading of layers if they are set to visible
        applyLayersState().catch(e => console.warn('Error applying layers:', e))
        
      } catch (e) {
        console.error('Failed to load style JSON:', e)
      }

      // Build initial deck.gl layers
      const deckLayers = []
      const is3DMode = currentViewMode.current === '3d'
      
      if (is3DMode) {
        deckLayers.push(createTile3DLayer())
        // Add 3D religious buildings if visible
        if (layersStateRef.current['religious-buildings']?.visible) {
          deckLayers.push(...createReligious3DLayers())
        }
      }

      // Add flight tracking layers (paths only - icons are native Mapbox)
      if (layersStateRef.current['flight-tracking']?.visible) {
        deckLayers.push(...createFlightLayers(currentTime.current))
      }
      
      // Initialize MapboxOverlay
      overlay.current = new MapboxOverlay({ 
        interleaved: true, 
        layers: deckLayers 
      })
      map.current.addControl(overlay.current)
      
      // Initialize native flight layer for aircraft icons (only if visible)
      if (layersStateRef.current['flight-tracking']?.visible) {
        initFlightLayer()
      }
      
      console.log('✓ Mapbox: Initial layer state applied')

    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
      // Reset refs for next mount (important for React Strict Mode)
      mapInitialized.current = false
      isMapLoaded.current = false
      styleLayersReady.current = false
      hasSkippedFirstFlyTo.current = false
    }
  }, [createTile3DLayer])
  
  // Handle location changes from parent
  useEffect(() => {
    if (!map.current) return

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
      const religiousLayers = createReligious3DLayers()
      deckLayers.push(...religiousLayers)
    }
    
    // Add flight tracking layer if visible
    if (layersStateRef.current['flight-tracking']?.visible) {
      const flightLayers = createFlightLayers(currentTime.current)
      deckLayers.push(...flightLayers)
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

  // Apply current layer visibility state - called both on initial load and when layers change
  const applyLayersState = useCallback(async () => {
    // We need style to be ready, but we DON'T need map to be fully loaded (tiles loaded)
    if (!map.current || !styleLayersReady.current) return

    const currentLayers = layersStateRef.current
    const powerLinesVisible = currentLayers['power-lines']?.visible
    const religiousBuildingsVisible = currentLayers['religious-buildings']?.visible
    const flightTrackingVisible = currentLayers['flight-tracking']?.visible
    const is3D = currentViewMode.current === '3d'
    const styleJson = fullStyleRef.current

    // Lazy load Power Lines
    if (powerLinesVisible && styleJson) {
      // Add source if missing
      if (!map.current.getSource('power-lines')) {
        console.log('Lazy loading Power Lines source...')
        map.current.addSource('power-lines', styleJson.sources['power-lines'])
      }
      
      // Add layers if missing
      const powerLayers = styleJson.layers.filter(l => l.id.startsWith('power-lines'))
      for (const layer of powerLayers) {
        if (!map.current.getLayer(layer.id)) {
          const layerCopy = JSON.parse(JSON.stringify(layer))
          // Ensure visibility is set correctly
          if (!layerCopy.layout) layerCopy.layout = {}
          layerCopy.layout.visibility = 'visible'
          map.current.addLayer(layerCopy)
        }
      }
    }

    // Lazy load Religious Buildings
    if (religiousBuildingsVisible && styleJson) {
      // 1. Load Icons if needed
      if (!religiousIconsLoaded.current) {
        console.log('Lazy loading Religious Icons...')
        const religionIcons = ['jewish', 'christian', 'muslim', 'buddhist', 'hindu', 'shinto', 'default']
        
        await Promise.all(religionIcons.map(async (religion) => {
          try {
            if (map.current && !map.current.hasImage(`icon-${religion}`)) {
              const img = new Image(24, 24)
              img.src = `/sprites/${religion}.svg`
              await new Promise((resolve, reject) => {
                img.onload = resolve
                img.onerror = reject
              })
              if (map.current && !map.current.hasImage(`icon-${religion}`)) {
                map.current.addImage(`icon-${religion}`, img, { sdf: false })
              }
            }
          } catch (e) {
            console.warn(`Failed to load icon: ${religion}`, e)
          }
        }))
        
        if (!map.current) return
        religiousIconsLoaded.current = true
      }

      // 2. Load Source if missing
      if (!map.current.getSource('religious-buildings')) {
        console.log('Lazy loading Religious Buildings source...')
        map.current.addSource('religious-buildings', styleJson.sources['religious-buildings'])
      }

      // 3. Load Layers if missing
      const religiousLayers = styleJson.layers.filter(l => l.id.startsWith('religious-buildings'))
      for (const layer of religiousLayers) {
        if (!map.current.getLayer(layer.id)) {
          const layerCopy = JSON.parse(JSON.stringify(layer))
          
          // Replace fonts
          if (layerCopy.layout?.['text-font']) {
            layerCopy.layout['text-font'] = ['DIN Offc Pro Medium', 'Arial Unicode MS Regular']
          }
          
          if (!layerCopy.layout) layerCopy.layout = {}
          layerCopy.layout.visibility = !is3D ? 'visible' : 'none'
          
          map.current.addLayer(layerCopy)
        }
      }
      
      // 4. Load Data for 3D mode if missing
      if (is3D && !religiousBuildingsData.current) {
        try {
          console.log('Lazy loading Religious Buildings data for 3D...')
          const response = await fetch('/data/religious-buildings.geojson')
          if (!map.current) return
          religiousBuildingsData.current = await response.json()
        } catch (e) {
          console.warn('Failed to load religious buildings data:', e)
        }
      }
    }

    if (!map.current) return

    // Toggle power lines layer visibility (layer IDs from map-style.json)
    const powerVisibility = powerLinesVisible ? 'visible' : 'none'
    
    if (map.current.getLayer('power-lines-layer')) {
      map.current.setLayoutProperty('power-lines-layer', 'visibility', powerVisibility)
    }
    if (map.current.getLayer('power-lines-glow')) {
      map.current.setLayoutProperty('power-lines-glow', 'visibility', powerVisibility)
    }

    // Toggle religious buildings layer visibility (layer IDs from map-style.json)
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

    // Toggle flight tracking layer visibility (native Mapbox layer)
    if (flightTrackingVisible) {
      // Check if we need to initialize layers (either icons or paths missing)
      const hasIcons = !!map.current.getLayer('flight-icons')
      const hasPaths = !!map.current.getLayer('flight-paths-layer')
      
      if (!hasIcons || !hasPaths) {
        console.log('Lazy loading Flight Tracker layers...')
        await initFlightLayer()
      }
      
      // Always set visibility to visible after init (whether newly created or existing)
      if (map.current.getLayer('flight-icons')) {
        map.current.setLayoutProperty('flight-icons', 'visibility', 'visible')
      }
      if (map.current.getLayer('flight-paths-layer')) {
        map.current.setLayoutProperty('flight-paths-layer', 'visibility', 'visible')
      }
      
      // Force update data to ensure icons appear
      updateFlightLayer()
    } else {
      if (map.current.getLayer('flight-icons')) {
        map.current.setLayoutProperty('flight-icons', 'visibility', 'none')
      }
      if (map.current.getLayer('flight-paths-layer')) {
        map.current.setLayoutProperty('flight-paths-layer', 'visibility', 'none')
      }
      // Clear flight data when layer is hidden
      flightData.current = { type: 'FeatureCollection', features: [] }
      flightPaths.current = { type: 'FeatureCollection', features: [] }
      // Update sources with empty data
      if (map.current.getSource('flight-data')) {
        map.current.getSource('flight-data').setData(flightData.current)
      }
      if (map.current.getSource('flight-paths-data')) {
        map.current.getSource('flight-paths-data').setData(flightPaths.current)
      }
    }

    // Update deck.gl layers (3D mode)
    updateOverlayLayers()


    // When power lines OR religious buildings OR flight tracking are visible, hide all non-essential basemap layers
    const style = map.current.getStyle()
    if (style && style.layers) {
      style.layers.forEach(layer => {
        // Skip our own layers (from map-style.json and flight tracking)
        if (layer.id.startsWith('power-lines') || 
            layer.id.startsWith('religious-buildings') ||
            layer.id.startsWith('flight-') ||
            layer.id === 'sky') {
          return
        }

        // Keep satellite/raster layers (orthophoto)
        if (layer.type === 'raster') {
          return
        }

        // Keep background layers
        if (layer.type === 'background') {
          return
        }

        // Hide all other basemap layers (labels, roads, buildings, etc.) when custom layers visible
        if (layer.type === 'symbol' || layer.type === 'line' || layer.type === 'fill' || layer.type === 'fill-extrusion') {
          try {
            const targetVisibility = (powerLinesVisible || religiousBuildingsVisible || flightTrackingVisible) ? 'none' : 'visible'
            map.current.setLayoutProperty(layer.id, 'visibility', targetVisibility)
          } catch (e) {
            // Some layers might not support visibility changes
          }
        }
      })
    }
  }, [updateOverlayLayers])

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

    // Toggle terrain (only if map is loaded and has the source)
    try {
      if (is3D) {
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      } else {
        map.current.setTerrain(null)
      }
    } catch (e) {
      // Terrain source might not be ready yet
      console.warn('Terrain toggle skipped:', e.message)
    }

    // Update both deck.gl layers AND native Mapbox layer visibility
    // This is critical when switching between 2D/3D - native layers need to be
    // shown/hidden based on view mode (2D shows native layers, 3D uses deck.gl)
    applyLayersState()
  }, [viewMode, applyLayersState])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    if (!overlay.current || !isMapLoaded.current) return

    updateOverlayLayers()
    
  }, [isActive, updateOverlayLayers])

  // Handle layer visibility changes from LayersPanel
  useEffect(() => {
    layersStateRef.current = layers
    applyLayersState()
  }, [layers, applyLayersState])

  // Initialize Flight Tracker (Lazy Load)
  useEffect(() => {
    const isVisible = layersStateRef.current['flight-tracking']?.visible
    
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
        updateFlightLayer()
      })

      // Initialize native flight layer when map is ready
      if (map.current && isMapLoaded.current) {
        initFlightLayer()
      }

      return () => {
        unsubscribe()
      }
    }
  }, [layers, currentLocation, updateOverlayLayers, updateFlightLayer, initFlightLayer])

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
          position: 'absolute',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          direction: 'rtl',
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      />
    </>
  )
})

MapBox.displayName = 'MapBox'

export default MapBox

