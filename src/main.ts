import "./style.css";
import { Application } from "pixi.js";
import { createAIFleet, stepAIDriver, type AIDriver } from "./domain/ai";
import { createCar, type CarState } from "./domain/physics";
import { isValidTrack, trackLength, WORLD, type Point, type Track } from "./domain/track";
import { TrackRenderer } from "./render/trackRenderer";
import { loadSave, persistSave, type SaveData } from "./platform/storage";
import { EngineAudio } from "./platform/engineAudio";

type Screen = "overview" | "race" | "workshop" | "garage" | "settings";
type RaceStatus = "ready" | "running" | "paused" | "finished";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("ApexGrid app root is missing.");

appRoot.innerHTML = `
  <div class="app-frame">
    <aside class="rail" aria-label="Primary navigation">
      <a class="brand-mark" href="#" aria-label="ApexGrid home">A<span>G</span></a>
      <div class="rail-rule"></div>
      <button class="rail-link active" data-screen="overview" aria-label="Overview" title="Overview"><span class="rail-icon">⌂</span><span class="rail-label">Home</span></button>
      <button class="rail-link" data-screen="race" aria-label="Practice" title="Practice"><span class="rail-icon">◉</span><span class="rail-label">Race</span></button>
      <button class="rail-link" data-screen="workshop" aria-label="Track workshop" title="Track workshop"><span class="rail-icon">⌁</span><span class="rail-label">Build</span></button>
      <button class="rail-link" data-screen="garage" aria-label="Circuits" title="Circuits"><span class="rail-icon">▤</span><span class="rail-label">Circuits</span></button>
      <button class="rail-link" data-screen="settings" aria-label="Settings" title="Settings"><span class="rail-icon">⚙</span><span class="rail-label">Settings</span></button>
      <div class="rail-bottom"><span class="online-dot"></span><span>LOCAL</span></div>
    </aside>
    <div class="main-frame">
      <header class="topbar">
        <div class="wordmark">APEX<span>GRID</span><small>SIMULATOR</small></div>
        <div class="topbar-meta"><span class="save-indicator"><i></i> SAVED LOCALLY</span><span class="avatar">AG</span></div>
      </header>
      <main class="content">
        <div class="page-heading">
          <div><p class="eyebrow" id="eyebrow">MOTORSPORT, YOUR WAY</p><h1 id="page-title">Welcome to ApexGrid</h1><p class="page-subtitle" id="page-subtitle">Build a circuit. Find your line. Leave your mark.</p></div>
          <div class="heading-meta"><span class="season-tag">SEASON <b>01</b></span><span class="season-tag"><b>OFFLINE</b> READY</span></div>
        </div>
        <section class="workbench" id="workbench">
          <div class="track-card">
            <div class="track-card-top"><div><span class="section-kicker" id="track-kicker">FEATURED CIRCUIT</span><h2 id="track-title">Copper Circuit</h2></div><div class="track-pill"><span></span><span id="track-state">PRACTICE READY</span></div></div>
            <div class="canvas-wrap" id="canvas-wrap"><div id="track-canvas"></div><div class="canvas-overlay"><span>WORLD TOUR&nbsp; / &nbsp;01</span><span>TRACK MAP&nbsp; · &nbsp;2D</span></div>
              <div id="race-classification" class="race-classification" aria-live="polite"></div>
              <div class="race-hud"><div class="speed-box"><b id="speed-readout">000</b><span id="speed-unit">KM/H</span></div><div class="race-hud-right"><span>LAP <b id="live-lap-number">1 / 3</b></span><strong id="live-lap-time">00:00.000</strong></div><div class="lap-track"><i id="lap-progress"></i></div></div>
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
        <footer class="footer"><span><i class="online-dot"></i> ALL SYSTEMS OPERATIONAL</span><span>APEXGRID ENGINE <b>0.1.0</b> <span class="footer-divider">·</span> BUILT FOR THE GRID</span></footer>
      </main>
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </div>
`;

