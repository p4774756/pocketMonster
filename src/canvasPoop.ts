/**
 * 大便怪：Canvas 像素格（貓／狗養太糟進化用），養成與對戰共用。
 * 邏輯格 32×32。
 */
import type { CarePose } from "./pet";

const COL = {
  body: "#5c4033",
  bodyHi: "#7a5544",
  bodyLo: "#3d2918",
  eye: "#f8fafc",
  pupil: "#0f172a",
  stink: "#9ca3af",
  fly: "#1e293b",
};

function cellR(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  c: string,
  cell: number,
) {
  ctx.fillStyle = c;
  ctx.fillRect(
    Math.floor(gx * cell),
    Math.floor(gy * cell),
    Math.ceil(gw * cell),
    Math.ceil(gh * cell),
  );
}

function drawPoopIdle(ctx: CanvasRenderingContext2D, cell: number) {
  cellR(ctx, 10, 20, 14, 8, COL.bodyLo, cell);
  cellR(ctx, 9, 18, 16, 8, COL.body, cell);
  cellR(ctx, 10, 17, 12, 6, COL.bodyHi, cell);
  cellR(ctx, 11, 15, 10, 5, COL.body, cell);
  cellR(ctx, 12, 13, 8, 4, COL.bodyHi, cell);
  cellR(ctx, 13, 11, 6, 3, COL.body, cell);
  cellR(ctx, 11, 19, 3, 2, COL.bodyLo, cell);
  cellR(ctx, 18, 20, 2, 2, COL.bodyLo, cell);
  cellR(ctx, 14, 14, 2.2, 2.2, COL.eye, cell);
  cellR(ctx, 17, 14.2, 2.2, 2.2, COL.eye, cell);
  cellR(ctx, 14.5, 14.6, 1, 1, COL.pupil, cell);
  cellR(ctx, 17.6, 14.8, 1, 1, COL.pupil, cell);
  cellR(ctx, 6, 10, 1.5, 1, COL.stink, cell);
  cellR(ctx, 24, 9, 1.2, 1, COL.stink, cell);
  cellR(ctx, 22, 7, 2, 1.2, COL.fly, cell);
  cellR(ctx, 7, 8, 1.8, 1, COL.fly, cell);
}

function drawPoopEat(ctx: CanvasRenderingContext2D, cell: number) {
  drawPoopIdle(ctx, cell);
  cellR(ctx, 14, 16, 4, 1.5, "#3f2a1c", cell);
}

function drawPoopTrain(ctx: CanvasRenderingContext2D, cell: number) {
  drawPoopIdle(ctx, cell);
  cellR(ctx, 22, 18, 3, 0.8, "#64748b", cell);
}

function drawPoopRest(ctx: CanvasRenderingContext2D, cell: number) {
  cellR(ctx, 9, 21, 16, 7, COL.bodyLo, cell);
  cellR(ctx, 8, 20, 17, 7, COL.body, cell);
  cellR(ctx, 9, 19, 13, 5, COL.bodyHi, cell);
  cellR(ctx, 18, 17, 5, 4, COL.body, cell);
  cellR(ctx, 15, 16, 2.2, 2.2, COL.eye, cell);
  cellR(ctx, 19, 16.2, 2.2, 2.2, COL.eye, cell);
  cellR(ctx, 15.4, 16.6, 0.8, 0.8, COL.pupil, cell);
  cellR(ctx, 19.6, 16.8, 0.8, 0.8, COL.pupil, cell);
}

function drawPoopClean(ctx: CanvasRenderingContext2D, cell: number) {
  drawPoopIdle(ctx, cell);
  cellR(ctx, 5, 12, 2, 2, "#bae6fd", cell);
  cellR(ctx, 25, 14, 2, 2, "#bae6fd", cell);
}

export type PoopCanvasOptions = {
  cssSize: number;
  hatched: boolean;
  /** 成長階段僅影響微縮放感（可選） */
  stage?: 0 | 1 | 2 | 3 | 4;
  pose?: CarePose | null;
};

export function renderPoopMonsterCanvas(
  canvas: HTMLCanvasElement,
  options: PoopCanvasOptions,
): void {
  const css = options.cssSize;
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  canvas.style.width = `${css}px`;
  canvas.style.height = `${css}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const G = 32;
  const cell = css / G;
  ctx.clearRect(0, 0, css, css);
  if (!options.hatched) {
    cellR(ctx, 11, 14, 10, 14, "#e8dcc8", cell);
    cellR(ctx, 10, 16, 12, 10, "#f3eadc", cell);
    return;
  }
  const pose = options.pose;
  if (pose === "eat") drawPoopEat(ctx, cell);
  else if (pose === "train") drawPoopTrain(ctx, cell);
  else if (pose === "rest") drawPoopRest(ctx, cell);
  else if (pose === "clean") drawPoopClean(ctx, cell);
  else drawPoopIdle(ctx, cell);
}
