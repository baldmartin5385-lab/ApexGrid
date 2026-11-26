import { createCar, stepCar, type CarState, type Controls } from "./physics";
import { trackLength, type Point, type Track } from "./track";
import { VEHICLE_BY_ID, VEHICLE_IDS_BY_CATEGORY, type VehicleCategory } from "./vehicles";

export type RaceSeries = "f1" | "f2" | "f3" | "gt3" | "prototype";

export const RACE_SERIES: Record<
  RaceSeries,
  { label: string; gridSize: number; paceMultiplier: number; vehicleLength: number }
> = {
  f1: { label: "Formula 1", gridSize: 20, paceMultiplier: 1, vehicleLength: 28 },
  f2: { label: "Formula 2", gridSize: 22, paceMultiplier: 0.91, vehicleLength: 27 },
  f3: { label: "Formula 3", gridSize: 30, paceMultiplier: 0.83, vehicleLength: 24 },
  gt3: { label: "GT3", gridSize: 24, paceMultiplier: 0.78, vehicleLength: 30 },
  prototype: { label: "Prototype", gridSize: 24, paceMultiplier: 0.94, vehicleLength: 32 },
};

export interface AIDriver {
  id: string;
  name: string;
  shortCode: string;
  color: number;
  series: RaceSeries;
  vehicleId: string;
  qualifyingBestLapSeconds: number | null;
  pace: number;
  throttle: boolean;
  overtakeSide: -1 | 0 | 1;
  overtakeTime: number;
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
  const category: VehicleCategory = series === "gt3" ? "gt" : series === "prototype" ? "prototype" : "formula";
  const vehicleIds = VEHICLE_IDS_BY_CATEGORY[category];
  const fleet: AIDriver[] = DRIVER_ROSTER.slice(0, gridSize).map(([name, shortCode, color], index) => {
    const vehicleId = vehicleIds[index % vehicleIds.length];
    const vehicle = VEHICLE_BY_ID.get(vehicleId);
    if (!vehicle) throw new Error(`Vehicle definition is missing: ${vehicleId}`);
    const car = createCar(track);

    return {
      name,
      shortCode,
      color,
      id: shortCode.toLowerCase(),
      series,
      vehicleId,
      qualifyingBestLapSeconds: null,
      pace: (0.93 + (index % 8) * 0.015) * paceMultiplier * (vehicle.topSpeedKph / 350) ** 0.15,
      throttle: true,
      overtakeSide: 0,
      overtakeTime: 0,
      car,
    };
  });
  arrangeAIFleetOnGrid(track, fleet);
  return fleet;
}

