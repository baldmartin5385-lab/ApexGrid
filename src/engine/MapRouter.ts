import { geoToTilePixels, tilePixelsToGeo, type GeoPoint } from "../map/TileProvider";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_DATABASE = "apexgrid-road-graphs";
const CACHE_STORE = "graphs";
const MAX_GRAPH_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_OVERPASS_BYTES = 20 * 1024 * 1024;
const EARTH_RADIUS_METERS = 6_371_000;

export interface MapPlace {
  displayName: string;
  point: GeoPoint;
  boundingBox: [number, number, number, number];
}

export interface RoadEdge {
  to: string;
  distance: number;
}

export interface RoadSegment {
  a: string;
  b: string;
  pointA: GeoPoint;
  pointB: GeoPoint;
  aToB: boolean;
  bToA: boolean;
}

export interface RoadGraph {
  key: string;
  center: GeoPoint;
  createdAt: number;
  nodes: Map<string, GeoPoint>;
  adjacency: Map<string, RoadEdge[]>;
  segments: RoadSegment[];
}

interface SerializedRoadGraph {
  key: string;
  center: GeoPoint;
  createdAt: number;
  nodes: Array<[string, GeoPoint]>;
  adjacency: Array<[string, RoadEdge[]]>;
  segments: RoadSegment[];
}

interface OverpassElement {
  type?: string;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
}

interface QueueItem {
  id: string;
  priority: number;
}

export class MapRouter {
  private readonly memoryGraphs = new Map<string, RoadGraph>();
  private graph: RoadGraph | null = null;
  private databasePromise: Promise<IDBDatabase> | null = null;
  private nominatimQueue: Promise<void> = Promise.resolve();
  private osrmQueue: Promise<void> = Promise.resolve();
  private lastNominatimRequest = 0;
  private lastOSRMRequest = 0;

