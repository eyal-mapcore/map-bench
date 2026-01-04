/**
 * ESRI Style Converter
 * Converts MapLibre/Mapbox Style Specification to ESRI ArcGIS renderers and symbols
 */

import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer'
import UniqueValueRenderer from '@arcgis/core/renderers/UniqueValueRenderer'
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D'
import IconSymbol3DLayer from '@arcgis/core/symbols/IconSymbol3DLayer'
import LineSymbol3D from '@arcgis/core/symbols/LineSymbol3D'
import PathSymbol3DLayer from '@arcgis/core/symbols/PathSymbol3DLayer'
import LabelSymbol3D from '@arcgis/core/symbols/LabelSymbol3D'
import TextSymbol3DLayer from '@arcgis/core/symbols/TextSymbol3DLayer'
import LabelClass from '@arcgis/core/layers/support/LabelClass'
import LineCallout3D from '@arcgis/core/symbols/callouts/LineCallout3D'
import { DEFAULT_RELIGION_ICONS, getIconUrl } from './mapStyleConfig'

// ============================================================================
// ESRI Adjustment Factors
// These multipliers/offsets adjust MapLibre style values for ESRI rendering
// ============================================================================

// Circle size multipliers per zoom level (ESRI needs larger circles for visibility)
// Applied to map-style circle-radius values
const ESRI_CIRCLE_SIZE_MULTIPLIERS = {
  zoomedOut: 1.0,   // zoom 10: 4 * 1.0 = 4
  medium: 1.5,      // zoom 14: 6 * 1.5 = 9
  zoomedIn: 1.2     // zoom 18: 10 * 1.2 = 12
}

// Stroke width multiplier (ESRI renders strokes thicker, so reduce)
const ESRI_STROKE_WIDTH_MULTIPLIER = 0.47  // 1.5 * 0.47 ≈ 0.7

// Label font size multiplier (relative to style's minimum text-size)
const ESRI_LABEL_FONT_SIZE_MULTIPLIER = 0.9  // 10 * 0.9 = 9

// Zoom offset for labels (ESRI shows labels at higher zoom than MapLibre)
const ESRI_LABEL_MINZOOM_OFFSET = 2  // 14 + 2 = 16

// Zoom offset for icons (ESRI shows icons at higher zoom than MapLibre)
const ESRI_ICON_MINZOOM_OFFSET = 2  // 12 + 2 = 14

// Power line size multipliers per scale range (ESRI 3D needs larger lines)
// These create scale-responsive line widths for 3D terrain visibility
const ESRI_POWER_LINE_MULTIPLIERS = {
  close: 1.0,      // scale 500: base * 1.0 = 2
  near: 3.0,       // scale 2000: base * 3.0 = 6
  medium: 10.0,    // scale 10000: base * 10.0 = 20
  far: 40.0,       // scale 50000: base * 40.0 = 80
  veryFar: 120.0,  // scale 200000: base * 120.0 = 240
  distant: 300.0   // scale 500000: base * 300.0 = 600
}

// Base power line width from style (zoom 10 = 2px)
const POWER_LINE_BASE_WIDTH = 2

// ============================================================================
// Icon paths for religious buildings (imported from shared config)
// ============================================================================
export const RELIGION_ICONS = DEFAULT_RELIGION_ICONS

// Height for floating religious icons above buildings (meters) in 3D mode
export const RELIGIOUS_ICON_HEIGHT_3D = 50

// ============================================================================
// Zoom/Scale Conversion
// ============================================================================

// Convert Mapbox zoom to ESRI scale (approximate)
// Mapbox uses 512px tiles, so zoom level is 1 less than standard (Google/ESRI) for same scale
export function zoomToScale(zoom) {
  return 591657550.5 / Math.pow(2, zoom + 1)
}

// Convert ESRI scale to Mapbox zoom (approximate)
// Mapbox uses 512px tiles, so zoom level is 1 less than standard (Google/ESRI) for same scale
export function scaleToZoom(scale) {
  return Math.log2(591657550.5 / scale) - 1
}

// ============================================================================
// Color Conversion
// ============================================================================

