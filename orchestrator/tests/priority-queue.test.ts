import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PriorityQueueSchema, type PriorityItem } from "../src/contracts/autonomy.js";
import { resolveMorningCommission } from "../src/cycle.js";
import {
  dueMeetingAgenda,
  loadMeetingPolicy,
  readMeetingAgendaQueue,
  requestMeetingAgenda
} from "../src/meetings/agenda.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";
import {
  addPriorityItem,
  archivePriorityItem,
  ensurePriorityItem,
  openPriorityItems,
  PRIORITY_QUEUE_CAP,
  PRIORITY_QUEUE_PATH,
  PRIORITY_QUEUE_VENTURE_CAP,
  findDuplicatePriorityItem,
  PriorityProposalRefused,
  proposePriorityItem,
  readPriorityQueue,
  selectPriorityItem,
  skipPriorityItem
} from "../src/priority/queue.js";

const NOW = new Date("2026-08-01T04:00:00.000Z");
const DAY_MS = 86_400_000;

function item(index: number, overrides: Partial<PriorityItem> = {}): PriorityItem {
  const created = new Date(NOW.getTime() - (30 * DAY_MS) + index).toISOString();
  return {
    schemaVersion: "priority-item/1",
    id: `priority-${index.toString(16).padStart(16, "0")}`,
    venture: "caught-up",
    question: `Question ${index}?`,
    decision_at_stake: `Decision ${index}`,
    evidence_needed: [],
    requested_by: "VIZE",
    created,
    // Long resolved: expired three weeks ago, well past the retention window.
    expires: new Date(NOW.getTime() - (21 * DAY_MS)).toISOString(),
    status: "archived",
    why_not_reason: null,
    consumed_by: null,
    ...overrides
  } as PriorityItem;
}

function openItem(index: number): PriorityItem {
  return item(index, { status: "open", expires: new Date(NOW.getTime() + (7 * DAY_MS)).toISOString() });
}

async function seedQueueFile(root: string, items: PriorityItem[]): Promise<void> {
  await writeFile(path.join(root, PRIORITY_QUEUE_PATH), JSON.stringify({
    schemaVersion: "priority-queue/1",
    items,
    updatedAt: NOW.toISOString()
  }), "utf8");
}

