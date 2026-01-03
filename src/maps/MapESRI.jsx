import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import Map from '@arcgis/core/Map'
import SceneView from '@arcgis/core/views/SceneView'
import IntegratedMesh3DTilesLayer from '@arcgis/core/layers/IntegratedMesh3DTilesLayer'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import FeatureLayer from '@arcgis/core/layers/FeatureLayer'
import Graphic from '@arcgis/core/Graphic'
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils"
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

import { loadReligiousBuildings, loadPowerLines } from '../utils/mapStyleConfig'
import { flightTracker } from '../dynamic-layers/flightTracker'

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
  // Store initial location to prevent unwanted flyTo on mount
  const initialLocationRef = useRef(currentLocation)

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
        heading: INITIAL_BEARING
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
        bearing: cam.heading
      }
    },
    setCamera: (camera) => {
      if (!view.current || !camera) return
      safeGoTo({
        center: camera.center,
        scale: zoomToScale(camera.zoom),
        tilt: camera.pitch,
        heading: camera.bearing
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
          customLayers.current['power-lines-renderer'] = rendererWithIcons
          
          // Don't load data yet - wait for visibility
          console.log('✓ ESRI: Power lines config loaded (lazy)')
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
          
          // Store renderers and style config for scale-based and view-mode switching
          customLayers.current['religious-buildings-renderers'] = {
            withIcons: rendererWithIcons,
            withoutIcons: rendererWithoutIcons,
            withIcons3D: rendererWithIcons3D,
            withoutIcons3D: rendererWithoutIcons3D,
            iconMinScale: iconMinScale,
            styleConfig: styleConfig,
            labelClass: labelClass
          }
          
          console.log(`✓ ESRI: Religious buildings config loaded (lazy)`)
        }
        
        console.log('✓ ESRI: Layers loaded from map-style.json')
        
        // Apply initial layer visibility state IMMEDIATELY (no setTimeout to avoid flash)
        applyLayersState()
        
        console.log('✓ ESRI: Initial layer state applied (no flash)')
      } catch (e) {
        console.error('Failed to load style JSON for ESRI:', e)
      }
    }

    // Create the map - using 'hybrid' basemap for better brightness with labels
    const map = new Map({
      basemap: 'satellite',
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
      heading = cameraToUse.bearing
    } else {
      const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
      center = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords
      zoom = INITIAL_ZOOM
      tilt = viewMode === '3d' ? INITIAL_PITCH : 0
      heading = INITIAL_BEARING
    }

    // Create the SceneView
    view.current = new SceneView({
      container: mapContainer.current,
      map: map,
      center: center,
      scale: zoomToScale(zoom),
      qualityProfile: 'high',
      environment: {
        atmosphere: {
          quality: 'high'
        },
        lighting: {
          type: 'virtual', // Light follows camera, always bright
          directShadowsEnabled: true
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

      // Set initial orientation (tilt/heading) now that view is ready
      // We couldn't set this in constructor without hardcoding Z
      view.current.goTo({
        tilt: tilt,
        heading: heading
      }, { animate: false })
      
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

      // Update flight tracker center when view moves
      reactiveUtils.watch(
        () => view.current?.center,
        (center) => {
          if (center && flightTracker.current?.isRunning) {
            flightTracker.current.setCenter(center.longitude, center.latitude)
          }
        }
      )

      // Update renderers when scale changes
      let lastPowerLineSize = null
      let lastReligiousState = null
      let lastFlightSize = null
      
      reactiveUtils.watch(
        () => view.current?.scale,
        (scale) => {
          if (!isMounted || !scale) return
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

          // Update Flight Tracker 3D Cone Size
          // We want the cone to appear roughly constant size on screen (like 20px icon)
          const flightLayer = customLayers.current['flight-tracking']
          if (flightLayer && currentViewMode.current === '3d') {
             // Target: 10 pixels (half of 2D icon size)
             const targetPixelSize = 10
             // Resolution (meters/pixel) approx = scale / 3780 (assuming 96 DPI)
             const resolution = scale / 3780
             const sizeInMeters = targetPixelSize * resolution
             
             // Only update if size changed significantly (> 5%) to avoid flickering
             if (!lastFlightSize || Math.abs(sizeInMeters - lastFlightSize) > (lastFlightSize * 0.05)) {
               lastFlightSize = sizeInMeters
               
               flightLayer.renderer = {
                type: 'simple',
                symbol: {
                  type: 'point-3d',
                  symbolLayers: [{
                    type: 'object',
                    resource: { primitive: 'cone' },
                    width: sizeInMeters, 
                    height: sizeInMeters * 2, // Keep 1:2 aspect ratio
                    depth: sizeInMeters,
                    material: { color: '#fbbf24' },
                    anchor: 'center',
                    tilt: 90
                  }]
                },
                visualVariables: [{
                  type: 'rotation',
                  field: 'heading',
                  rotationType: 'geographic'
                }]
              }
             }
          } else if (flightLayer && currentViewMode.current !== '3d') {
             // Reset tracker if switching back to 2D
             lastFlightSize = null
          }
        }
      )

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

    // Update Flight Tracking Layer Renderer
    const flightLayer = customLayers.current['flight-tracking']
    if (flightLayer) {
      if (is3D) {
        flightLayer.elevationInfo = {
          mode: 'absolute-height',
          featureExpressionInfo: { expression: '$feature.altitude' },
          unit: 'meters'
        }
        flightLayer.renderer = {
          type: 'simple',
          symbol: {
            type: 'point-3d',
            symbolLayers: [{
              type: 'object',
              resource: { primitive: 'cone' },
              width: (view.current?.scale || 50000) / 3780 * 10,
              height: (view.current?.scale || 50000) / 3780 * 20,
              depth: (view.current?.scale || 50000) / 3780 * 10,
              material: { color: '#fbbf24' },
              anchor: 'center',
              tilt: 90
            }]
          },
          visualVariables: [{
            type: 'rotation',
            field: 'heading',
            rotationType: 'geographic'
          }]
        }
      } else {
        flightLayer.elevationInfo = {
          mode: 'on-the-ground'
        }
        flightLayer.renderer = {
          type: 'simple',
          symbol: {
            type: 'point-3d',
            symbolLayers: [{
              type: 'icon',
              resource: { href: '/sprites/airplane-fr24.svg' },
              size: 20,
              anchor: 'center'
            }]
          },
          visualVariables: [{
            type: 'rotation',
            field: 'heading',
            rotationType: 'geographic'
          }]
        }
      }
    }

    // Update Flight Paths Layer Renderer
    const pathsLayer = customLayers.current['flight-paths']
    if (pathsLayer) {
      if (is3D) {
        pathsLayer.elevationInfo = { mode: 'absolute-height' }
        pathsLayer.renderer = {
          type: 'simple',
          symbol: {
            type: 'line-3d',
            symbolLayers: [{
              type: 'line',
              size: 2,
              material: { color: 'white' }
            }]
          }
        }
      } else {
        pathsLayer.elevationInfo = { mode: 'on-the-ground' }
        pathsLayer.renderer = {
          type: 'simple',
          symbol: {
            type: 'simple-line',
            color: 'white',
            width: 1.5,
            style: 'dash'
          }
        }
      }
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
  const applyLayersState = useCallback(async () => {
    if (!mapRef.current) return

    const currentLayers = layersStateRef.current

    // Lazy load Power Lines
    if (currentLayers['power-lines']?.visible && !customLayers.current['power-lines']) {
      const renderer = customLayers.current['power-lines-renderer']
      if (renderer) {
        console.log('✓ ESRI: Lazy loading power lines data')
        const powerLinesData = await loadPowerLines()
        const blob = new Blob([JSON.stringify(powerLinesData)], { type: "application/json" })
        const blobUrl = URL.createObjectURL(blob)

        const powerLinesLayer = new GeoJSONLayer({
          id: 'power-lines',
          url: blobUrl,
          title: 'קווי חשמל',
          opacity: 1,
          visible: true,
          elevationInfo: {
            mode: 'relative-to-ground',
            offset: 15
          },
          renderer: renderer,
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
        mapRef.current.add(powerLinesLayer)
      }
    }

    // Lazy load Religious Buildings
    if (currentLayers['religious-buildings']?.visible && !customLayers.current['religious-buildings']) {
      const renderers = customLayers.current['religious-buildings-renderers']
      if (renderers) {
        console.log('✓ ESRI: Lazy loading religious buildings data')
        const religiousData = await loadReligiousBuildings()
        const blob = new Blob([JSON.stringify(religiousData)], { type: "application/json" })
        const blobUrl = URL.createObjectURL(blob)

        // Determine initial renderer
        const is3D = currentViewMode.current === '3d'
        const initialRenderer = is3D ? renderers.withoutIcons3D : renderers.withoutIcons

        const religiousBuildingsLayer = new GeoJSONLayer({
          id: 'religious-buildings',
          url: blobUrl,
          title: 'מבני דת',
          opacity: 1,
          visible: true,
          renderer: initialRenderer,
          labelingInfo: renderers.labelClass ? [renderers.labelClass] : undefined,
          labelsVisible: !!renderers.labelClass,
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
        mapRef.current.add(religiousBuildingsLayer)
      }
    }

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

  // Create flight tracking FeatureLayer (called once) - optimized for thousands of features
  const createFlightLayer = useCallback(() => {
    if (customLayers.current['flight-tracking']) return customLayers.current['flight-tracking']
    
    const is3D = currentViewMode.current === '3d'

    const layer = new FeatureLayer({
      id: 'flight-tracking',
      title: 'מעקב טיסות',
      source: [], // Start empty
      objectIdField: 'ObjectID',
      geometryType: 'point',
      spatialReference: { wkid: 4326 },
      fields: [
        { name: 'ObjectID', type: 'oid' },
        { name: 'icao24', type: 'string' },
        { name: 'callsign', type: 'string' },
        { name: 'originCountry', type: 'string' },
        { name: 'altitude', type: 'double' },
        { name: 'velocity', type: 'double' },
        { name: 'heading', type: 'double' }
      ],
      // Use altitude field for 3D elevation
      elevationInfo: is3D ? {
        mode: 'absolute-height', // Use absolute altitude (AMSL)
        featureExpressionInfo: {
          expression: '$feature.altitude'
        },
        unit: 'meters'
      } : {
        mode: 'on-the-ground'
      },
      // Single renderer for all features - much more efficient
      renderer: is3D ? {
        type: 'simple',
        symbol: {
          type: 'point-3d',
          symbolLayers: [{
            type: 'object',
            resource: { primitive: 'cone' }, // Simple 3D shape that points up by default
            width: (view.current?.scale || 50000) / 3780 * 10, // Calculate based on current scale or default
            height: (view.current?.scale || 50000) / 3780 * 20, // Keep 1:2 aspect ratio
            depth: (view.current?.scale || 50000) / 3780 * 10,
            material: { color: '#fbbf24' }, // Yellow
            anchor: 'center',
            // Rotate cone to point "forward" (it points up by default, so rotate 90 deg around X)
            tilt: 90
          }]
        },
        visualVariables: [{
          type: 'rotation',
          field: 'heading',
          rotationType: 'geographic'
        }]
      } : {
        type: 'simple',
        symbol: {
          type: 'point-3d',
          symbolLayers: [{
            type: 'icon',
            resource: { href: '/sprites/airplane-fr24.svg' },
            size: 20,
            anchor: 'center'
          }]
        },
        visualVariables: [{
          type: 'rotation',
          field: 'heading',
          rotationType: 'geographic'
        }]
      },
      popupTemplate: {
        title: '{callsign}',
        content: `
          <b>ICAO24:</b> {icao24}<br>
          <b>מדינה:</b> {originCountry}<br>
          <b>גובה:</b> {altitude} מ׳<br>
          <b>מהירות:</b> {velocity} מ/ש<br>
          <b>כיוון:</b> {heading}°
        `
      }
    })
    
    customLayers.current['flight-tracking'] = layer
    return layer
  }, [])

  // Create flight paths FeatureLayer (called once)
  const createFlightPathsLayer = useCallback(() => {
    if (customLayers.current['flight-paths']) return customLayers.current['flight-paths']
    
    const is3D = currentViewMode.current === '3d'

    const layer = new FeatureLayer({
      id: 'flight-paths',
      title: 'נתיבי טיסה',
      source: [], // Start empty
      objectIdField: 'ObjectID',
      geometryType: 'polyline',
      hasZ: true, // Always enable Z values to support 3D paths
      spatialReference: { wkid: 4326 },
      fields: [
        { name: 'ObjectID', type: 'oid' },
        { name: 'icao24', type: 'string' }
      ],
      elevationInfo: is3D ? {
        mode: 'absolute-height' // Use absolute altitude for paths too
      } : {
        mode: 'on-the-ground'
      },
      renderer: is3D ? {
        type: 'simple',
        symbol: {
          type: 'line-3d', // Use 3D line symbol
          symbolLayers: [{
            type: 'line',
            size: 2,
            material: { color: 'white' }
          }]
        }
      } : {
        type: 'simple',
        symbol: {
          type: 'simple-line',
          color: 'white',
          width: 1.5,
          style: 'dash'
        }
      }
    })
    
    customLayers.current['flight-paths'] = layer
    return layer
  }, [])

  // Flight Tracker Effect
  useEffect(() => {
    const isFlightTrackerVisible = layers['flight-tracking']?.visible
    
    if (isFlightTrackerVisible) {
      // Update center
      let startLon, startLat
      if (view.current?.center) {
        startLon = view.current.center.longitude
        startLat = view.current.center.latitude
      } else if (currentLocation) {
        const continent = CONTINENTS[currentLocation.continent]
        const location = continent?.locations[currentLocation.city]
        if (location) {
          startLon = location.coords[0]
          startLat = location.coords[1]
        }
      }
      
      if (startLon !== undefined && startLat !== undefined) {
        flightTracker.setCenter(startLon, startLat)
      }

      // Create layers if needed and add to map
      if (!customLayers.current['flight-tracking'] && mapRef.current) {
        const flightLayer = createFlightLayer()
        mapRef.current.add(flightLayer)
      }
      if (!customLayers.current['flight-paths'] && mapRef.current) {
        const pathsLayer = createFlightPathsLayer()
        mapRef.current.add(pathsLayer)
      }

      // Subscribe
      const unsubscribe = flightTracker.subscribe(async (data, paths) => {
        if (!mapRef.current) return
        
        // --- Update Aircraft Icons using FeatureLayer ---
        const flightLayer = customLayers.current['flight-tracking']
        if (flightLayer && data?.features?.length) {
          // Convert GeoJSON features to ESRI Graphics (no Z - use featureExpressionInfo)
          const newGraphics = data.features.map((f, i) => new Graphic({
            geometry: {
              type: 'point',
              longitude: f.geometry.coordinates[0],
              latitude: f.geometry.coordinates[1]
              // No Z here - elevation comes from featureExpressionInfo
            },
            attributes: {
              ObjectID: i,
              icao24: f.properties.icao24 || '',
              callsign: f.properties.callsign || '',
              originCountry: f.properties.originCountry || '',
              altitude: f.properties.altitude || 0,
              velocity: f.properties.velocity || 0,
              heading: f.properties.heading || 0
            }
          }))
          
          try {
            // Query and delete existing, then add new
            const existing = await flightLayer.queryFeatures()
            await flightLayer.applyEdits({
              deleteFeatures: existing.features || [],
              addFeatures: newGraphics
            })
          } catch (e) {
            // Ignore errors during rapid updates
          }
        }

        // --- Update Paths using FeatureLayer ---
        const pathsLayer = customLayers.current['flight-paths']
        if (pathsLayer && paths?.features?.length) {
          const is3D = currentViewMode.current === '3d'
          const newPathGraphics = paths.features.map((f, i) => new Graphic({
            geometry: {
              type: 'polyline',
              // Always provide Z values to match layer schema (hasZ: true)
              // In 2D, we flatten Z to 0 to ensure ground clamping works reliably
              paths: [f.geometry.coordinates.map(c => [c[0], c[1], is3D ? c[2] : 0])],
              hasZ: true
            },
            attributes: {
              ObjectID: i,
              icao24: f.properties?.icao24 || ''
            }
          }))
          
          try {
            const existing = await pathsLayer.queryFeatures()
            await pathsLayer.applyEdits({
              deleteFeatures: existing.features || [],
              addFeatures: newPathGraphics
            })
          } catch (e) {
            // Ignore errors during rapid updates
          }
        }
      })
      
      // Ensure layers are visible
      if (customLayers.current['flight-tracking']) {
        customLayers.current['flight-tracking'].visible = true
      }
      if (customLayers.current['flight-paths']) {
        customLayers.current['flight-paths'].visible = true
      }

      return () => {
        unsubscribe()
      }
      
    } else {
      // Hide layers and clear data
      if (customLayers.current['flight-tracking']) {
        customLayers.current['flight-tracking'].visible = false
        customLayers.current['flight-tracking'].queryFeatures().then(result => {
          if (result.features?.length) {
            customLayers.current['flight-tracking'].applyEdits({
              deleteFeatures: result.features
            }).catch(() => {})
          }
        }).catch(() => {})
      }
      if (customLayers.current['flight-paths']) {
        customLayers.current['flight-paths'].visible = false
        customLayers.current['flight-paths'].queryFeatures().then(result => {
          if (result.features?.length) {
            customLayers.current['flight-paths'].applyEdits({
              deleteFeatures: result.features
            }).catch(() => {})
          }
        }).catch(() => {})
      }
    }
  }, [layers, currentLocation, createFlightLayer, createFlightPathsLayer])

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

