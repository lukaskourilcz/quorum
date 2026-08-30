import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ContestSocialPilotReceiptSchema,
  SocialContestLeadSchema
} from "../src/contracts/contest-radar.js";
import { configRoot, repoRoot } from "../src/paths.js";
import {
  buildContestSocialPilotReceipt,
  buildSocialContestLead,
  decideLaneVerdict,
  loadContestSocialPilotConfig,
  mayRunContestSocialPilotLane,
  runSocialPilotLane,
  type ContestSocialPilotConfig,
  type RawSocialItem
} from "../src/ventures/contest-radar/social-pilot.js";
import {
  contestReadinessForLead,
  intakeSocialContestLeads,
  socialLeadSourceId
} from "../src/ventures/contest-radar/social-leads.js";

const now = new Date("2026-08-30T12:00:00.000Z");

interface Fixture {
  collectionRef: string;
  itemsByQuery: Record<string, RawSocialItem[]>;
}

async function fixture(platform: "instagram" | "tiktok"): Promise<Fixture> {
  return JSON.parse(await readFile(
    path.join(repoRoot, `orchestrator/tests/fixtures/contest-radar/social-pilot-${platform}.json`),
    "utf8"
  )) as Fixture;
}

function laneOf(config: ContestSocialPilotConfig, platform: "instagram" | "tiktok") {
  const lane = config.lanes.find((entry) => entry.platform === platform);
  if (!lane) throw new Error(`No ${platform} lane is configured`);
  return lane;
}

const heldGate = {
  allowed: false,
  heldReasons: ["The lane is disabled."],
  authority: { capacityDecisionRef: null, ownerSourceAuthorityRef: null, quotaReservationRef: null }
} as const;

describe("contest radar social pilot — configuration and scope", () => {
  it("ships both lanes disabled with a reason, inside one ceiling", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    expect(config.lanes.map((lane) => lane.platform).sort()).toEqual(["instagram", "tiktok"]);
    expect(config.lanes.every((lane) => !lane.enabled)).toBe(true);
    expect(config.lanes.every((lane) => lane.heldReason.length > 0)).toBe(true);
    expect(config.collectionOwner).toBe("goviral");
    expect(config.lanes.reduce((total, lane) => total + lane.maxCostUsd, 0))
      .toBeLessThanOrEqual(config.ceilingUsd);
  });

  it("cannot express a Facebook lane at all", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const withFacebook = {
      ...config,
      lanes: [...config.lanes, { ...laneOf(config, "tiktok"), platform: "facebook" }]
    };
    const { ContestSocialPilotConfigSchema } = await import("../src/ventures/contest-radar/social-pilot.js");
    expect(ContestSocialPilotConfigSchema.safeParse(withFacebook).success).toBe(false);
    expect(config.excludedPlatforms).toEqual(["facebook"]);
  });

  it("mentions Facebook only where it is being excluded", async () => {
    const files = [
      "config/contest-radar-social-pilot.json",
      "orchestrator/src/contracts/contest-radar.ts",
      "orchestrator/src/ventures/contest-radar/social-pilot.ts",
      "orchestrator/src/ventures/contest-radar/social-leads.ts",
      "orchestrator/tests/fixtures/contest-radar/social-pilot-instagram.json",
      "orchestrator/tests/fixtures/contest-radar/social-pilot-tiktok.json"
    ];
    const offending: string[] = [];
    for (const file of files) {
      const lines = (await readFile(path.join(repoRoot, file), "utf8")).split("\n");
      for (const [index, line] of lines.entries()) {
        if (!/facebook/iu.test(line)) continue;
        // A mention is allowed only where its immediate neighbourhood is what excludes it. A lane
        // platform, a query term or a fixture caption naming Facebook has no such neighbourhood
        // and fails here.
        const context = lines.slice(Math.max(0, index - 3), index + 4).join(" ");
        if (!/exclu|absent|out of scope/iu.test(context)) offending.push(`${file}:${index + 1}`);
      }
    }
    expect(offending).toEqual([]);
  });
});

