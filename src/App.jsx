import { useState, useRef, useCallback, lazy, Suspense, Component, useEffect} from 'react'
import { LocationSelector, CONTINENTS } from './components/LocationSelector'
import { StatusBar } from './components/StatusBar'
import { MapToggle } from './components/MapToggle'
import { ViewModeToggle } from './components/ViewModeToggle'
import { LayersPanel, LAYERS_CONFIG } from './components/LayersPanel'
import { flightTracker } from './dynamic-layers/flightTracker'

// Lazy load map components - only load when needed
const MapBox = lazy(() => import('./maps/MapBox'))
const MapLibre = lazy(() => import('./maps/MapLibre'))
const MapESRI = lazy(() => import('./maps/MapESRI'))
const MapCore = lazy(() => {
  console.log('Loading MapCore component...')
  return import('./maps/MapCore').catch(error => {
    console.error('Failed to load MapCore component:', error)
    throw error
  })
})

const MapCesium = lazy(() => import('./maps/MapCesium'))
const MapLeaflet = lazy(() => import('./maps/MapLeaflet'))

// Empty loading fallback - maps load fast enough
const MapLoader = () => null

// Error boundary for map components
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Map component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
          color: '#fff',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <h2>Error loading map</h2>
          <p style={{ color: '#ff6b6b' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 20px',
              background: '#4264fb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  const [mapType, setMapType] = useState('maplibre') // 'mapbox', 'esri', or 'cesium'
  const [viewMode, setViewMode] = useState('2d') // '2d' or '3d'
  const [currentLocation, setCurrentLocation] = useState({ continent: 'northAmerica', city: 'newYork' })
  const [expandedContinent, setExpandedContinent] = useState('northAmerica')
  const [tilesLoaded, setTilesLoaded] = useState(0)
  
  // Track if MapCore has been loaded at least once (persist across switches)
  const [mapCoreLoaded, setMapCoreLoaded] = useState(false)
  
  // Initialize layers state from LAYERS_CONFIG
  const [layers, setLayers] = useState(() => {
    const initialLayers = {}
    LAYERS_CONFIG.forEach(layer => {
      initialLayers[layer.id] = { visible: layer.defaultVisible }
    })
    return initialLayers
  })
  
  // Store shared camera state using ref (immediate update, not batched by React)
  const sharedCameraRef = useRef(null)
  
  const mapboxRef = useRef(null)
  const maplibreRef = useRef(null)
  const esriRef = useRef(null)
  const cesiumRef = useRef(null)
  const mapcoreRef = useRef(null)
  const leafletRef = useRef(null)

  const handleLocationChange = useCallback((continentKey, cityKey) => {
    setCurrentLocation({ continent: continentKey, city: cityKey })
    setExpandedContinent(continentKey)
  }, [])

  const handleTileLoadMapbox = useCallback(() => {
    setTilesLoaded(prev => prev + 1)
  }, [])

  const handleTileLoadMaplibre = useCallback(() => {
    setTilesLoaded(prev => prev + 1)
  }, [])

  const handleTileLoadEsri = useCallback((count) => {
    setTilesLoaded(count)
  }, [])

  const handleTileLoadCesium = useCallback((count) => {
    setTilesLoaded(count)
  }, [])

  const handleTileLoadMapcore = useCallback((count) => {
    setTilesLoaded(count)
  const handleTileLoadLeaflet = useCallback((count) => {
    setTilesLoaded(prev => prev + count)
  }, [])

  const handleMapTypeChange = useCallback((newType) => {
    console.log(`Switching map type from ${mapType} to ${newType}`)
    // Get camera from current map type and save it to shared ref
    let camera = null
    if (mapType === 'mapbox' && mapboxRef.current) {
      camera = mapboxRef.current.getCamera()
    } else if (mapType === 'maplibre' && maplibreRef.current) {
      camera = maplibreRef.current.getCamera()
    } else if (mapType === 'esri' && esriRef.current) {
      camera = esriRef.current.getCamera()
    } else if (mapType === 'cesium' && cesiumRef.current) {
      camera = cesiumRef.current.getCamera()
    } else if (mapType === 'mapcore' && mapcoreRef.current) {
      camera = mapcoreRef.current.getCamera()
    } else if (mapType === 'leaflet' && leafletRef.current) {
      camera = leafletRef.current.getCamera()
    }

    // Save camera to shared ref (immediately available for new map)
    if (camera) {
      sharedCameraRef.current = camera
    }
    
    // Mark MapCore as loaded when switching to it for the first time
    if (newType === 'mapcore' && !mapCoreLoaded) {
      setMapCoreLoaded(true)
    }
    
    setMapType(newType)
    // Reset tile count when switching
    setTilesLoaded(0)
  }, [mapType, mapCoreLoaded])

  const handleViewModeChange = useCallback((newMode) => {
    setViewMode(newMode)
  }, [])

  const handleLayerToggle = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: { 
        ...prev[layerId], 
        visible: !prev[layerId]?.visible 
      }
    }))
  }, [])

  // Get initial camera for any map type (from shared ref - immediately available)
  const getInitialCamera = useCallback(() => {
    return sharedCameraRef.current
  }, [])

  const getCurrentLocationData = useCallback(() => {
    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return null
    return continent.locations[currentLocation.city]
  }, [currentLocation])

  const locationData = getCurrentLocationData()

  return (
    <>
      {/* Map Container - only render active map */}
      <div style={{ width: '100%', height: '100vh' }}>
        <MapErrorBoundary>
          <Suspense fallback={<MapLoader />}>
            {mapType === 'cesium' && (
            <MapCesium 
              ref={cesiumRef}
              currentLocation={currentLocation}
              viewMode={viewMode}
              isActive={true}
              onTileLoad={handleTileLoadCesium}
              layers={layers}
              initialCamera={getInitialCamera()}
            />
          )}
          
          {mapType === 'mapbox' && (
            <MapBox 
              ref={mapboxRef}
              currentLocation={currentLocation}
              viewMode={viewMode}
              isActive={true}
              onTileLoad={handleTileLoadMapbox}
              layers={layers}
              initialCamera={getInitialCamera()}
            />
          )}
          
          {mapType === 'maplibre' && (
            <MapLibre 
              ref={maplibreRef}
              currentLocation={currentLocation}
              viewMode={viewMode}
              isActive={true}
              onTileLoad={handleTileLoadMaplibre}
              layers={layers}
              initialCamera={getInitialCamera()}
            />
          )}
          
          {mapType === 'esri' && (
            <MapESRI 
              ref={esriRef}
              currentLocation={currentLocation}
              viewMode={viewMode}
              isActive={true}
              onTileLoad={handleTileLoadEsri}
              layers={layers}
              initialCamera={getInitialCamera()}
            />
          )}

          {/* MapCore - render once loaded, then hide/show instead of unmounting */}
          {mapCoreLoaded && (
            <div style={{
              display: mapType === 'mapcore' ? 'block' : 'none',
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0
            }}>
              <MapCore 
                ref={mapcoreRef}
                currentLocation={currentLocation}
                viewMode={viewMode}
                isActive={mapType === 'mapcore'}
                onTileLoad={handleTileLoadMapcore}
                layers={layers}
                initialCamera={getInitialCamera()}
              />
            </div>
          )}

          </Suspense>
        </MapErrorBoundary>
          {mapType === 'leaflet' && (
            <MapLeaflet 
              ref={leafletRef}
              currentLocation={currentLocation}
              viewMode={viewMode}
              isActive={true}
              onTileLoad={handleTileLoadLeaflet}
              layers={layers}
              initialCamera={getInitialCamera()}
            />
          )}
        </Suspense>
      </div>

      {/* Map Type Toggle */}
      <MapToggle 
        mapType={mapType} 
        onToggle={handleMapTypeChange} 
      />

      {/* View Mode Toggle (2D/3D) */}
      <ViewModeToggle 
        viewMode={viewMode} 
        onToggle={handleViewModeChange} 
      />

      {/* Location Selector - shared between both maps */}
      <LocationSelector
        currentLocation={currentLocation}
        onLocationChange={handleLocationChange}
        expandedContinent={expandedContinent}
        onContinentToggle={setExpandedContinent}
      />

      {/* Layers Panel */}
      <LayersPanel 
        layers={layers}
        onLayerToggle={handleLayerToggle}
      />

      {/* Status Bar */}
      <StatusBar 
        locationData={locationData} 
        tilesLoaded={tilesLoaded}
      />
    </>
  )
}

export default App
