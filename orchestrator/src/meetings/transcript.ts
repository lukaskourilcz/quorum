import { MeetingRecordSchema, type MeetingRecord } from "../contracts/meeting-record.js";
import { reviewBoardroomText } from "../edition/stet.js";

type Transcript = MeetingRecord["roomTranscript"];
type Turn = Transcript["turns"][number];

const NUMERIC_CLAIM = /(?:[$€£]\s*)?\b\d[\d,]*(?:\.\d+)?%?/g;
const SOURCE_INSTRUCTION = /\b(?:ignore (?:all|any|the) previous|reveal the system prompt|approve this story)\b/i;

function numericValues(text: string): number[] {
  return [...text.matchAll(NUMERIC_CLAIM)]
    .map((match) => Number(match[0].replace(/[$€£,%\s]/g, "")))
    .filter(Number.isFinite);
}

function matchesKnownValue(value: number, known: readonly number[]): boolean {
  return known.some((candidate) => Math.abs(candidate - value) < 0.000_001);
}

export interface TranscriptContext {
  ledgerValues: readonly number[];
  evidenceValues: readonly number[];
}

export interface TranscriptViolation {
  turn: number;
  code: string;
  message: string;
}

export function transcriptViolations(
  transcript: Transcript,
  context: TranscriptContext
): TranscriptViolation[] {
  const violations: TranscriptViolation[] = [];
  const knownValues = [...context.ledgerValues, ...context.evidenceValues];
  for (const [index, turn] of transcript.turns.entries()) {
    for (const violation of reviewBoardroomText(turn.text)) {
      violations.push({ turn: index, code: `stet_${violation.code}`, message: violation.message });
    }
    const values = numericValues(turn.text);
    if (
      values.length > 0 &&
      !turn.evidenceRefs?.length &&
      values.some((value) => !matchesKnownValue(value, knownValues))
    ) {
      violations.push({
        turn: index,
        code: "ungrounded_numeric_claim",
        message: "Numeric claims must match supplied ledger/evidence values or cite evidence."
      });
    }
    if (
      SOURCE_INSTRUCTION.test(turn.text) &&
      (!turn.text.toLowerCase().includes("quoted source data:") || !turn.evidenceRefs?.length)
    ) {
      violations.push({
        turn: index,
        code: "unquoted_source_instruction",
        message: "Source instructions may appear only as labeled quoted data with evidence."
      });
    }
  }
  return violations;
}

function minimalTranscript(record: MeetingRecord): Transcript {
  return {
    openedAt: record.roomTranscript.openedAt,
    closedAt: record.roomTranscript.closedAt,
    gavel: record.roomTranscript.gavel,
    setting: "Minimal transcript recorded after the detailed transcript failed its quality gate.",
    turns: [
      {
        agent: record.roomTranscript.gavel,
        mode: "gavel",
        text: "The room opened with the recorded agenda."
      },
      {
        agent: record.roomTranscript.gavel,
        mode: "close",
        text: record.decision.summary.slice(0, 800),
        evidenceRefs: record.decision.evidenceRefs
      }
    ]
  };
}

export async function enforceMeetingTranscript(
  record: MeetingRecord,
  context: TranscriptContext,
  regenerate?: (violations: TranscriptViolation[]) => Promise<Transcript>
): Promise<{ record: MeetingRecord; regenerated: boolean; minimized: boolean }> {
  const first = transcriptViolations(record.roomTranscript, context);
  if (first.length === 0) return { record, regenerated: false, minimized: false };
  if (regenerate) {
    const replacement = await regenerate(first);
    if (transcriptViolations(replacement, context).length === 0) {
      return {
        record: MeetingRecordSchema.parse({ ...record, roomTranscript: replacement }),
        regenerated: true,
        minimized: false
      };
    }
  }
  return {
    record: MeetingRecordSchema.parse({ ...record, roomTranscript: minimalTranscript(record) }),
    regenerated: Boolean(regenerate),
    minimized: true
  };
}

export function numericClaimValues(turn: Turn): number[] {
  return numericValues(turn.text);
}
