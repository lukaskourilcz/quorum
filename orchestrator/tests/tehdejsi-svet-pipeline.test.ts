import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { guardedJsonCall } from "../src/llm/call.js";
import { runTehdejsiPipelineDay } from "../src/ventures/tehdejsi-svet/pipeline.js";
import { readTehdejsiCycle, tehdejsiCycleComplete } from "../src/ventures/tehdejsi-svet/state.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fixtureCall(): typeof guardedJsonCall {
  const replies = [
    {
      briefs: [{
        factId: "cs-1970s-vecernicek",
        angle: "A few minutes before bed that divided the household evening into before and after.",
        slideBeats: [
          { beat: "Open on the short tune before bed and the clock around it.", claimIds: ["evening-slot"] },
          { beat: "Place the programme inside the household evening routine.", claimIds: ["evening-slot"] },
          { beat: "Close with a question about who switched it on.", claimIds: [] }
        ],
        claims: [{
          claimId: "evening-slot",
          statement: "The programme ran for a few minutes before bed and marked the evening.",
          factIds: ["cs-1970s-vecernicek"]
        }],
        ctaKind: "ask-your-parents"
      }]
    },
    {
      slides: [
        { ordinal: 1, text: "Pár minut před spaním. Znělka uzavírala den." },
        { ordinal: 2, text: "Od roku 1965 podle ní rodiny poznaly večerní čas." },
        { ordinal: 3, text: "Kdo vám ji pouštěl?" }
      ],
      caption: "Krátká znělka dělila den na před a po. Koho se na ni zeptáte?",
      contextLine: null
    },
    {
      slides: [
        { ordinal: 1, text: "Перед сном звучала коротка мелодія, і вечір мав свій знак." },
        { ordinal: 2, text: "З 1965 року родини впізнавали за нею час казки." },
        { ordinal: 3, text: "Хто вмикав її у вашому домі?" }
      ],
      caption: "Коротка мелодія відділяла вечір від ночі. Кого ви про неї запитаєте?"
    }
  ];
  let index = 0;
  return (async (request: { parse: (text: string) => unknown }) => ({
    value: request.parse(JSON.stringify(replies[index++])),
    cached: false,
    usd: [0.06, 0.08, 0.07][index - 1]!
  })) as unknown as typeof guardedJsonCall;
}

function stretchedFixtureCall(): typeof guardedJsonCall {
  const replies = [
    {
      briefs: [{
        factId: "synthetic-off-list",
        angle: "A deliberately unavailable candidate used to exercise the quiet planning path.",
        slideBeats: [
          { beat: "Open on a candidate the shortlist did not provide.", claimIds: ["unavailable"] },
          { beat: "Close without accepting unsupported material into the plan.", claimIds: ["unavailable"] }
        ],
        claims: [{
          claimId: "unavailable",
          statement: "This synthetic candidate is absent from the committed shortlist.",
          factIds: ["synthetic-off-list"]
        }],
        ctaKind: "none"
      }]
    },
    {
      briefs: [{
        factId: "cs-1970s-vecernicek",
        angle: "A small evening ritual that families could identify by its tune and timing.",
        slideBeats: [
          { beat: "Open on the tune as the household evening marker.", claimIds: ["evening-slot"] },
          { beat: "Place the short programme in its recorded broadcast routine.", claimIds: ["evening-slot"] },
          { beat: "Close by asking who switched it on at home.", claimIds: [] }
        ],
        claims: [{
          claimId: "evening-slot",
          statement: "The programme occupied a short evening slot before children's bedtime.",
          factIds: ["cs-1970s-vecernicek"]
        }],
        ctaKind: "ask-your-parents"
      }]
    },
    {
      slides: [
        { ordinal: 1, text: "Večer měl krátkou znělku. Domácnost věděla, že den končí." },
        { ordinal: 2, text: "Krátký pořad patřil do pravidelného času před spaním." },
        { ordinal: 3, text: "Kdo ho u vás doma zapínal?" }
      ],
      caption: "Krátký večerní zvuk dokázal označit celý rodinný rytmus. Koho se zeptáte?",
      contextLine: null
    },
    {
      slides: [
        { ordinal: 1, text: "Вечір мав коротку мелодію, і родина знала, що день завершується." },
        { ordinal: 2, text: "Коротка програма мала своє постійне місце перед сном." },
        { ordinal: 3, text: "Хто вмикав її у вашій родині?" }
      ],
      caption: "Короткий вечірній звук позначав ритм усієї родини. Кого ви запитаєте?"
    }
  ];
  let index = 0;
  return (async (request: { parse: (text: string) => unknown }) => ({
    value: request.parse(JSON.stringify(replies[index++])),
    cached: false,
    usd: 0.01
  })) as unknown as typeof guardedJsonCall;
}

