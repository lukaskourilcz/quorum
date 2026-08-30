import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECK_FAMILIES, LAUNCH_FAMILIES } from "@boardlessai/carousel-studio";

/**
 * The two chip rows and the library, held to the same list.
 *
 * `design-lab-workspace.tsx` is a client component and the studio package is the render engine, so
 * importing `DECK_FAMILIES` there to build the rows would ship the renderer to the browser. The
 * copy is deliberate; what is not acceptable is that it drifts. A family registered in the engine
 * and missing from both rows is a design the owner cannot reach and nothing says so — no error, no
 * empty state, just a chip that was never drawn.
 *
 * The source is read as text rather than imported for the same reason the copy exists: the
 * component pulls in React, the admin write-mode context and the badge tree, none of which this
 * test wants to stand up to read two arrays.
 */
describe("the Design Lab's family chips", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "components", "admin", "design-lab-workspace.tsx"),
    "utf8"
  );
  const literal = (name: string): string[] => {
    const declaration = new RegExp(`const ${name} = \\[(.*?)\\] as const;`, "su").exec(source)?.[1];
    expect(declaration, `${name} is no longer a literal array in design-lab-workspace.tsx`).toBeDefined();
    return [...declaration!.matchAll(/"([a-z]+)"/gu)].map((match) => match[1]!);
  };

  it("leads with the five the dealer deals", () => {
    expect(literal("LAUNCH_FAMILIES")).toEqual([...LAUNCH_FAMILIES]);
  });

  it("keeps every other registered family reachable, in the engine's own order", () => {
    // The legacy rotation lives behind Fine-tune under "Starší vzhledy". Reachable, because a
    // stored recipe names one of them and has to redraw exactly as it was sent; not offered,
    // because the dealer stopped dealing them.
    expect(literal("LEGACY_FAMILIES")).toEqual(
      DECK_FAMILIES.filter((family) => !(LAUNCH_FAMILIES as readonly string[]).includes(family))
    );
  });
});
