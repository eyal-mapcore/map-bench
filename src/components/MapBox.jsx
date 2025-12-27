import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { Tile3DLayer } from '@deck.gl/geo-layers'
import { Tiles3DLoader } from '@loaders.gl/3d-tiles'
import 'mapbox-gl/dist/mapbox-gl.css'

import { CONTINENTS, INITIAL_ZOOM, INITIAL_PITCH, INITIAL_BEARING } from './LocationSelector'
import { LAYERS_CONFIG } from './LayersPanel'

// API Keys - set in .env file
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_3D_TILES_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`

const MapBox = forwardRef(({ currentLocation, viewMode = '3d', isActive = true, onTileLoad, layers = {} }, ref) => {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const overlay = useRef(null)
  const currentViewMode = useRef(viewMode)
  const isMapLoaded = useRef(false)
  const isActiveRef = useRef(isActive)
  const powerLinesLayerAdded = useRef(false)
  const religiousBuildingsLayerAdded = useRef(false)

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

      // Add Power Lines layer from GeoJSON
      const powerLinesConfig = LAYERS_CONFIG.find(l => l.id === 'power-lines')
      if (powerLinesConfig) {
        map.current.addSource('power-lines', {
          type: 'geojson',
          data: '/data/power-lines.geojson'
        })

        map.current.addLayer({
          id: 'power-lines-layer',
          type: 'line',
          source: 'power-lines',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'none' // Start hidden, controlled by LayersPanel
          },
          paint: {
            'line-color': '#ffdc00',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 2,
              14, 4,
              18, 8
            ],
            'line-opacity': 0.8
          }
        })

        // Add glow effect layer behind main line
        map.current.addLayer({
          id: 'power-lines-glow',
          type: 'line',
          source: 'power-lines',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'none'
          },
          paint: {
            'line-color': '#ff9500',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 6,
              14, 10,
              18, 16
            ],
            'line-opacity': 0.4,
            'line-blur': 3
          }
        }, 'power-lines-layer') // Place below main line

        powerLinesLayerAdded.current = true
        console.log('✓ Mapbox: Power lines layer added')
      }

      // Add Religious Buildings layer from GeoJSON
      const religiousBuildingsConfig = LAYERS_CONFIG.find(l => l.id === 'religious-buildings')
      if (religiousBuildingsConfig) {
        // Load icons first
        const icons = [
          { id: 'religious-jewish-15', url: 'https://raw.githubusercontent.com/mapbox/maki/main/icons/religious-jewish-15.svg' },
          { id: 'religious-christian-15', url: 'https://raw.githubusercontent.com/mapbox/maki/main/icons/religious-christian-15.svg' },
          { id: 'religious-muslim-15', url: 'https://raw.githubusercontent.com/mapbox/maki/main/icons/religious-muslim-15.svg' },
          { id: 'religious-buddhist-15', url: 'https://raw.githubusercontent.com/mapbox/maki/main/icons/religious-buddhist-15.svg' },
          { id: 'religious-shinto-15', url: 'https://raw.githubusercontent.com/mapbox/maki/main/icons/religious-shinto-15.svg' },
          { id: 'place-of-worship-15', url: 'https://raw.githubusercontent.com/mapbox/maki/main/icons/place-of-worship-15.svg' }
        ]

        icons.forEach(icon => {
          if (!map.current.hasImage(icon.id)) {
            map.current.loadImage(icon.url, (error, image) => {
              if (error) {
                console.warn(`Failed to load icon: ${icon.id}`, error)
                return
              }
              if (!map.current.hasImage(icon.id)) {
                map.current.addImage(icon.id, image, { sdf: true })
              }
            })
          }
        })

        map.current.addSource('religious-buildings', {
          type: 'geojson',
          data: '/data/religious-buildings.geojson'
        })

        // Religious building markers (Icons)
        map.current.addLayer({
          id: 'religious-buildings-layer',
          type: 'symbol',
          source: 'religious-buildings',
          layout: {
            'visibility': 'none',
            'icon-image': [
              'match',
              ['get', 'religion'],
              'jewish', 'religious-jewish-15',
              'christian', 'religious-christian-15',
              'muslim', 'religious-muslim-15',
              'buddhist', 'religious-buddhist-15',
              'shinto', 'religious-shinto-15',
              'place-of-worship-15' // Default fallback
            ],
            'icon-size': 1.5,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-color': [
              'match',
              ['get', 'religion'],
              'jewish', '#0ea5e9',      // Blue
              'christian', '#f59e0b',   // Amber
              'muslim', '#10b981',      // Green
              'buddhist', '#f97316',    // Orange
              'shinto', '#ec4899',      // Pink
              '#ffffff'                 // White default
            ],
            'icon-halo-color': '#000000',
            'icon-halo-width': 1
          }
        })

        // Add labels for individual buildings
        map.current.addLayer({
          id: 'religious-buildings-labels',
          type: 'symbol',
          source: 'religious-buildings',
          minzoom: 14,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 11,
            'text-offset': [0, 2], // Adjusted offset to be below the icon
            'text-anchor': 'top',
            'text-max-width': 10,
            'visibility': 'none'
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1.5
          }
        })

        // Add click popup for religious buildings
        map.current.on('click', 'religious-buildings-layer', (e) => {
          if (!e.features || e.features.length === 0) return
          
          const feature = e.features[0]
          const props = feature.properties
          const coordinates = feature.geometry.coordinates.slice()
          
          // Icon based on religion
          const icons = {
            jewish: '🕍',
            christian: '⛪',
            muslim: '🕌',
            buddhist: '🛕',
            hindu: '🛕',
            shinto: '⛩️',
            unknown: '🏛️'
          }
          const icon = icons[props.religion] || '🏛️'
          
          const html = `
            <div style="direction: rtl; font-family: system-ui; min-width: 180px;">
              <div style="font-size: 24px; text-align: center; margin-bottom: 8px;">${icon}</div>
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${props.name || props.nameHe || 'מבנה דת'}</div>
              <div style="color: #666; font-size: 12px; margin-bottom: 4px;">${props.religionDisplay || ''}</div>
              ${props.denomination ? `<div style="font-size: 11px; color: #888;">זרם: ${props.denomination}</div>` : ''}
              ${props.address ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">📍 ${props.address}</div>` : ''}
            </div>
          `
          
          new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map.current)
        })

        // Change cursor on hover
        map.current.on('mouseenter', 'religious-buildings-layer', () => {
          map.current.getCanvas().style.cursor = 'pointer'
        })
        map.current.on('mouseleave', 'religious-buildings-layer', () => {
          map.current.getCanvas().style.cursor = ''
        })

        religiousBuildingsLayerAdded.current = true
        console.log('✓ Mapbox: Religious buildings layer added')
      }
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

  // Handle layer visibility changes from LayersPanel
  useEffect(() => {
    if (!map.current || !isMapLoaded.current) return

    const powerLinesVisible = layers['power-lines']?.visible
    const religiousBuildingsVisible = layers['religious-buildings']?.visible

    // Toggle power lines layer visibility
    if (powerLinesLayerAdded.current) {
      const powerVisibility = powerLinesVisible ? 'visible' : 'none'
      
      if (map.current.getLayer('power-lines-layer')) {
        map.current.setLayoutProperty('power-lines-layer', 'visibility', powerVisibility)
      }
      if (map.current.getLayer('power-lines-glow')) {
        map.current.setLayoutProperty('power-lines-glow', 'visibility', powerVisibility)
      }
      console.log(`Mapbox Layer "power-lines": ${powerLinesVisible ? 'visible' : 'hidden'}`)
    }

    // Toggle religious buildings layer visibility
    if (religiousBuildingsLayerAdded.current) {
      const religiousVisibility = religiousBuildingsVisible ? 'visible' : 'none'
      
      if (map.current.getLayer('religious-buildings-layer')) {
        map.current.setLayoutProperty('religious-buildings-layer', 'visibility', religiousVisibility)
      }
      if (map.current.getLayer('religious-buildings-labels')) {
        map.current.setLayoutProperty('religious-buildings-labels', 'visibility', religiousVisibility)
      }
      console.log(`Mapbox Layer "religious-buildings": ${religiousBuildingsVisible ? 'visible' : 'hidden'}`)
    }

    // When power lines OR religious buildings are visible, hide all non-essential layers
    // Keep only: satellite imagery (raster), 3D tiles, sky, and our custom layers
    const style = map.current.getStyle()
    if (style && style.layers) {
      style.layers.forEach(layer => {
        // Skip our own layers
        if (layer.id.startsWith('power-lines') || 
            layer.id.startsWith('religious-buildings') || 
            layer.id === 'sky') {
          return
        }

        // Keep satellite/raster layers (orthophoto)
        if (layer.type === 'raster') {
          return
        }

        // Keep background layers
        if (layer.type === 'background') {
          return
        }

        // Hide all other layers (labels, roads, buildings, etc.) when custom layers visible
        // These are typically: symbol, line, fill, fill-extrusion layers from the basemap
        if (layer.type === 'symbol' || layer.type === 'line' || layer.type === 'fill' || layer.type === 'fill-extrusion') {
          try {
            const targetVisibility = (powerLinesVisible || religiousBuildingsVisible) ? 'none' : 'visible'
            map.current.setLayoutProperty(layer.id, 'visibility', targetVisibility)
          } catch (e) {
            // Some layers might not support visibility changes
          }
        }
      })
      
      if (powerLinesVisible || religiousBuildingsVisible) {
        console.log(`Mapbox: Basemap layers hidden (custom layer on)`)
      }
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

MapBox.displayName = 'MapBox'

export default MapBox


