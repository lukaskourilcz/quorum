// budget-2026-08e, countersigned 2 August 2026, supersedes budget-2026-08d's $42 and $50.
// orchestrator/tests/budget.test.ts pins these to the caps the runtime actually enforces.
export const CURRENT_MONTHLY_API_LIMIT_USD = 25;
export const CURRENT_MONTHLY_OPERATING_LIMIT_USD = 30;

// What one DNESKAi edition may spend producing itself, inside the $25 model share of the same
// budget-2026-08e cap. Mirrors `budgets.editionProductionUsd` in `config/edition-quality.json`,
// which is the figure the edition run actually enforces; this is the site's reading of it.
export const CURRENT_EDITION_PRODUCTION_CAP_USD = 0.5;