export function arrangeAIFleetOnGrid(track: Track, drivers: AIDriver[]): void {
  const rowCount = Math.ceil(drivers.length / 2);
  const spacing = Math.min(Math.max(track.width * 0.48, 28), trackLength(track) / (rowCount + 1));
  const laneOffset = Math.min(track.width * 0.16, 12);

  drivers.forEach((driver, index) => {
    const row = Math.floor(index / 2);
    const lane = index % 2 === 0 ? -1 : 1;
    const gridPosition = positionBehindStart(track, row * spacing);
    const car = createCar(track);
    car.x = gridPosition.point.x - Math.sin(gridPosition.heading) * lane * laneOffset;
    car.y = gridPosition.point.y + Math.cos(gridPosition.heading) * lane * laneOffset;
    car.heading = gridPosition.heading;
    car.progressIndex = gridPosition.progressIndex;
    driver.car = car;
    driver.overtakeSide = 0;
    driver.overtakeTime = 0;
    driver.throttle = true;
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

export function stepAIDriver(
  driver: AIDriver,
  track: Track,
  elapsedSeconds: number,
  field: AIDriver[] = [],
): void {
  const count = track.points.length;
  const index = driver.car.progressIndex % count;
  const current = track.points[index];
  const next = track.points[(index + 1) % count];
  const tangentX = next.x - current.x;
  const tangentY = next.y - current.y;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  const normalX = -tangentY / tangentLength;
  const normalY = tangentX / tangentLength;

  const lookForTraffic = Math.max(62, driver.car.speed * 1.15);
  let nearestAhead: { lateral: number; distance: number } | null = null;
  for (const other of field) {
    if (other === driver || other.car.speed >= driver.car.speed + 3) continue;
    const distance = distanceAhead(track, index, other.car.progressIndex % count);
    if (distance <= 0 || distance >= lookForTraffic) continue;
    const lateral = (other.car.x - current.x) * normalX + (other.car.y - current.y) * normalY;
    if (Math.abs(lateral) >= track.width * 0.78) continue;
    if (!nearestAhead || distance < nearestAhead.distance) nearestAhead = { lateral, distance };
  }
  if (nearestAhead) {
    const side = nearestAhead.lateral >= 0 ? -1 : 1;
    driver.overtakeSide = side;
    driver.overtakeTime = 1.4;
  } else if (driver.overtakeTime > 0) {
    driver.overtakeTime = Math.max(0, driver.overtakeTime - elapsedSeconds);
  } else {
    driver.overtakeSide = 0;
  }

  const lookAhead = Math.min(18, Math.max(5, 5 + Math.floor(driver.car.speed / 17)));
  const targetIndex = (index + lookAhead) % count;
  const target = track.points[targetIndex];
  const laneOffset = driver.overtakeSide * Math.min(track.width * 0.34, 24);
  const targetX = target.x + normalX * laneOffset;
  const targetY = target.y + normalY * laneOffset;
  const desiredHeading = Math.atan2(targetY - driver.car.y, targetX - driver.car.x);
  const angleError = Math.atan2(
    Math.sin(desiredHeading - driver.car.heading),
    Math.cos(desiredHeading - driver.car.heading),
  );
  const before = track.points[(index - 1 + count) % count];
  const following = track.points[(targetIndex + 1) % count];
  const incoming = Math.atan2(current.y - before.y, current.x - before.x);
  const outgoing = Math.atan2(following.y - target.y, following.x - target.x);
  const cornerAngle = Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)));
  const vehicle = VEHICLE_BY_ID.get(driver.vehicleId);
  if (!vehicle) throw new Error(`Vehicle definition is missing: ${driver.vehicleId}`);
  const topSpeed = vehicle.topSpeedKph / 3.6;
  const cornerSpeed = topSpeed * (1 - cornerAngle * 0.38 / vehicle.corneringGrip);
  const desiredSpeed = Math.max(
    22,
    Math.min(topSpeed * driver.pace, cornerSpeed + (driver.overtakeSide === 0 ? 0 : 7)),
  );
  const steering = Math.max(-1, Math.min(1, angleError * 1.75));
  const controls: Controls = {
    throttle: driver.car.speed < desiredSpeed - 1,
    brake: driver.car.speed > desiredSpeed + 3,
    left: steering < -0.08,
    right: steering > 0.08,
    steer: steering,
    maxSpeed: topSpeed,
    acceleration: vehicle.accelerationMps2,
    braking: vehicle.brakingMps2,
    corneringGrip: vehicle.corneringGrip,
  };
  driver.throttle = controls.throttle;
  stepCar(driver.car, controls, track, elapsedSeconds);
}

const trackDistanceCache = new WeakMap<Track, { cumulative: number[]; total: number }>();

function distanceAhead(track: Track, fromIndex: number, toIndex: number): number {
  const count = track.points.length;
  if (fromIndex === toIndex) return 0;
  let distances = trackDistanceCache.get(track);
  if (!distances) {
    const cumulative = [0];
    for (let index = 1; index < count; index += 1) {
      cumulative.push(
        cumulative[index - 1] + Math.hypot(
          track.points[index].x - track.points[index - 1].x,
          track.points[index].y - track.points[index - 1].y,
        ),
      );
    }
    const total = cumulative[count - 1] + Math.hypot(
      track.points[0].x - track.points[count - 1].x,
      track.points[0].y - track.points[count - 1].y,
    );
    distances = { cumulative, total };
    trackDistanceCache.set(track, distances);
  }
  const distance = distances.cumulative[toIndex] - distances.cumulative[fromIndex];
  return distance > 0 ? distance : distance + distances.total;
}
