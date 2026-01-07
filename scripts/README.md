# Scripts (Scripts)

This directory contains Node.js scripts used for maintenance, data collection, and processing for the project. These scripts are not part of the application running in the browser, but are run locally during development.

## Files

### `build-integration.sh`
Script for building and launching an integration-server environment the integration server is a docker that runs an NGINX server enables the current project to be run by other computers using a secured http protocol. local machine will browse to  http://localhost:8080 and remote machine should browse to https://<computer's dns name or ip address>:8443

### `install_mapcore.bash`
A bash script that installs mapcore API from the mapcore's artifactory. Before using a token is needed to be known to the installer. It should be set manually as an environment variable named JFROG_TOKEN. script is run with a single parameter hwich is the MapCore's version (Currently: 12.4.0-MapBench-beta3).

### `install_mapcore.cmd`
Same as the above but intended to run in windows.

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
