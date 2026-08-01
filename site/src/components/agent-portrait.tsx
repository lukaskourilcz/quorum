import type { Agent } from "@/data/agents";
import { cn } from "@/lib/utils";
import { portraitVariant, showPresentation } from "@/show/config";

export function AgentPortrait({
  agent,
  className,
  priority = false
}: {
  agent: Agent;
  className?: string;
  priority?: boolean;
}) {
  void priority;
  const variant = portraitVariant(agent.id);
  const isLead = showPresentation.leadCharacters.has(agent.id);
  const eyeY = 46 + (variant % 2) * 2;
  const hairPaths = [
    "M28 47c0-23 14-34 36-34 20 0 34 13 34 34-9-8-16-14-24-17-12 12-28 16-46 17Z",
    "M27 50c0-27 17-38 38-38 20 0 33 14 33 38-9-17-23-24-40-23-8 12-18 19-31 23Z",
    "M29 48c0-22 13-35 35-35 21 0 35 13 35 35-13-13-29-18-46-15-8 8-15 13-24 15Z",
    "M27 51c1-27 16-39 38-39 23 0 35 15 34 40-13-8-21-19-25-31-9 17-24 28-47 30Z",
    "M29 49c0-24 15-37 36-37 22 0 35 15 34 38-12-15-26-22-43-21-7 10-16 17-27 20Z"
  ] as const;
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden bg-[var(--show-card)]",
        className
      )}
    >
      <svg
        aria-label={`Illustrated character portrait of ${agent.name}, ${agent.title}`}
        className="size-full"
        role="img"
        viewBox="0 0 128 128"
      >
        <rect fill="var(--show-card)" height="128" width="128" />
        <circle cx={20 + variant * 22} cy={18 + variant * 6} fill="var(--show-accent-soft)" opacity="0.55" r="38" />
        <path d="M13 128c3-32 21-48 51-48s49 16 52 48Z" fill={isLead ? "var(--show-lead-jacket)" : "var(--show-jacket)"} />
        <path d="M53 77h22v18c-6 7-16 7-22 0Z" fill="var(--show-face-shadow)" />
        <ellipse cx="64" cy="49" fill="var(--show-face)" rx="31" ry="37" />
        <path d={hairPaths[variant]} fill="var(--show-hair)" />
        <circle cx="52" cy={eyeY} fill="var(--show-ink)" r="2.2" />
        <circle cx="76" cy={eyeY} fill="var(--show-ink)" r="2.2" />
        <path d={`M58 ${61 + (variant % 2)}c4 ${variant === 3 ? -2 : 3} 8 ${variant === 3 ? -2 : 3} 12 0`} fill="none" stroke="var(--show-ink)" strokeLinecap="round" strokeWidth="2" />
        <path d="M48 39c4-3 8-3 12-1M70 38c4-2 8-2 11 1" fill="none" stroke="var(--show-hair)" strokeLinecap="round" strokeWidth="2" />
        <path d="M44 92l20 16 20-16 9 36H35Z" fill={isLead ? "var(--show-lead-jacket)" : "var(--show-jacket)"} />
        <path d="M55 94l9 14 9-14" fill="var(--show-paper)" />
        {isLead ? <circle cx="105" cy="23" fill="var(--accent)" r="8" /> : null}
        <text fill="var(--show-paper)" fontFamily="var(--font-ibm-plex-mono), monospace" fontSize="7" fontWeight="700" textAnchor="middle" x="105" y="25.5">{isLead ? "LEAD" : ""}</text>
      </svg>
      <span className="absolute bottom-3 left-3 rounded-full border border-[var(--show-line)] bg-[color-mix(in_srgb,var(--show-card)_88%,transparent)] px-2.5 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[var(--show-ink)] backdrop-blur-sm">
        {agent.name}
      </span>
    </div>
  );
}