describe("agentic priority queue", () => {
  it("selects, explains and archives work deterministically", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-"));
    const now = new Date("2026-08-01T04:00:00.000Z");
    const selected = await addPriorityItem({
      root, venture: "caught-up", question: "Which source gap matters?",
      decisionAtStake: "Whether to add one source tomorrow", now,
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    const skipped = await addPriorityItem({
      root, venture: "mma-files", question: "Is the next card complete?",
      decisionAtStake: "Whether to assign the AM article", now: new Date("2026-08-01T04:01:00.000Z"),
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    const archived = await addPriorityItem({
      root, venture: "incubator", question: "Is this proposal evidenced?",
      decisionAtStake: "Whether to bring it to synthesis", now: new Date("2026-08-01T04:02:00.000Z"),
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    await selectPriorityItem({ root, itemId: selected.id, meetingRef: "standups/2026-08-01-morning", now });
    await skipPriorityItem({ root, itemId: skipped.id, reason: "The evidence file is incomplete.", now });
    await archivePriorityItem({ root, itemId: archived.id, now });
    const queue = await readPriorityQueue(root, now);
    // The declined question comes back: "why-not" is a morning's answer, not a closed question.
    expect(openPriorityItems(queue).map((item) => item.status)).toEqual(["why-not"]);
    expect(queue.items.map((item) => item.status)).toEqual(["selected", "why-not", "archived"]);
  });

  // Without the prune, retired items would build up at about one per agenda venture per
  // expiry window until the file crossed the schema cap, and from then on every read and
  // write would throw. The queue below is seeded past the cap to exercise that; no real
  // queue has got there.
  it("prunes long-resolved items so a queue past the cap still reads and takes new work", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-cap-"));
    const open = [0, 1, 2, 3, 4].map((index) => openItem(index));
    const stale = Array.from({ length: PRIORITY_QUEUE_CAP - 4 }, (_unused, offset) => {
      const index = offset + 5;
      if (index % 3 === 0) return item(index, { status: "selected", consumed_by: "standups/2026-07-04-morning" });
      if (index % 3 === 1) return item(index, { status: "why-not", why_not_reason: "No evidence yet." });
      return item(index);
    });
    await seedQueueFile(root, [...open, ...stale]);
    expect([...open, ...stale].length).toBeGreaterThan(PRIORITY_QUEUE_CAP);

    const queue = await readPriorityQueue(root, NOW);
    expect(queue.items.map((entry) => entry.id)).toEqual(open.map((entry) => entry.id));

    const added = await addPriorityItem({
      root,
      venture: "caught-up",
      question: "Which source gap matters?",
      decisionAtStake: "Whether to add one source tomorrow",
      now: NOW,
      expires: new Date(NOW.getTime() + (7 * DAY_MS))
    });
    const reread = await readPriorityQueue(root, NOW);
    expect(reread.items.map((entry) => entry.id)).toContain(added.id);
    expect(reread.items).toHaveLength(open.length + 1);
  });

  it("drops recently resolved items rather than any open item at the cap", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-open-"));
    const open = Array.from({ length: PRIORITY_QUEUE_CAP }, (_unused, index) => openItem(index));
    // Resolved yesterday, so inside the retention window: still the first thing to go.
    const recent = [0, 1, 2, 3, 4].map((offset) => item(PRIORITY_QUEUE_CAP + offset, {
      status: "why-not",
      why_not_reason: "Answered in the morning room.",
      expires: new Date(NOW.getTime() - DAY_MS).toISOString()
    }));
    await seedQueueFile(root, [...open, ...recent]);

    const queue = await readPriorityQueue(root, NOW);
    expect(queue.items.map((entry) => entry.id)).toEqual(open.map((entry) => entry.id));
    expect(openPriorityItems(queue)).toHaveLength(PRIORITY_QUEUE_CAP);
  });

  it("reports open items past the cap instead of dropping them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-full-"));
    await seedQueueFile(root, Array.from({ length: PRIORITY_QUEUE_CAP + 1 }, (_unused, index) => openItem(index)));
    await expect(readPriorityQueue(root, NOW)).rejects.toThrow(
      `Priority queue holds ${PRIORITY_QUEUE_CAP + 1} open items, past the ${PRIORITY_QUEUE_CAP}-item cap`
    );
  });

  it("keeps resolved items inside the retention window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-recent-"));
    const kept = item(1, { expires: new Date(NOW.getTime() - (6 * DAY_MS)).toISOString() });
    const dropped = item(2, { expires: new Date(NOW.getTime() - (8 * DAY_MS)).toISOString() });
    await seedQueueFile(root, [kept, dropped]);
    const queue = await readPriorityQueue(root, NOW);
    expect(queue.items.map((entry) => entry.id)).toEqual([kept.id]);
  });

  it("pins the local cap to the queue contract", () => {
    const build = (count: number) => ({
      schemaVersion: "priority-queue/1",
      items: Array.from({ length: count }, (_unused, index) => openItem(index)),
      updatedAt: NOW.toISOString()
    });
    expect(PriorityQueueSchema.safeParse(build(PRIORITY_QUEUE_CAP)).success).toBe(true);
    expect(PriorityQueueSchema.safeParse(build(PRIORITY_QUEUE_CAP + 1)).success).toBe(false);
  });
});

