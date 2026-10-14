import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Two approved illustrations, deliberately separate so the favicon remains
// legible at 16/32px. Fail the build if either required source is missing:
// never silently ship an old icon under the new release number.
const appIcon = await readFile("public/pwa/app-icon-source.webp");
const favicon = await readFile("public/favicon-mini-source.webp");
const background = "#080b18";
await mkdir("public/pwa", { recursive: true });

// PNG favicon variants are also packed into a standards-compliant ICO
// (without a new runtime dependency) for older desktop/browser shortcuts.
const favicons = [];
for (const size of [16, 32]) {
  const png = await sharp(favicon).resize(size, size).png().toBuffer();
  await writeFile(`public/favicon-${size}.png`, png);
  favicons.push({ size, png });
}
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // ICO format
header.writeUInt16LE(favicons.length, 4);
let offset = 6 + favicons.length * 16;
const directory = favicons.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4); // one image plane
  entry.writeUInt16LE(32, 6); // 32-bit color
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});
await writeFile("public/favicon.ico", Buffer.concat([
  header, ...directory, ...favicons.map(({ png }) => png),
]));

for (const size of [192, 512])
  await sharp(appIcon).resize(size, size).png().toFile(`public/pwa/icon-${size}.png`);

await sharp(appIcon)
  .resize(180, 180)
  .flatten({ background })
  .png()
  .toFile("public/pwa/apple-touch-icon.png");

// Only the foreground inside the central 80% circular safe zone must survive
// Android's masks: 56% square art fits fully in that circle.
for (const size of [192, 512]) {
  const innerSize = Math.round(size * .56);
  const foreground = await sharp(appIcon).resize(innerSize, innerSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: foreground, gravity: "centre" }])
    .flatten({ background })
    .png()
    .toFile(`public/pwa/maskable-${size}.png`);
}
const version = (await readFile("VERSION", "utf8")).trim();
const sw = (await readFile("scripts/sw-template.js", "utf8")).replace(
  "__VERSION__",
  version,
);
await writeFile("public/sw.js", sw);
