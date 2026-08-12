import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import entityLexiconFixture from "../../config/kvorum-entities.json";
import { KvorumEntityLexiconSchema } from "../src/contracts/kvorum-entities.js";
import {
  TribunPackageSchema,
  type KvorumGateResult,
  type TribunPackage
} from "../src/contracts/kvorum-desk.js";
import {
  KvorumMonitorItemSchema,
  type KvorumMonitorItem,
  type KvorumMonitorReceipt
} from "../src/contracts/kvorum-monitor.js";
import { repoRoot } from "../src/paths.js";
import { kvorumMonitorItemRef } from "../src/ventures/kvorum/cluster.js";
import {
  evaluateKvorumPackages,
  kvorumTrigramOverlap,
  loadKvorumDuplicateThreshold
} from "../src/ventures/kvorum/gates.js";
import { buildKvorumMonitorReceipt } from "../src/ventures/kvorum/monitor.js";
import { applyPerformanceWeightProposal } from "../src/performance/weights.js";
import { KvorumPerformanceWeightsSchema } from "../src/ventures/kvorum/performance.js";

const now = new Date("2026-08-12T20:45:00.000Z");
const clusterId = "a".repeat(40);
const unknownRef = "f".repeat(40);
const entityLexicon = KvorumEntityLexiconSchema.parse(entityLexiconFixture);

const items = [
  {
    source: { id: "stit-demokracie-facebook", name: "Štít demokracie", kind: "facebook", host: "www.facebook.com" },
    url: "https://www.facebook.com/stitdemokracie/posts/123",
    publishedAt: "2026-08-12T20:30:00.000Z",
    text: "Štít demokracie otevřel téma televizních poplatků.",
    entities: ["public-media-funding"],
    stit: { pagePostUrl: "https://www.facebook.com/stitdemokracie/posts/123", likes: 12, comments: 3, shares: 1 }
  },
  {
    source: { id: "irozhlas", name: "iROZHLAS", kind: "rss", host: "www.irozhlas.cz" },
    url: "https://www.irozhlas.cz/zpravy-domov/poplatky",
    publishedAt: "2026-08-12T19:30:00.000Z",
    text: "Sněmovna projedná financování médií veřejné služby. Výbor zveřejnil další procesní krok.",
    entities: ["public-media-funding"]
  },
  {
    source: { id: "ct24", name: "ČT24", kind: "rss", host: "ct24.ceskatelevize.cz" },
    url: "https://ct24.ceskatelevize.cz/domaci/poplatky",
    publishedAt: "2026-08-12T19:00:00.000Z",
    text: "ČT24 potvrzuje návrat návrhu do sněmovního projednávání a popisuje jeho harmonogram.",
    entities: ["public-media-funding"]
  },
  {
    source: { id: "irozhlas-archive", name: "iROZHLAS archiv", kind: "rss", host: "archiv.irozhlas.cz" },
    url: "https://archiv.irozhlas.cz/zpravy-domov/poplatky-druhy",
    publishedAt: "2026-08-12T18:30:00.000Z",
    text: "Druhý záznam stejného vydavatele popisuje sněmovní program.",
    entities: ["public-media-funding"]
  }
].map((item) => KvorumMonitorItemSchema.parse(item));

const [stitRef, irozhlasRef, ct24Ref, sameDomainRef] = items.map(kvorumMonitorItemRef) as [string, string, string, string];

function receipt(): KvorumMonitorReceipt {
  return buildKvorumMonitorReceipt({
    date: "2026-08-12",
    now,
    fetched: {
      items,
      sourceResults: items.map((item) => ({
        sourceId: item.source.id,
        kind: "stit" in item ? "apify" as const : "feed" as const,
        attempted: false,
        status: "fixture" as const,
        count: 1,
        reason: "Committed gate fixture; no source was contacted."
      })),
      artifactPaths: [],
      fixtureOnly: true
    },
    clusters: [{
      id: clusterId,
      title: "Financování médií veřejné služby",
      entityIds: ["public-media-funding"],
      topicTokens: ["financovani", "media"],
      itemRefs: [stitRef, irozhlasRef, ct24Ref, sameDomainRef],
      attributions: items.map((item, index) => ({
        itemRef: [stitRef, irozhlasRef, ct24Ref, sameDomainRef][index]!,
        sourceId: item.source.id,
        sourceName: item.source.name,
        url: item.url,
        publishedAt: item.publishedAt,
        excerpt: item.text,
        discoveryOnly: "stit" in item
      })),
      continuationOf: null
    }],
    ranks: [{
      clusterId,
      position: 1,
      score: 1,
      factors: {
        corroboration: 1,
        entityWeight: 1,
        engagementSalience: 1,
        novelty: 1,
        standingTopicContinuity: 1,
        trendCrossover: 1
      }
    }]
  });
}

