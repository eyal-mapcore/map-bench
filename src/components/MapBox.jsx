import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { Tile3DLayer } from '@deck.gl/geo-layers'
import { Tiles3DLoader } from '@loaders.gl/3d-tiles'
import 'mapbox-gl/dist/mapbox-gl.css'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from './LocationSelector'

// API Keys - set in .env file
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_3D_TILES_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`

const MapBox = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad }, ref) => {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const overlay = useRef(null)
  const currentViewMode = useRef(viewMode)
  const isMapLoaded = useRef(false)
  const isActiveRef = useRef(isActive)

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
        }
      },
      screenSpaceError: 8,
      refinementStrategy: 'best-available',
      maximumMemoryUsage: 1024 * 1024 * 1024,
      opacity: 1,
      onTilesetLoad: () => console.log('✓ Google 3D Tileset loaded'),
      onTileLoad: () => {
        if (onTileLoad) {
          onTileLoad()
        }
      },
      onTileError: () => {}
    })
  }, [onTileLoad])

  useEffect(() => {
    if (map.current) return

    const initialLocation = CONTINENTS[currentLocation.continent]?.locations[currentLocation.city]
    const initialCenter = initialLocation?.coords || CONTINENTS.israel.locations.netanya.coords

    const initialPitch = viewMode === '3d' ? INITIAL_PITCH : 0
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: initialCenter,
      zoom: INITIAL_ZOOM,
      pitch: initialPitch,
      bearing: INITIAL_BEARING,
      antialias: true,
      maxPitch: 85
    })

    map.current.on('load', () => {
      isMapLoaded.current = true
      
      const tile3dLayer = viewMode === '3d' ? createTile3DLayer() : null
      overlay.current = new MapboxOverlay({ interleaved: true, layers: tile3dLayer ? [tile3dLayer] : [] })
      map.current.addControl(overlay.current)

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
    })

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-left')
    map.current.addControl(new mapboxgl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left')
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-left')

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [createTile3DLayer])

  // Handle location changes from parent
  useEffect(() => {
    if (!map.current) return

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

    // Toggle 3D tiles layer visibility - only if active
    if (overlay.current) {
      const shouldShow3DTiles = is3D && isActiveRef.current
      const tile3dLayer = shouldShow3DTiles ? createTile3DLayer() : null
      overlay.current.setProps({ layers: tile3dLayer ? [tile3dLayer] : [] })
    }
  }, [viewMode, createTile3DLayer])

  // Handle active state changes - pause/resume tile loading
  useEffect(() => {
    isActiveRef.current = isActive
    if (!overlay.current || !isMapLoaded.current) return

    const is3D = currentViewMode.current === '3d'
    const shouldShow3DTiles = is3D && isActive
    const tile3dLayer = shouldShow3DTiles ? createTile3DLayer() : null
    overlay.current.setProps({ layers: tile3dLayer ? [tile3dLayer] : [] })
    
    console.log(`Mapbox 3D tiles: ${shouldShow3DTiles ? 'resumed' : 'paused'}`)
  }, [isActive, createTile3DLayer])

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

MapBox.displayName = 'MapBox'

export default MapBox

