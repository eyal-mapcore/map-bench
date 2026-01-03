import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from '../components/LocationSelector'
import { LAYERS_CONFIG } from '../components/LayersPanel'
import { DEFAULT_RELIGION_ICONS, getIconUrl, loadReligiousBuildings, loadPowerLines } from '../utils/mapStyleConfig'

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
  // Mapbox uses 512px tiles, so zoom level is 1 less than standard (Google/Cesium) for same scale
  return 591657550.5 / Math.pow(2, zoom + 1)
}

// Convert camera height to zoom level (approximate)
function heightToZoom(height) {
  // Mapbox uses 512px tiles, so zoom level is 1 less than standard (Google/Cesium) for same scale
  return Math.log2(591657550.5 / height) - 1
}

// Height for floating religious icons in 3D mode (meters)
const RELIGIOUS_ICON_HEIGHT_3D = 50

const MapCesium = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad, layers = {}, initialCamera = null }, ref) => {
  const mapContainer = useRef(null)
  const viewer = useRef(null)
  const tileset = useRef(null)
  const powerLinesDataSource = useRef(null)
  const religiousBuildingsDataSource = useRef(null)
  const currentViewMode = useRef(viewMode)
  const isActiveRef = useRef(isActive)
  const tileCount = useRef(0)
  const viewerInitialized = useRef(false) // Track if we've actually created a viewer
  const hasSkippedFirstFlyTo = useRef(false) // Track if we've skipped first flyTo (for initialCamera)
  
  // Store initialCamera value at first render for use in effects
  const initialCameraOnMount = useRef(initialCamera)

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    flyTo: (continentKey, cityKey) => {
      const continent = CONTINENTS[continentKey]
      if (!continent) return
      const location = continent.locations[cityKey]
      if (!location || !viewer.current) return

      const pitch = currentViewMode.current === '3d' ? INITIAL_PITCH : 0
      const range = zoomToHeight(INITIAL_ZOOM)
      
      const center = Cesium.Cartesian3.fromDegrees(location.coords[0], location.coords[1])
      const target = new Cesium.BoundingSphere(center, 0)
      
      viewer.current.camera.flyToBoundingSphere(target, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(INITIAL_BEARING),
          Cesium.Math.toRadians(pitch - 90),
          range
        ),
        duration: 3
      })
    },
    getCamera: () => {
      if (!viewer.current) return null
      
      const camera = viewer.current.camera
      const scene = viewer.current.scene
      
      // Find the center of the screen on the globe
      const windowPosition = new Cesium.Cartesian2(
        scene.canvas.clientWidth / 2,
        scene.canvas.clientHeight / 2
      )
      
      const ray = camera.getPickRay(windowPosition)
      const centerCartesian = scene.globe.pick(ray, scene)
      
      let center = [0, 0]
      let zoom = 0
      
      if (centerCartesian) {
        const centerCartographic = Cesium.Cartographic.fromCartesian(centerCartesian)
        center = [
          Cesium.Math.toDegrees(centerCartographic.longitude),
          Cesium.Math.toDegrees(centerCartographic.latitude)
        ]
        
        // Calculate distance from camera to center (Range)
        const range = Cesium.Cartesian3.distance(camera.position, centerCartesian)
        zoom = heightToZoom(range)
      } else {
        // Fallback if looking at sky
        const position = camera.positionCartographic
        center = [
          Cesium.Math.toDegrees(position.longitude),
          Cesium.Math.toDegrees(position.latitude)
        ]
        zoom = heightToZoom(position.height)
      }
      
      return {
        center: center,
        zoom: zoom,
        pitch: Cesium.Math.toDegrees(camera.pitch) + 90, // Convert back from Cesium convention
        bearing: Cesium.Math.toDegrees(camera.heading)
      }
    },
    setCamera: (cameraState) => {
      if (!viewer.current || !cameraState) return
      
      const range = zoomToHeight(cameraState.zoom)
      const center = Cesium.Cartesian3.fromDegrees(cameraState.center[0], cameraState.center[1])
      
      viewer.current.camera.lookAt(
        center,
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(cameraState.bearing),
          Cesium.Math.toRadians(cameraState.pitch - 90),
          range
        )
      )
      
      // Unlock camera so user can move
      viewer.current.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
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
    // Skip if viewer already exists (React Strict Mode double-render protection)
    if (viewer.current || viewerInitialized.current) return
    viewerInitialized.current = true

    // Use initialCamera if provided (when switching from another map), otherwise use location
    let center, range, pitch, heading
    const cameraToUse = initialCameraOnMount.current
    
    if (cameraToUse) {
      center = cameraToUse.center
      range = zoomToHeight(cameraToUse.zoom)
      pitch = cameraToUse.pitch
      heading = cameraToUse.bearing
    } else {
      const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
      center = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords
      range = zoomToHeight(INITIAL_ZOOM)
      pitch = viewMode === '3d' ? INITIAL_PITCH : 0
      heading = INITIAL_BEARING
    }

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
    
    // Set initial camera position using lookAt to center on target
    const centerCartesian = Cesium.Cartesian3.fromDegrees(center[0], center[1])
    viewer.current.camera.lookAt(
      centerCartesian,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(heading),
        Cesium.Math.toRadians(pitch - 90),
        range
      )
    )
    // Unlock camera
    viewer.current.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)

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

    // Power Lines and Religious Buildings are now lazy loaded in applyLayersState
        
    // Apply initial layer visibility state
    setTimeout(() => {
      applyLayersState().catch(e => console.warn('Error applying layers:', e))
    }, 100)

    console.log('✓ Cesium Viewer ready')

    return () => {

      if (viewer.current) {
        viewer.current.destroy()
        viewer.current = null
        tileset.current = null
      }
      // Reset refs for next mount (important for React Strict Mode)
      viewerInitialized.current = false
      tileCount.current = 0
      hasSkippedFirstFlyTo.current = false
    }
  }, [])
  
  // Handle location changes from parent (NOT triggered by viewMode changes)
  useEffect(() => {
    if (!viewer.current) return

    // Skip the first flyTo if we used initialCamera (preserves camera state when switching maps)
    if (initialCameraOnMount.current && !hasSkippedFirstFlyTo.current) {
      hasSkippedFirstFlyTo.current = true
      return
    }

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
    
    // Update religious buildings entities for 2D/3D mode
    if (religiousBuildingsDataSource.current) {
      const entities = religiousBuildingsDataSource.current.entities.values
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        const props = entity.properties
        if (props) {
          const coords = Cesium.Cartographic.fromCartesian(entity.position.getValue(Cesium.JulianDate.now()))
          const lon = Cesium.Math.toDegrees(coords.longitude)
          const lat = Cesium.Math.toDegrees(coords.latitude)
          
          // Update position height
          entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, is3D ? RELIGIOUS_ICON_HEIGHT_3D : 0)
          
          // Update billboard height reference
          // Use NONE for 2D mode (CLAMP_TO_GROUND doesn't work without terrain)
          if (entity.billboard) {
            entity.billboard.heightReference = is3D ? 
              Cesium.HeightReference.RELATIVE_TO_GROUND : 
              Cesium.HeightReference.NONE
          }
          
          // Add or remove callout line
          if (is3D) {
            entity.polyline = new Cesium.PolylineGraphics({
              positions: [
                Cesium.Cartesian3.fromDegrees(lon, lat, 0),
                Cesium.Cartesian3.fromDegrees(lon, lat, RELIGIOUS_ICON_HEIGHT_3D)
              ],
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.WHITE.withAlpha(0.8),
                dashLength: 8
              }),
              clampToGround: false,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            })
          } else {
            entity.polyline = undefined
          }
        }
      }
    }
    
    // Request render to update
    viewer.current.scene.requestRender()
  }, [viewMode, create3DTileset])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    
    if (tileset.current) {
      const is3D = currentViewMode.current === '3d'
      const shouldShow = is3D && isActive
      tileset.current.show = shouldShow
    }
    
    // Request render when becoming active
    if (isActive && viewer.current) {
      viewer.current.scene.requestRender()
    }
  }, [isActive])

  // Ref to track layers state for use in initialization
  const layersStateRef = useRef(layers)

  // Apply current layer visibility state - called both on initial load and when layers change
  const applyLayersState = useCallback(async () => {
    if (!viewer.current) return

    const currentLayers = layersStateRef.current
    const powerLinesVisible = currentLayers['power-lines']?.visible
    const religiousBuildingsVisible = currentLayers['religious-buildings']?.visible

    // Lazy load Power Lines
    if (powerLinesVisible && !powerLinesDataSource.current) {
      try {
        console.log('Lazy loading Power Lines...')
        const data = await loadPowerLines()
        if (!viewer.current) return

        const dataSource = await Cesium.GeoJsonDataSource.load(data, {
          stroke: Cesium.Color.YELLOW.withAlpha(0.9),
          strokeWidth: 4,
          clampToGround: false
        })
        
        if (!viewer.current) return
        powerLinesDataSource.current = dataSource
        viewer.current.dataSources.add(dataSource)
        
        // Style entities with elevation and disable depth test
        const entities = dataSource.entities.values
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i]
          if (entity.polyline) {
            // Get existing positions and add height
            const positions = entity.polyline.positions.getValue(Cesium.JulianDate.now())
            if (positions) {
              const elevatedPositions = positions.map(pos => {
                const cartographic = Cesium.Cartographic.fromCartesian(pos)
                return Cesium.Cartesian3.fromRadians(
                  cartographic.longitude,
                  cartographic.latitude,
                  50 // 50 meters above ground (higher to be visible above buildings)
                )
              })
              
              entity.polyline.positions = elevatedPositions
              entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.4,
                color: Cesium.Color.YELLOW.withAlpha(0.9)
              })
              entity.polyline.width = 6
              // Disable depth test so lines always render on top
              entity.polyline.depthFailMaterial = new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.4,
                color: Cesium.Color.ORANGE.withAlpha(0.7)
              })
              // Always show lines regardless of depth (distance in meters, Number.POSITIVE_INFINITY = always)
              entity.polyline.disableDepthTestDistance = Number.POSITIVE_INFINITY
            }
          }
        }
      } catch (error) {
        console.error('Error loading power lines:', error)
      }
    }

    // Lazy load Religious Buildings
    if (religiousBuildingsVisible && !religiousBuildingsDataSource.current) {
      try {
        console.log('Lazy loading Religious Buildings...')
        const data = await loadReligiousBuildings()
        if (!viewer.current) return

        const dataSource = new Cesium.CustomDataSource('religious-buildings')
        
        data.features.forEach(feature => {
          const coords = feature.geometry.coordinates
          const props = feature.properties
          const religion = props.religion || 'default'
          const iconUrl = getIconUrl(DEFAULT_RELIGION_ICONS, religion)
          const is3D = currentViewMode.current === '3d'
          
          // Create billboard for the icon
          // In 2D mode: use NONE heightReference and height 0 to place icons on the map surface
          // In 3D mode: use RELATIVE_TO_GROUND and elevated height for visibility above buildings
          const entity = dataSource.entities.add({
            position: Cesium.Cartesian3.fromDegrees(coords[0], coords[1], is3D ? RELIGIOUS_ICON_HEIGHT_3D : 0),
            billboard: {
              image: iconUrl,
              width: 24,
              height: 24,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              heightReference: is3D ? Cesium.HeightReference.RELATIVE_TO_GROUND : Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            properties: props
          })
          
          // Add polyline from ground to icon in 3D mode
          if (is3D) {
            entity.polyline = new Cesium.PolylineGraphics({
              positions: [
                Cesium.Cartesian3.fromDegrees(coords[0], coords[1], 0),
                Cesium.Cartesian3.fromDegrees(coords[0], coords[1], RELIGIOUS_ICON_HEIGHT_3D)
              ],
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.WHITE.withAlpha(0.8),
                dashLength: 8
              }),
              clampToGround: false,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            })
          }
        })
        
        religiousBuildingsDataSource.current = dataSource
        viewer.current.dataSources.add(dataSource)
      } catch (error) {
        console.error('Error loading religious buildings:', error)
      }
    }

    if (!viewer.current) return

    // Toggle power lines visibility
    if (powerLinesDataSource.current) {
      powerLinesDataSource.current.show = powerLinesVisible
    }
    
    // Toggle religious buildings visibility
    if (religiousBuildingsDataSource.current) {
      religiousBuildingsDataSource.current.show = religiousBuildingsVisible
    }

    // When power lines OR religious buildings are visible, hide imagery layers (labels, etc.)
    // Keep only satellite base layer and 3D tiles
    const anyLayerVisible = powerLinesVisible || religiousBuildingsVisible
    const imageryLayers = viewer.current.imageryLayers
    if (imageryLayers.length > 1) {
      // Hide all layers except the first (satellite base)
      for (let i = 1; i < imageryLayers.length; i++) {
        imageryLayers.get(i).show = !anyLayerVisible
      }
    }

    // Request render to update
    viewer.current.scene.requestRender()
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
        left: 0
      }}
    />
  )
})

MapCesium.displayName = 'MapCesium'

export default MapCesium

