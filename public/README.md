# Public Assets Directory (Public)

This directory contains static files served directly by the server (Vite) without further processing. The files here are accessible at the root address of the application.

## Files and Directories

### `data/`
Contains geographic data files (GeoJSON) used as layers in the map.

### `sprites/`
Contains icons and vector graphics (SVG) used for marking points of interest on the map.

### `map-style.json`
Map Style Specification file.
- Defines the general look of the map.
- References data sources (Tiles, GeoJSON).
- Defines base layers (roads, background, water).

### `favicon.svg`
Application icon displayed in the browser tab.
