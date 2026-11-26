import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { RACE_SERIES, type AIDriver } from "../domain/ai";
import { smoothTrackPoints, type Point, type Track } from "../domain/track";
import { VEHICLES, VEHICLE_BY_ID } from "../domain/vehicles";
import { WORLD } from "../domain/track";
import { geoToTrackWorld, trackWorldToGeo } from "../engine/MapRouter";
import { geoToScreen, screenToGeo, TileProvider, type MapCamera, type VisibleTile } from "../map/TileProvider";

export interface EditorViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export class TrackRenderer {
  private readonly mapLayer = new Container();
  private readonly backdrop = new Graphics();
  private readonly graphics = new Graphics();
  private readonly carLayer = new Container();
  private readonly vectorCars = new Map<string, Container>();
  private readonly vehicleTextures = new Map<string, Texture>();
  private readonly tileSprites = new Map<string, Sprite>();

  constructor(
    private readonly app: Application,
    private readonly tileProvider = new TileProvider(),
    private readonly onTileError: (error: Error) => void = (error) => console.warn(error),
  ) {
    this.app.stage.addChild(this.mapLayer, this.backdrop, this.graphics, this.carLayer);
  }

  async loadVehicleTextures(): Promise<void> {
    await Promise.all(VEHICLES.map(async (vehicle) => {
      const texture = await Assets.load<Texture>(vehicle.spriteUrl);
      this.vehicleTextures.set(vehicle.id, texture);
    }));
  }

  draw(
    track: Track,
    editorPoints?: Point[],
    aiDrivers: AIDriver[] = [],
    mapCamera?: MapCamera,
    editorViewport?: EditorViewport,
    selectedWaypointIndex = -1,
    spectatorFollow?: Point,
    selectedSpectatorDriverId?: string | null,
  ): void {
    const g = this.graphics;
    g.clear();
    this.vectorCars.forEach((car) => { car.visible = false; });
    if (mapCamera) this.updateMapTiles(mapCamera);
    else this.clearMapTiles();
    const points = editorPoints ?? track.points;
    const closed = track.closed !== false;
    const linePoints = smoothTrackPoints(points, closed, 6);
    const { scale, offsetX, offsetY } = this.viewport(editorPoints ? undefined : linePoints);
    const p = (point: Point): Point => ({
      x: offsetX + point.x * scale,
      y: offsetY + point.y * scale,
    });

    this.backdrop.clear();
    if (!mapCamera) this.drawBackdrop(this.backdrop, Boolean(track.backgroundImage));
    const classic = document.documentElement.dataset.theme === "classic";
    const project = mapCamera && track.geoReference
      ? (point: Point) => {
          const geo = trackWorldToGeo(point, {
            center: { lat: track.geoReference!.centerLat, lon: track.geoReference!.centerLon },
            zoom: track.geoReference!.zoom,
            pixelsPerWorldUnit: track.geoReference!.pixelsPerWorldUnit,
          });
          return geoToScreen(geo, mapCamera, this.app.screen.width, this.app.screen.height);
        }
      : p;
    if (points.length > 1) {
      this.drawPath(g, linePoints, project, track.width * scale + 18, classic ? 0x817866 : 0x26312f, 1, closed);
      this.drawPath(g, linePoints, project, track.width * scale, classic ? 0x56574f : 0x555d5b, 1, closed);
      this.drawPath(g, linePoints, project, track.width * scale - 7, classic ? 0x43463f : 0x343b3a, 1, closed);
      this.drawPath(g, linePoints, project, 2, classic ? 0xe7dfcc : 0xb9c0b9, 0.7, closed);
      if (!editorPoints && !mapCamera) this.drawCurbs(g, { ...track, points: linePoints }, project, scale);
      if (closed) this.drawStartLine(g, linePoints, project, track.width * scale);
    }
    if (editorPoints) this.drawEditorNodes(g, points, project, selectedWaypointIndex);

    if (!editorPoints) {
      for (const driver of aiDrivers) {
        const at = project(driver.car);
        const key = `${driver.series}:${driver.id}`;
        const selected = driver.id === selectedSpectatorDriverId;
        let vectorCar = this.vectorCars.get(key);
        if (!vectorCar) {
          vectorCar = this.createVectorCar(driver);
          this.vectorCars.set(key, vectorCar);
          this.carLayer.addChild(vectorCar);
        }
        vectorCar.position.set(at.x, at.y);
        vectorCar.scale.set(scale * (selected ? 1.3 : 1));
        vectorCar.rotation = driver.car.heading + Math.PI / 2;
        vectorCar.alpha = driver.car.offTrack ? 0.65 : 1;
        vectorCar.children[1].visible = selected;
        vectorCar.visible = true;
        if (selected) this.carLayer.setChildIndex(vectorCar, this.carLayer.children.length - 1);
      }
    }
    const zoom = mapCamera ? 1 : editorViewport?.zoom ?? 1;
    const panX = mapCamera ? 0 : editorViewport?.panX ?? 0;
    const panY = mapCamera ? 0 : editorViewport?.panY ?? 0;
    const followedPoint = spectatorFollow && !mapCamera && !editorPoints
      ? p(spectatorFollow)
      : null;
    const transformOffsetX = followedPoint
      ? this.app.screen.width / 2 - followedPoint.x * zoom + panX
      : this.app.screen.width / 2 * (1 - zoom) + panX;
    const transformOffsetY = followedPoint
      ? this.app.screen.height / 2 - followedPoint.y * zoom + panY
      : this.app.screen.height / 2 * (1 - zoom) + panY;
    for (const layer of [this.graphics, this.carLayer]) {
      layer.scale.set(zoom);
      layer.position.set(transformOffsetX, transformOffsetY);
    }
  }

