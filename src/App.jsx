import { useState, useRef, useCallback, lazy, Suspense, useEffect } from 'react'
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
const MapCesium = lazy(() => import('./maps/MapCesium'))
const MapLeaflet = lazy(() => import('./maps/MapLeaflet'))

// Empty loading fallback - maps load fast enough
const MapLoader = () => null

function App() {
  const [mapType, setMapType] = useState('maplibre') // 'mapbox', 'esri', or 'cesium'
  const [viewMode, setViewMode] = useState('2d') // '2d' or '3d'
  const [currentLocation, setCurrentLocation] = useState({ continent: 'northAmerica', city: 'newYork' })
  const [expandedContinent, setExpandedContinent] = useState('northAmerica')
  const [tilesLoaded, setTilesLoaded] = useState(0)
  
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

  const handleTileLoadLeaflet = useCallback((count) => {
    setTilesLoaded(prev => prev + count)
  }, [])

  const handleMapTypeChange = useCallback((newType) => {
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
    } else if (mapType === 'leaflet' && leafletRef.current) {
      camera = leafletRef.current.getCamera()
    }

    // Save camera to shared ref (immediately available for new map)
    if (camera) {
      sharedCameraRef.current = camera
    }
    
    setMapType(newType)
    // Reset tile count when switching
    setTilesLoaded(0)
  }, [mapType])

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
        <Suspense fallback={<MapLoader />}>
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
