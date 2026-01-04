# Scripts (Scripts)

This directory contains Node.js scripts used for maintenance, data collection, and processing for the project. These scripts are not part of the application running in the browser, but are run locally during development.

## Files

### `fetch-power-lines.js`
Script for downloading power line data.
- Connects to an external API (such as OpenStreetMap's Overpass API).
- Downloads data on power lines in a defined area.
- Saves the result as a GeoJSON file in the `public/data/power-lines.geojson` directory.

### `fetch-religious-buildings.js`
Script for downloading religious buildings data.
- Connects to an external API.
- Filters religious buildings by type (synagogues, mosques, churches, etc.).
- Saves the result as a GeoJSON file in the `public/data/religious-buildings.geojson` directory.
