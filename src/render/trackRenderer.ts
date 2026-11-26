import { Application, Container, Graphics, Sprite, Texture, type Texture as TextureType } from "pixi.js";
import { RACE_SERIES, type AIDriver } from "../domain/ai";
import type { Point, Track } from "../domain/track";
import { WORLD } from "../domain/track";
import { geoToTrackWorld, trackWorldToGeo } from "../engine/MapRouter";
import { geoToScreen, screenToGeo, TileProvider, type MapCamera, type VisibleTile } from "../map/TileProvider";

export class TrackRenderer {
  private readonly mapLayer = new Container();
  private readonly graphics = new Graphics();
  private readonly carLayer = new Container();
  private readonly carSprites = new Map<string, Sprite>();
  private readonly vectorCars = new Map<string, Container>();
  private readonly tileSprites = new Map<string, Sprite>();

  constructor(
    private readonly app: Application,
    private readonly carTextures: TextureType[],
    private readonly tileProvider = new TileProvider(),
    private readonly onTileError: (error: Error) => void = (error) => console.warn(error),
  ) {
    if (carTextures.length === 0) throw new Error("ApexGrid car sprites could not be loaded.");
    this.app.stage.addChild(this.mapLayer, this.graphics, this.carLayer);
  }

  draw(track: Track, editorPoints?: Point[], aiDrivers: AIDriver[] = [], mapCamera?: MapCamera): void {
    const g = this.graphics;
    g.clear();
    this.carSprites.forEach((sprite) => { sprite.visible = false; });
    this.vectorCars.forEach((car) => { car.visible = false; });
    if (mapCamera) this.updateMapTiles(mapCamera);
    else this.clearMapTiles();
    const { scale, offsetX, offsetY } = this.viewport();
    const p = (point: Point): Point => ({
      x: offsetX + point.x * scale,
      y: offsetY + point.y * scale,
    });

    if (!mapCamera) this.drawBackdrop(g, scale, offsetX, offsetY);
    const points = editorPoints ?? track.points;
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
      this.drawPath(g, points, project, track.width * scale + 18, 0x26312f);
      this.drawPath(g, points, project, track.width * scale, 0x555d5b);
      this.drawPath(g, points, project, track.width * scale - 7, 0x343b3a);
      this.drawPath(g, points, project, 2, 0xb9c0b9, 0.54);
      if (!editorPoints && !mapCamera) this.drawCurbs(g, track, project, scale);
      this.drawStartLine(g, points, project, track.width * scale);
      if (editorPoints) this.drawEditorNodes(g, points, project);
    }

