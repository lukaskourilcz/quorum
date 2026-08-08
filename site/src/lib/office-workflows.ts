import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import editionQuality from "../../../config/edition-quality.json";
import {
  CURRENT_EDITION_PRODUCTION_CAP_USD,
  CURRENT_MONTHLY_API_LIMIT_USD,
  CURRENT_MONTHLY_OPERATING_LIMIT_USD
} from "@/data/operating-policy";
import type { PublicStandup } from "@/data/fixtures";
import {
  buildPublicCalendarFeed,
  mondayOfCalendarWeek,
  pragueCalendarDate,
  type CalendarDefinition,
  type CalendarStatus,
  type PublicArticleSlotOutcome,
  type PublicMeetingSkip
} from "@/lib/calendar-feed-model";
import { readStudioArticles } from "@/lib/carousel-summaries";
import type { PublicMeetingRecord } from "@/lib/meeting-record-model";
import { PROJECT_COLOR, projectForKind, type OfficeProjectKey } from "@/lib/office-walkthrough";
import {
  doorNoteKind,
  type OfficeWorkflows,
  type WorkflowsBank,
  type WorkflowsExample,
  type WorkflowsReceipt,
  type WorkflowsRoom,
  type WorkflowsSlot
} from "@/lib/office-workflows-model";
import { publicKindLabel, readableSlotReason } from "@/lib/slot-labels";

/**
 * The floor plan's data, resolved on the server.
 *
 * The plan draws one office floor from above: eight rooms, one spine, a loading dock and the
 * edges that leave the building. Everything on it is a fact this file resolved from committed
 * state, and the boundary below is the sanitising boundary — the same one `office-walkthrough.ts`
 * holds. Nothing that crosses carries a filesystem path, a repository name, or a package hash
 * outside the one disclosure form the delivery commit subject already uses.
 *
 * The types and the pure reading logic live in `office-workflows-model.ts`, because the section
 * that draws the plan is a client component and may not import this file at all.
 *
 * Two sanctioned exceptions, both deliberate: the courier receipt shows `[package:<hash12>]`,
 * which is exactly what the delivery commit subject prints, and the worked example carries its
 * public `articleUrl`. A figure that cannot be resolved is `null` and the section prints an
 * explicit unavailable state — never a zero, and never an invented value.
 */

export type {
  OfficeWorkflows,
  WorkflowsBank,
  WorkflowsExample,
  WorkflowsGates,
  WorkflowsHookRack,
  WorkflowsNoteKind,
  WorkflowsReceipt,
  WorkflowsRoom,
  WorkflowsSlot
} from "@/lib/office-workflows-model";

/** What the walkthrough already read, handed over rather than read a second time. */
export interface WorkflowsCalendarInput {
  standups: readonly PublicStandup[];
  meetings: readonly PublicMeetingRecord[];
  skips: readonly PublicMeetingSkip[];
  articleSlots: readonly PublicArticleSlotOutcome[];
  definitions: readonly CalendarDefinition[];
}

/**
 * The eight rooms, in the order the plan draws them.
 *
 * The workshop is on this list and holds no slots: `config/ventures.json` gives Carousel Studio
 * `"meetings": []`, so it never deliberates and has nothing to record. It is drawn as machinery
 * with a light that never goes out, which is what tells a reader it is a different kind of
 * building before they read its caption.
 */
const ROOM_ORDER: ReadonlyArray<{ key: OfficeProjectKey; name: string }> = [
  { key: "company", name: "Board HQ" },
  { key: "caught-up", name: "DNESKAi" },
  { key: "mma-files", name: "MMA Files" },
  { key: "fightaiq", name: "FightAIQ" },
  { key: "carousel-studio", name: "Carousel Studio" },
  { key: "marketingshark", name: "marketingShark" },
  { key: "goviral", name: "GoVIRAL" },
  { key: "titty-tuesdays", name: "Titty Tuesdays" }
];

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function stateRoot(): string {
  return path.join(repositoryRoot(), "state");
}

