import { getPublicStandups } from "@/lib/standup-records";
import { getPublicSiteUrl } from "@/lib/public-site-url";

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const base = getPublicSiteUrl();
  const standups = await getPublicStandups();
  const items = standups
    .filter((standup) => !standup.fixture)
    .map(
      (standup) => `<item>
        <title>${escapeXml(`${standup.date} · ${standup.status}`)}</title>
        <link>${base}/standups/${standup.id}</link>
        <guid isPermaLink="true">${base}/standups/${standup.id}</guid>
        <pubDate>${new Date(standup.generatedAt ?? `${standup.date}T05:30:00.000Z`).toUTCString()}</pubDate>
        <description>${escapeXml(`${standup.operatingBrief} Decision: ${standup.decision.summary}`)}</description>
        <category>${escapeXml(standup.stage)}</category>
      </item>`
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>BoardlessAI public operating record</title>
        <link>${base}</link>
        <description>Public shift episodes, decisions, costs and outcomes from BoardlessAI.</description>
        <language>en</language>
        <lastBuildDate>${new Date(standups[0]?.generatedAt ?? "2026-07-23T05:30:00.000Z").toUTCString()}</lastBuildDate>
        ${items}
      </channel>
    </rss>`;
  return new Response(xml, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Type": "application/rss+xml; charset=utf-8"
    }
  });
}