  async loadRoadGraph(center: GeoPoint): Promise<RoadGraph> {
    const key = graphCacheKey(center);
    const memoryGraph = this.memoryGraphs.get(key);
    if (memoryGraph) {
      this.graph = memoryGraph;
      return memoryGraph;
    }

    const persistedGraph = await this.readCachedGraph(key);
    if (persistedGraph) {
      const graph = deserializeGraph(persistedGraph);
      this.memoryGraphs.set(key, graph);
      this.graph = graph;
      return graph;
    }

    const bounds = twoKilometerBounds(center);
    const query = [
      "[out:json][timeout:25];",
      `way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});`,
      "out body geom;",
    ].join("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
        referrerPolicy: "strict-origin-when-cross-origin",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("The road-network request timed out. Overpass may be busy; retry later or use a cached area.");
      }
      console.error("Overpass road-network request failed.", error);
      throw new Error("The road network could not be reached. Check your connection and retry.");
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? "Overpass is rate-limiting map requests. Try again later or use a cached area."
          : `The road network could not be loaded (HTTP ${response.status}).`,
      );
    }
    const text = await response.text();
    if (text.length > MAX_OVERPASS_BYTES) {
      throw new Error("The requested road network is too large to cache safely.");
    }
    let data: OverpassResponse;
    try {
      data = JSON.parse(text) as OverpassResponse;
    } catch (error) {
      console.error("Overpass returned invalid JSON.", error);
      throw new Error("The road network response could not be read.");
    }

    const graph = buildRoadGraph(key, center, data.elements ?? []);
    if (graph.segments.length === 0) {
      throw new Error("No drivable roads were found in this map area.");
    }
    this.memoryGraphs.set(key, graph);
    this.graph = graph;
    await this.writeCachedGraph(serializeGraph(graph));
    return graph;
  }

  useRoadGraph(graph: RoadGraph): void {
    this.graph = graph;
  }

  snapPoint(point: GeoPoint): GeoPoint {
    return this.nearestSegment(point).point;
  }

  routeBetween(start: GeoPoint, end: GeoPoint): GeoPoint[] {
    if (!this.graph) throw new Error("Load a road network before snapping track points.");
    const startSnap = this.nearestSegment(start);
    const endSnap = this.nearestSegment(end);
    if (startSnap.segment === endSnap.segment) {
      const sameDirection =
        startSnap.fraction <= endSnap.fraction
          ? startSnap.segment.aToB
          : startSnap.segment.bToA;
      if (sameDirection) return [startSnap.point, endSnap.point];
    }

    const starts = startSnap.segment.aToB
      ? [{ id: startSnap.segment.b, cost: distanceMeters(startSnap.point, startSnap.segment.pointB) }]
      : [];
    if (startSnap.segment.bToA) {
      starts.push({
        id: startSnap.segment.a,
        cost: distanceMeters(startSnap.point, startSnap.segment.pointA),
      });
    }

    const ends = endSnap.segment.aToB
      ? [{ id: endSnap.segment.a, cost: distanceMeters(endSnap.segment.pointA, endSnap.point) }]
      : [];
    if (endSnap.segment.bToA) {
      ends.push({
        id: endSnap.segment.b,
        cost: distanceMeters(endSnap.segment.pointB, endSnap.point),
      });
    }

    let bestPath: string[] | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const from of starts) {
      for (const to of ends) {
        const path = aStar(this.graph, from.id, to.id);
        if (!path) continue;
        const routeCost =
          from.cost +
          path.cost +
          to.cost;
        if (routeCost < bestCost) {
          bestCost = routeCost;
          bestPath = path.nodes;
        }
      }
    }
    if (!bestPath) throw new Error("No connected road route exists between those points.");

    const route = [startSnap.point];
    for (const id of bestPath) {
      const point = this.graph.nodes.get(id);
      if (point && distanceMeters(route[route.length - 1], point) > 0.5) route.push(point);
    }
    if (distanceMeters(route[route.length - 1], endSnap.point) > 0.5) route.push(endSnap.point);
    return route;
  }

  async searchPlaces(query: string): Promise<MapPlace[]> {
    const normalized = query.trim();
    if (normalized.length < 2) throw new Error("Enter at least two characters to search.");
    return this.queueRateLimited("nominatim", async () => {
      const url = new URL(NOMINATIM_URL);
      url.search = new URLSearchParams({
        format: "jsonv2",
        limit: "5",
        q: normalized,
      }).toString();
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (response.status === 429) {
        throw new Error("Nominatim is rate-limiting searches. Wait a moment and retry.");
      }
      if (!response.ok) throw new Error(`Place search failed (HTTP ${response.status}).`);
      const results = (await response.json()) as NominatimResult[];
      return results.flatMap((result) => {
        const lat = Number(result.lat);
        const lon = Number(result.lon);
        const box = result.boundingbox?.map(Number);
        if (
          !result.display_name ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          !box ||
          box.length !== 4 ||
          box.some((value) => !Number.isFinite(value))
        ) {
          return [];
        }
        return [
          {
            displayName: result.display_name,
            point: { lat, lon },
            boundingBox: [box[0], box[1], box[2], box[3]],
          },
        ];
      });
    });
  }

  async routeLongDistance(waypoints: GeoPoint[]): Promise<GeoPoint[]> {
    if (waypoints.length < 2) return catmullRomSpline(waypoints);
    const distance = waypoints.slice(1).reduce(
      (total, point, index) => total + distanceMeters(waypoints[index], point),
      0,
    );
    if (distance <= 10_000) return catmullRomSpline(waypoints);

    try {
      return await this.queueRateLimited("osrm", async () => {
        const coordinates = waypoints.map(({ lat, lon }) => `${lon},${lat}`).join(";");
        const url = `${OSRM_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`;
        const response = await fetch(url, {
          cache: "no-store",
          referrerPolicy: "strict-origin-when-cross-origin",
        });
        if (response.status === 429) throw new Error("OSRM rate limit reached.");
        if (!response.ok) throw new Error(`OSRM route failed (HTTP ${response.status}).`);
        const data = (await response.json()) as {
          code?: string;
          routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
        };
        const routeCoordinates = data.routes?.[0]?.geometry?.coordinates;
        if (data.code !== "Ok" || !routeCoordinates || routeCoordinates.length < 2) {
          throw new Error("OSRM did not return usable route geometry.");
        }
        return routeCoordinates.map(([lon, lat]) => ({ lat, lon }));
      });
    } catch (error) {
      console.warn("OSRM route unavailable; using local spline fallback.", error);
      return catmullRomSpline(waypoints);
    }
  }

  private nearestSegment(point: GeoPoint): { segment: RoadSegment; point: GeoPoint; fraction: number } {
    if (!this.graph) throw new Error("Load a road network before snapping track points.");
    let closest: { segment: RoadSegment; point: GeoPoint; fraction: number; distance: number } | null =
      null;
    for (const segment of this.graph.segments) {
      const candidate = projectToSegment(point, segment.pointA, segment.pointB);
      if (!closest || candidate.distance < closest.distance) {
        closest = { segment, ...candidate };
      }
    }
    if (!closest || closest.distance > 180) {
      throw new Error("No road is close enough to snap to. Search another area or zoom in.");
    }
    return closest;
  }

  private queueRateLimited<T>(service: "nominatim" | "osrm", operation: () => Promise<T>): Promise<T> {
    const isNominatim = service === "nominatim";
    const queue = isNominatim ? this.nominatimQueue : this.osrmQueue;
    const request = queue.then(async () => {
      const interval = isNominatim ? 1000 : 1500;
      const lastRequest = isNominatim ? this.lastNominatimRequest : this.lastOSRMRequest;
      const wait = interval - (Date.now() - lastRequest);
      if (wait > 0) await delay(wait);
      if (isNominatim) this.lastNominatimRequest = Date.now();
      else this.lastOSRMRequest = Date.now();
      return operation();
    });
    const nextQueue = request.then(
      () => undefined,
      () => undefined,
    );
    if (isNominatim) this.nominatimQueue = nextQueue;
    else this.osrmQueue = nextQueue;
    return request;
  }

  private async readCachedGraph(key: string): Promise<SerializedRoadGraph | null> {
    if (typeof indexedDB === "undefined") return null;
    try {
      const database = await this.openDatabase();
      const stored = await new Promise<SerializedRoadGraph | null>((resolve, reject) => {
        const request = database.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get(key);
        request.onsuccess = () => resolve((request.result as SerializedRoadGraph | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("Road graph cache read failed."));
      });
      if (!stored || Date.now() - stored.createdAt > MAX_GRAPH_AGE) return null;
      return stored;
    } catch (error) {
      console.warn("Road graph persistent cache is unavailable.", error);
      return null;
    }
  }

  private async writeCachedGraph(graph: SerializedRoadGraph): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
      const database = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(CACHE_STORE, "readwrite");
        transaction.objectStore(CACHE_STORE).put(graph);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Road graph cache write failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Road graph cache write was aborted."));
      });
    } catch (error) {
      console.warn("Road graph could not be persisted; it remains available for this session.", error);
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
          request.result.createObjectStore(CACHE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Road graph cache could not be opened."));
    });
    return this.databasePromise;
  }
}

