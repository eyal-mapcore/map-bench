// Map style configuration - loaded from map-style.json
// This provides shared access to style metadata including icon URLs

const MAP_STYLE_URL = '/map-style.json'

// Cached style data
let cachedStyle = null
let loadingPromise = null

// Load and cache the style JSON
export async function loadMapStyle() {
  if (cachedStyle) return cachedStyle
  
  if (loadingPromise) return loadingPromise
  
  loadingPromise = fetch(MAP_STYLE_URL)
    .then(res => res.json())
    .then(style => {
      cachedStyle = style
      return style
    })
  
  return loadingPromise
}

// Get religion icon URLs from style metadata
export function getReligionIconUrls(style) {
  return style?.metadata?.religionIcons || {
    jewish: '/sprites/jewish.svg',
    christian: '/sprites/christian.svg',
    muslim: '/sprites/muslim.svg',
    buddhist: '/sprites/buddhist.svg',
    hindu: '/sprites/hindu.svg',
    shinto: '/sprites/shinto.svg',
    default: '/sprites/default.svg'
  }
}

// Default icon URLs - can be used synchronously before style loads
export const DEFAULT_RELIGION_ICONS = {
  jewish: '/sprites/jewish.svg',
  christian: '/sprites/christian.svg',
  muslim: '/sprites/muslim.svg',
  buddhist: '/sprites/buddhist.svg',
  hindu: '/sprites/hindu.svg',
  shinto: '/sprites/shinto.svg',
  default: '/sprites/default.svg'
}

// Get icon URL for a specific religion
export function getIconUrl(icons, religion) {
  return icons[religion] || icons.default
}

// --- Caching for Resources ---

// Cached religious buildings data
let cachedReligiousBuildings = null
let religiousBuildingsPromise = null

export async function loadReligiousBuildings() {
  if (cachedReligiousBuildings) return cachedReligiousBuildings
  if (religiousBuildingsPromise) return religiousBuildingsPromise

  religiousBuildingsPromise = fetch('/data/religious-buildings.geojson')
    .then(res => res.json())
    .then(data => {
      cachedReligiousBuildings = data
      return data
    })
    .catch(err => {
      console.error('Failed to load religious buildings:', err)
      religiousBuildingsPromise = null // Reset promise on error so we can try again
      throw err
    })
    
  return religiousBuildingsPromise
}

// Cached loaded images (HTMLImageElement)
const cachedImages = {}
const imageLoadingPromises = {}

export async function loadIconImage(url) {
  if (cachedImages[url]) return cachedImages[url]
  if (imageLoadingPromises[url]) return imageLoadingPromises[url]

  imageLoadingPromises[url] = new Promise((resolve, reject) => {
    const img = new Image(24, 24)
    img.src = url
    img.onload = () => {
      cachedImages[url] = img
      resolve(img)
    }
    img.onerror = (e) => {
      console.error(`Failed to load image: ${url}`, e)
      delete imageLoadingPromises[url] // Reset promise on error
      reject(e)
    }
  })

  return imageLoadingPromises[url]
}

// Cached power lines data
let cachedPowerLines = null
let powerLinesPromise = null

export async function loadPowerLines() {
  if (cachedPowerLines) return cachedPowerLines
  if (powerLinesPromise) return powerLinesPromise

  powerLinesPromise = fetch('/data/power-lines.geojson')
    .then(res => res.json())
    .then(data => {
      cachedPowerLines = data
      return data
    })
    .catch(err => {
      console.error('Failed to load power lines:', err)
      powerLinesPromise = null
      throw err
    })
    
  return powerLinesPromise
}

