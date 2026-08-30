import { createHash } from "node:crypto";
import {
  ContestCandidateSchema,
  type ContestCandidate,
  type ContestRecord,
  type SocialContestLead
} from "../../contracts/contest-radar.js";
import { canonicalizeUrl } from "./canonical.js";

/**
 * How an accepted social lead enters Contest Radar, and the one thing it is never allowed to become.
 *
 * A lead crosses this boundary as a `contest-candidate/1` with `discoveryOnly` provenance and no
 * hints beyond a language guess. That is a deliberate downgrade: the pilot's own extraction reads a
 * caption, and a caption is marketing copy written by the organizer. Letting its "do 31. 8." arrive
 * as a candidate `deadlineText` would put a date into the same field the WordPress listing's own
 * structured date arrives in, and by the time it reached a record nobody could tell which one the
 * owner was planning around.
 *
 * So the caption's quoted snippets stay on the lead, where their status and provenance travel with
 * them, and the candidate carries the URL. The rules page — read afterwards, by the extractor that
 * already exists — is what makes any of it a fact.
 *
 * **A lead is never entry-ready.** `contestReadinessForLead` returns `needs-detail` for every input
 * and has no branch that returns anything else. The seven pieces of evidence #414 requires before
 * entry-readiness (open state, mechanics, deadline, eligibility, organizer legitimacy, purchase
 * risk, official rules URL) all live on the rules page, and none of them can be established from a
 * post that merely mentions a contest.
 */

export const SOCIAL_LEAD_SOURCE_PREFIX = "goviral-social-pilot";

export function socialLeadSourceId(platform: SocialContestLead["platform"]): string {
  return `${SOCIAL_LEAD_SOURCE_PREFIX}-${platform}`;
}

export interface SocialLeadIntake {
  candidates: ContestCandidate[];
  /** Leads that never became candidates, each with the reason. Counted, not discarded. */
  skipped: Array<{ leadId: string; reason: string }>;
  /** Accepted leads the free sources already had. The pilot is scored on what it adds. */
  duplicates: number;
}

/**
 * Convert accepted leads into candidates, dropping everything the free path already knows.
 *
 * Deduplication runs against canonical URLs from both directions — the post's own URL and the
 * target it points at — because a Czech aggregator listing and an Instagram post about the same
 * giveaway are the same opportunity, and the aggregator's version cost nothing.
 */
export function intakeSocialContestLeads(input: {
  leads: readonly SocialContestLead[];
  /** Records the free structured sources already produced. */
  records?: readonly Pick<ContestRecord, "canonicalUrl" | "sourceRefs">[];
  now: Date;
}): SocialLeadIntake {
  const known = new Set<string>();
  for (const record of input.records ?? []) {
    known.add(canonicalizeUrl(record.canonicalUrl));
    for (const ref of record.sourceRefs) known.add(canonicalizeUrl(ref.listingUrl));
  }

  const candidates: ContestCandidate[] = [];
  const skipped: SocialLeadIntake["skipped"] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const lead of input.leads) {
    if (lead.status !== "accepted") {
      skipped.push({ leadId: lead.leadId, reason: `The lead is ${lead.status}: ${lead.statusReason}` });
      continue;
    }
    if (Date.parse(lead.expiresAt) <= input.now.getTime()) {
      skipped.push({ leadId: lead.leadId, reason: "The lead expired before it was consumed." });
      continue;
    }

    const canonical = canonicalizeUrl(lead.targetUrl ?? lead.url);
    const canonicalPost = canonicalizeUrl(lead.url);
    if (known.has(canonical) || known.has(canonicalPost)) {
      duplicates += 1;
      skipped.push({ leadId: lead.leadId, reason: "A free structured source already carries this contest." });
      continue;
    }
    if (seen.has(canonical)) {
      duplicates += 1;
      skipped.push({ leadId: lead.leadId, reason: "Another lead in the same run already pointed here." });
      continue;
    }
    seen.add(canonical);

    candidates.push(ContestCandidateSchema.parse({
      schemaVersion: "contest-candidate/1",
      sourceId: socialLeadSourceId(lead.platform),
      sourceItemId: lead.leadId,
      listingUrl: lead.url,
      targetUrl: lead.targetUrl,
      // A social post is not a rules surface until somebody establishes that it is one. Asserting
      // it here would satisfy the extractor's "has a rules URL" test with the post itself.
      rulesUrl: null,
      title: candidateTitle(lead),
      snippet: lead.caption.length > 0 ? lead.caption : null,
      organizer: null,
      hints: {
        track: "consumer",
        kind: null,
        language: lead.language,
        location: null,
        // The caption's quoted deadline and prize stay on the lead. See this module's header.
        prizeText: null,
        deadlineText: null,
        mechanics: []
      },
      observedAt: lead.observedAt,
      contentHash: lead.contentHash
    }));
  }

  return { candidates, skipped, duplicates };
}

/**
 * A title for something that has none.
 *
 * Social posts have captions, not titles. Using the first clause keeps the candidate legible in a
 * list while making no claim: it is quoted text, and the platform name in front of it says where
 * the quote came from.
 */
function candidateTitle(lead: SocialContestLead): string {
  const first = lead.caption.split(/[.!?\n]/u)[0]?.trim() ?? "";
  const body = first.length >= 8 ? first : lead.caption.trim();
  const label = body.length > 0 ? body : "Příspěvek bez popisku";
  return `${lead.platform === "instagram" ? "Instagram" : "TikTok"}: ${label}`.slice(0, 300);
}

/**
 * The readiness a lead-derived record may reach, which is one value.
 *
 * There is no branch. Entry-readiness requires evidence a caption cannot carry, and a function with
 * a single return is a clearer statement of that rule than a gate somebody could later widen.
 */
export function contestReadinessForLead(): "needs-detail" {
  return "needs-detail";
}

/** Stable identity for a lead-derived record, so re-running a fixture changes nothing. */
export function socialLeadRecordId(lead: SocialContestLead): string {
  const digest = createHash("sha256").update(canonicalizeUrl(lead.targetUrl ?? lead.url)).digest("hex");
  return `${socialLeadSourceId(lead.platform)}-${digest.slice(0, 16)}`;
}
