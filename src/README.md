# Source Code Directory (Source)

This directory contains all the source code for the map application.

## Main Files

### `main.jsx`
The entry point of the React application.
- Initializes the DOM.
- Loads the global style file.
- Renders the `App` component.

### `App.jsx`
The main component of the application.
- Manages the main state of the application.
- Contains the logic for loading different maps.
- Integrates the various components (toolbar, map, location selector).

### `index.css`
Global style file (CSS).
- Tailwind CSS definitions (if used).
- Style resets.
- Global style variables.

## Subdirectories

### `components/`
Contains reusable UI components, such as panels, buttons, and menus.

### `maps/`
Contains the various map implementations (MapLibre, Cesium, etc.). Each file here represents an integration with a different map library.

### `utils/`
Contains helper functions, configuration files, and logic that is not specific to a component.
