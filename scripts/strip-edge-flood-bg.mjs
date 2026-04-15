/**
 * 以「綠／黃身體核心」膨脹成主體遮罩，從畫布邊緣 BFS 標記背景為透明。
 * 用於白底、棋盤格、洋紅格等假透明；黑線稿隨綠色一起被遮罩涵蓋。
 *
 * 用法: node scripts/strip-edge-flood-bg.mjs public/pets/pet-idle-s0.png …
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

function idx(x, y, w) {
  return (y * w + x) * 4;
}

function satNorm(r, g, b) {
  const max = Math.max(r, g, b);
  if (max < 1) return 0;
  return (max - Math.min(r, g, b)) / max;
}

function zeroAlpha(out, i) {
  out[i] = 0;
  out[i + 1] = 0;
  out[i + 2] = 0;
  out[i + 3] = 0;
}

/** 去掉與邊界不相連的淺白塊、洋紅去背殘邊 */
function cleanupFringe(out, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (out[i + 3] < 26) continue;
      const r = out[i],
        g = out[i + 1],
        b = out[i + 2];
      const s = satNorm(r, g, b);
      if (r > 218 && g > 218 && b > 218 && s < 0.16) {
        zeroAlpha(out, i);
        continue;
      }
      if (
        g < 125 &&
        r > 60 &&
        b > 60 &&
        r + b > 200 &&
        s > 0.1 &&
        !(g >= 52 && g >= r - 14 && g >= b + 5) &&
        !(r > 148 && g > 118 && b < 138)
      ) {
        zeroAlpha(out, i);
      }
    }
  }
}

/** 身體色素（不含線稿／白點） */
function isCoreBody(r, g, b, a) {
  if (a < 40) return false;
  if (g >= 52 && g >= r - 14 && g >= b + 5) return true;
  if (r > 148 && g > 118 && b < 138 && a > 120) return true;
  return false;
}

async function floodTransparent(absPath) {
  const { data, info } = await sharp(absPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);

  const core = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      const r = out[i],
        g = out[i + 1],
        b = out[i + 2],
        a = out[i + 3];
      if (isCoreBody(r, g, b, a)) core[y * w + x] = 1;
    }
  }

  const dilateR = 5;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!core[y * w + x]) continue;
      for (let dy = -dilateR; dy <= dilateR; dy++) {
        for (let dx = -dilateR; dx <= dilateR; dx++) {
          if (dx * dx + dy * dy > dilateR * dilateR) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          mask[ny * w + nx] = 1;
        }
      }
    }
  }

  const seen = new Uint8Array(w * h);
  const q = [];
  function tryPush(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (seen[p] || mask[p]) return;
    seen[p] = 1;
    q.push(p);
  }

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++];
    const x = p % w;
    const y = (p / w) | 0;
    const i = p * 4;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  cleanupFringe(out, w, h);

  const tmp = absPath + ".tmp.png";
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(tmp);
  fs.renameSync(tmp, absPath);
  console.log("ok", absPath);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/strip-edge-flood-bg.mjs <png> …");
  process.exit(1);
}
for (const f of files) {
  await floodTransparent(path.resolve(f));
}