describe("what the board is allowed to commission", () => {
  it("hands back a question it declined on an earlier morning", async () => {
    // Every morning skips the items it did not select to "why-not". While that status was
    // filtered out, the board was handed an empty list from the second morning onwards and its
    // own prompt then told it that an empty list means request nothing — so it met daily and
    // could not have commissioned a room if it had wanted to.
    const root = await mkdtemp(path.join(os.tmpdir(), "priority-reconsider-"));
    const seeded = await ensurePriorityItem({
      root,
      venture: "incubator",
      question: "What is the next niche magazine worth researching?",
      decisionAtStake: "Whether to open a research room for it.",
      now: new Date("2026-08-01T04:00:00.000Z"),
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    await skipPriorityItem({
      root,
      itemId: seeded.item.id,
      reason: "The board used its single commission elsewhere.",
      now: new Date("2026-08-01T04:05:00.000Z")
    });
    const queue = await readPriorityQueue(root, new Date("2026-08-02T04:00:00.000Z"));
    expect(queue.items.find((item) => item.id === seeded.item.id)?.status).toBe("why-not");
    expect(openPriorityItems(queue).map((item) => item.id)).toContain(seeded.item.id);
  });

  it("does not hand back one that was archived", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "priority-archived-"));
    const seeded = await ensurePriorityItem({
      root,
      venture: "incubator",
      question: "A question that has been settled for good.",
      decisionAtStake: "Whether anything further is owed to it.",
      now: new Date("2026-08-01T04:00:00.000Z"),
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    await archivePriorityItem({ root, itemId: seeded.item.id, now: new Date("2026-08-01T04:05:00.000Z") });
    const queue = await readPriorityQueue(root, new Date("2026-08-02T04:00:00.000Z"));
    expect(openPriorityItems(queue)).toEqual([]);
  });
});

describe("a seat proposing a new question", () => {
  const week = new Date(NOW.getTime() + (7 * DAY_MS));

  async function root(): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), "boardless-proposal-"));
  }

  function proposal(dir: string, overrides: Record<string, unknown> = {}) {
    return {
      root: dir,
      venture: "titty-tuesdays",
      question: "Which campaign format has never been tested against the season brief?",
      decisionAtStake: "Whether the next slot repeats a tested format or trials a new one.",
      evidenceNeeded: ["campaign-inventory"],
      proposedBy: "FORGE",
      meetingRef: "standups/2026-08-01-morning",
      now: NOW,
      expires: week,
      ...overrides
    } as Parameters<typeof proposePriorityItem>[0];
  }

  it("records that the board proposed it, by whom and at which meeting", async () => {
    const dir = await root();
    const added = await proposePriorityItem(proposal(dir));

    expect(added.origin).toBe("proposed");
    expect(added.proposal).toEqual({
      proposed_by: "FORGE",
      meeting_ref: "standups/2026-08-01-morning",
      proposed_at: NOW.toISOString()
    });
    // Readable back off disk, not just in the return value.
    const stored = (await readPriorityQueue(dir, NOW)).items.find((entry) => entry.id === added.id);
    expect(stored?.origin).toBe("proposed");
    expect(stored?.proposal?.proposed_by).toBe("FORGE");
  });

  it("leaves a seeded item saying it was seeded", async () => {
    const dir = await root();
    const seeded = await addPriorityItem({
      root: dir, venture: "titty-tuesdays", question: "What blocks the objective?",
      decisionAtStake: "Which bounded action moves it.", now: NOW, expires: week
    });

    expect(seeded.origin).toBe("seeded");
    expect(seeded.proposal).toBeNull();
  });

  it("reads a pre-existing item written before provenance existed as seeded", async () => {
    // The ten items already on disk have no origin field. They must parse, and they must not
    // claim to have been proposed by anyone.
    const dir = await root();
    await seedQueueFile(dir, [openItem(1)]);
    const queue = await readPriorityQueue(dir, NOW);

    expect(queue.items[0]!.origin).toBe("seeded");
    expect(queue.items[0]!.proposal).toBeNull();
  });

  it("refuses a question the queue already holds in other words", async () => {
    const dir = await root();
    await proposePriorityItem(proposal(dir));

    await expect(proposePriorityItem(proposal(dir, {
      question: "Which campaign formats have never been tested against the season briefs?",
      decisionAtStake: "Whether the next slot repeats a tested format or trials a new one."
    }))).rejects.toThrow(PriorityProposalRefused);
  });

  it("refuses a re-proposal of a question the board itself declined", async () => {
    // The queue is currently full of why-not items. Without this the board could re-propose its
    // own declined questions every morning forever.
    const dir = await root();
    const added = await proposePriorityItem(proposal(dir));
    await skipPriorityItem({ root: dir, itemId: added.id, reason: "Not selected today.", now: NOW });

    const refusal = await proposePriorityItem(proposal(dir)).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(PriorityProposalRefused);
    expect((refusal as PriorityProposalRefused).guard).toBe("duplicate");
    expect((refusal as PriorityProposalRefused).message).toContain("why-not");
  });

  it("refuses a re-proposal of the question a room is already answering", async () => {
    const dir = await root();
    const added = await proposePriorityItem(proposal(dir));
    await selectPriorityItem({ root: dir, itemId: added.id, meetingRef: "standups/x-morning", now: NOW });

    await expect(proposePriorityItem(proposal(dir))).rejects.toThrow(PriorityProposalRefused);
  });

  it("lets the same wording through for a different project", async () => {
    const dir = await root();
    await proposePriorityItem(proposal(dir));
    const other = await proposePriorityItem(proposal(dir, {
      venture: "carousel-studio",
      now: new Date(NOW.getTime() + 1_000)
    }));

    expect(other.venture).toBe("carousel-studio");
  });

  it("stops a project accumulating questions past its cap", async () => {
    // Subjects with no shared vocabulary, so the venture cap is what refuses the last one and
    // not the duplicate check standing in front of it.
    const subjects = [
      {
        question: "Which garment fabric weight suits an autumn drop?",
        decisionAtStake: "Whether autumn stock reuses summer fabric or changes weight."
      },
      {
        question: "Does the photography backlog cover every listed size?",
        decisionAtStake: "Whether a shoot is booked before the next listing batch."
      },
      {
        question: "Has any retail partner replied to the wholesale enquiry?",
        decisionAtStake: "Whether wholesale stays on the roadmap this quarter."
      },
      {
        question: "Are shipping costs recorded per parcel anywhere?",
        decisionAtStake: "Whether postage is priced into the next margin review."
      }
    ];
    expect(subjects.length).toBeGreaterThan(PRIORITY_QUEUE_VENTURE_CAP);

    const dir = await root();
    for (let index = 0; index < PRIORITY_QUEUE_VENTURE_CAP; index += 1) {
      await proposePriorityItem(proposal(dir, {
        ...subjects[index]!,
        now: new Date(NOW.getTime() + (index * 1_000))
      }));
    }

    const refusal = await proposePriorityItem(proposal(dir, {
      ...subjects[PRIORITY_QUEUE_VENTURE_CAP]!,
      now: new Date(NOW.getTime() + 60_000)
    })).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(PriorityProposalRefused);
    expect((refusal as PriorityProposalRefused).guard).toBe("venture-cap");
    expect((await readPriorityQueue(dir, NOW)).items.length).toBe(PRIORITY_QUEUE_VENTURE_CAP);
  });

  it("catches the exact re-seed that already happened on disk, and lets a real new subject through", () => {
    // On 3 and 4 August the seed loop wrote the same five questions twice, because
    // ensurePriorityItem matches open items only and the first set had gone why-not. Those pairs
    // are the calibration case for this threshold: identical wording must be refused, while a
    // question that merely borrows the seed's phrasing for a different subject must not be.
    const seeded = {
      question: "What is currently blocking this objective: Build a complete inventory of campaigns that are ready to launch?",
      decisionAtStake: "Which next bounded action moves campaign-inventory for Titty Tuesdays."
    };
    const queue = PriorityQueueSchema.parse({
      schemaVersion: "priority-queue/1",
      items: [item(1, {
        venture: "titty-tuesdays",
        status: "why-not",
        why_not_reason: "The 06:00 board did not select this item.",
        question: seeded.question,
        decision_at_stake: seeded.decisionAtStake,
        expires: new Date(NOW.getTime() + (7 * DAY_MS)).toISOString()
      })],
      updatedAt: NOW.toISOString()
    });
    const against = (question: string, decisionAtStake: string) =>
      findDuplicatePriorityItem({ queue, venture: "titty-tuesdays", question, decisionAtStake });

    expect(against(seeded.question, seeded.decisionAtStake)).not.toBeNull();
    expect(against(
      "What is currently blocking this objective: Decide the pricing tier for the autumn drop?",
      "Which next bounded action moves pricing for Titty Tuesdays."
    )).toBeNull();
  });

  it("refuses at the global cap rather than evicting a resolved question to make room", async () => {
    const dir = await root();
    // A full queue of finished items from another venture: withinCap would happily drop the
    // oldest to fit an append. A board proposal must not be able to buy space that way.
    await seedQueueFile(dir, Array.from({ length: PRIORITY_QUEUE_CAP }, (_, index) =>
      item(index, { expires: new Date(NOW.getTime() - DAY_MS).toISOString() })));

    const refusal = await proposePriorityItem(proposal(dir)).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(PriorityProposalRefused);
    expect((refusal as PriorityProposalRefused).guard).toBe("queue-cap");
  });

  it("fails loudly rather than returning quietly when it refuses", async () => {
    const dir = await root();
    await proposePriorityItem(proposal(dir));
    const before = (await readPriorityQueue(dir, NOW)).items.length;

    await expect(proposePriorityItem(proposal(dir))).rejects.toThrow(/already holds/);
    expect((await readPriorityQueue(dir, NOW)).items.length).toBe(before);
  });
});

