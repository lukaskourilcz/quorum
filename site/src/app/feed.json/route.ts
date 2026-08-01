import { getPublicStandups } from "@/lib/standup-records";
import { getPublicSiteUrl } from "@/lib/public-site-url";

export const dynamic = "force-static";

export async function GET() {
  const base = getPublicSiteUrl();
  const standups = await getPublicStandups();
  return Response.json(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: "BoardlessAI public work history",
      home_page_url: base,
      feed_url: `${base}/feed.json`,
      description:
        "Daily meetings, decisions, costs and results from BoardlessAI.",
      items: standups.filter((standup) => !standup.fixture).map((standup) => ({
        id: `${base}/standups/${standup.id}`,
        url: `${base}/standups/${standup.id}`,
        title: `${standup.date} · ${standup.status}`,
        content_text: `${standup.operatingBrief}\n\nDecision: ${standup.decision.summary}`,
        date_published: standup.generatedAt ?? `${standup.date}T05:30:00.000Z`,
        tags: [standup.stage, "live"]
      }))
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "Content-Type": "application/feed+json; charset=utf-8"
      }
    }
  );
}
