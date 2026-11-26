export type VehicleCategory = "kart" | "formula" | "prototype" | "gt" | "road";

export interface VehicleDefinition {
  id: string;
  name: string;
  category: VehicleCategory;
  spriteUrl: string;
  spriteLengthPixels: number;
  engineType: string;
  powerKw: number;
  torqueNm: number;
  weightKg: number;
  topSpeedKph: number;
  accelerationMps2: number;
  brakingMps2: number;
  corneringGrip: number;
  aerodynamicPerformance: number;
  reliability: number;
}

const SPRITE_LENGTHS: Record<string, number> = {
  "kart-lime": 202,
  "formula-red": 280,
  "formula-blue": 291,
  "formula-orange": 326,
  "formula-lightblue": 334,
  "formula-yellow": 324,
  "formula-black": 312,
  "prototype-purple": 342,
  "prototype-magenta": 296,
  "prototype-blue": 302,
  "prototype-cyan": 299,
  "road-white": 332,
  "road-charcoal": 325,
  "road-green": 331,
  "road-red": 311,
  "road-blue": 305,
};

export const VEHICLES: VehicleDefinition[] = [
  vehicle("kart-lime", "Lime Sprint Kart", "kart", "kart/kart_01.png", "Single-cylinder", 28, 42, 165, 128, 5.2, 8.8, 1.12, 0.08, 0.94),
  vehicle("formula-red", "Red Formula", "formula", "formula/formula_red_01.png", "V6 turbo hybrid", 790, 710, 798, 348, 16.8, 28, 1.18, 1.2, 0.91),
  vehicle("formula-blue", "Blue Formula", "formula", "formula/formula_blue_01.png", "V6 turbo hybrid", 805, 720, 800, 351, 16.5, 28, 1.16, 1.18, 0.93),
  vehicle("formula-orange", "Orange Formula", "formula", "formula/formula_orange_01.png", "V6 turbo hybrid", 780, 700, 802, 344, 16.2, 27, 1.2, 1.23, 0.89),
  vehicle("formula-lightblue", "Sky Formula", "formula", "formula/formula_lightblue_01.png", "V6 turbo hybrid", 815, 730, 799, 353, 17, 29, 1.19, 1.2, 0.92),
  vehicle("formula-yellow", "Yellow Formula", "formula", "formula/formula_yellow_01.png", "V6 turbo hybrid", 798, 715, 801, 349, 16.6, 28, 1.17, 1.19, 0.9),
  vehicle("formula-black", "Black Formula", "formula", "formula/formula_black_01.png", "V6 turbo hybrid", 775, 695, 804, 342, 16.1, 27, 1.15, 1.16, 0.88),
  vehicle("prototype-purple", "Violet Prototype", "prototype", "prototype/prototype_purple_01.png", "V8 hybrid", 690, 680, 930, 325, 14.8, 25, 1.14, 1.05, 0.93),
  vehicle("prototype-magenta", "Magenta Prototype", "prototype", "prototype/prototype_magenta_01.png", "V8 hybrid", 705, 690, 918, 329, 15, 25, 1.16, 1.08, 0.9),
  vehicle("prototype-blue", "Blue Prototype", "prototype", "prototype/prototype_blue_01.png", "V6 turbo hybrid", 720, 700, 925, 333, 15.2, 26, 1.17, 1.1, 0.92),
  vehicle("prototype-cyan", "Cyan Prototype", "prototype", "prototype/prototype_cyan_01.png", "V6 turbo hybrid", 715, 695, 922, 331, 15.1, 26, 1.2, 1.12, 0.91),
  vehicle("road-white", "White GT", "gt", "road/road_white_01.png", "V8 naturally aspirated", 410, 560, 1285, 292, 10.2, 18, 1.03, 0.72, 0.94),
  vehicle("road-charcoal", "Charcoal GT", "gt", "road/road_charcoal_01.png", "V8 naturally aspirated", 425, 575, 1298, 298, 10.4, 18, 1.01, 0.74, 0.91),
  vehicle("road-green", "Green GT", "gt", "road/road_green_01.png", "V10 naturally aspirated", 435, 590, 1272, 301, 10.6, 19, 1.04, 0.76, 0.92),
  vehicle("road-red", "Red GT", "gt", "road/road_red_01.png", "V8 twin turbo", 445, 610, 1305, 305, 10.8, 19, 1.02, 0.78, 0.89),
  vehicle("road-blue", "Blue GT", "gt", "road/road_blue_01.png", "V8 twin turbo", 430, 600, 1290, 299, 10.5, 18, 1.05, 0.75, 0.93),
];

export const VEHICLE_BY_ID = new Map(VEHICLES.map((definition) => [definition.id, definition]));

export const VEHICLE_IDS_BY_CATEGORY: Record<VehicleCategory, string[]> = {
  kart: ["kart-lime"],
  formula: ["formula-red", "formula-blue", "formula-orange", "formula-lightblue", "formula-yellow", "formula-black"],
  prototype: ["prototype-purple", "prototype-magenta", "prototype-blue", "prototype-cyan"],
  gt: ["road-white", "road-charcoal", "road-green", "road-red", "road-blue"],
  road: ["road-white", "road-charcoal", "road-green", "road-red", "road-blue"],
};

function vehicle(
  id: string,
  name: string,
  category: VehicleCategory,
  spriteFile: string,
  engineType: string,
  powerKw: number,
  torqueNm: number,
  weightKg: number,
  topSpeedKph: number,
  accelerationMps2: number,
  brakingMps2: number,
  corneringGrip: number,
  aerodynamicPerformance: number,
  reliability: number,
): VehicleDefinition {
  return {
    id,
    name,
    category,
    spriteUrl: `./assets/vehicles/${spriteFile}`,
    spriteLengthPixels: SPRITE_LENGTHS[id],
    engineType,
    powerKw,
    torqueNm,
    weightKg,
    topSpeedKph,
    accelerationMps2,
    brakingMps2,
    corneringGrip,
    aerodynamicPerformance,
    reliability,
  };
}
