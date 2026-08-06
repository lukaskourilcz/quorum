import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { agendaIdFromRef, getMeetingAgendaSummaries } = await import("./meeting-agendas");

const originalRoot = process.env.BOARDLESSAI_REPO_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.BOARDLESSAI_REPO_ROOT;
  else process.env.BOARDLESSAI_REPO_ROOT = originalRoot;
});

/**
 * A meeting page opens with what the room was asked to decide, which lives in the agenda
 * queue and is reached through the record's `agendaRef`. A ref that does not resolve has to
 * leave the page silent rather than print the raw token at a reader.
 */
describe("the agenda behind a meeting", () => {
  it("takes the id out of a queue reference", () => {
    expect(agendaIdFromRef("meeting-agendas/queue.json#agenda-1f7e454d7495c427")).toBe(
      "agenda-1f7e454d7495c427"
    );
  });

  it.each([
    ["no fragment", "meeting-agendas/queue.json"],
    ["an empty fragment", "meeting-agendas/queue.json#"],
    ["something that is not an agenda id", "meeting-agendas/queue.json#../../etc/passwd"]
  ])("returns nothing for %s", (_name, reference) => {
    expect(agendaIdFromRef(reference)).toBeNull();
  });

  it("reads the summary each room wrote", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenda-queue-"));
    await mkdir(path.join(root, "state", "meeting-agendas"), { recursive: true });
    await writeFile(
      path.join(root, "state", "meeting-agendas", "queue.json"),
      JSON.stringify({
        schemaVersion: "meeting-agenda-queue/1",
        agendas: [
          { id: "agenda-aaaa1111", summary: "Name the blocking gap between verified files and published articles." },
          { id: "agenda-bbbb2222", summary: "   " },
          { summary: "An agenda with no id" }
        ],
        updatedAt: "2026-08-06T00:00:00.000Z"
      }),
      "utf8"
    );
    process.env.BOARDLESSAI_REPO_ROOT = root;

    const summaries = await getMeetingAgendaSummaries();

    expect(summaries.get("agenda-aaaa1111")).toBe(
      "Name the blocking gap between verified files and published articles."
    );
    expect(summaries.has("agenda-bbbb2222")).toBe(false);
    expect(summaries.size).toBe(1);
  });

  it("returns an empty map when the queue is missing", async () => {
    process.env.BOARDLESSAI_REPO_ROOT = await mkdtemp(path.join(os.tmpdir(), "agenda-empty-"));

    expect((await getMeetingAgendaSummaries()).size).toBe(0);
  });
});
