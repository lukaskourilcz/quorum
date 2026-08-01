import type { AgentId } from "@/data/agents";

export const showPresentation = {
  title: "The Boardless Office",
  subtitle: "A workplace show told through real company records",
  leadCharacters: new Set<AgentId>([
    "VIZE",
    "FORGE",
    "PULSE",
    "AUDIT",
    "HERALD",
    "ANGLE",
    "CORNER",
    "CANVAS"
  ])
} as const;

function dateParts(date: string) {
  const [year = 2026, month = 1, day = 1] = date.split("-").map(Number);
  return { day, month, year };
}

export function seasonLabel(date: string): string {
  const { month, year } = dateParts(date);
  return `Season ${year} · Q${Math.ceil(month / 3)}`;
}

export function episodeNumber(date: string): number {
  const { day, month, year } = dateParts(date);
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86_400_000) + 1;
}

export function episodeLabel(date: string): string {
  return `Episode ${String(episodeNumber(date)).padStart(3, "0")}`;
}

export function portraitVariant(agentId: AgentId): number {
  return [...agentId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5;
}