describe("Tehdejsi svet live pipeline", () => {
  it("joins the recorded shortlist, canonical brief, two language passes and drawable draft", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-pipeline-"));
    roots.push(root);
    const call = fixtureCall();
    const planning = await runTehdejsiPipelineDay({
      root,
      executionCycleId: "20260813160000-ts-desk",
      date: "2026-08-13",
      now: new Date("2026-08-13T16:00:00.000Z"),
      stage: "VALIDATION",
      call
    });

    expect(planning).toMatchObject({ phase: "planning", completed: true, status: "PLAN", spendUsd: 0.06 });
    expect(planning.artifacts).toContain(
      "ventures/tehdejsi-svet/briefs/2026-08-13-cs-1970s-vecernicek.json"
    );

    const production = await runTehdejsiPipelineDay({
      root,
      executionCycleId: "20260814160000-ts-desk",
      date: "2026-08-14",
      now: new Date("2026-08-14T16:00:00.000Z"),
      stage: "VALIDATION",
      call
    });

    expect(production).toMatchObject({
      phase: "production",
      completed: true,
      status: "PLAN",
      spendUsd: 0.15,
      participants: ["LETOPIS", "VERBA"]
    });
    const recommendationPath = production.artifacts.find((entry) => entry.includes("/drafts/"));
    expect(recommendationPath).toBeDefined();
    const recommendation = JSON.parse(await readFile(path.join(root, recommendationPath!), "utf8"));
    expect(recommendation).toMatchObject({
      ventureId: "tehdejsi-svet",
      date: "2026-08-14",
      status: "draft",
      designLab: { summaryPath: null, readyAt: null }
    });
    expect(recommendation.payload.slides).toHaveLength(3);
    expect(tehdejsiCycleComplete(await readTehdejsiCycle(root))).toBe(true);
  });

  it("finds a canonical brief recorded after a stretched planning day", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-pipeline-stretch-"));
    roots.push(root);
    const call = stretchedFixtureCall();

    const quiet = await runTehdejsiPipelineDay({
      root,
      executionCycleId: "20260813160000-ts-desk",
      date: "2026-08-13",
      now: new Date("2026-08-13T16:00:00.000Z"),
      stage: "VALIDATION",
      call
    });
    expect(quiet).toMatchObject({ phase: "planning", completed: false, status: "NO_ACTION" });

    const planned = await runTehdejsiPipelineDay({
      root,
      executionCycleId: "20260814160000-ts-desk",
      date: "2026-08-14",
      now: new Date("2026-08-14T16:00:00.000Z"),
      stage: "VALIDATION",
      call
    });
    expect(planned.artifacts).toContain(
      "ventures/tehdejsi-svet/briefs/2026-08-14-cs-1970s-vecernicek.json"
    );

    const produced = await runTehdejsiPipelineDay({
      root,
      executionCycleId: "20260815160000-ts-desk",
      date: "2026-08-15",
      now: new Date("2026-08-15T16:00:00.000Z"),
      stage: "VALIDATION",
      call
    });
    expect(produced).toMatchObject({ phase: "production", completed: true, status: "PLAN" });
  });
});
