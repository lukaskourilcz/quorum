import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingSharkQotdSchema } from "../src/contracts/marketingshark-qotd.js";
import { configRoot, repoRoot } from "../src/paths.js";
import { assertQueueItemPublishable, CapabilityAwareQueueItemSchema } from "../src/social/queue.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";
import { loadQuestionBankSnapshot, type NormalizedQuestion, type QuestionBankSnapshot } from "../src/ventures/marketingshark/bank.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER, type MarketingSharkLedger } from "../src/ventures/marketingshark/ledger.js";
import {
  draftQotd,
  qotdEligible,
  qotdLink,
  qotdPackagePath,
  qotdPostText,
  qotdQueueItemPath,
  qotdReplyText,
  selectQotdQuestion
} from "../src/ventures/marketingshark/qotd.js";
import { marketingSharkCapabilityRef } from "../src/ventures/marketingshark/queue.js";

// quorum#592: devShark's Threads code question of the day, a text post drafted by code at $0.

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ms-qotd-"));
  roots.push(root);
  return root;
}

async function devshark(): Promise<Brand> {
  return enabledBrands(await loadMarketingSharkConfig())[0]!;
}

let bank: QuestionBankSnapshot | null = null;
async function snapshot(): Promise<QuestionBankSnapshot> {
  bank ??= await loadQuestionBankSnapshot((await devshark()).questionBank.snapshotPath, repoRoot);
  return bank;
}

function question(overrides: Omit<Partial<NormalizedQuestion>, "en"> & { en?: Partial<NormalizedQuestion["en"]> } = {}): NormalizedQuestion {
  const { en, ...rest } = overrides;
  return {
    id: "q-1",
    category: "javascript",
    difficulty: 2,
    importance: null,
    hasCode: false,
    correctIndex: 1,
    en: {
      introduction: "",
      question: "Which method returns a new array with the results of calling a function on every element?",
      options: ["forEach", "map", "reduce", "find"],
      explanation: "map returns a new array of the callback's results; forEach returns undefined.",
      ...en
    },
    ...rest
  };
}

async function capability() {
  return marketingSharkCapabilityRef(await loadVentureCapabilityMap(configRoot));
}

