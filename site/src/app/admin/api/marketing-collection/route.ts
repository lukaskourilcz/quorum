import { readAdminMarketingCollection } from "@/lib/admin-marketing-collection";
import { DneskaiFeedRequestSchema, InvalidCollectionQuery, verifySourceRequest } from "@boardlessai/orchestrator/marketing-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" };

/** Research-only collection, with an independent enable flag and no approval or delivery operation. */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "Collection query too large" }, { status: 413, headers });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (reader) while (true) {
      signal.throwIfAborted();
      const chunk = await readChunk(reader, signal);
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 8192) return Response.json({ error: "Collection query too large" }, { status: 413, headers });
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const now = new Date();
    if (!verifySourceRequest(request.headers, body, process.env.DNESKAI_MARKETING_SOURCE_SECRET, now)) {
      return Response.json({ error: "Invalid collection integration signature" }, { status: 401, headers });
    }
    if (process.env.DNESKAI_COLLECTION_ENABLED !== "true") return Response.json({ error: "Collection integration held" }, { status: 503, headers });
    let value: unknown;
    try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid bounded collection query" }, { status: 400, headers }); }
    const query = DneskaiFeedRequestSchema.safeParse(value);
    if (!query.success) return Response.json({ error: "Invalid bounded collection query" }, { status: 400, headers });
    return Response.json(await readAdminMarketingCollection(query.data, now, signal), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof InvalidCollectionQuery ? "Unknown, duplicate or future collection query" : "Authoritative collection unavailable" }, { status: error instanceof InvalidCollectionQuery ? 400 : 503, headers });
  } finally {
    void reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Collection request aborted"));
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
