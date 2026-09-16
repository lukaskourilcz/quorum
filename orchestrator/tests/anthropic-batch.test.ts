import { describe, expect, it } from "vitest";
import {
  AnthropicBatchDeadlineError,
  AnthropicBatchResultError,
  AnthropicTextClient
} from "../src/llm/anthropic.js";
import { ModelResponseTruncatedError } from "../src/llm/openai.js";

/**
 * The batch tier, with the SDK swapped for a recorder: what the client submits, how it waits,
 * what it reads back, and what it does when the room's clock runs out.
 */

type Params = Record<string, unknown>;

interface Recorder {
  client: AnthropicTextClient;
  created: Params[];
  retrieves: number;
  cancels: number;
  results: string[];
}

function message(text = "{}", stopReason = "end_turn") {
  return {
    content: [{ type: "text", text }],
    model: "claude-haiku-4-5-20251001",
    usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
    stop_reason: stopReason
  };
}

function recordingClient(input: {
  /** Processing status per retrieve, in order; the last one repeats. */
  statuses: string[];
  result?: Record<string, unknown>;
  cancelFails?: boolean;
}): Recorder {
  const client = new AnthropicTextClient("test-key");
  const recorder: Recorder = { client, created: [], retrieves: 0, cancels: 0, results: [] };
  const batch = (status: string) => ({ id: "msgbatch_1", processing_status: status, request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 } });
  (client as unknown as { client: unknown }).client = {
    messages: {
      create: async () => { throw new Error("the batch path must not call messages.create"); },
      batches: {
        create: async (params: Params) => { recorder.created.push(params); return batch("in_progress"); },
        retrieve: async () => {
          const status = input.statuses[Math.min(recorder.retrieves, input.statuses.length - 1)] ?? "in_progress";
          recorder.retrieves += 1;
          return batch(status);
        },
        cancel: async () => {
          recorder.cancels += 1;
          if (input.cancelFails) throw new Error("cancel refused");
          return batch("canceling");
        },
        results: async (id: string) => {
          recorder.results.push(id);
          const entries = [{ custom_id: "seat", result: input.result ?? { type: "succeeded", message: message() } }];
          return { async *[Symbol.asyncIterator]() { yield* entries; } };
        }
      }
    }
  };
  return recorder;
}

const base = {
  model: "claude-haiku-4-5-20251001",
  system: "Return JSON.",
  input: "{}",
  maxOutputTokens: 400,
  serviceTier: "batch" as const
};

/** The error a call threw, typed; a call that resolved is the failure here. */
async function failure<T>(attempt: Promise<unknown>): Promise<T> {
  return attempt.then(() => { throw new Error("expected the call to fail"); }, (error: unknown) => error as T);
}

function batchOptions(clock: { now: number }, deadlineAt: Date) {
  return {
    deadlineAt,
    pollIntervalMs: 1_000,
    clock: () => clock.now,
    sleep: async (ms: number) => { clock.now += ms; }
  };
}

describe("the batch tier", () => {
  it("submits one request with the same cacheable system block and reads the reply back", async () => {
    const recorder = recordingClient({ statuses: ["in_progress", "ended"] });
    const clock = { now: 0 };
    const response = await recorder.client.generate({
      ...base,
      effort: "low",
      thinking: "disabled",
      batch: batchOptions(clock, new Date(50 * 60_000))
    });
    expect(recorder.created).toHaveLength(1);
    const requests = recorder.created[0]?.requests as Array<{ custom_id: string; params: Params }>;
    expect(requests).toHaveLength(1);
    expect(requests[0]?.custom_id).toBe("seat");
    expect(requests[0]?.params.system).toEqual([{ type: "text", text: "Return JSON.", cache_control: { type: "ephemeral" } }]);
    expect(requests[0]?.params).toMatchObject({ model: base.model, max_tokens: 400, output_config: { effort: "low" }, thinking: { type: "disabled" } });
    // Polled until the batch ended, then read the results once.
    expect(recorder.retrieves).toBe(2);
    expect(recorder.results).toEqual(["msgbatch_1"]);
    expect(recorder.cancels).toBe(0);
    // The same shape the immediate path returns, so the ledger prices it the same way.
    expect(response).toEqual({ text: "{}", model: base.model, tokensIn: 120, tokensOut: 40, cachedTokensIn: 100, cacheWriteTokensIn: 0, toolUses: 0 });
  });

  it("cancels the batch and fails typed when the room's deadline passes", async () => {
    const recorder = recordingClient({ statuses: ["in_progress"] });
    const clock = { now: 0 };
    const deadlineAt = new Date(3 * 60_000);
    const error = await failure<AnthropicBatchDeadlineError>(recorder.client.generate({ ...base, batch: batchOptions(clock, deadlineAt) }));
    expect(error).toBeInstanceOf(AnthropicBatchDeadlineError);
    expect(error).toMatchObject({ batchId: "msgbatch_1", model: base.model, deadlineAt, cancelled: true });
    expect(recorder.cancels).toBe(1);
    expect(recorder.results).toEqual([]);
    // Never slept past the deadline: the last wait is cut to what was left of it.
    expect(clock.now).toBe(3 * 60_000);
  });

  it("still reports the deadline when the cancel itself is refused", async () => {
    const recorder = recordingClient({ statuses: ["in_progress"], cancelFails: true });
    const error = await failure<AnthropicBatchDeadlineError>(recorder.client.generate({ ...base, batch: batchOptions({ now: 0 }, new Date(1_000)) }));
    expect(error).toBeInstanceOf(AnthropicBatchDeadlineError);
    expect(error.cancelled).toBe(false);
    expect(error.message).toContain("the cancel request failed");
  });

  it("fails typed on an errored, expired or missing result", async () => {
    const errored = recordingClient({ statuses: ["ended"], result: { type: "errored", error: { type: "error", request_id: null, error: { type: "invalid_request_error", message: "bad params" } } } });
    const error = await failure<AnthropicBatchResultError>(errored.client.generate({ ...base, batch: batchOptions({ now: 0 }, new Date(60_000)) }));
    expect(error).toBeInstanceOf(AnthropicBatchResultError);
    expect(error).toMatchObject({ resultType: "errored" });
    expect(error.message).toContain("bad params");

    const expired = recordingClient({ statuses: ["ended"], result: { type: "expired" } });
    await expect(expired.client.generate({ ...base, batch: batchOptions({ now: 0 }, new Date(60_000)) })).rejects.toMatchObject({ resultType: "expired" });
  });

  it("reports a cut-off batch reply as a truncation, exactly like the immediate path", async () => {
    const recorder = recordingClient({ statuses: ["ended"], result: { type: "succeeded", message: message('{"half', "max_tokens") } });
    await expect(recorder.client.generate({ ...base, batch: batchOptions({ now: 0 }, new Date(60_000)) })).rejects.toBeInstanceOf(ModelResponseTruncatedError);
  });

  it("refuses a batch call with no deadline rather than waiting forever", async () => {
    const recorder = recordingClient({ statuses: ["ended"] });
    await expect(recorder.client.generate(base)).rejects.toThrow(/needs a deadline/u);
    expect(recorder.created).toHaveLength(0);
  });
});