const elements = {
  mount: document.querySelector<HTMLDivElement>("#track-canvas")!,
  workbench: document.querySelector<HTMLElement>("#workbench")!,
  canvasWrap: document.querySelector<HTMLDivElement>("#canvas-wrap")!,
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

const save = loadSave();
const engineAudio = new EngineAudio();
let activeScreen: Screen = "overview";
let raceStatus: RaceStatus = "ready";
let previewCar: CarState;
let aiDrivers: AIDriver[] = [];
let editorTrack: Track | null = null;
let lastFrame = 0;
let lastStandingsRefresh = 0;
let toastTimer = 0;

function currentTrack(): Track {
  return save.tracks.find((track) => track.id === save.selectedTrackId) ?? save.tracks[0];
}

function raceLeaderCar(): CarState {
  return leadingAIDriver()?.car ?? previewCar;
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

function selectedScreen(screen: Screen): void {
  if (screen === "workshop" && !editorTrack) {
    editorTrack = structuredClone(currentTrack());
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
    overview: ["MOTORSPORT, YOUR WAY", "Welcome to ApexGrid", "Build a circuit. Find your line. Leave your mark."],
    race: ["RACE CONTROL  /  PRACTICE", "Time to hit the track", "A clean lap starts with a clear head."],
    workshop: ["APEXGRID CREATOR  /  CIRCUIT LAB", "Design your next challenge", "Place waypoints on the map to shape your circuit."],
    garage: ["DRIVER HQ  /  COLLECTION", "Your motorsport garage", "Choose a circuit and make it yours."],
    settings: ["PREFERENCES  /  LOCAL PROFILE", "Settings", "Tune your race experience and manage local data."],
  };
  const [eyebrow, title, subtitle] = headings[activeScreen];
  elements.eyebrow.textContent = eyebrow;
  elements.title.textContent = title;
  elements.subtitle.textContent = subtitle;
  elements.trackKicker.textContent =
    activeScreen === "workshop" ? "CIRCUIT PREVIEW" : activeScreen === "garage" ? "SELECTED CIRCUIT" : "FEATURED CIRCUIT";
  elements.trackTitle.textContent = activeScreen === "workshop" && editorTrack ? editorTrack.name : track.name;
  elements.trackLength.textContent = formatDistance(trackLength(track));
  elements.bestLap.textContent = formatTime(raceLeaderCar().bestLapSeconds);
  elements.trackLayout.textContent = activeScreen === "workshop" ? "Custom layout" : "Club circuit";
  elements.trackState.textContent =
    activeScreen === "workshop" ? `${editorTrack?.points.length ?? 0} WAYPOINTS` :
      raceStatus === "running" ? "SESSION LIVE" :
        raceStatus === "paused" ? "SESSION PAUSED" :
          raceStatus === "finished" ? "SESSION COMPLETE" : "PRACTICE READY";
  elements.trackState.parentElement?.classList.toggle("live", raceStatus === "running");
  elements.canvasWrap.classList.toggle("editing", activeScreen === "workshop");
  elements.canvasWrap.classList.toggle("racing", activeScreen === "race");
  elements.classification.classList.toggle("visible", activeScreen === "race" && raceStatus !== "ready" && aiDrivers.length > 0);
  elements.workbench.classList.toggle("settings-mode", activeScreen === "settings");
  document.documentElement.dataset.theme = save.settings.theme;
  elements.inspector.innerHTML = renderInspector();
  elements.actions.innerHTML = renderTrackActions();
  bindScreenActions();
  draw();
}

function renderTrackActions(): string {
  if (activeScreen === "race") {
    const label = raceStatus === "running" ? "PAUSE SESSION" : raceStatus === "paused" ? "RESUME SESSION" : "START PRACTICE";
    return `<button class="button button-primary" data-action="race-toggle">${label}<span>↗</span></button>`;
  }
  if (activeScreen === "workshop") {
    return `<button class="button button-primary" data-action="save-track">SAVE CIRCUIT<span>↗</span></button>`;
  }
  if (activeScreen === "settings") return "";
  return `<button class="button button-primary" data-action="go-race">START PRACTICE<span>↗</span></button>`;
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
        <div class="settings-row"><span class="settings-icon">◖</span><span class="settings-copy"><b>ENGINE SOUND</b><small>Procedural engine tone</small></span><select id="settings-audio" aria-label="Engine sound"><option value="off" ${save.settings.engineSound === "off" ? "selected" : ""}>Off</option><option value="engine-e" ${save.settings.engineSound === "engine-e" ? "selected" : ""}>Engine E</option><option value="engine-v" ${save.settings.engineSound === "engine-v" ? "selected" : ""}>Engine V</option></select></div>
      </div>
      <div class="settings-group">
        <p class="section-kicker">FILES</p>
        <button class="settings-file" data-action="export-save"><span class="settings-icon">↑</span><b>EXPORT GARAGE DATA</b><span>›</span></button>
        <button class="settings-file" data-action="import-save"><span class="settings-icon">↓</span><b>IMPORT CIRCUITS</b><span>›</span></button>
        <input id="import-file" class="visually-hidden" type="file" accept="application/json,.json" />
      </div>
      <div class="settings-group help-group">
        <p class="section-kicker">HELP &amp; INFO</p>
        <div class="settings-row info-row"><span class="settings-icon">ⓘ</span><span class="settings-copy"><b>ABOUT APEXGRID</b><small>Offline motorsport sandbox · v0.1.0</small></span></div>
      </div>
    `;
  }
  if (activeScreen === "workshop") {
    const editing = editorTrack ?? currentTrack();
    return `
      <div class="inspector-head"><span class="section-kicker">CIRCUIT DESIGNER</span><span class="step-number">01 / 03</span></div>
      <h3>Make it yours.</h3><p class="muted">Click the map to place connected points. Use at least 8 waypoints for a valid lap.</p>
      <label class="field-label" for="track-name">CIRCUIT NAME</label><input id="track-name" class="text-field" maxlength="32" value="${escapeHtml(editing.name)}" />
      <label class="field-label" for="track-width">ROAD WIDTH <span id="width-value">${Math.round(editing.width)} m</span></label>
      <input id="track-width" class="range-field" type="range" min="40" max="120" step="2" value="${editing.width}" />
      <div class="waypoint-count"><span>PLACED WAYPOINTS</span><b id="waypoint-count">${editing.points.length.toString().padStart(2, "0")}</b></div>
      <div class="note-card"><span class="note-icon">i</span><p>Connect your final waypoint back toward the start to close the lap. The road surface joins automatically.</p></div>
      <div class="inspector-actions"><button class="button button-quiet" data-action="new-track">NEW LAYOUT</button><button class="button button-quiet danger-text" data-action="clear-points">CLEAR POINTS</button></div>
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
    return `
      <div class="inspector-head"><span class="section-kicker">SESSION CONTROL</span><span class="step-number">PRACTICE</span></div>
      <h3>Watch the field race.</h3><p class="muted">Six automatic drivers compete for the three-lap finish on ${escapeHtml(currentTrack().name)}.</p>
      <div class="race-timing"><span>SESSION</span><b>${raceStatus === "running" ? "LIVE" : raceStatus === "paused" ? "PAUSED" : raceStatus === "finished" ? "FINISHED" : "READY"}</b></div>
      <div class="lap-grid"><div><span>CURRENT LAP</span><b>${activeCar.lap + 1}<small> / 3</small></b></div><div><span>LAST LAP</span><b class="time-stat">${formatTime(activeCar.lastLapSeconds)}</b></div></div>
      <div class="note-card grid-note"><span class="note-icon">◉</span><p><b>AUTOMATIC GRID</b><br>Every car is driven by AI.<br>No player driving controls.</p></div>
      <div class="inspector-actions"><button class="button button-quiet" data-action="reset-race">RESET SESSION</button><button class="button button-quiet" data-action="go-garage">CHANGE TRACK</button></div>
    `;
  }
  return `
    <div class="inspector-head"><span class="section-kicker">DRIVER DASHBOARD</span><span class="step-number">ROOKIE</span></div>
    <h3>Ready when you are.</h3><p class="muted">Watch an automatic race on ${escapeHtml(currentTrack().name)} or head to the workshop and draw a new circuit.</p>
    <div class="feature-list">
      <button class="feature-item" data-action="go-race"><span class="feature-icon gold">↗</span><span><b>QUICK PRACTICE</b><small>Three-lap time trial</small></span><span class="feature-arrow">→</span></button>
      <button class="feature-item" data-action="go-workshop"><span class="feature-icon mint">⌁</span><span><b>TRACK WORKSHOP</b><small>Build a circuit from scratch</small></span><span class="feature-arrow">→</span></button>
      <button class="feature-item" data-action="go-garage"><span class="feature-icon coral">▤</span><span><b>YOUR GARAGE</b><small>Circuits &amp; driver records</small></span><span class="feature-arrow">→</span></button>
    </div>
    <div class="season-card"><span class="season-emblem">01</span><div><span class="section-kicker">ROOKIE SERIES</span><b>Road to the podium</b><small>${save.racesCompleted} ${save.racesCompleted === 1 ? "race" : "races"} completed</small></div><span class="locked-tag">OPEN</span></div>
    <div class="note-card"><span class="note-icon">◎</span><p>Progress saves automatically on this device. No account or internet required.</p></div>
  `;
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
      if (setting === "engineSound" && (value === "off" || value === "engine-e" || value === "engine-v")) {
        save.settings.engineSound = value;
      }
      commitSave();
      renderScreen();
      showToast("Preferences saved on this device.");
    });
  }
  document.querySelector<HTMLInputElement>("#import-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void importGarageData(file);
  });
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
      else {
        previewCar = createCar(currentTrack(), save.settings.raceStart === "rolling");
        aiDrivers = createAIFleet(currentTrack());
        raceStatus = "running";
      }
      setEngineRunning(raceStatus === "running");
      renderScreen();
      break;
    case "reset-race":
      previewCar = createCar(currentTrack(), save.settings.raceStart === "rolling");
      aiDrivers = [];
      raceStatus = "ready";
      setEngineRunning(false);
      renderScreen();
      break;
    case "new-track":
      editorTrack = {
        id: crypto.randomUUID(),
        name: "Untitled circuit",
        width: 76,
        points: [],
        createdAt: new Date().toISOString(),
      };
      renderScreen();
      break;
    case "clear-points":
      if (editorTrack) editorTrack.points = [];
      renderScreen();
      break;
    case "save-track":
      saveEditorTrack();
      break;
    case "export-save":
      exportSave();
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
  const track = currentTrack();
  renderer.draw(
    track,
    null,
    activeScreen === "workshop" ? editorTrack?.points ?? [] : undefined,
    activeScreen === "race" ? aiDrivers : [],
  );
  updateRaceHud();
}