describe("contest radar social pilot — the gate", () => {
  it("refuses on every unmet condition at once, not the first", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const gate = await mayRunContestSocialPilotLane({
      lane: laneOf(config, "instagram"),
      stateRoot: path.join(repoRoot, "state"),
      month: "2026-08",
      env: {},
      repoRoot
    });
    expect(gate.allowed).toBe(false);
    expect(gate.heldReasons.length).toBeGreaterThanOrEqual(4);
    expect(gate.heldReasons.some((reason) => reason.includes("disabled"))).toBe(true);
    expect(gate.heldReasons.some((reason) => reason.includes("capacity decision"))).toBe(true);
    expect(gate.heldReasons.some((reason) => reason.includes("quota"))).toBe(true);
    expect(gate.heldReasons.some((reason) => reason.includes("owner source authority"))).toBe(true);
    expect(gate.authority).toEqual({
      capacityDecisionRef: null,
      ownerSourceAuthorityRef: null,
      quotaReservationRef: null
    });
  });

  it("still refuses when the lane is switched on, because the money and the actors are not ours to grant", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const gate = await mayRunContestSocialPilotLane({
      lane: { ...laneOf(config, "tiktok"), enabled: true },
      stateRoot: path.join(repoRoot, "state"),
      month: "2026-08",
      env: { CONTEST_RADAR_APIFY_ENABLED: "true", APIFY_TOKEN: "present" },
      repoRoot,
      quotaReservationRef: "state/ventures/goviral/quota/2026-08.json"
    });
    expect(gate.allowed).toBe(false);
    expect(gate.heldReasons.some((reason) => reason.includes("capacity decision"))).toBe(true);
    expect(gate.heldReasons.some((reason) => reason.includes("owner source authority"))).toBe(true);
  });
});

describe("contest radar social pilot — reading a lane", () => {
  it("classifies useful, terminal, noisy, duplicate and malformed items", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const data = await fixture("instagram");
    const run = runSocialPilotLane({
      lane: laneOf(config, "instagram"),
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate: { ...heldGate, allowed: true, heldReasons: [] }
    });

    expect(run.lane.fetched).toBe(6);
    expect(run.lane.contestLike).toBe(3);
    expect(run.lane.unique).toBe(2);
    expect(run.lane.duplicates).toBe(1);
    expect(run.lane.expired).toBe(1);
    expect(run.lane.announcement).toBe(1);
    expect(run.lane.noise).toBe(1);
    expect(run.lane.malformed).toBe(1);
    expect(run.lane.costUsd).toBe(0);
    expect(run.lane.costPerUniqueUsd).toBe(0);
    for (const lead of run.leads) expect(SocialContestLeadSchema.safeParse(lead).success).toBe(true);
  });

  it("costs a lane one query when an actor fails, and the rest still reads", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const data = await fixture("tiktok");
    const run = runSocialPilotLane({
      lane: laneOf(config, "tiktok"),
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate: { ...heldGate, allowed: true, heldReasons: [] },
      failedQueryIds: ["tt-sk-sutaz"]
    });
    expect(run.lane.actorFailures).toBe(1);
    expect(run.lane.failureRate).toBeCloseTo(1 / 3, 6);
    expect(run.lane.fetched).toBe(3);
    expect(run.lane.unique).toBe(1);
    expect(run.lane.outcome).toBe("ran");
  });

  it("carries no author, handle, follower or comment field on any lead", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const data = await fixture("instagram");
    const run = runSocialPilotLane({
      lane: laneOf(config, "instagram"),
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate: { ...heldGate, allowed: true, heldReasons: [] }
    });
    const forbidden = ["author", "handle", "username", "followers", "commenters", "likers", "media", "cookie", "session"];
    for (const lead of run.leads) {
      const keys = JSON.stringify(Object.keys(lead)).toLowerCase();
      for (const name of forbidden) expect(keys.includes(name)).toBe(false);
    }
  });

  it("refuses a lead that claims to state a fact it could not read", () => {
    const lead = buildSocialContestLead({
      item: { url: "https://www.tiktok.com/@fixture/video/7000000000000000009", caption: "Soutěž o knihu, uzávěrka: 9. 9." },
      platform: "tiktok",
      queryId: "tt-cs-soutez",
      collectionRef: "state/ventures/goviral/collections/2026-08-30-tiktok.json",
      terminalHints: [],
      noiseHints: [],
      leadTtlDays: 14,
      now
    });
    expect(lead.status).toBe("accepted");
    expect(lead.stated.deadlineText).not.toBeNull();
    expect(SocialContestLeadSchema.safeParse({ ...lead, status: "malformed" }).success).toBe(false);
    expect(SocialContestLeadSchema.safeParse({ ...lead, leadId: "0".repeat(64) }).success).toBe(false);
  });
});

