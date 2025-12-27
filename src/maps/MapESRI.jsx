import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import Map from '@arcgis/core/Map'
import SceneView from '@arcgis/core/views/SceneView'
import IntegratedMesh3DTilesLayer from '@arcgis/core/layers/IntegratedMesh3DTilesLayer'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import '@arcgis/core/assets/esri/themes/light/main.css'

import {
  zoomToScale,
  scaleToZoom,
  getInterpolatedSize,
  createRendererFromStyleLayer,
  createLabelClassFromStyle,
  createReligiousRenderer,
  getPowerLineSize,
  createPowerLineRenderer
} from '../utils/esriStyleConverter'

// Suppress AbortError console.error from ESRI (happens in React Strict Mode)
const originalConsoleError = console.error
console.error = (...args) => {
  // Skip AbortError messages from ESRI
  const firstArg = args[0]
  if (typeof firstArg === 'string' && firstArg.includes('[esri.') && 
      (args.some(a => a?.name === 'AbortError' || a?.message?.includes?.('Aborted')))) {
    return
  }
  originalConsoleError.apply(console, args)
}

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from '../components/LocationSelector'

// API Key - set in .env file
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_3D_TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'

// Map style - loaded from JSON file following MapLibre/Mapbox Style Specification
const MAP_STYLE_URL = '/map-style.json'