// Helper: Convert hex color to ESRI color array [r, g, b, a]
// opacity must be provided explicitly (no default)
export function hexToColor(hex, opacity) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) {
    // Invalid hex - return undefined to indicate error
    return undefined
  }
  const alpha = opacity !== undefined ? opacity * 255 : 255
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    alpha
  ]
}

// ============================================================================
// Circle Size Stops Parsing
// ============================================================================

// Parse MapLibre/Mapbox interpolate expression and return zoom-to-size stops
// Input: ["interpolate", ["linear"], ["zoom"], z1, radius1, z2, radius2, ...]
// Output: Array of [scale, size] pairs sorted by scale descending
// Applies ESRI multipliers to adjust sizes for ESRI rendering
// Note: ESRI IconSymbol3DLayer uses "size" which corresponds to radius, not diameter
export function parseCircleRadiusStops(radiusExpr) {
  if (!Array.isArray(radiusExpr) || radiusExpr[0] !== 'interpolate') {
    // Not an interpolate expression - return undefined
    return undefined
  }
  
  // Parse zoom-value pairs starting at index 3
  const stops = []
  for (let i = 3; i < radiusExpr.length; i += 2) {
    const zoom = radiusExpr[i]
    const radius = radiusExpr[i + 1]
    
    // Apply ESRI multiplier based on zoom level
    let multiplier
    if (zoom <= 10) {
      multiplier = ESRI_CIRCLE_SIZE_MULTIPLIERS.zoomedOut
    } else if (zoom <= 14) {
      multiplier = ESRI_CIRCLE_SIZE_MULTIPLIERS.medium
    } else {
      multiplier = ESRI_CIRCLE_SIZE_MULTIPLIERS.zoomedIn
    }
    
    // Apply multiplier to radius (ESRI size = radius * multiplier)
    const size = radius * multiplier
    stops.push([zoomToScale(zoom), size])
  }
  
  // Sort by scale descending (zoomed out first)
  return stops.sort((a, b) => b[0] - a[0])
}

// Interpolate size from stops based on current scale
export function getInterpolatedSize(scale, stops) {
  if (!stops || stops.length === 0) {
    // No stops provided - this should not happen if style is valid
    return undefined
  }
  
  // stops are sorted by scale descending: [[largeScale, smallSize], ..., [smallScale, largeSize]]
  if (scale >= stops[0][0]) return stops[0][1]
  if (scale <= stops[stops.length - 1][0]) return stops[stops.length - 1][1]
  
  for (let i = 0; i < stops.length - 1; i++) {
    const [scale1, size1] = stops[i]
    const [scale2, size2] = stops[i + 1]
    if (scale <= scale1 && scale >= scale2) {
      // Linear interpolation
      const t = (scale - scale1) / (scale2 - scale1)
      return size1 + t * (size2 - size1)
    }
  }
  return stops[0][1]
}

// ============================================================================
// Symbol Creation
// ============================================================================

// Helper: Create symbol with circle background + icon overlay
// baseSize is the reference size that will be scaled by visual variables
// is3D adds elevation with callout line
// All parameters must be provided explicitly
export function createReligiousSymbol(color, religion, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, is3D) {
  const iconUrl = getIconUrl(RELIGION_ICONS, religion)
  
  const symbolConfig = {
    symbolLayers: [
      // Background circle
      new IconSymbol3DLayer({
        size: baseSize,
        resource: { primitive: 'circle' },
        material: { color: hexToColor(color, circleOpacity) },
        outline: { color: hexToColor(circleStrokeColor, 1), size: circleStrokeWidth }
      }),
      // Icon overlay (slightly smaller than circle)
      new IconSymbol3DLayer({
        size: baseSize * 0.7,
        resource: { href: iconUrl },
        anchor: 'center'
      })
    ]
  }
  
  // Add callout for 3D mode
  if (is3D) {
    symbolConfig.verticalOffset = {
      screenLength: RELIGIOUS_ICON_HEIGHT_3D,
      maxWorldLength: RELIGIOUS_ICON_HEIGHT_3D,
      minWorldLength: 20
    }
    symbolConfig.callout = new LineCallout3D({
      size: 2,
      color: [255, 255, 255, 200],
      border: null
    })
  }
  
  return new PointSymbol3D(symbolConfig)
}

