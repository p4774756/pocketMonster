/**
 * 狗物種：Canvas 像素格繪製（無 PNG），供養成／對戰／圖鑑共用。
 * 邏輯座標為 32×32 格，再依 cssSize 換算為實際像素。
 */
import type { CarePose } from "./pet";

const COL = {
  fur: "#c9956b",
  furHi: "#e8b896",
  furLo: "#8f6844",
  nose: "#3d2914",
  eye: "#1a1210",
  belly: "#f2e0d2",
  tongue: "#e8a0a8",
  egg: "#f3e8dc",
  eggSpot: "#c49a6c",
  eggShade: "#d8c4b0",
  bowl: "#c4a882",
  kibble: "#6b5344",
  spark: "#7dd3fc",
  dumbbell: "#64748b",
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

function drawEgg(ctx: CanvasRenderingContext2D, cell: number) {
  cellR(ctx, 11, 14, 10, 14, COL.egg, cell);
  cellR(ctx, 10, 16, 12, 10, COL.egg, cell);
  cellR(ctx, 12, 15, 8, 3, COL.eggShade, cell);
  cellR(ctx, 13, 18, 2, 2, COL.eggSpot, cell);
  cellR(ctx, 17, 22, 3, 2, COL.eggSpot, cell);
  cellR(ctx, 15, 26, 2, 2, COL.eggSpot, cell);
}

/** stage 0…4：體型與頭部略增 */
function stageGrow(stage: number): { bx: number; bw: number; hx: number; hw: number; hy: number } {
  const t = stage * 0.22;
  return {
    bx: 11 - t * 0.4,
    bw: 10 + t * 1.1,
    hx: 12 - t * 0.35,
    hw: 8 + t * 0.9,
    hy: 11 - t * 0.5,
  };
}

function drawDogIdle(
  ctx: CanvasRenderingContext2D,
  cell: number,
  stage: 0 | 1 | 2 | 3 | 4,
) {
  const g = stageGrow(stage);
  cellR(ctx, g.bx, 21, g.bw, 7, COL.furLo, cell);
  cellR(ctx, g.bx + 0.4, 20.2, g.bw - 0.8, 5, COL.fur, cell);
  cellR(ctx, g.bx + 1.2, 21.5, g.bw - 2.4, 3, COL.belly, cell);
  cellR(ctx, g.hx, g.hy, g.hw, 9, COL.fur, cell);
  cellR(ctx, g.hx + 1.4, g.hy + 3.2, g.hw - 2.8, 3.2, COL.furHi, cell);
  cellR(ctx, g.hx + 2.2, g.hy + 5.5, 2.2, 1.6, COL.nose, cell);
  cellR(ctx, g.hx + 1.8, g.hy + 3.8, 1.2, 1.4, COL.eye, cell);
  cellR(ctx, g.hx + g.hw - 3.4, g.hy + 3.8, 1.2, 1.4, COL.eye, cell);
  cellR(ctx, g.hx - 0.8, g.hy + 1.2, 2.2, 4, COL.furLo, cell);
  cellR(ctx, g.hx + g.hw - 1.4, g.hy + 1.2, 2.2, 4, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw - 0.6, 20, 2.5, 5, COL.furLo, cell);
  cellR(ctx, g.bx - 0.4, 23, 2, 4, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw * 0.35, 27.2, 2, 2.2, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw * 0.65, 27.2, 2, 2.2, COL.furLo, cell);
  if (stage >= 3) {
    cellR(ctx, g.bx + 2, 20, 2.5, 2, "#9ca3af", cell);
  }
}

function drawDogEat(
  ctx: CanvasRenderingContext2D,
  cell: number,
  stage: 0 | 1 | 2 | 3 | 4,
) {
  const g = stageGrow(stage);
  cellR(ctx, 14, 26, 6, 2, COL.bowl, cell);
  cellR(ctx, 15, 25, 4, 1.2, COL.kibble, cell);
  cellR(ctx, g.bx, 21, g.bw, 7, COL.furLo, cell);
  cellR(ctx, g.bx + 0.4, 20.2, g.bw - 0.8, 5, COL.fur, cell);
  cellR(ctx, g.hx + 0.3, g.hy + 2.2, g.hw, 9, COL.fur, cell);
  cellR(ctx, g.hx + 2.2, g.hy + 6.8, 2.2, 1.4, COL.nose, cell);
  cellR(ctx, g.hx + 1.8, g.hy + 7.2, 1.8, 2.2, COL.tongue, cell);
  cellR(ctx, g.hx + 1.8, g.hy + 4.5, 1.2, 1.4, COL.eye, cell);
  cellR(ctx, g.hx + g.hw - 3.2, g.hy + 4.5, 1.2, 1.4, COL.eye, cell);
  cellR(ctx, g.hx - 0.8, g.hy + 2.4, 2.2, 4, COL.furLo, cell);
  cellR(ctx, g.hx + g.hw - 1.4, g.hy + 2.4, 2.2, 4, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw - 0.6, 20, 2.5, 5, COL.furLo, cell);
  cellR(ctx, g.bx - 0.4, 23, 2, 4, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw * 0.35, 27.2, 2, 2.2, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw * 0.65, 27.2, 2, 2.2, COL.furLo, cell);
}

function drawDogTrain(
  ctx: CanvasRenderingContext2D,
  cell: number,
  stage: 0 | 1 | 2 | 3 | 4,
) {
  const g = stageGrow(stage);
  cellR(ctx, 20, 22, 4, 2, COL.dumbbell, cell);
  cellR(ctx, 19, 21, 1.5, 4, COL.dumbbell, cell);
  cellR(ctx, 23.5, 21, 1.5, 4, COL.dumbbell, cell);
  cellR(ctx, g.bx, 21, g.bw, 7, COL.furLo, cell);
  cellR(ctx, g.bx + 0.4, 20.2, g.bw - 0.8, 5, COL.fur, cell);
  cellR(ctx, g.hx, g.hy - 0.5, g.hw, 9, COL.fur, cell);
  cellR(ctx, g.hx + 2.2, g.hy + 5.5, 2.2, 1.6, COL.nose, cell);
  cellR(ctx, g.hx + 1.8, g.hy + 3.8, 1.2, 1.4, COL.eye, cell);
  cellR(ctx, g.hx + g.hw - 3.4, g.hy + 3.8, 1.2, 1.4, COL.eye, cell);
  cellR(ctx, g.hx - 0.8, g.hy + 0.8, 2.2, 4.5, COL.furLo, cell);
  cellR(ctx, g.hx + g.hw - 1.4, g.hy + 0.8, 2.2, 4.5, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw - 0.2, 18.5, 2.2, 6.5, COL.furLo, cell);
  cellR(ctx, g.bx - 0.4, 23, 2, 4, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw * 0.35, 27.2, 2, 2.2, COL.furLo, cell);
  cellR(ctx, g.bx + g.bw * 0.65, 27.2, 2, 2.2, COL.furLo, cell);
}

function drawDogRest(
  ctx: CanvasRenderingContext2D,
  cell: number,
  stage: 0 | 1 | 2 | 3 | 4,
) {
  const w = 12 + stage * 0.35;
  const x0 = 10 - stage * 0.15;
  cellR(ctx, x0, 22, w, 6, COL.furLo, cell);
  cellR(ctx, x0 + 0.5, 21.2, w - 1, 4.5, COL.fur, cell);
  cellR(ctx, x0 + 2, 21.5, w - 4, 3, COL.belly, cell);
  cellR(ctx, x0 + w - 5, 18, 6, 7, COL.fur, cell);
  cellR(ctx, x0 + w - 4.2, 20, 1.2, 1.2, COL.eye, cell);
  cellR(ctx, x0 + w - 2.4, 20, 1.2, 1.2, COL.eye, cell);
  cellR(ctx, x0 + w - 3.4, 21.6, 2, 1.4, COL.nose, cell);
  cellR(ctx, x0 + w - 6, 17, 2.5, 3, COL.furLo, cell);
  cellR(ctx, x0 + 0.2, 24, 2, 3.5, COL.furLo, cell);
  cellR(ctx, x0 + w * 0.35, 26.5, 2, 2, COL.furLo, cell);
  cellR(ctx, x0 + w * 0.62, 26.5, 2, 2, COL.furLo, cell);
}

function drawDogClean(
  ctx: CanvasRenderingContext2D,
  cell: number,
  stage: 0 | 1 | 2 | 3 | 4,
) {
  drawDogIdle(ctx, cell, stage);
  cellR(ctx, 6, 10, 2, 2, COL.spark, cell);
  cellR(ctx, 24, 12, 2, 2, COL.spark, cell);
  cellR(ctx, 8, 8, 1.5, 1.5, COL.spark, cell);
  cellR(ctx, 22, 9, 1.5, 1.5, COL.spark, cell);
}

export type DogCanvasOptions = {
  cssSize: number;
  hatched: boolean;
  stage: 0 | 1 | 2 | 3 | 4;
  pose?: CarePose | null;
};

export function renderDogCanvas(
  canvas: HTMLCanvasElement,
  options: DogCanvasOptions,
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
    drawEgg(ctx, cell);
    return;
  }
  const st = options.stage;
  const pose = options.pose;
  if (pose === "eat") drawDogEat(ctx, cell, st);
  else if (pose === "train") drawDogTrain(ctx, cell, st);
  else if (pose === "rest") drawDogRest(ctx, cell, st);
  else if (pose === "clean") drawDogClean(ctx, cell, st);
  else drawDogIdle(ctx, cell, st);
}

/** 圖鑑掛載：`data-dex-dog="idle"` + `data-stage`（`egg` 僅供相容舊 HTML） */
export function initDexDogCanvases(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>("[data-dex-dog]").forEach((cv) => {
    const kind = cv.dataset.dexDog;
    if (kind === "egg") {
      renderDogCanvas(cv, { cssSize: 96, hatched: false, stage: 0 });
    } else {
      const st = Number(cv.dataset.stage) as 0 | 1 | 2 | 3 | 4;
      renderDogCanvas(cv, {
        cssSize: 96,
        hatched: true,
        stage: st >= 0 && st <= 4 ? st : 0,
        pose: null,
      });
    }
  });
}
