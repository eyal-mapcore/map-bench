import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import Map from '@arcgis/core/Map'
import SceneView from '@arcgis/core/views/SceneView'
import IntegratedMesh3DTilesLayer from '@arcgis/core/layers/IntegratedMesh3DTilesLayer'
import '@arcgis/core/assets/esri/themes/light/main.css'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from './LocationSelector'

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

const MapESRI = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad }, ref) => {
  const mapContainer = useRef(null)
  const view = useRef(null)
  const google3DTilesLayer = useRef(null)
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

    // Create the map - using 'hybrid' basemap for better brightness with labels
    const map = new Map({
      basemap: 'hybrid',
      ground: 'world-elevation',
      layers: [google3DTilesLayer.current]
    })

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

