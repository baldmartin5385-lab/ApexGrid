import { createCar, stepCar, type CarState, type Controls } from "./physics";
import { trackLength, type Point, type Track } from "./track";

export type RaceSeries = "f1" | "f2" | "f3" | "gt3" | "prototype";

export const RACE_SERIES: Record<
  RaceSeries,
  { label: string; gridSize: number; paceMultiplier: number; spriteLength: number }
> = {
  f1: { label: "Formula 1", gridSize: 20, paceMultiplier: 1, spriteLength: 46 },
  f2: { label: "Formula 2", gridSize: 22, paceMultiplier: 0.91, spriteLength: 43 },
  f3: { label: "Formula 3", gridSize: 30, paceMultiplier: 0.83, spriteLength: 39 },
  gt3: { label: "GT3", gridSize: 24, paceMultiplier: 0.78, spriteLength: 48 },
  prototype: { label: "Prototype", gridSize: 24, paceMultiplier: 0.94, spriteLength: 51 },
};

export interface AIDriver {
  id: string;
  name: string;
  shortCode: string;
  color: number;
  spriteIndex: number;
  spriteTint: number;
  series: RaceSeries;
  pace: number;
  car: CarState;
}

const DRIVER_ROSTER = [
  ["R. Voss", "VOS", 0xe94d43],
  ["A. Brandt", "BRA", 0x3357c2],
  ["M. Oyelaran", "OYE", 0xe98d2c],
  ["L. Kestrel", "KES", 0x54b8e3],
  ["K. Nakamura", "NAK", 0xf0d51e],
  ["I. Ferreira", "FER", 0x23282c],
  ["D. Moretti", "MOR", 0x8c4ac4],
  ["S. Okafor", "OKA", 0x37a478],
  ["T. Lindholm", "LIN", 0xf18a32],
  ["E. Petrov", "PET", 0x4c79d8],
  ["C. Moreau", "MOR2", 0xd3547a],
  ["J. Park", "PAR", 0x40a7b5],
  ["N. Haddad", "HAD", 0xc3a23d],
  ["P. Sato", "SAT", 0x6a8c58],
  ["A. Costa", "COS", 0xe4e1d8],
  ["F. Weber", "WEB", 0x46525e],
  ["M. Laurent", "LAU", 0xb64d38],
  ["V. Ionescu", "ION", 0x7890d5],
  ["O. Jensen", "JEN", 0x31a0a0],
  ["B. Diop", "DIO", 0xd3c342],
  ["R. Silva", "SIL", 0x9c5e38],
  ["H. Tanaka", "TAN", 0x4b8ed1],
  ["G. Moretti", "MOR3", 0x9f4f68],
  ["M. Alvarez", "ALV", 0x39a46e],
  ["E. Rossi", "ROS", 0x8160ad],
  ["L. Morgan", "MOR4", 0xc99035],
  ["Y. Chen", "CHE", 0x327db5],
  ["N. Brooks", "BRO", 0xb35240],
  ["J. Duarte", "DUA", 0x467c59],
  ["S. Kapoor", "KAP", 0x8879b8],
] as const;

export function createAIFleet(track: Track, series: RaceSeries = "f1"): AIDriver[] {
  const { gridSize, paceMultiplier } = RACE_SERIES[series];
  const rowCount = Math.ceil(gridSize / 2);
  const spacing = Math.min(Math.max(track.width * 0.8, 48), trackLength(track) / (rowCount + 1));
  const laneOffset = Math.min(track.width * 0.27, 21);

  return DRIVER_ROSTER.slice(0, gridSize).map(([name, shortCode, color], index) => {
    const row = Math.floor(index / 2);
    const lane = index % 2 === 0 ? -1 : 1;
    const gridPosition = positionBehindStart(track, row * spacing);
    const car = createCar(track);
    const normalX = -Math.sin(gridPosition.heading);
    const normalY = Math.cos(gridPosition.heading);
    car.x = gridPosition.point.x + normalX * lane * laneOffset;
    car.y = gridPosition.point.y + normalY * lane * laneOffset;
    car.heading = gridPosition.heading;
    car.progressIndex = gridPosition.progressIndex;

    return {
      name,
      shortCode,
      color,
      id: shortCode.toLowerCase(),
      spriteIndex: index % 6,
      spriteTint: index < 6 ? 0xffffff : color,
      series,
      pace: (0.93 + (index % 8) * 0.015) * paceMultiplier,
      car,
    };
  });
}

function positionBehindStart(
  track: Track,
  distance: number,
): { point: Point; heading: number; progressIndex: number } {
  const count = track.points.length;
  let remaining = distance;
  let toIndex = 0;

  if (distance === 0) {
    const from = track.points[count - 1];
    const to = track.points[0];
    return {
      point: { ...to },
      heading: Math.atan2(to.y - from.y, to.x - from.x),
      progressIndex: 0,
    };
  }

  for (let segment = 0; segment < count; segment += 1) {
    const fromIndex = (toIndex - 1 + count) % count;
    const from = track.points[fromIndex];
    const to = track.points[toIndex];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > 0 && remaining <= length) {
      const progress = 1 - remaining / length;
      return {
        point: {
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        },
        heading: Math.atan2(to.y - from.y, to.x - from.x),
        progressIndex: fromIndex,
      };
    }
    remaining -= length;
    toIndex = fromIndex;
  }

  const from = track.points[count - 1];
  const to = track.points[0];
  return {
    point: { ...to },
    heading: Math.atan2(to.y - from.y, to.x - from.x),
    progressIndex: 0,
  };
}

export function stepAIDriver(driver: AIDriver, track: Track, elapsedSeconds: number): void {
  const count = track.points.length;
  const lookAhead = Math.min(8, Math.max(2, 2 + Math.floor(driver.car.speed / 65)));
  const target = track.points[(driver.car.progressIndex + lookAhead) % count];
  const desiredHeading = Math.atan2(target.y - driver.car.y, target.x - driver.car.x);
  const angleError = Math.atan2(
    Math.sin(desiredHeading - driver.car.heading),
    Math.cos(desiredHeading - driver.car.heading),
  );
  const steerThreshold = 0.065;
  const desiredSpeed = Math.max(34, 82 * driver.pace - Math.abs(angleError) * 28);
  const controls: Controls = {
    throttle: driver.car.speed < desiredSpeed,
    brake: driver.car.speed > desiredSpeed + 9,
    left: angleError < -steerThreshold,
    right: angleError > steerThreshold,
  };
  stepCar(driver.car, controls, track, elapsedSeconds);
}
