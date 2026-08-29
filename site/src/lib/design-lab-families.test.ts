import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECK_FAMILIES, LAUNCH_FAMILIES } from "@boardlessai/carousel-studio";

/**
 * The chip row and the library, held to the same list.
 *
 * `design-lab-workspace.tsx` is a client component and the studio package is the render engine, so
 * importing `DECK_FAMILIES` there to build the row would ship the renderer to the browser. The
 * copy is deliberate; what is not acceptable is that it drifts. A family registered in the engine
 * and missing from the row is a design the owner cannot reach and nothing says so — no error, no
 * empty state, just a chip that was never drawn.
 *
 * The source is read as text rather than imported for the same reason the copy exists: the
 * component pulls in React, the admin write-mode context and the badge tree, none of which this
 * test wants to stand up to read one array.
 */
describe("the Design Lab's family chips", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "components", "admin", "design-lab-workspace.tsx"),
    "utf8"
  );

  it("offers every family the engine registers, the launch rotation leading", () => {
    const declaration = /const FAMILIES = \[(.*?)\] as const;/su.exec(source)?.[1];
    expect(declaration, "FAMILIES is no longer a literal array in design-lab-workspace.tsx").toBeDefined();
    const chips = [...declaration!.matchAll(/"([a-z]+)"/gu)].map((match) => match[1]);
    // The five the dealer deals unprompted come first; the legacy library follows in the
    // engine's own order, still reachable because stored recipes name it.
    expect(chips).toEqual([
      ...LAUNCH_FAMILIES,
      ...DECK_FAMILIES.filter((family) => !(LAUNCH_FAMILIES as readonly string[]).includes(family))
    ]);
  });
});
