import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from './LocationSelector'

// API Keys - set in .env file
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

// Cesium is loaded from CDN (global)
const Cesium = window.Cesium

// Set Cesium Ion default access token (not used, but required for Cesium to initialize)
if (Cesium && CESIUM_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_TOKEN
}

// Convert zoom level to camera height (approximate)
function zoomToHeight(zoom) {
  // Approximate conversion: zoom 17 ≈ 500m, zoom 1 ≈ 10000km
  return 591657550.5 / Math.pow(2, zoom)
}

// Convert camera height to zoom level (approximate)
function heightToZoom(height) {
  return Math.log2(591657550.5 / height)
}

const MapCesium = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad }, ref) => {
  const mapContainer = useRef(null)
  const viewer = useRef(null)
  const tileset = useRef(null)
  const currentViewMode = useRef(viewMode)
  const isActiveRef = useRef(isActive)
  const tileCount = useRef(0)

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    flyTo: (continentKey, cityKey) => {
      const continent = CONTINENTS[continentKey]
      if (!continent) return
      const location = continent.locations[cityKey]
      if (!location || !viewer.current) return

      const pitch = currentViewMode.current === '3d' ? INITIAL_PITCH : 0
      const height = zoomToHeight(INITIAL_ZOOM)
      
      viewer.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          location.coords[0],
          location.coords[1],
          height
        ),
        orientation: {
          heading: Cesium.Math.toRadians(-INITIAL_BEARING),
          pitch: Cesium.Math.toRadians(pitch - 90), // Cesium pitch is relative to ground
          roll: 0
        },
        duration: 3
      })
    },
    getCamera: () => {
      if (!viewer.current) return null
      
      const camera = viewer.current.camera
      const position = camera.positionCartographic
      
      return {
        center: [
          Cesium.Math.toDegrees(position.longitude),
          Cesium.Math.toDegrees(position.latitude)
        ],
        zoom: heightToZoom(position.height),
        pitch: Cesium.Math.toDegrees(camera.pitch) + 90, // Convert back from Cesium convention
        bearing: -Cesium.Math.toDegrees(camera.heading)
      }
    },
    setCamera: (cameraState) => {
      if (!viewer.current || !cameraState) return
      
      const height = zoomToHeight(cameraState.zoom)
      
      viewer.current.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          cameraState.center[0],
          cameraState.center[1],
          height
        ),
        orientation: {
          heading: Cesium.Math.toRadians(-cameraState.bearing),
          pitch: Cesium.Math.toRadians(cameraState.pitch - 90),
          roll: 0
        }
      })
    }
  }), [])

  const create3DTileset = useCallback(async () => {
    if (!viewer.current) return null
    
    try {
      const newTileset = await Cesium.Cesium3DTileset.fromUrl(
        `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`,
        {
          showCreditsOnScreen: true,
          maximumScreenSpaceError: 8,
          maximumMemoryUsage: 1024
        }
      )
      
      // Track tile loading
      newTileset.tileLoad.addEventListener(() => {
        tileCount.current++
        if (onTileLoad) {
          onTileLoad(tileCount.current)
        }
      })
      
      console.log('✓ Cesium: Google 3D Tiles loaded')
      return newTileset
    } catch (error) {
      console.error('Error loading Google 3D Tiles:', error)
      return null
    }
  }, [onTileLoad])

  useEffect(() => {
    if (viewer.current) return

    // Get initial location
    const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
    const initialCenter = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords
    const initialHeight = zoomToHeight(INITIAL_ZOOM)
    const initialPitch = viewMode === '3d' ? INITIAL_PITCH : 0

    // Create viewer
    viewer.current = new Cesium.Viewer(mapContainer.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      animation: false,
      fullscreenButton: false,
      vrButton: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      terrainProvider: undefined,
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          maximumLevel: 20
        })
      )
    })

    // Enable depth testing against terrain
    viewer.current.scene.globe.depthTestAgainstTerrain = true
    
    // Configure mouse controls to match ESRI:
    // - Left button: pan/rotate
    // - Right button: tilt (pitch)
    // - Middle button: zoom
    const controller = viewer.current.scene.screenSpaceCameraController
    
    // Right button for tilt
    controller.tiltEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      { eventType: Cesium.CameraEventType.PINCH, modifier: Cesium.KeyboardEventModifier.CTRL }
    ]
    
    // Middle button for zoom
    controller.zoomEventTypes = [
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.WHEEL,
      { eventType: Cesium.CameraEventType.PINCH, modifier: undefined }
    ]
    
    // Left button for rotate/pan (keep default)
    controller.rotateEventTypes = [
      Cesium.CameraEventType.LEFT_DRAG
    ]
    
    // Set initial camera position
    viewer.current.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        initialCenter[0],
        initialCenter[1],
        initialHeight
      ),
      orientation: {
        heading: Cesium.Math.toRadians(-INITIAL_BEARING),
        pitch: Cesium.Math.toRadians(initialPitch - 90),
        roll: 0
      }
    })

    // Set scene mode based on viewMode
    if (viewMode === '2d') {
      viewer.current.scene.morphTo2D(0)
    }

    // Load 3D tiles if in 3D mode
    if (viewMode === '3d') {
      create3DTileset().then((newTileset) => {
        if (newTileset && viewer.current) {
          tileset.current = newTileset
          viewer.current.scene.primitives.add(newTileset)
        }
      })
    }

    // Hide credits widget styling
    const creditContainer = viewer.current.cesiumWidget.creditContainer
    if (creditContainer) {
      creditContainer.style.background = 'rgba(0,0,0,0.5)'
      creditContainer.style.padding = '2px 5px'
      creditContainer.style.borderRadius = '3px'
    }

    console.log('✓ Cesium Viewer ready')

    return () => {
      if (viewer.current) {
        viewer.current.destroy()
        viewer.current = null
        tileset.current = null
      }
    }
  }, [])

  // Handle location changes from parent (NOT triggered by viewMode changes)
  useEffect(() => {
    if (!viewer.current) return

    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return
    const location = continent.locations[currentLocation.city]
    if (!location) return

    // Use ref to get current view mode without triggering effect on viewMode change
    const pitch = currentViewMode.current === '3d' ? INITIAL_PITCH : 0
    const height = zoomToHeight(INITIAL_ZOOM)

    viewer.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        location.coords[0],
        location.coords[1],
        height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(-INITIAL_BEARING),
        pitch: Cesium.Math.toRadians(pitch - 90),
        roll: 0
      },
      duration: 3
    })
  }, [currentLocation]) // Removed viewMode - use currentViewMode.current instead

  // Handle view mode changes (2D/3D)
  useEffect(() => {
    if (!viewer.current) return
    currentViewMode.current = viewMode

    const is3D = viewMode === '3d'
    const scene = viewer.current.scene
    const camera = viewer.current.camera
    
    // Save current camera position before morph
    const savedPosition = camera.positionCartographic.clone()
    const savedHeading = camera.heading

    // Calculate the new pitch based on view mode
    const newPitch = is3D ? 
      Cesium.Math.toRadians(INITIAL_PITCH - 90) : 
      Cesium.Math.toRadians(-90) // Looking straight down for 2D

    if (is3D) {
      // Switch to 3D mode instantly (0 duration) to avoid zoom-out animation
      scene.morphTo3D(0)
      
      // Immediately restore camera position with proper 3D pitch
      camera.setView({
        destination: Cesium.Cartesian3.fromRadians(
          savedPosition.longitude,
          savedPosition.latitude,
          savedPosition.height
        ),
        orientation: {
          heading: savedHeading,
          pitch: newPitch,
          roll: 0
        }
      })
      
      // Load 3D tileset if not present
      if (!tileset.current && isActiveRef.current) {
        create3DTileset().then((newTileset) => {
          if (newTileset && viewer.current) {
            tileset.current = newTileset
            viewer.current.scene.primitives.add(newTileset)
          }
        })
      } else if (tileset.current) {
        tileset.current.show = isActiveRef.current
      }
    } else {
      // Switch to 2D mode instantly (0 duration) to avoid zoom-out animation
      scene.morphTo2D(0)
      
      // Immediately restore camera position with 2D pitch (looking down)
      camera.setView({
        destination: Cesium.Cartesian3.fromRadians(
          savedPosition.longitude,
          savedPosition.latitude,
          savedPosition.height
        ),
        orientation: {
          heading: savedHeading,
          pitch: newPitch,
          roll: 0
        }
      })
      
      // Hide 3D tileset
      if (tileset.current) {
        tileset.current.show = false
      }
    }
  }, [viewMode, create3DTileset])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    
    if (tileset.current) {
      const is3D = currentViewMode.current === '3d'
      const shouldShow = is3D && isActive
      tileset.current.show = shouldShow
      console.log(`Cesium 3D tiles: ${shouldShow ? 'resumed' : 'paused'}`)
    }
    
    // Request render when becoming active
    if (isActive && viewer.current) {
      viewer.current.scene.requestRender()
    }
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

MapCesium.displayName = 'MapCesium'

export default MapCesium

