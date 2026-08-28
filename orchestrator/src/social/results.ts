import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import {
  SocialAttributionEventSchema,
  SocialMetricObservationSchema,
  socialMetricSnapshotHash,
  type SocialAttributionEvent,
  type SocialMetricObservation
} from "../contracts/social-results.js";
import { atomicWriteJson, readJson, resolveStatePath, withFileLock } from "../state.js";

export const SOCIAL_RESULT_OBSERVATIONS_DIRECTORY = "social/results/observations";
export const SOCIAL_ATTRIBUTION_EVENTS_DIRECTORY = "social/results/attribution";

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type CreateSocialMetricObservationInput = Omit<SocialMetricObservation,
  "schemaVersion" | "id" | "idempotencyHash" | "snapshotHash" | "audienceIdentityExcluded" |
  "privateMessageExcluded" | "rawProviderPayloadExcluded" | "authorityGranted">;

export function createSocialMetricObservation(input: CreateSocialMetricObservationInput): SocialMetricObservation {
  const idempotencyHash = hash({
    profileId: input.profileId,
    connectionId: input.connectionId,
    nativePostId: input.nativePostId,
    maturityWindow: input.maturityWindow,
    observedAt: input.observedAt,
    provider: input.provider,
    correctionOfRef: input.correctionOfRef
  });
  const bounded = {
    ...input,
    schemaVersion: "social-metric-observation/1" as const,
    id: `social-metric-observation-${idempotencyHash.slice(0, 20)}`,
    idempotencyHash,
    audienceIdentityExcluded: true as const,
    privateMessageExcluded: true as const,
    rawProviderPayloadExcluded: true as const,
    authorityGranted: false as const
  };
  return SocialMetricObservationSchema.parse({ ...bounded, snapshotHash: socialMetricSnapshotHash(bounded as Omit<SocialMetricObservation, "snapshotHash">) });
}

async function appendOnly<T>(input: {
  root: string;
  directory: string;
  id: string;
  value: T;
}): Promise<{ value: T; appended: boolean }> {
  return withFileLock(input.root, `${input.directory}/writer.lock`, async () => {
    const relative = `${input.directory}/${input.id}.json`;
    const existing = await readJson<unknown>(input.root, relative, null);
    if (existing !== null) {
      if (JSON.stringify(existing) !== JSON.stringify(input.value)) throw new Error(`Append-only Social Distribution evidence conflict at ${relative}`);
      return { value: input.value, appended: false };
    }
    await atomicWriteJson(input.root, relative, input.value);
    return { value: input.value, appended: true };
  });
}

export async function appendSocialMetricObservation(root: string, value: unknown) {
  const observation = SocialMetricObservationSchema.parse(value);
  return appendOnly({ root, directory: SOCIAL_RESULT_OBSERVATIONS_DIRECTORY, id: observation.id, value: observation });
}

export async function appendSocialAttributionEvent(root: string, value: unknown) {
  const event = SocialAttributionEventSchema.parse(value);
  return appendOnly({ root, directory: SOCIAL_ATTRIBUTION_EVENTS_DIRECTORY, id: event.id, value: event });
}

async function readDirectory<T>(root: string, directory: string, parser: { safeParse(value: unknown): { success: boolean; data?: T } }): Promise<{ accepted: T[]; dropped: number }> {
  let names: string[];
  try {
    names = (await readdir(resolveStatePath(root, directory))).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accepted: [], dropped: 0 };
    throw error;
  }
  const values = await Promise.all(names.slice(0, 10_000).map((name) => readJson<unknown>(root, `${directory}/${name}`, null).catch(() => null)));
  const parsed = values.map((value) => parser.safeParse(value));
  return { accepted: parsed.flatMap((value) => value.success && value.data ? [value.data] : []), dropped: parsed.filter(({ success }) => !success).length };
}

export function readSocialMetricObservations(root: string) {
  return readDirectory(root, SOCIAL_RESULT_OBSERVATIONS_DIRECTORY, SocialMetricObservationSchema);
}

export function readSocialAttributionEvents(root: string) {
  return readDirectory(root, SOCIAL_ATTRIBUTION_EVENTS_DIRECTORY, SocialAttributionEventSchema);
}

export function socialAttributionIdempotencyHash(input: Omit<SocialAttributionEvent, "schemaVersion" | "id" | "idempotencyHash">): string {
  return hash({ source: input.source, eventType: input.eventType, occurredAt: input.occurredAt, destination: input.destination, deduplicationKey: input.deduplicationKey });
}
