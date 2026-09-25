import type { PostKind } from "./kinds.js";

/** Why a brand produced nothing, in the vocabulary the meeting record and the calendar use. */
export type BrandOutcome =
  | {
    status: "drafted";
    brandId: string;
    kind: PostKind;
    /** What the post is about, as the evidence ref the meeting record cites. */
    subject: string;
    /** The quiz's question; null for the other kinds. */
    questionId: string | null;
    packagePath: string;
    spendUsd: number;
    hookA: string;
    hookB: string;
    relaxed: boolean;
    /** The kind the rotation wanted when the quiz ran in its place, and why. */
    fallback: { scheduled: string; reason: string } | null;
  }
  | { status: "already-served"; brandId: string; kind: PostKind | null; subject: string; questionId: string | null; packagePath: string }
  | {
    status: "aborted";
    brandId: string;
    kind: PostKind | null;
    reason: "config-invalid" | "bank-invalid" | "selection-failed" | "hook-assignment-failed" | "model-output-invalid" | "truth-gate-failed" | "render-failed";
    detail: string;
    spendUsd: number;
  };
