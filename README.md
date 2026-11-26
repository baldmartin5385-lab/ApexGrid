# ApexGrid

ApexGrid is an offline-first motorsport prototype built with TypeScript, PixiJS 8, and Vite. Its playable slice includes a procedural club circuit, fixed-step autonomous racing physics, selectable F1, F2, F3, GT3, and prototype AI fields, a three-lap spectator race, a waypoint-based circuit workshop, and a local garage with JSON export/import. F1 uses the six bundled car images; the other series use distinct, locally drawn car designs. Drivers and teams are fictional, and the player never controls a car.

The workshop includes optional OpenStreetMap-based map tiles (street, CARTO dark, Esri imagery, and OpenTopoMap), place search, attribution, and local road-graph snapping. Road graphs are fetched only when snap-to-road is enabled, cached locally, and reused for local routing; saved track geometry is used for racing without map requests. Live map, geocoding, and initial road-graph downloads require an internet connection.

## Requirements

- Node.js 20 or newer
- npm
- Android Studio for Android packaging

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. Select **Race**, choose a series, and press **Start Practice** to watch the full AI field race. The simulator is spectator-only.

## Build targets

```sh
npm run typecheck
npm run build
npm run desktop
npm run desktop:build
```

`npm run desktop:build` creates the Windows NSIS installer (`.exe`). The automated release pipeline intentionally produces only the Windows installer and Android APK.

For Android, initialize the native wrapper once, then sync web assets and open the project in Android Studio:

```sh
npm run mobile:setup
npm run mobile:android
```

Download the latest Android APK from [GitHub Releases](https://github.com/baldmartin5385-lab/ApexGrid/releases/latest/download/app-debug.apk). GitHub Actions builds an Android debug APK and a Windows `.exe` on every push to `main`; version tags (`v*`) attach those two packages to a GitHub Release. The Android APK and Windows installer are not store/production signed.

### Apple devices

ApexGrid supports iPhone, iPad, and Mac through Safari as an installable web app. Serve the built `dist/` folder over HTTPS, open it in Safari, then choose **Share → Add to Home Screen** on iPhone/iPad. The app shell and same-origin assets are cached for offline launches after the first visit. Apple users do not need an API key or a separate package download. This does not produce a native iOS `.ipa` or macOS `.dmg`; those would be additional signed Apple artifacts.

Progress and preferences (theme, rolling/lights-out start, metric/imperial units, and engine sound) are stored in browser/Electron local storage and are not synced to a server. The default engine sound is the bundled Formula 1 recording; synthesized engine tones and silence remain selectable in Settings. Use **Settings → Export Garage Data** to download a JSON backup, or import a valid ApexGrid garage/track JSON file.

## Current scope

This is a functional foundation, not the complete production simulator. It supports five selectable spectator race classes with fields of 20–30 fictional AI drivers, but does not yet include multi-series championships, advanced rival strategy, 2.5D presentation, grid/sound-pack import, licensed car art or rosters, or signed production builds. F2, F3, GT3, and prototype cars are original vector designs rather than separate photographic sprite packs.
