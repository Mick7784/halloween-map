/**
 * V0.9.1 — build true parallax assets from ONE approved, clean master image.
 *
 * Usage:
 *   node scripts/v091-build-layers.mjs
 *
 * Required input files (not committed until the scene is approved):
 *   artwork/v091/scene-master.png     — scene only, no title/buttons/countdown
 *   artwork/v091/plane-far.png        — full-size PNG with transparent alpha
 *   artwork/v091/plane-mid.png        — full-size PNG with transparent alpha
 *   artwork/v091/plane-near.png       — full-size PNG with transparent alpha
 *
 * The layers MUST be exports from the same master/canvas, with no arbitrary
 * per-layer rescaling or re-composition. Alpha must be genuine transparency.
 *
 * This script is deliberately opt-in: V0.9 production builds must not fail
 * while the clean master is being commissioned/restored and validated.
 */
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";

const source = "artwork/v091";
const output = "public/art";
const masterPath = join(source, "scene-master.png");
const layers = ["far", "mid", "near"];
const minimum = { width: 900, height: 650 };

const openMeta = async (path) => {
  await access(path);
  const meta = await sharp(path).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`V0.9.1 : dimensions illisibles : ${path}`);
  }
  return meta;
};

const master = await openMeta(masterPath);
if (master.width < minimum.width || master.height < minimum.height) {
  throw new Error(
    `V0.9.1 : scène trop petite (${master.width}×${master.height}) ; ` +
    `minimum ${minimum.width}×${minimum.height} avant validation visuelle.`
  );
}

// Structural alpha checks are not enough: detect a layer generated from a
// different illustration. Opaque pixels must match the same master canvas.
const masterPixels = await sharp(masterPath)
  .removeAlpha()
  .raw()
  .toBuffer();

const inputs = await Promise.all(layers.map(async (name) => {
  const path = join(source, `plane-${name}.png`);
  const meta = await openMeta(path);
  if (meta.width !== master.width || meta.height !== master.height) {
    throw new Error(
      `V0.9.1 : ${path} (${meta.width}×${meta.height}) doit correspondre ` +
      `au master (${master.width}×${master.height}).`
    );
  }
  if (!meta.hasAlpha) {
    throw new Error(
      `V0.9.1 : le plan ${name} doit disposer d’une transparence alpha réelle.`
    );
  }
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const nonzero = data.reduce((sum, a) => sum + (a > 0 ? 1 : 0), 0);
  const proportion = nonzero / (info.width * info.height);
  const planeRGB = await sharp(path).removeAlpha().raw().toBuffer();
  let samples = 0;
  let mismatches = 0;
  // An inexpensive 1-in-31 pixel check, only where alpha is nearly opaque.
  for (let i = 0; i < info.width * info.height; i += 31) {
    if (data[i] < 240) continue;
    samples++;
    const pos = i * 3;
    const diff = Math.max(
      Math.abs(planeRGB[pos] - masterPixels[pos]),
      Math.abs(planeRGB[pos + 1] - masterPixels[pos + 1]),
      Math.abs(planeRGB[pos + 2] - masterPixels[pos + 2]),
    );
    if (diff > 22) mismatches++;
  }
  if (samples < 150 || mismatches / samples > .03) {
    throw new Error(
      `V0.9.1 : le plan ${name} ne correspond pas au master ` +
      `(${samples} pixels contrôlés, ${mismatches} écarts). ` +
      "Ne pas régénérer les couches séparément."
    );
  }
  // Refuse an entirely opaque screenshot reused as a moving plane.
  if (proportion < .015 || proportion > .90) {
    throw new Error(
      `V0.9.1 : couverture alpha du plan ${name} suspecte : ` +
      `${Math.round(proportion * 100)} %. Masques découpés requis.`
    );
  }
  return { name, path, proportion };
}));

await mkdir(output, { recursive: true });

const masterTarget = join(output, "home-v091-master.webp");
await sharp(masterPath)
  .flatten({ background: "#0a0d1b" })
  .webp({ quality: 85, effort: 6 })
  .toFile(masterTarget);

for (const { name, path } of inputs) {
  const target = join(output, `home-v091-${name}.webp`);
  // The supplied alpha PNG already represents exactly one plane extracted
  // from the master. Keep all planes on their native full-size canvas.
  await sharp(path)
    .webp({ quality: 86, effort: 6, alphaQuality: 95 })
    .toFile(target);
}

const paths = [masterTarget, ...inputs.map(i => join(output, `home-v091-${i.name}.webp`))];
const bytes = (await Promise.all(paths.map(p => stat(p)))).reduce((s, st) => s + st.size, 0);
const masterHash = createHash("sha256").update(await readFile(masterPath)).digest("hex");
if (bytes > 3_600_000) {
  throw new Error(
    `V0.9.1 : assets trop lourds (${(bytes / 1_000_000).toFixed(2)} Mo), ` +
    "optimiser les PNG source / masques avant l’intégration."
  );
}

console.log(JSON.stringify({
  source: masterPath,
  sha256: masterHash,
  pixels: `${master.width}x${master.height}`,
  totalBytes: bytes,
  files: paths,
  alphaCoverage: Object.fromEntries(inputs.map(i => [i.name, i.proportion])),
}, null, 2));
