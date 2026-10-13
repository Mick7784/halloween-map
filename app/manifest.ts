import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Halloween Map",
    short_name: "HalloweenMap",
    description: "Cartographie des maisons participantes et outil individuel pour la collecte de bonbons.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#080b18",
    background_color: "#080b18",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/pwa/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
