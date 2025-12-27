/**
 * Script to fetch power lines from OpenStreetMap using Overpass API
 * Fetches data only for regions defined in the app (LocationSelector.jsx):
 *   - Israel: One bbox for the whole country
 *   - North America: New York, San Francisco, Las Vegas, Los Angeles
 *   - Europe: London, Paris, Rome, Barcelona
 *   - Asia: Tokyo, Dubai, Singapore, Hong Kong
 * 
 * Saves combined result to public/data/power-lines.geojson
 * 
 * Usage: node scripts/fetch-power-lines.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'power-lines.geojson')

// Regions based on app locations from LocationSelector.jsx
// Bounding boxes format: [south, west, north, east]
// For Israel - one bbox for the whole country
// For other continents - city-specific regions with ~50km radius

const REGIONS = [
  // ישראל - כל המדינה
  { name: 'Israel', bbox: [29.4, 34.2, 33.4, 35.9] },
  
  // צפון אמריקה - לפי ערים
  { name: 'New-York', bbox: [40.4, -74.3, 41.0, -73.7] },        // ניו יורק
  { name: 'San-Francisco', bbox: [37.5, -122.6, 38.0, -122.1] }, // סן פרנסיסקו
  { name: 'Las-Vegas', bbox: [35.9, -115.4, 36.4, -114.9] },     // לאס וגאס
  { name: 'Los-Angeles', bbox: [33.7, -118.6, 34.4, -117.9] },   // לוס אנג'לס
  
  // אירופה - לפי ערים
  { name: 'London', bbox: [51.3, -0.5, 51.7, 0.3] },             // לונדון
  { name: 'Paris', bbox: [48.6, 2.0, 49.1, 2.6] },               // פריז
  { name: 'Rome', bbox: [41.7, 12.2, 42.1, 12.8] },              // רומא
  { name: 'Barcelona', bbox: [41.2, 1.9, 41.6, 2.4] },           // ברצלונה
  
  // אסיה - לפי ערים
  { name: 'Tokyo', bbox: [35.4, 139.4, 36.0, 140.0] },           // טוקיו
  { name: 'Dubai', bbox: [24.9, 54.9, 25.5, 55.6] },             // דובאי
  { name: 'Singapore', bbox: [1.1, 103.6, 1.5, 104.1] },         // סינגפור
  { name: 'Hong-Kong', bbox: [22.1, 113.8, 22.6, 114.4] },       // הונג קונג
]

// Build Overpass query for power lines in a bounding box
function buildQuery(bbox) {
  const [south, west, north, east] = bbox
  return `
    [out:json][timeout:180];
    (
      way["power"="line"](${south},${west},${north},${east});
      way["power"="minor_line"](${south},${west},${north},${east});
      way["power"="cable"](${south},${west},${north},${east});
    );
    out geom;
  `
}

// Convert Overpass response to GeoJSON features
function overpassToGeoJSON(data) {
  const features = []
  
  if (!data.elements) return features
  
  for (const element of data.elements) {
    if (element.type === 'way' && element.geometry) {
      const coordinates = element.geometry.map(node => [node.lon, node.lat])
      
      // Skip if less than 2 points
      if (coordinates.length < 2) continue
      
      features.push({
        type: 'Feature',
        properties: {
          id: element.id,
          power: element.tags?.power || 'line',
          voltage: element.tags?.voltage || 'unknown',
          cables: element.tags?.cables || 'unknown',
          operator: element.tags?.operator || 'unknown',
          name: element.tags?.name || element.tags?.ref || `Power Line ${element.id}`
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      })
    }
  }
  
  return features
}

// Fetch power lines for a region with retry logic
async function fetchRegion(region, retries = 3) {
  const query = buildQuery(region.bbox)
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  Fetching ${region.name} (attempt ${attempt}/${retries})...`)
      
      const response = await fetch(OVERPASS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      })
      
      if (response.status === 429) {
        console.log(`  Rate limited, waiting 60 seconds...`)
        await sleep(60000)
        continue
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      const features = overpassToGeoJSON(data)
      console.log(`  ✓ ${region.name}: ${features.length} power lines`)
      
      return features
    } catch (error) {
      console.error(`  ✗ ${region.name} failed: ${error.message}`)
      if (attempt < retries) {
        console.log(`  Waiting 30 seconds before retry...`)
        await sleep(30000)
      }
    }
  }
  
  console.log(`  Skipping ${region.name} after ${retries} failed attempts`)
  return []
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('='.repeat(60))
  console.log('Power Lines Fetcher - OpenStreetMap Overpass API')
  console.log('='.repeat(60))
  console.log(`Regions to fetch: ${REGIONS.length}`)
  console.log(`Output file: ${OUTPUT_FILE}`)
  console.log('='.repeat(60))
  
  const allFeatures = []
  let successCount = 0
  let failCount = 0
  
  for (let i = 0; i < REGIONS.length; i++) {
    const region = REGIONS[i]
    console.log(`\n[${i + 1}/${REGIONS.length}] Processing ${region.name}...`)
    
    const features = await fetchRegion(region)
    allFeatures.push(...features)
    
    if (features.length > 0) {
      successCount++
    } else {
      failCount++
    }
    
    // Rate limiting: wait between requests
    if (i < REGIONS.length - 1) {
      console.log(`  Waiting 10 seconds before next region...`)
      await sleep(10000)
    }
  }
  
  // Create GeoJSON FeatureCollection
  const geoJSON = {
    type: 'FeatureCollection',
    metadata: {
      source: 'OpenStreetMap via Overpass API',
      generated: new Date().toISOString(),
      regions: REGIONS.length,
      successfulRegions: successCount,
      failedRegions: failCount
    },
    features: allFeatures
  }
  
  // Save to file
  console.log('\n' + '='.repeat(60))
  console.log('Saving GeoJSON file...')
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geoJSON), 'utf8')
  
  const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)
  
  console.log('='.repeat(60))
  console.log('DONE!')
  console.log(`Total power lines: ${allFeatures.length}`)
  console.log(`Successful regions: ${successCount}/${REGIONS.length}`)
  console.log(`File size: ${fileSizeMB} MB`)
  console.log(`Output: ${OUTPUT_FILE}`)
  console.log('='.repeat(60))
}

main().catch(console.error)

