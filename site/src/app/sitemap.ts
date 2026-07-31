import type { MetadataRoute } from "next";
import { agents } from "@/data/agents";
import { getPublicStandups } from "@/lib/standup-records";
import { getPublicSiteUrl } from "@/lib/public-site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const standups = await getPublicStandups();
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
    ...standups.filter((standup) => !standup.fixture).map((standup) => ({
      url: `${base}/standups/${standup.id}`,
      lastModified: new Date(standup.generatedAt ?? `${standup.date}T05:30:00.000Z`),
      changeFrequency: "never" as const,
      priority: 0.7
    }))
  ];
}
