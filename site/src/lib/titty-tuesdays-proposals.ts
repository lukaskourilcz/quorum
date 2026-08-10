import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseRatingLedger, type RatingRecord } from "./rating-model";

/**
 * The garment renders waiting for the owner's eye.
 *
 * Parse-or-drop, and counted — a malformed day costs that day. The reason this panel exists at all
 * is that the deterministic checks cannot judge the three things that matter: whether a person
 * appears in the frame, whether the wordmark rendered as those two words, and whether it is
 * on-brand. The panel therefore carries the checklist rather than implying the machine has already
 * looked.
 */
export interface ProposalVariant {
  variantId: string;
  provider: "openai" | "fal";
  model: string;
  prompt: string;
  altText: string;
  /** The authed media route path, or null once a doctrine rejection removed the bytes. */
  imageHref: string | null;
  contentHash: string;
  usd: number;
  status: "proposed" | "doctrine-rejected";
  rejectedAt: string | null;
  reason: string | null;
  ratings: RatingRecord[];
}

export interface ProposalDay {
  date: string;
  conceptTitle: string;
  colorway: string;
  axis: string;
  variants: ProposalVariant[];
  failures: Array<{ provider: string; reason: string }>;
}

export interface ProposalSnapshot {
  days: ProposalDay[];
  unreadable: string[];
}

/** Resolved per call, not at import: a test that points the root somewhere else has to be able to. */
function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

export async function readTittyTuesdaysProposals(root = repositoryRoot()): Promise<ProposalSnapshot> {
  const directory = path.join(root, "state", "ventures", "titty-tuesdays", "design-proposals");
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
  } catch {
    return { days: [], unreadable: [] };
  }

  let ratings: RatingRecord[] = [];
  try {
    ratings = parseRatingLedger(
      await readFile(path.join(root, "state", "ratings", "titty-tuesdays", "ledger.jsonl"), "utf8")
    ) ?? [];
  } catch {
    ratings = [];
  }

  const days: ProposalDay[] = [];
  const unreadable: string[] = [];

  for (const name of names) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    } catch {
      unreadable.push(name);
      continue;
    }
    const file = record(parsed);
    const concept = record(file?.concept);
    const date = text(file?.date, 10);
    const conceptTitle = text(concept?.title, 160);
    if (file?.schemaVersion !== "design-proposal/1" || !date || !conceptTitle) {
      unreadable.push(name);
      continue;
    }

    const variants: ProposalVariant[] = [];
    for (const value of Array.isArray(file.variants) ? file.variants : []) {
      const variant = record(value);
      const variantId = text(variant?.variantId, 80);
      const provider = variant?.provider === "openai" || variant?.provider === "fal" ? variant.provider : null;
      const contentHash = text(variant?.contentHash, 80);
      const prompt = text(variant?.prompt, 4_000);
      if (!variantId || !provider || !contentHash || !prompt) continue;

      const imagePath = text(variant?.imagePath, 300);
      // Only a path the media route will actually serve. Anything else is a broken image, and a
      // broken image on a review surface is a review nobody can perform.
      const servable = imagePath
        && /^ventures\/titty-tuesdays\/design-proposals\/media\/[A-Za-z0-9/_-]+\.webp$/u.test(imagePath);

      variants.push({
        variantId,
        provider,
        model: text(variant?.model, 120) ?? provider,
        prompt,
        altText: text(variant?.altText, 400) ?? "",
        imageHref: servable
          ? `/admin/api/titty-tuesdays/media?path=${encodeURIComponent(imagePath)}`
          : null,
        contentHash,
        usd: typeof variant?.usd === "number" && Number.isFinite(variant.usd) ? variant.usd : 0,
        status: variant?.status === "doctrine-rejected" ? "doctrine-rejected" : "proposed",
        rejectedAt: text(variant?.rejectedAt, 40),
        reason: text(variant?.reason, 400),
        // The rating ledger keys on `<date>/<variantId>`, which is what the widget writes.
        ratings: ratings
          .filter((rating) => rating.objectRef.id === `${date}/${variantId}`)
          .sort((left, right) => right.ratedAt.localeCompare(left.ratedAt))
      });
    }

    days.push({
      date,
      conceptTitle,
      colorway: text(concept?.colorway, 160) ?? "",
      axis: text(concept?.axis, 40) ?? "",
      variants,
      failures: (Array.isArray(file.failures) ? file.failures : [])
        .map((value) => {
          const failure = record(value);
          const provider = text(failure?.provider, 40);
          const reason = text(failure?.reason, 400);
          return provider && reason ? { provider, reason } : null;
        })
        .filter((entry): entry is { provider: string; reason: string } => entry !== null)
    });
  }

  return { days, unreadable };
}
