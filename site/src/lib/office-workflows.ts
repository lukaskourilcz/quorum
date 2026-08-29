import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import editionQuality from "../../../config/edition-quality.json";
import ventureRegistry from "../../../config/ventures.json";
import {
  CURRENT_EDITION_PRODUCTION_CAP_USD,
  CURRENT_MONTHLY_API_LIMIT_USD,
  CURRENT_MONTHLY_OPERATING_LIMIT_USD
} from "@/data/operating-policy";
import { agents } from "@/data/agents";
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
import { PROJECT_COLOR, projectColorForKind, projectForKind, type OfficeProjectKey } from "@/lib/office-walkthrough";
import {
  doorNoteKind,
  type OfficeWorkflows,
  type WorkflowsBank,
  type WorkflowsExample,
  type WorkflowsReceipt,
  type WorkflowsOutput,
  type WorkflowsRole,
  type WorkflowsRoom,
  type WorkflowsSlot
} from "@/lib/office-workflows-model";
import { publicKindLabel, readableSlotReason } from "@/lib/slot-labels";

/**
 * The floor plan's data, resolved on the server.
 *
 * The plan draws one office floor from above: the company room, every venture, one spine, a loading dock and the
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
 * The company room and every registered venture, in the order the plan draws them.
 *
 * The workshop is on this list and holds no slots: `config/ventures.json` gives `carousel-studio`
 * `"meetings": []`, so it never deliberates and has nothing to record. It is drawn as machinery
 * with a light that never goes out, which is what tells a reader it is a different kind of
 * building before they read its caption.
 */