async function readJson(...segments: string[]): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(...segments), "utf8")) as unknown;
  } catch {
    return null;
  }
}

/**
 * How many hooks a library holds, or `null` when it is not written.
 *
 * The absence is itself the datum, so a missing file resolves to `null` rather than to zero and
 * the panel shows the logged `no-hook` fallback for that surface.
 */
async function hookCount(file: string): Promise<number | null> {
  const value = await readJson(repositoryRoot(), "studio", "hooks", file);
  if (Array.isArray(value)) return value.length;
  const entries = (value as { hooks?: unknown } | null)?.hooks;
  return Array.isArray(entries) ? entries.length : null;
}

/**
 * The newest date whose edition receipt says an edition was delivered.
 *
 * `no_edition` is a real and recorded outcome with nothing to put on a slide, so it is skipped
 * here rather than shown as an example of a delivery.
 */
async function newestDeliveredEdition(): Promise<{ date: string; receipt: Record<string, unknown> } | null> {
  let names: string[] = [];
  try {
    names = await readdir(path.join(stateRoot(), "edition", "deliveries"));
  } catch {
    return null;
  }
  const dates = names
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort()
    .reverse();
  for (const date of dates) {
    const receipt = await readJson(stateRoot(), "edition", "deliveries", `${date}.json`) as
      | Record<string, unknown>
      | null;
    if (!receipt || receipt.status !== "delivered") continue;
    if (receipt.editionStatus === "no_edition") continue;
    return { date, receipt };
  }
  return null;
}

/** The 12-character disclosure form, or `null` when the receipt carries no hash at all. */
function packageRef(hash: unknown): string | null {
  return typeof hash === "string" && /^[0-9a-f]{12,}$/u.test(hash)
    ? `[package:${hash.slice(0, 12)}]`
    : null;
}

