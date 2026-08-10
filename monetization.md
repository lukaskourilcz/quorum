# BoardlessAI — monetizace

The catalog now lives in `config/monetization-options.json` and is rendered in the admin under
**Future → Ways this could earn** — seventeen options across ads, affiliate, commerce,
subscription, products, services, licensing and support, each with a plain description, what it
would cost to start, which projects it fits and what is standing in its way.

That file is the single copy. This page used to hold a second table of the same options, which is
exactly the drift `docs/ENGINEERING.md` rule 4 exists to stop: two lists of the same facts, one of
them quietly wrong.

Nothing in the catalog is switched on, and nothing in it spends anything. Every option that would
cost money, create an account or enable a channel goes through `state/INBOX.md` as a
`HUMAN_APPROVAL` first, inside the $30 all-in operating cap from `budget-2026-08e`.
