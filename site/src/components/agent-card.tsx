import Link from "next/link";
import { AgentPortrait } from "@/components/agent-portrait";
import {
  publicAgentCheck,
  publicAgentGroup,
  publicAgentMandate,
  publicAgentText,
  publicAgentTitle
} from "@/components/agent-language";
import type { Agent } from "@/data/agents";
import { cn } from "@/lib/utils";

export function AgentCard({
  agent,
  className
}: {
  agent: Agent;
  className?: string;
}) {
  return (
    <Link
      className={cn(
        "group block overflow-hidden rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)] transition duration-300 hover:-translate-y-1 hover:border-[var(--accent)]",
        className
      )}
      href={`/agents/${agent.slug}`}
    >
      <div className="relative">
        <AgentPortrait
          agent={agent}
          className="transition-transform duration-500 group-hover:scale-[1.025]"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--obsidian)] via-transparent to-transparent" />
        <span className="mono-label absolute left-4 top-4 text-[0.625rem] text-[var(--accent)]">
          {publicAgentGroup(agent)}
        </span>
        <div className="absolute inset-x-4 bottom-4">
          <h3 className="text-[1.625rem] font-semibold tracking-[-0.04em]">
            {agent.name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ash)]">
            {publicAgentTitle(agent)}
          </p>
        </div>
      </div>
      <div className="p-6">
        <p className="text-[0.84375rem] leading-[1.4375rem] text-[var(--fog)]">
          {publicAgentMandate(agent)}
        </p>
        {agent.responsibilities.length ? (
          <ul className="mt-5 grid gap-2 border-t border-[var(--border)] pt-4 text-[0.8125rem] text-[var(--mist)]">
            {agent.responsibilities.slice(0, 3).map((responsibility) => (
              <li className="grid grid-cols-[0.875rem_1fr] gap-2" key={responsibility}>
                <span aria-hidden="true" className="text-[var(--accent)]">
                  /
                </span>
                {publicAgentText(responsibility)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="mono-label text-[0.625rem] text-[var(--fog)]">
            Main success check
          </p>
          <p className="mt-2 break-words font-mono text-[0.6875rem] leading-[1.125rem] text-[var(--mist)]">
            {publicAgentCheck(agent.primaryAccountability)}
          </p>
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="mono-label text-[0.625rem] text-[var(--fog)]">
            API model
          </p>
          <p
            className="mt-2 break-words font-mono text-[0.6875rem] leading-[1.125rem] text-[var(--mist)]"
            data-agent-api-model
          >
            {agent.apiModelSummary}
          </p>
          <p
            className="mt-2 font-mono text-[0.6875rem] leading-[1.125rem] text-[var(--mist)]"
            data-agent-api-cost-summary
          >
            {agent.apiCostSummary}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function AgentRow({
  agent,
  compact = false
}: {
  agent: Agent;
  compact?: boolean;
}) {
  return (
    <Link
      className={cn(
        "group grid items-center gap-4 border-b border-[var(--border)] px-5 py-4 transition-colors hover:bg-[var(--surface-raised)] md:gap-6 md:px-7 md:py-5",
        compact
          ? "grid-cols-[2.75rem_1fr_auto] md:py-4"
          : "grid-cols-[3.5rem_1fr] md:grid-cols-[4rem_1.1fr_1.6fr_1.2fr]"
      )}
      href={`/agents/${agent.slug}`}
    >
      <AgentPortrait
        agent={agent}
        className={cn(
          "size-14 rounded-xl",
          compact && "size-11 rounded-[0.625rem]"
        )}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <p className="text-base font-semibold tracking-[-0.03em]">
            {agent.name}
          </p>
          <span
            className={cn(
              "rounded-full border border-[var(--slate)] px-2 py-0.5 font-mono text-[0.59375rem] uppercase tracking-[0.14em] text-[var(--fog)]",
              agent.group === "Control" && "text-[var(--accent)]"
            )}
          >
            {publicAgentGroup(agent)}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-[var(--fog)]">
          {publicAgentTitle(agent)}
        </p>
        <p
          className="mt-1 truncate font-mono text-[0.625rem] text-[var(--fog)]"
          data-agent-api-model
          data-agent-api-cost-summary
        >
          API: {agent.apiModelSummary} · {agent.apiCostSummary}
        </p>
      </div>
      {compact ? null : (
        <>
          <p className="col-span-2 text-[0.84375rem] leading-[1.4375rem] text-[var(--ash)] md:col-span-1">
            {publicAgentMandate(agent)}
          </p>
          <p className="col-span-2 break-words font-mono text-[0.6875rem] leading-[1.1875rem] text-[var(--fog)] md:col-span-1">
            {publicAgentCheck(agent.primaryAccountability)}
          </p>
        </>
      )}
      {compact ? (
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
          {publicAgentGroup(agent)}
        </span>
      ) : null}
    </Link>
  );
}
