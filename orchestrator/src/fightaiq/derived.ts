import { FighterCardSchema, FighterHistoryBoutSchema, independentMmaSourceCount, type BoutRecord, type FighterRecord } from "../contracts/mma.js";
import { seedRatings } from "./engine.js";
import { computeModelEligibility, resolveAgreeingDiscrepancies } from "./field-agreement.js";
import type { z } from "zod";

type HistoryBout = z.infer<typeof FighterHistoryBoutSchema>;

function round(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * How many bouts a stated record accounts for — "24-6-0 (1 NC)" is thirty-one.
 *
 * Null when the string is not a record, so a caller cannot mistake an unreadable value for zero.
 */
export function recordBoutCount(record: string | null): number | null {
  if (!record) return null;
  const parts = /^\s*(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)/u.exec(record);
  if (!parts) return null;
  const noContests = /\((\d+)\s*NC\)/iu.exec(record);
  return Number(parts[1]) + Number(parts[2]) + Number(parts[3]) + (noContests ? Number(noContests[1]) : 0);
}

export function deriveCareerStats(history: readonly HistoryBout[], now?: Date): Record<string, number | null> {
  const wins = history.filter((bout) => bout.result === "win");
  const losses = history.filter((bout) => bout.result === "loss");
  const draws = history.filter((bout) => bout.result === "draw");
  const noContests = history.filter((bout) => bout.result === "no-contest");
  const finishes = wins.filter((bout) => bout.method && !bout.method.toLowerCase().includes("decision"));
  const koTkoWins = wins.filter((bout) => /(?:^|\b)(?:ko|tko|knockout)(?:\b|$)/iu.test(bout.method ?? "")).length;
  const submissionWins = wins.filter((bout) => /sub|submission/iu.test(bout.method ?? "")).length;
  const decisionWins = wins.filter((bout) => /decision/iu.test(bout.method ?? "")).length;
  const durations = history.flatMap((bout) => bout.elapsedSeconds === null ? [] : [bout.elapsedSeconds]);
  const recent = [...history].sort((left, right) => left.happenedAt.localeCompare(right.happenedAt));
  const recentWinRate = (count: number) => {
    const sample = recent.slice(-count).filter((bout) => bout.result !== "no-contest");
    return sample.length ? round(sample.filter((bout) => bout.result === "win").length / sample.length) : null;
  };
  const firstAt = history.at(0)?.happenedAt;
  const lastAt = history.at(-1)?.happenedAt;
  const activeYears = firstAt && lastAt ? Math.max(1 / 365.25, (Date.parse(lastAt) - Date.parse(firstAt)) / 31_556_952_000) : null;
  return {
    bouts: history.length,
    wins: wins.length,
    losses: losses.length,
    draws: draws.length,
    noContests: noContests.length,
    finishRate: wins.length ? round(finishes.length / wins.length) : null,
    koTkoWins,
    submissionWins,
    decisionWins,
    koTkoWinShare: wins.length ? round(koTkoWins / wins.length) : null,
    submissionWinShare: wins.length ? round(submissionWins / wins.length) : null,
    decisionWinShare: wins.length ? round(decisionWins / wins.length) : null,
    averageElapsedSeconds: durations.length ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    recentThreeWinRate: recentWinRate(3),
    recentFiveWinRate: recentWinRate(5),
    fightsPerYear: activeYears ? round(Math.max(1, history.length - 1) / activeYears) : null,
    layoffDays: now && lastAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(lastAt)) / 86_400_000)) : null
  };
}

function historyEntry(bout: BoutRecord, fighterRef: string): HistoryBout | null {
  if (bout.status !== "completed" || !bout.result) return null;
  const red = bout.fighters.red === fighterRef;
  const blue = bout.fighters.blue === fighterRef;
  if (!red && !blue) return null;
  const winner = bout.result.winner;
  const result = winner === "draw" ? "draw" : winner === "no-contest" ? "no-contest" : (red && winner === "red") || (blue && winner === "blue") ? "win" : "loss";
  return {
    boutRef: bout.id,
    eventRef: bout.event.ref,
    happenedAt: bout.event.startsAtUtc,
    opponentRef: red ? bout.fighters.blue : bout.fighters.red,
    result,
    method: bout.result.method,
    round: bout.result.round,
    elapsedSeconds: bout.result.elapsedSeconds,
    sourceRefs: bout.result.sourceRefs,
    evidenceTier: independentMmaSourceCount(bout.result.sourceRefs) >= 2 ? "primary" : "secondary",
    status: independentMmaSourceCount(bout.result.sourceRefs) >= 2 ? "verified" : "provisional"
  };
}

