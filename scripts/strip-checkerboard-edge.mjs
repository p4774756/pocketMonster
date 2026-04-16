/**
 * 去掉「烤進 PNG」的灰白棋盤假透明：從四邊洪水填充，中性灰像素變透明。
 * 僅處理與邊界連通者，避免吃掉角色身上的低飽和陰影（若陰影未連到邊界）。
 * 用法: node scripts/strip-checkerboard-edge.mjs public/pets/cat-eat.png
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

function satNorm(r, g, b) {
  const max = Math.max(r, g, b);
  if (max < 1) return 0;
  return (max - Math.min(r, g, b)) / max;
}

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 棋盤格／工作室淺灰、中灰、深灰格 */
function isNeutralBackdrop(r, g, b, a) {
  if (a < 12) return false;
  const s = satNorm(r, g, b);
  const L = lum(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return s < 0.28 && L > 38 && L < 248 && spread < 56;
}

/** 與透明相鄰的中性深灰雜點（棋盤或去背殘渣） */
function chiselCheckerSpeckles(out, w, h) {
  const c = 4;
  const idx = (x, y) => (y * w + x) * c;
  const neighTrans = (x, y) => {
    let t = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        t++;
        continue;
      }
      const i = idx(nx, ny);
      if (out[i + 3] < 28) t++;
    }
    return t;
  };
  const copy = Buffer.from(out);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (copy[i + 3] < 40) continue;
      const r = copy[i],
        g = copy[i + 1],
        b = copy[i + 2];
      if (!isNeutralBackdrop(r, g, b, copy[i + 3])) continue;
      if (neighTrans(x, y) < 3) continue;
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }
}

async function stripFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error("missing", abs);
    return false;
  }
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const c = 4;
  const idx = (x, y) => (y * w + x) * c;
  const out = Buffer.from(data);
  const seen = new Uint8Array(w * h);
  const q = [];

  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const j = y * w + x;
    if (seen[j]) return;
    seen[j] = 1;
    const i = idx(x, y);
    if (!isNeutralBackdrop(out[i], out[i + 1], out[i + 2], out[i + 3])) return;
    q.push(j);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (q.length) {
    const j = q.pop();
    const x = j % w;
    const y = (j / w) | 0;
    const i = j * c;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  chiselCheckerSpeckles(out, w, h);

  const tmp = abs + ".tmp.png";
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(tmp);
  fs.renameSync(tmp, abs);
  console.log("ok", abs);
  return true;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/strip-checkerboard-edge.mjs <png> …");
  process.exit(1);
}
let ok = 0;
for (const f of files) {
  if (await stripFile(f)) ok++;
}
process.exit(ok === files.length ? 0 : 1);
