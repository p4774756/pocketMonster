/**
 * 壓縮／限縮 public/pets 內 PNG：降低首載體積（畫面顯示約 72–96px，來源圖常過大）。
 * - 最長邊 > 256 時以 nearest-neighbor 縮放（保留像素感）
 * - PNG zlib compressionLevel 9 + effort 10
 * - 若輸出未變小且尺寸未變，則略過寫入
 *
 * 用法: node scripts/optimize-pet-pngs.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const PETS_DIR = path.join(ROOT, "public", "pets");
const MAX_EDGE = 256;
const dryRun = process.argv.includes("--dry-run");

async function optimizeFile(absPath) {
  const name = path.basename(absPath);
  const before = await fs.promises.readFile(absPath);
  const meta = await sharp(before).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const maxDim = Math.max(w, h);

  let pipeline = sharp(before).ensureAlpha();
  if (maxDim > MAX_EDGE) {
    pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.nearest,
    });
  }

  const out = await pipeline
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  const metaOut = await sharp(out).metadata();
  const shrunk = out.length < before.length;
  const resized =
    (metaOut.width ?? 0) !== w || (metaOut.height ?? 0) !== h;

  if (!shrunk && !resized) {
    return { name, skipped: true, before: before.length, after: before.length };
  }
  if (!dryRun) {
    await fs.promises.writeFile(absPath, out);
  }
  return {
    name,
    skipped: false,
    before: before.length,
    after: out.length,
    resized,
  };
}

async function main() {
  const entries = await fs.promises.readdir(PETS_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png"))
    .map((e) => path.join(PETS_DIR, e.name))
    .sort();

  let saved = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const fp of files) {
    const r = await optimizeFile(fp);
    totalBefore += r.before;
    totalAfter += r.skipped ? r.before : r.after;
    if (r.skipped) {
      console.log(`${r.name}\t${r.before}\t(skip, no gain)`);
    } else {
      saved += r.before - r.after;
      console.log(
        `${r.name}\t${r.before} -> ${r.after}\t${dryRun ? "(dry-run)" : "ok"}`,
      );
    }
  }

  console.log(
    `\nTotal ${files.length} files. Before ${(totalBefore / 1e6).toFixed(2)} MB, after ${(totalAfter / 1e6).toFixed(2)} MB${dryRun ? " (dry-run totals)" : ""}. Saved ~${(saved / 1e6).toFixed(2)} MB.`,
  );
  if (dryRun) console.log("Re-run without --dry-run to write files.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