export function trackWorldToGeo(
  point: { x: number; y: number },
  reference: { center: GeoPoint; zoom: number; pixelsPerWorldUnit: number },
): GeoPoint {
  const center = geoToTilePixels(reference.center, reference.zoom);
  return tilePixelsToGeo(
    {
      x: center.x + (point.x - 500) * reference.pixelsPerWorldUnit,
      y: center.y + (point.y - 350) * reference.pixelsPerWorldUnit,
    },
    reference.zoom,
  );
}

export function geoToTrackWorld(
  point: GeoPoint,
  reference: { center: GeoPoint; zoom: number; pixelsPerWorldUnit: number },
): { x: number; y: number } {
  const center = geoToTilePixels(reference.center, reference.zoom);
  const target = geoToTilePixels(point, reference.zoom);
  const mapSize = 256 * 2 ** reference.zoom;
  let dx = target.x - center.x;
  if (dx > mapSize / 2) dx -= mapSize;
  if (dx < -mapSize / 2) dx += mapSize;
  return {
    x: 500 + dx / reference.pixelsPerWorldUnit,
    y: 350 + (target.y - center.y) / reference.pixelsPerWorldUnit,
  };
}

export function catmullRomSpline(points: GeoPoint[], samplesPerSegment = 8): GeoPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const result: GeoPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const interpolate = (a: number, b: number, c: number, d: number) =>
        0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push({
        lat: interpolate(p0.lat, p1.lat, p2.lat, p3.lat),
        lon: interpolate(p0.lon, p1.lon, p2.lon, p3.lon),
      });
    }
  }
  result.push({ ...points[points.length - 1] });
  return result;
}

function buildRoadGraph(key: string, center: GeoPoint, elements: OverpassElement[]): RoadGraph {
  const nodes = new Map<string, GeoPoint>();
  const adjacency = new Map<string, RoadEdge[]>();
  const segments: RoadSegment[] = [];
  for (const element of elements) {
    if (element.type !== "way" || !element.geometry || !isDrivable(element.tags)) continue;
    const oneWay = element.tags?.oneway === "yes" || element.tags?.oneway === "1";
    const reverse = element.tags?.oneway === "-1";
    const roundabout = element.tags?.junction === "roundabout";
    const aToB = reverse ? false : true;
    const bToA = reverse ? true : !(oneWay || roundabout);
    const geometry = element.geometry;
    for (let index = 0; index < geometry.length - 1; index += 1) {
      const pointA = { lat: geometry[index].lat, lon: geometry[index].lon };
      const pointB = { lat: geometry[index + 1].lat, lon: geometry[index + 1].lon };
      if (!validGeoPoint(pointA) || !validGeoPoint(pointB)) continue;
      const a = nodeKey(pointA);
      const b = nodeKey(pointB);
      const distance = distanceMeters(pointA, pointB);
      if (distance < 0.25) continue;
      nodes.set(a, pointA);
      nodes.set(b, pointB);
      if (aToB) addEdge(adjacency, a, b, distance);
      if (bToA) addEdge(adjacency, b, a, distance);
      segments.push({ a, b, pointA, pointB, aToB, bToA });
    }
  }
  return { key, center, createdAt: Date.now(), nodes, adjacency, segments };
}

