export interface Point {
  x: number;
  y: number;
}

export interface Track {
  id: string;
  name: string;
  width: number;
  points: Point[];
  closed?: boolean;
  createdAt: string;
  backgroundImage?: string;
  geoReference?: {
    centerLat: number;
    centerLon: number;
    zoom: number;
    pixelsPerWorldUnit: number;
  };
}

export const WORLD = { width: 1000, height: 700 } as const;

export function makeStarterTrack(): Track {
  const points: Point[] = [];
  const count = 64;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const ripple = 1 + 0.045 * Math.sin(angle * 3) + 0.025 * Math.cos(angle * 5);
    points.push({
      x: 500 + Math.cos(angle) * 332 * ripple,
      y: 350 + Math.sin(angle) * 218 * ripple,
    });
  }
  return {
    id: "copper-circuit",
    name: "Copper Circuit",
    width: 76,
    points,
    closed: true,
    createdAt: new Date().toISOString(),
  };
}

export function smoothTrackPoints(points: Point[], closed = true, samplesPerSegment = 6): Point[] {
  if (points.length < 3 || samplesPerSegment < 1) return points.map((point) => ({ ...point }));
  const segmentCount = closed ? points.length : points.length - 1;
  const pointAt = (index: number): Point => {
    if (closed) return points[(index + points.length) % points.length];
    return points[Math.max(0, Math.min(points.length - 1, index))];
  };
  const result: Point[] = [];

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const p0 = pointAt(segment - 1);
    const p1 = pointAt(segment);
    const p2 = pointAt(segment + 1);
    const p3 = pointAt(segment + 2);
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x: 0.5 * (
          2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        ),
        y: 0.5 * (
          2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        ),
      });
    }
  }
  if (!closed) result.push({ ...points[points.length - 1] });
  return result;
}

export function createDrivingTrack(track: Track): Track {
  return {
    ...track,
    closed: true,
    points: smoothTrackPoints(track.points, true, 6),
  };
}

export function isValidTrack(value: unknown): value is Track {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.points)) return false;
  const points = record.points as unknown[];
  const validClosedState = record.closed === undefined || record.closed === true;
  const reference = record.geoReference;
  const backgroundImage = record.backgroundImage;
  const validBackgroundImage =
    backgroundImage === undefined ||
    (typeof backgroundImage === "string" &&
      backgroundImage.length <= 1_500_000 &&
      /^data:image\/(?:webp|png|jpeg);base64,/.test(backgroundImage));
  const validGeoReference =
    reference === undefined ||
    (typeof reference === "object" &&
      reference !== null &&
      "centerLat" in reference &&
      "centerLon" in reference &&
      "zoom" in reference &&
      "pixelsPerWorldUnit" in reference &&
      typeof reference.centerLat === "number" &&
      Number.isFinite(reference.centerLat) &&
      reference.centerLat >= -90 &&
      reference.centerLat <= 90 &&
      typeof reference.centerLon === "number" &&
      Number.isFinite(reference.centerLon) &&
      reference.centerLon >= -180 &&
      reference.centerLon <= 180 &&
      typeof reference.zoom === "number" &&
      Number.isFinite(reference.zoom) &&
      reference.zoom >= 2 &&
      reference.zoom <= 20 &&
      typeof reference.pixelsPerWorldUnit === "number" &&
      Number.isFinite(reference.pixelsPerWorldUnit) &&
      reference.pixelsPerWorldUnit > 0);

  return (
    validClosedState &&
    validGeoReference &&
    validBackgroundImage &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.createdAt === "string" &&
    points.length >= 8 &&
    points.every(
      (point: unknown) =>
        typeof point === "object" &&
        point !== null &&
        "x" in point &&
        "y" in point &&
        typeof point.x === "number" &&
        typeof point.y === "number" &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y),
    ) &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    record.width >= 24 &&
    record.width <= 160
  );
}

export function trackLength(track: Track): number {
  const segmentCount = track.closed === false ? track.points.length - 1 : track.points.length;
  return track.points.slice(0, segmentCount).reduce((length, point, index) => {
    const next = track.points[(index + 1) % track.points.length];
    return length + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}
