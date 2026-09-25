import { factSheetFor, type Brand } from "./config.js";
import { violationReport, type GateViolation } from "./gates.js";
import { POST_KIND_ROLES, WRITER_FIELDS, writerRoles, type CopyField, type PostDeckKind } from "./kinds.js";
import { captionLimitLines, productFacts, trendSection } from "./packet.js";
import type { PostDayPlan } from "./post-plan.js";
import { postTemplateId } from "./post-render.js";
import { slotBudget } from "./render.js";

/**
 * CHUM's packet for a kind beyond the quiz (quorum#576): the brand, the product facts, today's
 * subject, the slides code has written, and the fields that are the writer's, each with the slot it
 * fills and that slot's own budget. Everything else about the post is decided already.
 */

const KIND_NAMES: Readonly<Record<PostDeckKind, string>> = {
  "feature-spotlight": "feature spotlight",
  "challenge-teaser": "challenge teaser",
  "this-week": "weekly note",
  announcement: "launch announcement"
};

/** The slot a field fills on a template, as the studio's post-deck mapping fills it. */
function slotFor(templateId: string, field: CopyField, closing: boolean): string | null {
  switch (templateId) {
    case "minimal-text-poster":
      return field === "headline" ? "poster-line" : closing ? null : "poster-note";
    case "quote-card":
    case "story-quote":
      return field === "headline" ? "attribution" : "quote";
    case "stat-highlight":
      return field === "headline" ? "stat" : "stat-label";
    case "quiz-question-context":
      return field === "headline" ? "question-line" : "option-a";
    default:
      return null;
  }
}

/** One line per field the writer fills, with the slot's own limit, so a retry is never the first word of it. */
export function writerFieldLines(brand: Brand, kind: PostDeckKind): string[] {
  const roles = POST_KIND_ROLES[kind] as readonly string[];
  const fields = WRITER_FIELDS[kind] as Partial<Record<string, readonly CopyField[]>>;
  return writerRoles(kind).flatMap((role) => {
    const templateId = postTemplateId(brand, kind, role);
    const closing = roles.indexOf(role) === roles.length - 1;
    return (fields[role] ?? []).map((field) => {
      const slot = slotFor(templateId, field, closing);
      if (!slot) return `${role} ${field}: not printed on this slide; leave it out`;
      const budget = slotBudget(templateId, slot);
      return `${role} ${field} ≤ ${budget.maxChars} characters on ${budget.maxLines} ${budget.maxLines === 1 ? "line" : "lines"}`;
    });
  });
}

export function postOutputShape(kind: PostDeckKind): string {
  const fields = WRITER_FIELDS[kind] as Partial<Record<string, readonly CopyField[]>>;
  const slides = writerRoles(kind).map((role) => {
    const owned = fields[role] ?? [];
    return `    { "role": "${role}"${owned.map((field) => `, "${field}": "string"`).join("")}, "alt": "string" }`;
  }).join(",\n");
  return `{
  "slides": [
${slides}
  ],
  "descriptions": {
    "instagram": { "en": "string" },
    "threads":   { "en": "string" },
    "linkedin":  { "en": "string" }
  },
  "hashtags": {
    "instagram": { "en": ["#tag", ...] },
    "threads":   { "en": ["topic"] },
    "linkedin":  { "en": ["#tag", ...] }
  }
}`;
}

export function buildPostPacket(input: {
  brand: Brand;
  plan: PostDayPlan;
  date: string;
  trendLines?: readonly string[];
  violations?: readonly GateViolation[];
}): string {
  const { brand, plan } = input;
  const facts = factSheetFor(brand, input.date);
  const roles = POST_KIND_ROLES[plan.kind] as readonly string[];
  const written = roles.flatMap((role, index) => {
    const slide = plan.codeSlides[role];
    if (!slide) return [];
    const owned = (WRITER_FIELDS[plan.kind] as Partial<Record<string, readonly CopyField[]>>)[role] ?? [];
    const parts = [
      owned.includes("headline") ? null : `headline ${JSON.stringify(slide.headline)}`,
      owned.includes("body") || !slide.body ? null : `body ${JSON.stringify(slide.body.replace(/\n/gu, " / "))}`
    ].filter(Boolean);
    return parts.length > 0 ? [`- slide ${index + 1} (${role}): ${parts.join(", ")}`] : [];
  });

  const sections = [
    `## Brand\n`
    + `id: ${brand.id}\n`
    + `name: ${brand.displayName}\n`
    + `tone: ${brand.tone}\n`
    + `languages: en (English only: write no Czech field at all)\n`
    + `product URL: ${brand.productUrl}\n`
    + `base Instagram hashtags EN: ${brand.hashtags.instagram.en.join(" ")}\n`
    + `Threads topic tag EN: ${brand.hashtags.threadsTopic.en}`,
    ...(facts ? [productFacts(facts)] : []),
    plan.brief,
    `## Slides code has written: do not return them\n${written.join("\n")}`,
    ...(plan.kind === "this-week" ? [] : trendSection(brand.displayName, input.trendLines, "this post")),
    `## Hard limits, checked in code after you answer\n`
    + `- return exactly these slides, in this order: ${writerRoles(plan.kind).join(", ")}\n`
    + writerFieldLines(brand, plan.kind).map((line) => `- ${line}\n`).join("")
    + `- every slide is rendered before anything is kept; text that would be clipped on the canvas fails the check\n`
    + `- no number anywhere in the post that the facts above do not contain\n`
    + (plan.kind === "challenge-teaser" ? `- no code on any slide or caption: no backticks, braces, arrows, declarations or method calls, and a call only as the prompt writes it\n` : "")
    + (plan.kind === "this-week" ? `- never the words trending, viral or engagement\n` : "")
    + captionLimitLines().trimEnd(),
    `## Return exactly this JSON and nothing else\n${postOutputShape(plan.kind)}`
  ];
  if (input.violations?.length) {
    sections.push(
      `## Your previous answer failed these checks — fix exactly these and return the whole object again\n`
      + violationReport(input.violations)
    );
  }
  return `## Today's post kind: ${KIND_NAMES[plan.kind]}\n\n${sections.join("\n\n")}`;
}
