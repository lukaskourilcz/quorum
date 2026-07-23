import type { MetadataRoute } from "next";
import { agents } from "@/data/agents";
import { standups } from "@/data/fixtures";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
  const updated = new Date("2026-07-23T05:30:00.000Z");
  const core = [
    "",
    "/standups",
    "/boardroom",
    "/governance",
    "/agents",
    "/ventures",
    "/metrics",
    "/log",
    "/company",
    "/about",
    "/privacy",
    "/disclosure"
  ];
  return [
    ...core.map((route) => ({
      url: `${base}${route}`,
      lastModified: updated,
      changeFrequency: route === "" ? ("daily" as const) : ("weekly" as const),
      priority: route === "" ? 1 : 0.7
    })),
    ...agents.map((agent) => ({
      url: `${base}/agents/${agent.slug}`,
      lastModified: updated,
      changeFrequency: "monthly" as const,
      priority: 0.6
    })),
    ...standups.map((standup) => ({
      url: `${base}/standups/${standup.date}`,
      lastModified: new Date(`${standup.date}T05:30:00.000Z`),
      changeFrequency: "never" as const,
      priority: 0.7
    }))
  ];
}
