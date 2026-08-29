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
    id: string;
    status?: string;
    visibility: "public" | "owner-only";
    meetings: Array<{
      kind: string;
      label: string;
      cadence: string;
      cast: string[];
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

function registryPath(root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")): string {
  return path.join(root, "config", "ventures.json");
}

function calendarKind(value: string): CalendarKind {
  if (value === "cu-edition" || value === "cu-product" || value === "tt-marketing" || value === "gv-brief" || value === "ms-daily" || value === "bh-desk" || value === "dm-desk" || value === "dm-growth" || value === "ts-desk" || value === "incubator-scan" || value === "incubator-synthesis" || value === "mma-intake" || value === "mma-analysis" || value === "mag-editorial" || value === "mag-desk" || value === "kv-desk" || value === "studio") return value;
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

export async function getPublicCalendarSchedule(root?: string): Promise<readonly CalendarDefinition[]> {
  const registry = await getRegistry(root);
  const ventureSlots = registry.ventures
    // A paused venture's rooms will not sit, so its slots come off the public calendar rather
    // than promising meetings the engine refuses.
    .filter((venture) => venture.visibility === "public" && venture.status !== "paused")
    .flatMap((venture) => [
      ...venture.meetings.map((meeting) => ({
        hour: cadenceHour(meeting.cadence),
        kind: calendarKind(meeting.kind),
        label: meeting.label,
        cast: meeting.cast
      })),
      ...(venture.productionJobs ?? []).flatMap((job) => productionDefinitions(job.kind, job.cadence))
    ]);
  return [...portfolioBoardSlots, ...ventureSlots].sort(
    (left, right) => left.hour - right.hour
  );
}

async function getRegistry(root?: string): Promise<RawVentureRegistry> {
  const registry = JSON.parse(await readFile(registryPath(root), "utf8")) as RawVentureRegistry;
  if (registry.schemaVersion !== "venture-registry/1" || !Array.isArray(registry.ventures)) {
    throw new Error("Invalid venture registry");
  }
  return registry;
}

/**
 * Each venture's own rooms, keyed by venture rather than flattened onto the clock.
 *
 * `getPublicCalendarSchedule` above answers "what happens today" and drops the venture id doing
 * it, which is right for a calendar and useless for a board that reads down a venture column.
 * Rather than parse the registry a second time somewhere else, the module that already owns it
 * answers both questions. Owner-only ventures are included here — the launch board shows the
 * Personal Growth desk, and the public calendar deliberately does not.
 */
export async function getVentureMeetingHours(
  root?: string
): Promise<Record<string, Array<{ phase: string; hour: number; label: string }>>> {
  const registry = await getRegistry(root);
  const byVenture: Record<string, Array<{ phase: string; hour: number; label: string }>> = {};
  for (const venture of registry.ventures) {
    const slots = [
      ...venture.meetings.map((meeting) => ({
        phase: meeting.kind,
        hour: cadenceHour(meeting.cadence),
        label: meeting.label
      })),
      // A production job has no label of its own in the registry, so its kind is the label.
      ...(venture.productionJobs ?? []).map((job) => ({
        phase: job.kind,
        hour: cadenceHour(job.cadence),
        label: job.kind
      }))
    ].sort((left, right) => left.hour - right.hour);
    if (slots.length > 0) byVenture[venture.id] = slots;
  }
  return byVenture;
}

export async function getOwnerOnlyVentureIds(root?: string): Promise<ReadonlySet<string>> {
  const registry = await getRegistry(root);
  return new Set(registry.ventures
    .filter((venture) => venture.visibility === "owner-only")
    .map((venture) => venture.id));
}

export async function getOwnerOnlyMeetingKinds(root?: string): Promise<ReadonlySet<string>> {
  const registry = await getRegistry(root);
  return new Set(registry.ventures
    .filter((venture) => venture.visibility === "owner-only")
    .flatMap((venture) => venture.meetings.map((meeting) => meeting.kind)));
}
