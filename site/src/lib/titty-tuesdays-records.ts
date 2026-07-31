import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface PublicSeasonProduct {
  slug: string;
  name: string;
  concept: string;
  designDirection: string;
  status: "concept";
}

export interface TittyTuesdaysSnapshot {
  season: {
    number: number;
    theme: string;
    startsOn: string;
    endsOn: string;
    campaignArc: string;
    products: PublicSeasonProduct[];
  };
  apiSpendUsd: number;
  foundingStatus: string;
  budgetStatus: string;
  bootstrapMeetingId: string | null;
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error("Invalid Titty Tuesdays public text");
  }
  return value.trim();
}

function decisionStatus(raw: string): string {
  const status = /^Status:\s*(.+)$/m.exec(raw)?.[1]?.trim();
  if (!status || status.length > 80) throw new Error("Decision status is missing");
  return status;
}

function parseSeason(raw: string): TittyTuesdaysSnapshot["season"] {
  const block = /```json\n([\s\S]*?)\n```/.exec(raw.replaceAll("\r\n", "\n"))?.[1];
  if (!block) throw new Error("Season JSON block is missing");
  const value = JSON.parse(block) as Record<string, unknown>;
  if (value.schemaVersion !== "season/1" || value.ventureId !== "titty-tuesdays" || value.seasonNumber !== 1 || !Array.isArray(value.products) || value.products.length !== 4) {
    throw new Error("Season contract is invalid");
  }
  const products = value.products.map((entry) => {
    const product = entry as Record<string, unknown>;
    const slug = requiredText(product.slug, 100);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || product.status !== "concept") {
      throw new Error("Season product is not a concept");
    }
    return {
      slug,
      name: requiredText(product.name, 100),
      concept: requiredText(product.concept, 500),
      designDirection: requiredText(product.designDirection, 500),
      status: "concept" as const
    };
  });
  return {
    number: 1,
    theme: requiredText(value.theme, 160),
    startsOn: requiredText(value.startsOn, 10),
    endsOn: requiredText(value.endsOn, 10),
    campaignArc: requiredText(value.campaignArc, 1_200),
    products
  };
}

function bootstrapMeetingId(raw: string): string {
  const meeting = JSON.parse(raw) as Record<string, unknown>;
  if (
    meeting.schemaVersion !== "meeting-record/2" ||
    meeting.kind !== "tt-marketing" ||
    meeting.date !== "2026-08-01"
  ) {
    throw new Error("Titty Tuesdays bootstrap meeting is invalid");
  }
  return "2026-08-01-tt-marketing";
}

export async function getTittyTuesdaysSnapshot(): Promise<TittyTuesdaysSnapshot> {
  const root = repositoryRoot();
  const [seasonRaw, foundingRaw, budgetRaw, ledgerRaw, meetingRaw] = await Promise.all([
    readFile(path.join(root, "state", "ventures", "titty-tuesdays", "season-001.md"), "utf8"),
    readFile(path.join(root, "state", "decisions", "2026-08-01-titty-tuesdays-founding.md"), "utf8"),
    readFile(path.join(root, "state", "decisions", "2026-08-01-budget-raise.md"), "utf8"),
    readFile(path.join(root, "state", "budget", "ledger.json"), "utf8").catch(() => '{"entries":[]}'),
    readFile(path.join(root, "state", "meetings", "2026-08-01-tt-marketing.json"), "utf8")
  ]);
  const ledger = JSON.parse(ledgerRaw) as { entries?: Array<{ ventureId?: string; usd?: number }> };
  const apiSpendUsd = (ledger.entries ?? [])
    .filter((entry) => entry.ventureId === "titty-tuesdays" && typeof entry.usd === "number" && Number.isFinite(entry.usd))
    .reduce((sum, entry) => sum + (entry.usd ?? 0), 0);
  return {
    season: parseSeason(seasonRaw),
    apiSpendUsd: Number(apiSpendUsd.toFixed(8)),
    foundingStatus: decisionStatus(foundingRaw),
    budgetStatus: decisionStatus(budgetRaw),
    bootstrapMeetingId: bootstrapMeetingId(meetingRaw)
  };
}
