/**
 * 洋紅幕去背：AI 輸出常用 #FF00FF 單色底 → 透明（含部分洋紅邊緣色）。
 * 用法: node scripts/strip-magenta-bg.mjs public/pets/foo.png …
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

function dist2(r, g, b, tr, tg, tb) {
  const dr = r - tr;
  const dg = g - tg;
  const db = b - tb;
  return dr * dr + dg * dg + db * db;
}

/** 主色接近洋紅且綠色通道偏低（避免吃掉紫灰毛色） */
function magentaScore(r, g, b) {
  const d = dist2(r, g, b, 255, 0, 255);
  const keyish = r > 120 && b > 120 && g < 130;
  return keyish ? d : 1e9;
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
  const out = Buffer.from(data);
  const hard = 85 * 85;
  const soft = 145 * 145;

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    let a = out[i + 3];
    if (a < 8) continue;

    const d = magentaScore(r, g, b);
    if (d < hard) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    if (d < soft) {
      const t = (Math.sqrt(d) - 85) / (145 - 85);
      const na = Math.floor(a * Math.min(1, Math.max(0, t)));
      out[i + 3] = na;
    }
  }

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
  console.error("usage: node scripts/strip-magenta-bg.mjs <png> …");
  process.exit(1);
}
let ok = 0;
for (const f of files) {
  if (await stripFile(f)) ok++;
}
process.exit(ok === files.length ? 0 : 1);
