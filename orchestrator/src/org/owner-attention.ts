import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  OWNER_ATTENTION_PATH,
  OwnerAttentionSchema,
  type OwnerAttention
} from "../contracts/owner-attention.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";

/**
 * The owner-attention collector: deterministic, free, and run every cycle.
 *
 * No model calls, so it costs nothing and sits outside the model share. It reads three sources and
 * writes one file:
 *
 *   `state/INBOX.md` — every unchecked HUMAN_APPROVAL entry becomes an approval.
 *   `docs/NEEDED.md` — every unchecked `[owner:me]` task outside the parked sections becomes a
 *     manual task.
 *   the environment — presence only, never a value, for the keys that gate a path.
 *
 * The environment probes follow the `ImageProgramReadiness` posture exactly: they ask whether a
 * variable is set and they never read, log or record what is in it. A key's contents are not
 * information this file is allowed to carry.
 */

type Urgency = OwnerAttention["approvals"][number]["urgency"];

/**
 * Plain sentences for the refs we already know about.
 *
 * Hand-maintained on purpose: writing a sentence a non-technical owner can act on is a judgement,
 * not a transformation, and generating one would produce exactly the machine prose this replaces.
 * An unknown ref keeps its own title and is flagged, so the retro room can see the gap.
 */
const PLAIN_COPY: Readonly<Record<string, { plain: string; steps?: string[]; urgency?: Urgency }>> = {
  /*
   * Two prefix entries, for the only ids this system mints itself. The trailing hyphen is what
   * marks a key as a prefix; every other key here is an exact ref and stays one.
   */
  "BUDGET-PACE-": {
    plain: "The month's all-in spending has passed 80% of the $50 limit. Nothing is blocked and no approval is needed — this is the early notice, and spending stops on its own at the limit.",
    steps: ["Read the per-project breakdown in the item", "Decide now if any project should slow down, or do nothing and let the limit stop it"],
    urgency: "soon"
  },
  "BUDGET-EXHAUSTED-": {
    plain: "The month's all-in limit is spent, so the office is read-only: everything stays readable and nothing further will be paid for until the next month.",
    steps: ["Read the per-project breakdown in the item", "Review state/decisions/2026-08-04-budget-fifty.md before changing any number", "Countersign a new limit, or leave the work paused until the month turns"],
    urgency: "blocking"
  },
  "APIFY-ACCOUNT-001": {
    plain: "GoVIRAL's Monday meeting has no trend data until the Apify API token is in the repository's Actions secrets.",
    steps: ["Sign in at apify.com and open Settings, then API & Integrations", "Copy the API token", "Add APIFY_TOKEN to the repository's Actions secrets"],
    urgency: "blocking"
  },
  "DISPATCH-TOKEN-001": {
    plain: "The council's meetings start whenever GitHub's queue gets to them until a dispatch token exists.",
    steps: ["Create a fine-grained token for this repository with Actions read/write", "Add it and a cron secret to the quorum-site Vercel project"],
    urgency: "soon"
  },
  "BH-RESEARCH-001": {
    plain: "BOOKSOFHISTORY research stays on its $0 path until you allow the existing guarded search adapter, capped at $0.50 per cycle and $5.00 per month.",
    steps: ["Review the named provider, search and evidence limits", "Countersign BH-RESEARCH-001 in state/INBOX.md"],
    urgency: "blocking"
  },
  "BH-SEED-002": {
    plain: "The authored 200-book shortlist seed cannot become accepted routing context until you confirm that its scores are priors, never publication evidence or cover-art authority.",
    steps: ["Review the seed's prior-not-fact and no-cover rules", "Countersign BH-SEED-002 in state/INBOX.md"],
    urgency: "soon"
  },
  "BH-ACCOUNTS-003": {
    plain: "BOOKSOFHISTORY has no public profile until you clear its Czech and English handles and create any chosen accounts yourself.",
    steps: ["Clear the name and handles", "Record the chosen Czech and English lanes", "Countersign BH-ACCOUNTS-003 before creating anything"],
    urgency: "soon"
  },
  "BH-RESULTS-004": {
    plain: "BOOKSOFHISTORY result entry stays disabled until you allow manual per-post numbers; no platform or analytics fetch is part of the approval.",
    steps: ["Review the manual-only D9 measurement boundary", "Countersign BH-RESULTS-004 in state/INBOX.md"],
    urgency: "soon"
  },
  "BOOK-SOURCE-001": {
    plain: "Door Money cannot read the private source until you record its local path outside the public repository; the public checkout will retain only bounded derivatives.",
    steps: ["Place the source in the approved private location", "Record the path without committing source text", "Countersign BOOK-SOURCE-001"],
    urgency: "blocking"
  },
  "BOOK-INGEST-002": {
    plain: "Door Money's one-time private ingestion stays off until you approve its $3.00 program cap, $0.80 daily cap and existing per-call ceiling.",
    steps: ["Review the private-storage and budget boundaries", "Countersign BOOK-INGEST-002", "Start ingestion manually only when the private source is ready"],
    urgency: "blocking"
  },
  "DM-ACCOUNTS-003": {
    plain: "Door Money has no public account until you clear its name and choose and create any channels yourself; signing grants no posting automation.",
    steps: ["Complete the handle and collision check", "Choose any future channels", "Countersign DM-ACCOUNTS-003 before creating anything"],
    urgency: "soon"
  },
  "DM-RESULTS-004": {
    plain: "Door Money result entry stays disabled until you allow owner-entered numbers after a manual post; automated analytics remains forbidden.",
    steps: ["Review the manual-only D9 measurement boundary", "Countersign DM-RESULTS-004 in state/INBOX.md"],
    urgency: "soon"
  },
  "TS-SNAPSHOT-001": {
    plain: "Tehdejší svět cannot accept its hand-copied facts snapshot until you confirm the hash, exclusions and permanent no-product-connection boundary.",
    steps: ["Review the committed facts snapshot and exclusions", "Countersign TS-SNAPSHOT-001 in state/INBOX.md"],
    urgency: "blocking"
  },
  "TS-MEDIA-002": {
    plain: "Tehdejší svět city photographs stay out of social cards until you approve the nineteen recorded licensed files and their required attributions.",
    steps: ["Review the eligible file and licence list", "Countersign TS-MEDIA-002 in state/INBOX.md"],
    urgency: "soon"
  },
  "TS-ACCOUNTS-003": {
    plain: "Tehdejší svět has no public profile until you clear its handles and create any bilingual accounts yourself after the production-domain prerequisite.",
    steps: ["Confirm the production domain and clear the handle", "Review the bilingual bio", "Countersign TS-ACCOUNTS-003 before creating anything"],
    urgency: "soon"
  },
  "TS-RESEARCH-004": {
    plain: "Tehdejší svět paid research stays off until you approve the existing guarded provider at $0.30 per brief and $2.00 per month.",
    steps: ["Review the research priorities and evidence boundary", "Countersign TS-RESEARCH-004 in state/INBOX.md"],
    urgency: "blocking"
  },
  "TS-RESULTS-005": {
    plain: "Tehdejší svět results and selected comment recollections stay disabled until you approve owner-only entry; no automatic collection is allowed.",
    steps: ["Review the manual-only D9 measurement boundary", "Countersign TS-RESULTS-005 in state/INBOX.md"],
    urgency: "soon"
  },
  "KV-APIFY-001": {
    plain: "Kvórum's public-page monitor stays at $0 until you approve one pinned logged-out actor, one page, thirty rows, a 30-day purge and the existing $2.00 monthly share.",
    steps: ["Review the pinned actor and single-page scope", "Confirm APIFY-ACCOUNT-001 remains a separate prerequisite", "Countersign KV-APIFY-001"],
    urgency: "blocking"
  },
  "KV-SOURCES-002": {
    plain: "Kvórum's seven free news and official feeds stay closed until you approve every exact host; no unlisted endpoint inherits that approval.",
    steps: ["Review config/kvorum-sources.json and the allowlist", "Countersign KV-SOURCES-002 in state/INBOX.md"],
    urgency: "blocking"
  },
  "KV-ACCOUNTS-003": {
    plain: "Kvórum has no public identity or account until you clear the name and handles and create any chosen profiles yourself with the AI-assistance disclosure.",
    steps: ["Clear the name and handles", "Review the disclosure bio", "Countersign KV-ACCOUNTS-003 before creating anything"],
    urgency: "soon"
  },
  "KV-EDITORIAL-004": {
    plain: "Kvórum's political drafts cannot claim an owner-adopted editorial policy until you countersign the already enforced nonpartisan, sourced and correction-first rules.",
    steps: ["Review the editorial constitution in state/INBOX.md", "Countersign KV-EDITORIAL-004; this grants no source, account or publishing authority"],
    urgency: "blocking"
  },
  "DEVSHARK-SOCIAL-003": {
    plain: "devShark's LinkedIn, Instagram and Threads posts need a free Buffer account, a Meta developer app and Actions write on the Admin's GitHub token before any profile can be connected.",
    steps: ["Read the scope in state/INBOX.md and tick DEVSHARK-SOCIAL-003", "Create the Buffer account and the Meta app, then store the keys and ids as NEEDED.md says"],
    urgency: "soon"
  },
  "DEVSHARK-SOCIAL-001": {
    plain: "No devShark post can go out, even one you approve in the Queue, until you allow the three devShark connections to publish owner-approved posts.",
    steps: ["Connect the three profiles and wait for three drafted packages", "Tick DEVSHARK-SOCIAL-001 in state/INBOX.md in your own commit"],
    urgency: "soon"
  },
  "DEVSHARK-SOCIAL-002": {
    plain: "The LinkedIn, Instagram and Threads channels stay in draft mode until you allow them to publish, so approved devShark posts wait.",
    steps: ["Tick DEVSHARK-SOCIAL-001 first", "Then tick DEVSHARK-SOCIAL-002 in state/INBOX.md in your own commit"],
    urgency: "soon"
  },
  APIFY_TOKEN: {
    plain: "GoVIRAL's Monday meeting has no trend data until the Apify API token is in the repository's Actions secrets.",
    steps: ["Sign in at apify.com and open Settings, then API & Integrations", "Copy the API token", "Add APIFY_TOKEN to the repository's Actions secrets"],
    urgency: "blocking"
  },
  FAL_KEY: {
    plain: "Without this key DNESKAi skips its illustration rung, so an article with no usable photograph gets the drawn FRAME plate.",
    steps: ["Create a fal.ai key", "Add FAL_KEY to the repository's Actions secrets"],
    urgency: "whenever"
  }
};

