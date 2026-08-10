import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readGoViralProfile } from "./goviral-profile";

const TEMPLATE = `# The owner's writing profile

Intro prose that belongs to nobody's section.

## Niches and topics I write about

<!-- What you actually want to be known for. -->

## Voice

<!-- How you sound. Concrete beats adjectives: "short sentences,
     no exclamation marks" is usable. -->

## Never write about

<!-- Treated as a veto list, not a preference. -->
`;

async function profileRoot(markdown: string | null): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "goviral-profile-"));
  if (markdown !== null) {
    await mkdir(path.join(root, "state", "ventures", "goviral"), { recursive: true });
    await writeFile(path.join(root, "state", "ventures", "goviral", "profile.md"), markdown);
  }
  return root;
}

describe("the GoVIRAL writing profile", () => {
  it("reads an untouched template as unfilled, guidance comments and all", async () => {
    const status = await readGoViralProfile(await profileRoot(TEMPLATE));
    expect(status.state).toBe("template");
    expect(status.filledCount).toBe(0);
    expect(status.sections.map((section) => section.title)).toEqual([
      "Niches and topics I write about",
      "Voice",
      "Never write about"
    ]);
  });

  it("counts a section as filled only once real prose sits under it", async () => {
    const answered = TEMPLATE.replace(
      "<!-- How you sound. Concrete beats adjectives: \"short sentences,\n     no exclamation marks\" is usable. -->",
      "Short sentences. I say when I do not know."
    );
    const status = await readGoViralProfile(await profileRoot(answered));
    expect(status.state).toBe("partial");
    expect(status.sections.find((section) => section.title === "Voice")?.filled).toBe(true);
    expect(status.sections.find((section) => section.title === "Never write about")?.filled).toBe(false);
  });

  it("tells a missing file apart from an unfilled one", async () => {
    expect((await readGoViralProfile(await profileRoot(null))).state).toBe("missing");
  });

  it("reads the profile the repository actually ships", async () => {
    const status = await readGoViralProfile();
    expect(status.state).toBe("template");
    expect(status.sections.length).toBeGreaterThan(0);
  });
});
