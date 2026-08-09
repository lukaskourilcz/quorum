"use client";

import type { CSSProperties } from "react";
import type { OfficeWorkflows } from "@/lib/office-workflows-model";
import type { PlanPlace } from "@/components/office/workflows-plan";

/**
 * The places that own a depth-3 panel.
 *
 * Every room on the plan opens now, but only these four have a mechanism worth drawing. The rest
 * open to the room itself, which is what `PlanPlace` is wider than this for.
 */
// The dock left this list when it became a dialog of plain facts: it is the one place on the
// plan whose panel was a metaphor rather than a record.
export type PanelPlace = "caught-up" | "carousel-studio" | "titty-tuesdays";

export function hasPanel(place: PlanPlace): place is PanelPlace {
  return place === "caught-up" || place === "carousel-studio"
    || place === "titty-tuesdays";
}

/**
 * Depth 3's chrome: which places open, what their frames say, and the header chip.
 *
 * The four bodies themselves live in `workflows-panel-bodies.tsx` and are fetched on demand,
 * because a visitor who never opens a panel should never pay for one. What stays here is
 * everything the section needs before any press happens — the copy that titles a frame, the test
 * that decides whether a place has a panel at all, and the worked example's chip.
 *
 * Keeping the two apart is load-bearing rather than tidy: a lazy import of the bodies out of this
 * module would be defeated by the static import of `PANEL_COPY` beside it, and the whole weight
 * would land in the first load again.
 */

const MONO = "var(--font-ibm-plex-mono), monospace";
const DNESKAI = "#fe45e2";

/**
 * The worked example's chip, in the same header slot at the same pixel position in all three
 * panels that carry it — DNESKAi's own hue, because it is DNESKAi's edition.
 *
 * The example resolves whole or not at all. A date beside an unresolved headline would be a
 * placeholder wearing a real number, so the unresolved state says the true thing instead.
 */
export function ExampleChip({ example }: { example: OfficeWorkflows["example"] }) {
  const shell: CSSProperties = {
    borderRadius: "8px",
    padding: "6px 10px",
    fontFamily: MONO,
    fontSize: "10.5px",
    maxWidth: "min(46ch, 42vw)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  };
  if (!example) {
    return (
      <span style={{ ...shell, color: "#94949c", border: "1px solid transparent", padding: "6px 0" }}>
        NO EDITION ON RECORD YET
      </span>
    );
  }
  return (
    <span
      style={{
        ...shell,
        border: "1px solid #3f3f46",
        borderLeft: `3px solid ${DNESKAI}`,
        color: "#d4d4d8"
      }}
      title={example.headline}
    >
      {`EDITION · ${example.date} · ${example.headline}`}
    </span>
  );
}

/* ------------------------------------------------------------------- exports */

export const PANEL_COPY: Record<PanelPlace, { eyebrow: string; title: string; footer: string; columns: string }> = {
  "caught-up": {
    eyebrow: "THE DNESKAI OFFICE",
    title: "One story of the day, or nothing goes out",
    footer: "Every figure here is the gate the run actually enforces.",
    columns: "5fr 4fr 3fr"
  },
  "carousel-studio": {
    eyebrow: "THE WORKSHOP",
    title: "The article arrives as a summary",
    footer: "Assignment is deterministic and costs nothing.",
    columns: "1fr"
  },
  "titty-tuesdays": {
    eyebrow: "THE WINDOW AND THE SIGNAL",
    title: "The edges that are not deliveries",
    footer: "Three edges leave the building and one records an import.",
    columns: "1fr 1fr"
  }
};

/** Whether this panel carries the worked example's chip in its header. */
export function carriesExample(place: PanelPlace): boolean {
  return place === "caught-up" || place === "carousel-studio";
}
