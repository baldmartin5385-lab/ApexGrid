# ApexGrid

ApexGrid is an offline-first motorsport prototype built with TypeScript, PixiJS 8, and Vite. Its current playable slice includes a procedural club circuit, fixed-step autonomous racing physics, six AI drivers, a three-lap spectator race, a waypoint-based circuit workshop, and a local garage with JSON export/import. The player never controls a car; there are no keyboard or touch driving controls.

## Requirements

- Node.js 20 or newer
- npm
- Android Studio for Android packaging

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. Select **Race** and press **Start Practice** to watch the six AI drivers race. The simulator is spectator-only.

## Build targets

```sh
npm run typecheck
npm run build
npm run desktop
npm run desktop:build
```

The Electron shell is configured for Windows (NSIS), macOS (DMG), and Linux (AppImage). Build each desktop target on its supported host OS.

For Android, initialize the native wrapper once, then sync web assets and open the project in Android Studio:

```sh
npm run mobile:setup
npm run mobile:android
```

The GitHub Actions workflow builds a debug APK on pushes and publishes a downloadable APK artifact. Tag a release `v*` to attach the APK to a GitHub Release.

Progress and preferences (theme, rolling/lights-out start, metric/imperial units, and synthesized engine tone) are stored in browser/Electron local storage and are not synced to a server. Use **Settings → Export Garage Data** to download a JSON backup, or import a valid ApexGrid garage/track JSON file.

## Current scope

This is a functional foundation, not the complete production simulator. It currently has one spectator-only practice format and a six-car path-following AI field; editable race grids, advanced rival strategy, multi-series championships, 2.5D presentation, grid/sound-pack import, and signed production builds are not implemented. Android APKs are built by GitHub Actions; production signing remains machine-specific.
