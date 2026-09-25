import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../../budget.js";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";
import { MeetingSkipSchema } from "../../contracts/meeting-skip.js";
import { guardedJsonCall } from "../../llm/call.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { configRoot, repoRoot, stateRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import { atomicWriteJson, readJson } from "../../state.js";
import type { Stage } from "../../types.js";
import { enabledBrands, loadMarketingSharkConfig } from "./config.js";
import type { BrandOutcome } from "./outcome.js";
import { ChumOutput, PostWriterOutput } from "./package.js";
import { planDay, type DayPlan } from "./post-plan.js";
import { fixturePostOutput, runPostDay } from "./post-run.js";
import {
  fixtureChumOutput,
  fixtureHookLines,
  MS_DAILY_PHASE,
  planBrandDay,
  readLedger,
  runBrandDay,
  type MarketingSharkRunResult
} from "./run.js";
import { readBrandTrendLines } from "./trends.js";

export async function writeSkip(input: { date: string; reason: string; now: Date; root?: string }): Promise<string> {
  const root = input.root ?? stateRoot;
  const relative = `meetings/skips/${input.date}-${MS_DAILY_PHASE}.json`;
  const skip = MeetingSkipSchema.parse({
    schemaVersion: "meeting-skip/1",
    date: input.date,
    phase: MS_DAILY_PHASE,
    reason: input.reason,
    decidedAt: input.now.toISOString()
  });
  await mkdir(path.join(root, "meetings", "skips"), { recursive: true });
  await atomicWriteJson(root, relative, skip);
  return relative;
}

/**
 * The whole `ms-daily` slot: gates, the day's plan per brand, one brand at a time, then the record.
 *
 * The weekday decides the kind (quorum#576). A weekend has no room: nothing is loaded or spent,
 * and a scheduled wake-up leaves a skip naming the rotation, so the calendar shows a rest day
 * rather than an hour nobody reached. Everything except the one writer call per brand is $0, and
 * every abort path leaves the ledger and the package directory exactly as it found them.
 */
