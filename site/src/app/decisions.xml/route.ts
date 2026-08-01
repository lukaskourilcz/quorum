import { getPublicDecisions } from "@/lib/decision-feed";
import { getPublicSiteUrl } from "@/lib/public-site-url";
import { escapeXml, rssResponse } from "@/lib/rss";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-static";

export async function GET() {
  const base = getPublicSiteUrl();
  const decisions = await getPublicDecisions();
  const items = decisions.map((decision) => `<item>
    <title>${escapeXml(`${decision.kind} · ${decision.outcome}`)}</title>
    <link>${base}${decision.href}</link>
    <guid isPermaLink="false">${escapeXml(decision.id)}</guid>
    <pubDate>${new Date(decision.at).toUTCString()}</pubDate>
    <description>${escapeXml(`${decision.summary} · Cost: ${decision.costUsd === null ? "not recorded" : formatUsd(decision.costUsd)}`)}</description>
    <category>${escapeXml(decision.kind)}</category>
  </item>`).join("");
  return rssResponse(`<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel>
      <title>BoardlessAI meeting decisions</title>
      <link>${base}</link>
      <description>One public RSS item for every recorded BoardlessAI meeting decision.</description>
      <language>en</language>
      <lastBuildDate>${new Date(decisions[0]?.at ?? "2026-07-23T05:30:00.000Z").toUTCString()}</lastBuildDate>
      ${items}
    </channel></rss>`);
}