function updateRaceHud(): void {
  const activeCar = raceLeaderCar();
  const speed = document.querySelector<HTMLElement>("#speed-readout");
  if (speed) {
    const speedValue = activeCar.speed * (save.settings.units === "imperial" ? 0.72 / 1.609 : 0.72);
    speed.textContent = Math.round(speedValue).toString().padStart(3, "0");
  }
  const speedUnit = document.querySelector<HTMLElement>("#speed-unit");
  if (speedUnit) speedUnit.textContent = save.settings.units === "imperial" ? "MPH" : "KM/H";
  const lapTime = document.querySelector<HTMLElement>("#live-lap-time");
  if (lapTime) lapTime.textContent = formatTime(activeCar.lapSeconds);
  const lapNumber = document.querySelector<HTMLElement>("#live-lap-number");
  if (lapNumber) lapNumber.textContent = `${Math.min(activeCar.lap + 1, 3)} / 3`;
  const progress = document.querySelector<HTMLElement>("#lap-progress");
  if (progress) progress.style.width = `${Math.max(0, Math.min(100, (activeCar.progressIndex / currentTrack().points.length) * 100))}%`;
  const count = document.querySelector<HTMLElement>("#waypoint-count");
  if (count && editorTrack) count.textContent = editorTrack.points.length.toString().padStart(2, "0");
  if (aiDrivers.length > 0 && performance.now() - lastStandingsRefresh > 400) {
    updateClassification();
    lastStandingsRefresh = performance.now();
  }
}

