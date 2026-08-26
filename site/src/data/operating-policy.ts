// budget-2026-08f, countersigned 26 August 2026, restores the $50 all-in limit while keeping
// budget-2026-08e's $25 model share and $1.00 daily pace. Runtime tests pin all three values.
export const CURRENT_MONTHLY_API_LIMIT_USD = 25;
export const CURRENT_MONTHLY_OPERATING_LIMIT_USD = 50;

// The daily pace the runtime spends against, from the same decision. A day tile scaled to a
// literal $1 sat beside three tiles scaled to the monthly cap and read as though a $0.60 day had burned 60%
// of something; the bar means nothing unless it means the same thing as its neighbours. Pinned by
// the same test, for the same reason the monthly pair is: a phase-local copy of a cap keeps
// spending against a decision the owner has already replaced.
export const CURRENT_DAILY_OPERATING_PACE_USD = 1;

// What one DNESKAi edition may spend producing itself, inside the $25 model share of the same
// budget-2026-08f cap. Mirrors `budgets.editionProductionUsd` in `config/edition-quality.json`,
// which is the figure the edition run actually enforces; this is the site's reading of it.
export const CURRENT_EDITION_PRODUCTION_CAP_USD = 0.5;
