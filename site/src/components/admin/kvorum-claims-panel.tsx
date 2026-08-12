/**
 * The claims tab before its canonical ledger exists.
 *
 * Recommendation claims are draft evidence. Treating them as published merely because a panel
 * needs rows would erase the distinction this venture is meant to protect. KV-18 supplies the
 * typed published-claim ledger and its correction writer; until then this surface says exactly
 * what is absent and offers no write control.
 */
export function KvorumClaimsPanel() {
  return (
    <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-4">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f5d90a]">Running claims ledger</h3>
      <p className="mt-3 max-w-3xl text-[13px] leading-[1.65] text-[#d4d4d8]">
        No published-claim ledger is stored yet. Claims inside recommendations remain draft
        evidence; they do not become standing claims until the owner records a manual post.
      </p>
      <p className="mt-2 max-w-3xl text-[11.5px] leading-[1.55] text-[#94949c]">
        This tab will show each published claim&rsquo;s type, source links and standing, corrected or
        retracted status. It does not infer publication from approval and cannot draft a correction
        without a canonical claim record.
      </p>
    </section>
  );
}
