// budget-2026-08e, countersigned 2 August 2026, supersedes budget-2026-08d's $42 and $50.
// orchestrator/tests/budget.test.ts pins these to the caps the runtime actually enforces.
export const CURRENT_MONTHLY_API_LIMIT_USD = 25;
export const CURRENT_MONTHLY_OPERATING_LIMIT_USD = 30;

// The daily pace the runtime spends against, from the same decision. A day tile scaled to a
// literal $1 sat beside three tiles scaled to $30 and read as though a $0.60 day had burned 60%
// of something; the bar means nothing unless it means the same thing as its neighbours. Pinned by
// the same test, for the same reason the monthly pair is: a phase-local copy of a cap keeps
// spending against a decision the owner has already replaced.
export const CURRENT_DAILY_OPERATING_PACE_USD = 1;

// What one DNESKAi edition may spend producing itself, inside the $25 model share of the same
// budget-2026-08e cap. Mirrors `budgets.editionProductionUsd` in `config/edition-quality.json`,
// which is the figure the edition run actually enforces; this is the site's reading of it.
export const CURRENT_EDITION_PRODUCTION_CAP_USD = 0.5;

