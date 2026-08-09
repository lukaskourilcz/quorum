import Link from "next/link";
import type { OwnerAttentionItem, OwnerAttentionSnapshot } from "@/lib/owner-attention";

/**
 * One list, two uses: what you are approving, and what only you can do.
 *
 * Both answer the same question — what is waiting on me — and both are read-only. Resolving an
 * item means acting where it came from, and the next collector run drops it. There is no button
 * here that would let this panel disagree with the source it was built from.
 */

const URGENCY: Readonly<Record<OwnerAttentionItem["urgency"], { label: string; colour: string }>> = {
  blocking: { label: "blocking", colour: "#f87171" },
  soon: { label: "soon", colour: "#f5a524" },
  whenever: { label: "whenever", colour: "#94949c" }
};

/** Where the item came from, as somewhere the owner can actually open. */
function sourceHref(item: OwnerAttentionItem): string | null {
  if (item.sourceKind === "runtime") return null;
  if (item.sourceKind === "inbox") return "/admin?venture=global";
  return null;
}

function Item({ item }: { item: OwnerAttentionItem }) {
  const urgency = URGENCY[item.urgency];
  const href = sourceHref(item);
  return (
    <li className="grid gap-2 border-b border-[#1e1e22] py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span
          className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ borderColor: urgency.colour, color: urgency.colour }}
        >
          {urgency.label}
        </span>
        <span className="text-[14px] font-semibold text-[#f4f4f5]">{item.title}</span>
        {item.since ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">
            since {item.since}
          </span>
        ) : null}
      </div>

      <p className="m-0 max-w-[70ch] text-[13px] leading-[1.6] text-[#d4d4d8]">{item.plain}</p>

      {item.steps.length ? (
        <ol className="m-0 grid list-decimal gap-1 pl-5 text-[12.5px] leading-[1.55] text-[#a1a1aa]">
          {item.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
          {item.sourceKind === "runtime" ? `setting · ${item.sourceRef}` : item.sourceRef}
        </span>
        {href ? (
          <Link className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a1a1aa] underline" href={href}>
            Open the file
          </Link>
        ) : null}
        {/* The retro room turns this flag into a fix task, so the gap is work rather than a wart. */}
        {item.needsPlainCopy ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#f5a524]">
            no plain description yet
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function OwnerAttentionPanel({
  kind,
  snapshot
}: {
  kind: "approvals" | "manual-tasks";
  snapshot: OwnerAttentionSnapshot;
}) {
  const items = kind === "approvals" ? snapshot.approvals : snapshot.manualTasks;
  const lead = kind === "approvals"
    ? "Everything waiting for your yes. Each one names exactly what it approves and what it costs, so you do not have to think twice."
    : "Everything only you can do: keys, accounts, switches. Nothing here can be done by the system on your behalf.";

  if (snapshot.state === "missing") {
    return (
      <div className="grid gap-3">
        <p className="m-0 max-w-[70ch] text-[13px] leading-[1.6] text-[#d4d4d8]">{lead}</p>
        <p className="m-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#94949c]">
          This list is built fresh on every daily run and has not been written yet. It fills after
          the next cycle, from{" "}
          <code className="font-mono text-[11px]">state/INBOX.md</code>,{" "}
          <code className="font-mono text-[11px]">docs/NEEDED.md</code> and the settings that are
          not yet in place.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="m-0 max-w-[70ch] text-[13px] leading-[1.6] text-[#d4d4d8]">{lead}</p>

      {items.length === 0 ? (
        <p className="m-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] text-[#d4d4d8]">
          {kind === "approvals"
            ? "Nothing is waiting for your approval."
            : "Nothing is waiting on you. Every key and switch the system needs is in place."}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {items.map((item) => <Item item={item} key={`${item.sourceKind}-${item.id}`} />)}
        </ul>
      )}

      {snapshot.unreadable > 0 ? (
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#f5a524]">
          {snapshot.unreadable} {snapshot.unreadable === 1 ? "entry" : "entries"} in this list could not be read
        </p>
      ) : null}

      {snapshot.generatedAt ? (
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
          Rebuilt {snapshot.generatedAt.slice(0, 10)} · resolve an item where it came from and it
          disappears from here on the next run
        </p>
      ) : null}
    </div>
  );
}
