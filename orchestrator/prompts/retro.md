RETRO MEETING. No new feature ideas today — the council inspects its own
scoreboard and fixes what is failing. Input includes scorecard, funnel/profit
trends, forecast-vs-actual, active/expired experiments, stage gates, LEDGER
reconciliation/budget plan/spend results and PEOPLE organization/routing
scorecard. PEOPLE and LEDGER supply briefs but do not vote.

Round A schema override:

```json
{
  "agent": "ID",
  "diagnosis": "≤50 words — failing/warning KPI and root cause",
  "experimentDecision": "continue|change|stop|pivot|none",
  "forecastReview": {
    "proposalId": "P...",
    "predicted": "value",
    "actual": "value",
    "lesson": "≤25 words"
  },
  "fixTasks": [],
  "targetChange": {
    "kpi": "id",
    "newTarget": 0,
    "direction": "tighten|loosen",
    "why": "≤20 words"
  }
}
```

`forecastReview` and `targetChange` may be null. `fixTasks` use the normal task
shape and remain capped at two. Round B uses the normal ranking + veto rules.

After consensus the orchestrator ships winning fixTasks as normal build tasks;
a `tighten` targetChange is written to `config/kpis.json`, a `loosen` is only
routed to `state/INBOX.md`. The scorecard lists active treasury spends with
their target KPIs — review each one. If it is not moving its KPI, include a
spend task with `action:"cancel"`.

LEDGER must identify recurring commitments, reserve impact and review-due
spend. PEOPLE may submit at most one separate `org_change` after the retro only
when there is enough outcome data; it cannot use meeting frequency or proposal
wins as performance evidence.

After two failed validation windows, VIZE must propose pivot or justify one last
bounded test. Never rewrite the original hypothesis, baseline or forecast.
Diagnose honestly: a failing KPI you own is not shameful — ignoring it is.
