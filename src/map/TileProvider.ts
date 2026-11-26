export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface MapCamera {
  center: GeoPoint;
  zoom: number;
  layer: TileLayer;
}

export type TileLayer = "street" | "dark" | "satellite" | "topographic";
export type MapTileImage = ImageBitmap | HTMLImageElement;

export interface VisibleTile {
  key: string;
  url: string;
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
}

const TILE_SIZE = 256;
const MAX_CACHE_SIZE = 192;
const TILE_SOURCES: Record<TileLayer, { url: string; maxZoom: number }> = {
  street: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19 },
  dark: { url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", maxZoom: 20 },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
  },
  topographic: { url: "https://tile.openmaps.fr/opentopomap/{z}/{x}/{y}.png", maxZoom: 17 },
};

interface TileJob {
  tile: VisibleTile;
  resolve: (image: MapTileImage) => void;
  reject: (error: Error) => void;
}

export function clampZoom(layer: TileLayer, zoom: number): number {
  return Math.max(2, Math.min(TILE_SOURCES[layer].maxZoom, Math.round(zoom)));
}

export function geoToTilePixels(point: GeoPoint, zoom: number): { x: number; y: number } {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const mapSize = TILE_SIZE * 2 ** zoom;
  const sinLatitude = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lon + 180) / 360) * mapSize,
    y:
      (0.5 -
        Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      mapSize,
  };
}

export function tilePixelsToGeo(pixel: { x: number; y: number }, zoom: number): GeoPoint {
  const mapSize = TILE_SIZE * 2 ** zoom;
  const x = ((pixel.x % mapSize) + mapSize) % mapSize;
  const y = Math.max(0, Math.min(mapSize, pixel.y));
  const lon = (x / mapSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / mapSize;
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lon,
  };
}

export function geoToScreen(
  point: GeoPoint,
  camera: MapCamera,
  width: number,
  height: number,
): { x: number; y: number } {
  const zoom = clampZoom(camera.layer, camera.zoom);
  const center = geoToTilePixels(camera.center, zoom);
  const target = geoToTilePixels(point, zoom);
  const mapSize = TILE_SIZE * 2 ** zoom;
  let dx = target.x - center.x;
  if (dx > mapSize / 2) dx -= mapSize;
  if (dx < -mapSize / 2) dx += mapSize;
  return { x: width / 2 + dx, y: height / 2 + target.y - center.y };
}

export function screenToGeo(
  point: { x: number; y: number },
  camera: MapCamera,
  width: number,
  height: number,
): GeoPoint {
  const zoom = clampZoom(camera.layer, camera.zoom);
  const center = geoToTilePixels(camera.center, zoom);
  return tilePixelsToGeo(
    { x: center.x + point.x - width / 2, y: center.y + point.y - height / 2 },
    zoom,
  );
}

export class TileProvider {
  private readonly cache = new Map<string, MapTileImage>();
  private readonly inProgress = new Map<string, Promise<MapTileImage>>();
  private readonly queue: TileJob[] = [];
  private activeRequests = 0;

  constructor(private readonly maxConcurrency = 4) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4) {
      throw new Error("Tile request concurrency must be between 1 and 4.");
    }
  }

  visibleTiles(camera: MapCamera, width: number, height: number, edgeBuffer = 1): VisibleTile[] {
    const zoom = clampZoom(camera.layer, camera.zoom);
    const center = geoToTilePixels(camera.center, zoom);
    const left = center.x - width / 2;
    const top = center.y - height / 2;
    const worldTiles = 2 ** zoom;
    const minX = Math.floor(left / TILE_SIZE) - edgeBuffer;
    const maxX = Math.floor((left + width - 1) / TILE_SIZE) + edgeBuffer;
    const minY = Math.max(0, Math.floor(top / TILE_SIZE) - edgeBuffer);
    const maxY = Math.min(
      worldTiles - 1,
      Math.floor((top + height - 1) / TILE_SIZE) + edgeBuffer,
    );
    const source = TILE_SOURCES[camera.layer];
    const tiles: VisibleTile[] = [];

    for (let y = minY; y <= maxY; y += 1) {
      for (let unwrappedX = minX; unwrappedX <= maxX; unwrappedX += 1) {
        const x = ((unwrappedX % worldTiles) + worldTiles) % worldTiles;
        const key = `${camera.layer}/${zoom}/${x}/${y}`;
        tiles.push({
          key,
          url: source.url
            .replace("{z}", zoom.toString())
            .replace("{x}", x.toString())
            .replace("{y}", y.toString()),
          x,
          y,
          z: zoom,
          screenX: unwrappedX * TILE_SIZE - left,
          screenY: y * TILE_SIZE - top,
        });
      }
    }
    return tiles;
  }

  load(tile: VisibleTile): Promise<MapTileImage> {
    const cached = this.cache.get(tile.key);
    if (cached) {
      this.cache.delete(tile.key);
      this.cache.set(tile.key, cached);
      return Promise.resolve(cached);
    }
    const existing = this.inProgress.get(tile.key);
    if (existing) return existing;

    const promise = new Promise<MapTileImage>((resolve, reject) => {
      this.queue.push({ tile, resolve, reject });
      this.pumpQueue();
    });
    this.inProgress.set(tile.key, promise);
    void promise.then(
      () => this.inProgress.delete(tile.key),
      () => this.inProgress.delete(tile.key),
    );
    return promise;
  }

  clearMemoryCache(): void {
    for (const image of this.cache.values()) this.closeImage(image);
    this.cache.clear();
  }

  private pumpQueue(): void {
    while (this.activeRequests < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) return;
      this.activeRequests += 1;
      void this.fetchTile(job.tile)
        .then((image) => {
          this.cache.set(job.tile.key, image);
          while (this.cache.size > MAX_CACHE_SIZE) {
            const oldest = this.cache.keys().next().value as string | undefined;
            if (!oldest) break;
            const evicted = this.cache.get(oldest);
            if (evicted) this.closeImage(evicted);
            this.cache.delete(oldest);
          }
          job.resolve(image);
        })
        .catch((error: unknown) => {
          job.reject(error instanceof Error ? error : new Error("Map tile request failed."));
        })
        .finally(() => {
          this.activeRequests -= 1;
          this.pumpQueue();
        });
    }
  }

  private async fetchTile(tile: VisibleTile): Promise<MapTileImage> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(tile.url, {
        method: "GET",
        cache: "default",
        mode: "cors",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (response.status === 429 && attempt < 3) {
        await delay(500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Map tile request failed (${response.status}): ${tile.url}`);

      const blob = await response.blob();
      if (typeof createImageBitmap === "function") return createImageBitmap(blob);
      return loadHtmlImage(blob);
    }
    throw new Error(`Map tile request was rate-limited repeatedly: ${tile.url}`);
  }

  private closeImage(image: MapTileImage): void {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function loadHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Map tile image could not be decoded."));
    };
    image.src = objectUrl;
  });
}
