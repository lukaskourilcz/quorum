import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArticlePackageSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import { composePortfolioContext } from "../src/portfolio/run.js";
import { repoRoot } from "../src/paths.js";
import { atomicWriteJson, atomicWriteText } from "../src/state.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

/**
 * A subject the desk has already covered must never reach the editorial room.
 *
 * The window that decides what the room is shown is three days wide, and for four consecutive
 * mornings it showed `hernandez-vs-rodrigues`; the desk wrote it every time, paid every time, and
 * the magazine refused every package because that slug and slot were already taken. Six packages
 * sat parked on `hash_conflict` — a delivery jam in the report and a repeat loop in fact.
 *
 * The rule existed. It was simply not consulted on this path.
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const EVENT_ID = "ufc:event:ufc-fight-night-hernandez-vs-rodrigues";
const DATE = "2026-08-22";

async function articleCovering(eventId: string, publishAt: string): Promise<ArticlePackage> {
  const fixture = JSON.parse(
    await readFile(path.join(repoRoot, "contracts", "fixtures", "article.valid.json"), "utf8")
  ) as Record<string, unknown>;
  const content: Record<string, unknown> = { ...fixture, eventRef: eventId, publishAt, slot: "am" };
  delete content.packageHash;
  return ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content as never) });
}

async function plantEvent(root: string, id: string, startsAtUtc: string): Promise<void> {
  await atomicWriteJson(root, `mma/events/ufc/${id.split(":").at(-1)}.json`, {
    schemaVersion: "event-card/1",
    id,
    org: "ufc",
    name: "UFC Fight Night: Hernandez vs. Rodrigues",
    venue: "UFC APEX",
    startsAtLocal: startsAtUtc,
    timeZone: "UTC",
    startsAtUtc,
    sourceRefs: ["source:wikipedia:2026-08-19:List of UFC events"],
    bouts: [{
      id: `${id.replace("ufc:event:", "ufc:")}:bout:hernandez-vs-rodrigues-1`,
      red: "ufc:alexander-hernandez",
      blue: "ufc:gregory-rodrigues",
      division: "welterweight",
      scheduledRounds: 3,
      status: "announced"
    }],
    updatedAt: "2026-08-19T06:00:00.000Z"
  });
}

describe("a repeated MMA subject is refused before the model call", () => {
  it("offers a fight-week card the desk has not covered", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-repeat-"));
    roots.push(root);
    await plantEvent(root, EVENT_ID, "2026-08-23T00:00:00.000Z");
    await atomicWriteText(root, "mma/BRIDGE.md", "# Bridge\n");

    const packet = await composePortfolioContext(
      "mag-editorial", root, DATE, await loadVentureRegistry(), new Date(`${DATE}T12:00:00Z`)
    );

    expect(packet.evidenceRefs).toContain(`event:${EVENT_ID}`);
    expect(packet.text).toContain(EVENT_ID);
  });

  it("withholds the card once an article already covers it, so the repeat costs nothing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-repeat-"));
    roots.push(root);
    await plantEvent(root, EVENT_ID, "2026-08-23T00:00:00.000Z");
    await atomicWriteText(root, "mma/BRIDGE.md", "# Bridge\n");
    // Covered three days ago: inside the six-week repeat window, and the card is still inside the
    // three-day fight-week window. Exactly the state that produced four articles about one event.
    const article = await articleCovering(EVENT_ID, "2026-08-19T08:00:00.000Z");
    await atomicWriteJson(root, `ventures/mma-files/articles/2026-08-19-am-${article.slug}.json`, article);

    const packet = await composePortfolioContext(
      "mag-editorial", root, DATE, await loadVentureRegistry(), new Date(`${DATE}T12:00:00Z`)
    );

    // No evidence ref, so the fight-week override downstream cannot name it either.
    expect(packet.evidenceRefs).not.toContain(`event:${EVENT_ID}`);
    // And the room is told why the list is empty, rather than being handed a bare `[]` that reads
    // as "no card in the window" when the truth is "already written".
    expect(packet.text).toContain("has already been covered");
    expect(packet.text).toContain("Do not write about these again.");
  });

  it("says nothing extra when the window itself is empty", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-repeat-"));
    roots.push(root);
    // Far outside the three-day window: an ordinary quiet day, not a repeat.
    await plantEvent(root, EVENT_ID, "2026-12-01T00:00:00.000Z");
    await atomicWriteText(root, "mma/BRIDGE.md", "# Bridge\n");

    const packet = await composePortfolioContext(
      "mag-editorial", root, DATE, await loadVentureRegistry(), new Date(`${DATE}T12:00:00Z`)
    );

    expect(packet.evidenceRefs).not.toContain(`event:${EVENT_ID}`);
    expect(packet.text).not.toContain("has already been covered");
  });

  it("still gives FightAIQ's own rooms the card, because intake is not publication", async () => {
    // The repeat rule is the magazine's. FightAIQ must go on collecting data about an event
    // MMA Files has written about, or holding one venture's output would blind the other's.
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-repeat-"));
    roots.push(root);
    await plantEvent(root, EVENT_ID, "2026-08-23T00:00:00.000Z");
    await atomicWriteText(root, "mma/BRIDGE.md", "# Bridge\n");
    const article = await articleCovering(EVENT_ID, "2026-08-19T08:00:00.000Z");
    await atomicWriteJson(root, `ventures/mma-files/articles/2026-08-19-am-${article.slug}.json`, article);

    const packet = await composePortfolioContext(
      "mma-intake", root, DATE, await loadVentureRegistry(), new Date(`${DATE}T12:00:00Z`)
    );

    expect(packet.evidenceRefs).toContain(`event:${EVENT_ID}`);
  });
});