describe("commissioning a question the board declined on an earlier morning", () => {
  // The offer and the write disagreed. openPriorityItems hands "why-not" items back so a later
  // board can pick one up; the transition guard then refused every such pick with "is why-not,
  // not open", the morning caught the throw and published "the agenda queue refused it", and the
  // item returned to the next morning's list to be offered and refused again. On 2026-08-06 the
  // standup named an agenda that was sitting pending in the queue at the same moment. This walks
  // the whole path: decline, re-offer, commission, and check that the record is not lying.
  it("queues the agenda, marks the item selected, and publishes no refusal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "priority-recommission-"));
    const monday = new Date("2026-08-03T04:00:00.000Z");
    const tuesday = new Date("2026-08-04T04:00:00.000Z");
    const policy = await loadMeetingPolicy();
    const registry = await loadVentureRegistry();

    const seeded = await ensurePriorityItem({
      root,
      venture: "titty-tuesdays",
      question: "What is currently blocking the campaign inventory?",
      decisionAtStake: "Which bounded action fills the next campaign slot.",
      now: monday,
      expires: new Date("2026-08-10T04:00:00.000Z")
    });
    await skipPriorityItem({
      root,
      itemId: seeded.item.id,
      reason: "The board used its single commission elsewhere.",
      now: monday
    });

    const offered = openPriorityItems(await readPriorityQueue(root, tuesday), "titty-tuesdays");
    expect(offered.map((entry) => entry.status)).toEqual(["why-not"]);

    const commission = resolveMorningCommission({
      policy,
      registry,
      sourcePhase: "morning",
      openPriorities: offered,
      positions: (["VIZE", "FORGE", "PULSE", "AUDIT"] as const).map((agent) => ({
        agent,
        publicSummary: `${agent} recorded a bounded public position.`,
        recommendation: "approve" as const,
        meetingRequest: agent === "VIZE"
          ? {
              phase: "tt-marketing" as const,
              priorityItemId: seeded.item.id,
              summary: "Decide whether the autumn drop ships one crop top or two.",
              evidenceRefs: ["campaign-inventory"]
            }
          : null,
        priorityProposal: null
      }))
    });
    expect(commission.commission).toBe(true);
    if (!commission.commission) throw new Error("expected a commission");

    const scheduled = await requestMeetingAgenda({
      root,
      policy,
      ventureId: commission.target.ventureId,
      phase: commission.request.phase,
      requestedBy: commission.requestedBy,
      sourcePhase: "morning",
      sourceMeetingRef: "standups/2026-08-04-morning",
      summary: commission.request.summary,
      evidenceRefs: commission.request.evidenceRefs,
      notBefore: "2026-08-04",
      now: tuesday
    });
    const selected = await selectPriorityItem({
      root,
      itemId: commission.priority.id,
      meetingRef: "standups/2026-08-04-morning",
      now: tuesday
    });

    expect(selected.status).toBe("selected");
    expect(selected.consumed_by).toBe("standups/2026-08-04-morning");
    expect(dueMeetingAgenda(
      await readMeetingAgendaQueue(root, tuesday),
      "tt-marketing",
      "2026-08-04"
    )?.id).toBe(scheduled.agenda.id);
    expect(openPriorityItems(await readPriorityQueue(root, tuesday), "titty-tuesdays")).toEqual([]);
  });

  it("still refuses to reopen an archived question", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "priority-archived-select-"));
    const seeded = await ensurePriorityItem({
      root,
      venture: "incubator",
      question: "A question that has been settled for good.",
      decisionAtStake: "Whether anything further is owed to it.",
      now: NOW,
      expires: new Date(NOW.getTime() + (7 * DAY_MS))
    });
    await archivePriorityItem({ root, itemId: seeded.item.id, now: NOW });

    await expect(selectPriorityItem({
      root,
      itemId: seeded.item.id,
      meetingRef: "standups/2026-08-01-morning",
      now: NOW
    })).rejects.toThrow(/archived/);
  });
});