export function rebuildDerivedFighterData(input: {
  fighters: readonly FighterRecord[];
  bouts: readonly BoutRecord[];
  now: Date;
}): FighterRecord[] {
  const decisiveHistory = input.bouts.flatMap((bout) => {
    if (bout.status !== "completed" || !bout.result || (bout.result.winner !== "red" && bout.result.winner !== "blue")) return [];
    return [{
      org: bout.org,
      red: bout.fighters.red.replace(`${bout.org}:`, ""),
      blue: bout.fighters.blue.replace(`${bout.org}:`, ""),
      outcome: bout.result.winner,
      happenedAt: bout.event.startsAtUtc
    }];
  });
  const ratings = seedRatings(decisiveHistory);
  const timestamp = input.now.toISOString();
  return input.fighters.map((fighter) => {
    const history = input.bouts
      .map((bout) => historyEntry(bout, fighter.id))
      .filter((bout): bout is HistoryBout => Boolean(bout))
      .sort((left, right) => left.happenedAt.localeCompare(right.happenedAt) || left.boutRef.localeCompare(right.boutRef));
    const values = deriveCareerStats(history, input.now);
    const derivedRecord = history.length
      ? `${values.wins}-${values.losses}-${values.draws}${values.noContests ? ` (${values.noContests} NC)` : ""}`
      : null;
    const aggregateRecord = typeof fighter.fields.record?.value === "string" ? fighter.fields.record.value.trim() : null;
    // A derived record shorter than the stated one is an incomplete history, not two sources
    // disagreeing. We hold four of Ilia Topuria's eighteen bouts; reading 3-1-0 against 17-1-0 as
    // a contradiction opened a discrepancy that could never close, and an open discrepancy on a
    // critical field bars the fighter from the model permanently. Only a history that covers the
    // stated bout count can contradict it.
    const aggregateBouts = recordBoutCount(aggregateRecord);
    const historyCoversRecord = aggregateBouts === null || history.length >= aggregateBouts;
    const recordMismatch = Boolean(derivedRecord && aggregateRecord && derivedRecord !== aggregateRecord && historyCoversRecord);
    const historyIncomplete = Boolean(derivedRecord && aggregateRecord && derivedRecord !== aggregateRecord && !historyCoversRecord);
    // Ones this rebuild opened in an earlier run and no longer stands behind. Only its own —
    // a disagreement between two outside sources is not this function's to close.
    const reviewed = resolveAgreeingDiscrepancies(fighter.discrepancies);
    const carried = recordMismatch
      ? reviewed
      : reviewed.filter((item) => !(
        item.field === "record"
        && item.status === "open"
        && item.values.some((value) => value.sourceRef === `derived:${fighter.id}:history`)
      ));
    const discrepancies = recordMismatch && !carried.some((item) => item.field === "record" && item.status === "open")
      ? [...carried, {
          field: "record",
          values: [
            { value: aggregateRecord!, sourceRef: fighter.fields.record?.sourceRefs[0] ?? "source:unknown" },
            { value: derivedRecord!, sourceRef: `derived:${fighter.id}:history` }
          ],
          status: "open" as const
        }]
      : carried;
    const withMismatch = recordMismatch
      ? [...new Set([...fighter.quality.gaps, "record-history-mismatch"])]
      : fighter.quality.gaps.filter((gap) => gap !== "record-history-mismatch");
    // Still recorded, still visible in the backfill queue and the roster status — it just does not
    // masquerade as a source conflict.
    const qualityGaps = historyIncomplete
      ? [...new Set([...withMismatch, "record-history-incomplete"])]
      : withMismatch.filter((gap) => gap !== "record-history-incomplete");
    const historyRefs = history.flatMap((bout) => bout.sourceRefs);
    const statsProfiles = history.length ? [{
      id: "derived-career",
      label: "Career totals derived from sourced canonical bout records",
      scope: "career" as const,
      organization: fighter.org,
      sourceRef: `derived:${fighter.id}:history`,
      bouts: history.length,
      values,
      updatedAt: timestamp
    }] : [];
    const seeded = ratings[fighter.id];
    const rating = {
      system: "glicko2" as const,
      rating: seeded?.rating ?? 1500,
      deviation: seeded?.deviation ?? 350,
      volatility: seeded?.volatility ?? fighter.rating.volatility,
      boutCount: history.filter((bout) => bout.result === "win" || bout.result === "loss").length,
      asOfBoutRef: history.at(-1)?.boutRef ?? null,
      updatedAt: timestamp
    };
    const changed = JSON.stringify({ history: fighter.history, statsProfiles: fighter.statsProfiles, rating: fighter.rating, discrepancies: fighter.discrepancies, qualityGaps: fighter.quality.gaps }) !== JSON.stringify({ history, statsProfiles, rating, discrepancies, qualityGaps });
    return FighterCardSchema.parse({
      ...fighter,
      history,
      statsProfiles,
      rating,
      discrepancies,
      quality: { ...fighter.quality, gaps: qualityGaps },
      modelEligible: recordMismatch ? false : computeModelEligibility(fighter.criticalFields, fighter.fields, discrepancies),
      changeLog: changed ? [...fighter.changeLog, {
        at: timestamp,
        kind: "rating-rebuild",
        fields: ["history", "statsProfiles", "rating", ...(recordMismatch || historyIncomplete ? ["discrepancies", "quality"] : [])],
        sourceRefs: [...new Set(historyRefs)],
        note: "Rebuilt career totals and Glicko state from canonical completed bouts."
      }] : fighter.changeLog,
      updatedAt: changed ? timestamp : fighter.updatedAt
    });
  });
}
