import { atomicWriteText, readText } from "../state.js";
import type { LicensedPhotoCandidate } from "./licensed.js";
import type { GateCandidateVerdict } from "./vision-gate.js";

/**
 * How the curated sets grow, without anything promoting itself.
 *
 * The curated rungs are the most predictable part of the ladder and the smallest: nine sport
 * photographs and about twenty-three scenes, each opened at 640px by a person before it was
 * written down. That review is the whole guarantee, so nothing here shortcuts it. What this does
 * is stop the search rung's best work from evaporating: a photograph the gate scored highly with
 * no vetoes ran on the site once and then was forgotten, and the next article on the same subject
 * started from nothing.
 *
 * A proposal is an unchecked line in a file the owner reads. Ticking one means a later session
 * moves it into `ILLUSTRATIVE_SCENES` or `ILLUSTRATIVE_SPORT_PHOTOGRAPHS` under the existing
 * curation rule — looked at, at 640px, no recognisable face. The promotion is a human-triggered
 * edit and stays one.
 */

/** The bar a photograph clears to be worth proposing. Above the ship threshold, deliberately. */
export const PROPOSAL_FIT_THRESHOLD = 8;

/**
 * How many open proposals the file may hold before appends stop.
 *
 * A review queue nobody can finish is a review queue nobody starts. Twenty is about one sitting.
 * Past that the append is skipped in silence: the alternative is a warning every run about a
 * backlog the run cannot do anything about.
 */
export const MAX_OPEN_PROPOSALS = 20;

export function sceneProposalsPath(venture: "caught-up" | "mma-files"): string {
  return `ventures/${venture}/media/scene-proposals.md`;
}

const HEADER = (venture: string) => `# Curated scene proposals — ${venture}

Photographs the vision gate scored highly on the licensed search rung. Each ran above a published
article once. Tick one to nominate it for the curated set: a later session opens it at 640px,
checks that no face in it is recognisable, writes the Czech scene line it will ship with, and
moves it into the curated list. Nothing here is used until that happens.
`;

export interface SceneProposal {
  provider: string;
  candidateId: string;
  title: string;
  sourceUrl: string;
  license: string;
  fit: number;
  reason: string;
  sceneCs: string;
}

/** One proposal as the file holds it. Kept to a single line so the cap can count lines. */
export function renderSceneProposal(proposal: SceneProposal): string {
  const scene = proposal.sceneCs.replace(/\s+/gu, " ").trim();
  const reason = proposal.reason.replace(/\s+/gu, " ").trim();
  return `- [ ] **${proposal.title}** — ${proposal.provider} \`${proposal.candidateId}\`, ${proposal.license}, fit ${proposal.fit}. Scéna: ${scene} Gate: ${reason} <${proposal.sourceUrl}>`;
}

function openProposalCount(current: string): number {
  return (current.match(/^- \[ \] /gmu) ?? []).length;
}

/**
 * Add one proposal, or do nothing.
 *
 * Nothing happens when the gate did not score it highly enough, when it recorded any veto at all,
 * when it wrote no Czech scene line, when the file already names this photograph, or when the
 * queue is full. Returns whether a line was written, so a run report can say so.
 */
export async function proposeCuratedScene(input: {
  root: string;
  venture: "caught-up" | "mma-files";
  candidate: LicensedPhotoCandidate;
  verdict: GateCandidateVerdict;
}): Promise<boolean> {
  const { verdict, candidate } = input;
  if (verdict.vetoes.length > 0) return false;
  if (verdict.fit < PROPOSAL_FIT_THRESHOLD) return false;
  const sceneCs = verdict.sceneCs?.trim();
  if (!sceneCs) return false;

  const relative = sceneProposalsPath(input.venture);
  const current = await readText(input.root, relative, "")
    || HEADER(input.venture === "caught-up" ? "DNESKAi" : "MMA Files");
  // A photograph the search keeps returning would otherwise fill the queue with itself.
  if (current.includes(candidate.sourceUrl)) return false;
  if (openProposalCount(current) >= MAX_OPEN_PROPOSALS) return false;

  const line = renderSceneProposal({
    provider: candidate.provider,
    candidateId: candidate.id,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    // As validated, not as claimed: this is the licence the candidate passed the validator with.
    license: candidate.license,
    fit: verdict.fit,
    reason: verdict.reason,
    sceneCs
  });
  await atomicWriteText(input.root, relative, `${current.trimEnd()}\n${line}\n`);
  return true;
}
