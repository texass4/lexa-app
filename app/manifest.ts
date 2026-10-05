import type { MetadataRoute } from "next"
import { BRAND, BRAND_COLORS } from "@/lib/core/brand"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F7F9",
    theme_color: BRAND_COLORS.navy,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
