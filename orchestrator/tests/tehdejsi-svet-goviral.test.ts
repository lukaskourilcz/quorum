import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingPlanSchema } from "../src/contracts/marketing-plan.js";
import type { TehdejsiFact } from "../src/contracts/tehdejsi-facts.js";
import { repoRoot } from "../src/paths.js";
import { readTehdejsiGoViralContext } from "../src/ventures/tehdejsi-svet/goviral.js";
import { buildShortlist } from "../src/ventures/tehdejsi-svet/scorer.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-goviral-"));
  roots.push(root);
  await mkdir(path.join(root, "ventures/goviral/plans"), { recursive: true });
  return root;
}

function fact(input: {
  id: string;
  country: "cz" | "ua";
  kind: TehdejsiFact["kind"];
  sensitivityTier: 0 | 1 | 2;
  text: string;
}): TehdejsiFact {
  return {
    ...input,
    place: input.country === "ua" ? "Synthetic city" : null,
    yearFrom: 1976,
    yearTo: 1976,
    shareSafe: true,
    sources: input.sensitivityTier === 2
      ? [{ title: "Synthetic source A", url: null, note: null }, { title: "Synthetic source B", url: null, note: null }]
      : [{ title: "Synthetic source", url: null, note: null }],
    verified: null
  };
}

describe("Tehdejsi svet GoVIRAL timing", () => {
  it("loads the latest canonical fixture and records bounded cultural and wartime factors", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, "ventures/goviral/plans");
    const raw = await readFile(path.join(repoRoot, "contracts/fixtures/goviral-tehdejsi-svet-plan.valid.json"), "utf8");
    const plan = MarketingPlanSchema.parse(JSON.parse(raw));
    await writeFile(path.join(directory, `${plan.id}.json`), raw);
    await writeFile(path.join(directory, "malformed.json"), "{not-json");
    await writeFile(path.join(directory, "wrong-name.json"), raw);
    await writeFile(path.join(directory, "plan-2026-08-17-weekly-brief.json"), JSON.stringify({
      ...plan,
      id: "plan-2026-08-17-weekly-brief",
      originMeetingRef: "2026-08-17-gv-brief"
    }));

    const goViral = await readTehdejsiGoViralContext(root, "2026-08-12");
    expect(goViral).toMatchObject({
      planRef: "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json",
      dropped: 3
    });
    const shortlist = buildShortlist({
      date: "2026-08-12",
      factsHash: "a".repeat(64),
      goViral,
      facts: [
        fact({
          id: "cz-cultural-call",
          country: "cz",
          kind: "culture",
          sensitivityTier: 0,
          text: "A wholly synthetic česká nostalgie record used only to exercise timing."
        }),
        fact({
          id: "ua-city-remembrance",
          country: "ua",
          kind: "city",
          sensitivityTier: 2,
          text: "A wholly synthetic пам'ять міста record used only to exercise remembrance."
        })
      ]
    });
    expect(shortlist.goViralPlanRef).toBe(goViral.planRef);
    expect(shortlist.entries.find(({ factId }) => factId === "cz-cultural-call")?.factors)
      .toMatchObject({ culturalMoment: 2, wartimeAwareness: 0 });
    expect(shortlist.entries.find(({ factId }) => factId === "ua-city-remembrance")?.factors)
      .toMatchObject({ culturalMoment: 0, wartimeAwareness: -4 });
  });

  it("is neutral when no canonical measured brief exists", async () => {
    const root = await temporaryRoot();
    const raw = await readFile(path.join(repoRoot, "contracts/fixtures/goviral-tehdejsi-svet-plan.valid.json"), "utf8");
    const plan = MarketingPlanSchema.parse(JSON.parse(raw));
    const quiet = {
      ...plan,
      id: "plan-2026-08-11-weekly-brief",
      originMeetingRef: "2026-08-11-gv-brief",
      tactics: [{
        ...plan.tactics[0],
        description: "Synthetic owner-review idea with no measured Tehdejsi svet call."
      }]
    };
    await writeFile(
      path.join(root, "ventures/goviral/plans/plan-2026-08-11-weekly-brief.json"),
      JSON.stringify(quiet)
    );
    const goViral = await readTehdejsiGoViralContext(root, "2026-08-12");
    const shortlist = buildShortlist({
      date: "2026-08-12",
      factsHash: "b".repeat(64),
      goViral,
      facts: [fact({
        id: "neutral",
        country: "cz",
        kind: "culture",
        sensitivityTier: 0,
        text: "A wholly synthetic česká nostalgie record with no available timing brief."
      })]
    });
    expect(shortlist.goViralPlanRef).toBe("ventures/goviral/plans/plan-2026-08-11-weekly-brief.json");
    expect(shortlist.entries[0]?.factors).toMatchObject({ culturalMoment: 0, wartimeAwareness: 0 });
  });
});
