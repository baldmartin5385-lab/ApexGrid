import "./style.css";
import { Application } from "pixi.js";
import { arrangeAIFleetOnGrid, createAIFleet, RACE_SERIES, stepAIDriver, type AIDriver, type RaceSeries } from "./domain/ai";
import { createCar, type CarState } from "./domain/physics";
import { createDrivingTrack, isValidTrack, trackLength, WORLD, type Point, type Track } from "./domain/track";
import { TrackRenderer, type EditorViewport } from "./render/trackRenderer";
import { loadSave, persistSave, type SaveData } from "./platform/storage";
import { EngineAudio } from "./platform/engineAudio";
import { MapRouter, geoToTrackWorld, trackWorldToGeo, type MapPlace } from "./engine/MapRouter";
import { clampZoom, screenToGeo, TileProvider, type GeoPoint, type MapCamera } from "./map/TileProvider";
import { createMapAttributionOverlay } from "./ui/MapAttributionOverlay";

if (
  "serviceWorker" in navigator &&
  (window.location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(window.location.hostname))
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
      console.warn("ApexGrid offline app support could not be enabled.", error);
    });
  });
}

type Screen = "overview" | "race" | "workshop" | "garage" | "settings";
type RaceStatus = "ready" | "running" | "paused" | "finished";
type RacePhase = "qualifying" | "race";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("ApexGrid app root is missing.");

appRoot.innerHTML = `
  <div class="app-frame">
    <aside class="rail" aria-label="Primary navigation">
      <a class="brand-mark" href="#" aria-label="ApexGrid home"><span class="brand-monogram">AG</span><span class="brand-copy">APEXGRID<small>MOTORSPORT</small></span></a>
      <div class="rail-rule"></div>
      <button class="rail-link active" data-screen="overview" aria-label="Overview" title="Overview"><span class="rail-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg></span><span class="rail-label">Home</span></button>
      <button class="rail-link" data-screen="race" aria-label="Race weekend" title="Race weekend"><span class="rail-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1c6-4 8 4 14 0v10c-6 4-8-4-14 0"/></svg></span><span class="rail-label">Race</span></button>
      <button class="rail-link" data-screen="workshop" aria-label="Track workshop" title="Track workshop"><span class="rail-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20c0-5 3-8 8-8s8-3 8-8M4 4v4m0-4h4m12 16v-4m0 4h-4"/></svg></span><span class="rail-label">Workshop</span></button>
      <button class="rail-link" data-screen="garage" aria-label="Garage" title="Garage"><span class="rail-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 4l9 6v10H3zM7 20v-6h10v6m-7-6v-3h4v3"/></svg></span><span class="rail-label">Garage</span></button>
      <button class="rail-link" data-screen="settings" aria-label="Settings" title="Settings"><span class="rail-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M3 12h2m14 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg></span><span class="rail-label">Settings</span></button>
      <div class="rail-bottom"><span class="online-dot"></span><span>Saved on this device</span></div>
    </aside>
    <div class="main-frame">
      <header class="topbar">
        <div class="wordmark">APEX<span>GRID</span><small>RACE CONTROL</small></div>
        <div class="topbar-meta"><span class="save-indicator"><i></i> SAVED ON THIS DEVICE</span></div>
      </header>
      <main class="content">
        <div class="page-heading">
          <div><p class="eyebrow" id="eyebrow">MOTORSPORT, YOUR WAY</p><h1 id="page-title">Welcome to ApexGrid</h1><p class="page-subtitle" id="page-subtitle">Build a circuit. Find your line. Leave your mark.</p></div>
          <div class="heading-meta"><span class="season-tag"><b>AI-ONLY RACING</b></span><span class="season-tag">NO PLAYER CONTROLS</span></div>
        </div>
        <section class="workbench" id="workbench">
          <div class="track-card">
            <div class="track-card-top"><div><span class="section-kicker" id="track-kicker">FEATURED CIRCUIT</span><h2 id="track-title">Copper Circuit</h2></div><div class="track-pill"><span></span><span id="track-state">WEEKEND READY</span></div></div>
                <div class="canvas-wrap" id="canvas-wrap"><img class="track-underlay" id="track-underlay" alt="" hidden /><div id="track-canvas"></div><div class="canvas-overlay"><span id="canvas-caption">TRACK OVERVIEW</span><span id="canvas-mode">RACE WEEKEND</span></div>
              <div id="race-classification" class="race-classification" aria-live="polite"></div>
              <div class="race-hud"><div class="speed-box"><b id="speed-readout">000</b><span id="speed-unit">KM/H</span></div><div class="race-hud-right"><span><i id="hud-phase-label">LAP</i> <b id="live-lap-number">1 / 5</b></span><strong id="live-lap-time">00:00.000</strong></div><div class="lap-track"><i id="lap-progress"></i></div></div>
            </div>
            <div class="track-card-bottom">
              <div class="stat"><span>LAYOUT</span><b id="track-layout">Club circuit</b></div>
              <div class="stat"><span>TRACK LENGTH</span><b id="track-length">—</b></div>
              <div class="stat"><span>FASTEST LAP</span><b id="best-lap">--:--.---</b></div>
              <div class="track-actions" id="track-actions"></div>
            </div>
          </div>
          <aside class="inspector" id="inspector"></aside>
        </section>
        <footer class="footer"><span><i class="online-dot"></i> PROGRESS SAVES ON THIS DEVICE</span><span>AI QUALIFYING · AI RACE · NO PLAYER CONTROLS</span></footer>
      </main>
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </div>
`;

const elements = {
  mount: document.querySelector<HTMLDivElement>("#track-canvas")!,
  workbench: document.querySelector<HTMLElement>("#workbench")!,
  canvasWrap: document.querySelector<HTMLDivElement>("#canvas-wrap")!,
  underlay: document.querySelector<HTMLImageElement>("#track-underlay")!,
  classification: document.querySelector<HTMLDivElement>("#race-classification")!,
  title: document.querySelector<HTMLHeadingElement>("#page-title")!,
  subtitle: document.querySelector<HTMLParagraphElement>("#page-subtitle")!,
  eyebrow: document.querySelector<HTMLParagraphElement>("#eyebrow")!,
  trackTitle: document.querySelector<HTMLHeadingElement>("#track-title")!,
  trackKicker: document.querySelector<HTMLSpanElement>("#track-kicker")!,
  trackState: document.querySelector<HTMLSpanElement>("#track-state")!,
  trackLayout: document.querySelector<HTMLElement>("#track-layout")!,
  trackLength: document.querySelector<HTMLElement>("#track-length")!,
  bestLap: document.querySelector<HTMLElement>("#best-lap")!,
  inspector: document.querySelector<HTMLElement>("#inspector")!,
  actions: document.querySelector<HTMLElement>("#track-actions")!,
  toast: document.querySelector<HTMLDivElement>("#toast")!,
};

const mapAttribution = createMapAttributionOverlay();
elements.canvasWrap.append(mapAttribution);
mapAttribution.hidden = true;

const save = loadSave();
const engineAudio = new EngineAudio();
const mapRouter = new MapRouter();
const tileProvider = new TileProvider(4);
let activeScreen: Screen = "overview";
let raceStatus: RaceStatus = "ready";
let racePhase: RacePhase = "qualifying";
let sessionElapsed = 0;
let raceSpeed: 1 | 2 | 4 | 8 = 1;
let raceSkipInProgress = false;
let previewCar: CarState;
let aiDrivers: AIDriver[] = [];
let editorTrack: Track | null = null;
let raceTrack: Track | null = null;
let mapCamera: MapCamera | null = null;
const editorViewport: EditorViewport = { zoom: 1, panX: 0, panY: 0 };
const raceViewport: EditorViewport = { zoom: 1, panX: 0, panY: 0 };
let selectedSpectatorDriverId: string | null = null;
let mapEnabled = false;
let workshopSource: "blank" | "png" | "world-map" = "blank";
let snapToRoad = false;
let roadGraphLoading = false;
let mapRoutePending = false;
let mapSearchResults: MapPlace[] = [];
let lastFrame = 0;
let lastStandingsRefresh = 0;
let toastTimer = 0;
let lastTileErrorToast = 0;
let selectedWaypointIndex = -1;
let editorGesture: {
  pointerId: number;
  mode: "point" | "pending" | "pan";
  pointIndex: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
} | null = null;

function currentTrack(): Track {
  return save.tracks.find((track) => track.id === save.selectedTrackId) ?? save.tracks[0];
}

function raceLeaderCar(): CarState {
  return leadingAIDriver()?.car ?? previewCar;
}