export async function runMarketingSharkCycle(input: {
  cycleId: string;
  dry: boolean;
  now: Date;
  date: string;
  stage: Stage;
}): Promise<MarketingSharkRunResult> {
  const root = input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
  // Frames go where the site serves them from, or to the dry run's own copy of that tree.
  const publicRoot = input.dry ? path.join(repoRoot, "tmp", "dry-run", "site", "public") : path.join(repoRoot, "site", "public");
  const config = await loadMarketingSharkConfig();
  const brands = enabledBrands(config);

  if (!input.dry) {
    const closed = process.env.PORTFOLIO_LIVE_ENABLED !== "true" ? "the portfolio live switch is off" : null;
    if (closed) {
      // Only a scheduled wake-up leaves a skip. A manual or local invocation of a closed slot is
      // not a missed meeting and must not write one onto the calendar.
      const artifacts = process.env.MEETING_TRIGGER === "schedule"
        ? [await writeSkip({ date: input.date, reason: `ms-daily did not open: ${closed}.`, now: input.now, root })]
        : [];
      return { date: input.date, dry: false, brands: [], spendUsd: 0, skipped: { reason: closed }, artifacts };
    }
  }

  // The day's plan, $0: GoVIRAL's snapshots and the owner's announcement copy are committed state and
  // are read from the real root even in a dry run; the week's own packages come from this run's root.
  const plans: DayPlan[] = [];
  for (const brand of brands) {
    plans.push(await planDay({ brand, date: input.date, stateRoot: root, factStateRoot: stateRoot, repoRoot, configRoot }));
  }
  const rest = plans.find((plan): plan is Extract<DayPlan, { kind: "none" }> => plan.kind === "none");
  if (brands.length > 0 && plans.every((plan) => plan.kind === "none")) {
    const artifacts = !input.dry && process.env.MEETING_TRIGGER === "schedule"
      ? [await writeSkip({ date: input.date, reason: `ms-daily did not open: ${rest!.reason}`, now: input.now, root })]
      : [];
    return { date: input.date, dry: input.dry, brands: [], spendUsd: 0, skipped: { reason: rest!.reason, rest: true }, artifacts };
  }

  const limits = await loadRuntimeBudgetLimits();
  const fixedMonthlyUsd = await loadFixedMonthlyUsd(configRoot, input.now);
  const readBudgetLedger = async () => (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
    .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const monthToDateUsd = (await readBudgetLedger())
    .filter((entry) => entry.ts.slice(0, 7) === input.date.slice(0, 7))
    .reduce((sum, entry) => sum + entry.usd, 0);
  const models = JSON.parse(await readFile(path.join(configRoot, "models.json"), "utf8")) as {
    roles: Record<string, {
      provider: "openai" | "anthropic";
      model: string;
      maxOutputTokens: number;
      thinking?: "adaptive" | "disabled";
      effort?: "low" | "medium" | "high" | "xhigh" | "max";
    }>;
  };
  const chum = models.roles.CHUM;
  if (!chum) throw new Error("config/models.json has no CHUM route");

  /** The one paid call, whatever the kind: the same route, the same budget context, its own parser. */
  const chumCall = async <T>(packet: string, attempt: number, parse: (text: string) => T): Promise<{ output: T; usd: number }> => {
    const call = await guardedJsonCall<T>({
      stateRoot: root,
      cycleId: input.cycleId,
      phase: MS_DAILY_PHASE,
      attempt,
      ventureId: "marketingshark",
      agent: "CHUM",
      provider: chum.provider,
      model: chum.model,
      system: "You are CHUM, the marketingShark carousel copywriter. Return only the JSON object you were asked for.",
      input: packet,
      maxOutputTokens: chum.maxOutputTokens,
      // The route says whether the cap may be spent thinking. It is the reason the
      // package fits: five September mornings in a row were cut off at the cap with
      // nothing usable, because adaptive thinking was billed against it first.
      ...(chum.thinking === undefined ? {} : { thinking: chum.thinking }),
      ...(chum.effort === undefined ? {} : { effort: chum.effort }),
      budgetContext: {
        now: input.now,
        cycleId: input.cycleId,
        stage: input.stage,
        // Read per call rather than once before the brand loop. assertSharedReservation
        // derives the cycle, daily and monthly spend entirely from this array, so a frozen
        // snapshot made every reservation in the run see a world where nothing had been spent
        // yet -- the second brand's call could not see the first brand's.
        ledger: await readBudgetLedger(),
        // The $50 all-in limb of the cap sums this with the model spend. Every other live call
        // site supplies the real figure; passing zero here made this the one paid path that
        // could not see the company's fixed costs.
        allInNonApiSpentUsd: fixedMonthlyUsd,
        allInCommittedUsd: 0,
        knownMonthlyForecastUsd: 0,
        remainingScheduledCycles: 60,
        limits
      },
      parse
    });
    return { output: call.value, usd: call.usd };
  };

  let ledger = await readLedger(root);
  const outcomes: BrandOutcome[] = [];
  const artifacts: string[] = [];
  let spendUsd = 0;

  for (const [index, brand] of brands.entries()) {
    const plan = plans[index]!;
    let outcome: BrandOutcome;
    if (plan.kind === "none") continue;
    if (plan.kind === "invalid") {
      outcome = { status: "aborted", brandId: brand.id, kind: "announcement", reason: "config-invalid", detail: plan.reason, spendUsd: 0 };
    } else if (plan.kind === "quiz") {
      const result = await runBrandDay({
        config,
        brand,
        ledger,
        date: input.date,
        cycleId: input.cycleId,
        root,
        publicRoot,
        dry: input.dry,
        rotation: plan.fallback,
        call: async (packet, attempt) => {
          if (input.dry) {
            // A dry run proves the wiring and never contacts a provider. The fixture reply runs
            // through the same gates, the same render and the same packaging as a paid one.
            const day = await planBrandDay({ config, brand, ledger, date: input.date, root: repoRoot, stateRoot: root });
            return { usd: 0, output: fixtureChumOutput({ brand, question: day.question, ...fixtureHookLines(day, brand) }) };
          }
          return chumCall(packet, attempt, (text) => ChumOutput.parse(JSON.parse(text)));
        }
      });
      outcome = result.outcome;
      ledger = result.ledger;
      artifacts.push(...result.artifacts);
    } else {
      const result = await runPostDay({
        brand,
        date: input.date,
        root,
        publicRoot,
        plan,
        // Read from the real state root in a dry run too: the snapshot is committed data and costs $0.
        trendLines: await readBrandTrendLines({ stateRoot, configRoot, brandId: brand.id, date: input.date }),
        call: async (packet, attempt) => input.dry
          ? { usd: 0, output: fixturePostOutput(plan, brand) }
          : chumCall(packet, attempt, (text) => PostWriterOutput.parse(JSON.parse(text)))
      });
      outcome = result.outcome;
      artifacts.push(...result.artifacts);
    }
    if (outcome.status === "aborted") {
      // An abort that only shows up as an empty artifact list is indistinguishable from a room
      // nobody reached. The reason is the whole point of recording one.
      console.warn(JSON.stringify({
        event: "marketingshark_brand_aborted",
        brand: outcome.brandId,
        kind: outcome.kind,
        reason: outcome.reason,
        detail: outcome.detail,
        usd: outcome.spendUsd
      }));
    }
    outcomes.push(outcome);
    // An aborted brand still spent whatever its call cost before the gate refused it, and the
    // record has to carry that. Only an already-served brand costs nothing.
    if (outcome.status !== "already-served") spendUsd += outcome.spendUsd;
  }

  const recordPath = `meetings/${input.date}-${MS_DAILY_PHASE}.json`;
  await atomicWriteJson(root, recordPath, buildMeetingRecord({
    cycleId: input.cycleId,
    date: input.date,
    now: input.now,
    stage: input.stage,
    dry: input.dry,
    outcomes,
    spendUsd,
    envelopeUsd: 0.1 * brands.length,
    // The published figures every other room computes. They were literals here, so a reader of an
    // ms-daily record saw "$0.00 of $30.00" on a day the company had spent real money.
    monthAllInUsd: fixedMonthlyUsd + monthToDateUsd + spendUsd,
    monthCapUsd: limits.monthlyOperatingUsd
  }));
  artifacts.push(recordPath);

  return { date: input.date, dry: input.dry, brands: outcomes, spendUsd, skipped: null, artifacts };
}

/** One drafted brand, as the summary and CHUM's turn name it. */
function draftedLine(outcome: Extract<BrandOutcome, { status: "drafted" }>): string {
  if (outcome.kind !== "quiz") return `${outcome.brandId} (${outcome.kind}: ${outcome.subject})`;
  const fallback = outcome.fallback ? `, in place of the ${outcome.fallback.scheduled}` : "";
  return `${outcome.brandId} (${outcome.hookA}/${outcome.hookB}${outcome.relaxed ? ", cooldown relaxed" : ""}${fallback})`;
}

/**
 * The room's record, in the same shape and with the same sanitising as every other room.
 *
 * The transcript is three deterministic turns rather than a conversation, because that is what
 * happened: MAKO opens with the day's objective, CHUM reports what it drafted, AUDIT states the
 * locks that held. Writing it as a debate would be a nicer record of a meeting that did not occur.
 */
export function buildMeetingRecord(input: {
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  dry: boolean;
  outcomes: readonly BrandOutcome[];
  spendUsd: number;
  envelopeUsd: number;
  monthAllInUsd: number;
  monthCapUsd: number;
}) {
  const drafted = input.outcomes.filter((outcome) => outcome.status === "drafted");
  const aborted = input.outcomes.filter((outcome) => outcome.status === "aborted");
  const times = Array.from({ length: 4 }, (_, index) => new Date(input.now.getTime() + index * 60_000).toISOString());
  const fallbacks = drafted.flatMap((outcome) => (outcome.fallback ? [outcome.fallback.reason] : []));
  const summary = drafted.length === 0
    ? aborted.length > 0
      // The reason is a code and the detail is the sentence that explains it. Printing the code
      // alone is how a truncated reply read as `model-output-invalid` in nineteen consecutive
      // records while the error it came from already said "Response truncated at the 3000-token
      // cap for <model>; raise maxOutputTokens" — the diagnosis was generated every day and
      // dropped every day.
      ? `No package was drafted. ${aborted.map((outcome) => `${outcome.brandId}: ${outcome.reason} — ${outcome.detail}`).join("; ")}.`
      : "Every enabled brand already had today's package; nothing was re-served."
    : `${drafted.length} draft ${drafted.length === 1 ? "package" : "packages"}: ${drafted.map(draftedLine).join("; ")}.${fallbacks.length > 0 ? ` ${fallbacks.join(" ")}` : ""}`;

  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date: input.date,
    phase: MS_DAILY_PHASE,
    kind: MS_DAILY_PHASE,
    fixture: input.dry,
    status: input.dry ? "PLAN" : "HELD",
    stage: input.stage,
    operatingBrief: "Draft the post each enabled brand's weekday rotation names, as one five-slide carousel per language it writes, a draft behind the approval queue.",
    participantReasons: [
      { agent: "MAKO", reason: "directs the venture and chairs the bounded room", participated: true },
      { agent: "CHUM", reason: "writes the day's copy in each brand's languages", participated: drafted.some((outcome) => outcome.kind !== "announcement") },
      { agent: "AUDIT", reason: "serves the veto seat", participated: true }
    ],
    ledger: { estimatedCycleUsd: input.envelopeUsd, actualCycleUsd: input.spendUsd, monthAllInUsd: input.monthAllInUsd, monthCapUsd: input.monthCapUsd },
    decision: {
      outcome: drafted.length > 0 ? "PLAN" : "NO_ACTION",
      summary,
      evidenceRefs: drafted.map((outcome) => outcome.subject)
    },
    proposals: drafted.map((outcome) => ({
      agent: "CHUM",
      summary: outcome.kind === "quiz"
        ? `${outcome.brandId}: question ${outcome.questionId}, hook ${outcome.hookA}, alternate ${outcome.hookB}.`
        : `${outcome.brandId}: ${outcome.kind} on ${outcome.subject}, slide 1 from ${outcome.hookA}.`,
      evidenceRefs: [outcome.subject]
    })),
    voteMatrix: [
      { voter: "MAKO", firstChoice: drafted.length > 0 ? "approve" : "abstain", veto: false },
      { voter: "AUDIT", firstChoice: "approve", veto: false }
    ],
    tasks: [],
    growthPlan: "Drafts only. Nothing here posts, schedules, buys or opens an account: SOCIAL_KILL_SWITCH is the supreme stop, marketingShark owns no channel or credentials, and every queue item is written as a draft with all approval checks pending.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: times[0],
      closedAt: times[3],
      gavel: "MAKO",
      setting: input.dry
        ? "Deterministic dry room. The reply is a labeled fixture and no provider was contacted."
        : "Live bounded room. At most one model call per enabled brand, and the kind, its subject, slide 1, the templates and the closing line were all decided in code before it.",
      turns: [
        { agent: "MAKO", mode: "gavel", sentAt: times[0], text: "The day's post, one carousel per language each enabled brand writes." },
        { agent: "CHUM", mode: "statement", sentAt: times[1], text: summary },
        { agent: "AUDIT", mode: "statement", sentAt: times[2], text: "Truth gates ran on every returned draft. Nothing was published, queued or scheduled." },
        { agent: "MAKO", mode: "close", sentAt: times[3], text: summary }
      ]
    },
    generatedAt: times[3]
  });
}
