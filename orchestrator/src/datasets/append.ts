import { createHash } from "node:crypto";
import {
  BoardlessDatasetSchema,
  DATASET_TARGETS,
  type BoardlessDataset,
  type DatasetEntry,
  type DatasetName
} from "../contracts/boardless-dataset.js";
import { verifyDatasetAppend, type DatasetViolation } from "./verify.js";

/**
 * The append path for the magazines' daily datasets.
 *
 * The evidence rule here is deliberately asymmetric, and it is the reason this
 * module exists rather than an agent writing entries directly. A dataset entry
 * makes a factual claim to a reader with no article around it and no source
 * ledger beside it — just `verified` and `source`. The repository's truth rules
 * forbid a model-generated fact without human-verifiable grounding, so:
 *
 * - a **human-curated** append needs only the entry's own `source`, because a
 *   person read the source and is the one attesting to it;
 * - a **model-drafted** append additionally needs an `evidenceRef` per entry
 *   pointing at something in `state/EVIDENCE.jsonl` or a repository path, so an
 *   auditor can reach the material the draft was made from.
 *
 * The refs never travel downstream. The magazines' delivered files keep exactly
 * the shape their loaders and tests already expect; provenance stays here, in
 * the receipt, which is where the rest of quorum's audit trail lives.
 */

export type AppendAuthor =
  | { kind: "human"; name: string }
  | { kind: "agent"; id: string };

export type ProposedEntry = {
  entry: DatasetEntry;
  /** Required when the author is an agent. A `state/…` path or an EVIDENCE id. */
  evidenceRef?: string;
};

export type AppendPlan = {
  dataset: DatasetName;
  target: (typeof DATASET_TARGETS)[DatasetName];
  /** The complete file to deliver, current entries plus the appended ones. */
  file: BoardlessDataset;
  appended: DatasetEntry[];
  /** sha256 of the serialized file — the delivery's idempotency key. */
  packageHash: string;
};

export type AppendRefusal = { violations: DatasetViolation[] };

export type AppendOutcome = { ok: true; plan: AppendPlan } | { ok: false; refusal: AppendRefusal };

const EVIDENCE_ID = /^[A-Z]+-E-\d+$/;

function looksLikeEvidenceRef(reference: string): boolean {
  return EVIDENCE_ID.test(reference) || reference.startsWith("state/");
}

/** Stable serialization: this is what gets written and what the hash covers. */
export function serializeDataset(file: BoardlessDataset): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function datasetPackageHash(file: BoardlessDataset): string {
  return createHash("sha256").update(serializeDataset(file), "utf8").digest("hex");
}

/**
 * Build the file a delivery would carry, or every reason it must not be sent.
 *
 * `current` is the dataset as it stands in the magazine, or `undefined` before
 * the first delivery.
 */
export function planAppend(input: {
  dataset: DatasetName;
  current: unknown | undefined;
  proposals: ProposedEntry[];
  author: AppendAuthor;
  /**
   * The envelope a first append starts from, when no file exists downstream yet.
   *
   * Without it the bootstrap declared no categories at all, so every proposal failed the
   * category check and no dataset could ever receive its first entry — which is why this path
   * had never run end to end. A later append ignores this: the committed file's own anchor and
   * categories win, because the anchor is a reveal schedule and moving it reorders history.
   */
  bootstrap?: { anchor: string; categories: Record<string, { en: string; cs: string }> };
}): AppendOutcome {
  const violations: DatasetViolation[] = [];

  if (input.proposals.length === 0) {
    violations.push({ code: "schema", detail: "an append with no entries is not a delivery" });
    return { ok: false, refusal: { violations } };
  }

  // The evidence gate. A human attests with the entry's own source; an agent has
  // to point at the material as well.
  if (input.author.kind === "agent") {
    for (const proposal of input.proposals) {
      const reference = proposal.evidenceRef?.trim();
      if (reference === undefined || reference === "") {
        violations.push({
          code: "schema",
          detail: `${proposal.entry.id}: ${input.author.id} drafted this entry, so it needs an evidenceRef a reviewer can open`
        });
        continue;
      }
      if (!looksLikeEvidenceRef(reference)) {
        violations.push({
          code: "schema",
          detail: `${proposal.entry.id}: evidenceRef "${reference}" is neither an EVIDENCE id nor a state/ path`
        });
      }
    }
  }

  if (violations.length > 0) return { ok: false, refusal: { violations } };

  const base: BoardlessDataset | undefined =
    input.current === undefined ? undefined : (BoardlessDatasetSchema.safeParse(input.current).data as BoardlessDataset | undefined);

  if (input.current !== undefined && base === undefined) {
    return {
      ok: false,
      refusal: {
        violations: [{ code: "schema", detail: "the dataset currently in the magazine does not parse; reconcile it before appending" }]
      }
    };
  }

  const proposedFile = {
    ...(base ?? {
      schemaVersion: "boardless-dataset/1" as const,
      dataset: input.dataset,
      anchor: input.bootstrap?.anchor ?? "2026-07-01",
      categories: input.bootstrap?.categories ?? {},
      entries: []
    }),
    entries: [...(base?.entries ?? []), ...input.proposals.map((proposal) => proposal.entry)]
  };

  const verdict = verifyDatasetAppend({ current: input.current, proposed: proposedFile });
  if (!verdict.ok) return { ok: false, refusal: { violations: verdict.violations } };

  const parsed = BoardlessDatasetSchema.parse(proposedFile);
  return {
    ok: true,
    plan: {
      dataset: input.dataset,
      target: DATASET_TARGETS[input.dataset],
      file: parsed,
      appended: verdict.appended,
      packageHash: datasetPackageHash(parsed)
    }
  };
}

export type AppendReceipt = {
  schemaVersion: "dataset-append/1";
  dataset: DatasetName;
  targetRepo: string;
  targetPath: string;
  packageHash: string;
  appendedIds: string[];
  entryCountBefore: number;
  entryCountAfter: number;
  author: AppendAuthor;
  evidenceRefs: string[];
  recordedAt: string;
};

/**
 * The upstream record of an append. Written under `state/ventures/<venture>/`
 * beside the delivery receipts, which is what the magazines' READMEs mean when
 * they say quorum records the append.
 */
export function appendReceipt(input: {
  plan: AppendPlan;
  proposals: ProposedEntry[];
  author: AppendAuthor;
  entryCountBefore: number;
  recordedAt: string;
}): AppendReceipt {
  return {
    schemaVersion: "dataset-append/1",
    dataset: input.plan.dataset,
    targetRepo: input.plan.target.repo,
    targetPath: input.plan.target.path,
    packageHash: input.plan.packageHash,
    appendedIds: input.plan.appended.map((entry) => entry.id),
    entryCountBefore: input.entryCountBefore,
    entryCountAfter: input.plan.file.entries.length,
    author: input.author,
    evidenceRefs: input.proposals
      .map((proposal) => proposal.evidenceRef)
      .filter((reference): reference is string => reference !== undefined && reference.trim() !== ""),
    recordedAt: input.recordedAt
  };
}