describe("the question of the day's copy", () => {
  it("is the question and lettered options with no link, and the answer with the tracked link in the reply", async () => {
    const brand = await devshark();
    const link = qotdLink(brand, brand.qotd!, "2026-11-05");
    expect(link).toBe("https://devshark.app/?utm_source=threads&utm_medium=reply&utm_campaign=qotd&utm_content=2026-11-05");
    const post = qotdPostText(question());
    expect(post).toContain("Code question of the day · JavaScript");
    expect(post).toContain("A) forEach\nB) map\nC) reduce\nD) find");
    expect(post).not.toMatch(/https?:\/\//u);
    const reply = qotdReplyText(question(), link);
    expect(reply.startsWith("Answer: B) map")).toBe(true);
    expect(reply).toContain(link);
    expect(reply.length).toBeLessThanOrEqual(500);
  });

  it("clips a long explanation to whole words and keeps the reply inside Threads' 500 characters", async () => {
    const brand = await devshark();
    const link = qotdLink(brand, brand.qotd!, "2026-11-05");
    const reply = qotdReplyText(question({ en: { explanation: "word ".repeat(300) } }), link);
    expect(reply.length).toBeLessThanOrEqual(500);
    expect(reply).toContain("…");
  });

  it("refuses code, missing letters and over-long posts", async () => {
    const brand = await devshark();
    const link = qotdLink(brand, brand.qotd!, "2026-11-05");
    expect(qotdEligible(question(), link)).toBe(true);
    expect(qotdEligible(question({ hasCode: true }), link)).toBe(false);
    expect(qotdEligible(question({ en: { question: "What does this print?\n```js\nconsole.log(1)\n```" } }), link)).toBe(false);
    expect(qotdEligible(question({ en: { options: ["a", "b", "c", "d", "e", "f", "g"] } }), link)).toBe(false);
    expect(qotdEligible(question({ en: { question: "x".repeat(480) } }), link)).toBe(false);
  });
});

describe("the pick", () => {
  it("is deterministic, eligible, and skips what the carousel and earlier days served", async () => {
    const brand = await devshark();
    const link = qotdLink(brand, brand.qotd!, "2026-11-05");
    const bankSnapshot = await snapshot();
    const first = selectQotdQuestion({ snapshot: bankSnapshot, link, servedByQotd: new Set(), servedByCarousel: new Set() })!;
    expect(first).not.toBeNull();
    expect(qotdEligible(first, link)).toBe(true);
    expect(selectQotdQuestion({ snapshot: bankSnapshot, link, servedByQotd: new Set(), servedByCarousel: new Set() })!.id).toBe(first.id);
    const afterQotd = selectQotdQuestion({ snapshot: bankSnapshot, link, servedByQotd: new Set([first.id]), servedByCarousel: new Set() })!;
    expect(afterQotd.id).not.toBe(first.id);
    const afterCarousel = selectQotdQuestion({ snapshot: bankSnapshot, link, servedByQotd: new Set(), servedByCarousel: new Set([first.id]) })!;
    expect(afterCarousel.id).toBe(afterQotd.id);
  });
});

describe("the day's draft", () => {
  it("writes the package and one text-only Threads draft that cannot publish, then does nothing on a rerun", async () => {
    const brand = await devshark();
    const root = await tempRoot();
    const capabilityRef = await capability();
    expect(capabilityRef).not.toBeNull();
    const run = () => draftQotd({
      brand, date: "2026-11-05", root, now: new Date("2026-11-05T06:00:00.000Z"),
      loadSnapshot: snapshot, carouselLedger: EMPTY_LEDGER, capabilityRef
    });
    const first = await run();
    expect(first.outcome.status).toBe("drafted");
    expect(first.artifacts).toEqual([qotdPackagePath("2026-11-05", "devshark"), qotdQueueItemPath("2026-11-05", "devshark")]);

    const built = MarketingSharkQotdSchema.parse(JSON.parse(await readFile(path.join(root, qotdPackagePath("2026-11-05", "devshark")), "utf8")));
    // 09:00 in Prague on 5 November is 08:00 UTC (CET).
    expect(built.publishWindow).toMatchObject({ prague: "09:00", notBefore: "2026-11-05T08:00:00.000Z", notAfter: "2026-11-05T22:00:00.000Z" });
    expect(built.spendUsd).toBe(0);
    expect(built.firstReply.text).toContain(built.firstReply.link);

    const item = CapabilityAwareQueueItemSchema.parse(JSON.parse(await readFile(path.join(root, qotdQueueItemPath("2026-11-05", "devshark")), "utf8")));
    expect(item).toMatchObject({
      id: "ms-2026-11-05-devshark-en-threads-qotd",
      channel: "threads",
      status: "draft",
      target: { profileId: "social-profile-devshark-threads" },
      content: { text: built.post.text, assetPaths: [], factualClaimRefs: [`marketingshark:qotd:${built.question.id}`] },
      sourcePackage: { artifactRef: "state/ventures/marketingshark/qotd/2026-11-05/devshark.json" },
      utm: { source: "threads", campaign: "qotd" }
    });
    expect(Object.values(item.checks).every((state) => state === "pending")).toBe(true);
    expect(() => assertQueueItemPublishable(item)).toThrow(/not queued/u);

    const again = await run();
    expect(again).toEqual({ outcome: { status: "already-served", brandId: "devshark", questionId: built.question.id, packagePath: `state/${qotdPackagePath("2026-11-05", "devshark")}` }, artifacts: [] });
  });

  it("does not repeat yesterday's question or the carousel's", async () => {
    const brand = await devshark();
    const root = await tempRoot();
    const capabilityRef = await capability();
    const day = (date: string, carouselLedger: MarketingSharkLedger) => draftQotd({
      brand, date, root, now: new Date(`${date}T06:00:00.000Z`), loadSnapshot: snapshot, carouselLedger, capabilityRef
    });
    const one = await day("2026-11-05", EMPTY_LEDGER);
    const two = await day("2026-11-06", EMPTY_LEDGER);
    expect(one.outcome.status === "drafted" && two.outcome.status === "drafted").toBe(true);
    const ids = [one, two].map((result) => (result.outcome.status === "drafted" ? result.outcome.questionId : ""));
    expect(new Set(ids).size).toBe(2);
  });

  it("writes the package but no queue item when the capability edge is closed, and names a missing bank", async () => {
    const brand = await devshark();
    const root = await tempRoot();
    const closed = await draftQotd({
      brand, date: "2026-11-05", root, now: new Date(), loadSnapshot: snapshot, carouselLedger: EMPTY_LEDGER, capabilityRef: null
    });
    expect(closed.artifacts).toEqual([qotdPackagePath("2026-11-05", "devshark")]);
    const missing = await draftQotd({
      brand, date: "2026-11-06", root, now: new Date(), carouselLedger: EMPTY_LEDGER, capabilityRef: null,
      loadSnapshot: async () => { throw new Error("no snapshot"); }
    });
    expect(missing.outcome).toMatchObject({ status: "skipped", reason: expect.stringContaining("no snapshot") });
    const disabled = await draftQotd({
      brand: { ...brand, qotd: { ...brand.qotd!, enabled: false } }, date: "2026-11-07", root, now: new Date(),
      loadSnapshot: snapshot, carouselLedger: EMPTY_LEDGER, capabilityRef: null
    });
    expect(disabled.outcome.status).toBe("skipped");
    expect(disabled.artifacts).toEqual([]);
  });
});