const MapESRI = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad, layers = {}, initialCamera = null }, ref) => {
  const mapContainer = useRef(null)
  const view = useRef(null)
  const mapRef = useRef(null)
  const google3DTilesLayer = useRef(null)
  const customLayers = useRef({})
  const currentViewMode = useRef(viewMode)
  const isActiveRef = useRef(isActive)
  const viewInitialized = useRef(false) // Track if we've actually created a view
  const hasSkippedFirstFlyTo = useRef(false) // Track if we've skipped first flyTo (for initialCamera)
  
  // Store initialCamera value at first render for use in effects
  const initialCameraOnMount = useRef(initialCamera)

  // Expose methods to parent
  // Helper to catch AbortError from goTo (happens in React Strict Mode)
  const safeGoTo = useCallback((options, animationOptions) => {
    if (!view.current) return
    view.current.goTo(options, animationOptions).catch(error => {
      if (error?.name !== 'AbortError') {
        console.error('goTo error:', error)
      }
    })
  }, [])

  useImperativeHandle(ref, () => ({
    flyTo: (continentKey, cityKey) => {
      const continent = CONTINENTS[continentKey]
      if (!continent) return
      const location = continent.locations[cityKey]
      if (!location || !view.current) return

      const tilt = currentViewMode.current === '3d' ? INITIAL_PITCH : 0
      safeGoTo({
        center: location.coords,
        scale: zoomToScale(INITIAL_ZOOM),
        tilt: tilt,
        heading: -INITIAL_BEARING
      }, {
        duration: 3000,
        easing: 'ease-in-out'
      })
    },
    getCamera: () => {
      if (!view.current?.camera) return null
      const cam = view.current.camera
      return {
        center: [cam.position.longitude, cam.position.latitude],
        zoom: scaleToZoom(view.current.scale),
        pitch: cam.tilt,
        bearing: -cam.heading
      }
    },
    setCamera: (camera) => {
      if (!view.current || !camera) return
      safeGoTo({
        center: camera.center,
        scale: zoomToScale(camera.zoom),
        tilt: camera.pitch,
        heading: -camera.bearing
      }, {
        animate: false
      })
    }
  }), [safeGoTo])

  useEffect(() => {
    // Skip if view already exists (React Strict Mode double-render protection)
    if (view.current || viewInitialized.current) return
    viewInitialized.current = true

    // Track if component is still mounted (for async operations)
    let isMounted = true

    // Create the Google 3D Tiles layer
    google3DTilesLayer.current = new IntegratedMesh3DTilesLayer({
      url: GOOGLE_3D_TILES_URL,
      title: 'Google Photorealistic 3D Tiles',
      opacity: 1,
      visible: viewMode === '3d',
      customParameters: {
        key: GOOGLE_API_KEY
      }
    })

    // Handle 3D tiles load errors (AbortError happens in Strict Mode)
    google3DTilesLayer.current.load().catch((error) => {
      if (error?.name !== 'AbortError') {
        console.error('3D Tiles load error:', error)
      }
    })

    // Track tile loading
    let tileCount = 0
    google3DTilesLayer.current.on('layerview-create', () => {
      console.log('✓ ESRI: Google 3D Tiles layer view created')
    })

    // Load style JSON and create layers from it
    const initializeLayers = async () => {
      if (!isMounted) return
      try {
        const styleResponse = await fetch(MAP_STYLE_URL)
        const styleJson = await styleResponse.json()
        
        // Find power-lines source and layer from style JSON
        const powerLinesSource = styleJson.sources?.['power-lines']
        const powerLinesStyleLayer = styleJson.layers?.find(l => l.id === 'power-lines-layer')
        
        if (powerLinesSource && powerLinesStyleLayer) {
          const { rendererWithIcons } = createRendererFromStyleLayer(powerLinesStyleLayer, 'line')
          
          // Store style config for dynamic renderer updates
          const lineColor = powerLinesStyleLayer.paint?.['line-color']
          const lineOpacity = powerLinesStyleLayer.paint?.['line-opacity']
          customLayers.current['power-lines-style'] = { lineColor, lineOpacity }
          
          const powerLinesLayer = new GeoJSONLayer({
            id: 'power-lines',
            url: powerLinesSource.data,
            title: 'קווי חשמל',
            opacity: 1,
            visible: false,
            elevationInfo: {
              mode: 'relative-to-ground',
              offset: 15
            },
            renderer: rendererWithIcons,
            popupEnabled: true,
            popupTemplate: {
              title: '{name}',
              content: `
                <b>מתח:</b> {voltage}<br>
                <b>כבלים:</b> {cables}<br>
                <b>מפעיל:</b> {operator}
              `
            }
          })
          customLayers.current['power-lines'] = powerLinesLayer
          mapRef.current?.add(powerLinesLayer)
          console.log('✓ ESRI: Power lines layer created with renderer from style')
        }
        
        // Find religious-buildings source and layers from style JSON
        const religiousSource = styleJson.sources?.['religious-buildings']
        const religiousStyleLayer = styleJson.layers?.find(l => l.id === 'religious-buildings-circle')
        const religiousIconLayer = styleJson.layers?.find(l => l.id === 'religious-buildings-icon')
        const religiousLabelLayer = styleJson.layers?.find(l => l.id === 'religious-buildings-label')
        
        if (religiousSource && religiousStyleLayer) {
          // Get all renderers for scale-based and view-mode switching
          const { rendererWithIcons, rendererWithoutIcons, rendererWithIcons3D, rendererWithoutIcons3D, iconMinScale, styleConfig } = createRendererFromStyleLayer(religiousStyleLayer, 'circle', religiousIconLayer)
          
          // Extract color mapping from style for dynamic renderer creation
          const circleColor = religiousStyleLayer.paint?.['circle-color']
          const colorMapping = {}
          if (Array.isArray(circleColor) && circleColor[0] === 'match') {
            for (let i = 2; i < circleColor.length - 1; i += 2) {
              colorMapping[circleColor[i]] = circleColor[i + 1]
            }
          }
          customLayers.current['religious-buildings-colors'] = colorMapping
          
          // Create label class from style
          const labelClass = createLabelClassFromStyle(religiousLabelLayer)
          
          // Start with circles-only renderer (zoomed out, 2D mode)
          const is3D = currentViewMode.current === '3d'
          const initialRenderer = is3D ? rendererWithoutIcons3D : rendererWithoutIcons
          
          const religiousBuildingsLayer = new GeoJSONLayer({
            id: 'religious-buildings',
            url: religiousSource.data,
            title: 'מבני דת',
            opacity: 1,
            visible: false,
            renderer: initialRenderer,
            labelingInfo: labelClass ? [labelClass] : undefined,
            labelsVisible: !!labelClass,
            popupEnabled: true,
            popupTemplate: {
              title: '{name}',
              content: `
                <b>דת:</b> {religionDisplay}<br>
                <b>זרם:</b> {denomination}<br>
                <b>כתובת:</b> {address}
              `
            }
          })
          customLayers.current['religious-buildings'] = religiousBuildingsLayer
          
          // Store renderers and style config for scale-based and view-mode switching
          customLayers.current['religious-buildings-renderers'] = {
            withIcons: rendererWithIcons,
            withoutIcons: rendererWithoutIcons,
            withIcons3D: rendererWithIcons3D,
            withoutIcons3D: rendererWithoutIcons3D,
            iconMinScale: iconMinScale,
            styleConfig: styleConfig
          }
          
          mapRef.current?.add(religiousBuildingsLayer)
          console.log(`✓ ESRI: Religious buildings layer created, labels=${!!labelClass}, iconMinScale=${iconMinScale}, sizeStops=${rendererWithIcons?.visualVariables?.[0]?.stops?.length || 0}`)
        }
        
        console.log('✓ ESRI: Layers loaded from map-style.json')
        
        // Apply initial layer visibility state IMMEDIATELY (no setTimeout to avoid flash)
        const currentLayers = layersStateRef.current
        const powerLinesVisible = currentLayers['power-lines']?.visible
        const religiousBuildingsVisible = currentLayers['religious-buildings']?.visible
        const anyCustomLayerVisible = powerLinesVisible || religiousBuildingsVisible

        // Hide basemap labels FIRST if app layers are visible (prevents flash)
        if (anyCustomLayerVisible && mapRef.current?.basemap) {
          mapRef.current.basemap.referenceLayers?.forEach(refLayer => {
            refLayer.visible = false
          })
        }

        // Now apply visibility to our custom layers
        Object.entries(currentLayers).forEach(([layerId, layerState]) => {
          const layer = customLayers.current[layerId]
          if (layer) {
            layer.visible = layerState.visible
            if (layerState.visible && mapRef.current) {
              mapRef.current.reorder(layer, mapRef.current.layers.length - 1)
            }
          }
        })
        
        console.log('✓ ESRI: Initial layer state applied (no flash)')
      } catch (e) {
        console.error('Failed to load style JSON for ESRI:', e)
      }
    }

    // Create the map - using 'hybrid' basemap for better brightness with labels
    const map = new Map({
      basemap: 'hybrid',
      ground: 'world-elevation',
      layers: [google3DTilesLayer.current]
    })
    mapRef.current = map
    
    // Handle basemap load errors (AbortError happens in Strict Mode)
    map.basemap?.load().catch((error) => {
      if (error?.name !== 'AbortError') {
        console.error('Basemap load error:', error)
      }
    })

    // Use initialCamera if provided (when switching from another map), otherwise use location
    let center, zoom, tilt, heading
    const cameraToUse = initialCameraOnMount.current
    
    if (cameraToUse) {
      center = cameraToUse.center
      zoom = cameraToUse.zoom
      tilt = cameraToUse.pitch
      heading = -cameraToUse.bearing
    } else {
      const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
      center = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords
      zoom = INITIAL_ZOOM
      tilt = viewMode === '3d' ? INITIAL_PITCH : 0
      heading = -INITIAL_BEARING
    }

    // Create the SceneView
    view.current = new SceneView({
      container: mapContainer.current,
      map: map,
      camera: {
        position: {
          longitude: center[0],
          latitude: center[1],
          z: 500
        },
        tilt: tilt,
        heading: heading
      },
      scale: zoomToScale(zoom),
      qualityProfile: 'high',
      environment: {
        atmosphere: {
          quality: 'high'
        },
        lighting: {
          type: 'sun',
          date: new Date('2024-06-21T12:00:00Z'),
          directShadowsEnabled: false
        }
      },
      ui: {
        components: []
      }
    })

    // Monitor tile loading and initialize layers
    view.current.when(() => {
      if (!isMounted) return
      console.log('✓ ESRI SceneView ready')
      
      // Initialize layers from style JSON
      initializeLayers()
      
      // Periodically check tile count
      const checkTiles = setInterval(() => {
        if (!isMounted) {
          clearInterval(checkTiles)
          return
        }
        if (google3DTilesLayer.current?.loaded) {
          tileCount++
          if (onTileLoad) {
            onTileLoad(tileCount)
          }
        }
      }, 500)

      // Update renderers when scale changes
      let lastPowerLineSize = null
      let lastReligiousState = null
      
      view.current.watch('scale', (scale) => {
        if (!isMounted) return
        // Update power lines size
        const powerLinesLayer = customLayers.current['power-lines']
        const powerLinesStyle = customLayers.current['power-lines-style']
        if (powerLinesLayer && powerLinesStyle) {
          const newSize = Math.round(getPowerLineSize(scale))
          if (newSize !== lastPowerLineSize) {
            lastPowerLineSize = newSize
            powerLinesLayer.renderer = createPowerLineRenderer(newSize, powerLinesStyle.lineColor, powerLinesStyle.lineOpacity)
          }
        }
        
        // Update religious buildings renderer based on scale, view mode, and size
        const religiousLayer = customLayers.current['religious-buildings']
        const renderers = customLayers.current['religious-buildings-renderers']
        if (religiousLayer && renderers?.styleConfig) {
          const { styleConfig, iconMinScale } = renderers
          const showIcons = iconMinScale ? scale <= iconMinScale : false
          const is3D = currentViewMode.current === '3d'
          const circleSize = Math.round(getInterpolatedSize(scale, styleConfig.sizeStops))
          const newState = `${showIcons}-${is3D}-${circleSize}`
          
          if (newState !== lastReligiousState) {
            lastReligiousState = newState
            const colorMapping = customLayers.current['religious-buildings-colors'] || {}
            religiousLayer.renderer = createReligiousRenderer(styleConfig, colorMapping, showIcons, is3D, circleSize)
          }
        }
      })

      // Cleanup interval on unmount
      view.current.on('destroy', () => {
        clearInterval(checkTiles)
      })
    }).catch((error) => {
      // Ignore AbortError - happens when component unmounts during initialization
      if (error?.name !== 'AbortError') {
        console.error('ESRI SceneView error:', error)
      }
    })

    return () => {
      isMounted = false
      
      // Properly cleanup ESRI objects to avoid "ObjectCollection should be empty" error
      // First, remove and destroy custom layers
      Object.values(customLayers.current).forEach(layer => {
        if (layer && typeof layer.destroy === 'function') {
          try {
            mapRef.current?.remove(layer)
            layer.destroy()
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      })
      customLayers.current = {}
      
      // Destroy Google 3D tiles layer
      if (google3DTilesLayer.current) {
        try {
          mapRef.current?.remove(google3DTilesLayer.current)
          google3DTilesLayer.current.destroy()
        } catch (e) {
          // Ignore cleanup errors
        }
        google3DTilesLayer.current = null
      }
      
      // Remove all remaining layers from map
      if (mapRef.current) {
        try {
          mapRef.current.removeAll()
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      // Destroy the view (this also cleans up the map)
      if (view.current) {
        try {
          view.current.destroy()
        } catch (e) {
          // Ignore cleanup errors
        }
        view.current = null
      }
      
      mapRef.current = null
      // Reset refs for next mount (important for React Strict Mode)
      viewInitialized.current = false
      hasSkippedFirstFlyTo.current = false
    }
  }, [])
  
  // Handle location changes from parent
  useEffect(() => {
    if (!view.current) return

    // Skip the first flyTo if we used initialCamera (preserves camera state when switching maps)
    if (initialCameraOnMount.current && !hasSkippedFirstFlyTo.current) {
      hasSkippedFirstFlyTo.current = true
      return
    }

    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return
    const location = continent.locations[currentLocation.city]
    if (!location) return

    const tilt = viewMode === '3d' ? INITIAL_PITCH : 0
    safeGoTo({
      center: location.coords,
      scale: zoomToScale(INITIAL_ZOOM),
      tilt: tilt,
      heading: -INITIAL_BEARING
    }, {
      duration: 3000,
      easing: 'ease-in-out'
    })
  }, [currentLocation, viewMode, safeGoTo])

  // Handle view mode changes (2D/3D)
  useEffect(() => {
    if (!view.current) return
    currentViewMode.current = viewMode

    const is3D = viewMode === '3d'
    const targetTilt = is3D ? INITIAL_PITCH : 0

    // Animate tilt change
    safeGoTo({
      tilt: targetTilt
    }, {
      duration: 1000,
      easing: 'ease-in-out'
    })

    // Toggle 3D tiles layer visibility - only if active
    if (google3DTilesLayer.current) {
      const shouldShow3DTiles = is3D && isActiveRef.current
      google3DTilesLayer.current.visible = shouldShow3DTiles
    }
    
    // Update religious buildings renderer - the scale watcher will handle this
    // Force a renderer update by triggering the scale watch
    if (view.current?.scale) {
      const scale = view.current.scale
      // Trigger the scale watcher by setting it to the same value
      // This will update the renderer with the correct 2D/3D mode
      view.current.scale = scale
    }
  }, [viewMode, safeGoTo])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    if (!google3DTilesLayer.current) return

    const is3D = currentViewMode.current === '3d'
    const shouldShow3DTiles = is3D && isActive
    google3DTilesLayer.current.visible = shouldShow3DTiles
  }, [isActive])

  // Ref to track layers state for use in initialization
  const layersStateRef = useRef(layers)

  // Apply current layer visibility state - called both on initial load and when layers change
  const applyLayersState = useCallback(() => {
    if (!mapRef.current) return

    const currentLayers = layersStateRef.current

    Object.entries(currentLayers).forEach(([layerId, layerState]) => {
      const layer = customLayers.current[layerId]
      if (layer) {
        layer.visible = layerState.visible
        
        // Ensure layer is on top
        if (layerState.visible && mapRef.current) {
          mapRef.current.reorder(layer, mapRef.current.layers.length - 1)
        }
      }
    })

    // When any custom layer is visible, hide basemap reference layers (labels, roads)
    const powerLinesVisible = currentLayers['power-lines']?.visible
    const religiousBuildingsVisible = currentLayers['religious-buildings']?.visible
    const anyCustomLayerVisible = powerLinesVisible || religiousBuildingsVisible
    
    if (mapRef.current?.basemap) {
      mapRef.current.basemap.referenceLayers?.forEach(refLayer => {
        refLayer.visible = !anyCustomLayerVisible
      })
    }
  }, [])

  // Handle layer visibility changes from LayersPanel
  useEffect(() => {
    layersStateRef.current = layers
    applyLayersState()
  }, [layers, applyLayersState])

  return (
    <div 
      ref={mapContainer} 
      style={{
        width: '100%',
        height: '100vh',
        position: 'absolute',
        top: 0,
        left: 0,
        background: '#1a1a2e'  // Dark background while loading
      }}
    />
  )
})

MapESRI.displayName = 'MapESRI'

export default MapESRI

