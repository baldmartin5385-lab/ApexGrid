export interface Point {
  x: number;
  y: number;
}

export interface Track {
  id: string;
  name: string;
  width: number;
  points: Point[];
  createdAt: string;
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
    createdAt: new Date().toISOString(),
  };
}

export function isValidTrack(value: unknown): value is Track {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.points)) return false;
  const points = record.points as unknown[];
  return (
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
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= WORLD.width &&
        point.y >= 0 &&
        point.y <= WORLD.height,
    ) &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    record.width >= 24 &&
    record.width <= 160
  );
}

export function trackLength(track: Track): number {
  return track.points.reduce((length, point, index) => {
    const next = track.points[(index + 1) % track.points.length];
    return length + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}