function spectatedAIDriver(): AIDriver | undefined {
  return aiDrivers.find((driver) => driver.id === selectedSpectatorDriverId) ?? leadingAIDriver();
}

function currentLapNumber(car: CarState): number {
  return raceStatus === "finished"
    ? Math.max(1, Math.min(car.lap, save.settings.raceLaps))
    : Math.min(car.lap + 1, save.settings.raceLaps);
}

function showToast(message: string, isError = false): void {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function commitSave(): void {
  persistSave(save);
  document.querySelector(".save-indicator")?.classList.add("just-saved");
  window.setTimeout(() => document.querySelector(".save-indicator")?.classList.remove("just-saved"), 700);
}

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--.---";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remainder}`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function selectedScreen(screen: Screen): void {
  if (screen === "workshop") {
    editorViewport.zoom = 1;
    editorViewport.panX = 0;
    editorViewport.panY = 0;
    selectedWaypointIndex = -1;
    if (!editorTrack) editorTrack = structuredClone(currentTrack());
    const reference = editorTrack.geoReference;
    if (reference) {
      mapCamera = {
        center: { lat: reference.centerLat, lon: reference.centerLon },
        zoom: reference.zoom,
        layer: "street",
      };
      mapEnabled = true;
      workshopSource = "world-map";
    } else if (editorTrack.backgroundImage) {
      mapCamera = null;
      mapEnabled = false;
      workshopSource = "png";
    } else {
      mapCamera = null;
      mapEnabled = false;
      workshopSource = "blank";
    }
  }
  if (activeScreen === "race" && screen !== "race" && raceStatus === "running") {
    raceStatus = "paused";
    setEngineRunning(false);
  }
  activeScreen = screen;
  document.querySelectorAll<HTMLButtonElement>(".rail-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screen);
  });
  renderScreen();
}

function renderScreen(): void {
  const track = currentTrack();
  const headings: Record<Screen, [string, string, string]> = {
    overview: ["YOUR MOTORSPORT DESK", "Welcome to ApexGrid", "Choose a circuit, build one, or watch the AI grid race."],
    race: ["RACE WEEKEND", "Qualifying, then race", "Set your session lengths, qualify the AI grid, and watch the race."],
    workshop: ["TRACK WORKSHOP", "Design a circuit", "Draw a new layout or trace real roads."],
    garage: ["YOUR CIRCUITS", "The garage", "Choose a circuit to race or edit."],
    settings: ["PREFERENCES", "Settings", "Set your units, race start, and audio."],
  };
  const [eyebrow, title, subtitle] = headings[activeScreen];
  elements.eyebrow.textContent = eyebrow;
  elements.title.textContent = title;
  elements.subtitle.textContent = subtitle;
  elements.trackKicker.textContent =
    activeScreen === "workshop" ? "CIRCUIT PREVIEW" : activeScreen === "garage" ? "SELECTED CIRCUIT" : "FEATURED CIRCUIT";
  elements.trackTitle.textContent = activeScreen === "workshop" && editorTrack ? editorTrack.name : track.name;
  const displayedTrack = activeScreen === "workshop" && editorTrack ? editorTrack : track;
  elements.trackLength.textContent = formatDistance(trackLength(displayedTrack));
  elements.bestLap.textContent = formatTime(raceLeaderCar().bestLapSeconds);
  elements.trackLayout.textContent = activeScreen === "workshop" ? "Custom layout" : "Club circuit";
  elements.trackState.textContent =
    activeScreen === "workshop" ? `${editorTrack?.points.length ?? 0} WAYPOINTS` :
      raceStatus === "running" ? `${racePhase.toUpperCase()} LIVE` :
        raceStatus === "paused" ? `${racePhase.toUpperCase()} PAUSED` :
          raceStatus === "finished" ? "RACE COMPLETE" :
            "WEEKEND READY";
  elements.trackState.parentElement?.classList.toggle("live", raceStatus === "running");
  elements.canvasWrap.classList.toggle("editing", activeScreen === "workshop");
  elements.canvasWrap.classList.toggle("racing", activeScreen === "race");
  elements.classification.classList.toggle("visible", activeScreen === "race" && raceStatus !== "ready" && aiDrivers.length > 0);
  elements.workbench.classList.toggle("settings-mode", activeScreen === "settings");
  const canvasCaption = document.querySelector<HTMLElement>("#canvas-caption");
  const canvasMode = document.querySelector<HTMLElement>("#canvas-mode");
  if (canvasCaption) canvasCaption.textContent = activeScreen === "workshop" ? "TRACK WORKSHOP" : "CIRCUIT VIEW";
  if (canvasMode) {
    canvasMode.textContent =
      activeScreen === "race"
        ? `${racePhase.toUpperCase()} · ${RACE_SERIES[save.settings.series].gridSize} CARS`
        : activeScreen === "workshop"
          ? workshopSource === "world-map"
            ? "WORLD MAP"
            : workshopSource === "png"
              ? "PNG UNDERLAY"
              : "BLANK CANVAS"
          : "RACE WEEKEND";
  }
  const underlay = displayedTrack.backgroundImage;
  elements.underlay.hidden = !underlay || (activeScreen === "workshop" && workshopSource === "world-map");
  if (underlay && elements.underlay.src !== underlay) elements.underlay.src = underlay;
  const canvasZoom = activeScreen === "workshop" && !mapEnabled ? editorViewport.zoom : 1;
  const canvasPanX = activeScreen === "workshop" && !mapEnabled ? editorViewport.panX : 0;
  const canvasPanY = activeScreen === "workshop" && !mapEnabled ? editorViewport.panY : 0;
  elements.underlay.style.transform = `translate(${canvasPanX}px, ${canvasPanY}px) scale(${canvasZoom})`;
  mapAttribution.hidden = !(activeScreen === "workshop" && mapEnabled && mapCamera !== null);
  document.documentElement.dataset.theme = save.settings.theme;
  elements.inspector.innerHTML = renderInspector();
  elements.actions.innerHTML = renderTrackActions();
  bindScreenActions();
  draw();
}

function renderMapSearchResults(): string {
  return mapSearchResults
    .map(
      (place, index) =>
        `<button class="map-place-result" type="button" data-place-index="${index}">${escapeHtml(place.displayName)}</button>`,
    )
    .join("");
}

function createGeoReference(camera: MapCamera): NonNullable<Track["geoReference"]> {
  const width = elements.mount.clientWidth || 1000;
  const height = elements.mount.clientHeight || 700;
  return {
    centerLat: camera.center.lat,
    centerLon: camera.center.lon,
    zoom: camera.zoom,
    pixelsPerWorldUnit: Math.max(0.1, Math.min(width / WORLD.width, height / WORLD.height)),
  };
}

async function searchMapPlaces(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#map-search");
  if (!input) return;
  const query = input.value.trim();
  if (query.length < 2) {
    showToast("Enter at least two characters to search.", true);
    return;
  }
  try {
    mapSearchResults = await mapRouter.searchPlaces(query);
    renderScreen();
    if (mapSearchResults.length === 0) showToast("No matching places were found.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Place search failed.", true);
  }
}

function selectMapPlace(index: number): void {
  const place = mapSearchResults[index];
  if (!place || !editorTrack) return;
  const layer = mapCamera?.layer ?? "street";
  mapCamera = {
    center: place.point,
    zoom: clampZoom(layer, 16),
    layer,
  };
  editorTrack.geoReference = createGeoReference(mapCamera);
  mapEnabled = true;
  mapSearchResults = [];
  renderScreen();
  showToast(`Map centered on ${place.displayName.split(",")[0]}.`);
  if (snapToRoad) void setSnapToRoad(true);
}

async function setSnapToRoad(enabled: boolean): Promise<void> {
  if (!enabled) {
    snapToRoad = false;
    renderScreen();
    return;
  }
  if (!mapCamera || !editorTrack?.geoReference) {
    showToast("Search for a place before enabling snap-to-road.", true);
    renderScreen();
    return;
  }
  if (mapCamera.zoom < 14) {
    showToast("Snap-to-road requires map zoom 14 or higher.", true);
    renderScreen();
    return;
  }
  roadGraphLoading = true;
  renderScreen();
  try {
    await mapRouter.loadRoadGraph(mapCamera.center);
    snapToRoad = true;
    mapEnabled = true;
    showToast("Road network ready. Waypoints will route locally.");
  } catch (error) {
    snapToRoad = false;
    showToast(error instanceof Error ? error.message : "The road network could not be loaded.", true);
  } finally {
    roadGraphLoading = false;
    renderScreen();
  }
}

