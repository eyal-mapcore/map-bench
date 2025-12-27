// Default view settings
export const INITIAL_ZOOM = 17
export const INITIAL_PITCH = 60
export const INITIAL_BEARING = -20

// Locations organized by continent
export const CONTINENTS = {
  northAmerica: {
    name: 'צפון אמריקה',
    emoji: '🌎',
    icon: '🗽',
    locations: {
      newYork: { 
        name: 'ניו יורק', 
        subtitle: 'מנהטן, סנטרל פארק',
        coords: [-74.0060, 40.7128],
        quality: 5,
        icon: '🗽'
      },
      sanFrancisco: { 
        name: 'סן פרנסיסקו', 
        subtitle: 'גשר הזהב, Alcatraz',
        coords: [-122.4194, 37.7749],
        quality: 5,
        icon: '🌉'
      },
      lasVegas: { 
        name: 'לאס וגאס', 
        subtitle: 'הסטריפ, הקזינו',
        coords: [-115.1728, 36.1147],
        quality: 5,
        icon: '🎰'
      },
      losAngeles: { 
        name: 'לוס אנג\'לס', 
        subtitle: 'הוליווד, סנטה מוניקה',
        coords: [-118.2437, 34.0522],
        quality: 4,
        icon: '🎬'
      },
    }
  },
  israel: {
    name: 'ישראל',
    emoji: '🇮🇱',
    icon: '📍',
    locations: {
      telAviv: { 
        name: 'תל אביב', 
        subtitle: 'מגדלי עזריאלי, חוף הים',
        coords: [34.7749, 32.0667],
        quality: 3,
        icon: '🏙️'
      },
      jerusalem: { 
        name: 'ירושלים', 
        subtitle: 'העיר העתיקה, הכותל',
        coords: [35.2316, 31.7767],
        quality: 3,
        icon: '🕌'
      },
      haifa: { 
        name: 'חיפה', 
        subtitle: 'הגנים הבהאיים',
        coords: [34.9896, 32.7940],
        quality: 2,
        icon: '🌿'
      },
      netanya: { 
        name: 'נתניה', 
        subtitle: 'חוף הים, המרינה',
        coords: [34.8571, 32.3286],
        quality: 2,
        icon: '🏖️'
      },
    }
  },
  europe: {
    name: 'אירופה',
    emoji: '🌍',
    icon: '🏰',
    locations: {
      london: { 
        name: 'לונדון', 
        subtitle: 'ביג בן, Tower Bridge',
        coords: [-0.1276, 51.5074],
        quality: 4,
        icon: '🎡'
      },
      paris: { 
        name: 'פריז', 
        subtitle: 'מגדל אייפל, שאנז אליזה',
        coords: [2.2945, 48.8584],
        quality: 5,
        icon: '🗼'
      },
      rome: { 
        name: 'רומא', 
        subtitle: 'קולוסיאום, ותיקן',
        coords: [12.4924, 41.8902],
        quality: 4,
        icon: '🏛️'
      },
      barcelona: { 
        name: 'ברצלונה', 
        subtitle: 'סגרדה פמיליה',
        coords: [2.1734, 41.4036],
        quality: 4,
        icon: '⛪'
      },
    }
  },
  asia: {
    name: 'אסיה',
    emoji: '🌏',
    icon: '🏯',
    locations: {
      tokyo: { 
        name: 'טוקיו', 
        subtitle: 'שינג\'וקו, מגדל טוקיו',
        coords: [139.6917, 35.6895],
        quality: 5,
        icon: '🗼'
      },
      dubai: { 
        name: 'דובאי', 
        subtitle: 'בורג\' חליפה, פאלם',
        coords: [55.2744, 25.1972],
        quality: 5,
        icon: '🏗️'
      },
      singapore: { 
        name: 'סינגפור', 
        subtitle: 'Marina Bay Sands',
        coords: [103.8198, 1.3521],
        quality: 5,
        icon: '🏨'
      },
      hongKong: { 
        name: 'הונג קונג', 
        subtitle: 'Victoria Harbour',
        coords: [114.1694, 22.3193],
        quality: 4,
        icon: '🌃'
      },
    }
  },
}

// Quality stars component
const QualityStars = ({ quality }) => (
  <span style={{ fontSize: '10px', opacity: 0.8 }}>
    {'⭐'.repeat(quality)}
  </span>
)

export function LocationSelector({ currentLocation, onLocationChange, expandedContinent, onContinentToggle }) {
  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
      borderRadius: '16px',
      padding: '16px',
      zIndex: 1000,
      width: '280px',
      maxHeight: 'calc(100vh - 100px)',
      overflowY: 'auto',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      direction: 'rtl'
    }}>
      {/* Header */}
      <div style={{
        color: '#fff',
        fontSize: '16px',
        fontWeight: 'bold',
        marginBottom: '16px',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        direction: 'rtl'
      }}>
        <span style={{ fontSize: '20px' }}>📍</span>
        <span>בחר מיקום</span>
      </div>
      
      {/* Continents */}
      {Object.entries(CONTINENTS).map(([continentKey, continent]) => (
        <div key={continentKey} style={{ marginBottom: '12px' }}>
          {/* Continent Header */}
          <button
            onClick={() => onContinentToggle(expandedContinent === continentKey ? null : continentKey)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: expandedContinent === continentKey 
                ? 'linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(139,92,246,0.3) 100%)'
                : 'rgba(255,255,255,0.05)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'right',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease',
              direction: 'rtl'
            }}
          >
            <span>{continent.name}</span>
            <span style={{ 
              transform: expandedContinent === continentKey ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              opacity: 0.6
            }}>▼</span>
          </button>
          
          {/* Cities */}
          {expandedContinent === continentKey && (
            <div style={{ 
              marginTop: '8px',
              paddingRight: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {Object.entries(continent.locations).map(([cityKey, city]) => {
                const isActive = currentLocation.continent === continentKey && currentLocation.city === cityKey
                return (
                  <button
                    key={cityKey}
                    onClick={() => onLocationChange(continentKey, cityKey)}
                    style={{
                      padding: '10px 12px',
                      background: isActive 
                        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' 
                        : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: isActive ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'right',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? '0 4px 15px rgba(99,102,241,0.4)' : 'none',
                      direction: 'rtl'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                        e.currentTarget.style.transform = 'translateX(4px)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.transform = 'translateX(0)'
                      }
                    }}
                  >
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 'bold',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '16px' }}>{city.icon}</span>
                      <span>{city.name}</span>
                      <span style={{ marginRight: 'auto' }}>
                        <QualityStars quality={city.quality} />
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: '11px', 
                      opacity: 0.7,
                      fontWeight: 'normal',
                      paddingRight: '24px'
                    }}>
                      {city.subtitle}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default LocationSelector
