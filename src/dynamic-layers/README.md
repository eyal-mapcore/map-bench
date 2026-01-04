# Dynamic Layers

מודולים לשכבות דינמיות המתעדכנות בזמן אמת.

## Flight Tracker

`flightTracker.js` - שכבת מעקב טיסות בזמן אמת.

### מאפיינים
- שימוש ב-OpenSky Network API (חינמי)
- עדכון כל 10 שניות
- מסנן טיסות לפי המיקום הנבחר (רדיוס ~50 ק"מ)
- מציג מטוסים עם כיוון, גובה ומהירות

### שימוש

```javascript
import { FlightTracker } from './flightTracker'

// יצירת tracker חדש
const tracker = new FlightTracker({
  onUpdate: (geoJsonData) => {
    // עדכון השכבה במפה
    console.log(`נמצאו ${geoJsonData.features.length} מטוסים`)
  }
})

// התחלת מעקב במיקום מסוים
tracker.start(lon, lat)

// עדכון מיקום
tracker.setCenter(newLon, newLat)

// עצירת מעקב
tracker.stop()
```

### נתוני GeoJSON

כל feature מכיל:
- `geometry.coordinates` - [lon, lat, altitude]
- `properties.callsign` - שם הטיסה
- `properties.altitude` / `altitudeFeet` - גובה במטרים/רגל
- `properties.velocity` / `velocityKnots` - מהירות במ"ש/קשר
- `properties.heading` - כיוון במעלות (0 = צפון)

### תמיכה במפות
- [x] MapBox
- [x] MapLibre
- [ ] ESRI
- [ ] Cesium
- [ ] Leaflet

