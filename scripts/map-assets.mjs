import { mkdir, copyFile } from "node:fs/promises";
await mkdir("public/maplibre", { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
  await copyFile(
    "node_modules/maplibre-gl/dist/" + file,
    "public/maplibre/" + file,
  );
