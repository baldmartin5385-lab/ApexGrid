# ApexGrid

ApexGrid is an offline-first motorsport prototype built with TypeScript, PixiJS 8, and Vite. Its spectator-only race weekend runs AI qualifying followed by an AI race, with editable session lengths, 1×–8× simulation speed, and a simulated skip-to-finish. During sessions, the scroll wheel or camera buttons zoom the view and every leaderboard row follows its driver. The 16 transparent vehicle sprites extracted from the supplied image are catalogued with distinct specifications; the AI uses varied cars and vehicle-specific speed, acceleration, braking, and grip. Engine audio is synthesized per car and spatially mixed around the followed driver. Drivers and teams are fictional; the player never controls a car.

The workshop starts from a blank canvas, a PNG image underlay, or a world map. Zoom with the wheel or controls, drag the empty canvas to pan, and drag individual waypoints to reshape the circuit. Control points form a smooth racing line, and new layouts stay open until **Finish Circuit** is selected. AI drivers brake for corners and attempt passes when they catch a slower car. World-map mode includes place search, OpenStreetMap-based map tiles (street, CARTO dark, Esri imagery, and OpenTopoMap), attribution, and optional local road-graph snapping. Map tiles and the first road-graph download need an internet connection; saved tracks run offline.

## Requirements

- Node.js 20 or newer
- npm
- Android Studio for Android packaging

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. Select **Race**, choose a series, set qualifying minutes and race laps, then start qualifying. Qualifying automatically sets the race grid by best lap; **Skip to Race Finish** simulates both sessions.

## Build targets

```sh
npm run typecheck
npm run build
npm run desktop
npm run desktop:build
npm run desktop:build:mac
```

`npm run desktop:build` creates the Windows NSIS installer (`.exe`); `npm run desktop:build:mac` creates an unsigned macOS `.dmg`.

For Android, initialize the native wrapper once, then sync web assets and open the project in Android Studio:

```sh
npm run mobile:setup
npm run mobile:android
```

For Apple platforms, build the macOS desktop installer on a Mac. To generate and open the iOS project, run `npm run mobile:ios` on macOS with Xcode installed. GitHub Actions builds Windows `.exe`, macOS `.dmg`, Android debug APK, and an unsigned iOS Simulator app on pushes to `main` and on manual runs. Version tags (`v*`) publish these artifacts as a release. The iOS Simulator artifact is not an iPhone/iPad installable IPA; App Store distribution requires Apple signing credentials. Android and desktop builds are not store/production signed.

### Apple devices

ApexGrid supports iPhone and iPad as an installable Safari web app, an iOS Simulator project, and macOS as an unsigned Electron `.dmg`. On iPhone/iPad, open the hosted app in Safari and choose **Share → Add to Home Screen**. The app shell and same-origin assets are cached for offline launches after the first visit. Native iOS distribution still requires Apple signing credentials.

Progress and preferences (theme, rolling/lights-out start, metric/imperial units, and engine sound) are stored in browser/Electron local storage and are not synced to a server. Every AI car has its own synthesized engine voice, with distinct profiles for F1, F2, F3, GT3, and prototype cars; engine sound can be disabled in Settings. Use **Settings → Export Garage Data** to download a JSON backup, or import a valid ApexGrid garage/track JSON file.

## Current scope

This is a functional foundation, not the complete production simulator. It supports five selectable spectator race classes with fields of 20–30 fictional AI drivers, timed qualifying, configurable lap races, and camera spectating. It does not yet include multi-series championships, advanced rival strategy, 2.5D presentation, audio-pack import, vehicle selection/garage sprite previews, or signed production builds. Engine sounds remain procedurally generated rather than recorded.