/**
 * Runtime probes: presence only. The value is never read, never logged, never recorded.
 *
 * The collector runs in the cycle job's "Run cycle" step, so a probe can only see a key that job
 * maps in its `env:` in `.github/workflows/cycle.yml`, and the collector's test holds every id here
 * to that. The 2026-09-26 sweep removed the probes that could never pass, because each one sat in
 * the admin as a permanent "Waiting for you" row:
 *
 * - `ADMIN_USER`, `ADMIN_PASSWORD` and `BOARDLESSAI_GITHUB_TOKEN` live on the Vercel project, and
 *   no workflow maps them.
 * - `CAUGHT_UP_STREAMS_ENABLED` reaches only the stream step's `if:`, and `PODCASTINDEX_API_KEY`
 *   and `PODCASTINDEX_API_SECRET` only the stream step's own `env:`. The Podcast Index job is one
 *   entry in `docs/NEEDED.md`.
 * - `THE_ODDS_API_KEY` serves FightAIQ alone, which is paused (`operations-2026-09b`). Whoever
 *   resumes FightAIQ restores this probe in the change that returns its switches to `cycle.yml`.
 */
// Apify social collection is retired; a missing token is intentional, not owner work.
const RUNTIME_PROBES: ReadonlyArray<{ id: string; title: string }> = [
  { id: "FAL_KEY", title: "No image rendering key is configured" }
];