function renderTrackActions(): string {
  if (activeScreen === "race") {
    const phase = racePhase === "qualifying" ? "QUALIFYING" : "RACE";
    const label = raceStatus === "running"
      ? `PAUSE ${phase}`
      : raceStatus === "paused"
        ? `RESUME ${phase}`
        : "START QUALIFYING";
    return `<button class="button button-primary" data-action="race-toggle">${label}<span>↗</span></button>`;
  }
  if (activeScreen === "workshop") {
    return `<button class="button button-primary" data-action="save-track">SAVE CIRCUIT<span>↗</span></button>`;
  }
  if (activeScreen === "settings") return "";
  return `<button class="button button-primary" data-action="go-race">START RACE WEEKEND<span>↗</span></button>`;
}

function renderInspector(): string {
  if (activeScreen === "settings") {
    return `
      <div class="settings-group">
        <p class="section-kicker">LOOK</p>
        <div class="settings-row"><span class="settings-icon">◒</span><span class="settings-copy"><b>THEME</b><small>Choose your cockpit style</small></span><select id="settings-theme" aria-label="Theme"><option value="modern" ${save.settings.theme === "modern" ? "selected" : ""}>Modern</option><option value="classic" ${save.settings.theme === "classic" ? "selected" : ""}>Classic</option></select></div>
      </div>
      <div class="settings-group">
        <p class="section-kicker">RACE</p>
        <div class="settings-row"><span class="settings-icon">▥</span><span class="settings-copy"><b>RACE START</b><small>Starting procedure</small></span><select id="settings-start" aria-label="Race start"><option value="lights-out" ${save.settings.raceStart === "lights-out" ? "selected" : ""}>Lights out</option><option value="rolling" ${save.settings.raceStart === "rolling" ? "selected" : ""}>Rolling</option></select></div>
        <div class="settings-row"><span class="settings-icon">▤</span><span class="settings-copy"><b>UNITS</b><small>Speed and distance</small></span><select id="settings-units" aria-label="Units"><option value="metric" ${save.settings.units === "metric" ? "selected" : ""}>Metric</option><option value="imperial" ${save.settings.units === "imperial" ? "selected" : ""}>Imperial</option></select></div>
        <div class="settings-row"><span class="settings-icon">◖</span><span class="settings-copy"><b>ENGINE SOUND</b><small>Separate engine for every car</small></span><select id="settings-audio" aria-label="Engine sound"><option value="series" ${save.settings.engineSound === "series" ? "selected" : ""}>On · Individual</option><option value="off" ${save.settings.engineSound === "off" ? "selected" : ""}>Off</option></select></div>
      </div>
      <div class="settings-group">
        <p class="section-kicker">FILES</p>
        <button class="settings-file" data-action="export-save"><span class="settings-icon">↑</span><b>EXPORT GARAGE DATA</b><span>›</span></button>
        <button class="settings-file" data-action="import-save"><span class="settings-icon">↓</span><b>IMPORT CIRCUITS</b><span>›</span></button>
        <input id="import-file" class="visually-hidden" type="file" accept="application/json,.json,.apex" />
      </div>
      <div class="settings-group help-group">
        <p class="section-kicker">HELP &amp; INFO</p>
        <div class="settings-row info-row"><span class="settings-icon">ⓘ</span><span class="settings-copy"><b>ABOUT APEXGRID</b><small>Offline racing · automatic desktop and mobile builds</small></span></div>
      </div>
    `;
  }
  if (activeScreen === "workshop") {
    const editing = editorTrack ?? currentTrack();
    const worldMapTools = workshopSource === "world-map"
      ? `
        <div class="map-tools">
          <p class="section-kicker">WORLD MAP SOURCE</p>
          <div class="map-search-row"><input id="map-search" class="text-field" type="search" placeholder="Search any city or circuit" autocomplete="off" /><button class="button button-quiet" data-action="map-search">FIND</button></div>
          <div class="map-search-results" id="map-search-results">${renderMapSearchResults()}</div>
          <div class="map-layer-row"><label class="field-label" for="map-layer">MAP STYLE</label><select id="map-layer"><option value="street" ${mapCamera?.layer === "street" ? "selected" : ""}>Street</option><option value="dark" ${mapCamera?.layer === "dark" ? "selected" : ""}>Dark</option><option value="satellite" ${mapCamera?.layer === "satellite" ? "selected" : ""}>Satellite</option><option value="topographic" ${mapCamera?.layer === "topographic" ? "selected" : ""}>Topographic</option></select></div>
          <div class="map-zoom-row"><span>${mapCamera ? `ZOOM ${mapCamera.zoom}` : "ZOOM 3"}</span><button class="button button-quiet" data-action="map-zoom-out" aria-label="Zoom out">−</button><button class="button button-quiet" data-action="map-zoom-in" aria-label="Zoom in">+</button></div>
          <label class="map-snap-row"><input id="snap-to-road" type="checkbox" ${snapToRoad ? "checked" : ""} ${roadGraphLoading ? "disabled" : ""} /><span><b>SNAP TO ROAD</b><small>${roadGraphLoading ? "Loading nearby roads…" : mapCamera && mapCamera.zoom < 14 ? "Zoom in or search a place first." : "Load nearby roads once; clicks then route locally."}</small></span></label>
        </div>`
      : "";
    return `
      <div class="editor-source-group">
        <p class="section-kicker">START A TRACK FROM</p>
        <div class="editor-source-options" role="group" aria-label="Track background source">
          <button class="editor-source ${workshopSource === "blank" ? "selected" : ""}" data-track-source="blank"><b>BLANK</b><small>Draw freehand</small></button>
          <button class="editor-source ${workshopSource === "png" ? "selected" : ""}" data-track-source="png"><b>PNG IMAGE</b><small>Use an underlay</small></button>
          <button class="editor-source ${workshopSource === "world-map" ? "selected" : ""}" data-track-source="world-map"><b>WORLD MAP</b><small>Trace real roads</small></button>
        </div>
        <input id="track-background-file" class="visually-hidden" type="file" accept="image/png,.png" />
      </div>
      ${worldMapTools}
      ${workshopSource === "png" ? `<p class="source-hint">${editing.backgroundImage ? "Drop another PNG onto the canvas or choose this option again to replace it." : "Choose a PNG underlay or drop one onto the canvas."}</p>` : ""}
      ${workshopSource === "blank" ? `<p class="source-hint">Blank canvas selected. Place waypoints directly on the circuit area.</p>` : ""}
      ${workshopSource !== "world-map" ? `<div class="editor-zoom-row"><span>CANVAS <b class="editor-zoom-label">${Math.round(editorViewport.zoom * 100)}%</b></span><button class="button button-quiet" data-action="map-zoom-out" aria-label="Zoom out">−</button><button class="button button-quiet" data-action="map-zoom-in" aria-label="Zoom in">+</button><button class="button button-quiet" data-action="editor-view-fit">FIT TRACK</button><button class="button button-quiet" data-action="editor-view-reset">RESET</button></div>` : ""}
      <button class="button button-quiet full-width" data-action="export-track">DOWNLOAD .APEX TRACK</button>
      <div class="inspector-head"><span class="section-kicker">CIRCUIT DESIGNER</span><span class="step-number">01 / 03</span></div>
      <h3>Make it yours.</h3><p class="muted">${workshopSource === "world-map" ? "Search, drag to move the map, then click to trace roads." : "Click to add points, drag a point to move it, drag open canvas to pan, and scroll to zoom."}</p>
      <label class="field-label" for="track-name">CIRCUIT NAME</label><input id="track-name" class="text-field" maxlength="32" value="${escapeHtml(editing.name)}" />
      <label class="field-label" for="track-width">ROAD WIDTH <span id="width-value">${Math.round(editing.width)} m</span></label>
      <input id="track-width" class="range-field" type="range" min="40" max="120" step="2" value="${editing.width}" />
      <div class="waypoint-count"><span>PLACED WAYPOINTS</span><b id="waypoint-count">${editing.points.length.toString().padStart(2, "0")}</b></div>
      <div class="note-card"><span class="note-icon">i</span><p>${editing.closed === false ? "Your layout stays open while you draw. Finish it when you are ready to connect the last point to the start." : "This circuit is closed. Reopen it to keep adding points; dragged points can still be adjusted."}</p></div>
      <div class="inspector-actions track-editor-actions"><button class="button button-primary" data-action="close-track" ${editing.points.length < 8 ? "disabled" : ""}>${editing.closed === false ? "FINISH CIRCUIT" : "REOPEN PATH"}</button><button class="button button-quiet" data-action="new-track">NEW LAYOUT</button><button class="button button-quiet danger-text" data-action="clear-points">CLEAR POINTS</button></div>
    `;
  }
  if (activeScreen === "garage") {
    const cards = save.tracks.map((track) => `
      <button class="garage-track ${track.id === save.selectedTrackId ? "selected" : ""}" data-track-id="${escapeHtml(track.id)}">
        <span class="garage-track-icon">⌁</span><span class="garage-track-copy"><b>${escapeHtml(track.name)}</b><small>${formatDistance(trackLength(track)).toUpperCase()}&nbsp; · &nbsp;${track.points.length} POINTS</small></span><span class="garage-check">${track.id === save.selectedTrackId ? "✓" : "›"}</span>
      </button>`).join("");
    return `
      <div class="inspector-head"><span class="section-kicker">YOUR COLLECTION</span><span class="step-number">${save.tracks.length.toString().padStart(2, "0")} TRACKS</span></div>
      <h3>Pick your circuit.</h3><p class="muted">Your circuits and records stay on this device.</p>
      <div class="garage-list">${cards}</div>
      <div class="collection-stats"><div><span>RACES COMPLETE</span><b>${save.racesCompleted.toString().padStart(2, "0")}</b></div><div><span>FASTEST AI LAP</span><b class="small-stat">${formatTime(raceLeaderCar().bestLapSeconds)}</b></div></div>
      <button class="button button-quiet full-width" data-action="export-save">EXPORT GARAGE DATA <span>↓</span></button>
    `;
  }
  if (activeScreen === "race") {
    const activeCar = raceLeaderCar();
    const configLocked = raceStatus === "running" || raceStatus === "paused";
    return `
      <div class="inspector-head"><span class="section-kicker">RACE WEEKEND</span><span class="step-number">${racePhase.toUpperCase()}</span></div>
      <h3>Watch the field race.</h3><p class="muted">${RACE_SERIES[save.settings.series].gridSize} AI drivers qualify, then race ${save.settings.raceLaps} laps. No player controls.</p>
      <label class="field-label" for="race-series">RACING SERIES</label>
      <select id="race-series" class="race-series-select" aria-label="Racing series" ${configLocked ? "disabled" : ""}>
        ${Object.entries(RACE_SERIES).map(([id, series]) => `<option value="${id}" ${save.settings.series === id ? "selected" : ""}>${series.label} · ${series.gridSize} cars</option>`).join("")}
      </select>
      <div class="session-config">
        <label class="field-label" for="qualifying-minutes">QUALIFYING DURATION <span>MINUTES</span></label>
        <input id="qualifying-minutes" class="text-field" type="number" min="1" max="60" step="1" value="${save.settings.qualifyingMinutes}" ${configLocked ? "disabled" : ""} />
        <label class="field-label" for="race-laps">RACE DISTANCE <span>LAPS</span></label>
        <input id="race-laps" class="text-field" type="number" min="1" max="30" step="1" value="${save.settings.raceLaps}" ${configLocked ? "disabled" : ""} />
      </div>
      <div class="race-timing"><span>${racePhase.toUpperCase()}</span><b>${raceStatus === "running" ? "LIVE" : raceStatus === "paused" ? "PAUSED" : raceStatus === "finished" ? "FINISHED" : "READY"}</b></div>
      <div class="lap-grid"><div><span>${racePhase === "qualifying" ? "QUALI TIME LEFT" : "CURRENT LAP"}</span><b>${racePhase === "qualifying" ? formatDuration(Math.max(0, save.settings.qualifyingMinutes * 60 - sessionElapsed)) : currentLapNumber(activeCar)}${racePhase === "race" ? `<small> / ${save.settings.raceLaps}</small>` : ""}</b></div><div><span>BEST LAP</span><b class="time-stat">${formatTime(activeCar.bestLapSeconds)}</b></div></div>
      <div class="race-speed-control">
        <span class="field-label">SIMULATION SPEED</span>
        <div class="race-speed-options" role="group" aria-label="Simulation speed">
          ${([1, 2, 4, 8] as const).map((speed) => `<button class="button button-quiet ${raceSpeed === speed ? "selected" : ""}" data-action="race-speed-${speed}" aria-pressed="${raceSpeed === speed}">${speed}×</button>`).join("")}
        </div>
        <button class="button button-quiet full-width" data-action="skip-to-end" ${raceStatus === "finished" ? "disabled" : ""}>SKIP TO RACE FINISH</button>
      </div>
      <div class="race-camera-panel">
        <span class="field-label">SPECTATOR CAMERA</span>
        <div class="race-camera-buttons"><button class="button button-quiet" data-action="race-camera-out" aria-label="Zoom out">−</button><button class="button button-quiet" data-action="race-camera-reset">FIT TRACK</button><button class="button button-quiet" data-action="race-camera-in" aria-label="Zoom in">+</button></div>
        <small>Scroll over the track or click any leaderboard row to follow a car.</small>
      </div>
      <div class="note-card grid-note"><span class="note-icon">◉</span><p><b>AUTOMATIC GRID</b><br>Every car is driven by AI.<br>No player driving controls.</p></div>
      <div class="inspector-actions"><button class="button button-quiet" data-action="reset-race">RESET SESSION</button><button class="button button-quiet" data-action="go-garage">CHANGE TRACK</button></div>
    `;
  }
  return `
    <div class="inspector-head"><span class="section-kicker">RACE CONTROL</span><span class="step-number">AI GRID</span></div>
    <h3>Ready when you are.</h3><p class="muted">Watch an automatic race on ${escapeHtml(currentTrack().name)} or head to the workshop and draw a new circuit.</p>
    <div class="feature-list">
      <button class="feature-item" data-action="go-race"><span class="feature-icon gold">↗</span><span><b>RACE WEEKEND</b><small>Qualifying then a full AI race</small></span><span class="feature-arrow">→</span></button>
      <button class="feature-item" data-action="go-workshop"><span class="feature-icon mint">⌁</span><span><b>TRACK WORKSHOP</b><small>Build a circuit from scratch</small></span><span class="feature-arrow">→</span></button>
      <button class="feature-item" data-action="go-garage"><span class="feature-icon coral">▤</span><span><b>YOUR GARAGE</b><small>Circuits &amp; driver records</small></span><span class="feature-arrow">→</span></button>
    </div>
    <div class="note-card"><span class="note-icon">i</span><p>Your circuits and race results stay on this device. No account required.</p></div>
  `;
}

