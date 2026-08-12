import { createHash } from "node:crypto";

/**
 * JSON with every object's keys sorted by code point, at every depth.
 *
 * A content hash must be a property of the values, not of the order a writer happened to
 * serialise them in, so two hashes of the same content always agree. Sorting by code point
 * rather than `localeCompare` keeps that true on every machine: locale collation is
 * environment-dependent, and a hash that moves with the locale is not a hash.
 *
 * `mma-files/hash.ts` and `ventures/marketingshark/bank.ts` each still carry their own copy of
 * this idea. Neither can simply call this one — mma-files sorts with `localeCompare`, so
 * adopting code-point order would change every committed article package hash — and both are
 * candidates for a consolidation that has to rehash what it touches. New callers use this.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