function isoDay(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * The curated sentence for a ref, by exact id first and then by the longest matching prefix.
 *
 * Every entry in PLAIN_COPY is a fixed id, which is right for the approvals a human writes by
 * hand. It is wrong for the ones this system opens itself: the budget items carry the month in
 * their id, `BUDGET-EXHAUSTED-2026-08`, so the exact lookup could never match and the one item
 * that says the company has stopped spending reached the owner's admin flagged "no plain
 * description yet" — the only item on the page with no explanation of what to do about it.
 * Longest match wins so a future exact id always beats a prefix.
 */
function curatedCopy(ref: string): (typeof PLAIN_COPY)[string] | undefined {
  const exact = PLAIN_COPY[ref];
  if (exact) return exact;
  let best: { key: string; value: (typeof PLAIN_COPY)[string] } | undefined;
  for (const [key, value] of Object.entries(PLAIN_COPY)) {
    if (!key.endsWith("-") || !ref.startsWith(key)) continue;
    if (!best || key.length > best.key.length) best = { key, value };
  }
  return best?.value;
}

/**
 * Unchecked HUMAN_APPROVAL entries.
 *
 * The inbox is markdown a human writes, so the parse is deliberately narrow: a `- [ ]` line whose
 * first token after the box is HUMAN_APPROVAL, and the ref that follows it. A line that does not
 * match is not an approval, and guessing at one would put words in the owner's mouth.
 */
export function parseInboxApprovals(markdown: string): OwnerAttention["approvals"] {
  const approvals: OwnerAttention["approvals"] = [];
  const lines = markdown.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match = /^- \[ \] HUMAN_APPROVAL ([A-Z0-9-]+)\s*(?:—|-)?\s*(.*)$/u.exec(line.trim());
    if (!match) continue;
    const [, ref = "", rest = ""] = match;
    // The title runs to the end of the sentence, which may wrap onto the following lines.
    let title = rest.trim();
    for (let ahead = index + 1; ahead < lines.length && title.length < 200; ahead += 1) {
      const next = lines[ahead]?.trim() ?? "";
      if (!next || next.startsWith("- ") || next.startsWith("#") || next.startsWith("What this approves")) break;
      title = `${title} ${next}`.trim();
    }
    const known = curatedCopy(ref);
    approvals.push({
      id: ref,
      title: title.slice(0, 280) || ref,
      plain: known?.plain ?? (title.slice(0, 400) || ref),
      source: { kind: "inbox", ref: `state/INBOX.md#${ref}` },
      since: null,
      urgency: known?.urgency ?? "soon",
      ...(known ? {} : { needsPlainCopy: true })
    });
  }
  return approvals;
}

