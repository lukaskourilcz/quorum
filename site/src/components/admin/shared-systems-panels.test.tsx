import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HookBrainAdminPanel } from "./hook-brain-panel";
import type { HookBrainSnapshot } from "@/lib/hook-brain";

describe("shared Admin system panels", () => {
  it("keeps hook records in labelled table regions and names pre-posting states", () => {
    const snapshot: HookBrainSnapshot = {
      surfaces: [{ surface: "quiz", hooks: 0, archetypes: 0, note: "Not authored yet." }],
      channels: [],
      recent: [],
      previews: [{
        vertical: "dev",
        topic: "Synthetic fixture",
        hookId: null,
        archetype: null,
        eligibleCount: 0,
        en: null,
        cs: null,
        gates: [],
      }],
      fallbackCount: 0,
    };
    const html = renderToStaticMarkup(<HookBrainAdminPanel snapshot={snapshot} />);

    expect(html).toContain('aria-label="Hook libraries"');
    expect(html).toContain('aria-label="Fixture hook assignments"');
    expect(html.match(/data-admin-state="initial-empty"/gu)).toHaveLength(2);
    expect(html).toContain("No hook has been posted yet");
    expect(html).toContain("Nothing has posted yet");
  });
});
