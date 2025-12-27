export function StatusBar({ locationData, tilesLoaded }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '10px',
      right: '68px',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
      color: '#fff',
      padding: '10px 4px',
      borderRadius: '14px',
      fontSize: '13px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 1000,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      direction: 'rtl',
      width: '222px',
      boxSizing: 'border-box'
    }}>
      <span style={{ fontSize: '18px' }}>{locationData?.icon || '🏗️'}</span>
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '13px', lineHeight: '1.3' }}>
          {locationData?.name || 'טוען...'}
        </div>
        <div style={{ fontSize: '11px', opacity: 0.7, display: 'flex', gap: '6px', alignItems: 'center', lineHeight: '1.3' }}>
          <span style={{ color: '#4ade80' }}>{tilesLoaded.toLocaleString()} אריחים</span>
          <span>•</span>
          <span>{locationData?.subtitle}</span>
        </div>
      </div>
    </div>
  )
}

export default StatusBar

