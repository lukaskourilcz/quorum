import type { MarketingPlan } from "../contracts/marketing-plan.js";

function list(values: readonly string[]): string {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- None recorded";
}

export function renderMarketingPlanMarkdown(plan: MarketingPlan): string {
  const tactics = plan.tactics.map((tactic, index) => [
    `### ${index + 1}. ${tactic.type}`,
    "",
    tactic.description,
    "",
    "Assets needed:",
    list(tactic.assetsNeeded),
    "",
    `Platform note: ${tactic.platformPolicyNote}`,
    ...(tactic.legalityNote ? ["", `Legal note: ${tactic.legalityNote}`] : []),
    ...(tactic.estCostUsd !== undefined ? ["", `Estimated cost: USD ${tactic.estCostUsd.toFixed(2)} (estimate)`] : []),
  ].join("\n")).join("\n\n");
  return [
    `# ${plan.title}`,
    "",
    `> ${plan.summary}`,
    "",
    `Status: ${plan.status}`,
    `Source meeting: ${plan.originMeetingRef}`,
    `Venture: ${plan.ventureId}`,
    ...(plan.seasonId ? [`Season: ${plan.seasonId}`] : []),
    "",
    "## Objective",
    "",
    plan.objective,
    "",
    "## Campaign ideas",
    "",
    tactics,
    "",
    "## Suggested calendar",
    "",
    plan.calendar.map((item) => `- Week ${item.week}: ${item.focus}`).join("\n"),
    "",
    "## Audience files",
    "",
    list(plan.audienceRefs),
    "",
    "## How to judge it",
    "",
    list(plan.kpis),
    "",
    "## Approval boundary",
    "",
    "This is a planning file. It does not authorize publishing, paid ads, production, commerce, outreach or spending.",
    "",
  ].join("\n");
}
