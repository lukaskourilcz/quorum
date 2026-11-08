import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { INGEST_FIELDS, ingestRequest, sha256Hex, uploadFrame, type IngestMetadata } from "../src/ingest.js";

const meta: IngestMetadata = {
  persona_key: "nina",
  aspect: "9:16",
  pillar: "drinks",
  shot_id: "nina-cafe-latte",
  prompt: "A latte. No people, no faces, no text, no logos.",
  provider: "fal",
  model: "fal-ai/flux/dev",
  cost_usd: 0.077,
  seed: 1234,
  phash: "0123456789abcdef",
  source_ref: null
};
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe("the ingest request", () => {
  it("carries the bearer token, the file as image/jpeg, the sha256 of its bytes and only the documented fields", async () => {
    const { url, init } = ingestRequest({ url: "https://heydarlink.com/api/photo-library/ambient", token: "t0ken", jpeg, meta });
    expect(url).toBe("https://heydarlink.com/api/photo-library/ambient");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    const form = init.body as FormData;
    for (const name of form.keys()) expect(INGEST_FIELDS as readonly string[]).toContain(name);
    expect(form.get("sha256")).toBe(sha256Hex(jpeg));
    expect(form.get("cost_usd")).toBe("0.077000");
    expect(form.get("seed")).toBe("1234");
    expect(form.has("source_ref")).toBe(false);
    const file = form.get("file") as File;
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("nina-cafe-latte-9x16.jpg");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(jpeg);
    // The token is a header, never a form field.
    expect([...form.values()].some((value) => value === "t0ken")).toBe(false);
  });

  it("omits an absent seed and keeps a stock reference", () => {
    const { init } = ingestRequest({ url: "https://x.test/a", token: "t", jpeg, meta: { ...meta, seed: null, source_ref: "pexels:42" } });
    const form = init.body as FormData;
    expect(form.has("seed")).toBe(false);
    expect(form.get("source_ref")).toBe("pexels:42");
  });
});

describe("uploadFrame against a local server", () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  const serve = async (answers: Array<[number, unknown]>) => {
    const seen: Array<{ auth: string | undefined; type: string | undefined; body: Buffer }> = [];
    const server = createServer(async (request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      seen.push({ auth: request.headers.authorization, type: request.headers["content-type"], body: Buffer.concat(chunks) });
      const [status, body] = answers.shift() ?? [500, {}];
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    close = () => new Promise((resolve) => server.close(() => resolve()));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/photo-library/ambient`, seen };
  };
  const upload = (url: string) => uploadFrame({ url, token: "tok", jpeg, meta, allowInsecureLoopback: true, sleep: async () => {} });

  it("stores on 200 and sends a multipart body with the bearer header", async () => {
    const { url, seen } = await serve([[200, { id: "a1b2", status: "ready" }]]);
    expect(await upload(url)).toEqual({ kind: "stored", id: "a1b2" });
    expect(seen[0]!.auth).toBe("Bearer tok");
    expect(seen[0]!.type).toMatch(/^multipart\/form-data; boundary=/u);
    expect(seen[0]!.body.toString("latin1")).toContain('name="phash"');
  });

  it("treats 409 as a duplicate without retrying", async () => {
    const { url, seen } = await serve([[409, { code: "AMBIENT_DUPLICATE", id: "old" }]]);
    expect(await upload(url)).toEqual({ kind: "duplicate", id: "old", code: "AMBIENT_DUPLICATE" });
    expect(seen).toHaveLength(1);
  });

  it("retries 503 and 429, then succeeds", async () => {
    const { url, seen } = await serve([
      [503, { code: "AMBIENT_STORAGE" }],
      [429, { code: "RATE_LIMITED" }],
      [200, { id: "z9" }]
    ]);
    expect(await upload(url)).toEqual({ kind: "stored", id: "z9" });
    expect(seen).toHaveLength(3);
  });

  it("does not retry a 401 and reports the server's code", async () => {
    const { url, seen } = await serve([[401, { error: "Unauthorized" }]]);
    expect(await upload(url)).toEqual({ kind: "failed", status: 401, code: "HTTP_401" });
    expect(seen).toHaveLength(1);
  });

  it("refuses plain http to anything but the loopback test server", async () => {
    const result = await uploadFrame({ url: "http://heydarlink.com/api/photo-library/ambient", token: "t", jpeg, meta, sleep: async () => {} });
    expect(result).toEqual({ kind: "failed", status: 0, code: "INVALID_URL" });
  });
});
