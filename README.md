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
   VITE_CESIUM_TOKEN=your_cesium_token_here
   VITE_MAPTILER_KEY=your_maptiler_key_here
   ```

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
| **Cesium Ion** | Optional | [cesium.com/ion/tokens](https://cesium.com/ion/tokens) |
| **MapTiler** | Optional | [maptiler.com/cloud](https://www.maptiler.com/cloud/) |

### Google Maps API Setup

To use Google Photorealistic 3D Tiles, enable these APIs in Google Cloud Console:
- Map Tiles API
- Maps JavaScript API

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
│   ├── maps/
│   │   ├── MapBox.jsx          # Mapbox GL JS implementation
│   │   ├── MapLibre.jsx        # MapLibre GL implementation
│   │   ├── MapESRI.jsx         # ArcGIS/ESRI implementation
│   │   └── MapCesium.jsx       # CesiumJS implementation
│   └── utils/
│       ├── esriStyleConverter.js # Utilities for ESRI styles
│       └── mapStyleConfig.js   # Map style configurations
├── public/
│   ├── data/                   # GeoJSON data files
│   ├── sprites/                # Map sprites
│   ├── map-style.json          # Custom map style definition
│   └── favicon.svg
├── scripts/
│   ├── fetch-power-lines.js    # Script to fetch power lines data
│   └── fetch-religious-buildings.js # Script to fetch religious buildings data
├── index.html
├── package.json
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
