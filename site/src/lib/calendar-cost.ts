import type { AgentApiModel, AgentId } from "@/data/agents";
import type { CalendarKind } from "@/lib/calendar-feed-model";

/**
 * Which of an agent's priced calls a calendar slot actually makes.
 *
 * Every value has to be a `context` string the agent really carries in `data/agents.ts`.
 * `calendarCostUsd` in `week-board.tsx` looks the call up by that exact string and, on a miss,
 * charges that agent's cheapest priced call rather than throwing — so a label that has drifted
 * out of date does not break the page, it just prints a smaller number than the slot costs. The
 * stale "DNESKAi English edition" label did exactly that: STET writes the Czech edition for
 * $0.0437, the lookup missed, and the homepage advertised the $0.0036 meeting call instead.
 *
 * This map lives in a `.ts` file rather than beside its only caller because vitest cannot import
 * this project's `.tsx` (Next keeps `jsx: "preserve"`), and `czech-only-publishing.test.ts`
 * fails on any entry that stops resolving.
 */
export const calendarCostContexts: Partial<
  Record<CalendarKind, Partial<Record<AgentId, AgentApiModel["context"]>>>
> = {
  "venture-morning": {
    VIZE: "Company council meetings",
    FORGE: "Company council meetings",
    PULSE: "Company and project meetings",
    AUDIT: "Company and project meetings",
    SPARK: "DNESKAi idea and project meetings",
    VAULT: "DNESKAi idea checks"
  },
  "venture-afternoon": {
    VIZE: "Company council meetings",
    FORGE: "Company council meetings",
    PULSE: "Company and project meetings",
    AUDIT: "Company and project meetings"
  },
  "venture-night": {
    VIZE: "Company council meetings",
    FORGE: "Company council meetings",
    PULSE: "Company and project meetings",
    AUDIT: "Company and project meetings"
  },
  "cu-edition": {
    HERALD: "DNESKAi daily edition curation",
    STET: "DNESKAi Czech edition",
    // HACEK no longer rebuilds the edition in Czech, so it has no writing call left — only the
    // meeting call it makes when the room selects it.
    HACEK: "Project meetings when selected",
    SPARK: "DNESKAi idea and project meetings",
    AUDIT: "Company and project meetings"
  },
  "cu-product": {
    HERALD: "DNESKAi product room",
    SPARK: "DNESKAi idea and project meetings",
    VAULT: "DNESKAi idea checks",
    AUDIT: "Company and project meetings"
  },
  "ts-desk": {
    LETOPIS: "Tehdejsi svet planning and Czech copy",
    VERBA: "Tehdejsi svet Ukrainian adaptation",
    HACEK: "Project meetings when selected",
    AUDIT: "Company and project meetings"
  },
  "bh-desk": {
    FOLIO: "BOOKSOFHISTORY editorial selection",
    PLOT: "BOOKSOFHISTORY story production",
    HACEK: "Project meetings when selected",
    AUDIT: "Company and project meetings"
  },
  "mag-editorial": {
    JAB: "MMA Files editorial rooms"
  },
  "mag-desk": {
    JAB: "MMA Files editorial rooms"
  },
  "article-am": {
    JAB: "MMA Files Czech articles",
    HACEK: "Project meetings when selected"
  },
  "article-pm": {
    JAB: "MMA Files Czech articles",
    HACEK: "Project meetings when selected"
  }
};
