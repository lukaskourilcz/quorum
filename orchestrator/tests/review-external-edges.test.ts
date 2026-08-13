import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  APIFY_MONTHLY_CREDIT_USD,
  APIFY_RUN_RESERVATION_USD,
  MMA_APIFY_MONTHLY_SHARE_USD,
  MMA_APIFY_RUN_RESERVATION_USD,
  emptyApifyQuota,
  emptyKvorumApifyQuota,
  emptyMmaApifyQuota,
  loadGoViralSourceRegistry,
  mayRunApify,
  mayRunKvorumApify,
  mayRunMmaApify
} from "../src/sources/apify.js";
import { plannedRecipeSteps } from "../src/sources/goviral-trends.js";
import { QueueItemSchema } from "../src/social/queue.js";
import { openLocalCloneDoorMoneyKnowledgeStore } from "../src/ventures/door-money/kb.js";

const NEW_VENTURES = ["booksofhistory", "door-money", "kvorum", "tehdejsi-svet"] as const;

async function text(relative: string): Promise<string> {
  return readFile(path.join(repoRoot, relative), "utf8");
}

function workflowStep(source: string, start: string, end: string): string {
  const from = source.indexOf(`      - name: ${start}`);
  const to = source.indexOf(`\n      - name: ${end}`, from + 1);
  expect(from, `${start} is missing`).toBeGreaterThan(-1);
  expect(to, `${end} is missing after ${start}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

async function filesUnder(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

describe("REV-11 external edges", () => {
  it("keeps the two delivery installations and package kinds isolated", async () => {
    const cycle = await text(".github/workflows/cycle.yml");
    const doctor = await text(".github/workflows/delivery-doctor.yml");
    const caughtUp = workflowStep(cycle, "Mint bounded aifirst installation token", "Select pending MMA Files delivery");
    const mma = workflowStep(cycle, "Mint bounded MMA Files installation token", "Verify MMA Files production article");

    expect(caughtUp.match(/^\s+repositories: aifirst$/gmu)).toHaveLength(2);
    expect(caughtUp).not.toContain("repositories: mma-files");
    expect(caughtUp).toContain("lukaskourilcz/aifirst.git");
    expect(caughtUp).toContain("^public/data/board/${PACKAGE_DATE}\\.json$");
    expect(caughtUp).toContain("^data/(ai-facts|ai-lessons)\\.json$");
    expect(caughtUp).toContain("grep -Ev \"$allowed\"");

    expect(mma.match(/^\s+repositories: mma-files$/gmu)).toHaveLength(1);
    expect(mma).not.toContain("repositories: aifirst");
    expect(mma).toContain("lukaskourilcz/mma-files.git");
    expect(mma).toContain("^data/boardless/fightaiq\\.json$");
    expect(mma).toContain("^src/data/mma-facts\\.json$");
    expect(mma).toContain("^((data/boardless/ads\\.json)|(public/ads/[a-z0-9-]+-\\d+x\\d+\\.webp))$");
    expect(mma).toContain("grep -Ev \"$allowed\"");

    for (const venture of NEW_VENTURES) {
      expect(caughtUp, `${venture} entered the aifirst delivery block`).not.toContain(venture);
      expect(mma, `${venture} entered the mma-files delivery block`).not.toContain(venture);
    }
    expect(doctor.match(/^\s+repositories: aifirst$/gmu)).toHaveLength(1);
    expect(doctor.match(/^\s+repositories: mma-files$/gmu)).toHaveLength(1);
    expect(doctor).toContain("Read-only. It mints the same bounded token");
  });

  it("keeps the Tehdejsi facts copy offline and shows its exact age in admin", async () => {
    const founding = await text("state/decisions/2026-08-12-tehdejsi-svet-founding.md");
    const boundary = await text("orchestrator/tests/tehdejsi-svet-no-product-link.test.ts");
    const panel = await text("site/src/components/admin/tehdejsi-svet-library-panel.tsx");
    const panelTest = await text("site/src/components/admin/tehdejsi-svet-library-panel.test.tsx");

    expect(founding).toContain("There is no link to the product repository at all");
    expect(boundary).toContain("names it nowhere that runs");
    expect(panel).toContain("Date.parse(now) - Date.parse(snapshot.facts.copiedAt)");
    expect(panel).toContain("day{ageDays === 1 ? \"\" : \"s\"} old");
    expect(panelTest).toContain('expect(html).toContain("8 days old")');
    expect(panelTest).toContain("Product drift is not measured automatically");
  });

  it("uses only the owner-provided Door Money private clone and fails closed without it", async () => {
    const founding = await text("state/decisions/2026-08-12-door-money-founding.md");
    const allowlist = await text("config/network-allowlist.json");

    expect(openLocalCloneDoorMoneyKnowledgeStore({
      privateRoot: undefined,
      repositoryRoot: repoRoot
    })).toBeNull();
    expect(() => openLocalCloneDoorMoneyKnowledgeStore({
      privateRoot: path.join(repoRoot, "state", "ventures", "door-money"),
      repositoryRoot: repoRoot
    })).toThrow(/outside the public repository/u);
    expect(founding).toMatch(/No database\s+hostname was added to the network allowlist/u);
    expect(founding).toContain("BOOK_PRIVATE_CLONE_PATH");
    expect(allowlist).not.toMatch(/supabase|book[_-]?db/iu);
  });

  it("reserves every Apify tenant and degrades before crossing a local or shared ceiling", async () => {
    const now = new Date("2026-08-13T09:00:00.000Z");
    const goViral = emptyApifyQuota("2026-08", now);
    const mma = emptyMmaApifyQuota("2026-08", now);
    const kvorum = emptyKvorumApifyQuota("2026-08", now);

    expect(APIFY_MONTHLY_CREDIT_USD).toBe(5);
    expect(APIFY_RUN_RESERVATION_USD).toBe(1.4);
    expect(MMA_APIFY_MONTHLY_SHARE_USD).toBe(3);
    expect(MMA_APIFY_RUN_RESERVATION_USD).toBe(0.75);
    expect(kvorum).toMatchObject({ shareCapUsd: 2, reservedPerRun: 0.151 });
    expect(mayRunApify({
      ...goViral,
      estimatedUsedUsd: APIFY_MONTHLY_CREDIT_USD - APIFY_RUN_RESERVATION_USD + 0.001
    }, "fixture-token").allowed).toBe(false);
    expect(mayRunMmaApify({
      quota: mma,
      approvals: { account: true, sources: true },
      token: "fixture-token",
      sharedAccountUsedUsd: APIFY_MONTHLY_CREDIT_USD - MMA_APIFY_RUN_RESERVATION_USD + 0.001
    }).allowed).toBe(false);
    expect(mayRunKvorumApify({
      quota: kvorum,
      approvals: { account: true, scope: true },
      authority: { founding: true, budgetCapacity: true },
      token: "fixture-token",
      sharedAccountUsedUsd: APIFY_MONTHLY_CREDIT_USD - kvorum.reservedPerRun + 0.001
    }).allowed).toBe(false);

    const registry = await loadGoViralSourceRegistry();
    const full = plannedRecipeSteps({ registry, remainingUsd: 5, isFirstScoutOfMonth: true });
    const degraded = plannedRecipeSteps({ registry, remainingUsd: 0.3, isFirstScoutOfMonth: true });
    expect(degraded.length).toBeGreaterThan(0);
    expect(degraded.length).toBeLessThan(full.length);
  });

  it("keeps all four new ventures outside the publisher and both supreme stops above execution", async () => {
    const fixture = JSON.parse(await text("state/social/queue/2026-08-05-cs-threads.json")) as Record<string, unknown>;
    for (const venture of NEW_VENTURES) {
      expect(QueueItemSchema.safeParse({ ...fixture, venture }).success, venture).toBe(false);
    }

    const cycle = await text(".github/workflows/cycle.yml");
    const social = await text(".github/workflows/social-publisher.yml");
    expect(cycle).toContain("if: ${{ vars.AUTONOMY_KILL_SWITCH != 'true' }}");
    expect(social).toContain("if: ${{ github.event_name != 'schedule' || vars.SOCIAL_KILL_SWITCH != 'true' }}");
    expect(social).toContain("SOCIAL_KILL_SWITCH: ${{ vars.SOCIAL_KILL_SWITCH }}");
  });

  it("finds no recognizable credential material in new-venture records, logs or public assets", async () => {
    const roots = [
      ...NEW_VENTURES.map((venture) => path.join(repoRoot, "state", "ventures", venture)),
      path.join(repoRoot, "state", "meetings"),
      path.join(repoRoot, "site", "public")
    ];
    const files = (await Promise.all(roots.map(filesUnder))).flat();
    const credential = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bapify_api_[A-Za-z0-9]{20,}\b|\bsk-ant-[A-Za-z0-9_-]{20,}\b|\bsk-[A-Za-z0-9]{32,}\b)/u;
    const offenders: string[] = [];
    for (const file of files) {
      if (credential.test(await readFile(file, "utf8").catch(() => ""))) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
