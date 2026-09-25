/**
 * `--now <ISO instant>`: the morning a dry run rehearses (quorum#576).
 *
 * marketingShark drafts a different kind each weekday, so proving the rotation means dry-running
 * Monday to Sunday without waiting a week. A live cycle always runs on the real clock: the flag is
 * refused without `--dry`, so no invocation can make a paid room believe it is another day.
 */
export function dryRunClock(args: readonly string[]): Date | undefined {
  const index = args.indexOf("--now");
  if (index < 0) return undefined;
  if (!args.includes("--dry")) throw new Error("--now is for dry runs only: a live cycle runs on the real clock.");
  const value = args[index + 1] ?? "";
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || Number.isNaN(parsed)) {
    throw new Error("--now takes an ISO instant with its zone, such as 2026-09-29T05:00:00Z");
  }
  return new Date(parsed);
}
