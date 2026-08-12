import { DEFAULT_BUDGET_LIMITS, type BudgetLimits, type ReserveContext } from "../budget.js";
import { guardedJsonCall } from "../llm/call.js";

/** A reference the caller can resolve back to its own canonical book record. */
export type ResearchBookRef = string;

export interface ResearchBookInput {
  bookRef: ResearchBookRef;
  /** Venture-owned brief data. Providers transport it without knowing its schema. */
  brief: unknown;
  /** Hard maximum this one provider operation may spend, in US dollars. */
  envelopeUsd: number;
}

/**
 * Provider output before a venture normalizes it into a dossier.
 *
 * `response` deliberately remains unknown. Keeping vendor blocks out of this shared interface
 * lets a venture retain the paid response without making its dossier code depend on an SDK.
 */
export interface RawResearch {
  response: unknown;
  providerId: string;
  model: string;
  startedAt: string;
  completedAt: string;
  tokensIn: number;
  tokensOut: number;
  searchUses: number;
  usd: number;
}

export interface ResearchProvider {
  researchBook(input: ResearchBookInput): Promise<RawResearch>;
}

/** The sole config value a caller needs in order to select a research implementation. */
export interface ResearchProviderConfig {
  providerId: string;
}

export type ResearchProviderFactory = () => ResearchProvider;
export type ResearchProviderRegistry = ReadonlyMap<string, ResearchProviderFactory>;

export const ANTHROPIC_WEB_SEARCH_PROVIDER_ID = "anthropic-web-search";

export interface AnthropicWebSearchProviderOptions {
  stateRoot: string;
  cycleId: string;
  phase: string;
  ventureId?: string;
  agent: string;
  model: string;
  system: string;
  maxOutputTokens: number;
  webSearchUses: number;
  maxSearchContentTokens: number;
  budgetContext: ReserveContext;
  dry?: boolean;
  now?: () => Date;
}

export class ResearchProviderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchProviderRegistryError";
  }
}

/**
 * Build an immutable-by-convention registry and reject ambiguous provider ids.
 *
 * Factories keep credentials and SDK clients lazy: reading config must never create a paid-call
 * client. The application owns the production entries; tests can supply a stub without adding a
 * second adapter to the repository.
 */
export function createResearchProviderRegistry(
  entries: Iterable<readonly [providerId: string, factory: ResearchProviderFactory]>
): ResearchProviderRegistry {
  const registry = new Map<string, ResearchProviderFactory>();
  for (const [rawId, factory] of entries) {
    const providerId = rawId.trim();
    if (providerId.length === 0) {
      throw new ResearchProviderRegistryError("Research provider id cannot be empty");
    }
    if (registry.has(providerId)) {
      throw new ResearchProviderRegistryError(`Research provider ${providerId} is registered more than once`);
    }
    registry.set(providerId, factory);
  }
  return registry;
}

/** The one place config ids become provider implementations. */
export function resolveResearchProvider(
  config: ResearchProviderConfig,
  registry: ResearchProviderRegistry
): ResearchProvider {
  const providerId = config.providerId.trim();
  const factory = registry.get(providerId);
  if (!factory) {
    throw new ResearchProviderRegistryError(`Unknown research provider: ${providerId || "(empty)"}`);
  }
  return factory();
}

function tightenedLimits(context: ReserveContext, envelopeUsd: number): BudgetLimits {
  const current = context.limits ?? DEFAULT_BUDGET_LIMITS;
  return { ...current, perTextCallUsd: Math.min(current.perTextCallUsd, envelopeUsd) };
}

/** The program's sole concrete research adapter. It can gather, but cannot publish. */
export class AnthropicWebSearchResearchProvider implements ResearchProvider {
  constructor(private readonly options: AnthropicWebSearchProviderOptions) {}

  async researchBook(input: ResearchBookInput): Promise<RawResearch> {
    if (!Number.isFinite(input.envelopeUsd) || input.envelopeUsd <= 0) {
      throw new ResearchProviderRegistryError("Research envelope must be a positive dollar amount");
    }
    const now = this.options.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const call = await guardedJsonCall<unknown>({
      stateRoot: this.options.stateRoot,
      cycleId: this.options.cycleId,
      phase: this.options.phase,
      ventureId: this.options.ventureId,
      agent: this.options.agent,
      provider: "anthropic",
      model: this.options.model,
      system: this.options.system,
      input: JSON.stringify({ bookRef: input.bookRef, brief: input.brief }),
      maxOutputTokens: this.options.maxOutputTokens,
      webSearch: {
        maxUses: this.options.webSearchUses,
        maxSearchContentTokens: this.options.maxSearchContentTokens
      },
      budgetContext: {
        ...this.options.budgetContext,
        limits: tightenedLimits(this.options.budgetContext, input.envelopeUsd)
      },
      parse: (text) => JSON.parse(text) as unknown,
      dry: this.options.dry
    });
    const usage = call.usage ?? {
      model: this.options.model,
      tokensIn: 0,
      tokensOut: 0,
      toolUses: 0
    };
    return {
      response: call.value,
      providerId: ANTHROPIC_WEB_SEARCH_PROVIDER_ID,
      model: usage.model,
      startedAt,
      completedAt: now().toISOString(),
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      searchUses: usage.toolUses,
      usd: call.usd
    };
  }
}

/** Production registry for this program: exactly one adapter, selected later through config. */
export function createAnthropicWebSearchRegistry(
  options: AnthropicWebSearchProviderOptions
): ResearchProviderRegistry {
  return createResearchProviderRegistry([
    [ANTHROPIC_WEB_SEARCH_PROVIDER_ID, () => new AnthropicWebSearchResearchProvider(options)]
  ]);
}
