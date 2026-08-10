/**
 * The admin's two primitives, extracted from the page that grew them.
 *
 * Both were module-private in `app/admin/page.tsx`, which was fine while the page was their only
 * consumer and became a copy-paste invitation the moment it was not. The house rule: extract
 * before the second consumer arrives, not after it has already forked.
 *
 * These are the admin's literal-hex dialect, not the token dialect the public pages use. That is
 * deliberate and documented — the admin is a dark instrument panel with its own palette — so a
 * `var(--card)` creeping in here would be the drift, not the fix.
 */

export function Tile({
  label,
  value,
  foot,
  percent,
  brand
}: {
  label: string;
  value: string;
  foot: string;
  percent: number;
  brand: string;
}) {
  return (
    <div className="bg-[#0e0e11] px-[18px] py-4">
      <p className="m-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#94949c]">{label}</p>
      <p className="m-0 mt-2.5 text-[26px] font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
      <span className="mt-2.5 block h-[3px] overflow-hidden rounded-sm bg-[#26262b]">
        <span
          className="block h-full"
          style={{ width: `${Math.max(0, Math.min(100, percent)).toFixed(0)}%`, background: brand }}
        />
      </span>
      <p className="m-0 mt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#94949c]">{foot}</p>
    </div>
  );
}

/**
 * Several panels below predate this shell and bring their own page gutters — `mx-auto`,
 * `max-w-[var(--container)]`, `px-5`, `pb-20`. Inside a 1,180px body those are a second set of
 * margins on top of the body's own. Neutralising them here keeps one layout owner without
 * rewriting six working panels that are correct about everything except where they sit.
 *
 * It targets direct `<section>` children only, so a panel that does not wrap one is unaffected.
 */
const UNWRAP =
  "[&>section]:mx-0 [&>section]:mt-0 [&>section]:max-w-none [&>section]:px-0 [&>section]:pb-0";

export function Panel({
  title,
  note,
  children
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
      <div className="flex items-center justify-between gap-3 border-b border-[#1e1e22] px-[18px] py-3.5">
        <p className="m-0 text-[14px] font-semibold">{title}</p>
        {note ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">{note}</span>
        ) : null}
      </div>
      <div className={`p-[18px] ${UNWRAP}`}>{children}</div>
    </div>
  );
}
