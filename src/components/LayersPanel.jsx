import { useState } from 'react'

// Layer definitions - each layer has id, name, icon, description, and visibility state
export const LAYERS_CONFIG = [
  {
    id: 'power-lines',
    name: 'קווי מתח גבוה',
    subtitle: '15 מ׳ מעל הקרקע',
    icon: '⚡',
    description: 'קווי מתח גבוה מ-OpenStreetMap (כיסוי גלובלי). מוצגים בגובה 15 מטר מעל הקרקע לבדיקת חציית מבנים.',
    defaultVisible: false,
    // OSM Power Lines - displayed at fixed height above ground
    // Data fetched dynamically from OpenStreetMap Overpass API
    elevationHeight: 15, // meters above ground
    opacity: 1
  },
  {
    id: 'religious-buildings',
    name: 'מבני דת',
    subtitle: 'בתי כנסת, כנסיות, מסגדים',
    icon: '🕌',
    description: 'מבני דת מ-OpenStreetMap: בתי כנסת, כנסיות, מסגדים, מנזרים, מקדשים ומבנים נוספים.',
    defaultVisible: false,
    // OSM Places of Worship - point features with icons
    // Data fetched from OpenStreetMap Overpass API
    opacity: 1
  }
]

// Eye icon component for visibility toggle
const EyeIcon = ({ visible }) => (
  <svg 
    width="20" 
    height="20" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: visible ? 1 : 0.4 }}
  >
    {visible ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
)

// Layers icon for the toggle button
const LayersIcon = () => (
  <svg 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

export function LayersPanel({ layers, onLayerToggle }) {
  const [isOpen, setIsOpen] = useState(false)

  const togglePanel = () => {
    setIsOpen(!isOpen)
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '80px',
      left: '10px',
      zIndex: 1000,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      direction: 'rtl'
    }}>
      {/* Layers Panel (when open) */}
      {isOpen && (
        <div style={{
          background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '12px',
          width: '260px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          animation: 'slideUp 0.2s ease-out'
        }}>
          {/* Header */}
          <div style={{
            color: '#fff',
            fontSize: '15px',
            fontWeight: 'bold',
            marginBottom: '14px',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <span style={{ fontSize: '18px' }}>🗂️</span>
            <span>שכבות</span>
          </div>

          {/* Layers List */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {LAYERS_CONFIG.map((layerConfig) => {
              const layerState = layers[layerConfig.id]
              const isVisible = layerState?.visible ?? layerConfig.defaultVisible
              
              return (
                <div
                  key={layerConfig.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: isVisible 
                      ? 'linear-gradient(135deg, rgba(251,146,60,0.2) 0%, rgba(234,88,12,0.2) 100%)'
                      : 'rgba(255,255,255,0.05)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: isVisible 
                      ? '1px solid rgba(251,146,60,0.3)' 
                      : '1px solid rgba(255,255,255,0.08)'
                  }}
                  onClick={() => onLayerToggle(layerConfig.id)}
                  onMouseEnter={(e) => {
                    if (!isVisible) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isVisible) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }
                  }}
                >
                  {/* Layer Icon */}
                  <span style={{ fontSize: '24px' }}>{layerConfig.icon}</span>
                  
                  {/* Layer Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      marginBottom: '2px'
                    }}>
                      {layerConfig.name}
                    </div>
                    <div style={{
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '11px'
                    }}>
                      {layerConfig.subtitle}
                    </div>
                  </div>
                  
                  {/* Eye Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onLayerToggle(layerConfig.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isVisible ? '#fb923c' : 'rgba(255,255,255,0.4)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <EyeIcon visible={isVisible} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Info text */}
          <div style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '10px',
            textAlign: 'center'
          }}>
            לחץ על העין להצגה/הסתרה
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={togglePanel}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          background: isOpen 
            ? 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)'
            : 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        <LayersIcon />
      </button>

      {/* CSS Animation */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default LayersPanel