  private createVectorCar(driver: AIDriver): Container {
    const car = new Container();
    const definition = VEHICLE_BY_ID.get(driver.vehicleId);
    if (!definition) throw new Error(`Vehicle definition is missing: ${driver.vehicleId}`);
    const targetLength = RACE_SERIES[driver.series].vehicleLength;
    const shadow = new Graphics()
      .roundRect(-targetLength * 0.6, -targetLength * 0.31, targetLength * 1.2, targetLength * 0.62, targetLength * 0.22)
      .fill({ color: 0x080a0b, alpha: 0.42 });
    const focusRing = new Graphics()
      .circle(0, 0, targetLength * 0.76)
      .stroke({ color: 0xffd36a, width: 2.5, alpha: 0.9 });
    focusRing.visible = false;
    car.addChild(shadow, focusRing);
    const texture = this.vehicleTextures.get(definition.id);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(targetLength / definition.spriteLengthPixels);
      car.addChild(sprite);
    } else {
      const body = new Graphics()
        .roundRect(-targetLength * 0.18, -targetLength * 0.5, targetLength * 0.36, targetLength, targetLength * 0.12)
        .fill(driver.color)
        .roundRect(-targetLength * 0.1, -targetLength * 0.12, targetLength * 0.2, targetLength * 0.3, targetLength * 0.06)
        .fill(0x101419);
      car.addChild(body);
    }
    return car;
  }

  private drawBackdrop(g: Graphics, hasImage: boolean): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const classic = document.documentElement.dataset.theme === "classic";
    if (!hasImage) g.rect(0, 0, width, height).fill(classic ? 0xd8d0c0 : 0x121a19);
    const step = 28;
    const gridColor = classic ? 0x867c68 : 0x26312b;
    const alpha = hasImage ? 0.18 : classic ? 0.32 : 0.38;
    for (let x = 0; x <= width; x += step) {
      g.moveTo(x, 0).lineTo(x, height).stroke({ color: gridColor, alpha, width: 1 });
    }
    for (let y = 0; y <= height; y += step) {
      g.moveTo(0, y).lineTo(width, y).stroke({ color: gridColor, alpha, width: 1 });
    }
  }

  toWorld(
    clientX: number,
    clientY: number,
    mapCamera?: MapCamera,
    geoReference?: Track["geoReference"],
    editorViewport?: EditorViewport,
  ): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    if (mapCamera && geoReference) {
      const geo = screenToGeo(
        { x: clientX - rect.left, y: clientY - rect.top },
        mapCamera,
        this.app.screen.width,
        this.app.screen.height,
      );
      return geoToTrackWorld(geo, {
        center: { lat: geoReference.centerLat, lon: geoReference.centerLon },
        zoom: geoReference.zoom,
        pixelsPerWorldUnit: geoReference.pixelsPerWorldUnit,
      });
    }
    const { scale, offsetX, offsetY } = this.viewport();
    const zoom = editorViewport?.zoom ?? 1;
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    const screenX = (clientX - rect.left - (editorViewport?.panX ?? 0) - centerX) / zoom + centerX;
    const screenY = (clientY - rect.top - (editorViewport?.panY ?? 0) - centerY) / zoom + centerY;
    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    };
  }

  toScreen(
    point: Point,
    mapCamera?: MapCamera,
    geoReference?: Track["geoReference"],
    editorViewport?: EditorViewport,
  ): Point {
    if (mapCamera && geoReference) {
      const geo = trackWorldToGeo(point, {
        center: { lat: geoReference.centerLat, lon: geoReference.centerLon },
        zoom: geoReference.zoom,
        pixelsPerWorldUnit: geoReference.pixelsPerWorldUnit,
      });
      return geoToScreen(geo, mapCamera, this.app.screen.width, this.app.screen.height);
    }
    const { scale, offsetX, offsetY } = this.viewport();
    const zoom = editorViewport?.zoom ?? 1;
    return {
      x: this.app.screen.width / 2 + (offsetX + point.x * scale - this.app.screen.width / 2) * zoom + (editorViewport?.panX ?? 0),
      y: this.app.screen.height / 2 + (offsetY + point.y * scale - this.app.screen.height / 2) * zoom + (editorViewport?.panY ?? 0),
    };
  }

  fitEditorViewport(points: Point[], closed: boolean, trackWidth: number): EditorViewport {
    if (points.length === 0) return { zoom: 1, panX: 0, panY: 0 };
    const { scale, offsetX, offsetY } = this.viewport();
    const bounds = smoothTrackPoints(points, closed, 6).reduce(
      (result, point) => ({
        minX: Math.min(result.minX, offsetX + point.x * scale),
        maxX: Math.max(result.maxX, offsetX + point.x * scale),
        minY: Math.min(result.minY, offsetY + point.y * scale),
        maxY: Math.max(result.maxY, offsetY + point.y * scale),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const margin = Math.max(40, trackWidth * scale / 2 + 20);
    const zoom = Math.max(
      0.000001,
      Math.min(
        5,
        Math.max(1, this.app.screen.width - margin * 2) / width,
        Math.max(1, this.app.screen.height - margin * 2) / height,
      ),
    );
    return {
      zoom,
      panX: (this.app.screen.width / 2 - (bounds.minX + bounds.maxX) / 2) * zoom,
      panY: (this.app.screen.height / 2 - (bounds.minY + bounds.maxY) / 2) * zoom,
    };
  }

  private viewport(points?: Point[]): { scale: number; offsetX: number; offsetY: number } {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    let minX: number = 0;
    let minY: number = 0;
    let maxX: number = WORLD.width;
    let maxY: number = WORLD.height;
    if (points) {
      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
    return {
      scale,
      offsetX: (width - (maxX - minX) * scale) / 2 - minX * scale,
      offsetY: (height - (maxY - minY) * scale) / 2 - minY * scale,
    };
  }

  private updateMapTiles(camera: MapCamera): void {
    const visible = this.tileProvider.visibleTiles(camera, this.app.screen.width, this.app.screen.height);
    const wanted = new Set(visible.map((tile) => tile.key));
    for (const [key, sprite] of this.tileSprites) {
      if (wanted.has(key)) continue;
      this.mapLayer.removeChild(sprite);
      this.tileSprites.delete(key);
    }
    for (const tile of visible) this.placeTile(tile);
  }

  private placeTile(tile: VisibleTile): void {
    let sprite = this.tileSprites.get(tile.key);
    if (!sprite) {
      sprite = new Sprite();
      sprite.visible = false;
      this.tileSprites.set(tile.key, sprite);
      this.mapLayer.addChild(sprite);
      const target = sprite;
      void this.tileProvider.load(tile).then((image) => {
        if (this.tileSprites.get(tile.key) !== target) return;
        target.texture = Texture.from(image);
        target.visible = true;
      }).catch((error: unknown) => {
        this.tileSprites.delete(tile.key);
        this.mapLayer.removeChild(target);
        this.onTileError(error instanceof Error ? error : new Error("Map tile failed to load."));
      });
    }
    sprite.position.set(tile.screenX, tile.screenY);
    sprite.width = 256;
    sprite.height = 256;
  }

  private clearMapTiles(): void {
    for (const sprite of this.tileSprites.values()) this.mapLayer.removeChild(sprite);
    this.tileSprites.clear();
  }

  private drawPath(
    g: Graphics,
    points: Point[],
    project: (point: Point) => Point,
    width: number,
    color: number,
    alpha = 1,
    closed = true,
  ): void {
    if (points.length < 2) return;
    const first = project(points[0]);
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i += 1) {
      const point = project(points[i]);
      g.lineTo(point.x, point.y);
    }
    if (closed) g.closePath();
    g.stroke({ color, alpha, width, cap: "round", join: "round" });
  }

  private drawCurbs(g: Graphics, track: Track, project: (point: Point) => Point, scale: number): void {
    const edgeDistance = track.width / 2 - 3;
    for (let side = -1; side <= 1; side += 2) {
      const edgePoints = track.points.map((point, index) => {
        const before = track.points[(index - 1 + track.points.length) % track.points.length];
        const after = track.points[(index + 1) % track.points.length];
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        return {
          x: point.x - (dy / length) * edgeDistance * side,
          y: point.y + (dx / length) * edgeDistance * side,
        };
      });
      for (let i = 0; i < edgePoints.length; i += 1) {
        const from = project(edgePoints[i]);
        const to = project(edgePoints[(i + 1) % edgePoints.length]);
        g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({
          color: i % 2 === 0 ? 0xf1eee2 : 0xe94d43,
          width: Math.max(3, 5 * scale),
          alpha: 0.95,
        });
      }
    }
  }

  private drawStartLine(g: Graphics, points: Point[], project: (point: Point) => Point, width: number): void {
    if (points.length < 2) return;
    const start = points[0];
    const before = points[points.length - 1];
    const after = points[1];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const a = project({ x: start.x + normal.x * width / this.viewport().scale * 0.4, y: start.y + normal.y * width / this.viewport().scale * 0.4 });
    const b = project({ x: start.x - normal.x * width / this.viewport().scale * 0.4, y: start.y - normal.y * width / this.viewport().scale * 0.4 });
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xffffff, width: 4, alpha: 0.95 });
  }

  private drawEditorNodes(
    g: Graphics,
    points: Point[],
    project: (point: Point) => Point,
    selectedIndex: number,
  ): void {
    points.forEach((point, index) => {
      const at = project(point);
      const selected = index === selectedIndex;
      g.circle(at.x, at.y, selected ? 11 : index === 0 ? 8 : 6)
        .fill(selected ? 0xffffff : index === 0 ? 0xf1c75b : 0x72d9c4);
      g.circle(at.x, at.y, selected ? 5 : index === 0 ? 3 : 2).fill(0x10201e);
    });
  }

}
