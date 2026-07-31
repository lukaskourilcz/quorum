import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getPublicIdeas } from "@/lib/idea-ledger";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicStandups } from "@/lib/standup-records";

export interface PublicDeliveryReceipt {
  date: string;
  deliveredAt: string;
  targetCommit?: string;
  built: { status: "passed" | "failed" | "not-recorded"; checkedAt?: string };
  live: { status: "passed" | "failed" | "not-recorded"; checkedAt?: string };
}

function repoRoot() {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function check(value: unknown): PublicDeliveryReceipt["built"] {
  const record = object(value);
  const status = record?.status === "passed" || record?.status === "failed" ? record.status : "not-recorded";
  const checkedAt = typeof record?.checkedAt === "string" && !Number.isNaN(Date.parse(record.checkedAt)) ? record.checkedAt : undefined;
  return { status, ...(checkedAt ? { checkedAt } : {}) };
}

async function getDeliveryReceipts(): Promise<PublicDeliveryReceipt[]> {
  const directory = path.join(repoRoot(), "state", "edition", "deliveries");
  let names: string[] = [];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const receipts: PublicDeliveryReceipt[] = [];
  for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
    try {
      const record = object(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      const checks = object(record?.checks);
      if (record?.status !== "delivered" || typeof record.date !== "string" || typeof record.deliveredAt !== "string" || Number.isNaN(Date.parse(record.deliveredAt))) continue;
      receipts.push({
        date: record.date,
        deliveredAt: record.deliveredAt,
        ...(typeof record.targetCommit === "string" ? { targetCommit: record.targetCommit } : {}),
        built: check(checks?.built),
        live: check(checks?.live)
      });
    } catch {
      // A malformed receipt cannot become a public release claim.
    }
  }
  return receipts.sort((left, right) => right.date.localeCompare(left.date));
}

export async function getCaughtUpPublicSnapshot() {
  const [meetings, standups, ideas, deliveries] = await Promise.all([
    getPublicMeetingRecords(),
    getPublicStandups(),
    getPublicIdeas(),
    getDeliveryReceipts()
  ]);
  const editions = meetings.filter((meeting) => meeting.kind === "cu-edition").slice(0, 7);
  return {
    deliveries,
    editions,
    ideas: ideas.map((idea) => ({
      ...idea,
      ventureVerdict: standups.find((standup) => standup.caughtUpIdeaRef === idea.id),
      productVerdict: meetings
        .filter((meeting) => meeting.kind === "cu-product")
        .flatMap((meeting) => meeting.ideaVerdicts.map((verdict) => ({ meeting, verdict })))
        .find((item) => item.verdict.ideaId === idea.id)
    }))
  };
}
