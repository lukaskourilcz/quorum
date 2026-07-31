function itemsFor(input: {
  actualSpend: string;
  decision: string;
  stage: string;
}) {
  return [
  ["Stage", input.stage],
  ["Actual spend", input.actualSpend],
  ["All-in cap", "$20.00"],
  ["Eligible evidence", "0"],
  ["Last decision", input.decision],
  ["Council seats", "4"],
  ["Agents", "14"],
  ["Shift cadence", "06 · 14 · 22"],
  ["Best score", "34/50"]
  ] as const;
}

function TickerItems({
  hidden = false,
  items
}: {
  hidden?: boolean;
  items: ReturnType<typeof itemsFor>;
}) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className="flex items-center gap-10 whitespace-nowrap px-5 py-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]"
    >
      {items.map(([label, value], index) => (
        <span className="contents" key={label}>
          <span>
            {label}{" "}
            <span
              className={
                label === "Eligible evidence" || label === "Last decision"
                  ? "text-[var(--accent)]"
                  : "text-[var(--foreground)]"
              }
            >
              {value}
            </span>
          </span>
          {index < items.length - 1 ? (
            <span className="text-[var(--slate)]">/</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function OperatingTicker(input: {
  actualSpend: string;
  decision: string;
  stage: string;
}) {
  const items = itemsFor(input);
  return (
    <div className="overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="marquee-track flex w-max">
        <TickerItems items={items} />
        <TickerItems hidden items={items} />
      </div>
    </div>
  );
}
