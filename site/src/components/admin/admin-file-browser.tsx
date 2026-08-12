"use client";

import { useState } from "react";

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
      <div className="rounded-[12px] border border-[#26262b] bg-[#0c0c0f] p-[18px]">
        <p className="m-0 text-[13px] leading-[1.6] text-[#a1a1aa]">
          No source file could be read. That is a fault worth looking at, not an empty state.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_7fr]" data-adm-cols>
      <div className="rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
        <div className="flex items-center justify-between gap-3 border-b border-[#1e1e22] px-[18px] py-3.5">
          <p className="m-0 text-[14px] font-semibold">Saved source files</p>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">Read only</span>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-2 [overscroll-behavior:contain]">
          {files.map((file, fileIndex) => (
            <button
              className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors"
              key={file.name}
              onClick={() => setIndex(fileIndex)}
              style={{
                background: fileIndex === index ? "#1a1a1f" : "transparent",
                color: fileIndex === index ? "#ffffff" : "#a1a1aa"
              }}
              type="button"
            >
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[9.5px] text-[#94949c]">{file.size}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
        <div className="flex items-center justify-between gap-3 border-b border-[#1e1e22] px-[18px] py-3.5">
          <p className="m-0 font-mono text-[12.5px] font-semibold text-[#f4f4f5]">{selected.name}</p>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
            {selected.size} · read only
          </span>
        </div>
        {summary ? (
          <div className="grid gap-1.5 border-b border-[#1e1e22] px-[18px] py-4">
            <p className="m-0 text-[13px] leading-[1.6] text-[#d4d4d8]">{summary[0]}</p>
            <ul className="m-0 grid list-none gap-1 p-0">
              {summary.slice(1).map((entry) => (
                <li className="font-mono text-[11.5px] text-[#a1a1aa]" key={entry}>{entry}</li>
              ))}
            </ul>
            <button
              className="justify-self-start font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c] underline"
              onClick={() => setShowRaw((open) => !open)}
              type="button"
            >
              {showRaw ? "Hide the file" : "Show the file"}
            </button>
          </div>
        ) : null}
        {summary && !showRaw ? null : (
          <pre
            aria-label={`${selected.name} file content`}
            className="m-0 max-h-[340px] flex-1 overflow-auto whitespace-pre-wrap break-words px-[18px] py-4 font-mono text-[11.5px] leading-[1.6] text-[#d4d4d8]"
            tabIndex={0}
          >
            {displayedContent}
          </pre>
        )}
      </div>
    </div>
  );
}
