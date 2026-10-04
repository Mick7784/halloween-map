import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Halloween Map",
    short_name: "Halloween",
    description: "Les maisons accueillantes de votre commune.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#17171e",
    background_color: "#17171e",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/pwa/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
