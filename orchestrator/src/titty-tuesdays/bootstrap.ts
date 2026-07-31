import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  MeetingRecordSchema,
  type MeetingRecord
} from "../contracts/meeting-record.js";
import { SeasonFileSchema, type SeasonFile } from "../contracts/season.js";

export const TITTY_TUESDAYS_BOOTSTRAP_ID = "2026-08-01-tt-marketing";

export function parseSeasonMarkdown(raw: string): SeasonFile {
  const match = /```json\n([\s\S]*?)\n```/.exec(raw.replaceAll("\r\n", "\n"));
  if (!match) throw new Error("Season markdown requires one JSON contract block");
  return SeasonFileSchema.parse(JSON.parse(match[1]!));
}

export async function loadSeasonFile(
  repoRoot: string,
  filename = "season-001.md"
): Promise<SeasonFile> {
  return parseSeasonMarkdown(await readFile(
    path.join(repoRoot, "state", "ventures", "titty-tuesdays", filename),
    "utf8"
  ));
}

export function createTittyTuesdaysBootstrapMeeting(
  season: SeasonFile
): MeetingRecord {
  const openedAt = "2026-08-01T10:00:00.000Z";
  const closedAt = "2026-08-01T10:06:00.000Z";
  const seats = ["PULSE", "ANGLE", "COHORT", "FUNNEL", "STET", "AUDIT"] as const;
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: "20260801120000-tt-marketing-bootstrap",
    date: "2026-08-01",
    phase: "tt-marketing",
    kind: "tt-marketing",
    fixture: true,
    status: "PLAN",
    stage: "VALIDATION",
    operatingBrief: "Run a dry season-turnover review for four crop-top concepts without authorizing production, publishing, commerce or spend.",
    participantReasons: seats.map((agent) => ({
      agent,
      reason: agent === "AUDIT"
        ? "vetoes unsafe scope, unsupported claims and external action"
        : agent === "PULSE"
          ? "chairs the bounded marketing bootstrap"
          : "reviews the season through the assigned specialist contract",
      participated: true
    })),
    ledger: {
      estimatedCycleUsd: 0.06,
      actualCycleUsd: 0,
      monthAllInUsd: 0,
      monthCapUsd: 20
    },
    decision: {
      outcome: "SEASON_BOOTSTRAP",
      summary: `Record ${season.theme} as a four-concept planning season. All products remain concepts and no external action is authorized.`,
      evidenceRefs: []
    },
    proposals: [
      {
        agent: "ANGLE",
        summary: "Use one typographic system per concept and keep the garment ahead of the joke.",
        evidenceRefs: []
      },
      {
        agent: "FUNNEL",
        summary: "Treat the four concepts as a planning arc with estimated budgets only after owner review.",
        evidenceRefs: []
      },
      {
        agent: "STET",
        summary: "Keep every public draft product-first, adults-only and blocked behind the social kill switch.",
        evidenceRefs: []
      }
    ],
    voteMatrix: seats.map((voter) => ({
      voter,
      firstChoice: "record-four-concept-season",
      veto: false
    })),
    tasks: [
      {
        id: "TASK-TT-S001-SEASON-FILE",
        owner: "SCRIBE",
        summary: "Store the four-concept season contract with the dry-room provenance.",
        status: "done"
      },
      {
        id: "TASK-TT-S001-VISUAL-QUEUE",
        owner: "FRAME",
        summary: "Wait for owner ratings and the graduation rule before producing concept visuals.",
        status: "blocked"
      }
    ],
    growthPlan: "NO_POST. The bootstrap creates planning artifacts only; the social kill switch remains on.",
    eveningOutcome: "Season 001 exists as four non-purchasable concepts pending owner ratings.",
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: "PULSE",
      setting: "Deterministic Titty Tuesdays season bootstrap. Brand, taste and platform material are data; no provider call or external action is represented.",
      turns: [
        {
          agent: "PULSE",
          mode: "gavel",
          sentAt: openedAt,
          text: "The dry bootstrap is open. We need four crop-top concepts and no launch theatre."
        },
        {
          agent: "ANGLE",
          mode: "statement",
          sentAt: "2026-08-01T10:01:00.000Z",
          text: "One Good Day gives the joke a repeatable frame. Each concept needs its own typographic device."
        },
        {
          agent: "COHORT",
          mode: "response",
          sentAt: "2026-08-01T10:02:00.000Z",
          text: "The audience floor is 18. Use public interests only; no personal data or invented audience size."
        },
        {
          agent: "FUNNEL",
          mode: "response",
          sentAt: "2026-08-01T10:03:00.000Z",
          text: "The arc can sequence four concept chapters. No price, stock, release or paid-channel claim belongs in it."
        },
        {
          agent: "STET",
          mode: "raises-concern",
          sentAt: "2026-08-01T10:04:00.000Z",
          text: "Use product and type only. Unverified hashtag claims stay marked VERIFY and block publish-ready status."
        },
        {
          agent: "AUDIT",
          mode: "vote",
          sentAt: "2026-08-01T10:05:00.000Z",
          text: "Approve the planning record. It authorizes no production, publishing, spend, account or commerce action."
        },
        {
          agent: "PULSE",
          mode: "close",
          sentAt: closedAt,
          text: `Record ${season.products.length} concepts under ${season.theme}. Owner ratings decide what graduates.`
        }
      ]
    },
    generatedAt: closedAt
  });
}