function isDrivable(tags?: Record<string, string>): boolean {
  const highway = tags?.highway;
  return Boolean(
    highway &&
      !["footway", "cycleway", "steps", "pedestrian", "path", "bridleway", "construction"].includes(
        highway,
      ) &&
      tags?.access !== "no" &&
      tags?.motor_vehicle !== "no",
  );
}

function addEdge(adjacency: Map<string, RoadEdge[]>, from: string, to: string, distance: number): void {
  const edges = adjacency.get(from) ?? [];
  edges.push({ to, distance });
  adjacency.set(from, edges);
}

function aStar(
  graph: RoadGraph,
  start: string,
  goal: string,
): { nodes: string[]; cost: number } | null {
  if (start === goal) return { nodes: [start], cost: 0 };
  const open = new MinPriorityQueue();
  open.push(start, 0);
  const cameFrom = new Map<string, string>();
  const costs = new Map<string, number>([[start, 0]]);
  const goalPoint = graph.nodes.get(goal);
  if (!goalPoint) return null;

  while (open.size > 0) {
    const current = open.pop();
    if (!current) break;
    const currentCost = costs.get(current.id);
    if (currentCost === undefined) continue;
    if (current.id === goal) {
      const path = [goal];
      let step = goal;
      while (step !== start) {
        const previous = cameFrom.get(step);
        if (!previous) return null;
        path.push(previous);
        step = previous;
      }
      path.reverse();
      return { nodes: path, cost: currentCost };
    }
    const currentPoint = graph.nodes.get(current.id);
    if (!currentPoint) continue;
    for (const edge of graph.adjacency.get(current.id) ?? []) {
      const nextCost = currentCost + edge.distance;
      if (nextCost >= (costs.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
      const nextPoint = graph.nodes.get(edge.to);
      if (!nextPoint) continue;
      costs.set(edge.to, nextCost);
      cameFrom.set(edge.to, current.id);
      open.push(edge.to, nextCost + distanceMeters(nextPoint, goalPoint));
    }
  }
  return null;
}

class MinPriorityQueue {
  private items: QueueItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(id: string, priority: number): void {
    const item = { id, priority };
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= item.priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop(): QueueItem | undefined {
    if (this.items.length === 0) return undefined;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].priority < this.items[left].priority
          ? right
          : left;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

function projectToSegment(
  point: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
): { point: GeoPoint; fraction: number; distance: number } {
  const latitude = (point.lat * Math.PI) / 180;
  const toLocal = (coordinate: GeoPoint) => ({
    x: (coordinate.lon * Math.PI / 180) * EARTH_RADIUS_METERS * Math.cos(latitude),
    y: (coordinate.lat * Math.PI / 180) * EARTH_RADIUS_METERS,
  });
  const p = toLocal(point);
  const start = toLocal(a);
  const end = toLocal(b);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / lengthSquared));
  const x = start.x + fraction * dx;
  const y = start.y + fraction * dy;
  return {
    point: {
      lat: (y / EARTH_RADIUS_METERS) * 180 / Math.PI,
      lon: (x / (EARTH_RADIUS_METERS * Math.cos(latitude))) * 180 / Math.PI,
    },
    fraction,
    distance: Math.hypot(p.x - x, p.y - y),
  };
}

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = ((b.lon - a.lon) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function twoKilometerBounds(center: GeoPoint): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  const latitudeDelta = 1000 / 111_320;
  const longitudeDelta = 1000 / (111_320 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  return {
    south: Math.max(-85, center.lat - latitudeDelta),
    west: Math.max(-180, center.lon - longitudeDelta),
    north: Math.min(85, center.lat + latitudeDelta),
    east: Math.min(180, center.lon + longitudeDelta),
  };
}

function graphCacheKey(center: GeoPoint): string {
  return `${Math.round(center.lat * 10_000)}:${Math.round(center.lon * 10_000)}`;
}

function nodeKey(point: GeoPoint): string {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

function validGeoPoint(point: GeoPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

function serializeGraph(graph: RoadGraph): SerializedRoadGraph {
  return {
    key: graph.key,
    center: graph.center,
    createdAt: graph.createdAt,
    nodes: [...graph.nodes.entries()],
    adjacency: [...graph.adjacency.entries()],
    segments: graph.segments,
  };
}

function deserializeGraph(graph: SerializedRoadGraph): RoadGraph {
  return {
    key: graph.key,
    center: graph.center,
    createdAt: graph.createdAt,
    nodes: new Map(graph.nodes),
    adjacency: new Map(graph.adjacency),
    segments: graph.segments,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