function startRaceWeekend(): void {
  previewCar = createCar(currentTrack(), save.settings.raceStart === "rolling");
  raceTrack = createDrivingTrack(currentTrack());
  aiDrivers = createAIFleet(raceTrack, save.settings.series);
  racePhase = "qualifying";
  sessionElapsed = 0;
  raceViewport.zoom = 1;
  raceViewport.panX = 0;
  raceViewport.panY = 0;
  selectedSpectatorDriverId = aiDrivers[0]?.id ?? null;
  raceStatus = "running";
}

function advanceRace(elapsedSeconds: number): void {
  sessionElapsed += elapsedSeconds;
  for (const driver of aiDrivers) {
    stepAIDriver(driver, raceTrack ?? currentTrack(), elapsedSeconds, aiDrivers);
  }
  engineAudio.update(aiDrivers, false, selectedSpectatorDriverId);
  if (racePhase === "qualifying" && sessionElapsed >= save.settings.qualifyingMinutes * 60) {
    aiDrivers.sort(
      (a, b) =>
        (a.car.bestLapSeconds ?? Number.POSITIVE_INFINITY) -
        (b.car.bestLapSeconds ?? Number.POSITIVE_INFINITY),
    );
    for (const driver of aiDrivers) {
      driver.qualifyingBestLapSeconds = driver.car.bestLapSeconds;
    }
    if (raceTrack) arrangeAIFleetOnGrid(raceTrack, aiDrivers);
    racePhase = "race";
    sessionElapsed = 0;
    selectedSpectatorDriverId = aiDrivers[0]?.id ?? null;
    showToast("Qualifying complete. The race grid is set by best lap time.");
    renderScreen();
    return;
  }
  if (racePhase === "race" && aiDrivers.some((driver) => driver.car.lap >= save.settings.raceLaps)) {
    raceStatus = "finished";
    setEngineRunning(false);
    save.racesCompleted += 1;
    commitSave();
    showToast(`Race complete — best lap ${formatTime(raceLeaderCar().bestLapSeconds)}.`);
    renderScreen();
  }
}

