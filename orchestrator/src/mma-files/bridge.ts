import path from "node:path";
import { loadMeetingRecords } from "../meetings/calendar.js";
import { atomicWriteText, readText } from "../state.js";

export interface BridgeInsight {
  direction: "fightaiq-to-magazine" | "magazine-to-fightaiq";
  text: string;
  evidenceRef: string;
}

const evidenceSuffix = /\s\[source:[^\]\r\n]+\]$/u;

export function validateBridge(raw: string): string[] {
  const violations: string[] = [];
  const tokens = raw.trim().split(/\s+/u).filter(Boolean).length;
  if (tokens > 1_000) violations.push(`bridge exceeds 1000 tokens: ${tokens}`);
  for (const [index, line] of raw.split(/\r?\n/u).entries()) {
    if (!line.trim() || /^#{1,6}\s/u.test(line)) continue;
    if (!evidenceSuffix.test(line)) violations.push(`line ${index + 1} has no evidence reference`);
  }
  return violations;
}

export function composeBridge(date: string, insights: readonly BridgeInsight[]): string {
  const lines = [
    "# MMA portfolio bridge",
    "",
    ...insights.map((insight) =>
      `- ${insight.direction === "fightaiq-to-magazine" ? "For the magazine" : "For FightAIQ"}: ${insight.text.trim()} [source:${insight.evidenceRef}]`
    )
  ];
  if (insights.length === 0) lines.push(`- No crossed insight cleared the evidence bar on ${date}. [source:bridge-empty:${date}]`);
  const output = `${lines.join("\n")}\n`;
  const violations = validateBridge(output);
  if (violations.length) throw new Error(`Invalid MMA bridge: ${violations.join("; ")}`);
  return output;
}

export function bridgeEvidenceRefs(raw: string): string[] {
  return [...new Set([...raw.matchAll(/\[source:([^\]\r\n]+)\]/gu)].map((match) => match[1]!))];
}

export async function refreshMmaBridge(root: string, date: string): Promise<string> {
  const records = (await loadMeetingRecords(root))
    .filter((record) => ["mma-intake", "mma-analysis", "mag-editorial", "mag-desk"].includes(record.kind))
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  const latestFightAiQ = records.find((record) => record.kind === "mma-intake" || record.kind === "mma-analysis");
  const latestMagazine = records.find((record) => record.kind === "mag-editorial" || record.kind === "mag-desk");
  const insights: BridgeInsight[] = [];
  if (latestFightAiQ) insights.push({
    direction: "fightaiq-to-magazine",
    text: latestFightAiQ.decision.summary,
    evidenceRef: `meeting:${latestFightAiQ.date}-${latestFightAiQ.kind}`
  });
  if (latestMagazine) insights.push({
    direction: "magazine-to-fightaiq",
    text: latestMagazine.decision.summary,
    evidenceRef: `meeting:${latestMagazine.date}-${latestMagazine.kind}`
  });
  const output = composeBridge(date, insights);
  await atomicWriteText(root, "mma/BRIDGE.md", output);
  return output;
}

export async function readMmaBridge(root: string): Promise<string> {
  return readText(root, path.join("mma", "BRIDGE.md"));
}
