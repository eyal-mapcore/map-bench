# Map Bench - Mapbox + ESRI + Google Photorealistic Tiles

אפליקציית React המציגה מפה תלת-ממדית עם מודל פוטוריאליסטי של Google, עם תמיכה בשני מנועי מפות:
- **Mapbox GL JS v3** - עם deck.gl לטעינת Google 3D Tiles
- **ArcGIS Maps SDK for JavaScript** - עם תמיכה מובנית ב-Google 3D Tiles

## 🚀 התקנה והרצה

### 1. התקנת Dependencies

```bash
npm install
```

### 2. הגדרת API Keys

צור קובץ `.env` בתיקייה הראשית עם התוכן הבא:

```env
VITE_MAPBOX_TOKEN=your_mapbox_token_here
VITE_GOOGLE_API_KEY=your_google_api_key_here
```

#### קבלת Mapbox Token:
1. היכנס ל-[Mapbox Account](https://account.mapbox.com/)
2. צור חשבון או היכנס
3. העתק את ה-Access Token

#### קבלת Google API Key:
1. היכנס ל-[Google Cloud Console](https://console.cloud.google.com/)
2. צור פרויקט חדש או בחר קיים
3. הפעל את **Map Tiles API**
4. צור API Key בלשונית Credentials

### 3. הרצת האפליקציה

```bash
npm run dev
```

האפליקציה תרוץ ב-`http://localhost:5173`

## 🎮 שימוש במפה

- **גרור** - הזז את המפה
- **Scroll** - הגדל/הקטן
- **Ctrl + גרירה** - סובב את המפה
- **Shift + גרירה** - שנה זווית צפייה (pitch)
- **כפתור Toggle** - מעבר בין תצוגת Mapbox ל-ESRI
- **בחר מיקום** - בחירת ערים ויעדים מרחבי העולם

## 🛠️ טכנולוגיות

- React 18
- Mapbox GL JS v3
- ArcGIS Maps SDK for JavaScript
- Google Photorealistic 3D Tiles
- Vite

## 📋 הוראות פרויקט

### דרישות מפה
- **חובה לתמוך ב-Mapbox GL JS v3** - דרישה מחייבת
- **חובה לתמוך ברכיב תצוגת ESRI** - ArcGIS Maps SDK for JavaScript
- כפתור Toggle למעבר בין שני מנועי המפות
- פאנל "בחר מיקום" מופיע בשני המנועים

### אינטגרציית Google 3D Tiles
- Mapbox: שימוש ב-deck.gl Tile3DLayer
- ESRI: שימוש ב-IntegratedMesh3DTilesLayer
- אזור ברירת מחדל: נתניה, ישראל (32.3286°N, 34.8571°E)
