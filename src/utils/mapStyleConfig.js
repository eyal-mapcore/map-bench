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

