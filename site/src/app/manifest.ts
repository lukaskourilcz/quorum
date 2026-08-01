import type { MetadataRoute } from "next";
import { serverTokens } from "@/brand/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoardlessAI",
    short_name: "BoardlessAI",
  description:
      "Follow the daily meetings, decisions and results of a company run by AI roles.",
    start_url: "/",
    display: "standalone",
    background_color: serverTokens.paper,
    theme_color: serverTokens.obsidian,
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png"
      }
    ]
  };
}
