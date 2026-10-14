import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";

// Sources intentionally independent in V0.9.5:
// - App icon: full Halloween Map artwork supplied by the owner
// - Mini favicon: approved simplified pumpkin / map pin artwork
// Until the two source files are committed, legacy assets remain the fallback.
const legacy = await readFile("public/favicon.svg");
const appIcon = existsSync("public/pwa/app-icon-source.png")
  ? await readFile("public/pwa/app-icon-source.png")
  : legacy;
const favicon = existsSync("public/favicon-mini-source.png")
  ? await readFile("public/favicon-mini-source.png")
  : legacy;
const background = "#080b18";
await mkdir("public/pwa", { recursive: true });

for (const size of [16, 32])
  await sharp(favicon).resize(size, size).png().toFile(`public/favicon-${size}.png`);

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
