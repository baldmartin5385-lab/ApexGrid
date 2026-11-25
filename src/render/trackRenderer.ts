import { Application, Graphics, Text } from "pixi.js";
import type { AIDriver } from "../domain/ai";
import type { CarState } from "../domain/physics";
import type { Point, Track } from "../domain/track";
import { WORLD } from "../domain/track";

export class TrackRenderer {
  private readonly graphics = new Graphics();
  private readonly labels = new Text({
    text: "",
    style: { fill: "#f6f7f2", fontFamily: "Arial", fontSize: 15, fontWeight: "bold" },
  });

  constructor(private readonly app: Application) {
    this.app.stage.addChild(this.graphics, this.labels);
    this.labels.anchor.set(0, 0);
  }

  draw(track: Track, car: CarState | null, editorPoints?: Point[], aiDrivers: AIDriver[] = []): void {
    const g = this.graphics;
    g.clear();
    const { scale, offsetX, offsetY } = this.viewport();
    const p = (point: Point): Point => ({
      x: offsetX + point.x * scale,
      y: offsetY + point.y * scale,
    });

    this.drawBackdrop(g, scale, offsetX, offsetY);
    const points = editorPoints ?? track.points;
    if (points.length > 1) {
      this.drawPath(g, points, p, track.width * scale + 18, 0x26312f);
      this.drawPath(g, points, p, track.width * scale, 0x555d5b);
      this.drawPath(g, points, p, track.width * scale - 7, 0x343b3a);
      this.drawPath(g, points, p, 2, 0xb9c0b9, 0.54);
      if (!editorPoints) this.drawCurbs(g, track, p, scale);
      this.drawStartLine(g, points, p, track.width * scale);
      if (editorPoints) this.drawEditorNodes(g, points, p);
    }

    if (car && !editorPoints) this.drawCar(g, p(car), car.heading, car.offTrack, 0xf1c75b);
    if (!editorPoints) {
      for (const driver of aiDrivers) {
        this.drawCar(g, p(driver.car), driver.car.heading, driver.car.offTrack, driver.color);
      }
    }

    this.labels.text = editorPoints ? "CIRCUIT WORKSHOP  /  CLICK TO PLACE WAYPOINTS" : "APEXGRID  /  PRACTICE";
    this.labels.position.set(20, 17);
    this.labels.style.fontSize = Math.max(12, Math.min(15, 15 * scale));
  }

  toWorld(clientX: number, clientY: number): Point {
    const rect = this.app.canvas.getBoundingClientRect();
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

  private drawCar(g: Graphics, at: Point, heading: number, offTrack: boolean, color: number): void {
    g.circle(at.x, at.y, 15).fill({ color: 0x000000, alpha: 0.34 });
    const length = 19;
    const halfWidth = 9;
    const local = [
      { x: length, y: 0 },
      { x: 7, y: -halfWidth },
      { x: -length, y: -halfWidth * 0.72 },
      { x: -length - 4, y: 0 },
      { x: -length, y: halfWidth * 0.72 },
      { x: 7, y: halfWidth },
    ];
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const vertices = local.flatMap((point) => [
      at.x + point.x * cos - point.y * sin,
      at.y + point.x * sin + point.y * cos,
    ]);
    g.poly(vertices, true).fill(offTrack ? 0xff785e : color);
    g.circle(at.x + Math.cos(heading) * 7, at.y + Math.sin(heading) * 7, 3).fill(0xfaf5e7);
  }
}
