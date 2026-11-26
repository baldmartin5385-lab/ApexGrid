import { makeStarterTrack, type Track, isValidTrack } from "../domain/track";
import { type RaceSeries } from "../domain/ai";

const STORAGE_KEY = "apexgrid.save.v1";

export interface SaveData {
  version: 1;
  tracks: Track[];
  selectedTrackId: string;
  racesCompleted: number;
  settings: GameSettings;
}

export interface GameSettings {
  theme: "modern" | "classic";
  raceStart: "lights-out" | "rolling";
  units: "metric" | "imperial";
  engineSound: "off" | "series";
  series: RaceSeries;
  qualifyingMinutes: number;
  raceLaps: number;
}

export function defaultSettings(): GameSettings {
  return {
    theme: "modern",
    raceStart: "lights-out",
    units: "metric",
    engineSound: "series",
    series: "f1",
    qualifyingMinutes: 5,
    raceLaps: 5,
  };
}

export function loadSave(): SaveData {
  const fallback = defaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.tracks)) return fallback;
    const validTracks = record.tracks.filter(
      (track): track is Track => isValidTrack(track),
    );
    if (validTracks.length === 0) return fallback;
    const rawSettings =
      typeof record.settings === "object" && record.settings !== null
        ? (record.settings as Record<string, unknown>)
        : {};
    const selectedTrackId =
      typeof record.selectedTrackId === "string" &&
      validTracks.some((track) => track.id === record.selectedTrackId)
        ? record.selectedTrackId
        : validTracks[0].id;
    return {
      version: 1,
      tracks: validTracks,
      selectedTrackId,
      racesCompleted:
        typeof record.racesCompleted === "number" && Number.isFinite(record.racesCompleted)
          ? Math.max(0, Math.floor(record.racesCompleted))
          : 0,
      settings: {
        theme: rawSettings.theme === "classic" ? "classic" : "modern",
        raceStart: rawSettings.raceStart === "rolling" ? "rolling" : "lights-out",
        units: rawSettings.units === "imperial" ? "imperial" : "metric",
        engineSound:
          rawSettings.engineSound === "off" ? "off" : "series",
        series:
          rawSettings.series === "f2" ||
          rawSettings.series === "f3" ||
          rawSettings.series === "gt3" ||
          rawSettings.series === "prototype"
            ? rawSettings.series
            : "f1",
        qualifyingMinutes:
          typeof rawSettings.qualifyingMinutes === "number" &&
          Number.isFinite(rawSettings.qualifyingMinutes)
            ? Math.max(1, Math.min(60, Math.round(rawSettings.qualifyingMinutes)))
            : 5,
        raceLaps:
          typeof rawSettings.raceLaps === "number" && Number.isFinite(rawSettings.raceLaps)
            ? Math.max(1, Math.min(30, Math.round(rawSettings.raceLaps)))
            : 5,
      },
    };
  } catch (error) {
    console.warn("ApexGrid save could not be loaded; starting with a fresh garage.", error);
    return fallback;
  }
}

export function persistSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (error) {
    console.error("ApexGrid could not save local progress.", error);
    throw new Error("Local storage is unavailable or full. Your latest changes were not saved.");
  }
}

export function defaultSave(): SaveData {
  const starter = makeStarterTrack();
  return {
    version: 1,
    tracks: [starter],
    selectedTrackId: starter.id,
    racesCompleted: 0,
    settings: defaultSettings(),
  };
}