function aiProgress(driver: AIDriver): number {
  return driver.car.lap * currentTrack().points.length + driver.car.progressIndex;
}

function leadingAIDriver(): AIDriver | undefined {
  return [...aiDrivers].sort((a, b) => aiProgress(b) - aiProgress(a))[0];
}

function updateClassification(): void {
  const entries = aiDrivers.map((driver) => ({
    name: driver.name,
    code: driver.shortCode,
    color: driver.color,
    lap: driver.car.lap,
    progress: aiProgress(driver),
  }));
  entries.sort((a, b) => b.progress - a.progress);
  const leaderProgress = entries[0]?.progress ?? 0;
  elements.classification.innerHTML = `
    <div class="classification-head"><span>AUTO GRID</span><b>${entries.length} CARS</b></div>
    ${entries.slice(0, 5).map((entry, index) => `
      <div class="classification-row">
        <b class="classification-position">${index + 1}</b><i style="--team-color:#${entry.color.toString(16).padStart(6, "0")}"></i>
        <span>${escapeHtml(entry.name)}</span><small>${index === 0 ? "LEADER" : `+${(leaderProgress - entry.progress).toFixed(0)}`}</small>
      </div>`).join("")}
    ${entries.length > 5 ? `<div class="classification-more">+${entries.length - 5} MORE</div>` : ""}
  `;
}

function setEngineRunning(running: boolean): void {
  try {
    engineAudio.setRunning(running, save.settings.engineSound);
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
pixi.canvas.addEventListener("pointerdown", (event) => {
  if (activeScreen !== "workshop" || !editorTrack || !renderer) return;
  const point: Point = renderer.toWorld(event.clientX, event.clientY);
  if (point.x <= 14 || point.x >= WORLD.width - 14 || point.y <= 14 || point.y >= WORLD.height - 14) return;
  editorTrack.points.push(point);
  draw();
});
renderer = new TrackRenderer(pixi);
previewCar = createCar(currentTrack());
renderScreen();
lastFrame = performance.now();
function frame(now: number): void {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (activeScreen === "race" && raceStatus === "running") {
    for (const driver of aiDrivers) stepAIDriver(driver, currentTrack(), elapsed);
    const activeCar = raceLeaderCar();
    engineAudio.update(activeCar.speed, activeCar.speed > 1, save.settings.engineSound);
    const raceComplete = aiDrivers.some((driver) => driver.car.lap >= 3);
    if (raceComplete) {
      raceStatus = "finished";
      setEngineRunning(false);
      save.racesCompleted += 1;
      commitSave();
      showToast(`Session complete — best lap ${formatTime(activeCar.bestLapSeconds)}.`);
      renderScreen();
    }
  }
  draw();
  pixi.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export { type SaveData };
