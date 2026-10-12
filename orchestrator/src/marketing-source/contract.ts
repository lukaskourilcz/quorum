import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { canonicalJson, sha256 as hashBytes } from "../hashing.js";
export { canonicalJson } from "../hashing.js";

const timestamp = z.iso.datetime({ offset: true });
const https = z.url({ protocol: /^https$/ }).max(2048);
const id = z.string().min(1).max(200);
export const SourcePacketSchema = z.strictObject({
  schemaVersion: z.literal("marketing-source/1"), brand: z.literal("dneskai"), kind: z.literal("article"),
  sourceId: id, sourceRevision: id, contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalUrl: https, locale: z.literal("cs"), observedAt: timestamp, expiresAt: timestamp.nullable(),
  eligible: z.boolean(), eligibilityReason: z.string().max(300),
  content: z.strictObject({
    title: z.string().min(1).max(300), body: z.string().min(1).max(30000), category: z.string().max(100),
    difficulty: z.string().max(50).nullable(), code: z.string().max(12000).nullable(),
    options: z.array(z.string().max(2000)).max(10), answer: z.string().max(6000).nullable(),
    explanation: z.string().max(12000).nullable(),
    evidence: z.array(z.strictObject({ url: https, title: z.string().min(1).max(300), excerpt: z.string().max(2000),
      checkedAt: timestamp, timecodeSeconds: z.number().nonnegative().optional() })).min(1).max(30),
    image: z.strictObject({ url: https, alt: z.string().max(1000), licence: z.string().min(1).max(500) }).nullable()
  })
});
export type SourcePacket = z.infer<typeof SourcePacketSchema>;
export const SourceQuerySchema = z.strictObject({ action: z.literal("sources"),
  sourceIds: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)).min(1).max(20).optional() });
export type SourceQuery = z.infer<typeof SourceQuerySchema>;

export function sha256(value: unknown): string {
  return hashBytes(canonicalJson(value));
}
export function parseSourcePacket(value: unknown): SourcePacket {
  const packet = SourcePacketSchema.parse(value);
  if (packet.contentHash !== sha256(packet.content)) throw new Error("Source content hash mismatch");
  return packet;
}
export function signature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
export function verifySourceRequest(headers: Headers, body: string, secret: string | undefined, now: Date): boolean {
  if (!secret || secret.length < 32) return false;
  const auth = headers.get("authorization") ?? "";
  const expectedAuth = `Bearer ${secret}`;
  if (Buffer.byteLength(auth) !== Buffer.byteLength(expectedAuth) || !timingSafeEqual(Buffer.from(auth), Buffer.from(expectedAuth))) return false;
  const timestamp = headers.get("x-marketing-timestamp") ?? "";
  const digest = headers.get("x-marketing-signature") ?? "";
  if (!/^\d{10}$/u.test(timestamp) || !/^[a-f0-9]{64}$/u.test(digest) || Math.abs(now.getTime() / 1000 - Number(timestamp)) > 300) return false;
  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature(secret, timestamp, body)));
}
