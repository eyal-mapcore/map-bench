# 🗺️ Map Bench

A React-based benchmarking application for comparing different 3D mapping libraries with Google Photorealistic 3D Tiles integration.

![React](https://img.shields.io/badge/React-18.3-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-6.0-purple?logo=vite)
![License](https://img.shields.io/badge/License-MIT-green)

## 🌟 Overview

Map Bench allows you to compare the performance and rendering quality of four major mapping libraries, all displaying the same Google Photorealistic 3D Tiles. It also features a data layer system to visualize geospatial information like power lines and religious buildings on top of the 3D terrain.

| Library | Description |
|---------|-------------|
| **Mapbox GL JS** | Industry-leading WebGL map library with terrain support |
| **MapLibre GL** | Open-source fork of Mapbox GL JS |
| **ArcGIS (ESRI)** | Enterprise-grade 3D SceneView with IntegratedMesh3DTilesLayer |
| **CesiumJS** | High-precision 3D globe for geospatial visualization |
| **Leaflet** | Lightweight open-source JavaScript library for mobile-friendly interactive maps |
| **MapCore  | Elbit's MapCore's JavaScript library for geospatial visualization

> Want to add another map provider? Check out our [guide on adding new map components](src/maps/README.md).

## ✨ Features

- 🔄 **Seamless Map Switching** - Switch between mapping libraries while preserving camera position
- 🌐 **Google 3D Tiles** - Photorealistic 3D buildings and terrain from Google Maps Platform
- 📚 **Data Layers** - Toggleable overlays for geospatial data visualization
- 🎛️ **2D/3D Toggle** - Switch between flat map view and 3D perspective
- 📍 **Location Selector** - Pre-configured locations across 4 continents with quality ratings
- 📊 **Tile Counter** - Real-time display of loaded 3D tiles
- 🎨 **Modern UI** - Sleek dark theme with smooth animations

## 🗺️ Data Layers

The application includes a Layers Panel to visualize additional data sets:

| Layer | Icon | Description | Source |
|-------|------|-------------|--------|
| **High Voltage Power Lines** | ⚡ | Displayed at 15m height to visualize building clearance | OpenStreetMap |
| **Religious Buildings** | 🕌 | Points of interest including Synagogues, Churches, and Mosques | OpenStreetMap |
| **Flight Tracking** | ✈️ | Real-time aircraft positions with altitude and velocity | OpenSky Network |

## 🏙️ Pre-configured Locations

The app includes curated locations organized by continent:

### 🌎 North America
- New York (Manhattan, Central Park)
- San Francisco (Golden Gate Bridge, Alcatraz)
- Las Vegas (The Strip)
- Los Angeles (Hollywood, Santa Monica)

### 🇮🇱 Israel
- Tel Aviv (Azrieli Towers)
- Jerusalem (Old City, Western Wall)
- Haifa (Bahá'í Gardens)
- Netanya (Beach, Marina)

### 🌍 Europe
- London (Big Ben, Tower Bridge)
- Paris (Eiffel Tower, Champs-Élysées)
- Rome (Colosseum, Vatican)
- Barcelona (Sagrada Família)

### 🌏 Asia
- Tokyo (Shinjuku, Tokyo Tower)
- Dubai (Burj Khalifa, Palm)
- Singapore (Marina Bay Sands)
- Hong Kong (Victoria Harbour)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- API keys (see below)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/moshew/map-bench.git
   cd map-bench
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API keys**
   
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```env
   VITE_MAPBOX_TOKEN=your_mapbox_token_here
   VITE_GOOGLE_API_KEY=your_google_api_key_here
   VITE_ESRI_API_KEY=your_esri_api_key_here
   VITE_CESIUM_TOKEN=your_cesium_token_here
   VITE_MAPTILER_KEY=your_maptiler_k
   VITE_MAPCORE_SERVER_URL=development (http://localhost:5173) or production mapcore server's file
   VITE_GOOGLE_3D_TILES_URL=https://tile.googleapis.com/v1/3dtiles/root.json
   VITE_WAYBACK_MAPTILES_WMTS_URL=https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/mapserver/wmts/1.0.0/wmtscapabilities.xml
   ```

4. **MapCore Install**

Perform the following command:
   Perform the following bash commands:
   ``` bash
   export JFROG_TOKEN=your_jfrog_token (used by mapcore username)
   ./scripts/install_mapcore.bash 12.4.0-MapBench-beta2
   ```

# WMTS LAYER SET
VITE_WMTS_LAYERS_LIST = "WB_2025_R12"

# WMTS SERVER CRS
VITE_WMTS_TILING_SCHEME="GoogleMapsCompatible"   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   
   Navigate to `http://localhost:5173`

## 🔑 API Keys

| Service | Required | Get Your Key |
|---------|----------|--------------|
| **Mapbox** | ✅ Yes | [account.mapbox.com](https://account.mapbox.com/access-tokens/) |
| **Google Maps** | ✅ Yes | [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) |
| **ESRI ArcGIS** | ✅ Yes | [developers.arcgis.com](https://developers.arcgis.com/documentation/mapping-apis-and-services/security/api-keys/) |
| **Cesium Ion** | Optional | [cesium.com/ion/tokens](https://cesium.com/ion/tokens) |
| **MapTiler** | Optional | [maptiler.com/cloud](https://www.maptiler.com/cloud/) |
| **MapCore JFROG** | Yes | |Contact MapCore's team for token|(https://mapcore.jfrog.io)

### ESRI ArcGIS API Setup

To use ESRI ArcGIS basemaps and services, you need to:

1. **Create an ArcGIS Developer Account** (free): [developers.arcgis.com/sign-up](https://developers.arcgis.com/sign-up)
2. **Create an API Key**:
   - Go to your [ArcGIS Developer Dashboard](https://developers.arcgis.com/dashboard/)
   - Navigate to "API Keys" in the left sidebar
   - Click "Create a new API key"
   - Give it a name (e.g., "Map Bench")
   - Set usage limits if desired
   - Copy the API key
3. **Add to `.env` file**:
   ```env
   VITE_ESRI_API_KEY=your_esri_api_key_here
   ```

For more details, see the [ESRI API Keys Documentation](https://developers.arcgis.com/documentation/mapping-apis-and-services/security/api-keys/).

### Google Maps API Setup

To use Google Photorealistic 3D Tiles, enable these APIs in Google Cloud Console:
- Map Tiles API
- Maps JavaScript API


## Create your own integration server
The integration server enables other computers activate the application in it's current
state to assest the benchmarks. In order to do so, the content of the project is built into a docker that runs a secured NGINX server configured to run with your application.

To do so, you are required to:
- create a certification and private key pair or use an existing one
- Build and run the NGINX docker

### Create a docker certification 
In bash - do the following:
```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 365 \
  -subj "/CN=273.36.209.239" # Replace with your server DNS name or address
```

### Copy a valid docker certification
```bash
mkdir -p certs
cp `your_private_key` certs/server.key
cp `your_certificate` certs/server.crt
```

### Build and run the docker for the first time
``` bash
./scripts/build-integration.sh --clean
```
The docker will be up - you can see it with the command
```bash
docker ps
```

### start and stop the docker
```bash
docker compose up -d  # starts the docker
docker compose down   # stops the docker
```

### Run the application from the integration server
- **Local machine**  : `http://localhost:8080`
- **Remote machine** : `https://name_or_address:8443`

**Note**, when running https with a server that it's certification that was issued from a non trusted source (like comoanies and private peoples that were not authrized.) The browser will warn you and you will need to approve it in order to proceed.

## 🏗️ Project Structure

```
map-bench/
├── src/
│   ├── App.jsx                 # Main application component
│   ├── main.jsx                # React entry point
│   ├── index.css               # Global styles
│   ├── components/
│   │   ├── LayersPanel.jsx     # Data layers control panel
│   │   ├── LocationSelector.jsx # Location selection sidebar
│   │   ├── MapToggle.jsx       # Map library switcher
│   │   ├── StatusBar.jsx       # Status bar (tile count, etc.)
│   │   └── ViewModeToggle.jsx  # 2D/3D toggle
│   ├── lib/mapcore
|   |   ├── mc-api.tsx          # MapCore's base component plugin for JavaScript/TypeScript
|   |   ├── mc-callbacks.tsx    # MapCore's base asynchronous plugin
|   |   ├── mc-EditMode.tsx     # MapCore's Object world editor logic
|   |   └── utils.tsx           # MapCore's additional utility functions
│   ├── maps/
│   │   ├── MapBox.jsx          # Mapbox GL JS implementation
│   │   ├── MapLibre.jsx        # MapLibre GL implementation
│   │   ├── MapESRI.jsx         # ArcGIS/ESRI implementation
│   │   └── MapCesium.jsx       # CesiumJS implementation
|   ├── types/
|   |   └── MapCore.d.ts        # MapCore's API typescript interfaces
│   └── utils/
│       ├── esriStyleConverter.js # Utilities for ESRI styles
│       └── mapStyleConfig.js   # Map style configurations
├── public/
│   ├── data/                   # GeoJSON data files
│   ├── package/                
│   |   ├── MapCore.js          # MapCore API JavaScrip library
|   |   ├── MapCore.wasm        # MapCore API Web Assembly
|   |   ├── MapCore.js.symbols  # MapCore API Symbols
|   |   ├── MapCore.map         # MapCore API Symbol Mapper
|   |   ├── MapCoreSymbology*.zip # Uses for NATO 2525 and US DOD App6D Symbyology standards
│   ├── sprites/                # Map sprites
│   ├── map-style.json          # Custom map style definition
│   └── favicon.svg
├── scripts/
|   ├── build-integration.sh    # Builds an integration environment
│   ├── fetch-power-lines.js    # Script to fetch power lines data
│   └── fetch-religious-buildings.js # Script to fetch religious buildings data
├── index.html
├── package.json
├── Dockerfile                  # Integration server docker builder
├── docker-compose.yml          # Integration server loader / unloader
├── nginx.conf                  # Integration server NGINX configuration file
├── vite.config.js
├── .env.example                # Environment variables template
└── .gitignore
```

## 🛠️ Tech Stack

### Core
- **React 18** - UI framework
- **Vite 6** - Build tool and dev server

### Mapping Libraries
- **Mapbox GL JS 3.8** - WebGL maps
- **MapLibre GL 4.7** - Open-source WebGL maps
- **ArcGIS JS SDK 4.34** - ESRI mapping platform
- **CesiumJS 1.129** - 3D globe visualization
- **MapCore 4.12.0-MapBench-beta2** - MapCore API version

### 3D Tiles
- **deck.gl 9.1** - Large-scale data visualization
- **loaders.gl 4.3** - 3D Tiles and glTF loading

## 📝 Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## 🎮 Usage

1. **Select a map library** using the toggle bar at the top center
2. **Choose 2D or 3D mode** with the button in the top-left corner
3. **Pick a location** from the sidebar on the right
4. **Navigate the map** using mouse/touch controls:
   - Left-click + drag: Pan/Rotate
   - Right-click + drag: Tilt (pitch)
   - Scroll wheel: Zoom

## 🔧 Camera Synchronization

When switching between map libraries, the camera position is preserved:
- Center coordinates (longitude, latitude)
- Zoom level
- Pitch (tilt angle)
- Bearing (rotation)

This allows for direct visual comparison between renderers.

## 📄 License

MIT License - feel free to use this project for learning and benchmarking purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Add new locations
- Improve performance

## 📧 Contact

Created by [@moshew](https://github.com/moshew)

---

**Note:** This project is for benchmarking and educational purposes. Make sure to comply with the terms of service of each mapping provider.
