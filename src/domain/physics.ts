import type { Point, Track } from "./track";

export interface Controls {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  steer?: number;
  maxSpeed?: number;
  acceleration?: number;
  braking?: number;
  corneringGrip?: number;
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

function nearestPoint(
  track: Track,
  x: number,
  y: number,
  hintIndex?: number,
): { index: number; distance: number } {
  const points = track.points;
  const count = points.length;
  let index = 0;
  let distanceSquared = Number.POSITIVE_INFINITY;
  const localSearch = hintIndex !== undefined && count > 40;
  const searchRange = localSearch ? Math.min(16, Math.floor((count - 1) / 2)) : count;
  const start = localSearch ? hintIndex - searchRange : 0;
  const end = localSearch ? hintIndex + searchRange : count - 1;

  for (let offset = start; offset <= end; offset += 1) {
    const candidateIndex = (offset + count) % count;
    const point = points[candidateIndex];
    const dx = point.x - x;
    const dy = point.y - y;
    const candidateDistanceSquared = dx * dx + dy * dy;
    if (candidateDistanceSquared < distanceSquared) {
      distanceSquared = candidateDistanceSquared;
      index = candidateIndex;
    }
  }

  if (localSearch && distanceSquared > (track.width * 2) ** 2) {
    return nearestPoint(track, x, y);
  }
  return { index, distance: Math.sqrt(distanceSquared) };
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

    const { distance } = nearestPoint(track, car.x, car.y, car.progressIndex);
    car.offTrack = distance > track.width * 0.58;
    const grip = (car.offTrack ? 0.32 : 1) * (controls.corneringGrip ?? 1);
    const acceleration = controls.throttle ? controls.acceleration ?? 14 : 0;
    const braking = controls.brake ? controls.braking ?? 20 : 0;
    car.speed += (acceleration - braking - car.speed * (car.offTrack ? 0.18 : 0.015)) * dt;
    car.speed = Math.max(0, Math.min(MAX_SPEED, controls.maxSpeed ?? MAX_SPEED, car.speed));

    const steerInput = controls.steer ?? Number(controls.right) - Number(controls.left);
    const steering = (0.75 + Math.min(car.speed / 190, 1.2) * 0.7) * grip;
    car.heading += steerInput * steering * dt * Math.min(car.speed / 55, 1.2);
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.y += Math.sin(car.heading) * car.speed * dt;

    const closest = nearestPoint(track, car.x, car.y, car.progressIndex);
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