describe("contest radar social pilot — the bridge into Contest Radar", () => {
  it("keeps a lead lead-only: no rules URL, no deadline hint, never entry-ready", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const data = await fixture("instagram");
    const run = runSocialPilotLane({
      lane: laneOf(config, "instagram"),
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate: { ...heldGate, allowed: true, heldReasons: [] }
    });
    const intake = intakeSocialContestLeads({ leads: run.leads, now });

    expect(intake.candidates.length).toBe(2);
    for (const candidate of intake.candidates) {
      expect(candidate.rulesUrl).toBeNull();
      expect(candidate.hints.deadlineText).toBeNull();
      expect(candidate.hints.prizeText).toBeNull();
      expect(candidate.organizer).toBeNull();
      expect(candidate.sourceId).toBe(socialLeadSourceId("instagram"));
    }
    expect(contestReadinessForLead()).toBe("needs-detail");
  });

  it("drops a lead the free structured sources already carry", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const data = await fixture("instagram");
    const run = runSocialPilotLane({
      lane: laneOf(config, "instagram"),
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate: { ...heldGate, allowed: true, heldReasons: [] }
    });
    const intake = intakeSocialContestLeads({
      leads: run.leads,
      records: [{
        canonicalUrl: "https://priklad-kavovar.cz/pravidla-souteze",
        sourceRefs: [{
          sourceId: "chcemesoutezit-cz",
          sourceItemId: "4711",
          listingUrl: "https://www.chcemesoutezit.cz/soutez-o-kavu"
        }]
      }],
      now
    });
    expect(intake.duplicates).toBeGreaterThanOrEqual(1);
    expect(intake.candidates.some((candidate) => candidate.targetUrl === "https://priklad-kavovar.cz/pravidla-souteze"))
      .toBe(false);
  });

  it("consumes nothing that is not accepted", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const data = await fixture("tiktok");
    const run = runSocialPilotLane({
      lane: laneOf(config, "tiktok"),
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate: { ...heldGate, allowed: true, heldReasons: [] }
    });
    const intake = intakeSocialContestLeads({ leads: run.leads, now });
    expect(intake.skipped.length).toBe(run.leads.filter((lead) => lead.status !== "accepted").length);
    expect(intake.candidates.every((candidate) => candidate.sourceId === socialLeadSourceId("tiktok"))).toBe(true);
  });
});

describe("contest radar social pilot — verdicts and the receipt", () => {
  it("decides each lane on its own evidence", () => {
    expect(decideLaneVerdict({ unique: 0, entryReady: 0, fetched: 40, costUsd: 0.02, ran: true }).verdict)
      .toBe("disable");
    expect(decideLaneVerdict({ unique: 4, entryReady: 0, fetched: 40, costUsd: 0.02, ran: true }).verdict)
      .toBe("undecided");
    expect(decideLaneVerdict({ unique: 4, entryReady: 2, fetched: 40, costUsd: 0.02, ran: true }).verdict)
      .toBe("retain");
    expect(decideLaneVerdict({ unique: 0, entryReady: 0, fetched: 0, costUsd: 0, ran: false }).verdict)
      .toBe("undecided");
  });

  it("writes a held, zero-cost fixture receipt with every reason on it", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const stateRoot = path.join(repoRoot, "state");
    const lanes = [];
    const gates = [];
    for (const laneConfig of config.lanes) {
      const gate = await mayRunContestSocialPilotLane({
        lane: laneConfig, stateRoot, month: "2026-08", env: {}, repoRoot
      });
      const data = await fixture(laneConfig.platform);
      gates.push(gate);
      lanes.push(runSocialPilotLane({
        lane: laneConfig,
        config,
        itemsByQuery: data.itemsByQuery,
        collectionRef: data.collectionRef,
        now,
        gate
      }).lane);
    }

    const receipt = buildContestSocialPilotReceipt({ date: "2026-08-30", now, config, lanes, gates });
    expect(receipt.mode).toBe("fixture");
    expect(receipt.totalCostUsd).toBe(0);
    expect(receipt.lanes.every((lane) => lane.outcome === "disabled")).toBe(true);
    expect(receipt.lanes.every((lane) => lane.verdict === "undecided")).toBe(true);
    expect(receipt.authority).toEqual({
      capacityDecisionRef: null,
      ownerSourceAuthorityRef: null,
      quotaReservationRef: null
    });
    expect(receipt.heldReasons.length).toBeGreaterThan(0);
  });

  it("cannot represent a live pilot without all three authorities, or a fixture pilot that spent", async () => {
    const config = await loadContestSocialPilotConfig(configRoot);
    const stateRoot = path.join(repoRoot, "state");
    const gate = await mayRunContestSocialPilotLane({
      lane: config.lanes[0]!, stateRoot, month: "2026-08", env: {}, repoRoot
    });
    const data = await fixture(config.lanes[0]!.platform);
    const lane = runSocialPilotLane({
      lane: config.lanes[0]!,
      config,
      itemsByQuery: data.itemsByQuery,
      collectionRef: data.collectionRef,
      now,
      gate
    }).lane;
    const base = buildContestSocialPilotReceipt({ date: "2026-08-30", now, config, lanes: [lane], gates: [gate] });

    expect(ContestSocialPilotReceiptSchema.safeParse({ ...base, mode: "live" }).success).toBe(false);
    expect(ContestSocialPilotReceiptSchema.safeParse({ ...base, totalCostUsd: 0.02 }).success).toBe(false);
    expect(ContestSocialPilotReceiptSchema.safeParse({
      ...base,
      lanes: [{ ...lane, unique: 3, costPerUniqueUsd: null }]
    }).success).toBe(false);
  });
});
