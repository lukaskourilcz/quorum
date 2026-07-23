import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoardlessAI",
    short_name: "BoardlessAI",
    description:
      "Daily standups, public decisions and measurable outcomes from an agent-operated company.",
    start_url: "/",
    display: "standalone",
    background_color: "rgb(244, 244, 245)",
    theme_color: "rgb(9, 9, 11)",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png"
      }
    ]
  };
}