async function skipRaceToEnd(): Promise<void> {
  if (raceSkipInProgress || raceStatus === "finished") return;
  if (raceStatus === "ready") startRaceWeekend();
  else raceStatus = "running";
  setEngineRunning(true);
  raceSkipInProgress = true;
  renderScreen();

  let elapsed = 0;
  let stepsSinceYield = 0;
  try {
    while (raceStatus === "running" && elapsed < 7200) {
      advanceRace(0.1);
      elapsed += 0.1;
      stepsSinceYield += 1;
      if (stepsSinceYield >= 40) {
        stepsSinceYield = 0;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    if (raceStatus === "running") {
      raceStatus = "paused";
      setEngineRunning(false);
      showToast("The simulated weekend reached its two-hour safety limit and was paused.", true);
    }
  } catch (error) {
    raceStatus = "paused";
    setEngineRunning(false);
    showToast(error instanceof Error ? error.message : "The race could not be simulated to the finish.", true);
  } finally {
    raceSkipInProgress = false;
    renderScreen();
  }
}

function bindScreenActions(): void {
  elements.inspector.querySelectorAll<HTMLElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action ?? ""));
  });
  elements.actions.querySelectorAll<HTMLElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action ?? ""));
  });
  elements.inspector.querySelectorAll<HTMLButtonElement>("[data-track-id]").forEach((button) => {
    button.addEventListener("click", () => {
      save.selectedTrackId = button.dataset.trackId ?? save.selectedTrackId;
      editorTrack = null;
      aiDrivers = [];
      raceStatus = "ready";
      previewCar = createCar(currentTrack());
      commitSave();
      renderScreen();
    });
  });
  const widthInput = document.querySelector<HTMLInputElement>("#track-width");
  widthInput?.addEventListener("input", () => {
    if (!editorTrack) return;
    editorTrack.width = Number(widthInput.value);
    const label = document.querySelector<HTMLElement>("#width-value");
    if (label) label.textContent = `${editorTrack.width} m`;
    draw();
  });
  document.querySelector<HTMLInputElement>("#track-name")?.addEventListener("input", (event) => {
    if (editorTrack) {
      editorTrack.name = (event.currentTarget as HTMLInputElement).value;
      elements.trackTitle.textContent = editorTrack.name || "Untitled circuit";
    }
  });
  const settingControls = [
    ["#settings-theme", "theme"],
    ["#settings-start", "raceStart"],
    ["#settings-units", "units"],
    ["#settings-audio", "engineSound"],
  ] as const;
  for (const [selector, setting] of settingControls) {
    document.querySelector<HTMLSelectElement>(selector)?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (setting === "theme" && (value === "modern" || value === "classic")) save.settings.theme = value;
      if (setting === "raceStart" && (value === "lights-out" || value === "rolling")) save.settings.raceStart = value;
      if (setting === "units" && (value === "metric" || value === "imperial")) save.settings.units = value;
      if (setting === "engineSound" && (value === "off" || value === "series")) {
        save.settings.engineSound = value;
        setEngineRunning(raceStatus === "running");
      }
      commitSave();
      renderScreen();
      showToast("Preferences saved on this device.");
    });
  }
  document.querySelector<HTMLInputElement>("#qualifying-minutes")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const minutes = Number(input.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      input.value = String(save.settings.qualifyingMinutes);
      showToast("Qualifying must be between 1 and 60 minutes.", true);
      return;
    }
    save.settings.qualifyingMinutes = minutes;
    commitSave();
    renderScreen();
    showToast(`Qualifying set to ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  });
  document.querySelector<HTMLInputElement>("#race-laps")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const laps = Number(input.value);
    if (!Number.isInteger(laps) || laps < 1 || laps > 30) {
      input.value = String(save.settings.raceLaps);
      showToast("Race distance must be between 1 and 30 laps.", true);
      return;
    }
    save.settings.raceLaps = laps;
    commitSave();
    renderScreen();
    showToast(`Race distance set to ${laps} lap${laps === 1 ? "" : "s"}.`);
  });
  document.querySelector<HTMLInputElement>("#map-search")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchMapPlaces();
    }
  });
  document.querySelector<HTMLSelectElement>("#map-layer")?.addEventListener("change", (event) => {
    if (!mapCamera) return;
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value !== "street" && value !== "dark" && value !== "satellite" && value !== "topographic") return;
    mapCamera.layer = value;
    mapCamera.zoom = clampZoom(value, mapCamera.zoom);
    draw();
  });
  document.querySelector<HTMLInputElement>("#snap-to-road")?.addEventListener("change", (event) => {
    void setSnapToRoad((event.currentTarget as HTMLInputElement).checked);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-place-index]").forEach((button) => {
    button.addEventListener("click", () => selectMapPlace(Number(button.dataset.placeIndex)));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-track-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.dataset.trackSource;
      if (source === "blank" || source === "world-map") {
        startNewTrack(source);
      } else if (source === "png") {
        document.querySelector<HTMLInputElement>("#track-background-file")?.click();
      }
    });
  });
  document.querySelector<HTMLInputElement>("#track-background-file")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void loadTrackBackground(file);
  });
  document.querySelector<HTMLSelectElement>("#race-series")?.addEventListener("change", (event) => {
    const series = (event.currentTarget as HTMLSelectElement).value;
    if (!isRaceSeries(series)) return;
    save.settings.series = series;
    raceStatus = "ready";
    racePhase = "qualifying";
    sessionElapsed = 0;
    aiDrivers = [];
    raceTrack = null;
    selectedSpectatorDriverId = null;
    setEngineRunning(false);
    commitSave();
    renderScreen();
    showToast(`${RACE_SERIES[series].label} grid selected.`);
  });
  document.querySelector<HTMLInputElement>("#import-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void importGarageData(file);
  });
}

function startNewTrack(source: "blank" | "png" | "world-map", backgroundImage?: string): void {
  const previousCamera = mapCamera;
  editorTrack = {
    id: crypto.randomUUID(),
    name: source === "world-map" ? "New world circuit" : source === "png" ? "New image circuit" : "Untitled circuit",
    width: 76,
    points: [],
    closed: false,
    createdAt: new Date().toISOString(),
    ...(source === "png" && backgroundImage ? { backgroundImage } : {}),
  };
  workshopSource = source;
  snapToRoad = false;
  selectedWaypointIndex = -1;
  editorViewport.zoom = 1;
  editorViewport.panX = 0;
  editorViewport.panY = 0;
  mapSearchResults = [];
  mapEnabled = source === "world-map";
  mapCamera = source === "world-map"
    ? previousCamera ?? { center: { lat: 20, lon: 0 }, zoom: 3, layer: "street" }
    : null;
  if (mapCamera && source === "world-map") editorTrack.geoReference = createGeoReference(mapCamera);
  renderScreen();
}

async function loadTrackBackground(file: File): Promise<void> {
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
    showToast("Choose a PNG image for the track underlay.", true);
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast("PNG underlays must be smaller than 12 MB.", true);
    return;
  }
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The PNG image could not be decoded."));
      image.src = imageUrl;
    });
    const ratio = Math.min(1, 1600 / image.width, 1100 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const backgroundImage = canvas.toDataURL("image/webp", 0.84);
    if (backgroundImage.length > 1_500_000) {
      throw new Error("That PNG is too detailed to save as a local underlay. Use a smaller image.");
    }
    startNewTrack("png", backgroundImage);
    showToast("PNG underlay loaded. Place waypoints over the image.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The PNG underlay could not be loaded.", true);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function handleAction(action: string): void {
  switch (action) {
    case "go-race":
      selectedScreen("race");
      break;
    case "go-workshop":
      editorTrack = structuredClone(currentTrack());
      selectedScreen("workshop");
      break;
    case "go-garage":
      selectedScreen("garage");
      break;
    case "race-toggle":
      if (raceStatus === "running") raceStatus = "paused";
      else if (raceStatus === "paused") raceStatus = "running";
      else startRaceWeekend();
      setEngineRunning(raceStatus === "running");
      renderScreen();
      break;
    case "race-speed-1":
    case "race-speed-2":
    case "race-speed-4":
    case "race-speed-8":
      raceSpeed = Number(action.slice("race-speed-".length)) as 1 | 2 | 4 | 8;
      renderScreen();
      break;
    case "skip-to-end":
      void skipRaceToEnd();
      break;
    case "race-camera-in":
      raceViewport.zoom = Math.min(7, raceViewport.zoom * 1.25);
      draw();
      break;
    case "race-camera-out":
      raceViewport.zoom = Math.max(0.65, raceViewport.zoom / 1.25);
      draw();
      break;
    case "race-camera-reset":
      raceViewport.zoom = 1;
      raceViewport.panX = 0;
      raceViewport.panY = 0;
      selectedSpectatorDriverId = leadingAIDriver()?.id ?? selectedSpectatorDriverId;
      draw();
      break;
    case "reset-race":
      previewCar = createCar(currentTrack(), save.settings.raceStart === "rolling");
      aiDrivers = [];
      raceTrack = null;
      raceStatus = "ready";
      racePhase = "qualifying";
      sessionElapsed = 0;
      raceSpeed = 1;
      raceSkipInProgress = false;
      selectedSpectatorDriverId = null;
      setEngineRunning(false);
      renderScreen();
      break;
    case "new-track":
      startNewTrack(workshopSource, workshopSource === "png" ? editorTrack?.backgroundImage : undefined);
      break;
    case "clear-points":
      if (editorTrack) {
        editorTrack.points = [];
        editorTrack.closed = false;
        selectedWaypointIndex = -1;
      }
      renderScreen();
      break;
    case "close-track":
      if (!editorTrack) break;
      if (editorTrack.closed !== false) {
        editorTrack.closed = false;
        showToast("Path reopened. Add or move points, then finish the circuit when ready.");
      } else if (editorTrack.points.length < 8) {
        showToast("Add at least 8 points before finishing a circuit.", true);
      } else {
        editorTrack.closed = true;
        showToast("Circuit closed. You can reopen it to keep editing.");
      }
      renderScreen();
      break;
    case "editor-view-reset":
      editorViewport.zoom = 1;
      editorViewport.panX = 0;
      editorViewport.panY = 0;
      elements.underlay.style.transform = "translate(0px, 0px) scale(1)";
      renderScreen();
      break;
    case "editor-view-fit":
      if (renderer && editorTrack) {
        Object.assign(editorViewport, renderer.fitEditorViewport(
          editorTrack.points,
          editorTrack.closed !== false,
          editorTrack.width,
        ));
        elements.underlay.style.transform =
          `translate(${editorViewport.panX}px, ${editorViewport.panY}px) scale(${editorViewport.zoom})`;
        renderScreen();
      }
      break;
    case "map-search":
      void searchMapPlaces();
      break;
    case "map-zoom-in":
    case "map-zoom-out":
      if (mapEnabled && mapCamera) {
        mapCamera.zoom = clampZoom(
          mapCamera.layer,
          mapCamera.zoom + (action === "map-zoom-in" ? 1 : -1),
        );
        if (snapToRoad && mapCamera.zoom < 14) snapToRoad = false;
      } else {
        editorViewport.zoom = Math.max(
          0.000001,
          Math.min(5, editorViewport.zoom * (action === "map-zoom-in" ? 1.2 : 1 / 1.2)),
        );
        elements.underlay.style.transform =
          `translate(${editorViewport.panX}px, ${editorViewport.panY}px) scale(${editorViewport.zoom})`;
      }
      renderScreen();
      break;
    case "save-track":
      saveEditorTrack();
      break;
    case "export-save":
      exportSave();
      break;
    case "export-track":
      exportTrack();
      break;
    case "import-save":
      document.querySelector<HTMLInputElement>("#import-file")?.click();
      break;
    default:
      break;
  }
}

function saveEditorTrack(): void {
  if (!editorTrack) return;
  const nameInput = document.querySelector<HTMLInputElement>("#track-name");
  if (nameInput) editorTrack.name = nameInput.value.trim();
  if (editorTrack.name.length === 0) {
    showToast("Give your circuit a name before saving.", true);
    return;
  }
  if (editorTrack.closed === false) {
    showToast("Finish the circuit before saving it to your garage.", true);
    return;
  }
  if (!isValidTrack(editorTrack)) {
    showToast("Add at least 8 waypoints inside the map before saving.", true);
    return;
  }
  const index = save.tracks.findIndex((track) => track.id === editorTrack?.id);
  if (index === -1) save.tracks.push(structuredClone(editorTrack));
  else save.tracks[index] = structuredClone(editorTrack);
  save.selectedTrackId = editorTrack.id;
  previewCar = createCar(currentTrack());
  aiDrivers = [];
  raceStatus = "ready";
  commitSave();
  showToast(`${editorTrack.name} saved to your garage.`);
  selectedScreen("garage");
}

function exportSave(): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "apexgrid-garage.json";
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Garage backup downloaded.");
}

function exportTrack(): void {
  if (!editorTrack) return;
  const nameInput = document.querySelector<HTMLInputElement>("#track-name");
  if (nameInput) editorTrack.name = nameInput.value.trim();
  if (editorTrack.closed === false) {
    showToast("Finish the circuit before exporting it.", true);
    return;
  }
  if (!isValidTrack(editorTrack)) {
    showToast("Add at least 8 valid waypoints before exporting this track.", true);
    return;
  }
  const blob = new Blob([JSON.stringify(editorTrack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = editorTrack.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  anchor.href = url;
  anchor.download = `${safeName || "apexgrid-track"}.apex`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(`${editorTrack.name} downloaded as an .apex track.`);
}

async function importGarageData(file: File): Promise<void> {
  if (file.size > 2 * 1024 * 1024) {
    showToast("Import files must be smaller than 2 MB.", true);
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showToast("That file is not valid JSON.", true);
    return;
  }
  const candidates =
    typeof parsed === "object" && parsed !== null && "tracks" in parsed && Array.isArray(parsed.tracks)
      ? parsed.tracks
      : Array.isArray(parsed)
        ? parsed
        : [parsed];
  const importedTracks = candidates.filter((candidate): candidate is Track => isValidTrack(candidate));
  if (importedTracks.length === 0) {
    showToast("No valid ApexGrid circuits were found in that file.", true);
    return;
  }
  for (const track of importedTracks) {
    const index = save.tracks.findIndex((existing) => existing.id === track.id);
    if (index < 0) save.tracks.push(structuredClone(track));
    else save.tracks[index] = structuredClone(track);
  }
  save.selectedTrackId = importedTracks[0].id;
  editorTrack = null;
  raceStatus = "ready";
  previewCar = createCar(currentTrack());
  try {
    commitSave();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The imported circuits could not be saved.", true);
    return;
  }
  renderScreen();
  showToast(`${importedTracks.length} circuit${importedTracks.length === 1 ? "" : "s"} imported.`);
}

function formatDistance(length: number): string {
  if (save.settings.units === "imperial") return `${(length / 1609.344).toFixed(2)} mi`;
  return `${(length / 1000).toFixed(2)} km`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

function draw(): void {
  if (!renderer) return;
  const track = activeScreen === "workshop" ? editorTrack ?? currentTrack() : currentTrack();
  renderer.draw(
    track,
    activeScreen === "workshop" ? editorTrack?.points ?? [] : undefined,
    activeScreen === "race" ? aiDrivers : [],
    activeScreen === "workshop" && mapEnabled ? mapCamera ?? undefined : undefined,
    activeScreen === "workshop" && !mapEnabled
      ? editorViewport
      : activeScreen === "race"
        ? raceViewport
        : undefined,
    activeScreen === "workshop" ? selectedWaypointIndex : -1,
    activeScreen === "race" ? spectatedAIDriver()?.car : undefined,
    activeScreen === "race" ? selectedSpectatorDriverId : undefined,
  );
  const zoomLabel = document.querySelector<HTMLElement>(".editor-zoom-label");
  if (zoomLabel && activeScreen === "workshop") zoomLabel.textContent = `${Math.round(editorViewport.zoom * 100)}%`;
  updateRaceHud();
}

function updateRaceHud(): void {
  const activeCar = activeScreen === "race"
    ? spectatedAIDriver()?.car ?? raceLeaderCar()
    : raceLeaderCar();
  const speed = document.querySelector<HTMLElement>("#speed-readout");
  if (speed) {
    const speedValue = activeCar.speed * (save.settings.units === "imperial" ? 2.23694 : 3.6);
    speed.textContent = Math.round(speedValue).toString().padStart(3, "0");
  }
  const speedUnit = document.querySelector<HTMLElement>("#speed-unit");
  if (speedUnit) speedUnit.textContent = save.settings.units === "imperial" ? "MPH" : "KM/H";
  const lapTime = document.querySelector<HTMLElement>("#live-lap-time");
  if (lapTime) lapTime.textContent = formatTime(activeCar.lapSeconds);
  const lapNumber = document.querySelector<HTMLElement>("#live-lap-number");
  const phaseLabel = document.querySelector<HTMLElement>("#hud-phase-label");
  if (phaseLabel) phaseLabel.textContent = racePhase === "qualifying" ? "QUALI" : "LAP";
  if (lapNumber) {
    lapNumber.textContent = racePhase === "qualifying"
      ? formatDuration(Math.max(0, save.settings.qualifyingMinutes * 60 - sessionElapsed))
      : `${currentLapNumber(activeCar)} / ${save.settings.raceLaps}`;
  }
  const progress = document.querySelector<HTMLElement>("#lap-progress");
  if (progress) {
    const percent = racePhase === "qualifying"
      ? (sessionElapsed / (save.settings.qualifyingMinutes * 60)) * 100
      : (activeCar.progressIndex / (raceTrack ?? currentTrack()).points.length) * 100;
    progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
  const count = document.querySelector<HTMLElement>("#waypoint-count");
  if (count && editorTrack) count.textContent = editorTrack.points.length.toString().padStart(2, "0");
  if (
    aiDrivers.length > 0 &&
    performance.now() - lastStandingsRefresh > 800 &&
    !elements.classification.contains(document.activeElement)
  ) {
    updateClassification();
    lastStandingsRefresh = performance.now();
  }
}

function aiProgress(driver: AIDriver): number {
  return driver.car.lap * (raceTrack ?? currentTrack()).points.length + driver.car.progressIndex;
}

function leadingAIDriver(): AIDriver | undefined {
  return [...aiDrivers].sort((a, b) => aiProgress(b) - aiProgress(a))[0];
}

function updateClassification(): void {
  const entries = aiDrivers.map((driver) => ({
    driver,
    progress: aiProgress(driver),
  }));
  if (racePhase === "qualifying") {
    entries.sort((a, b) =>
      (a.driver.car.bestLapSeconds ?? Number.POSITIVE_INFINITY) -
      (b.driver.car.bestLapSeconds ?? Number.POSITIVE_INFINITY));
  } else {
    entries.sort((a, b) => b.progress - a.progress);
  }
  const leaderProgress = entries[0]?.progress ?? 0;
  elements.classification.innerHTML = `
    <div class="classification-head"><span>${racePhase.toUpperCase()} · ${escapeHtml(RACE_SERIES[save.settings.series].label.toUpperCase())}</span><b>${entries.length} CARS</b></div>
    ${entries.map((entry, index) => `
      <button class="classification-row ${entry.driver.id === selectedSpectatorDriverId ? "selected" : ""}" type="button" data-spectate-driver="${escapeHtml(entry.driver.id)}" aria-pressed="${entry.driver.id === selectedSpectatorDriverId}">
        <b class="classification-position">${index + 1}</b><i style="--team-color:#${entry.driver.color.toString(16).padStart(6, "0")}"></i>
        <span>${escapeHtml(entry.driver.name)}</span><small>${racePhase === "qualifying"
          ? formatTime(entry.driver.car.bestLapSeconds)
          : index === 0 ? "LEADER" : `+${(leaderProgress - entry.progress).toFixed(0)}`}</small>
      </button>`).join("")}
  `;
  elements.classification.querySelectorAll<HTMLButtonElement>("[data-spectate-driver]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSpectatorDriverId = button.dataset.spectateDriver ?? null;
      elements.classification.querySelectorAll<HTMLButtonElement>("[data-spectate-driver]").forEach((row) => {
        const selected = row === button;
        row.classList.toggle("selected", selected);
        row.setAttribute("aria-pressed", String(selected));
      });
      draw();
    });
  });
}

function setEngineRunning(running: boolean): void {
  try {
    void engineAudio.setRunning(
      running,
      aiDrivers,
      save.settings.engineSound !== "off",
      selectedSpectatorDriverId,
    ).catch((error: unknown) => {
      console.error("ApexGrid engine audio could not start.", error);
      showToast(error instanceof Error ? error.message : "Engine audio is unavailable.", true);
    });
  } catch (error) {
    console.error("ApexGrid engine audio could not start.", error);
    showToast(error instanceof Error ? error.message : "Engine audio is unavailable.", true);
  }
}

document.querySelectorAll<HTMLButtonElement>(".rail-link").forEach((button) => {
  button.addEventListener("click", () => selectedScreen(button.dataset.screen as Screen));
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeScreen === "race" && raceStatus === "running") {
    raceStatus = "paused";
    setEngineRunning(false);
    renderScreen();
  }
  if (
    activeScreen === "workshop" &&
    (event.key === "Delete" || event.key === "Backspace") &&
    selectedWaypointIndex >= 0 &&
    !(event.target instanceof HTMLInputElement)
  ) {
    editorTrack?.points.splice(selectedWaypointIndex, 1);
    selectedWaypointIndex = -1;
    event.preventDefault();
    draw();
    updateEditorCounters();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && raceStatus === "running") {
    raceStatus = "paused";
    setEngineRunning(false);
    renderScreen();
    showToast("Race paused while the app is in the background.");
  }
});

let renderer: TrackRenderer | null = null;
const pixi = new Application();
await pixi.init({
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  autoStart: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  resizeTo: elements.mount,
});
elements.mount.appendChild(pixi.canvas);
pixi.canvas.setAttribute("aria-label", "Top-down circuit map");
pixi.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
pixi.canvas.addEventListener("pointerdown", beginEditorGesture);
pixi.canvas.addEventListener("pointermove", moveEditorGesture);
pixi.canvas.addEventListener("pointerup", endEditorGesture);
pixi.canvas.addEventListener("pointercancel", endEditorGesture);
pixi.canvas.addEventListener("wheel", zoomEditorAtPointer, { passive: false });
pixi.canvas.style.touchAction = "none";
pixi.canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  if (raceStatus === "running") raceStatus = "paused";
  setEngineRunning(false);
  renderScreen();
  showToast("Graphics paused after a device reset. Reload the app to restore the track view.", true);
});
elements.canvasWrap.addEventListener("dragover", (event) => {
  if (activeScreen !== "workshop" || !Array.from(event.dataTransfer?.items ?? []).some((item) => item.type === "image/png")) return;
  event.preventDefault();
  elements.canvasWrap.classList.add("drop-target");
});
elements.canvasWrap.addEventListener("dragleave", (event) => {
  if (!elements.canvasWrap.contains(event.relatedTarget as Node | null)) {
    elements.canvasWrap.classList.remove("drop-target");
  }
});
elements.canvasWrap.addEventListener("drop", (event) => {
  elements.canvasWrap.classList.remove("drop-target");
  if (activeScreen !== "workshop") return;
  const file = Array.from(event.dataTransfer?.files ?? []).find(
    (candidate) => candidate.type === "image/png" || candidate.name.toLowerCase().endsWith(".png"),
  );
  if (!file) return;
  event.preventDefault();
  void loadTrackBackground(file);
});

function beginEditorGesture(event: PointerEvent): void {
  if (activeScreen !== "workshop" || !editorTrack || !renderer || event.button > 2) return;
  if (event.button === 0 && mapRoutePending) return;
  event.preventDefault();
  const rect = pixi.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const pointIndex = event.button === 0
    ? editorTrack.points.findIndex((point) => {
        const screen = renderer!.toScreen(
          point,
          mapEnabled ? mapCamera ?? undefined : undefined,
          mapEnabled ? editorTrack?.geoReference : undefined,
          !mapEnabled ? editorViewport : undefined,
        );
        return Math.hypot(screen.x - x, screen.y - y) <= 14;
      })
    : -1;
  selectedWaypointIndex = pointIndex;
  editorGesture = {
    pointerId: event.pointerId,
    mode: event.button === 0 && pointIndex >= 0 ? "point" : event.button === 0 ? "pending" : "pan",
    pointIndex,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
  };
  pixi.canvas.setPointerCapture(event.pointerId);
  draw();
}

function moveEditorGesture(event: PointerEvent): void {
  const gesture = editorGesture;
  if (!gesture || gesture.pointerId !== event.pointerId || !editorTrack || !renderer) return;
  const totalMovement = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
  if (totalMovement > 4) gesture.moved = true;
  if (gesture.mode === "pending" && gesture.moved) gesture.mode = "pan";

  if (gesture.mode === "point" && gesture.moved) {
    const camera = mapEnabled ? mapCamera ?? undefined : undefined;
    const point = renderer.toWorld(
      event.clientX,
      event.clientY,
      camera,
      mapEnabled ? editorTrack.geoReference : undefined,
      !mapEnabled ? editorViewport : undefined,
    );
    editorTrack.points[gesture.pointIndex] = {
      x: point.x,
      y: point.y,
    };
    draw();
    updateEditorCounters();
  } else if (gesture.mode === "pan") {
    panEditor(event.clientX - gesture.lastX, event.clientY - gesture.lastY);
  }
  gesture.lastX = event.clientX;
  gesture.lastY = event.clientY;
}

function endEditorGesture(event: PointerEvent): void {
  const gesture = editorGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  editorGesture = null;
  if (pixi.canvas.hasPointerCapture(event.pointerId)) pixi.canvas.releasePointerCapture(event.pointerId);

  if (event.type === "pointerup" && gesture.mode === "pending" && !gesture.moved && renderer && editorTrack) {
    const point = renderer.toWorld(
      event.clientX,
      event.clientY,
      mapEnabled ? mapCamera ?? undefined : undefined,
      mapEnabled ? editorTrack.geoReference : undefined,
      !mapEnabled ? editorViewport : undefined,
    );
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) void placeEditorWaypoint(point);
  } else if (event.type === "pointerup" && gesture.mode === "point" && gesture.moved) {
    void finishWaypointDrag(gesture.pointIndex);
  } else {
    draw();
  }
}

function panEditor(deltaX: number, deltaY: number): void {
  if (mapEnabled && mapCamera) {
    const width = elements.mount.clientWidth;
    const height = elements.mount.clientHeight;
    mapCamera.center = screenToGeo(
      { x: width / 2 - deltaX, y: height / 2 - deltaY },
      mapCamera,
      width,
      height,
    );
  } else {
    editorViewport.panX += deltaX;
    editorViewport.panY += deltaY;
    elements.underlay.style.transform =
      `translate(${editorViewport.panX}px, ${editorViewport.panY}px) scale(${editorViewport.zoom})`;
  }
  draw();
}

function zoomEditorAtPointer(event: WheelEvent): void {
  if (activeScreen === "race") {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    raceViewport.zoom = Math.max(
      0.65,
      Math.min(7, raceViewport.zoom * (direction > 0 ? 1.12 : 1 / 1.12)),
    );
    draw();
    return;
  }
  if (activeScreen !== "workshop") return;
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  if (mapEnabled && mapCamera) {
    mapCamera.zoom = clampZoom(mapCamera.layer, mapCamera.zoom + direction);
    if (snapToRoad && mapCamera.zoom < 14) snapToRoad = false;
    renderScreen();
    return;
  }

  const rect = pixi.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const centerX = elements.mount.clientWidth / 2;
  const centerY = elements.mount.clientHeight / 2;
  const previousZoom = editorViewport.zoom;
  const nextZoom = Math.max(0.000001, Math.min(5, previousZoom * (direction > 0 ? 1.12 : 1 / 1.12)));
  editorViewport.panX = x - centerX - ((x - centerX - editorViewport.panX) / previousZoom) * nextZoom;
  editorViewport.panY = y - centerY - ((y - centerY - editorViewport.panY) / previousZoom) * nextZoom;
  editorViewport.zoom = nextZoom;
  elements.underlay.style.transform =
    `translate(${editorViewport.panX}px, ${editorViewport.panY}px) scale(${editorViewport.zoom})`;
  const label = document.querySelector<HTMLElement>(".editor-zoom-label");
  if (label) label.textContent = `${Math.round(editorViewport.zoom * 100)}%`;
  draw();
}

async function placeEditorWaypoint(point: Point): Promise<void> {
  if (!editorTrack) return;
  if (editorTrack.closed !== false) {
    showToast("Reopen the path before adding more points.", true);
    return;
  }
  if (!snapToRoad || !mapCamera || !editorTrack.geoReference) {
    editorTrack.points.push(point);
    selectedWaypointIndex = editorTrack.points.length - 1;
    draw();
    updateEditorCounters();
    return;
  }
  if (mapRoutePending) return;
  mapRoutePending = true;
  const reference = editorTrack.geoReference;
  const projection = {
    center: { lat: reference.centerLat, lon: reference.centerLon },
    zoom: reference.zoom,
    pixelsPerWorldUnit: reference.pixelsPerWorldUnit,
  };
  const clickedGeo = trackWorldToGeo(point, projection);
  try {
    const previous = editorTrack.points.at(-1);
    const route = previous
      ? (() => {
          const previousGeo = trackWorldToGeo(previous, projection);
          return geographicDistanceMeters(previousGeo, clickedGeo) > 10_000
            ? mapRouter.routeLongDistance([previousGeo, clickedGeo])
            : Promise.resolve(mapRouter.routeBetween(previousGeo, clickedGeo));
        })()
      : Promise.resolve([mapRouter.snapPoint(clickedGeo)]);
    const geoPoints = await route;
    const worldPoints = geoPoints.map((geo) => geoToTrackWorld(geo, projection));
    if (previous) worldPoints.shift();
    if (worldPoints.length === 0) {
      showToast("That route falls outside the current track area.", true);
      return;
    }
    editorTrack.points.push(...worldPoints);
    selectedWaypointIndex = editorTrack.points.length - 1;
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The road route could not be calculated.", true);
  } finally {
    mapRoutePending = false;
    draw();
    updateEditorCounters();
  }
}

async function finishWaypointDrag(index: number): Promise<void> {
  if (!editorTrack || !snapToRoad || !mapCamera || !editorTrack.geoReference) {
    draw();
    return;
  }
  try {
    const point = editorTrack.points[index];
    const reference = editorTrack.geoReference;
    const projection = {
      center: { lat: reference.centerLat, lon: reference.centerLon },
      zoom: reference.zoom,
      pixelsPerWorldUnit: reference.pixelsPerWorldUnit,
    };
    const snapped = mapRouter.snapPoint(trackWorldToGeo(point, projection));
    editorTrack.points[index] = geoToTrackWorld(snapped, projection);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The waypoint could not be snapped to a road.", true);
  }
  draw();
}

function updateEditorCounters(): void {
  if (!editorTrack) return;
  const count = document.querySelector<HTMLElement>("#waypoint-count");
  if (count) count.textContent = editorTrack.points.length.toString().padStart(2, "0");
  const finishButton = document.querySelector<HTMLButtonElement>('[data-action="close-track"]');
  if (finishButton) finishButton.disabled = editorTrack.closed === false && editorTrack.points.length < 8;
  elements.trackState.textContent = `${editorTrack.points.length} WAYPOINTS`;
  elements.trackLength.textContent = formatDistance(trackLength(editorTrack));
}

function geographicDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const radians = Math.PI / 180;
  const latitudeA = a.lat * radians;
  const latitudeB = b.lat * radians;
  const deltaLatitude = (b.lat - a.lat) * radians;
  const deltaLongitude = (b.lon - a.lon) * radians;
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(haversine));
}

function isRaceSeries(value: string): value is RaceSeries {
  return value === "f1" || value === "f2" || value === "f3" || value === "gt3" || value === "prototype";
}
renderer = new TrackRenderer(pixi, tileProvider, (error) => {
  console.warn("ApexGrid map tile could not be loaded.", error);
  if (Date.now() - lastTileErrorToast < 10_000) return;
  lastTileErrorToast = Date.now();
  showToast(error.message, true);
});
try {
  await renderer.loadVehicleTextures();
} catch (error) {
  console.error("ApexGrid vehicle sprites could not be loaded.", error);
  showToast(
    error instanceof Error
      ? `Vehicle sprites could not be loaded: ${error.message}. Simplified cars are shown instead.`
      : "Vehicle sprites could not be loaded. Simplified cars are shown instead.",
    true,
  );
}
previewCar = createCar(currentTrack());
renderScreen();
lastFrame = performance.now();
function frame(now: number): void {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  try {
    if (activeScreen === "race" && raceStatus === "running" && !raceSkipInProgress) {
      let remaining = elapsed * raceSpeed;
      while (remaining > 0 && raceStatus === "running") {
        const step = Math.min(0.1, remaining);
        advanceRace(step);
        remaining -= step;
      }
    }
  } catch (error) {
    raceStatus = "paused";
    setEngineRunning(false);
    console.error("ApexGrid race simulation paused after an error.", error);
    showToast(error instanceof Error ? `Race paused: ${error.message}` : "Race paused after a simulation error.", true);
    renderScreen();
  }
  try {
    draw();
    pixi.render();
  } catch (error) {
    console.error("ApexGrid render failed.", error);
    showToast("Track rendering failed. Reload the app to restore the graphics.", true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export { type SaveData };
