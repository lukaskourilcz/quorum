import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  CalendarDefinition,
  CalendarKind
} from "@/lib/calendar-feed-model";

interface RawVentureRegistry {
  schemaVersion: string;
  ventures: Array<{
    meetings: Array<{
      kind: string;
      label: string;
      cadence: string;
    }>;
    productionJobs?: Array<{
      kind: string;
      cadence: string;
    }>;
  }>;
}

const portfolioBoardSlots: readonly CalendarDefinition[] = [
  { hour: 6, kind: "venture-morning", label: "Morning shift" },
  { hour: 14, kind: "venture-afternoon", label: "Afternoon shift" },
  { hour: 22, kind: "venture-night", label: "Night shift" }
];

function registryPath(): string {
  const root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(root, "config", "ventures.json");
}

function calendarKind(value: string): CalendarKind {
  if (value === "cu-edition" || value === "cu-product" || value === "tt-marketing" || value === "gv-brief" || value === "incubator-scan" || value === "incubator-synthesis" || value === "mma-intake" || value === "mma-analysis" || value === "mag-editorial" || value === "mag-desk" || value === "studio") return value;
  throw new Error(`Unsupported public venture meeting kind: ${value}`);
}

function cadenceHour(cadence: string): number {
  const match = /^daily@(\d{2}):00$/.exec(cadence);
  const hour = Number(match?.[1]);
  if (!match || !Number.isInteger(hour) || hour < 5 || hour > 23) {
    throw new Error(`Invalid venture cadence: ${cadence}`);
  }
  return hour;
}

function productionDefinitions(kind: string, cadence: string): CalendarDefinition[] {
  // One article a day. The evening slot was killed every day since launch, so the registry
  // stopped promising two; the two-a-day form stays readable because the calendar renders past
  // weeks whose cadence was still 2x-daily.
  if (kind === "article-production") {
    const daily = /^daily@(\d{2}):00$/.exec(cadence);
    if (daily && Number.isInteger(Number(daily[1]))) {
      return [{ hour: Number(daily[1]), kind: "article-am", label: "MMA Files daily article" }];
    }
    const twice = /^2x-daily@(\d{2}):00,(\d{2}):00$/.exec(cadence);
    if (twice && Number.isInteger(Number(twice[1])) && Number.isInteger(Number(twice[2]))) {
      return [
        { hour: Number(twice[1]), kind: "article-am", label: "MMA Files morning article" },
        { hour: Number(twice[2]), kind: "article-pm", label: "MMA Files evening article" }
      ];
    }
  }
  throw new Error(`Unsupported public production schedule: ${kind} ${cadence}`);
}

export async function getPublicCalendarSchedule(): Promise<readonly CalendarDefinition[]> {
  const registry = JSON.parse(await readFile(registryPath(), "utf8")) as RawVentureRegistry;
  if (registry.schemaVersion !== "venture-registry/1" || !Array.isArray(registry.ventures)) {
    throw new Error("Invalid public venture registry");
  }
  const ventureSlots = registry.ventures.flatMap((venture) => [
    ...venture.meetings.map((meeting) => ({
      hour: cadenceHour(meeting.cadence),
      kind: calendarKind(meeting.kind),
      label: meeting.label
    })),
    ...(venture.productionJobs ?? []).flatMap((job) => productionDefinitions(job.kind, job.cadence))
  ]);
  return [...portfolioBoardSlots, ...ventureSlots].sort(
    (left, right) => left.hour - right.hour
  );
}
