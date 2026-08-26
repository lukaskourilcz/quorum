import { createHash } from "node:crypto";
import {
  ImplementationProgressSchema,
  type ImplementationGitHubEvidence,
  type ImplementationManifestRegistry,
  type ImplementationProbeResult,
  type ImplementationProgress,
  type ImplementationProgressItem,
  type ImplementationProgramProgress,
  type ImplementationWorkItem
} from "../contracts/implementation-program.js";

const STATES = [
  "not-started", "ready", "in-progress", "implemented-awaiting-verification", "owner-action",
  "blocked", "complete", "held-optional", "stale", "inconsistent", "superseded"
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function itemOrder(registry: ImplementationManifestRegistry): Map<string, number> {
  return new Map(registry.workItems.map((item, index) => [item.id, index]));
}

function probeSummary(probes: readonly ImplementationProbeResult[]): {
  complete: boolean;
  passed: boolean;
  ownerTask: boolean;
  malformed: number;
} {
  return {
    complete: probes.every((probe) => probe.status !== "unavailable"),
    passed: probes.every((probe) => probe.status === "pass"),
    ownerTask: probes.some((probe) => probe.status === "pass" && probe.probeId.includes("owner")),
    malformed: probes.filter((probe) => probe.status === "unavailable").length
  };
}

function baseState(input: {
  item: ImplementationWorkItem;
  github: ImplementationGitHubEvidence;
  probes: readonly ImplementationProbeResult[];
  blockerItemIds: string[];
}): Pick<ImplementationProgressItem, "state" | "explanation" | "ownerActions" | "discrepancies"> {
  const { item, github, probes, blockerItemIds } = input;
  const merged = github.pullRequests.some((pull) => pull.merged) && github.baseBranchContainsMerge !== false;
  const openPull = github.pullRequests.some((pull) => pull.state === "open");
  const checksFailed = github.pullRequests.some((pull) => pull.checksPassed === false);
  const required = probes.filter((probe) => item.completionPolicy.requiredProbeIds.includes(probe.probeId));
  const evidence = probeSummary(required);
  const ownerProbe = item.probes.find((probe) => probe.kind === "owner-task" && required.some((result) => result.probeId === probe.id && result.status === "pass"));
  if (item.supersededBy) {
    return { state: "superseded", explanation: `Superseded by ${item.supersededBy}.`, ownerActions: [], discrepancies: [] };
  }
  if (!github.issue) {
    return { state: "stale", explanation: "Live issue evidence is unavailable; the last valid item evidence is retained.", ownerActions: [], discrepancies: github.errors };
  }
  if (ownerProbe) {
    const classes = item.ownerOnlySetupClasses.join(", ") || "owner setup";
    return { state: "owner-action", explanation: `Implementation is waiting for owner-only ${classes}.`, ownerActions: [ownerProbe.description], discrepancies: [] };
  }
  if (github.issue.state === "closed") {
    const discrepancies: string[] = [];
    if (item.completionPolicy.requiresMergedPullRequest && !merged) discrepancies.push("Issue is closed without a linked merged pull request on the configured base branch.");
    if (!evidence.passed) discrepancies.push("Issue is closed but one or more required repository/test/release probes do not pass.");
    if (checksFailed) discrepancies.push("A linked pull request has failing checks.");
    return discrepancies.length
      ? { state: "inconsistent", explanation: discrepancies.join(" "), ownerActions: [], discrepancies }
      : { state: "complete", explanation: "The issue is closed, its linked change is merged, and every required probe passes.", ownerActions: [], discrepancies: [] };
  }
  if (merged) {
    return {
      state: "implemented-awaiting-verification",
      explanation: evidence.passed
        ? "A linked change is merged and probes pass, but the issue remains open."
        : "A linked change is merged, but required verification evidence is incomplete.",
      ownerActions: [],
      discrepancies: checksFailed ? ["A linked pull request has failing checks."] : []
    };
  }
  if (openPull) {
    return { state: "in-progress", explanation: "A linked pull request is open; opening it does not count as completion.", ownerActions: [], discrepancies: checksFailed ? ["The open pull request has failing checks."] : [] };
  }
  if (evidence.passed && required.length > 0) {
    return { state: "implemented-awaiting-verification", explanation: "Declared repository evidence exists, but no linked merged pull request and issue closure prove completion.", ownerActions: [], discrepancies: [] };
  }
  if (item.posture === "held-optional") {
    return { state: "held-optional", explanation: "This optional item is intentionally held and does not reduce mandatory completion.", ownerActions: [], discrepancies: [] };
  }
  if (blockerItemIds.length > 0) {
    return { state: "blocked", explanation: `Blocked by ${blockerItemIds.join(", ")}.`, ownerActions: [], discrepancies: [] };
  }
  return { state: "ready", explanation: "All registered dependencies are complete and no implementation evidence is active yet.", ownerActions: [], discrepancies: [] };
}

function recommendedAction(item: ImplementationWorkItem, state: ImplementationProgressItem["state"]): string {
  if (state === "complete") return "No action required; retain the evidence and watch for regressions.";
  if (state === "owner-action") return `Open the canonical owner task for issue #${item.issue.number}.`;
  if (state === "held-optional") return "Leave held unless the owner explicitly activates this optional scope.";
  if (state === "inconsistent") return `Reconcile issue #${item.issue.number} with its missing merge or probe evidence.`;
  if (state === "stale") return "Refresh the canonical progress snapshot; do not infer a replacement state.";
  if (state === "blocked") return "Complete the listed dependency items before starting this scope.";
  if (state === "in-progress") return `Continue the linked pull request for issue #${item.issue.number}.`;
  if (state === "implemented-awaiting-verification") return `Run or record the missing evidence for issue #${item.issue.number}.`;
  if (state === "superseded") return `Continue with ${item.supersededBy}.`;
  return `Start issue #${item.issue.number} on a dedicated branch from the configured base branch.`;
}

function evidenceRefs(github: ImplementationGitHubEvidence, probes: readonly ImplementationProbeResult[]): string[] {
  return [
    ...(github.issue ? [github.issue.url] : []),
    ...github.pullRequests.map((pull) => pull.url),
    ...probes.flatMap((probe) => probe.evidenceRef ? [probe.evidenceRef] : [])
  ].filter((value, index, values) => values.indexOf(value) === index).slice(0, 60);
}

function stateCounts(items: readonly ImplementationProgressItem[]): ImplementationProgramProgress["stateCounts"] {
  return Object.fromEntries(STATES.map((state) => [state, items.filter((item) => item.state === state).length])) as ImplementationProgramProgress["stateCounts"];
}

export function deriveImplementationProgress(input: {
  registry: ImplementationManifestRegistry;
  githubEvidence: ReadonlyMap<string, ImplementationGitHubEvidence>;
  probeResults: ReadonlyMap<string, ImplementationProbeResult[]>;
  generatedAt: Date;
  github: ImplementationProgress["github"];
  boundedErrors?: string[];
  lastSuccessfulSyncAt: string | null;
}): ImplementationProgress {
  const order = itemOrder(input.registry);
  const pending = new Map(input.registry.workItems.map((item) => [item.id, item]));
  const derived = new Map<string, ImplementationProgressItem>();
  const fallbackEvidence = (item: ImplementationWorkItem): ImplementationGitHubEvidence => ({
    issue: null,
    pullRequests: [],
    baseBranchContainsMerge: null,
    fetchedAt: input.generatedAt.toISOString(),
    stale: true,
    errors: [`${item.id}: evidence missing from synchronizer`]
  });
  while (pending.size > 0) {
    let advanced = false;
    for (const [id, item] of pending) {
      const unresolved = item.dependencyIds.filter((dependencyId) => pending.has(dependencyId));
      if (unresolved.length > 0) continue;
      const blockerItemIds = item.dependencyIds.filter((dependencyId) => derived.get(dependencyId)?.state !== "complete");
      const github = input.githubEvidence.get(id) ?? fallbackEvidence(item);
      const probes = input.probeResults.get(id) ?? [];
      const state = baseState({ item, github, probes, blockerItemIds });
      derived.set(id, {
        itemId: id,
        programRefs: item.programRefs,
        issueNumber: item.issue.number,
        issueUrl: item.issue.url,
        title: item.issue.title,
        summary: item.issue.summary,
        phaseId: item.phaseId,
        posture: item.posture,
        dependencyIds: item.dependencyIds,
        safeParallelGroup: item.safeParallelGroup,
        protectedFileGroups: item.protectedFileGroups,
        expectedDeliverables: item.expectedDeliverables,
        ownerOnlySetupClasses: item.ownerOnlySetupClasses,
        weight: item.weight,
        finalGate: item.finalGate,
        sharedWorkItemRef: item.sharedWorkItemRef,
        supersededBy: item.supersededBy,
        ...state,
        github,
        probes,
        blockerItemIds,
        recommendedAction: recommendedAction(item, state.state),
        evidenceRefs: evidenceRefs(github, probes)
      });
      pending.delete(id);
      advanced = true;
    }
    if (advanced) continue;
    for (const [id, item] of pending) {
      const github = input.githubEvidence.get(id) ?? fallbackEvidence(item);
      const probes = input.probeResults.get(id) ?? [];
      const blockerItemIds = [...item.dependencyIds];
      derived.set(id, {
        itemId: id,
        programRefs: item.programRefs,
        issueNumber: item.issue.number,
        issueUrl: item.issue.url,
        title: item.issue.title,
        summary: item.issue.summary,
        phaseId: item.phaseId,
        posture: item.posture,
        dependencyIds: item.dependencyIds,
        safeParallelGroup: item.safeParallelGroup,
        protectedFileGroups: item.protectedFileGroups,
        expectedDeliverables: item.expectedDeliverables,
        ownerOnlySetupClasses: item.ownerOnlySetupClasses,
        weight: item.weight,
        finalGate: item.finalGate,
        sharedWorkItemRef: item.sharedWorkItemRef,
        supersededBy: item.supersededBy,
        state: "inconsistent",
        explanation: "The manifest dependency graph contains an unresolved cycle or reference.",
        github,
        probes,
        blockerItemIds,
        ownerActions: [],
        discrepancies: ["Unresolvable manifest dependency graph."],
        recommendedAction: "Correct the versioned manifest before scheduling work.",
        evidenceRefs: evidenceRefs(github, probes)
      });
      pending.delete(id);
    }
  }

  const active = [...derived.values()].filter((item) => item.state === "in-progress");
  for (const item of derived.values()) {
    if (item.state !== "ready") continue;
    const manifest = input.registry.workItems.find((candidate) => candidate.id === item.itemId)!;
    const collision = active.find((candidate) => {
      const other = input.registry.workItems.find((entry) => entry.id === candidate.itemId)!;
      return manifest.protectedFileGroups.some((group) => other.protectedFileGroups.includes(group));
    });
    if (collision) {
      item.state = "blocked";
      item.blockerItemIds = [...item.blockerItemIds, collision.itemId];
      item.explanation = `Blocked by the active protected-file collision with ${collision.itemId}.`;
      item.recommendedAction = "Wait for the active shared-file work to merge before starting this item.";
    }
  }

  const items = [...derived.values()].sort((left, right) => order.get(left.itemId)! - order.get(right.itemId)!);
  const programProgress = input.registry.programs.map((program): ImplementationProgramProgress => {
    const ids = program.phases.flatMap((phase) => phase.workItemIds);
    const programItems = ids.map((id) => derived.get(id)!).filter(Boolean);
    const mandatory = programItems.filter((item) => item.posture === "mandatory");
    const complete = mandatory.filter((item) => item.state === "complete");
    const weighted = ids.map((id) => input.registry.workItems.find((item) => item.id === id)!).filter((item) => item.posture === "mandatory");
    const finalGate = derived.get(program.finalReleaseItemId)!;
    const weightsValid = weighted.every((item) => item.weight !== null);
    const rawProgress = weightsValid
      ? weighted.filter((item) => derived.get(item.id)?.state === "complete").reduce((sum, item) => sum + item.weight!, 0) /
        weighted.reduce((sum, item) => sum + item.weight!, 0) * 100
      : null;
    const candidates = programItems.filter((item) => ["in-progress", "implemented-awaiting-verification", "inconsistent", "ready"].includes(item.state));
    const current = candidates[0] ?? null;
    const next = programItems.filter((item) => item.state === "ready");
    const parallel = next.filter((candidate) => {
      const manifest = input.registry.workItems.find((item) => item.id === candidate.itemId)!;
      if (!current) return true;
      const currentManifest = input.registry.workItems.find((item) => item.id === current.itemId)!;
      return !manifest.protectedFileGroups.some((group) => currentManifest.protectedFileGroups.includes(group));
    });
    return {
      programId: program.id,
      name: program.name,
      description: program.description,
      parentIssueNumber: program.parentIssue.number,
      parentIssueUrl: program.parentIssue.url,
      visibility: program.visibility,
      manifestVersion: program.manifestVersion,
      phases: program.phases,
      prerequisiteIssueNumbers: program.prerequisiteIssueNumbers,
      finalReleaseItemId: program.finalReleaseItemId,
      mandatoryCompleted: complete.length,
      mandatoryTotal: mandatory.length,
      weightedProgressPercent: rawProgress === null ? null : finalGate.state === "complete" ? Number(rawProgress.toFixed(2)) : Math.min(99, Number(rawProgress.toFixed(2))),
      stateCounts: stateCounts(programItems),
      currentItemId: current?.itemId ?? null,
      nextUnblockedItemIds: next.map((item) => item.itemId),
      parallelSafeItemIds: parallel.map((item) => item.itemId),
      ownerWaitingItemIds: programItems.filter((item) => item.state === "owner-action").map((item) => item.itemId),
      finalGateReady: finalGate.blockerItemIds.length === 0 && finalGate.state !== "complete",
      finalGateComplete: finalGate.state === "complete"
    };
  });
  const currentItemId = programProgress.map((program) => program.currentItemId).find(Boolean) ?? null;
  const nextUnblockedItemIds = [...new Set(programProgress.flatMap((program) => program.nextUnblockedItemIds))];
  const parallelSafeItemIds = [...new Set(programProgress.flatMap((program) => program.parallelSafeItemIds))];
  const ownerWaitingItemIds = [...new Set(programProgress.flatMap((program) => program.ownerWaitingItemIds))];
  const freshness = input.github.failedItems === items.length ? "unavailable" : input.github.failedItems > 0 ? "partial" : items.some((item) => item.github.stale) ? "stale" : "fresh";
  const canonical = {
    schemaVersion: "implementation-progress/1" as const,
    manifestVersion: input.registry.manifestVersion,
    generatedAt: input.generatedAt.toISOString(),
    sourceFreshness: freshness,
    github: input.github,
    programs: programProgress,
    items,
    sharedItemIds: input.registry.workItems.filter((item) => item.sharedWorkItemRef).map((item) => item.id),
    currentItemId,
    nextUnblockedItemIds,
    parallelSafeItemIds,
    ownerWaitingItemIds,
    malformedProbeCount: items.flatMap((item) => item.probes).filter((probe) => probe.status === "unavailable").length,
    boundedErrors: (input.boundedErrors ?? []).slice(0, 100),
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt
  };
  const digest = sha256(JSON.stringify(canonical));
  return ImplementationProgressSchema.parse({
    ...canonical,
    snapshotId: `programs-${digest.slice(0, 16)}`,
    snapshotHash: `sha256:${digest}`
  });
}
