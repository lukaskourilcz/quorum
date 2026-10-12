import { readAdminMarketingSources, SourceQuerySchema } from "@/lib/admin-marketing-source";
import { verifySourceRequest } from "@boardlessai/orchestrator/marketing-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" };

/** This one admin route has a brand-bound HMAC credential instead of an interactive owner session. */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "Source query too large" }, { status: 413, headers });
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 8192) return Response.json({ error: "Source query too large" }, { status: 413, headers });
  const now = new Date();
  if (!verifySourceRequest(request.headers, body, process.env.DNESKAI_MARKETING_SOURCE_SECRET, now)) {
    return Response.json({ error: "Invalid source integration signature" }, { status: 401, headers });
  }
  if (process.env.DNESKAI_MARKETING_SOURCE_ENABLED !== "true") return Response.json({ error: "Source integration held" }, { status: 503, headers });
  try {
    const query = SourceQuerySchema.safeParse(JSON.parse(body));
    if (!query.success) return Response.json({ error: "Invalid bounded source query" }, { status: 400, headers });
    return Response.json(await readAdminMarketingSources(query.data, now), { headers });
  } catch {
    return Response.json({ error: "Authoritative source state unavailable" }, { status: 503, headers });
  }
}
