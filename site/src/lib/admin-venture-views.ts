import type { AdminVentureTab } from "@/lib/admin-portfolio";

/**
 * Which of a venture's record views is the thing it actually made.
 *
 * A workspace used to open on whichever tab the registry happened to list first, which for half
 * the portfolio was a planning surface rather than an output: DNESKAi opened on plans and Titty
 * Tuesdays on plans, while the carousel each of them shipped that morning sat one click away.
 *
 * This is presentation, not policy — the registry's `adminTabs` stays the authority on which
 * views a venture has, and nothing here can invent one. A venture absent from this map opens on
 * its first tab, which is the honest default: for the desks whose first view is already their
 * output (BOOKSOFHISTORY's features, Door Money's recommendations, MMA Files' articles) there is
 * nothing to override.
 */
const OUTPUT_TAB: Readonly<Record<string, AdminVentureTab>> = {
  // The day's carousel, which is what a reader of DNESKAi sees.
  "caught-up": "visuals",
  // The daily proposal pair with its checklist is the output; plans are how it got there.
  "titty-tuesdays": "visuals",
  // The rotation and the five looks, not the template catalogue behind them.
  "carousel-studio": "studio"
};

export interface AdminVentureViews {
  /** The tab the workspace opens on: what this venture last made. */
  output: AdminVentureTab;
  /** Everything else it keeps, in registry order. Empty when the venture has one view. */
  archive: AdminVentureTab[];
}

/**
 * A venture's two places: what it made, and everything it keeps.
 *
 * Nothing is dropped — every tab the registry declares is in exactly one of the two, and every
 * `?tab=` link that worked before still resolves to the same panel. What changes is that the
 * owner is offered two choices instead of up to ten.
 */
export function adminVentureViews(ventureId: string, tabs: readonly AdminVentureTab[]): AdminVentureViews | null {
  if (tabs.length === 0) return null;
  const preferred = OUTPUT_TAB[ventureId];
  const output = preferred && tabs.includes(preferred) ? preferred : tabs[0]!;
  return { output, archive: tabs.filter((tab) => tab !== output) };
}