// Helper: Create circle-only symbol (no icon) for lower zoom levels
// is3D adds elevation with callout line
// All parameters must be provided explicitly
export function createCircleOnlySymbol(color, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, is3D) {
  const symbolConfig = {
    symbolLayers: [
      new IconSymbol3DLayer({
        size: baseSize,
        resource: { primitive: 'circle' },
        material: { color: hexToColor(color, circleOpacity) },
        outline: { color: hexToColor(circleStrokeColor, 1), size: circleStrokeWidth }
      })
    ]
  }
  
  // Add callout for 3D mode
  if (is3D) {
    symbolConfig.verticalOffset = {
      screenLength: RELIGIOUS_ICON_HEIGHT_3D,
      maxWorldLength: RELIGIOUS_ICON_HEIGHT_3D,
      minWorldLength: 20
    }
    symbolConfig.callout = new LineCallout3D({
      size: 2,
      color: [255, 255, 255, 200],
      border: null
    })
  }
  
  return new PointSymbol3D(symbolConfig)
}

// ============================================================================
// Label Class Creation
// ============================================================================

// Helper: Parse text-size from style (interpolate expression or fixed value)
function getMinTextSize(textSizeExpr) {
  if (!textSizeExpr) {
    return undefined
  }
  
  if (typeof textSizeExpr === 'number') {
    return textSizeExpr
  }
  
  // Parse interpolate expression: ["interpolate", ["linear"], ["zoom"], z1, size1, z2, size2, ...]
  if (Array.isArray(textSizeExpr) && textSizeExpr[0] === 'interpolate') {
    // Return the first (minimum) size value
    return textSizeExpr[4]
  }
  
  return undefined
}

// Helper: Create label class from MapLibre style layer
// All values are derived from the style layer, with ESRI adjustments applied
export function createLabelClassFromStyle(labelLayer) {
  if (!labelLayer) return null
  
  // Get minzoom from style and apply ESRI offset
  const styleMinZoom = labelLayer.minzoom
  if (styleMinZoom === undefined) {
    console.warn('Label layer missing minzoom')
    return null
  }
  const esriMinZoom = styleMinZoom + ESRI_LABEL_MINZOOM_OFFSET
  
  // Get paint properties - must be defined in style
  const textColor = labelLayer.paint?.['text-color']
  const haloColor = labelLayer.paint?.['text-halo-color']
  const haloWidth = labelLayer.paint?.['text-halo-width']
  
  if (textColor === undefined) {
    console.warn('Label layer missing text-color')
    return null
  }
  if (haloColor === undefined) {
    console.warn('Label layer missing text-halo-color')
    return null
  }
  if (haloWidth === undefined) {
    console.warn('Label layer missing text-halo-width')
    return null
  }
  
  // Get font size from style and apply ESRI multiplier
  const textSizeExpr = labelLayer.layout?.['text-size']
  const minTextSize = getMinTextSize(textSizeExpr)
  if (minTextSize === undefined) {
    console.warn('Label layer missing text-size')
    return null
  }
  const esriFontSize = Math.round(minTextSize * ESRI_LABEL_FONT_SIZE_MULTIPLIER)
  
  return new LabelClass({
    symbol: new LabelSymbol3D({
      symbolLayers: [
        new TextSymbol3DLayer({
          material: { color: hexToColor(textColor, 1) },
          halo: { color: hexToColor(haloColor, 1), size: haloWidth },
          font: { size: esriFontSize, family: 'Arial' },
          size: esriFontSize
        })
      ]
    }),
    labelPlacement: 'above-center',
    labelExpressionInfo: {
      expression: '$feature.name'
    },
    minScale: zoomToScale(esriMinZoom),
    maxScale: 0
  })
}

// ============================================================================
// Renderer Creation from Style Layer
// ============================================================================

