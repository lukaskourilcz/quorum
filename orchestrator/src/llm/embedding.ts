import OpenAI from "openai";
import { z } from "zod";
import {
  assertEmbeddingReservation,
  BudgetLedgerEntrySchema,
  estimateEmbeddingCall,
  hasLedgerEntry,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../budget.js";
import { atomicWriteJson, readJson } from "../state.js";
import { requestHash } from "./cache.js";

const EmbeddingItemSchema = z.strictObject({
  id: z.string().trim().min(1).max(160),
  text: z.string().min(1)
});

const ProviderResponseSchema = z.strictObject({
  model: z.string().trim().min(1),
  tokensIn: z.number().int().nonnegative(),
  vectors: z.array(z.array(z.number().finite()).min(1)).min(1)
});

export interface EmbeddingItem {
  id: string;
  text: string;
}

export interface EmbeddingProviderResponse {
  model: string;
  tokensIn: number;
  vectors: number[][];
}

export interface EmbeddingProvider {
  embed(input: {
    model: "text-embedding-3-small";
    texts: string[];
  }): Promise<EmbeddingProviderResponse>;
}

export interface GuardedEmbeddingInput {
  stateRoot: string;
  cycleId: string;
  items: readonly EmbeddingItem[];
  budgetContext: ReserveContext;
  attempt?: number;
  dry?: boolean;
  provider?: EmbeddingProvider;
}

export interface GuardedEmbeddingResult {
  model: "text-embedding-3-small";
  items: Array<{ id: string; embedding: number[] }>;
  tokensIn: number;
  usd: number;
  requestHash: string;
}

export class OpenAiEmbeddingClient implements EmbeddingProvider {
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    this.client = new OpenAI({ apiKey });
  }

  async embed(input: {
    model: "text-embedding-3-small";
    texts: string[];
  }): Promise<EmbeddingProviderResponse> {
    const response = await this.client.embeddings.create({
      model: input.model,
      input: input.texts,
      encoding_format: "float"
    });
    return {
      model: response.model,
      tokensIn: response.usage.prompt_tokens,
      vectors: [...response.data]
        .sort((left, right) => left.index - right.index)
        .map(({ embedding }) => embedding)
    };
  }
}

function assertVectors(response: z.infer<typeof ProviderResponseSchema>, expected: number): void {
  if (response.vectors.length !== expected) {
    throw new Error(`Embedding provider returned ${response.vectors.length} vectors for ${expected} inputs`);
  }
  const dimensions = new Set(response.vectors.map((vector) => vector.length));
  if (dimensions.size !== 1) throw new Error("Embedding provider returned inconsistent vector dimensions");
}

export async function guardedEmbeddingCall(
  input: GuardedEmbeddingInput
): Promise<GuardedEmbeddingResult> {
  const items = z.array(EmbeddingItemSchema).min(1).max(2_048).parse(input.items);
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error("Embedding item ids must be unique");
  }
  const model = "text-embedding-3-small" as const;
  const hash = requestHash({
    model,
    items,
    ...(input.attempt && input.attempt > 1 ? { attempt: input.attempt } : {})
  });
  const durable = await readJson<{ entries: BudgetLedgerEntry[] }>(
    input.stateRoot,
    "budget/ledger.json",
    { entries: [] }
  );
  if (hasLedgerEntry(durable.entries, input.cycleId, hash)) {
    throw new Error("Embedding request is already billed; retrieve its vector from the private store or use an explicit retry attempt");
  }

  const estimate = estimateEmbeddingCall({
    model,
    inputChars: items.reduce((sum, { text }) => sum + text.length, 0),
    at: input.budgetContext.now
  });
  assertEmbeddingReservation(estimate, input.budgetContext);
  if (input.dry) throw new Error("A dry cycle attempted a paid embedding call");

  const response = await (input.provider ?? new OpenAiEmbeddingClient()).embed({
    model,
    texts: items.map(({ text }) => text)
  });
  const billedTokens = Number.isInteger(response.tokensIn) && response.tokensIn >= 0
    ? response.tokensIn
    : estimate.estimatedInputTokens;
  const actual = estimateEmbeddingCall({
    model,
    inputChars: billedTokens * 3.5,
    at: input.budgetContext.now
  });
  const entry = BudgetLedgerEntrySchema.parse({
    ts: new Date().toISOString(),
    cycleId: input.cycleId,
    requestHash: hash,
    phase: "book-ingest",
    ventureId: "door-money",
    agent: "BOOK_INGEST",
    provider: "openai",
    model: typeof response.model === "string" && response.model ? response.model : model,
    serviceTier: "default",
    tokensIn: billedTokens,
    cachedTokensIn: 0,
    tokensOut: 0,
    toolUses: 0,
    usd: actual.estimatedUsd,
    kind: "embedding"
  });
  const latest = await readJson<{ entries: BudgetLedgerEntry[] }>(
    input.stateRoot,
    "budget/ledger.json",
    { entries: [] }
  );
  await atomicWriteJson(input.stateRoot, "budget/ledger.json", {
    schemaVersion: 1,
    entries: [...latest.entries, entry]
  });

  const parsed = ProviderResponseSchema.parse(response);
  if (parsed.model !== model) throw new Error(`Embedding provider changed model to ${parsed.model}`);
  assertVectors(parsed, items.length);
  return {
    model,
    items: items.map(({ id }, index) => ({ id, embedding: parsed.vectors[index]! })),
    tokensIn: parsed.tokensIn,
    usd: actual.estimatedUsd,
    requestHash: hash
  };
}
