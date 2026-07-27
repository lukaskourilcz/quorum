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
        "relative aspect-square overflow-hidden bg-[var(--secondary)]",
        className
      )}
    >
      <Image
        alt={agent.visual.avatarAlt}
        className="object-cover grayscale brightness-[0.82] contrast-105"
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 33vw"
        src={agent.visual.avatar}
      />
    </div>
  );
}
