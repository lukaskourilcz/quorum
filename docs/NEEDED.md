# NEEDED — DNESKAi article production

- [ ] **Restore production Queue access if the GitHub credential is still invalid.** Verify `BOARDLESSAI_GITHUB_TOKEN` on Vercel project `quorum-site`; the previous audit recorded 401/403. If necessary, the owner must create a fine-grained token restricted to `lukaskourilcz/quorum`, Contents read/write and Actions write, then store it as a production secret and redeploy. Actions write starts reviewed-article delivery.

- [ ] **Verify a live article with four distinct headlines and four available images.** Inspect the next review/2 record, provider receipts and Queue thumbnails. The 28 September legacy review has no available images and does not prove this flow. Investigate missing/rejected candidates or exhausted provider credit without raising the company spending limits.

- [ ] **Choose the headline and image, approve the article, and verify delivery to https://dneskai.vercel.app.** Only the owner can make this editorial choice. Confirm that the published article contains exactly the selected headline and image and that retrying delivery does not duplicate it.

- [ ] **Complete the validated preview and production release of the DNESKAi-only cleanup.** Run the repository release gate, smoke-test preview and deploy the validated commit using the guarded production command. Remove this task only after successful release.

- [ ] **Record actual provider payments in the treasury ledger.** The owner supplies amounts/currency and dates for fal.ai credit, Anthropic credit and Apify invoices; do not substitute advertised prices or estimated usage for payments.

- [ ] **Cancel or retain the unused Apify subscription.** No current DNESKAi article source needs Apify. Cancellation needs the owner's instruction; if retained for a future approved source, review the $24 hard usage limit because recurring included credit is $19 (invoice $22.99 with tax). The extra $5 promotion expires 16 October.

- [ ] Add `PIXABAY_API_KEY` to GitHub Actions so the licensed-photo search can use pixabay. Openverse and Wikimedia remain active without it.