function candidate(): TribunPackage {
  return TribunPackageSchema.parse({
    clusterId,
    headline: "Co přesně čeká financování veřejnoprávních médií",
    summary: {
      text: "Poslanci se vracejí k návrhu, který mění pravidla financování médií veřejné služby.",
      refs: [irozhlasRef, ct24Ref]
    },
    whyItMatters: {
      text: "Další krok určí, kdy a v jaké podobě může změna pokračovat.",
      refs: [irozhlasRef, ct24Ref]
    },
    whyThisIsWorthIt: "Dva vydavatelé popisují stejný institucionální krok z odlišných podkladů.",
    ourAngle: "Oddělit text návrhu, proceduru a dohledatelný další krok.",
    ourAngleDiffers: "Místo mobilizačního rámce sledujeme institucionální postup a jeho kontrolovatelné milníky.",
    stitAttribution: { summary: "Štít téma otevřel jako spor o poplatky; zůstává jen kontextem.", itemRefs: [stitRef] },
    targets: [{
      platform: "instagram",
      format: "carousel",
      reason: "Tři karty oddělí návrh, proces a důsledek.",
      copy: "Návrh je znovu na pořadu. Ukazujeme, co obsahuje, kdo rozhodne a který krok následuje.",
      altText: "Přehled návrhu, rozhodovacího procesu a dalšího kroku."
    }],
    claims: [{
      id: "snemovni-krok",
      type: "fact-multi",
      text: "Návrh pokračuje sněmovním procesem.",
      refs: [irozhlasRef, ct24Ref]
    }]
  });
}

function evaluate(raw: unknown): { passed: boolean; results: KvorumGateResult[] } {
  const result = evaluateKvorumPackages({ receipt: receipt(), candidates: [raw], duplicateThreshold: 0.86, entityLexicon });
  return result.evaluations[0]!;
}

function failed(result: ReturnType<typeof evaluate>, gate: string): boolean {
  return result.results.some((entry) => entry.gate === gate && entry.verdict === "fail");
}

