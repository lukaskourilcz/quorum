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
