import { useState, useEffect } from 'react'

export function MapToggle({ mapType, onToggle }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const MAP_OPTIONS = [
    { id: 'maplibre', label: 'MapLibre', icon: '🗾', color: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)' },
    { id: 'mapbox', label: 'Mapbox', icon: '🗺️', color: 'linear-gradient(135deg, #4264fb 0%, #1d4ed8 100%)' },
    { id: 'esri', label: 'ESRI', icon: '🌐', color: 'linear-gradient(135deg, #0079c1 0%, #005a8c 100%)' },
    { id: 'cesium', label: 'Cesium', icon: '🌍', color: 'linear-gradient(135deg, #6db33f 0%, #4a8c2a 100%)' },
    { id: 'mapcore', label: 'MapCore', icon: '🗺️', color: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' },
    { id: 'leaflet', label: 'Leaflet', icon: '🍃', color: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)' }
  ]
  
  if (isMobile) {
    const currentOption = MAP_OPTIONS.find(opt => opt.id === mapType)
    
    return (
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: '140px',
      }}>
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(15,23,42,0.95)',
              borderRadius: '12px',
              padding: '8px 16px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 'bold',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '16px' }}>{currentOption?.icon}</span>
            <span>{currentOption?.label}</span>
          </button>
        ) : (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(15,23,42,0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {MAP_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => {
                  onToggle(option.id)
                  setIsOpen(false)
                }}
                style={{
                  padding: '10px 16px',
                  background: mapType === option.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: '14px',
                  fontWeight: mapType === option.id ? 'bold' : 'normal',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%'
                }}
              >
                <span>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      display: 'flex',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
      borderRadius: '12px',
      padding: '4px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {MAP_OPTIONS.map(option => (
        <button
          key={option.id}
          onClick={() => onToggle(option.id)}
          style={{
            padding: '10px 16px',
            background: mapType === option.id 
              ? option.color
              : 'transparent',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '13px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>{option.icon}</span>
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export default MapToggle