const ROOM_ORDER: ReadonlyArray<{
  key: OfficeProjectKey;
  name: string;
  purpose: string;
  connects: string;
  operates: string;
}> = [
  {
    key: "company",
    name: "Board HQ",
    purpose: "The council's three shifts: what the company spends its day on, decided three times a day.",
    connects: "What the council decides here becomes work in every other room. Nothing else on this floor starts on its own.",
    operates: "Four roles vote and the audit seat holds a veto. Every other role joins only when its own field is on the agenda."
  },
  {
    key: "caught-up",
    name: "DNESKAi",
    purpose: "One story of the day for the DNESKAi magazine — or nothing goes out, and the reason is recorded.",
    connects: "Finished editions leave through the loading dock, addressed to the DNESKAi magazine.",
    operates: "A morning scan, two gates that can end the day on their own, then a desk loop of write, check, review and check again."
  },
  {
    key: "mma-files",
    name: "MMA Files",
    purpose: "The day's article slot, written only from fighter files that have already been verified.",
    connects: "Reads FightAIQ's verified fighter files next door, and sends finished articles out through the loading dock to the MMA Files magazine.",
    operates: "A story meeting chooses the subject, the desk writes it, and an evening review records what actually went out."
  },
  {
    key: "fightaiq",
    name: "FightAIQ",
    purpose: "Fighter cards and fight probabilities, built from two independent sources that have to agree.",
    connects: "Nothing leaves the building from here. Its files are read by the MMA Files desk and by nobody else.",
    operates: "Two checks a day. A value standing on a single source is not a value, and the model publishes its version with every probability."
  },
  {
    key: "carousel-studio",
    // The reader-facing name only (D13). The `carousel-studio` key above does not move, and nor
    // does the package, the config keys, the state paths or the workflow allowlists — the
    // Caught Up → DNESKAi rename is the precedent and the rule.
    name: "Design Lab",
    purpose: "The workshop. It renders every carousel and assigns the one line on every first slide.",
    connects: "Both magazines send it a summary of every article they finish; it sends back the rendered carousel.",
    operates: "It holds no meeting and decides nothing. Same input, same bytes — and a hook may only appear on content its own metadata makes true."
  },
  {
    key: "marketingshark",
    name: "marketingShark",
    purpose: "One quiz question a day, drawn as a Czech and an English carousel and left as a draft for review.",
    connects: "It draws from a fixed bank of questions handed over once. Nothing is sent back to the app that supplied them.",
    operates: "It draws from a pinned bank of questions. The app that supplied them is standalone, and nothing goes back the other way."
  },
  {
    key: "goviral",
    name: "GoVIRAL",
    purpose: "What is rising this week, and at most one trend handed to another desk as a tiebreaker.",
    connects: "What it finds goes to the two magazine desks and no further. It publishes nothing itself.",
    operates: "Lit one day in seven. The other six firings cost nothing and do nothing, and that is the intended state."
  },
  {
    key: "titty-tuesdays",
    name: "Titty Tuesdays",
    purpose: "Brand and season concepts for a shop that does not exist yet.",
    connects: "It publishes nothing. A shop that does not exist yet would collect its own feed from the dock.",
    operates: "Ideas only: no prices, no stock, no availability. Nothing is delivered to it — it pulls, and fails closed when it cannot reach the feed."
  },
  {
    key: "booksofhistory",
    name: "BOOKSOFHISTORY",
    purpose: "Verified stories about books, authors and the history around them.",
    connects: "Its candidate scan and research ledger stay inside the room; only owner-reviewed drafts leave it.",
    operates: "Cheap candidate research comes first. Paid research is bounded, cited and stopped when the evidence is not good enough."
  },
  {
    key: "door-money",
    name: "Door Money",
    purpose: "Practical money lessons turned into owner-reviewed story recommendations.",
    connects: "It reads its bounded knowledge base and the owner's manually entered results. It does not contact a platform.",
    operates: "The story desk sits daily. A separate growth review sits only on Thursdays; off-days cost nothing."
  },
  {
    key: "tehdejsi-svet",
    name: "Tehdejší svět",
    purpose: "Czech and Ukrainian historical explainers grounded in a hand-verified facts file.",
    connects: "Draft summaries can go to the Design Lab. Nothing publishes and nothing connects to a product repository.",
    operates: "The desk advances a two-day cycle without skipping, and every language and evidence gate can stop it."
  },
  {
    key: "kvorum",
    name: "Kvórum",
    purpose: "Czech political claims checked before one owner-facing recommendation is recorded.",
    connects: "It reads the bounded political monitor and records evidence. It never posts or reaches out.",
    operates: "Every recommendation keeps its cited claims and correction history; unsupported claims fail closed."
  }
];

/**
 * Which roles stand in which room.
 *
 * `ventures` in the agent registry already answers this: a role is either `global`, which is the
 * company's own room, or it names the ventures it serves. No second mapping, and no role invented
 * for a room that has none.
 */
function rolesFor(key: OfficeProjectKey): WorkflowsRole[] {
  return agents
    .filter((agent) => agent.status === "active")
    .filter((agent) => (key === "company"
      ? agent.ventures === "global"
      : Array.isArray(agent.ventures) && agent.ventures.includes(key)))
    .map((agent) => ({ id: agent.id, title: agent.title, department: agent.department }));
}

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


/**
 * Where the card gets its thumbnail from.
 *
 * The magazine publishes the same bytes at its own address, but this site's content-security
 * policy allows images from `'self'` only — so the card is served the copy this repository already
 * holds, through a route of our own. An image is claimed only when the package actually carries
 * the bytes; otherwise the card renders without one.
 */
function packagedThumbnail(venture: "caught-up" | "mma-files", encoded: unknown): string | null {
  return typeof encoded === "string" && encoded.length > 0 ? `/facilities/thumb/${venture}` : null;
}

/**
 * The newest article a magazine room delivered, as a link preview.
 *
 * Only a receipt that records where the article went can produce a link, which is the same rule
 * the worked example follows. MMA Files records no address today, so its room shows the title and
 * the date and no link at all — the honest form of "we published this and did not write down
 * where".
 */
