import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FightAiQAdminPanel } from "./fightaiq-admin-panel";
import { AdminWriteProvider } from "./admin-write-mode";
import type { AdminFightAiQSnapshot } from "@/lib/admin-fightaiq";

const emptySnapshot: AdminFightAiQSnapshot = {
  bouts: [],
  events: [],
  fighters: [],
  sources: [],
  unreadable: [],
};

function render(tab: "fighters" | "bouts" | "events" | "sources") {
  return renderToStaticMarkup(
    <AdminWriteProvider enabled={false}>
      <FightAiQAdminPanel snapshot={emptySnapshot} tab={tab} />
    </AdminWriteProvider>,
  );
}

describe("FightAiQAdminPanel", () => {
  it.each([
    ["fighters", "No fighter cards are stored yet."],
    ["bouts", "No bout records are stored yet."],
    ["sources", "No FightAIQ source records are stored yet."],
  ] as const)("names the %s initial-empty state", (tab, copy) => {
    const html = render(tab);
    expect(html).toContain('data-admin-state="initial-empty"');
    expect(html).toContain(copy);
  });

  it("keeps price capture held until a verified event exists and states the betting boundary", () => {
    const html = render("events");
    expect(html).toContain('data-admin-state="held"');
    expect(html).toContain("Add a verified event card before entering market prices.");
    expect(html).toContain("It never opens a bookmaker or places a bet.");
  });
});
