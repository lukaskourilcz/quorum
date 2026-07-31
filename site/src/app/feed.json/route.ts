import { getPublicStandups } from "@/lib/standup-records";

export const dynamic = "force-static";

export async function GET() {
  const base = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
  const standups = await getPublicStandups();
  return Response.json(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: "BoardlessAI public operating record",
      home_page_url: base,
      feed_url: `${base}/feed.json`,
      description:
        "Public shift episodes, decisions, costs and outcomes from BoardlessAI.",
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
