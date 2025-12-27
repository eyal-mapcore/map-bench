export function MapToggle({ mapType, onToggle }) {
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
      <button
        onClick={() => onToggle('mapbox')}
        style={{
          padding: '10px 16px',
          background: mapType === 'mapbox' 
            ? 'linear-gradient(135deg, #4264fb 0%, #1d4ed8 100%)' 
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
        <span>🗺️</span>
        <span>Mapbox</span>
      </button>
      <button
        onClick={() => onToggle('maplibre')}
        style={{
          padding: '10px 16px',
          background: mapType === 'maplibre' 
            ? 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)' 
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
        <span>🗾</span>
        <span>MapLibre</span>
      </button>
      <button
        onClick={() => onToggle('esri')}
        style={{
          padding: '10px 16px',
          background: mapType === 'esri' 
            ? 'linear-gradient(135deg, #0079c1 0%, #005a8c 100%)' 
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
        <span>🌐</span>
        <span>ESRI</span>
      </button>
      <button
        onClick={() => onToggle('cesium')}
        style={{
          padding: '10px 16px',
          background: mapType === 'cesium' 
            ? 'linear-gradient(135deg, #6db33f 0%, #4a8c2a 100%)' 
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
        <span>🌍</span>
        <span>Cesium</span>
      </button>
    </div>
  )
}

export default MapToggle

