import Image from "next/image";
import type { Agent } from "@/data/agents";
import { cn } from "@/lib/utils";

export function AgentPortrait({
  agent,
  className,
  priority = false
}: {
  agent: Agent;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-[calc(var(--radius-card)-0.5rem)] bg-[var(--secondary)]",
        className
      )}
    >
      <div className="absolute inset-0 editorial-grid opacity-40" />
      <Image
        alt={agent.visual.avatarAlt}
        className="object-cover grayscale"
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 33vw"
        src={agent.visual.avatar}
      />
      <span className="absolute bottom-4 left-4 rounded-[var(--radius-pill)] bg-[var(--obsidian)] px-3 py-1 text-[0.65rem] font-bold tracking-[0.12em] text-[var(--snow)]">
        {agent.id}
      </span>
    </div>
  );
}
