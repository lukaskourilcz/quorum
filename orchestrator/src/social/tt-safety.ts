import type { QueueItem } from "./queue.js";

export const TT_SAFETY_CHECKER_VERSION = "keeper-tt-1";

const BLOCKED_TERMS = [
  "nude", "nudes", "nudity", "porn", "pornographic", "sexually explicit",
  "onlyfans", "nsfw", "topless", "bare breasts", "explicit content",
  "nahá", "nahé", "nahota", "porno", "pornograf", "sexuálně explicitní"
] as const;

export interface TtSafetyResult {
  passed: boolean;
  version: typeof TT_SAFETY_CHECKER_VERSION;
  reasons: string[];
}

export function checkTittyTuesdaysPost(item: QueueItem): TtSafetyResult {
  const reasons: string[] = [];
  if (item.venture !== "titty-tuesdays") return { passed: true, version: TT_SAFETY_CHECKER_VERSION, reasons };
  const normalized = `${item.content.text} ${item.content.altText ?? ""}`.normalize("NFKC").toLowerCase();
  for (const term of BLOCKED_TERMS) if (normalized.includes(term)) reasons.push(`Blocked term: ${term}`);
  if (item.content.assetPaths.some((asset) => !asset.includes("/titty-tuesdays/") || !asset.endsWith(".png"))) {
    reasons.push("TT assets must be deterministic PNG brand graphics in the TT namespace.");
  }
  if (item.content.altText && /photo|photograph|person|woman|man|model|body|skin|fotografie|osoba|žena|muž/iu.test(item.content.altText)) {
    reasons.push("TT Phase 2 visuals cannot depict or describe people or photography.");
  }
  return { passed: reasons.length === 0, version: TT_SAFETY_CHECKER_VERSION, reasons };
}
