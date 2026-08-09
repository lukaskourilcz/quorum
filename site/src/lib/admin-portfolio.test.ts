import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminLaunchBinder, readAdminPortfolio } from "./admin-portfolio";

describe("admin portfolio projection", () => {
  it("projects every review card kind and a Perfect owner-rated binder plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-admin-portfolio-"));
    const directories = [
      "config",
      "state/ideas/caught-up",
      "state/ratings/caught-up",
      "state/ventures/caught-up/plans"
    ];
    await Promise.all(directories.map((directory) => mkdir(path.join(root, directory), { recursive: true })));
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "caught-up",
        name: "DNESKAi",
        status: "operating",
        ledgerNamespace: "caught-up",
        adminTabs: ["ideas", "plans", "visuals"]
      }]
    }));
    const idea = {
      schemaVersion: "idea-ledger/1",
      id: "idea-2026-08-04-abcd",
      fingerprint: `sha256:${"a".repeat(64)}`,
      title: "Source cue",
      summary: "Show source context.",
      origin: { agent: "SPARK", meetingRef: "standups/2026-08-04-morning" },
      status: "proposed",
      statusHistory: [{ status: "proposed", at: "2026-08-04T04:00:00.000Z", meetingRef: "standups/2026-08-04-morning", reason: "Novel." }],
      similarTo: []
    };
    await writeFile(path.join(root, "state", "ideas", "caught-up", "ledger.jsonl"), `${JSON.stringify(idea)}\n`);
    const plan = {
      schemaVersion: "marketing-plan/1",
      id: "plan-001",
      ventureId: "caught-up",
      seasonId: "season-001",
      title: "Reader launch",
      objective: "Make the new source cue legible.",
      tactics: [{ type: "content", description: "Explain it.", assetsNeeded: [], platformPolicyNote: "No policy risk." }],
      calendar: [{ week: 1, focus: "Publish the explanation." }],
      audienceRefs: ["audience-001"],
      kpis: ["reader comprehension"],
      status: "owner_rated",
      originMeetingRef: "meetings/2026-08-04-cu-product"
    };
    await writeFile(path.join(root, "state", "ventures", "caught-up", "plans", "plan-001.json"), JSON.stringify(plan));
    const planRating = JSON.stringify({
      schemaVersion: "rating/1",
      id: "r-2026-08-04-abcd",
      ventureId: "caught-up",
      objectKind: "plan",
      objectRef: { id: "plan-001", contentHash: "sha256:abcdef123456" },
      rating: "perfect",
      ratedAt: "2026-08-04T10:00:00.000Z"
    });
    await writeFile(path.join(root, "state", "ratings", "caught-up", "ledger.jsonl"), `${planRating}\n`);

    const portfolio = await readAdminPortfolio(root);
    expect(portfolio.ventures[0]?.cards.map((card) => card.kind).sort()).toEqual([
      "idea",
      "plan"
    ]);
    await expect(readAdminLaunchBinder("caught-up", root)).resolves.toMatchObject({
      plans: [{ id: "plan-001", rating: { rating: "perfect" } }]
    });
  });
});

describe("launch binder readiness", () => {
  async function binderRoot(statuses: readonly string[]): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-binder-"));
    await Promise.all(["config", "state/ratings/titty-tuesdays", "state/ventures/titty-tuesdays/plans"]
      .map((directory) => mkdir(path.join(root, directory), { recursive: true })));
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "titty-tuesdays",
        name: "Titty Tuesdays",
        status: "operating",
        ledgerNamespace: "titty-tuesdays",
        adminTabs: ["plans", "ideas"]
      }]
    }));
    const ratings: string[] = [];
    await Promise.all(statuses.map(async (status, index) => {
      const id = `plan-00${index}`;
      await writeFile(path.join(root, "state", "ventures", "titty-tuesdays", "plans", `${id}.json`), JSON.stringify({
        schemaVersion: "marketing-plan/1",
        id,
        ventureId: "titty-tuesdays",
        title: `Season ${index}`,
        objective: "Sell the crop top.",
        tactics: [{ type: "social", description: "Post it.", assetsNeeded: [], platformPolicyNote: "Garment only." }],
        calendar: [{ week: 1, focus: "Launch." }],
        audienceRefs: [],
        kpis: ["saves"],
        status,
        originMeetingRef: "2026-08-05-tt-marketing"
      }));
      ratings.push(JSON.stringify({
        schemaVersion: "rating/1",
        id: `r-2026-08-07-000${index}`,
        ventureId: "titty-tuesdays",
        objectKind: "plan",
        objectRef: { id, contentHash: "sha256:abcdef123456" },
        rating: "perfect",
        ratedAt: `2026-08-07T12:0${index}:00.000Z`
      }));
    }));
    await writeFile(path.join(root, "state", "ratings", "titty-tuesdays", "ledger.jsonl"), `${ratings.join("\n")}\n`);
    return root;
  }

  it("counts a Perfect-rated plan whose file still says draft", async () => {
    const binder = await readAdminLaunchBinder("titty-tuesdays", await binderRoot(["draft", "draft"]));
    expect(binder?.plans.map((plan) => plan.id)).toEqual(["plan-000", "plan-001"]);
  });

  it("still refuses an archived plan however it was rated", async () => {
    const binder = await readAdminLaunchBinder("titty-tuesdays", await binderRoot(["archived"]));
    expect(binder?.plans).toEqual([]);
  });
});

/**
 * Cards a workspace holds but no tab can show.
 *
 * DNESKAi carried five live ideas behind `adminTabs: ["plans","visuals","events"]`: the rail counted
 * them, every tab body filtered them out. Counting cards against declared tabs catches the next one
 * the same way, whichever venture and whichever kind it is.
 */
describe("declared tabs against stored cards", () => {
  const tabForKind: Readonly<Record<string, string>> = {
    idea: "ideas",
    plan: "plans",
    visual: "visuals",
    "social-variant": "packages"
  };

  it("gives every stored card kind a tab in the real registry", async () => {
    const portfolio = await readAdminPortfolio();
    const orphaned = portfolio.ventures.flatMap((venture) => {
      const kinds = [...new Set(venture.cards.map((card) => card.kind))];
      return kinds
        .filter((kind) => !venture.tabs.includes(tabForKind[kind] as never))
        .map((kind) => `${venture.id}/${kind}`);
    });
    expect(orphaned).toEqual([]);
  });
});
