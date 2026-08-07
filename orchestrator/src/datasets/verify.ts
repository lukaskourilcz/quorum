import { BoardlessDatasetSchema, type BoardlessDataset, type DatasetEntry } from "../contracts/boardless-dataset.js";

/**
 * The dataset analogue of the edition's same-date immutability rule.
 *
 * An edition is immutable because it belongs to one date. A dataset is immutable
 * in a different way: `entries[0]` is revealed on the anchor and every day after
 * resolves through `daysBetween(anchor, date) % entries.length`. So the array is
 * not a list, it is a schedule. Insert an entry in the middle and every later day
 * silently reveals something else; change the anchor and the whole calendar
 * shifts; delete an entry and the cycle shortens under readers who already saw it.
 *
 * A published entry is therefore as immutable as a published edition. The one
 * permitted change is a factual correction, which must move `verified` forward so
 * the correction carries its own receipt — the same reasoning as the magazines'
 * "corrections stay visible" rule.
 */

export type DatasetViolation = {
  code:
    | "schema"
    | "dataset_renamed"
    | "anchor_moved"
    | "entries_removed"
    | "entry_reordered"
    | "entry_mutated"
    | "correction_without_receipt"
    | "id_reused"
    | "slug_reused"
    | "category_removed";
  detail: string;
};

export type DatasetAppendVerdict =
  | { ok: true; appended: DatasetEntry[]; corrected: DatasetEntry[] }
  | { ok: false; violations: DatasetViolation[] };

function parse(label: string, value: unknown, violations: DatasetViolation[]): BoardlessDataset | null {
  const result = BoardlessDatasetSchema.safeParse(value);
  if (!result.success) {
    for (const issue of result.error.issues.slice(0, 20)) {
      violations.push({ code: "schema", detail: `${label}: ${issue.path.join(".") || "(root)"} — ${issue.message}` });
    }
    return null;
  }
  return result.data;
}

/**
 * Key-order-independent serialisation, recursive.
 *
 * Deliberately not `JSON.stringify(value, Object.keys(value).sort())`: an array
 * replacer is an allowlist applied at *every* depth, so nested objects whose keys
 * are absent from it serialise as `{}`. That silently hid every change to `en`
 * and `cs` — which is the only thing a correction ever edits.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Everything about an entry except `verified`, which a correction is allowed to move. */
function bodyOf(entry: DatasetEntry): string {
  const { verified: _verified, ...rest } = entry;
  return canonical(rest);
}

/**
 * Compare the dataset currently committed in the magazine against the one a
 * delivery proposes. Returns the entries that may be appended, or every reason
 * the proposal is not an append.
 *
 * `current` may be `undefined` for the first delivery of a dataset that does not
 * exist downstream yet, in which case every entry is an append.
 */
export function verifyDatasetAppend(input: {
  current: unknown | undefined;
  proposed: unknown;
}): DatasetAppendVerdict {
  const violations: DatasetViolation[] = [];

  const proposed = parse("proposed", input.proposed, violations);
  if (proposed === null) return { ok: false, violations };

  if (input.current === undefined) {
    return { ok: true, appended: proposed.entries, corrected: [] };
  }

  const current = parse("current", input.current, violations);
  if (current === null) return { ok: false, violations };

  if (current.dataset !== proposed.dataset) {
    violations.push({
      code: "dataset_renamed",
      detail: `dataset is ${current.dataset} downstream but ${proposed.dataset} in the package`
    });
  }

  // Moving the anchor re-dates every entry that has already been revealed.
  if (current.anchor !== proposed.anchor) {
    violations.push({
      code: "anchor_moved",
      detail: `anchor ${current.anchor} → ${proposed.anchor} would re-date every revealed entry`
    });
  }

  if (proposed.entries.length < current.entries.length) {
    violations.push({
      code: "entries_removed",
      detail: `${current.entries.length} entries downstream, ${proposed.entries.length} in the package — entries are never removed`
    });
    return { ok: false, violations };
  }

  const corrected: DatasetEntry[] = [];

  // The existing prefix must still be the prefix, position for position.
  current.entries.forEach((existing, index) => {
    const incoming = proposed.entries[index];
    if (incoming === undefined) return;

    if (incoming.id !== existing.id) {
      violations.push({
        code: "entry_reordered",
        detail: `position ${index} holds ${existing.id} downstream but ${incoming.id} in the package — order is the reveal schedule`
      });
      return;
    }

    if (bodyOf(incoming) === bodyOf(existing)) {
      if (incoming.verified !== existing.verified) {
        violations.push({
          code: "entry_mutated",
          detail: `${existing.id} moved verified ${existing.verified} → ${incoming.verified} without changing anything it attests to`
        });
      }
      return;
    }

    // Text changed: allowed only as a correction, and only with a fresh check date.
    if (incoming.verified <= existing.verified) {
      violations.push({
        code: "correction_without_receipt",
        detail: `${existing.id} changed but verified stayed at ${existing.verified} — a correction must record the date it was re-checked`
      });
      return;
    }
    corrected.push(incoming);
  });

  // Ids and slugs are never reused, including by a new entry reviving a retired one.
  const seenIds = new Map(current.entries.map((entry) => [entry.id, entry] as const));
  const seenSlugs = new Map(current.entries.map((entry) => [entry.slug, entry] as const));

  const appended = proposed.entries.slice(current.entries.length);
  for (const entry of appended) {
    const idOwner = seenIds.get(entry.id);
    if (idOwner !== undefined) {
      violations.push({ code: "id_reused", detail: `appended entry reuses id ${entry.id}` });
    }
    const slugOwner = seenSlugs.get(entry.slug);
    if (slugOwner !== undefined) {
      violations.push({ code: "slug_reused", detail: `appended entry reuses slug ${entry.slug} (held by ${slugOwner.id})` });
    }
    seenIds.set(entry.id, entry);
    seenSlugs.set(entry.slug, entry);
  }

  // A category an existing entry points at cannot disappear.
  for (const key of Object.keys(current.categories)) {
    if (!Object.hasOwn(proposed.categories, key)) {
      violations.push({ code: "category_removed", detail: `category ${key} was removed; existing entries still point at it` });
    }
  }

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true, appended, corrected };
}

/** One-line summary for a delivery log or an INBOX item. */
export function describeVerdict(verdict: DatasetAppendVerdict): string {
  if (!verdict.ok) {
    return `refused: ${verdict.violations.map((violation) => `${violation.code} (${violation.detail})`).join("; ")}`;
  }
  const parts = [`${verdict.appended.length} appended`];
  if (verdict.corrected.length > 0) parts.push(`${verdict.corrected.length} corrected`);
  return parts.join(", ");
}
