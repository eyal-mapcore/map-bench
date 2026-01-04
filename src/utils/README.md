# Utilities (Utilities)

This directory contains helper functions, constants, and configurations used by the application.

## Files

### `mapStyleConfig.js`
Configuration file for map style.
- Defines data sources (Sources) - such as GeoJSON or Tiles.
- Defines layers (Layers) - how the information will be displayed (colors, line width, icons).
- Serves as a base for loading the map in MapLibre/Mapbox.

### `esriStyleConverter.js`
Style conversion tool.
- Conversion functions between different style definition formats (e.g., converting from ESRI style to Mapbox/MapLibre style or vice versa).
- Helps maintain visual consistency between different map types.
