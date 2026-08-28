import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAmplificationPolicy, parseAmplifierPortfolio, parseAmplifierProposal } from "./amplifier-model";

const root = path.resolve(process.cwd(), "..");

async function json(relative: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown;
}

describe("Social Profiles #415 projections", () => {
  it("accepts the canonical proposal fixture without deriving a new verdict", async () => {
    const proposal = parseAmplifierProposal(await json("contracts/fixtures/social-amplifier-proposal.valid.json"));
    expect(proposal).not.toBeNull();
    expect(proposal).toMatchObject({ archetype: "topic-editorial", ownerDecision: { verdict: "accept" }, validationPlan: { reviewAfterDays: 75 } });
    expect(proposal).not.toHaveProperty("authorityGranted");
  });

  it("parses the recorded central policy and empty canonical portfolio", async () => {
    const policy = parseAmplificationPolicy(await json("config/social-amplification-policy.json"));
    const portfolio = parseAmplifierPortfolio(await json("state/social/amplifiers/portfolio.json"));
    expect(policy).toMatchObject({ version: "1.0.0", values: { minimumOriginalContentRatio: 0.7, maximumVentureSupportRatio: 0.3 } });
    expect(portfolio).toMatchObject({ portfolio: { proposals: [] }, droppedProposals: 0 });
  });

  it("drops one malformed proposal without discarding valid siblings", async () => {
    const proposal = await json("contracts/fixtures/social-amplifier-proposal.valid.json");
    const portfolio = await json("state/social/amplifiers/portfolio.json") as Record<string, unknown>;
    const result = parseAmplifierPortfolio({ ...portfolio, proposals: [proposal, { schemaVersion: "social-amplifier-proposal/1" }] });
    expect(result.portfolio?.proposals).toHaveLength(1);
    expect(result.droppedProposals).toBe(1);
  });
});
