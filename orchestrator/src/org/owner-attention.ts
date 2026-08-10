import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  OWNER_ATTENTION_PATH,
  OwnerAttentionSchema,
  type OwnerAttention
} from "../contracts/owner-attention.js";
import { atomicWriteJson } from "../state.js";

/**
 * The owner-attention collector: deterministic, free, and run every cycle.
 *
 * No model calls, so it costs nothing and sits outside the model share. It reads three sources and
 * writes one file:
 *
 *   `state/INBOX.md` — every unchecked HUMAN_APPROVAL entry becomes an approval.
 *   `docs/NEEDED.md` — every unchecked `[owner:me]` task becomes a manual task.
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
  "APIFY-ACCOUNT-001": {
    plain: "GoVIRAL's Monday meeting has no trend data until an Apify account exists on the free plan.",
    steps: ["Sign up at apify.com on the Free plan — no card", "Copy the API token", "Add APIFY_TOKEN to the repository's Actions secrets"],
    urgency: "blocking"
  },
  "DISPATCH-TOKEN-001": {
    plain: "The council's meetings start whenever GitHub's queue gets to them until a dispatch token exists.",
    steps: ["Create a fine-grained token for this repository with Actions read/write", "Add it and a cron secret to the quorum-site Vercel project"],
    urgency: "soon"
  },
  ADMIN_USER: {
    plain: "The admin door will not open in production until a username and password are set.",
    steps: ["Open the quorum-site project in Vercel", "Add ADMIN_USER and ADMIN_PASSWORD to Production", "Redeploy"],
    urgency: "blocking"
  },
  ADMIN_PASSWORD: {
    plain: "The admin door will not open in production until a username and password are set.",
    steps: ["Open the quorum-site project in Vercel", "Add ADMIN_USER and ADMIN_PASSWORD to Production", "Redeploy"],
    urgency: "blocking"
  },
  BOARDLESSAI_GITHUB_TOKEN: {
    plain: "Nothing you save in the admin can be written back to the repository without this token.",
    steps: ["Create a fine-grained token with Contents read/write on this repository", "Add BOARDLESSAI_GITHUB_TOKEN to the site's Production environment"],
    urgency: "blocking"
  },
  APIFY_TOKEN: {
    plain: "GoVIRAL's Monday meeting has no trend data until an Apify account exists on the free plan.",
    steps: ["Sign up at apify.com on the Free plan — no card", "Copy the API token", "Add APIFY_TOKEN to the repository's Actions secrets"],
    urgency: "blocking"
  },
  THE_ODDS_API_KEY: {
    plain: "FightAIQ has no price source to check its model against, so its readiness files stay empty.",
    steps: ["Get a free key at the-odds-api.com", "Add THE_ODDS_API_KEY to the repository's Actions secrets"],
    urgency: "soon"
  },
  PODCASTINDEX_API_KEY: {
    plain: "A few podcast shows cannot be resolved without this free key pair; the rest of the stream works without it.",
    steps: ["Register at api.podcastindex.org", "Add PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET to Actions secrets"],
    urgency: "whenever"
  },
  CAUGHT_UP_STREAMS_ENABLED: {
    plain: "DNESKAi's 'what people are talking about' and podcast pages stay empty until this switch is on.",
    steps: ["Set the Actions variable CAUGHT_UP_STREAMS_ENABLED to true"],
    urgency: "soon"
  },
  FAL_KEY: {
    plain: "Rendered illustrations and the Titty Tuesdays image pipeline stay off without this key.",
    steps: ["Create a fal.ai key", "Add FAL_KEY to the repository's Actions secrets"],
    urgency: "whenever"
  }
};

/** Runtime probes: presence only. The value is never read, never logged, never recorded. */
const RUNTIME_PROBES: ReadonlyArray<{ id: string; title: string; kind: "secret" | "switch" }> = [
  { id: "ADMIN_USER", title: "Admin username is not set in production", kind: "secret" },
  { id: "ADMIN_PASSWORD", title: "Admin password is not set in production", kind: "secret" },
  { id: "BOARDLESSAI_GITHUB_TOKEN", title: "The admin cannot write back to the repository", kind: "secret" },
  { id: "THE_ODDS_API_KEY", title: "FightAIQ has no odds source", kind: "secret" },
  { id: "APIFY_TOKEN", title: "GoVIRAL has no trend data source", kind: "secret" },
  { id: "PODCASTINDEX_API_KEY", title: "Podcast Index key pair is missing", kind: "secret" },
  { id: "PODCASTINDEX_API_SECRET", title: "Podcast Index key pair is missing", kind: "secret" },
  { id: "FAL_KEY", title: "No image rendering key is configured", kind: "secret" },
  { id: "CAUGHT_UP_STREAMS_ENABLED", title: "The DNESKAi streams are switched off", kind: "switch" }
];

function isoDay(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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
    const known = PLAIN_COPY[ref];
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

/** Unchecked `[owner:me]` tasks. `[owner:ai]` is work this system does itself. */
export function parseNeededTasks(markdown: string): OwnerAttention["manualTasks"] {
  const tasks: OwnerAttention["manualTasks"] = [];
  // Entries wrap across lines, so split on the bullet rather than reading line by line.
  for (const block of markdown.split(/\n(?=- \[)/u)) {
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
    const missing = probe.kind === "switch"
      ? value !== "true" && value !== "1"
      : typeof value !== "string" || value.trim().length === 0;
    if (!missing) continue;
    const known = PLAIN_COPY[probe.id];
    // One entry per plain sentence: the two Podcast Index keys and the two admin credentials are
    // each one job for the owner, not two rows to tick off separately.
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
  const record = OwnerAttentionSchema.parse({
    schemaVersion: "owner-attention/1",
    generatedAt: input.now.toISOString(),
    approvals: parseInboxApprovals(inbox)
      .sort((left, right) => order[left.urgency] - order[right.urgency] || left.id.localeCompare(right.id)),
    manualTasks: [...byId.values()]
      .sort((left, right) => order[left.urgency] - order[right.urgency] || left.id.localeCompare(right.id))
  });

  await atomicWriteJson(input.stateRoot, OWNER_ATTENTION_PATH, record);
  return { path: OWNER_ATTENTION_PATH, record };
}

export { isoDay };