export async function resolveOfficeWorkflows(
  now = new Date(),
  shared?: WorkflowsCalendarInput
): Promise<OfficeWorkflows> {
  const today = pragueCalendarDate(now);

  /* ---- the thirteen slots, and today's column of them --------------------- */

  const slots: WorkflowsSlot[] = [];
  if (shared) {
    const feed = buildPublicCalendarFeed({
      weekOf: mondayOfCalendarWeek(today),
      now,
      standups: shared.standups,
      meetings: shared.meetings,
      skips: shared.skips,
      articleSlots: shared.articleSlots,
      definitions: shared.definitions
    });
    const dayIndex = feed.slots.findIndex((slot) => slot.at.slice(0, 10) === today);
    // Deliveries are what separate "sent" from "quiet close" on an otherwise identical held
    // slot. Both are successes; only one of them put something outside the building.
    const delivered = new Set<string>(
      shared.meetings
        .filter((record) => record.date === today && !record.fixture)
        .filter((record) => record.kind === "cu-edition" || record.kind === "mag-editorial")
        .map((record) => record.kind)
    );
    const publishedArticles = new Set<string>(
      shared.articleSlots
        .filter((run) => run.date === today && run.status === "published")
        .map((run) => `article-${run.slot}`)
    );
    shared.definitions.forEach((definition, index) => {
      const slot = dayIndex >= 0 ? feed.slots[dayIndex + index] : undefined;
      const status: CalendarStatus = slot?.status ?? "scheduled";
      const room = projectForKind(definition.kind);
      const sent = delivered.has(definition.kind) || publishedArticles.has(definition.kind);
      slots.push({
        kind: definition.kind,
        hour: definition.hour,
        label: publicKindLabel(definition.kind),
        room,
        color: PROJECT_COLOR[room],
        status,
        note: doorNoteKind(status, sent),
        reason: readableSlotReason(slot?.decisionOneLiner) ?? null,
        sits: status !== "skipped" && status !== "not-needed"
      });
    });
  }

  /* ---- the rooms, in plan order ------------------------------------------ */

  // A room carries its name, its hue and its own slots. It used to carry a made-up sentence for a
  // native `<title>` as well; the plan raises no tooltips now, so nothing read it and it is gone.
  // The recorded reasons still travel on the slots, where the replay rail reads them.
  const rooms: WorkflowsRoom[] = ROOM_ORDER.map(({ key, name }) => ({
    key,
    name,
    color: PROJECT_COLOR[key],
    slots: slots.filter((slot) => slot.room === key).sort((left, right) => left.hour - right.hour)
  }));

  /* ---- the workshop's hook rack ------------------------------------------ */

  const [quiz, quizTierB, news, mma] = await Promise.all([
    hookCount("quiz.hooks.json"),
    hookCount("quiz.tier-b.json"),
    hookCount("news.hooks.json"),
    hookCount("mma.hooks.json")
  ]);

  /* ---- the courier receipt, and the worked example ----------------------- */

  const newest = await newestDeliveredEdition();
  const receipt: WorkflowsReceipt | null = newest
    ? (() => {
        const reference = packageRef(newest.receipt.packageHash);
        if (!reference) return null;
        const deliveredAt = newest.receipt.deliveredAt;
        return {
          status: "delivered",
          packageRef: reference,
          deliveredOn: typeof deliveredAt === "string" ? deliveredAt.slice(0, 10) : newest.date
        };
      })()
    : null;

  // The example resolves whole or not at all. Every part of it is a real published thing, so a
  // part that cannot be resolved is not filled in from somewhere else.
  let example: WorkflowsExample | null = null;
  if (newest) {
    const articleUrl = typeof newest.receipt.articleUrl === "string" ? newest.receipt.articleUrl : null;
    const articles = await readStudioArticles();
    const article = articles.find(
      (entry) => entry.venture === "caught-up" && entry.summary.date === newest.date
    );
    if (articleUrl && article) {
      const summary = article.summary;
      example = {
        date: newest.date,
        kicker: summary.kicker,
        headline: summary.headline,
        standfirst: summary.standfirst,
        firstPassage: summary.passages[0] ?? "",
        passageCount: summary.passages.length,
        sourceCount: summary.sources.length,
        heroCredit: summary.heroCredit ?? null,
        articleUrl,
        tags: Array.isArray(newest.receipt.tags)
          ? (newest.receipt.tags as unknown[]).filter((tag): tag is string => typeof tag === "string")
          : []
      };
    }
  }

  /* ---- the question bank marketingShark imported once -------------------- */

  const bankFile = await readJson(
    stateRoot(), "marketingshark", "question-banks", "devshark.json"
  ) as { questions?: unknown; importedAt?: unknown } | null;
  const bank: WorkflowsBank | null =
    bankFile && Array.isArray(bankFile.questions) && typeof bankFile.importedAt === "string"
      ? { questions: bankFile.questions.length, importedOn: bankFile.importedAt.slice(0, 10) }
      : null;

  return {
    today,
    rooms,
    slots,
    hooks: { quiz, quizTierB, news, mma },
    gates: {
      minimumSuccessfulSources: editionQuality.quality.minimumSuccessfulSources,
      minimumCandidateItems: editionQuality.quality.minimumCandidateItems,
      maximumCurationCandidates: editionQuality.article.maximumCurationCandidates,
      minimumScore: editionQuality.stet.minimumScore,
      maximumRegenerationAttempts: editionQuality.budgets.maximumRegenerationAttemptsPerDate,
      targetWords: editionQuality.article.targetWords
    },
    receipt,
    example,
    bank,
    editionCap: CURRENT_EDITION_PRODUCTION_CAP_USD,
    monthlyLimit: CURRENT_MONTHLY_OPERATING_LIMIT_USD,
    apiLimit: CURRENT_MONTHLY_API_LIMIT_USD
  };
}
