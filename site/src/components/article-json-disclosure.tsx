/**
 * The one place a reader is shown a machine artifact on purpose.
 *
 * Everywhere else the site turns records into sentences. This block is the exception the owner
 * asked for: on a day an article was delivered, the exact package that left the building is
 * worth being able to open, folded away behind a summary and capped so it cannot take over the
 * page. It renders as a message from the delivery coordinator because that is whose work it is.
 */
export function ArticleJsonDisclosure({
  json,
  note
}: {
  json: string;
  note?: string;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--mist)]">
        See the article that was sent in .json
      </summary>
      {note ? <p className="mt-3 text-sm leading-6 text-[var(--fog)]">{note}</p> : null}
      <pre
        className="mt-3 max-h-[320px] overflow-y-auto overflow-x-auto rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-[0.6875rem] leading-5 text-[var(--mist)]"
        tabIndex={0}
      >
        {json}
      </pre>
    </details>
  );
}
