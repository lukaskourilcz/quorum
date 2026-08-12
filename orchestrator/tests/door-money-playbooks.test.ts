import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DoorMoneyPlaybookSchema } from "../src/contracts/door-money-playbook.js";
import { doorMoneyBookerEvidenceRefs } from "../src/ventures/door-money/growth-booker.js";
import {
  boundDoorMoneyGrowthMemory,
  DOOR_MONEY_MEMORY_REF_LIMIT,
  loadDoorMoneyGrowthMemory,
  preserveDoorMoneyActionCompletions,
  writeDoorMoneyGrowthPlaybooks,
  type DoorMoneyGrowthMemory,
  type DoorMoneyPlaybookProposal
} from "../src/ventures/door-money/growth-playbooks.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-playbooks-"));
  roots.push(root);
  return root;
}

async function json(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function proposal(id: string, evidenceRefs: string[]): DoorMoneyPlaybookProposal {
  return {
    id,
    channel: "Synthetic community",
    title: "Synthetic owner-led introduction",
    summary: "A fictional completion supports a shorter owner-reviewed introduction.",
    steps: ["Review the synthetic template.", "Choose whether to act outside this system."],
    evidenceRefs
  };
}

describe("Door Money growth playbooks", () => {
  it("caps growth memory at 99 refs, preferring newest completions then stable playbook ids", () => {
    const memory: DoorMoneyGrowthMemory = {
      ownerCompletions: Array.from({ length: 101 }, (_, index) => ({
        id: `completion:action-packet-2026-01-01:fixture-task-${index + 1}`,
        packetId: "action-packet-2026-01-01",
        taskId: `fixture-task-${index + 1}`,
        title: `Synthetic task ${index + 1}`,
        outcome: `Synthetic outcome ${index + 1}`,
        completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
      })),
      playbooks: ["zeta", "alpha", "middle"].map((id) => ({
        ref: `playbook:${id}:r1`, id, channel: "Synthetic", title: `Synthetic ${id}`,
        revision: 1, summary: "Synthetic summary.", steps: ["Synthetic step."],
        evidenceRefs: ["completion:action-packet-2026-01-01:fixture-task-1"],
        updatedAt: "2026-01-01T00:00:00.000Z"
      })),
      droppedPlaybooks: 0,
      droppedActionPackets: 0,
      omittedPlaybooks: 0,
      omittedOwnerCompletions: 0
    };

    const completionHeavy = boundDoorMoneyGrowthMemory(memory);
    expect(completionHeavy.ownerCompletions).toHaveLength(DOOR_MONEY_MEMORY_REF_LIMIT);
    expect(completionHeavy.ownerCompletions[0]?.taskId).toBe("fixture-task-101");
    expect(completionHeavy.ownerCompletions.at(-1)?.taskId).toBe("fixture-task-3");
    expect(completionHeavy.playbooks).toEqual([]);
    expect(completionHeavy).toMatchObject({ omittedOwnerCompletions: 2, omittedPlaybooks: 3 });
    expect(doorMoneyBookerEvidenceRefs(completionHeavy, {
      ref: "goviral-plan:plan-2026-01-01-weekly-brief",
      date: "2026-01-01",
      id: "plan-2026-01-01-weekly-brief",
      title: "Synthetic brief",
      summary: "Synthetic summary.",
      objective: "Synthetic objective.",
      tactics: [],
      status: "approved",
      originMeetingRef: "2026-01-01-gv-brief"
    })).toHaveLength(100);

    const withPlaybookRoom = boundDoorMoneyGrowthMemory({
      ...memory,
      ownerCompletions: memory.ownerCompletions.slice(0, 98)
    });
    expect(withPlaybookRoom.ownerCompletions).toHaveLength(98);
    expect(withPlaybookRoom.playbooks.map(({ id }) => id)).toEqual(["alpha"]);
    expect(withPlaybookRoom).toMatchObject({ omittedOwnerCompletions: 0, omittedPlaybooks: 2 });
  });

  it("rejects an uncited revision before writing any earlier proposal", async () => {
    const root = await temporaryRoot();
    const completion = "completion:action-packet-2026-08-13:fixture-review";
    const uncited = { ...proposal("uncited-playbook", []), evidenceRefs: [] } as DoorMoneyPlaybookProposal;
    await expect(writeDoorMoneyGrowthPlaybooks({
      root,
      cycleId: "fixture-cycle-1",
      now: new Date("2026-08-13T15:00:00.000Z"),
      proposals: [proposal("valid-playbook", [completion]), uncited],
      availableLearningRefs: new Set([completion])
    })).rejects.toThrow();
    await expect(readFile(path.join(root, "ventures/door-money/playbooks/valid-playbook.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires every syntactically valid citation to resolve to recorded growth-room learning", async () => {
    const root = await temporaryRoot();
    await expect(writeDoorMoneyGrowthPlaybooks({
      root,
      cycleId: "fixture-cycle-1",
      now: new Date("2026-08-13T15:00:00.000Z"),
      proposals: [proposal("unsupported-playbook", ["completion:action-packet-2026-08-13:missing-task"])],
      availableLearningRefs: new Set()
    })).rejects.toThrow(/not recorded/u);
  });

  it("writes one canonical, cited revision and makes the same cycle idempotent", async () => {
    const root = await temporaryRoot();
    const completion = "completion:action-packet-2026-08-13:fixture-review";
    const input = {
      root,
      cycleId: "fixture-cycle-1",
      now: new Date("2026-08-13T15:00:00.000Z"),
      proposals: [proposal("synthetic-community-playbook", [completion])],
      availableLearningRefs: new Set([completion])
    };
    const first = await writeDoorMoneyGrowthPlaybooks(input);
    const retry = await writeDoorMoneyGrowthPlaybooks(input);
    expect(first).toEqual(["ventures/door-money/playbooks/synthetic-community-playbook.json"]);
    expect(retry).toEqual(first);
    const stored = DoorMoneyPlaybookSchema.parse(JSON.parse(await readFile(path.join(root, first[0]!), "utf8")));
    expect(stored.revisions).toEqual([expect.objectContaining({ revision: 1, evidenceRefs: [completion] })]);
  });

  it("excludes future playbook revisions and completion times from a bounded room", async () => {
    const root = await temporaryRoot();
    const playbook = {
      schemaVersion: "door-money-playbook/1",
      id: "synthetic-community-playbook",
      ventureId: "door-money",
      channel: "Synthetic community",
      title: "Synthetic introductions",
      revisions: [
        { revision: 1, sourceCycleId: "fixture-cycle-1", summary: "Past learning.", steps: ["Past step."],
          evidenceRefs: ["completion:action-packet-2026-08-06:past-task"], updatedAt: "2026-08-06T15:00:00.000Z" },
        { revision: 2, sourceCycleId: "fixture-cycle-2", summary: "Future learning.", steps: ["Future step."],
          evidenceRefs: ["completion:action-packet-2026-08-13:future-task"], updatedAt: "2026-08-13T17:00:00.000Z" }
      ]
    };
    const packet = {
      schemaVersion: "action-packet/1", id: "action-packet-2026-08-13", ventureId: "door-money", date: "2026-08-13",
      weekOf: "2026-08-10", agenda: { isoWeek: "2026-W33", topicId: "launch-mechanics", title: "Launch mechanics" },
      title: "Synthetic actions", summary: "Synthetic bounded actions.", outcome: "ACTIONS", noActionReason: null,
      contextRefs: [], generatedAt: "2026-08-13T12:00:00.000Z", updatedAt: "2026-08-13T17:00:00.000Z",
      tasks: [{ id: "future-task", title: "Future task", why: "Synthetic test.", steps: ["Review it."],
        templates: [{ id: "fixture-template", label: "Fixture", kind: "other", body: "Synthetic fixture." }],
        effort: "Ten minutes", expectedImpact: "One synthetic result.", evidenceRefs: [],
        completion: { completedAt: "2026-08-13T17:00:00.000Z", outcome: "A future synthetic outcome." } }]
    };
    await Promise.all([
      json(root, "ventures/door-money/playbooks/synthetic-community-playbook.json", playbook),
      json(root, "ventures/door-money/actions/2026-08-13.json", packet)
    ]);

    const memory = await loadDoorMoneyGrowthMemory(root, "2026-08-13", "2026-08-13T14:00:00.000Z");
    expect(memory.playbooks).toEqual([expect.objectContaining({ revision: 1, summary: "Past learning." })]);
    expect(memory.ownerCompletions).toEqual([]);
  });

  it("preserves an owner completion only across an otherwise identical same-day task", async () => {
    const root = await temporaryRoot();
    const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/action-packet.valid.json"), "utf8"));
    await json(root, "ventures/door-money/actions/2026-08-13.json", fixture);
    const fresh = structuredClone(fixture);
    fresh.tasks[1].completion = null;
    fresh.generatedAt = "2026-08-13T18:00:00.000Z";
    fresh.updatedAt = "2026-08-13T18:00:00.000Z";

    const merged = await preserveDoorMoneyActionCompletions(
      root,
      "ventures/door-money/actions/2026-08-13.json",
      fresh
    );
    expect(merged.generatedAt).toBe(fixture.generatedAt);
    expect(merged.tasks[1]!.completion).toEqual(fixture.tasks[1].completion);

    const changed = structuredClone(fresh);
    changed.tasks[1].title = "A changed synthetic task";
    await expect(preserveDoorMoneyActionCompletions(
      root,
      "ventures/door-money/actions/2026-08-13.json",
      changed
    )).rejects.toThrow(/owner outcome was not overwritten/u);
  });
});
