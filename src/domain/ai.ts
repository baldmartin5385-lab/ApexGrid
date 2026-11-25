import { createCar, stepCar, type CarState, type Controls } from "./physics";
import type { Track } from "./track";

export interface AIDriver {
  id: string;
  name: string;
  shortCode: string;
  color: number;
  pace: number;
  car: CarState;
}

const DRIVER_ROSTER = [
  { name: "R. Voss", shortCode: "VOS", color: 0x55c6b5, pace: 0.96 },
  { name: "A. Brandt", shortCode: "BRA", color: 0xe94d43, pace: 1.02 },
  { name: "M. Oyelaran", shortCode: "OYE", color: 0xe94d43, pace: 0.93 },
  { name: "L. Kestrel", shortCode: "KES", color: 0xf0a33b, pace: 0.99 },
  { name: "K. Nakamura", shortCode: "NAK", color: 0x648fdf, pace: 0.91 },
  { name: "I. Ferreira", shortCode: "FER", color: 0xa680d8, pace: 1.04 },
];

export function createAIFleet(track: Track): AIDriver[] {
  const start = track.points[0];
  const next = track.points[1];
  const heading = Math.atan2(next.y - start.y, next.x - start.x);
  return DRIVER_ROSTER.map((driver, index) => {
    const car = createCar(track);
    const row = Math.floor(index / 2) + 1;
    const side = index % 2 === 0 ? -1 : 1;
    const longitudinal = row * 12;
    const lateral = side * 8;
    car.x -= Math.cos(heading) * longitudinal + Math.sin(heading) * lateral;
    car.y -= Math.sin(heading) * longitudinal - Math.cos(heading) * lateral;
    return { ...driver, id: driver.shortCode.toLowerCase(), car };
  });
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
  const desiredSpeed = Math.max(75, 235 * driver.pace - Math.abs(angleError) * 112);
  const controls: Controls = {
    throttle: driver.car.speed < desiredSpeed,
    brake: driver.car.speed > desiredSpeed + 9,
    left: angleError < -steerThreshold,
    right: angleError > steerThreshold,
  };
  stepCar(driver.car, controls, track, elapsedSeconds);
}
