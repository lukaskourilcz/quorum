import { agents } from "@/data/agents";
import { CURRENT_MONTHLY_OPERATING_LIMIT_USD } from "@/data/operating-policy";

/**
 * Every figure here is read from the record the page already holds.
 *
 * Three of them were constants left over from the founding test: "Real sources 0" stayed zero
 * through every sourced edition the desk published, "Best idea score 34/50" was one fixture
 * idea's score, and "Meeting times 06 · 14 · 22" named three company shifts on a day that runs
 * ten slots. A number nobody maintains is worse than no number.
 */
function itemsFor(input: {
  actualSpend: string;
  decision: string;
  meetingsToday: number;
  stage: string;
}) {
  return [
  ["Current step", input.stage],
  ["Money spent", input.actualSpend],
  ["Monthly limit", `$${CURRENT_MONTHLY_OPERATING_LIMIT_USD.toFixed(2)}`],
  ["Latest decision", input.decision],
  ["Decision makers", "4"],
  ["AI roles", String(agents.length)],
  ["Slots today", String(input.meetingsToday)]
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
                label === "Latest decision"
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
  meetingsToday: number;
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
