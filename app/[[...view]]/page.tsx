import { readFile } from "node:fs/promises";
import Application from "../../components/Application";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const view = (await params).view?.[0] ?? "map";
  const version = (await readFile(process.cwd() + "/VERSION", "utf8")).trim();
  return (
    <Application
      view={view}
      version={version}
      mapStyle={
        process.env.MAP_STYLE_URL ??
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      }
    />
  );
}