async function latestArticle(
  venture: "caught-up" | "mma-files"
): Promise<WorkflowsOutput | null> {
  if (venture === "caught-up") {
    const newest = await newestDeliveredEdition();
    if (!newest) return null;
    const url = typeof newest.receipt.articleUrl === "string" ? newest.receipt.articleUrl : null;
    const hash = typeof newest.receipt.packageHash === "string" ? newest.receipt.packageHash : null;
    const archived = hash
      ? await readJson(stateRoot(), "edition", "archive", `${newest.date}-${hash}.json`) as
        { article?: { cs?: { frontmatter?: { title?: unknown } } }; image?: { thumb_bytes_base64?: unknown } } | null
      : null;
    const title = archived?.article?.cs?.frontmatter?.title;
    if (typeof title !== "string") return null;
    return {
      kind: "article",
      title,
      date: newest.date,
      url,
      image: packagedThumbnail("caught-up", archived?.image?.thumb_bytes_base64)
    };
  }

  let names: string[] = [];
  try {
    names = await readdir(path.join(stateRoot(), "ventures", "mma-files", "articles"));
  } catch {
    return null;
  }
  const file = names.filter((name) => name.endsWith(".json")).sort().reverse()[0];
  if (!file) return null;
  const article = await readJson(stateRoot(), "ventures", "mma-files", "articles", file) as
    | { publishAt?: unknown; packageHash?: unknown; localizations?: { cs?: { title?: unknown } }; image?: { thumb_bytes_base64?: unknown } }
    | null;
  const title = article?.localizations?.cs?.title;
  if (typeof title !== "string") return null;
  const receipt = typeof article?.packageHash === "string"
    ? await readJson(
        stateRoot(), "ventures", "mma-files", "deliveries", "articles", `${article.packageHash}.json`
      ) as { articleUrl?: unknown } | null
    : null;
  const url = typeof receipt?.articleUrl === "string" ? receipt.articleUrl : null;
  return {
    kind: "article",
    title,
    date: typeof article?.publishAt === "string" ? article.publishAt.slice(0, 10) : file.slice(0, 10),
    url,
    image: packagedThumbnail("mma-files", article?.image?.thumb_bytes_base64)
  };
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
        color: projectColorForKind(definition.kind),
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
  const [dneskaiLatest, mmaLatest] = await Promise.all([
    latestArticle("caught-up"),
    latestArticle("mma-files")
  ]);

  /**
   * The last thing each room produced.
   *
   * The magazine rooms produce articles, so theirs is the article. Every other room produces
   * decisions, and the newest recorded one is what it has to show — taken from today's own slots,
   * so a room that has not sat yet says nothing rather than reaching back to an older day.
   */
  const latestFor = (key: OfficeProjectKey, own: WorkflowsSlot[]): WorkflowsOutput | null => {
    if (key === "caught-up") return dneskaiLatest;
    if (key === "mma-files") return mmaLatest;
    const recorded = [...own].reverse().find((slot) => slot.reason);
    return recorded
      ? { kind: "decision", title: recorded.reason!, date: today, url: null, image: null }
      : null;
  };

  // A paused venture's room leaves the plan with the venture: the machinery drawing must not
  // show a desk the owner switched off in Settings.
  const pausedRooms = new Set(ventureRegistry.ventures
    .filter((venture) => venture.status === "paused")
    .map((venture) => venture.id));
  const rooms: WorkflowsRoom[] = ROOM_ORDER.filter(({ key }) => !pausedRooms.has(key))
    .map(({ key, name, purpose, connects, operates }) => {
    const own = slots
      .filter((slot) => slot.room === key)
      .sort((left, right) => left.hour - right.hour);
    return {
      key,
      name,
      color: PROJECT_COLOR[key],
      slots: own,
      purpose,
      connects,
      operates,
      roles: rolesFor(key),
      latest: latestFor(key, own)
    };
  });

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