/**
 * The `docs/NEEDED.md` sections whose entries wait for a venture or a focus to come back.
 *
 * A paused venture's items live under "On hold — paused ventures", and work outside the current
 * focus under "Parked — outside the current focus" (2026-09-26). They stay in the one owner
 * document, so whoever resumes a venture finds its list there, and nothing in them waits on the
 * owner today. A section runs from its `## ` heading to the next one, `### ` subsections included.
 */
const PARKED_SECTION = /^## (?:On hold|Parked)\b/u;

/**
 * Adds an owner item to `docs/NEEDED.md` where this collector reads it: above the parked sections.
 *
 * The parked sections close the file, so a writer that appends at the end files its item under a
 * paused venture, and "Waiting for you" never shows it. With no parked section, it appends.
 */
export function insertNeededItem(markdown: string, item: string): string {
  const parked = new RegExp(PARKED_SECTION.source, "mu").exec(markdown);
  if (!parked) return `${markdown.trimEnd()}\n\n${item.trim()}\n`;
  return `${markdown.slice(0, parked.index).trimEnd()}\n\n${item.trim()}\n\n${markdown.slice(parked.index)}`;
}

/** Unchecked `[owner:me]` tasks outside the parked sections. `[owner:ai]` is work this system does itself. */
export function parseNeededTasks(markdown: string): OwnerAttention["manualTasks"] {
  const tasks: OwnerAttention["manualTasks"] = [];
  const active = markdown
    .split(/\n(?=## )/u)
    .filter((section) => !PARKED_SECTION.test(section))
    .join("\n");
  // Entries wrap across lines, so split on the bullet rather than reading line by line.
  for (const block of active.split(/\n(?=- \[)/u)) {
    if (!/^- \[ \]/u.test(block.trim())) continue;
    if (!/\[owner:me\]/u.test(block)) continue;
    const title = /\*\*(.+?)\*\*/su.exec(block)?.[1]?.replace(/[`]/gu, "").replace(/\s+/gu, " ").trim();
    if (!title) continue;
    const urgency: Urgency = /\[imp:5\]/u.test(block)
      ? "blocking"
      : /\[imp:[34]\]/u.test(block) ? "soon" : "whenever";
    /*
     * The description is the entry's own sentence, and it starts at the em dash.
     *
     * Cutting at the bold title instead left items reading "(and optionally `CITO_API_KEY`) — the
     * single unblock for…", because several entries carry a parenthetical between the title and
     * the dash. The house format is `**Title** … — description [markers]`, so the dash is the
     * boundary; an entry without one falls back to whatever follows the title. Markdown emphasis
     * and code ticks come out because this sentence is rendered as plain text in the admin.
     */
    const afterTitle = block
      .replace(/^- \[ \]\s*/u, "")
      .replace(/\*\*(.+?)\*\*/su, "")
      .split(/\[(?:imp|owner|time|kind):/u)[0] ?? "";
    const dash = afterTitle.indexOf("—");
    const description = (dash >= 0 ? afterTitle.slice(dash + 1) : afterTitle)
      .replace(/[`*]/gu, "")
      .replace(/\s+/gu, " ")
      .replace(/^[\s—-]+/u, "")
      .trim();
    tasks.push({
      id: title.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 100),
      title: title.slice(0, 280),
      plain: (description || title).slice(0, 400),
      steps: [],
      source: { kind: "needed", ref: "docs/NEEDED.md" },
      since: null,
      urgency
    });
  }
  return tasks;
}

/** Keys and switches that are not set. Presence only — a value is never touched. */
export function runtimeGaps(env: NodeJS.ProcessEnv): OwnerAttention["manualTasks"] {
  const gaps: OwnerAttention["manualTasks"] = [];
  const seen = new Set<string>();
  for (const probe of RUNTIME_PROBES) {
    const value = env[probe.id];
    if (typeof value === "string" && value.trim().length > 0) continue;
    const known = PLAIN_COPY[probe.id];
    // One entry per plain sentence: two keys that are one job for the owner share a sentence and
    // make one row to tick, not two.
    const key = known?.plain ?? probe.id;
    if (seen.has(key)) continue;
    seen.add(key);
    gaps.push({
      id: probe.id,
      title: probe.title,
      plain: known?.plain ?? `${probe.id} is not set.`,
      steps: known?.steps?.slice(0, 3) ?? [],
      source: { kind: "runtime", ref: probe.id },
      since: null,
      urgency: known?.urgency ?? "soon",
      ...(known ? {} : { needsPlainCopy: true })
    });
  }
  return gaps;
}

export async function collectOwnerAttention(input: {
  repoRoot: string;
  stateRoot: string;
  now: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<{ path: string; record: OwnerAttention }> {
  const read = async (file: string) => {
    try {
      return await readFile(file, "utf8");
    } catch {
      // A missing source is an empty source. The collector's own absence of input is not an error.
      return "";
    }
  };
  const [inbox, needed] = await Promise.all([
    read(path.join(input.stateRoot, "INBOX.md")),
    read(path.join(input.repoRoot, "docs", "NEEDED.md"))
  ]);

  const manualTasks = [
    ...runtimeGaps(input.env ?? process.env),
    ...parseNeededTasks(needed)
  ];
  // A NEEDED entry and a runtime probe often describe the same job. The probe wins, because it
  // knows whether the job is actually still outstanding.
  const byId = new Map<string, OwnerAttention["manualTasks"][number]>();
  for (const task of manualTasks) {
    if (!byId.has(task.id)) byId.set(task.id, task);
  }

  const order: Record<Urgency, number> = { blocking: 0, soon: 1, whenever: 2 };
  const record = await withFileLock(input.stateRoot, "owner-attention.writer.lock", async () => {
    const previous = OwnerAttentionSchema.safeParse(
      await readJson<unknown | null>(input.stateRoot, OWNER_ATTENTION_PATH, null)
    );
    const next = OwnerAttentionSchema.parse({
      schemaVersion: "owner-attention/1",
      generatedAt: input.now.toISOString(),
      approvals: parseInboxApprovals(inbox)
        .sort((left, right) => order[left.urgency] - order[right.urgency] || left.id.localeCompare(right.id)),
      manualTasks: [...byId.values()]
        .sort((left, right) => order[left.urgency] - order[right.urgency] || left.id.localeCompare(right.id)),
      operationalIncidents: previous.success ? previous.data.operationalIncidents ?? [] : []
    });
    await atomicWriteJson(input.stateRoot, OWNER_ATTENTION_PATH, next);
    return next;
  });
  return { path: OWNER_ATTENTION_PATH, record };
}

export async function recordOperationalIncident(input: {
  stateRoot: string;
  generatedAt: string;
  incident: NonNullable<OwnerAttention["operationalIncidents"]>[number];
}): Promise<OwnerAttention> {
  return withFileLock(input.stateRoot, "owner-attention.writer.lock", async () => {
    const currentValue = await readJson<unknown | null>(input.stateRoot, OWNER_ATTENTION_PATH, null);
    const current = OwnerAttentionSchema.safeParse(currentValue);
    const base: OwnerAttention = current.success ? current.data : {
      schemaVersion: "owner-attention/1",
      generatedAt: input.generatedAt,
      approvals: [],
      manualTasks: []
    };
    const incidents = [...(base.operationalIncidents ?? [])];
    const existing = incidents.findIndex((candidate) =>
      candidate.conditionKey === input.incident.conditionKey && candidate.status === "active");
    if (existing >= 0) {
      const previous = incidents[existing]!;
      incidents[existing] = {
        ...input.incident,
        incidentId: previous.incidentId,
        firstSeenAt: previous.firstSeenAt,
        evidenceRefs: [...new Set([...previous.evidenceRefs, ...input.incident.evidenceRefs])].sort().slice(0, 24),
        correctionHistory: previous.correctionHistory
      };
    } else {
      incidents.push(input.incident);
    }
    const next = OwnerAttentionSchema.parse({
      ...base,
      generatedAt: input.generatedAt,
      operationalIncidents: incidents.sort((left, right) => left.conditionKey.localeCompare(right.conditionKey)).slice(-100)
    });
    await atomicWriteJson(input.stateRoot, OWNER_ATTENTION_PATH, next);
    return next;
  });
}

export { isoDay };
