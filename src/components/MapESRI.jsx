import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import Map from '@arcgis/core/Map'
import SceneView from '@arcgis/core/views/SceneView'
import IntegratedMesh3DTilesLayer from '@arcgis/core/layers/IntegratedMesh3DTilesLayer'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import '@arcgis/core/assets/esri/themes/light/main.css'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from './LocationSelector'
import { LAYERS_CONFIG } from './LayersPanel'

// API Key - set in .env file
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_3D_TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'

// Convert Mapbox zoom to ESRI scale (approximate)
function zoomToScale(zoom) {
  return 591657550.5 / Math.pow(2, zoom)
}

// Convert ESRI scale to Mapbox zoom (approximate)
function scaleToZoom(scale) {
  return Math.log2(591657550.5 / scale)
}

const MapESRI = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad, layers = {} }, ref) => {
  const mapContainer = useRef(null)
  const view = useRef(null)
  const mapRef = useRef(null)
  const google3DTilesLayer = useRef(null)
  const customLayers = useRef({})
  const currentViewMode = useRef(viewMode)
  const isActiveRef = useRef(isActive)

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    flyTo: (continentKey, cityKey) => {
      const continent = CONTINENTS[continentKey]
      if (!continent) return
      const location = continent.locations[cityKey]
      if (!location || !view.current) return

      const tilt = currentViewMode.current === '3d' ? INITIAL_PITCH : 0
      view.current.goTo({
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
      view.current.goTo({
        center: camera.center,
        scale: zoomToScale(camera.zoom),
        tilt: camera.pitch,
        heading: -camera.bearing
      }, {
        animate: false
      })
    }
  }), [])

  useEffect(() => {
    if (view.current) return

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

    // Track tile loading
    let tileCount = 0
    google3DTilesLayer.current.on('layerview-create', () => {
      console.log('✓ ESRI: Google 3D Tiles layer view created')
    })

    // Create Power Lines layer from pre-processed GeoJSON file
    const powerLinesConfig = LAYERS_CONFIG.find(l => l.id === 'power-lines')
    if (powerLinesConfig) {
      const powerLinesLayer = new GeoJSONLayer({
        id: 'power-lines',
        url: '/data/power-lines.geojson', // Pre-processed file from OSM
        title: powerLinesConfig.name,
        opacity: powerLinesConfig.opacity || 1,
        visible: false, // Controlled by LayersPanel
        // 3D elevation - display at fixed height above ground
        elevationInfo: {
          mode: 'relative-to-ground',
          offset: powerLinesConfig.elevationHeight || 15 // 15 meters above ground
        },
        // 3D Line symbology - 3D tube with volume
        renderer: {
          type: 'simple',
          symbol: {
            type: 'line-3d',
            symbolLayers: [{
              type: 'path',
              profile: 'circle', // Round cable profile for 3D appearance
              width: 3, // Width in meters
              height: 3, // Height in meters - gives 3D volume
              material: {
                color: [255, 220, 0, 0.7] // Yellow with transparency
              },
              cap: 'round',
              join: 'round'
            }]
          }
        },
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
    }

    // Create the map - using 'hybrid' basemap for better brightness with labels
    const map = new Map({
      basemap: 'hybrid',
      ground: 'world-elevation',
      layers: [
        google3DTilesLayer.current,
        ...(customLayers.current['power-lines'] ? [customLayers.current['power-lines']] : [])
      ]
    })
    mapRef.current = map

    // Get initial location
    const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
    const initialCenter = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords

    // Create the SceneView
    const initialTilt = viewMode === '3d' ? INITIAL_PITCH : 0
    view.current = new SceneView({
      container: mapContainer.current,
      map: map,
      camera: {
        position: {
          longitude: initialCenter[0],
          latitude: initialCenter[1],
          z: 500
        },
        tilt: initialTilt,
        heading: -INITIAL_BEARING
      },
      qualityProfile: 'high',
      environment: {
        atmosphere: {
          quality: 'high'
        },
        lighting: {
          type: 'sun',
          date: new Date('2024-06-21T12:00:00Z'), // Midday summer sun for maximum brightness
          directShadowsEnabled: false
        }
      },
      ui: {
        components: []
      }
    })

    // Monitor tile loading
    view.current.when(() => {
      console.log('✓ ESRI SceneView ready')
      
      // Periodically check tile count
      const checkTiles = setInterval(() => {
        if (google3DTilesLayer.current?.loaded) {
          tileCount++
          if (onTileLoad) {
            onTileLoad(tileCount)
          }
        }
      }, 500)

      // Scale-responsive power lines - update renderer based on zoom level
      const powerLinesLayer = customLayers.current['power-lines']
      if (powerLinesLayer) {
        // Function to calculate line size based on scale
        const getLineSize = (scale) => {
          // Scale stops: [scale, size in meters]
          const stops = [
            [500, 2],        // Very zoomed in - thin
            [2000, 6],       // Zoomed in
            [10000, 20],     // Medium zoom
            [50000, 80],     // Zoomed out
            [200000, 240],   // Very zoomed out
            [500000, 600]    // Extreme zoom out
          ]
          
          // Find the right interpolation range
          if (scale <= stops[0][0]) return stops[0][1]
          if (scale >= stops[stops.length - 1][0]) return stops[stops.length - 1][1]
          
          for (let i = 0; i < stops.length - 1; i++) {
            if (scale >= stops[i][0] && scale < stops[i + 1][0]) {
              // Linear interpolation between stops
              const t = (scale - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
              return stops[i][1] + t * (stops[i + 1][1] - stops[i][1])
            }
          }
          return stops[0][1]
        }

        // Update renderer when scale changes
        let lastSize = null
        view.current.watch('scale', (scale) => {
          const newSize = Math.round(getLineSize(scale))
          if (newSize !== lastSize) {
            lastSize = newSize
            powerLinesLayer.renderer = {
              type: 'simple',
              symbol: {
                type: 'line-3d',
                symbolLayers: [{
                  type: 'path',
                  profile: 'circle',
                  width: newSize,
                  height: newSize,
                  material: {
                    color: [255, 220, 0, 0.7] // Dark orange with transparency
                  },
                  cap: 'round',
                  join: 'round'
                }]
              }
            }
          }
        })
      }

      // Cleanup interval on unmount
      view.current.on('destroy', () => {
        clearInterval(checkTiles)
      })
    })

    return () => {
      if (view.current) {
        view.current.destroy()
        view.current = null
      }
    }
  }, [])

  // Handle location changes from parent
  useEffect(() => {
    if (!view.current) return

    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return
    const location = continent.locations[currentLocation.city]
    if (!location) return

    const tilt = viewMode === '3d' ? INITIAL_PITCH : 0
    view.current.goTo({
      center: location.coords,
      scale: zoomToScale(INITIAL_ZOOM),
      tilt: tilt,
      heading: -INITIAL_BEARING
    }, {
      duration: 3000,
      easing: 'ease-in-out'
    })
  }, [currentLocation, viewMode])

  // Handle view mode changes (2D/3D)
  useEffect(() => {
    if (!view.current) return
    currentViewMode.current = viewMode

    const is3D = viewMode === '3d'
    const targetTilt = is3D ? INITIAL_PITCH : 0

    // Animate tilt change
    view.current.goTo({
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
  }, [viewMode])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    if (!google3DTilesLayer.current) return

    const is3D = currentViewMode.current === '3d'
    const shouldShow3DTiles = is3D && isActive
    google3DTilesLayer.current.visible = shouldShow3DTiles
    
    console.log(`ESRI 3D tiles: ${shouldShow3DTiles ? 'resumed' : 'paused'}`)
  }, [isActive])

  // Handle layer visibility changes from LayersPanel
  useEffect(() => {
    if (!mapRef.current) return

    Object.entries(layers).forEach(([layerId, layerState]) => {
      const layer = customLayers.current[layerId]
      if (layer) {
        layer.visible = layerState.visible
        console.log(`ESRI Layer "${layerId}": ${layerState.visible ? 'visible' : 'hidden'}`)
        
        // Ensure layer is on top
        if (layerState.visible && mapRef.current) {
          mapRef.current.reorder(layer, mapRef.current.layers.length - 1)
        }
      }
    })

    // When power-lines layer is visible, hide basemap reference layers (labels, roads)
    // Keep only orthophoto (base layers) and Google 3D Tiles visible
    const powerLinesVisible = layers['power-lines']?.visible
    if (mapRef.current?.basemap) {
      // Hide/show reference layers (labels, roads, etc.)
      mapRef.current.basemap.referenceLayers?.forEach(refLayer => {
        refLayer.visible = !powerLinesVisible
      })
      console.log(`ESRI Basemap reference layers: ${powerLinesVisible ? 'hidden' : 'visible'}`)
    }
  }, [layers])

  return (
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
  )
})

MapESRI.displayName = 'MapESRI'

export default MapESRI

