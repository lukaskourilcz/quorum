"use client";

import { useState } from "react";

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
export function AdminFileBrowser({
  files
}: {
  files: ReadonlyArray<{ name: string; size: string; content: string }>;
}) {
  const [index, setIndex] = useState(0);
  const selected = files[Math.min(index, files.length - 1)];

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
        <pre
          aria-label={`${selected.name} file content`}
          className="m-0 max-h-[340px] flex-1 overflow-auto whitespace-pre-wrap break-words px-[18px] py-4 font-mono text-[11.5px] leading-[1.6] text-[#d4d4d8]"
          tabIndex={0}
        >
          {selected.content}
        </pre>
      </div>
    </div>
  );
}
