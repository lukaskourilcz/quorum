# Needs your help now

## Money and KPI owner inputs

1. Open `/admin` and enter the subscriptions BoardlessAI uses in
   `config/fixed-costs.json`. Use the amount you pay each month and the date the
   cost began. The file starts empty because Codex cannot infer your Vercel,
   Supabase, domain or other bills.
2. Review the Q1 targets and the 2026-08-03 start date in
   `config/kpis/2026-Q1.json`. Change any seed value that does not match your
   operating plan. Your saved values take priority over the defaults.

These steps change reporting inputs. They do not authorize a payment, account,
shop, sponsorship or affiliate program.

## FightAIQ free-source keys

Only the two surviving keyed $0 sources belong on this list. Both are GitHub Actions
repository secrets in `lukaskourilcz/quorum`; never put their values in Vercel, Git or
a meeting record.

1. `CITO_API_KEY` — confirms the bounded UFC roster and event feed. The runtime stops
   before 500 calls/month or 200/day and reserves at most five calls per run.
2. `THE_ODDS_API_KEY` — optional current odds capture. The runtime reads the provider
   quota headers and stops at zero remaining credits. Predictions still work without
   odds.

If both secrets are already present, there is nothing to add. Set the repository
variable `FIGHTAIQ_ANALYSIS_ENABLED=true`, run `mma-intake`, then run `mma-analysis`.
Exact checks and the MMA Files delivery sequence are in `MANUAL STEPS.md`.

No paid data-service key is accepted. Wikimedia is keyless, owner-reviewed imports
are local, and official organization pages stay disabled until a written terms review
approves automated access.
