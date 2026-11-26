import type { Point, Track } from "./track";

export interface Controls {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

export interface CarState extends Point {
  heading: number;
  speed: number;
  progressIndex: number;
  lap: number;
  lapStarted: boolean;
  bestLapSeconds: number | null;
  lastLapSeconds: number | null;
  raceSeconds: number;
  lapSeconds: number;
  offTrack: boolean;
}

const MAX_SPEED = 95;
const FIXED_STEP = 1 / 120;

function nearestPoint(track: Track, x: number, y: number): { index: number; distance: number } {
  let index = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < track.points.length; i += 1) {
    const point = track.points[i];
    const candidate = Math.hypot(point.x - x, point.y - y);
    if (candidate < distance) {
      distance = candidate;
      index = i;
    }
  }
  return { index, distance };
}

function tangent(track: Track, index: number): number {
  const from = track.points[index];
  const to = track.points[(index + 1) % track.points.length];
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function createCar(track: Track, rollingStart = false): CarState {
  const start = track.points[0];
  return {
    x: start.x,
    y: start.y,
    heading: tangent(track, 0),
    speed: rollingStart ? 45 : 0,
    progressIndex: 0,
    lap: 0,
    lapStarted: false,
    bestLapSeconds: null,
    lastLapSeconds: null,
    raceSeconds: 0,
    lapSeconds: 0,
    offTrack: false,
  };
}

export function stepCar(
  car: CarState,
  controls: Controls,
  track: Track,
  elapsedSeconds: number,
): CarState {
  let remaining = Math.min(Math.max(elapsedSeconds, 0), 0.1);
  while (remaining > 0) {
    const dt = Math.min(FIXED_STEP, remaining);
    remaining -= dt;
    car.raceSeconds += dt;
    car.lapSeconds += dt;

    const { distance } = nearestPoint(track, car.x, car.y);
    car.offTrack = distance > track.width * 0.58;
    const grip = car.offTrack ? 0.32 : 1;
    const acceleration = controls.throttle ? 14 : 0;
    const braking = controls.brake ? 20 : 0;
    car.speed += (acceleration - braking - car.speed * (car.offTrack ? 0.18 : 0.015)) * dt;
    car.speed = Math.max(0, Math.min(MAX_SPEED, car.speed));

    const steerInput = Number(controls.right) - Number(controls.left);
    const steering = (0.75 + Math.min(car.speed / 190, 1.2) * 0.7) * grip;
    car.heading += steerInput * steering * dt * Math.min(car.speed / 55, 1.2);
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.y += Math.sin(car.heading) * car.speed * dt;

    const closest = nearestPoint(track, car.x, car.y);
    const pointCount = track.points.length;
    const wrappedForward = car.progressIndex > pointCount * 0.78 && closest.index < pointCount * 0.22;
    if (wrappedForward) {
      if (car.lapStarted) {
        car.lap += 1;
        car.lastLapSeconds = car.lapSeconds;
        car.bestLapSeconds =
          car.bestLapSeconds === null
            ? car.lapSeconds
            : Math.min(car.bestLapSeconds, car.lapSeconds);
      } else {
        car.lapStarted = true;
      }
      car.lapSeconds = 0;
    }
    if (closest.index >= car.progressIndex || wrappedForward) {
      car.progressIndex = closest.index;
    }
  }
  return car;
}

export function fixedStepSeconds(): number {
  return FIXED_STEP;
}
