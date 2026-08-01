import { agents } from "@/data/agents";

function itemsFor(input: {
  actualSpend: string;
  decision: string;
  stage: string;
}) {
  return [
  ["Current step", input.stage],
  ["Money spent", input.actualSpend],
  ["Monthly limit", "$20.00"],
  ["Real sources", "0"],
  ["Latest decision", input.decision],
  ["Decision makers", "4"],
  ["AI roles", String(agents.length)],
  ["Meeting times", "06 · 14 · 22"],
  ["Best idea score", "34/50"]
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
                label === "Real sources" || label === "Latest decision"
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
    <div className="overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]" data-horizontal-scroll>
      <div className="marquee-track flex w-max">
        <TickerItems items={items} />
        <TickerItems hidden items={items} />
      </div>
    </div>
  );
}
