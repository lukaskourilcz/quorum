import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Agent } from "@/data/agents";

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card className="group overflow-hidden">
      <AgentPortrait
        agent={agent}
        className="m-2.5 mb-0 transition-transform duration-300 group-hover:scale-[0.985]"
      />
      <CardContent>
        <div className="flex items-start justify-between gap-5">
          <div>
            <Badge tone={agent.group === "Council" ? "dark" : "neutral"}>
              {agent.group}
            </Badge>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
              {agent.name}
            </h3>
            <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
              {agent.title}
            </p>
          </div>
          <Link
            aria-label={`Open ${agent.name} profile`}
            className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-button)] border border-[var(--border)] transition-colors hover:bg-[var(--secondary)]"
            href={`/agents/${agent.slug}`}
          >
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">
          {agent.mandate}
        </p>
      </CardContent>
    </Card>
  );
}
