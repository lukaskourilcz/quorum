# FightAIQ backtest status

Updated: 2026-08-02

Status: historical backfill running; calibration remains early

The calibration harness is implemented and tested against fixed fixtures. Wikimedia
history now enters in bounded, cited batches, and owner-reviewed imports can fill
gaps. The stored baseline is not yet a complete verified UFC and Oktagon dataset, so a
reliable public calibration curve is still unavailable.

The first real report must name the model version and input hash, keep each organization
separate, score every resolved bout with Brier and log loss, and state the sample size.
Isotonic calibration is unavailable until at least 150 resolved bouts exist. Before that
point, the public wording must say there is not enough history for a reliable calibration
curve.
