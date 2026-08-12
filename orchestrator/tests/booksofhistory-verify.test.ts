import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BhDossierSchema, type BhDossierClaim } from "../src/contracts/bh-dossier.js";
import { repoRoot } from "../src/paths.js";
import {
  publicationModeForBhClaim,
  triageBhClaim,
  triageBhDossier
} from "../src/ventures/booksofhistory/verify.js";

async function claim(text: string, sourceHosts = ["archive.example"]): Promise<BhDossierClaim> {
  const dossier = BhDossierSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
    "utf8"
  )));
  return {
    ...dossier.claims[0]!,
    text,
    sources: sourceHosts.map((host, index) => ({
      url: `https://${host}/source-${index}`,
      title: `Source ${index}`,
      category: index === 0 ? "archive" : "scholarship"
    })),
    corroboration: sourceHosts.length
  };
}

describe("BOOKSOFHISTORY deterministic claim triage", () => {
  it("flags a precise rejection hook while leaving a plain publication year ordinary", async () => {
    const rejected = triageBhClaim(await claim("The manuscript was rejected 27 times before publication.", [
      "archive.example", "study.example", "newspaper.example"
    ]));
    expect(rejected).toMatchObject({
      strength: "sensational",
      requiredIndependentSources: 3,
      corroborationSufficient: true,
      escalate: true
    });
    expect(rejected.signals).toEqual(expect.arrayContaining(["precise-dramatic-number", "ban-or-rejection"]));

    const date = triageBhClaim(await claim("The documented book edition was published in 1936."));
    expect(date).toMatchObject({
      strength: "ordinary",
      signals: [],
      requiredIndependentSources: 1,
      corroborationSufficient: true,
      escalate: false
    });
  });

  it("requires stronger independent corroboration for superlative, ban and burning claims", async () => {
    for (const text of [
      "It was the first novel ever to expose the practice.",
      "Authorities banned the edition after release.",
      "Officials burned the remaining copies."
    ]) {
      const triage = triageBhClaim(await claim(text, ["same.example", "same.example"]));
      expect(triage.strength).toBe("sensational");
      expect(triage.independentSources).toBe(1);
      expect(triage.requiredIndependentSources).toBe(3);
      expect(triage.corroborationSufficient).toBe(false);
      expect(triage.escalate).toBe(true);
    }
  });

  it("derives publication behavior from every verification state", async () => {
    expect(["verified", "probable", "single-source", "legend", "rejected"].map((state) =>
      publicationModeForBhClaim(state as BhDossierClaim["verificationState"])
    )).toEqual(["plain", "plain", "framed", "legend-label-required", "prohibited"]);
    const dossier = BhDossierSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
      "utf8"
    )));
    expect(triageBhDossier(dossier)).toHaveLength(dossier.claims.length);
  });
});
