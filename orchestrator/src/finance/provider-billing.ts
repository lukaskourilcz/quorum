import { z } from "zod";
import { ProviderBillingSchema, type ProviderBilling } from "../contracts/cost-report.js";
import { roundUsd } from "./cost-attribution.js";

/**
 * What Anthropic says it billed, when the owner has created a key that can ask.
 *
 * The metered figure in `state/budget/ledger.json` is this company's own arithmetic over its own
 * calls. It is the number every other finance surface uses and it is the number this report
 * publishes. It is not the invoice. The Usage and Cost Admin API is the only place the invoice
 * lives, and reading it needs an Admin API key (`sk-ant-admin…`) that only an organization owner
 * can create in the Console — the ordinary `ANTHROPIC_API_KEY` cannot call `/v1/organizations/*`.
 *
 * So this adapter ships switched off and silent, and every failure spells the same way as an
 * absent key: it returns `null` with a reason and never throws. A missing billed column must
 * never fail a cycle, because the cycle's job is to publish an edition, not to reconcile a bill.
 *
 * Two switches, both required, the same posture the illustration rung uses: a key with no flag is
 * an account nobody has decided about, and a flag with no key cannot fetch. Neither the key nor
 * the flag is set anywhere in this repository.
 *
 * The request and response shapes below are written from the published API documentation and are
 * **unverified against the live service** — no call can be made from this checkout. If the first
 * real call disagrees, the disagreement lands as `malformed-response`, the billed column stays
 * `unavailable`, and nothing else changes. That is the intended failure, not a defect to work
 * around by loosening the parse.
 */

type FetchLike = typeof fetch;

const ENDPOINT = "https://api.anthropic.com/v1/organizations/cost_report";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 20_000;
/** The API pages daily buckets; a month is 31 of them, and this is the ceiling on that walk. */
const MAX_PAGES = 8;

export type ProviderBillingReason =
  | "disabled"
  | "no-admin-key"
  | "request-failed"
  | "rejected"
  | "malformed-response"
  | "not-usd"
  | "ok";

export interface ProviderBillingOutcome {
  billing: ProviderBilling | null;
  reason: ProviderBillingReason;
  /** One sentence a reader can act on, carried into the report so the absence explains itself. */
  detail: string;
}

export interface ProviderBillingEnvironment {
  ANTHROPIC_ADMIN_API_KEY?: string | undefined;
  PROVIDER_BILLING_ENABLED?: string | undefined;
}

export interface ProviderBillingRequest {
  month: string;
  env?: ProviderBillingEnvironment;
  fetchImpl?: FetchLike;
  now?: Date;
}

/**
 * The documented cost-report envelope, parsed strictly.
 *
 * `amount` is a decimal string in the bucket's currency. It is read as a string first and
 * converted once, here, so a number that arrives as `"0.0031"` cannot silently become `0` through
 * an integer parse somewhere downstream.
 */
const CostResultSchema = z.object({
  currency: z.string(),
  amount: z.union([z.string(), z.number()])
});

const CostBucketSchema = z.object({
  starting_at: z.string(),
  results: z.array(CostResultSchema)
});

const CostReportResponseSchema = z.object({
  data: z.array(CostBucketSchema),
  has_more: z.boolean().optional(),
  next_page: z.string().nullish()
});

function enabled(env: ProviderBillingEnvironment): boolean {
  const flag = env.PROVIDER_BILLING_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

function monthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function amountUsd(result: z.infer<typeof CostResultSchema>): number | null {
  if (result.currency.toUpperCase() !== "USD") return null;
  const value = typeof result.amount === "number" ? result.amount : Number.parseFloat(result.amount);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function bucketDate(startingAt: string): string | null {
  const parsed = new Date(startingAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function unavailable(reason: ProviderBillingReason, detail: string): ProviderBillingOutcome {
  return { billing: null, reason, detail };
}

/**
 * Fetches the month's billed total, or explains why it could not.
 *
 * Never throws, never retries a rejection and never spends: the Usage and Cost Admin API is a
 * read over the organization's own billing records and makes no model call, so this path draws
 * nothing from the `$25` model share. It still ships behind a flag, because an unflagged network
 * call is a call nobody decided to make.
 */
export async function fetchProviderBilling(request: ProviderBillingRequest): Promise<ProviderBillingOutcome> {
  const env = request.env ?? (process.env as ProviderBillingEnvironment);
  if (!enabled(env)) {
    return unavailable("disabled", "PROVIDER_BILLING_ENABLED is not set, so no billing request was made.");
  }
  const key = env.ANTHROPIC_ADMIN_API_KEY?.trim();
  if (!key) {
    return unavailable("no-admin-key", "No ANTHROPIC_ADMIN_API_KEY is configured; only an organization owner can create one.");
  }
  const bounds = monthBounds(request.month);
  if (!bounds) return unavailable("malformed-response", `"${request.month}" is not a YYYY-MM month.`);

  const fetchImpl = request.fetchImpl ?? fetch;
  const days = new Map<string, number>();
  let page: string | null = null;

  for (let visited = 0; visited < MAX_PAGES; visited += 1) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("starting_at", bounds.start);
    url.searchParams.set("ending_at", bounds.end);
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "31");
    if (page) url.searchParams.set("page", page);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          "x-api-key": key,
          "anthropic-version": ANTHROPIC_VERSION,
          accept: "application/json"
        },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      // A timeout, a DNS failure and a refused connection are one outcome to a reader: no bill.
      return unavailable("request-failed", `The billing request did not complete: ${error instanceof Error ? error.message : String(error)}.`);
    }
    if (!response.ok) {
      return unavailable("rejected", `The billing API answered ${response.status}; the key may lack organization scope.`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return unavailable("malformed-response", "The billing API returned a body that is not JSON.");
    }
    const parsed = CostReportResponseSchema.safeParse(body);
    if (!parsed.success) {
      return unavailable("malformed-response", "The billing API returned a body this adapter does not recognise.");
    }

    for (const bucket of parsed.data.data) {
      const date = bucketDate(bucket.starting_at);
      if (!date || date.slice(0, 7) !== request.month) continue;
      for (const result of bucket.results) {
        const usd = amountUsd(result);
        if (usd === null) {
          return unavailable("not-usd", `The billing API reported ${result.currency}; this report only records USD.`);
        }
        days.set(date, (days.get(date) ?? 0) + usd);
      }
    }

    const next = parsed.data.has_more ? parsed.data.next_page ?? null : null;
    if (!next) break;
    page = next;
  }

  const dayRows = [...days.entries()]
    .map(([date, usd]) => ({ date, usd: roundUsd(usd) }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const billing = ProviderBillingSchema.safeParse({
    source: "anthropic-cost-report",
    fetchedAt: (request.now ?? new Date()).toISOString(),
    month: request.month,
    currency: "USD",
    totalUsd: roundUsd(dayRows.reduce((carry, row) => carry + row.usd, 0)),
    days: dayRows
  } satisfies ProviderBilling);
  if (!billing.success) {
    return unavailable("malformed-response", "The billing figures did not satisfy the cost-report contract.");
  }
  return { billing: billing.data, reason: "ok", detail: `Billed total read from the Usage and Cost Admin API for ${request.month}.` };
}
