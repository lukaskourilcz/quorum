# FightAIQ backtest status

Updated: 2026-08-01

Status: waiting for verified historical inputs

The calibration harness is implemented and tested against fixed fixtures. A real
backtest is intentionally not published yet: no approved historical dataset covering
UFC, KSW and Oktagon is stored in the repository, and the regional source terms still
need owner review.

The first real report must name the model version and input hash, keep each organization
separate, score every resolved bout with Brier and log loss, and state the sample size.
Isotonic calibration is unavailable until at least 150 resolved bouts exist. Before that
point, the public wording must say there is not enough history for a reliable calibration
curve.
