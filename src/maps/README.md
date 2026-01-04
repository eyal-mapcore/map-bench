# Map Components (Maps)

This directory contains wrappers for the various mapping libraries. Each component here is responsible for initializing and managing an instance of a specific map type.

## Map List

### `MapLibre.jsx`
Map implementation using **MapLibre GL JS** library.
- WebGL based.
- Used for displaying vector maps.
- Supports loading Styles and GeoJSON.
- This is usually the default map.

### `MapCesium.jsx`
Map implementation using **CesiumJS** library.
- 3D Globe engine.
- Used for displaying terrain, 3D buildings, and complex geographic data.
- Suitable for realistic visualizations.

### `MapBox.jsx`
Map implementation using **Mapbox GL JS** library.
- Similar to MapLibre (which is a fork of it), but uses proprietary Mapbox services.
- Usually requires an Access Token.

### `MapESRI.jsx`
Map implementation using **ArcGIS API for JavaScript** (by ESRI).
- Used for integration with ESRI GIS services.
- Supports complex information layers and enterprise map services.

### `MapLeaflet.jsx`
Map implementation using **Leaflet** library.
- Lightweight 2D map library.
- Uses raster tiles (Esri World Imagery).
- Supports GeoJSON layers and custom markers.

## How to Add a New Third-Party Map Component

To add a new map provider (e.g., Google Maps, Leaflet, OpenLayers), follow these steps:

### 1. Create the Component File
Create a new file in this directory (e.g., `MapGoogle.jsx`).

### 2. Implement the Component Structure
The component must use `forwardRef` to expose the `getCamera` method to the parent (`App.jsx`). This is crucial for preserving the view when switching between map engines.

```jsx
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

const MapNew = forwardRef(({ onTileLoad, initialCamera, viewMode, layers }, ref) => {
  const mapContainer = useRef(null)
  const mapInstance = useRef(null)

  // Expose getCamera method to parent
  useImperativeHandle(ref, () => ({
    getCamera: () => {
      if (!mapInstance.current) return null
      // Return object with { center: [lng, lat], zoom, pitch, bearing }
      return {
        center: [/* get lng */, /* get lat */],
        zoom: /* get zoom */,
        pitch: /* get pitch */,
        bearing: /* get bearing */
      }
    }
  }))

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current) return

    // Initialize your 3rd party map here
    // Use initialCamera.center, initialCamera.zoom etc. to set start position

    return () => {
      // Cleanup map instance
    }
  }, [])

  // Handle View Mode Changes (2D/3D)
  useEffect(() => {
    if (!mapInstance.current) return
    // Update map pitch/tilt based on viewMode ('2d' or '3d')
  }, [viewMode])

  // Handle Layer Visibility
  useEffect(() => {
    if (!mapInstance.current) return
    // Toggle layers based on 'layers' prop
  }, [layers])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
})

export default MapNew
```

### 3. Support Location Changes (FlyTo)
To support navigating to specific locations (e.g., when a user selects a city), you need to:
1. Expose a `flyTo` method in `useImperativeHandle`.
2. Listen for changes in the `currentLocation` prop.

```jsx
import { CONTINENTS } from '../components/LocationSelector'

// ... inside component
useImperativeHandle(ref, () => ({
  // ... getCamera ...
  flyTo: (continentKey, cityKey) => {
    const continent = CONTINENTS[continentKey]
    if (!continent) return
    const location = continent.locations[cityKey]
    
    // Implement map-specific fly/pan logic here
    // e.g., map.flyTo([location.coords[0], location.coords[1]])
  }
}))

// Handle prop-based location changes
useEffect(() => {
  if (!mapInstance.current || !currentLocation) return
  
  // Logic to fly to the new location
  // ...
}, [currentLocation])
```

### 4. Support System Layers
The system passes a `layers` prop containing the visibility state of layers (e.g., `power-lines`, `religious-buildings`).
1. Load the layer data (GeoJSON) when the map initializes.
2. Toggle visibility based on the `layers` prop.

```jsx
// Handle Layer Visibility
useEffect(() => {
  if (!mapInstance.current) return

  // Example for Power Lines layer
  if (layers['power-lines']?.visible) {
    // Add layer to map if not present
  } else {
    // Remove layer from map if present
  }
}, [layers])
```

### 5. Integrate into `App.jsx`
1.  **Import**: Add a lazy import for your new component.
    ```jsx
    const MapNew = lazy(() => import('./maps/MapNew'))
    ```
2.  **State**: Add a ref for the new map.
    ```jsx
    const newMapRef = useRef(null)
    ```
3.  **Switch Logic**: Update `handleMapTypeChange` to get the camera from your new ref.
    ```jsx
    } else if (mapType === 'newMap' && newMapRef.current) {
      camera = newMapRef.current.getCamera()
    }
    ```
4.  **Render**: Add a condition to render your component.
    ```jsx
    {mapType === 'newMap' && (
      <Suspense fallback={<MapLoader />}>
        <MapNew
          ref={newMapRef}
          initialCamera={getInitialCamera()}
          onTileLoad={handleTileLoadNew}
          viewMode={viewMode}
          layers={layers}
        />
      </Suspense>
    )}
    ```

### 6. Update `MapToggle.jsx`
Add a button to the `MapToggle` component to allow users to switch to your new map type.
