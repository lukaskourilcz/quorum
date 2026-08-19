"use client";

import { useState } from "react";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";

const OWNER_FACING_FILE_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["METRICS_INGESTION_ENABLED=false", "automated metric collection stays turned off"]
];

export function ownerFacingFileContent(content: string): string {
  return OWNER_FACING_FILE_TERMS.reduce(
    (plain, [internal, replacement]) => plain.replaceAll(internal, replacement),
    content
  );
}

/**
 * The eleven files the runtime writes, as a list and one preview.
 *
 * It was eleven stacked `<pre>` blocks, each with its own heading and its own scrollbar, so
 * finding the ledger meant scrolling past the brand, the business and the experiments. A file the
 * owner is not reading does not need to be on screen; a file they are reading needs to be
 * readable. So: pick from a list, read one panel.
 *
 * Read-only, and not by convention — nothing here posts anywhere. These are the runtime's own
 * records and the admin is where they are inspected, not where they are edited.
 */
/**
 * The last few lines of a ledger, in words, above the JSON they came from.
 *
 * Four of these files are append-only ledgers and the owner's question about each is the same:
 * what happened recently and what did it cost. That question was answerable only by reading raw
 * JSON. This reads the tail and says it in a sentence; the file itself stays below. Internal
 * switch names are translated for this owner-facing view while the source record stays unchanged.
 *
 * Deliberately forgiving: a file that does not parse, or parses into a shape this does not know,
 * simply gets no summary. It must never be able to stop the file being shown.
 */
function ledgerSummary(name: string, content: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const entries = (parsed as { entries?: unknown })?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const line = (entry: unknown): string | null => {
    const row = entry as Record<string, unknown>;
    const when = [row.ts, row.at, row.date, row.recordedAt, row.decidedAt]
      .find((value) => typeof value === "string") as string | undefined;
    const amount = [row.usd, row.amountUsd, row.totalUsd]
      .find((value) => typeof value === "number") as number | undefined;
    const what = [row.note, row.description, row.phase, row.kind, row.agent, row.item]
      .find((value) => typeof value === "string") as string | undefined;
    if (!when && amount === undefined && !what) return null;
    return [
      when ? when.slice(0, 10) : null,
      amount === undefined ? null : `$${amount.toFixed(4)}`,
      what ?? null
    ].filter(Boolean).join(" · ");
  };

  const recent = entries.slice(-5).reverse().map(line).filter((entry): entry is string => entry !== null);
  if (recent.length === 0) return null;
  return [`${entries.length} entries in total. The most recent:`, ...recent];
}

export function AdminFileBrowser({
  files
}: {
  files: ReadonlyArray<{ name: string; size: string; content: string }>;
}) {
  const [index, setIndex] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const selected = files[Math.min(index, files.length - 1)];
  const summary = selected ? ledgerSummary(selected.name, selected.content) : null;
  const displayedContent = selected ? ownerFacingFileContent(selected.content) : "";

  if (!selected) {
    return (
      <AdminStateMessage
        description="That is a fault worth looking at, not an empty record set."
        state="unavailable"
        title="No source file could be read."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_7fr]" data-adm-cols>
      <AdminCard>
        <AdminCardHeader className="flex items-center justify-between gap-3">
          <p className="m-0 text-[length:var(--admin-type-section)] font-semibold">Saved source files</p>
          <AdminStatusBadge tone="neutral">Read only</AdminStatusBadge>
        </AdminCardHeader>
        <AdminCardContent className="max-h-[340px] overflow-y-auto p-2 [overscroll-behavior:contain]">
          {files.map((file, fileIndex) => (
            <button
              aria-pressed={fileIndex === index}
              className={`admin-focus-ring mb-0.5 flex min-h-[var(--admin-touch-target)] w-full items-center gap-2 rounded-[var(--admin-radius)] px-2.5 py-2 text-left text-[length:var(--admin-type-control)] transition-colors md:min-h-[var(--admin-row-dense)] ${
                fileIndex === index
                  ? "bg-[var(--admin-surface-selected)] text-[var(--admin-foreground)]"
                  : "text-[var(--admin-foreground-muted)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)]"
              }`}
              key={file.name}
              onClick={() => setIndex(fileIndex)}
              type="button"
            >
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="admin-tabular ml-auto shrink-0 font-mono text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-subtle)]">{file.size}</span>
            </button>
          ))}
        </AdminCardContent>
      </AdminCard>

      <AdminCard className="flex flex-col">
        <AdminCardHeader className="flex items-center justify-between gap-3">
          <p className="m-0 min-w-0 break-all font-mono text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">{selected.name}</p>
          <span className="admin-tabular shrink-0 font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
            {selected.size} · read only
          </span>
        </AdminCardHeader>
        {summary ? (
          <div className="grid gap-1.5 border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-4">
            <p className="m-0 text-[length:var(--admin-type-body)] leading-relaxed text-[var(--admin-foreground)]">{summary[0]}</p>
            <ul className="m-0 grid list-none gap-1 p-0">
              {summary.slice(1).map((entry) => (
                <li className="admin-tabular break-all font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]" key={entry}>{entry}</li>
              ))}
            </ul>
            <AdminButton
              className="justify-self-start"
              onClick={() => setShowRaw((open) => !open)}
              type="button"
              variant="ghost"
            >
              {showRaw ? "Hide the file" : "Show the file"}
            </AdminButton>
          </div>
        ) : null}
        {summary && !showRaw ? null : (
          <pre
            aria-label={`${selected.name} file content`}
            className="admin-focus-ring m-0 max-h-[340px] flex-1 overflow-auto whitespace-pre-wrap break-words px-[var(--admin-card-padding)] py-4 font-mono text-[length:var(--admin-type-label)] leading-relaxed text-[var(--admin-foreground)]"
            tabIndex={0}
          >
            {displayedContent}
          </pre>
        )}
      </AdminCard>
    </div>
  );
}