describe("Kvórum package gates", () => {
  test("loads the duplicate ceiling from the shared social policy and pins overlap behavior", async () => {
    const policy = JSON.parse(await readFile(path.join(repoRoot, "config/social-policy.json"), "utf8")) as {
      duplicateThreshold: number;
    };
    expect(await loadKvorumDuplicateThreshold()).toBe(policy.duplicateThreshold);
    expect(kvorumTrigramOverlap("Jedna přesná věta o sněmovním procesu.", "Úvod. Jedna přesná věta o sněmovním procesu. Konec.")).toBe(1);
  });

  test("accepts a schema-valid, corroborated and original package", () => {
    const result = evaluate(candidate());
    expect(result.passed).toBe(true);
    expect(result.results.map((entry) => [entry.gate, entry.verdict])).toEqual([
      ["schema-validation", "pass"],
      ["format-weighting", "pass"],
      ["claim-resolution", "pass"],
      ["originality", "pass"],
      ["quote-verification", "pass"],
      ["angle-distinction", "pass"],
      ["single-source-label", "pass"],
      ["vote-recommendation", "pass"],
      ["party-endorsement", "pass"],
      ["crime-accusation", "pass"],
      ["private-individual-scope", "pass"],
      ["alarm-vocabulary", "pass"],
      ["voter-respect", "pass"],
      ["stop-slop", "pass"],
      ["forbidden-action-proposal", "pass"]
    ]);
  });

  test("orders every retained target by bounded format weight and records the explanation", async () => {
    const raw = candidate();
    raw.targets.push({
      platform: "threads",
      format: "thread",
      reason: "A short thread keeps the procedural steps linked.",
      copy: "Vlákno shrnuje návrh, rozhodovací proces a dohledatelný další krok.",
      altText: null
    });
    const resultIds = ["kv-result-01", "kv-result-02", "kv-result-03"];
    const state = JSON.parse(await readFile(
      path.join(repoRoot, "state/ventures/kvorum/performance-weights.json"),
      "utf8"
    )) as unknown;
    const performanceWeights = KvorumPerformanceWeightsSchema.parse(applyPerformanceWeightProposal({
      state,
      proposal: {
        schemaVersion: "performance-weight-proposal/1",
        id: "kv-format-2026-w33",
        ventureId: "kvorum",
        week: "2026-W33",
        proposedAt: "2026-08-13T09:00:00.000Z",
        changes: [{
          axis: "format",
          key: "thread",
          weight: 1.1,
          resultIds,
          reason: "Three cited owner results support a bounded delivery-order adjustment."
        }]
      },
      evidence: resultIds.map((resultId) => ({
        resultId,
        topics: ["public-media-funding"],
        formats: ["thread"]
      })),
      now: new Date("2026-08-13T10:00:00.000Z")
    }).state);
    const evaluated = evaluateKvorumPackages({
      receipt: receipt(),
      candidates: [raw],
      duplicateThreshold: 0.86,
      entityLexicon,
      performanceWeights
    });
    expect(evaluated.accepted[0]?.targets.map((target) => target.format)).toEqual(["thread", "carousel"]);
    expect(evaluated.evaluations[0]?.results.find((gate) => gate.gate === "format-weighting")?.message)
      .toContain("thread 1.10");
  });

  test("drops a package whose required angle field fails schema validation", () => {
    const poison = { ...candidate(), ourAngleDiffers: " " };
    const result = evaluate(poison);
    expect(result.passed).toBe(false);
    expect(failed(result, "schema-validation")).toBe(true);
  });

  test("refuses unresolved factual refs", () => {
    const poison = candidate();
    poison.claims[0]!.refs = [irozhlasRef, unknownRef];
    const result = evaluate(poison);
    expect(failed(result, "claim-resolution")).toBe(true);
    expect(result.results.find((entry) => entry.gate === "claim-resolution")?.claimIds).toEqual(["snemovni-krok"]);
  });

  test("requires two independent domains for fact-multi", () => {
    const poison = candidate();
    poison.claims[0]!.refs = [irozhlasRef, sameDomainRef];
    expect(failed(evaluate(poison), "claim-resolution")).toBe(true);
  });

  test("never accepts Štít discovery rows as factual evidence", () => {
    const poison = candidate();
    poison.claims[0] = { id: "stit-fact", type: "fact-single", text: "Štít tvrdí fakt.", refs: [stitRef] };
    expect(failed(evaluate(poison), "claim-resolution")).toBe(true);

    const mislabeled = receipt();
    mislabeled.clusters[0]!.attributions[0]!.discoveryOnly = false;
    const result = evaluateKvorumPackages({ receipt: mislabeled, candidates: [poison], duplicateThreshold: 0.86, entityLexicon });
    expect(failed(result.evaluations[0]!, "claim-resolution")).toBe(true);
  });

  test("drops source wording at or above the configured trigram ceiling", () => {
    const poison = candidate();
    poison.targets[0]!.copy = items[1]!.text;
    expect(failed(evaluate(poison), "originality")).toBe(true);
  });

  test("requires every marked quote to be an exact source substring", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Podle iROZHLAS: „Tuto větu žádný zdroj neobsahuje.“";
    expect(failed(evaluate(poison), "quote-verification")).toBe(true);
  });

  test("requires visible source attribution beside an exact marked quote", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "„Sněmovna projedná financování médií veřejné služby.“";
    expect(failed(evaluate(poison), "quote-verification")).toBe(true);

    const attributed = candidate();
    attributed.targets[0]!.copy = "Podle iROZHLAS: „Sněmovna projedná financování médií veřejné služby.“";
    expect(failed(evaluate(attributed), "quote-verification")).toBe(false);
  });

  test("requires the angle-difference field to differ from the package summary", () => {
    const poison = candidate();
    poison.ourAngleDiffers = poison.summary.text;
    expect(failed(evaluate(poison), "angle-distinction")).toBe(true);
  });

  test("requires an explicit Czech label on every fact-single claim", () => {
    const poison = candidate();
    poison.claims[0] = { id: "jeden-zdroj", type: "fact-single", text: "iROZHLAS popisuje další krok.", refs: [irozhlasRef] };
    expect(failed(evaluate(poison), "single-source-label")).toBe(true);

    poison.claims[0]!.text = "Zatím jediný zdroj, iROZHLAS, popisuje další krok.";
    expect(failed(evaluate(poison), "single-source-label")).toBe(false);
  });

  test("blocks voting recommendations as their own gate", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Volte tuto kandidátku v říjnových volbách.";
    expect(failed(evaluate(poison), "vote-recommendation")).toBe(true);
  });

  test("blocks party and candidate endorsements as their own gate", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Hnutí ANO je jediná správná volba pro Česko.";
    expect(failed(evaluate(poison), "party-endorsement")).toBe(true);
  });

  test("requires typed, visible and on-record support for crime accusations", () => {
    const poison = candidate();
    poison.claims[0] = { id: "obvineni", type: "fact-single", text: "Politik je podvodník.", refs: [irozhlasRef] };
    expect(failed(evaluate(poison), "crime-accusation")).toBe(true);

    const supportedReceipt = receipt();
    supportedReceipt.rawItems.find((item) => item.source.id === "irozhlas")!.text =
      "Policie v usnesení uvedla, že politika obvinila z podvodu.";
    poison.claims[0]!.text = "Zatím jediný zdroj, iROZHLAS, uvádí: policie politika obvinila z podvodu.";
    const supported = evaluateKvorumPackages({
      receipt: supportedReceipt,
      candidates: [poison],
      duplicateThreshold: 0.86,
      entityLexicon
    }).evaluations[0]!;
    expect(failed(supported, "crime-accusation")).toBe(false);
  });

  test("blocks unknown full names and private relations while allowing lexicon public figures", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Jan Novák předal redakci soukromou zprávu.";
    expect(failed(evaluate(poison), "private-individual-scope")).toBe(true);

    const publicFigure = candidate();
    publicFigure.targets[0]!.copy = "Petr Pavel podepsal zákon a Kancelář prezidenta zveřejnila záznam.";
    expect(failed(evaluate(publicFigure), "private-individual-scope")).toBe(false);

    const relation = candidate();
    relation.targets[0]!.copy = "Manželka premiéra se k věci nevyjádřila.";
    expect(failed(evaluate(relation), "private-individual-scope")).toBe(true);
  });

  test("blocks alarm vocabulary and exclamation-mark urgency", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Šokující skandál! Země je v ohrožení.";
    expect(failed(evaluate(poison), "alarm-vocabulary")).toBe(true);
  });

  test("blocks mockery of voters rather than criticism of documented acts", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Voliči této strany jsou hloupé ovce.";
    expect(failed(evaluate(poison), "voter-respect")).toBe(true);
  });

  test("runs the shared Czech stop-slop lint as its own gate", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Pojďme se podívat, co tento průlomový návrh přináší.";
    expect(failed(evaluate(poison), "stop-slop")).toBe(true);
  });

  test("blocks publishing, account, channel, promotion and fundraising proposals", () => {
    const poison = candidate();
    poison.targets[0]!.copy = "Založme účet a spusťme reklamu na tento příspěvek.";
    expect(failed(evaluate(poison), "forbidden-action-proposal")).toBe(true);
  });

  test("drops and counts only the failed candidate without asking for a replacement", () => {
    const poison = candidate();
    poison.claims[0]!.refs = [stitRef, irozhlasRef];
    const result = evaluateKvorumPackages({
      receipt: receipt(),
      candidates: [candidate(), poison],
      duplicateThreshold: 0.86,
      entityLexicon
    });
    expect(result).toMatchObject({ accepted: [candidate()], droppedCount: 1 });
    expect(result.evaluations.map((evaluation) => evaluation.passed)).toEqual([true, false]);
  });
});
