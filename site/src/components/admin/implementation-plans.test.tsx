import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminImplementationProgress, type AdminImplementationProgress } from "@/lib/admin-implementation-plans";
import { ImplementationPlansView } from "./implementation-plans";

const roots: string[] = [];

async function portfolioFixture(): Promise<AdminImplementationProgress> {
  const root = await mkdtemp(path.join(os.tmpdir(), "implementation-plans-view-"));
  roots.push(root);
  const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/implementation-progress.valid.json"), "utf8")) as Record<string, unknown>;
  await mkdir(path.join(root, "state/programs"), { recursive: true });
  await writeFile(path.join(root, "state/programs/current.json"), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const parsed = await readAdminImplementationProgress(root);
  if (parsed.state !== "present") throw new Error("valid implementation progress fixture did not parse");
  const baseProgram = parsed.programs[0]!;
  const baseItem = parsed.items[0]!;
  const programs = Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    const id = `program-${number}`;
    const workItemIds = [`item-${number}`, ...(number <= 2 ? ["shared-work"] : [])];
    return {
      ...baseProgram,
      id,
      name: `Program ${number}`,
      parentIssueNumber: number,
      parentIssueUrl: `https://github.com/example/example/issues/${number}`,
      phases: [{ id: "release", name: "Release", workItemIds }],
      finalReleaseItemId: `item-${number}`,
      currentItemId: number === 1 ? "item-1" : null,
      nextUnblockedItemIds: number === 2 ? ["item-2"] : [],
      parallelSafeItemIds: number === 2 ? ["item-2"] : []
    };
  });
  const items = programs.map((program, index) => ({
    ...baseItem,
    id: `item-${index + 1}`,
    programRefs: [program.id],
    issueNumber: index + 1,
    issueUrl: `https://github.com/example/example/issues/${index + 1}`,
    title: `Program ${index + 1} release`,
    state: index === 0 ? "inconsistent" as const : index === 1 ? "held-optional" as const : baseItem.state,
    posture: index === 1 ? "held-optional" as const : baseItem.posture,
    discrepancies: index === 0 ? ["Issue closed without merge evidence."] : [],
    recommendedAction: index === 0 ? "Reconcile issue #1 with merge evidence." : baseItem.recommendedAction
  }));
  const shared = {
    ...baseItem,
    id: "shared-work",
    programRefs: ["program-1", "program-2"],
    issueNumber: 99,
    issueUrl: "https://github.com/example/example/issues/99",
    title: "Shared pipeline",
    state: "stale" as const,
    sharedWorkItemRef: "shared-work",
    stale: true
  };
  return { ...parsed, programs, items: [...items, shared], sharedItemIds: ["shared-work"] };
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("ImplementationPlansView", () => {
  it("renders the six-program portfolio and each shared item once", async () => {
    const html = renderToStaticMarkup(<ImplementationPlansView snapshot={await portfolioFixture()} />);
    expect(html.match(/Open program/g)).toHaveLength(6);
    expect(html.match(/Shared pipeline/g)).toHaveLength(1);
    expect(html).toContain("Inconsistent");
    expect(html).toContain("Held optional");
    expect(html).toContain("Stale evidence");
    expect(html).toContain('role="progressbar"');
  });

  it("shows one program's current, next and parallel-safe items", async () => {
    const html = renderToStaticMarkup(<ImplementationPlansView selectedProgramId="program-2" snapshot={await portfolioFixture()} />);
    expect(html).toContain("Program work (2)");
    expect(html).toContain("Next unblocked");
    expect(html).toContain("Parallel-safe");
    expect(html).toContain("Program 2 release");
    expect(html).toContain("Shared pipeline");
  });

  it("shows exact evidence, probes, discrepancies and a copyable recommended action", async () => {
    const html = renderToStaticMarkup(<ImplementationPlansView selectedItemId="item-1" snapshot={await portfolioFixture()} />);
    expect(html).toContain("Why this state");
    expect(html).toContain("Reconcile issue #1 with merge evidence.");
    expect(html).toContain("Verification probes (1)");
    expect(html).toContain("orchestrator/tests/contracts.test.ts");
    expect(html).toContain("Issue closed without merge evidence.");
    expect(html).toContain("Copy action");
    expect(html).toContain("Copy link");
  });
});
