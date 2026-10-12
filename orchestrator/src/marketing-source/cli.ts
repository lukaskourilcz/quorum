import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { atomicWriteJson, withFileLock } from "../state.js";
import { repoRoot, stateRoot } from "../paths.js";
import { MarketingCalendarSchema } from "../contracts/marketing-calendar.js";
import { NEWS_FRESHNESS_HOURS, RetractionSchema, retractionPath } from "./producer.js";
import { deliverSources, reconcileSources, retryReconciledSource } from "./outbox.js";

const value = (args: string[], flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const now = new Date();
  if (args[0] === "retry") {
    const key = value(args, "--packet-key");
    if (!key) throw new Error("--packet-key is required");
    await retryReconciledSource(stateRoot, key, now);
    console.log(JSON.stringify({ packetKey: key, status: "retry-staged", recheckRequired: true })); return;
  }
  if (args[0] === "export-calendars") {
    const output = value(args, "--output-dir");
    if (!output) throw new Error("--output-dir is required");
    await mkdir(output, { recursive: true });
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const files = [];
    for (const venture of ["caught-up", "marketingshark"] as const) {
      const relative = `state/marketing-calendar/${venture}.json`;
      const raw = await readFile(path.join(repoRoot, relative), "utf8");
      MarketingCalendarSchema.parse(JSON.parse(raw));
      await writeFile(path.join(output, `${venture}.json`), raw, { flag: "wx" });
      files.push({ venture, path: relative, sourceVersion: "marketing-calendar/1", sourceCommit,
        sha256: createHash("sha256").update(raw).digest("hex") });
    }
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ schemaVersion: "marketing-calendar-export/1", exportedAt: now.toISOString(), files }, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ exported: files.length, output })); return;
  }
  if (args[0] === "retract") {
    const sourceId = value(args, "--source-id"), reason = value(args, "--reason");
    const record = RetractionSchema.parse({ schemaVersion: "marketing-source-retraction/1", sourceId, reason, actor: "owner", retractedAt: now.toISOString() });
    await withFileLock(stateRoot, "marketing-source/.lock", () => atomicWriteJson(stateRoot, retractionPath(record.sourceId), record));
    console.log(JSON.stringify({ sourceId, status: "retracted", reconciliationRequired: true })); return;
  }
  if (args[0] && !["reconcile", "backfill"].includes(args[0])) throw new Error("Expected reconcile, backfill, retry, retract or export-calendars");
  const siteUrl = process.env.CAUGHT_UP_SITE_URL;
  if (!siteUrl) throw new Error("CAUGHT_UP_SITE_URL is required");
  const input = { root: stateRoot, siteUrl, now, freshnessHours: NEWS_FRESHNESS_HOURS };
  const send = args.includes("--send");
  const snapshot = await reconcileSources({ ...input, write: args.includes("--stage") || send });
  if (send) {
    const endpoint = process.env.OWN_DASHBOARD_MARKETING_SOURCE_URL;
    const secret = process.env.DNESKAI_MARKETING_SOURCE_SECRET;
    if (!endpoint || !secret) throw new Error("OwnDashboard source integration is not configured");
    console.log(JSON.stringify({ ...await deliverSources({ ...input, endpoint, secret, enabled: process.env.DNESKAI_MARKETING_SOURCE_ENABLED === "true" }),
      heldArticles: snapshot.held, dropped: snapshot.dropped, noEditionDates: snapshot.noEditionDates }));
  } else console.log(JSON.stringify({ mode: args.includes("--stage") ? "staged" : "dry-run", ...snapshot }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => {
  console.error("Source bridge refused the operation; check configuration and authoritative records. No social post was sent."); process.exitCode = 1;
});
