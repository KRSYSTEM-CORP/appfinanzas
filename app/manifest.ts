import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KR POS - By KR System",
    short_name: "KR POS",
    description: "Ventas y control de inventario",
    id: "/",
    start_url: "/",
    scope: "/",
    lang: "es",
    display: "standalone",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    shortcuts: [{ name: "Abrir el POS", short_name: "POS", url: "/pos" }],
    background_color: "#f7f7fb",
    theme_color: "#f7f7fb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
