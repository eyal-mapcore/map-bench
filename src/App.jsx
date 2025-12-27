import { useState, useRef, useCallback } from 'react'
import MapBox from './components/MapBox'
import MapLibre from './components/MapLibre'
import MapESRI from './components/MapESRI'
import MapCesium from './components/MapCesium'
import { LocationSelector, StatusBar, MapToggle, ViewModeToggle, CONTINENTS } from './components/LocationSelector'
import { LayersPanel, LAYERS_CONFIG } from './components/LayersPanel'

function App() {
  const [mapType, setMapType] = useState('mapbox') // 'mapbox', 'esri', or 'cesium'
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
  
  const mapboxRef = useRef(null)
  const maplibreRef = useRef(null)
  const esriRef = useRef(null)
  const cesiumRef = useRef(null)

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

  const handleMapTypeChange = useCallback((newType) => {
    // Get camera from current map type
    let camera = null
    if (mapType === 'mapbox' && mapboxRef.current) {
      camera = mapboxRef.current.getCamera()
    } else if (mapType === 'maplibre' && maplibreRef.current) {
      camera = maplibreRef.current.getCamera()
    } else if (mapType === 'esri' && esriRef.current) {
      camera = esriRef.current.getCamera()
    } else if (mapType === 'cesium' && cesiumRef.current) {
      camera = cesiumRef.current.getCamera()
    }

    // Set camera on new map type
    if (camera) {
      if (newType === 'mapbox' && mapboxRef.current) {
        mapboxRef.current.setCamera(camera)
      } else if (newType === 'maplibre' && maplibreRef.current) {
        maplibreRef.current.setCamera(camera)
      } else if (newType === 'esri' && esriRef.current) {
        esriRef.current.setCamera(camera)
      } else if (newType === 'cesium' && cesiumRef.current) {
        cesiumRef.current.setCamera(camera)
      }
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

  const getCurrentLocationData = useCallback(() => {
    const continent = CONTINENTS[currentLocation.continent]
    if (!continent) return null
    return continent.locations[currentLocation.city]
  }, [currentLocation])

  const locationData = getCurrentLocationData()

  return (
    <>
      {/* Mapbox Map */}
      <div style={{ 
        display: mapType === 'mapbox' ? 'block' : 'none',
        width: '100%',
        height: '100vh'
      }}>
        <MapBox 
          ref={mapboxRef}
          currentLocation={currentLocation}
          viewMode={viewMode}
          isActive={mapType === 'mapbox'}
          onTileLoad={handleTileLoadMapbox}
          layers={layers}
        />
      </div>

      {/* MapLibre Map */}
      <div style={{ 
        display: mapType === 'maplibre' ? 'block' : 'none',
        width: '100%',
        height: '100vh'
      }}>
        <MapLibre 
          ref={maplibreRef}
          currentLocation={currentLocation}
          viewMode={viewMode}
          isActive={mapType === 'maplibre'}
          onTileLoad={handleTileLoadMaplibre}
          layers={layers}
        />
      </div>

      {/* ESRI Map */}
      <div style={{ 
        display: mapType === 'esri' ? 'block' : 'none',
        width: '100%',
        height: '100vh'
      }}>
        <MapESRI 
          ref={esriRef}
          currentLocation={currentLocation}
          viewMode={viewMode}
          isActive={mapType === 'esri'}
          onTileLoad={handleTileLoadEsri}
          layers={layers}
        />
      </div>

      {/* Cesium Map */}
      <div style={{ 
        display: mapType === 'cesium' ? 'block' : 'none',
        width: '100%',
        height: '100vh'
      }}>
        <MapCesium 
          ref={cesiumRef}
          currentLocation={currentLocation}
          viewMode={viewMode}
          isActive={mapType === 'cesium'}
          onTileLoad={handleTileLoadCesium}
          layers={layers}
        />
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