// Helper: Parse Mapbox/MapLibre style layer and create ESRI renderers
// Returns { rendererWithIcons, rendererWithoutIcons, rendererWithIcons3D, rendererWithoutIcons3D, iconMinScale, styleConfig }
export function createRendererFromStyleLayer(styleLayer, layerType, iconLayer) {
  if (layerType === 'line') {
    const lineColor = styleLayer.paint?.['line-color']
    const lineOpacity = styleLayer.paint?.['line-opacity']
    
    if (lineColor === undefined) {
      console.warn('Line layer missing line-color')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    if (lineOpacity === undefined) {
      console.warn('Line layer missing line-opacity')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    
    // Get base width from style (first zoom level value)
    const lineWidthExpr = styleLayer.paint?.['line-width']
    let baseWidth = POWER_LINE_BASE_WIDTH
    if (Array.isArray(lineWidthExpr) && lineWidthExpr[0] === 'interpolate') {
      baseWidth = lineWidthExpr[4] // First size value
    }
    
    const renderer = new SimpleRenderer({
      symbol: new LineSymbol3D({
        symbolLayers: [
          new PathSymbol3DLayer({
            profile: 'circle',
            width: baseWidth,
            height: baseWidth,
            material: { color: hexToColor(lineColor, lineOpacity) },
            cap: 'round',
            join: 'round'
          })
        ]
      })
    })
    return { rendererWithIcons: renderer, rendererWithoutIcons: renderer, rendererWithIcons3D: renderer, rendererWithoutIcons3D: renderer, iconMinScale: null, sizeStops: null }
  }
  
  if (layerType === 'circle') {
    const circleColor = styleLayer.paint?.['circle-color']
    const circleOpacity = styleLayer.paint?.['circle-opacity']
    const circleStrokeColor = styleLayer.paint?.['circle-stroke-color']
    const circleStrokeWidthFromStyle = styleLayer.paint?.['circle-stroke-width']
    const circleRadius = styleLayer.paint?.['circle-radius']
    
    if (circleColor === undefined) {
      console.warn('Circle layer missing circle-color')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    if (circleOpacity === undefined) {
      console.warn('Circle layer missing circle-opacity')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    if (circleStrokeColor === undefined) {
      console.warn('Circle layer missing circle-stroke-color')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    if (circleStrokeWidthFromStyle === undefined) {
      console.warn('Circle layer missing circle-stroke-width')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    
    // Apply ESRI stroke width multiplier
    const circleStrokeWidth = circleStrokeWidthFromStyle * ESRI_STROKE_WIDTH_MULTIPLIER
    
    // Parse circle-radius interpolate expression for scale-dependent sizing
    const sizeStops = parseCircleRadiusStops(circleRadius)
    if (!sizeStops) {
      console.warn('Circle layer missing or invalid circle-radius interpolate expression')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    
    // Check if we have an icon layer and get its minzoom
    const hasIcons = iconLayer?.layout?.['icon-image'] !== undefined
    let iconMinScale = null
    if (hasIcons) {
      const iconMinZoomFromStyle = iconLayer.minzoom
      if (iconMinZoomFromStyle === undefined) {
        console.warn('Icon layer missing minzoom')
      } else {
        // Apply ESRI zoom offset
        const esriIconMinZoom = iconMinZoomFromStyle + ESRI_ICON_MINZOOM_OFFSET
        iconMinScale = zoomToScale(esriIconMinZoom)
      }
    }
    
    // Base size for symbols (middle stop value)
    const baseSize = sizeStops[Math.floor(sizeStops.length / 2)][1]
    
    // Parse match expression: ["match", ["get", "field"], value1, color1, value2, color2, ..., defaultColor]
    if (Array.isArray(circleColor) && circleColor[0] === 'match') {
      const fieldExpr = circleColor[1]
      const field = Array.isArray(fieldExpr) && fieldExpr[0] === 'get' ? fieldExpr[1] : undefined
      if (field === undefined) {
        console.warn('Circle layer match expression missing field')
        return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
      }
      
      const uniqueValueInfosWithIcons = []
      const uniqueValueInfosWithoutIcons = []
      const uniqueValueInfosWithIcons3D = []
      const uniqueValueInfosWithoutIcons3D = []
      
      // Parse value-color pairs
      for (let i = 2; i < circleColor.length - 1; i += 2) {
        const value = circleColor[i]
        const color = circleColor[i + 1]
        
        // 2D mode - with icons (for zoomed in)
        if (hasIcons) {
          uniqueValueInfosWithIcons.push({
            value: value,
            symbol: createReligiousSymbol(color, value, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, false)
          })
        }
        
        // 2D mode - without icons (for zoomed out)
        uniqueValueInfosWithoutIcons.push({
          value: value,
          symbol: createCircleOnlySymbol(color, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, false)
        })
        
        // 3D mode - with icons and callout (for zoomed in)
        if (hasIcons) {
          uniqueValueInfosWithIcons3D.push({
            value: value,
            symbol: createReligiousSymbol(color, value, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, true)
          })
        }
        
        // 3D mode - without icons but with callout (for zoomed out)
        uniqueValueInfosWithoutIcons3D.push({
          value: value,
          symbol: createCircleOnlySymbol(color, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, true)
        })
      }
      
      const defaultColor = circleColor[circleColor.length - 1]
      
      console.log(`ESRI UniqueValueRenderer: field="${field}", ${uniqueValueInfosWithoutIcons.length} values, icons=${hasIcons ? 'yes' : 'no'}, sizeStops=${sizeStops.length}`)
      
      // Store style config for dynamic size updates (visual variables don't work with IconSymbol3DLayer)
      const styleConfig = {
        field,
        defaultColor,
        circleOpacity,
        circleStrokeColor, 
        circleStrokeWidth,
        hasIcons,
        sizeStops
      }
      
      // 2D Renderers (created with base size, will be updated dynamically)
      const rendererWithIcons = hasIcons ? new UniqueValueRenderer({
        field: field,
        uniqueValueInfos: uniqueValueInfosWithIcons,
        defaultSymbol: createReligiousSymbol(defaultColor, 'default', circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, false)
      }) : null
      
      const rendererWithoutIcons = new UniqueValueRenderer({
        field: field,
        uniqueValueInfos: uniqueValueInfosWithoutIcons,
        defaultSymbol: createCircleOnlySymbol(defaultColor, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, false)
      })
      
      // 3D Renderers (with callout lines)
      const rendererWithIcons3D = hasIcons ? new UniqueValueRenderer({
        field: field,
        uniqueValueInfos: uniqueValueInfosWithIcons3D,
        defaultSymbol: createReligiousSymbol(defaultColor, 'default', circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, true)
      }) : null
      
      const rendererWithoutIcons3D = new UniqueValueRenderer({
        field: field,
        uniqueValueInfos: uniqueValueInfosWithoutIcons3D,
        defaultSymbol: createCircleOnlySymbol(defaultColor, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, true)
      })
      
      return { 
        rendererWithIcons: rendererWithIcons !== null ? rendererWithIcons : rendererWithoutIcons, 
        rendererWithoutIcons, 
        rendererWithIcons3D: rendererWithIcons3D !== null ? rendererWithIcons3D : rendererWithoutIcons3D,
        rendererWithoutIcons3D,
        iconMinScale: hasIcons ? iconMinScale : null,
        styleConfig
      }
    }
    
    // Simple color (not a match expression)
    if (typeof circleColor !== 'string') {
      console.warn('Circle layer circle-color must be a string or match expression')
      return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
    }
    
    const styleConfig = {
      field: null,
      defaultColor: circleColor,
      circleOpacity,
      circleStrokeColor, 
      circleStrokeWidth,
      hasIcons: false,
      sizeStops
    }
    
    const simpleRenderer = new SimpleRenderer({
      symbol: createCircleOnlySymbol(circleColor, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, false)
    })
    const simpleRenderer3D = new SimpleRenderer({
      symbol: createCircleOnlySymbol(circleColor, circleOpacity, circleStrokeColor, circleStrokeWidth, baseSize, true)
    })
    return { rendererWithIcons: simpleRenderer, rendererWithoutIcons: simpleRenderer, rendererWithIcons3D: simpleRenderer3D, rendererWithoutIcons3D: simpleRenderer3D, iconMinScale: null, styleConfig }
  }
  
  return { rendererWithIcons: null, rendererWithoutIcons: null, rendererWithIcons3D: null, rendererWithoutIcons3D: null, iconMinScale: null, styleConfig: null }
}

// ============================================================================
// Dynamic Renderer Creation
// ============================================================================

// Helper: Create religious buildings renderer dynamically with size
export function createReligiousRenderer(styleConfig, colorMapping, showIcons, is3D, size) {
  const { field, defaultColor, circleOpacity, circleStrokeColor, circleStrokeWidth } = styleConfig
  
  if (showIcons && styleConfig.hasIcons) {
    // With icons
    const uniqueValueInfos = Object.entries(colorMapping).map(([religion, color]) => ({
      value: religion,
      symbol: createReligiousSymbol(color, religion, circleOpacity, circleStrokeColor, circleStrokeWidth, size, is3D)
    }))
    return new UniqueValueRenderer({
      field: field,
      uniqueValueInfos,
      defaultSymbol: createReligiousSymbol(defaultColor, 'default', circleOpacity, circleStrokeColor, circleStrokeWidth, size, is3D)
    })
  } else {
    // Circles only
    const uniqueValueInfos = Object.entries(colorMapping).map(([religion, color]) => ({
      value: religion,
      symbol: createCircleOnlySymbol(color, circleOpacity, circleStrokeColor, circleStrokeWidth, size, is3D)
    }))
    return new UniqueValueRenderer({
      field: field,
      uniqueValueInfos,
      defaultSymbol: createCircleOnlySymbol(defaultColor, circleOpacity, circleStrokeColor, circleStrokeWidth, size, is3D)
    })
  }
}

// ============================================================================
// Power Line Rendering
// ============================================================================

// Power lines size stops for scale-responsive rendering
// Derived from style's line-width base value with ESRI multipliers
export function createPowerLineSizeStops(lineWidthExpr) {
  // Get base width from style (first zoom level value)
  let baseWidth = POWER_LINE_BASE_WIDTH
  if (Array.isArray(lineWidthExpr) && lineWidthExpr[0] === 'interpolate') {
    baseWidth = lineWidthExpr[4] // First size value
  }
  
  return [
    [500, baseWidth * ESRI_POWER_LINE_MULTIPLIERS.close],
    [2000, baseWidth * ESRI_POWER_LINE_MULTIPLIERS.near],
    [10000, baseWidth * ESRI_POWER_LINE_MULTIPLIERS.medium],
    [50000, baseWidth * ESRI_POWER_LINE_MULTIPLIERS.far],
    [200000, baseWidth * ESRI_POWER_LINE_MULTIPLIERS.veryFar],
    [500000, baseWidth * ESRI_POWER_LINE_MULTIPLIERS.distant]
  ]
}

// Default power line size stops (using default base width)
export const POWER_LINE_SIZE_STOPS = [
  [500, POWER_LINE_BASE_WIDTH * ESRI_POWER_LINE_MULTIPLIERS.close],
  [2000, POWER_LINE_BASE_WIDTH * ESRI_POWER_LINE_MULTIPLIERS.near],
  [10000, POWER_LINE_BASE_WIDTH * ESRI_POWER_LINE_MULTIPLIERS.medium],
  [50000, POWER_LINE_BASE_WIDTH * ESRI_POWER_LINE_MULTIPLIERS.far],
  [200000, POWER_LINE_BASE_WIDTH * ESRI_POWER_LINE_MULTIPLIERS.veryFar],
  [500000, POWER_LINE_BASE_WIDTH * ESRI_POWER_LINE_MULTIPLIERS.distant]
]

// Get power line size based on current scale
export function getPowerLineSize(scale) {
  const stops = POWER_LINE_SIZE_STOPS
  
  if (scale <= stops[0][0]) return stops[0][1]
  if (scale >= stops[stops.length - 1][0]) return stops[stops.length - 1][1]
  
  for (let i = 0; i < stops.length - 1; i++) {
    if (scale >= stops[i][0] && scale < stops[i + 1][0]) {
      const t = (scale - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return stops[i][1] + t * (stops[i + 1][1] - stops[i][1])
    }
  }
  return stops[0][1]
}

// Create power line renderer with given size
// lineColor and lineOpacity must be provided from style
export function createPowerLineRenderer(size, lineColor, lineOpacity) {
  if (lineColor === undefined || lineOpacity === undefined) {
    // Use fallback values from style defaults
    lineColor = '#ffdc00'
    lineOpacity = 0.8
  }
  
  return new SimpleRenderer({
    symbol: new LineSymbol3D({
      symbolLayers: [
        new PathSymbol3DLayer({
          profile: 'circle',
          width: size,
          height: size,
          material: { color: hexToColor(lineColor, lineOpacity) },
          cap: 'round',
          join: 'round'
        })
      ]
    })
  })
}
