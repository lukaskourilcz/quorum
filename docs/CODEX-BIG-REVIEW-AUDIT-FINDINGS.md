# Big review — things that need your decision

One bullet per finding, grouped by area. Each is 1–2 lines, written plainly.
Everything that was simply missing or broken has already been fixed — those
fixes are in the commit history, not here.

## Public launch

- Tehdejší svět needs its final website address in `NEXT_PUBLIC_TEHDEJSI_PRODUCT_URL`.
  Until then, its public page says the address is still waiting for the owner.
- FOLIO and PLOT are owner-workspace roles under the BOOKSOFHISTORY founding decision.
  Public profile pages for them need the owner to amend that decision.
- The seven newest roles use neutral name tiles because they have no approved portraits.
  Creating their portraits is an owner taste decision.

## Targets

- Tehdejší svět's design expects at least 12 features a month, but its approved target is 8.
  The owner needs to decide whether to raise the target.

## Live data access

- Door Money still needs `BOOK_PRIVATE_CLONE_PATH` and, if required, `BOOK_SOURCE_TOKEN`.
  Until they are configured, live book knowledge stays off.
- GitHub Actions still needs `APIFY_TOKEN` before GoVIRAL, MMA or Kvórum can use Apify.
  Without it, their tested no-call and no-spend paths remain active.
