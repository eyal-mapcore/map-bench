/**
 * Script to fetch religious buildings from OpenStreetMap using Overpass API
 * Fetches: synagogues, churches, mosques, monasteries, temples, and other places of worship
 * 
 * Regions based on app locations (LocationSelector.jsx):
 *   - Israel: Full country coverage
 *   - North America: New York, San Francisco, Las Vegas, Los Angeles
 *   - Europe: London, Paris, Rome, Barcelona
 *   - Asia: Tokyo, Dubai, Singapore, Hong Kong
 * 
 * Saves combined result to public/data/religious-buildings.geojson
 * 
 * Usage: node scripts/fetch-religious-buildings.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'religious-buildings.geojson')

// Regions based on app locations from LocationSelector.jsx
// Bounding boxes format: [south, west, north, east]
const REGIONS = [
  // ישראל - כל המדינה
  { name: 'Israel', bbox: [29.4, 34.2, 33.4, 35.9] },
  
  // צפון אמריקה - לפי ערים
  { name: 'New-York', bbox: [40.4, -74.3, 41.0, -73.7] },
  { name: 'San-Francisco', bbox: [37.5, -122.6, 38.0, -122.1] },
  { name: 'Las-Vegas', bbox: [35.9, -115.4, 36.4, -114.9] },
  { name: 'Los-Angeles', bbox: [33.7, -118.6, 34.4, -117.9] },
  
  // אירופה - לפי ערים
  { name: 'London', bbox: [51.3, -0.5, 51.7, 0.3] },
  { name: 'Paris', bbox: [48.6, 2.0, 49.1, 2.6] },
  { name: 'Rome', bbox: [41.7, 12.2, 42.1, 12.8] },
  { name: 'Barcelona', bbox: [41.2, 1.9, 41.6, 2.4] },
  
  // אסיה - לפי ערים
  { name: 'Tokyo', bbox: [35.4, 139.4, 36.0, 140.0] },
  { name: 'Dubai', bbox: [24.9, 54.9, 25.5, 55.6] },
  { name: 'Singapore', bbox: [1.1, 103.6, 1.5, 104.1] },
  { name: 'Hong-Kong', bbox: [22.1, 113.8, 22.6, 114.4] },
]

// Map religion tags to icons and display names
const RELIGION_MAPPING = {
  jewish: { icon: 'synagogue', nameHe: 'בית כנסת', nameEn: 'Synagogue' },
  christian: { icon: 'church', nameHe: 'כנסייה', nameEn: 'Church' },
  muslim: { icon: 'mosque', nameHe: 'מסגד', nameEn: 'Mosque' },
  buddhist: { icon: 'temple', nameHe: 'מקדש בודהיסטי', nameEn: 'Buddhist Temple' },
  hindu: { icon: 'temple', nameHe: 'מקדש הינדי', nameEn: 'Hindu Temple' },
  shinto: { icon: 'shrine', nameHe: 'מקדש שינטו', nameEn: 'Shinto Shrine' },
  sikh: { icon: 'temple', nameHe: 'גורדוורה', nameEn: 'Gurdwara' },
  bahai: { icon: 'temple', nameHe: 'מקדש בהאי', nameEn: 'Bahai Temple' },
  taoist: { icon: 'temple', nameHe: 'מקדש טאואיסטי', nameEn: 'Taoist Temple' },
  unknown: { icon: 'worship', nameHe: 'מבנה דת', nameEn: 'Place of Worship' }
}

// Build Overpass query for religious buildings in a bounding box
function buildQuery(bbox) {
  const [south, west, north, east] = bbox
  return `
    [out:json][timeout:180];
    (
      // Places of worship (nodes and ways)
      node["amenity"="place_of_worship"](${south},${west},${north},${east});
      way["amenity"="place_of_worship"](${south},${west},${north},${east});
      
      // Monasteries
      node["amenity"="monastery"](${south},${west},${north},${east});
      way["amenity"="monastery"](${south},${west},${north},${east});
      
      // Religious buildings by building type
      node["building"="church"](${south},${west},${north},${east});
      way["building"="church"](${south},${west},${north},${east});
      node["building"="synagogue"](${south},${west},${north},${east});
      way["building"="synagogue"](${south},${west},${north},${east});
      node["building"="mosque"](${south},${west},${north},${east});
      way["building"="mosque"](${south},${west},${north},${east});
      node["building"="temple"](${south},${west},${north},${east});
      way["building"="temple"](${south},${west},${north},${east});
      node["building"="shrine"](${south},${west},${north},${east});
      way["building"="shrine"](${south},${west},${north},${east});
      node["building"="chapel"](${south},${west},${north},${east});
      way["building"="chapel"](${south},${west},${north},${east});
      node["building"="cathedral"](${south},${west},${north},${east});
      way["building"="cathedral"](${south},${west},${north},${east});
      node["building"="monastery"](${south},${west},${north},${east});
      way["building"="monastery"](${south},${west},${north},${east});
    );
    out center;
  `
}

// Get religion type from tags
function getReligionType(tags) {
  if (!tags) return 'unknown'
  
  // Check religion tag first
  if (tags.religion) {
    const religion = tags.religion.toLowerCase()
    if (RELIGION_MAPPING[religion]) return religion
  }
  
  // Check building type as fallback
  if (tags.building) {
    const building = tags.building.toLowerCase()
    if (building === 'synagogue') return 'jewish'
    if (building === 'church' || building === 'cathedral' || building === 'chapel') return 'christian'
    if (building === 'mosque') return 'muslim'
    if (building === 'temple') {
      // Temple could be various religions, check denomination
      if (tags.denomination?.toLowerCase().includes('buddhist')) return 'buddhist'
      if (tags.denomination?.toLowerCase().includes('hindu')) return 'hindu'
    }
    if (building === 'shrine') return 'shinto'
    if (building === 'monastery') return 'christian' // Most monasteries in OSM are Christian
  }
  
  // Check denomination as last resort
  if (tags.denomination) {
    const denom = tags.denomination.toLowerCase()
    if (denom.includes('catholic') || denom.includes('orthodox') || denom.includes('protestant') || 
        denom.includes('lutheran') || denom.includes('baptist') || denom.includes('methodist') ||
        denom.includes('anglican') || denom.includes('presbyterian')) {
      return 'christian'
    }
  }
  
  return 'unknown'
}

// Convert Overpass response to GeoJSON features
function overpassToGeoJSON(data, regionName) {
  const features = []
  const seenIds = new Set()
  
  if (!data.elements) return features
  
  for (const element of data.elements) {
    // Skip duplicates
    if (seenIds.has(element.id)) continue
    seenIds.add(element.id)
    
    let lat, lon
    
    // Get coordinates - for ways, use center point
    if (element.type === 'node') {
      lat = element.lat
      lon = element.lon
    } else if (element.type === 'way' && element.center) {
      lat = element.center.lat
      lon = element.center.lon
    } else {
      continue // Skip elements without valid coordinates
    }
    
    if (!lat || !lon) continue
    
    const tags = element.tags || {}
    const religionType = getReligionType(tags)
    const religionInfo = RELIGION_MAPPING[religionType]
    
    features.push({
      type: 'Feature',
      properties: {
        id: element.id,
        type: element.type,
        name: tags.name || tags['name:en'] || tags['name:he'] || religionInfo.nameEn,
        nameHe: tags['name:he'] || tags.name || religionInfo.nameHe,
        nameEn: tags['name:en'] || tags.name || religionInfo.nameEn,
        religion: religionType,
        religionDisplay: religionInfo.nameHe,
        icon: religionInfo.icon,
        denomination: tags.denomination || '',
        building: tags.building || '',
        amenity: tags.amenity || '',
        address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' '),
        website: tags.website || tags['contact:website'] || '',
        phone: tags.phone || tags['contact:phone'] || '',
        region: regionName
      },
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      }
    })
  }
  
  return features
}

// Fetch religious buildings for a region with retry logic
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
      const features = overpassToGeoJSON(data, region.name)
      
      // Count by religion type
      const counts = {}
      features.forEach(f => {
        const religion = f.properties.religion
        counts[religion] = (counts[religion] || 0) + 1
      })
      
      console.log(`  ✓ ${region.name}: ${features.length} religious buildings`)
      if (Object.keys(counts).length > 0) {
        const countStr = Object.entries(counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
        console.log(`    Breakdown: ${countStr}`)
      }
      
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
  console.log('Religious Buildings Fetcher - OpenStreetMap Overpass API')
  console.log('='.repeat(60))
  console.log(`Regions to fetch: ${REGIONS.length}`)
  console.log(`Output file: ${OUTPUT_FILE}`)
  console.log('Types: Synagogues, Churches, Mosques, Monasteries, Temples, Shrines')
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
  
  // Remove duplicates (buildings might appear in overlapping regions)
  const uniqueFeatures = []
  const seenIds = new Set()
  for (const feature of allFeatures) {
    const id = feature.properties.id
    if (!seenIds.has(id)) {
      seenIds.add(id)
      uniqueFeatures.push(feature)
    }
  }
  
  // Count final totals by religion
  const finalCounts = {}
  uniqueFeatures.forEach(f => {
    const religion = f.properties.religion
    finalCounts[religion] = (finalCounts[religion] || 0) + 1
  })
  
  // Create GeoJSON FeatureCollection
  const geoJSON = {
    type: 'FeatureCollection',
    metadata: {
      source: 'OpenStreetMap via Overpass API',
      generated: new Date().toISOString(),
      description: 'Religious buildings: synagogues, churches, mosques, monasteries, temples',
      regions: REGIONS.length,
      successfulRegions: successCount,
      failedRegions: failCount,
      totalFeatures: uniqueFeatures.length,
      breakdown: finalCounts
    },
    features: uniqueFeatures
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  // Save to file
  console.log('\n' + '='.repeat(60))
  console.log('Saving GeoJSON file...')
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geoJSON), 'utf8')
  
  const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)
  
  console.log('='.repeat(60))
  console.log('DONE!')
  console.log(`Total religious buildings: ${uniqueFeatures.length}`)
  console.log(`Successful regions: ${successCount}/${REGIONS.length}`)
  console.log(`File size: ${fileSizeMB} MB`)
  console.log('\nBreakdown by type:')
  Object.entries(finalCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([religion, count]) => {
      const info = RELIGION_MAPPING[religion]
      console.log(`  ${info.nameHe} (${info.nameEn}): ${count}`)
    })
  console.log(`\nOutput: ${OUTPUT_FILE}`)
  console.log('='.repeat(60))
}

main().catch(console.error)


