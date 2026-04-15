/**
 * 蛋 PNG：依「邊緣像素」推斷背景色，色差小者設為透明（比固定灰閾值更不伤蛋殼）。
 * 用法: node scripts/strip-egg-gray.mjs public/pets/pet-egg-volt.png ...
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

function stripByBorder(buf, w, h, channels) {
  const c = channels;
  const idx = (x, y) => (y * w + x) * c;
  const samples = [];
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = idx(x, y);
      if (buf[i + 3] > 40) samples.push([buf[i], buf[i + 1], buf[i + 2]]);
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = idx(x, y);
      if (buf[i + 3] > 40) samples.push([buf[i], buf[i + 1], buf[i + 2]]);
    }
  }
  if (samples.length < 4) return Buffer.from(buf);
  let br = 0,
    bg = 0,
    bb = 0;
  for (const [r, g, b] of samples) {
    br += r;
    bg += g;
    bb += b;
  }
  br /= samples.length;
  bg /= samples.length;
  bb /= samples.length;

  const thr = 38 * 38;
  const out = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      if (dist2(r, g, b, br, bg, bb) < thr) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

/** 去掉常見「假透明」白底／淺灰底。 */
function stripLightMatte(buf, w, h, channels) {
  const c = channels;
  const out = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const neutral = max - min < 20;
      const almostWhite = lum > 232 && neutral;
      const lightGray = lum > 175 && lum < 232 && neutral;
      if (almostWhite || lightGray) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

for (const rel of process.argv.slice(2)) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) {
    console.error("missing", file);
    process.exit(1);
  }
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let stripped = stripByBorder(data, info.width, info.height, info.channels);
  stripped = stripLightMatte(
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
