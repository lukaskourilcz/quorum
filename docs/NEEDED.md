# NEEDED — DNESKAi article production

- [ ] **Verify a live article with four distinct headlines and four available images.** Inspect the next review/2 record, provider receipts and Queue thumbnails. The 28 September legacy review has no available images and does not prove this flow. Investigate missing/rejected candidates or exhausted provider credit without raising the company spending limits. [imp:5] [owner:ai] [time:30m] [kind:setup]

- [ ] **Choose the headline and image, approve the article, and verify delivery to https://dneskai.vercel.app.** Only the owner can make this editorial choice. The live Queue read succeeded on 28 September; verify that approval also saves its decision and dispatches delivery. If GitHub returns 401/403, rotate the production `BOARDLESSAI_GITHUB_TOKEN` for quorum only (Contents read/write, Actions write). Confirm that publication uses the selected headline and image and retries do not duplicate it. [imp:5] [owner:me] [time:10m] [kind:content]

- [ ] **Complete the validated preview and production release of the DNESKAi-only cleanup.** Run the repository release gate, smoke-test preview and deploy the validated commit using the guarded production command. Remove this task only after successful release. [imp:5] [owner:ai] [time:30m] [kind:deploy]

- [ ] **Record actual provider payments in the treasury ledger.** The owner supplies amounts/currency and dates for fal.ai credit, Anthropic credit and Apify invoices; do not substitute advertised prices or estimated usage for payments. [imp:3] [owner:me] [time:15m] [kind:setup]

- [ ] **Cancel or retain the unused Apify subscription.** No current DNESKAi article source needs Apify. Cancellation needs the owner's instruction; if retained for a future approved source, review the $24 hard usage limit because recurring included credit is $19 (invoice $22.99 with tax). The extra $5 promotion expires 16 October. [imp:3] [owner:me] [time:5m] [kind:decision]
