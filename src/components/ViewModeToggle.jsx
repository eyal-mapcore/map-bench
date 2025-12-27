export function ViewModeToggle({ viewMode, onToggle }) {
  const is3D = viewMode === '3d'
  
  return (
    <button
      onClick={() => onToggle(is3D ? '2d' : '3d')}
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: 1000,
        padding: '8px 16px',
        background: is3D 
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
          : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        fontWeight: 'bold',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {is3D ? '3D' : '2D'}
    </button>
  )
}

export default ViewModeToggle

