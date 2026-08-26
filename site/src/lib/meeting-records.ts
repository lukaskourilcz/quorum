import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { meetingFixtures } from "@/data/meeting-fixtures";
import {
  parsePublicMeetingRecord,
  type PublicMeetingRecord
} from "@/lib/meeting-record-model";
import { getOwnerOnlyMeetingKinds } from "@/lib/venture-registry";

function meetingsRoot() {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state", "meetings");
}

export async function getPublicMeetingRecords(): Promise<readonly PublicMeetingRecord[]> {
  const ownerOnlyKinds = await getOwnerOnlyMeetingKinds();
  let names: string[] = [];
  try {
    names = await readdir(meetingsRoot());
  } catch {
    // The public fixtures below keep the static routes testable before first live run.
  }
  const live = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    try {
      return parsePublicMeetingRecord(JSON.parse(await readFile(path.join(meetingsRoot(), name), "utf8")));
    } catch {
      return null;
    }
  }));
  const records = live.filter((record): record is PublicMeetingRecord =>
    record !== null && !ownerOnlyKinds.has(record.kind));
  const fallbacks = meetingFixtures
    .map(parsePublicMeetingRecord)
    .filter((record): record is PublicMeetingRecord => Boolean(record))
    .filter((record) => !ownerOnlyKinds.has(record.kind))
    .filter((fixture) => !records.some((record) => record.id === fixture.id));
  return [...records, ...fallbacks].sort(
    (left, right) => Date.parse(right.roomTranscript.openedAt) - Date.parse(left.roomTranscript.openedAt)
  );
}

export async function getPublicMeetingRecord(id: string): Promise<PublicMeetingRecord | undefined> {
  return (await getPublicMeetingRecords()).find((record) => record.id === id);
}
