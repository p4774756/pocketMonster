/**
 * 角色／姿勢 PNG：去掉常見淺灰、淺藍灰「假透明」底（手機淺色主題下特別明顯）。
 * 用法: node scripts/strip-creature-matte.mjs [檔案…]
 * 無參數時：處理 public/pets 下 cat-*.png、chicken-*.png、pet-*.png（排除 pet-egg-*）。
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

function dist2(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function satNorm(r, g, b) {
  const max = Math.max(r, g, b);
  if (max < 1) return 0;
  return (max - Math.min(r, g, b)) / max;
}

/** 四角 6×6 區域內、低飽和高亮像素 → 推定工作室底色 */
function estimateMatteRgb(buf, w, h, channels) {
  const c = channels;
  const idx = (x, y) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * c;
  const corners = [
    [0, 0],
    [w - 6, 0],
    [0, h - 6],
    [w - 6, h - 6],
  ];
  const samples = [];
  for (const [x0, y0] of corners) {
    for (let dy = 0; dy < 6; dy++) {
      for (let dx = 0; dx < 6; dx++) {
        const i = idx(x0 + dx, y0 + dy);
        if (buf[i + 3] < 30) continue;
        const r = buf[i],
          g = buf[i + 1],
          b = buf[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (satNorm(r, g, b) < 0.14 && lum > 168 && lum < 252) {
          samples.push([r, g, b]);
        }
      }
    }
  }
  if (samples.length < 8) return null;
  let sr = 0,
    sg = 0,
    sb = 0;
  for (const [r, g, b] of samples) {
    sr += r;
    sg += g;
    sb += b;
  }
  return [sr / samples.length, sg / samples.length, sb / samples.length];
}

function stripNearMatte(buf, w, h, channels, matteRgb, thr2) {
  const c = channels;
  const [mr, mg, mb] = matteRgb;
  const out = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const r = out[i],
        g = out[i + 1],
        b = out[i + 2];
      if (dist2(r, g, b, mr, mg, mb) < thr2) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

/** 第二道：殘留淺中性灰／藍灰 */
function stripNeutralHighlights(buf, w, h, channels) {
  const c = channels;
  const out = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (out[i + 3] < 10) continue;
      const r = out[i],
        g = out[i + 1],
        b = out[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = satNorm(r, g, b);
      const neutral = sat < 0.16;
      const coolGray = b - r > 4 && b - g > 2 && lum > 155 && lum < 248;
      const lightMatte = neutral && lum > 172 && lum < 248;
      const nearWhite = lum > 248 && max - min < 10;
      if (lightMatte || coolGray || nearWhite) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

async function processFile(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const matte = estimateMatteRgb(data, info.width, info.height, info.channels);
  let stripped = Buffer.from(data);
  if (matte) {
    stripped = stripNearMatte(
      stripped,
      info.width,
      info.height,
      info.channels,
      matte,
      42 * 42,
    );
  }
  stripped = stripNeutralHighlights(
    stripped,
    info.width,
    info.height,
    info.channels,
  );
  const tmp = file + ".tmp.png";
  await sharp(stripped, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(tmp);
  fs.renameSync(tmp, file);
  console.log("ok", file);
}

const petsDir = path.resolve("public/pets");
const argv = process.argv.slice(2);

let files = argv.map((p) => path.resolve(p));
if (files.length === 0) {
  if (!fs.existsSync(petsDir)) {
    console.error("missing", petsDir);
    process.exit(1);
  }
  files = fs
    .readdirSync(petsDir)
    .filter(
      (n) =>
        /\.png$/i.test(n) &&
        !/^pet-egg-/i.test(n) &&
        /^(cat-|chicken-|pet-)/i.test(n),
    )
    .map((n) => path.join(petsDir, n));
}

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error("missing", file);
    process.exit(1);
  }
  await processFile(file);
}