    if (!editorPoints) {
      for (const driver of aiDrivers) {
        const at = project(driver.car);
        if (driver.series === "f1") {
          let sprite = this.carSprites.get(driver.id);
          if (!sprite) {
            const texture = this.carTextures[driver.spriteIndex % this.carTextures.length];
            sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            this.carSprites.set(driver.id, sprite);
            this.carLayer.addChild(sprite);
          }
          sprite.position.set(at.x, at.y);
          sprite.rotation = driver.car.heading + Math.PI / 2;
          sprite.height = RACE_SERIES[driver.series].spriteLength * scale;
          sprite.tint = driver.car.offTrack ? 0xff785e : driver.spriteTint;
          sprite.visible = true;
        } else {
          let vectorCar = this.vectorCars.get(driver.id);
          if (!vectorCar) {
            vectorCar = this.createVectorCar(driver.series, driver.color);
            this.vectorCars.set(driver.id, vectorCar);
            this.carLayer.addChild(vectorCar);
          }
          vectorCar.position.set(at.x, at.y);
          vectorCar.rotation = driver.car.heading;
          vectorCar.scale.set(scale * RACE_SERIES[driver.series].spriteLength / 46);
          vectorCar.alpha = driver.car.offTrack ? 0.65 : 1;
          vectorCar.visible = true;
        }
      }
    }

  }

  private createVectorCar(series: AIDriver["series"], color: number): Container {
    const car = new Container();
    const shape = new Graphics();
    const tireColor = 0x111315;
    const glassColor = 0x222a30;
    const formula = series === "f2" || series === "f3";

    if (formula) {
      shape.roundRect(-14, -12, 9, 7, 2).fill(tireColor);
      shape.roundRect(8, -12, 9, 7, 2).fill(tireColor);
      shape.roundRect(-14, 5, 9, 7, 2).fill(tireColor);
      shape.roundRect(8, 5, 9, 7, 2).fill(tireColor);
      shape.rect(17, -15, 3, 30).fill(color);
      shape.rect(-18, -15, 4, 30).fill(color);
      shape.poly(
        [
          21, 0, 15, -4, 8, -4, 2, -3, -6, -5, -15, -4, -19, 0,
          -15, 4, -6, 5, 2, 3, 8, 4, 15, 4,
        ],
        true,
      ).fill(color);
      shape.ellipse(4, 0, 5, 3).fill(glassColor);
      shape.circle(1, 0, 2).fill(0xe9e5d9);
      shape.rect(18, -5, 2, 10).fill(0xe9e5d9);
    } else {
      const prototype = series === "prototype";
      const halfLength = prototype ? 27 : 22;
      const halfWidth = prototype ? 9 : 11;
      shape.roundRect(-halfLength + 3, -halfWidth - 3, 10, 7, 2).fill(tireColor);
      shape.roundRect(halfLength - 13, -halfWidth - 3, 10, 7, 2).fill(tireColor);
      shape.roundRect(-halfLength + 3, halfWidth - 4, 10, 7, 2).fill(tireColor);
      shape.roundRect(halfLength - 13, halfWidth - 4, 10, 7, 2).fill(tireColor);
      if (prototype) {
        shape.poly(
          [
            27, 0, 20, -5, 8, -8, -8, -9, -18, -7, -25, -4,
            -27, 0, -25, 4, -18, 7, -8, 9, 8, 8, 20, 5,
          ],
          true,
        ).fill(color);
        shape.ellipse(-4, 0, 10, 5).fill(glassColor);
        shape.rect(-23, -10, 3, 20).fill(color);
        shape.rect(23, -9, 3, 18).fill(color);
      } else {
        shape.poly(
          [
            23, 0, 18, -6, 10, -10, -8, -10, -17, -8, -22, -5,
            -23, 0, -22, 5, -17, 8, -8, 10, 10, 10, 18, 6,
          ],
          true,
        ).fill(color);
        shape.roundRect(-7, -7, 12, 14, 5).fill(glassColor);
        shape.rect(18, -12, 4, 24).fill(color);
        shape.rect(-22, -12, 4, 24).fill(color);
        shape.circle(20, -6, 1.5).fill(0xf4ead5);
        shape.circle(20, 6, 1.5).fill(0xf4ead5);
      }
    }

    car.addChild(shape);
    return car;
  }

  toWorld(
    clientX: number,
    clientY: number,
    mapCamera?: MapCamera,
    geoReference?: Track["geoReference"],
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
    return {
      x: Math.max(0, Math.min(WORLD.width, (clientX - rect.left - offsetX) / scale)),
      y: Math.max(0, Math.min(WORLD.height, (clientY - rect.top - offsetY) / scale)),
    };
  }

  private viewport(): { scale: number; offsetX: number; offsetY: number } {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const scale = Math.min(width / WORLD.width, height / WORLD.height);
    return {
      scale,
      offsetX: (width - WORLD.width * scale) / 2,
      offsetY: (height - WORLD.height * scale) / 2,
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

  private drawBackdrop(g: Graphics, scale: number, offsetX: number, offsetY: number): void {
    const width = WORLD.width * scale;
    const height = WORLD.height * scale;
    g.rect(offsetX, offsetY, width, height).fill(0x121a19);
    const step = Math.max(scale * 50, 22);
    for (let x = offsetX; x <= offsetX + width; x += step) {
      g.moveTo(x, offsetY).lineTo(x, offsetY + height).stroke({ color: 0x26312b, alpha: 0.38, width: 1 });
    }
    for (let y = offsetY; y <= offsetY + height; y += step) {
      g.moveTo(offsetX, y).lineTo(offsetX + width, y).stroke({ color: 0x26312b, alpha: 0.38, width: 1 });
    }
  }

  private drawPath(
    g: Graphics,
    points: Point[],
    project: (point: Point) => Point,
    width: number,
    color: number,
    alpha = 1,
  ): void {
    if (points.length < 2) return;
    const first = project(points[0]);
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i += 1) {
      const point = project(points[i]);
      g.lineTo(point.x, point.y);
    }
    g.closePath().stroke({ color, alpha, width, cap: "round", join: "round" });
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

  private drawEditorNodes(g: Graphics, points: Point[], project: (point: Point) => Point): void {
    points.forEach((point, index) => {
      const at = project(point);
      g.circle(at.x, at.y, index === 0 ? 8 : 5).fill(index === 0 ? 0xf1c75b : 0x72d9c4);
      g.circle(at.x, at.y, index === 0 ? 3 : 2).fill(0x10201e);
    });
  }

}
