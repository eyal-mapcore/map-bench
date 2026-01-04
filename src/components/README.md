# User Interface Components (Components)

This directory contains the UI components of the application. The components here are not the maps themselves, but the interface that controls them or displays information over them.

## Component List

### `LayersPanel.jsx`
Layer management panel.
- Allows the user to toggle information layers on the map (such as power lines, religious buildings).
- Controls layer opacity.

### `LocationSelector.jsx`
Location selection component.
- Displays a list of continents and cities.
- Allows quick navigation to predefined locations (FlyTo).
- Includes mobile and desktop adapted views.

### `MapToggle.jsx`
Button/Switch for changing the map provider.
- Allows the user to switch between different map engines (e.g., MapLibre vs. Cesium).

### `StatusBar.jsx`
Status bar at the bottom or corner of the screen.
- Displays technical information about the current view:
  - Zoom Level.
  - Coordinates (Latitude/Longitude).
  - Bearing/Pitch.

### `ViewModeToggle.jsx`
Button for switching between view modes.
- Switch between 2D and 3D.
- Affects map pitch.
