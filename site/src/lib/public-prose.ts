import { publicAgentText } from "@/components/agent-language";
import { agentById, type AgentId } from "@/data/agents";

/**
 * Text that names the machine instead of talking to a reader.
 *
 * Three layers keep it off the site, and this is the middle one. The first is writing plain
 * sentences where the record is made, which is where the fix belongs; the third is the
 * replacement list in `agent-language.ts`, which can only rewrite what it already knows about.
 * A record that gets past the first layer with a CI path, a commit hash or a stop code in a
 * public field fails to parse here rather than reaching a page — the 5 August edition record
 * published a runner path, a 40-character hash and a failing command line, and every layer
 * downstream of the writer rendered it faithfully.
 *
 * The check runs on the text as it would render, after the plain-language pass: a record whose
 * codes all have plain words is fine, and only what would actually reach a reader is rejected.
 */
const machinePatterns: readonly RegExp[] = [
  /https?:\/\//i,
  /\/(?:home|work|runner|usr|var|tmp)\//i,
  /\b[0-9a-f]{10,}\b/i,
  // A shortened hash is still a hash. Seven hex characters on their own would catch ordinary
  // words ("defaced"), so this asks for the word that makes it one.
  /\bcommit\s+[0-9a-f]{7,}\b/i,
  // snake_case, in either case: `budget_exhausted`, `NEWSROOM_ONLY`.
  /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/,
  // Raw reference tokens: `idea-2026-08-05-bbffd7f5`, `agenda-1f7e454d7495c427`,
  // `source:the-odds-api:2026-08-05`, `event:ufc:event:…`. Hyphenated English is left alone.
  /\bidea-\d{4}-\d{2}-\d{2}-[0-9a-z]{6,}\b/i,
  /\bagenda-[0-9a-f]{8,}\b/i,
  /\b(?:source|meeting|event|idea|fighter|bout|slate|run|task):[a-z0-9][\w:.-]*/i,
  // An all-caps compound is always a code: `MMA-ANALYSIS`, `NO-EDITION`.
  /\b[A-Z]{2,}-[A-Z]{2,}\b/
];

/**
 * Bare all-caps words that name a state the system moves through, rather than emphasis.
 *
 * A lone shouted English word in a message is someone making a point; `EDITION` at the head of
 * a summary is the outcome field repeated at the reader. Everything with an underscore is
 * already caught above, so this list only needs the codes that are single plain words.
 */
const bareCodes = new Set([
  "EDITION", "PLAN", "MEMO", "HELD", "PAUSED", "FAILED", "SKIPPED", "IDEA", "VERDICT"
]);

function shoutedCodes(value: string): string[] {
  return (value.match(/\b[A-Z][A-Z_]{3,}\b/g) ?? []).filter(
    (token) => bareCodes.has(token) && !agentById.has(token as AgentId)
  );
}

/** Whether the rendered form of this text would show a reader machine wording. */
export function readsAsMachineText(value: string): boolean {
  const rendered = publicAgentText(value);
  return machinePatterns.some((pattern) => pattern.test(rendered)) || shoutedCodes(rendered).length > 0;
}
