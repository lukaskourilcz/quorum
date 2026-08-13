# FightAIQ state

This directory keeps FightAIQ decisions, readiness notes, reports and compatibility
records. Canonical fighter cards, bouts, odds, model runs and Stats entries now live in
`state/mma/`; there is no parallel fighter database here.

No live fighter or event record is committed until its contract passes. Important
identity, division, record, age, height, reach and stance fields need two agreeing
sources before the probability model can use them. Missing credentials produce an
honest empty public view; they never produce sample fighters presented as real.

The guarded import and meeting jobs may still write signed project reports here. Odds
entered by the owner are append-only in `state/mma/odds/` for each bout, capture phase
and source.

The [doctrine](DOCTRINE.md) defines the analysis boundary and the [backtest](BACKTEST.md) records
the calibration method. The cross-venture [MMA bridge](../../mma/BRIDGE.md) explains which records
MMA Files may render.
