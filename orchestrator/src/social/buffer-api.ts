import { z } from "zod";
import { ProviderRejectedError } from "./publish.js";

/**
 * Buffer's GraphQL API, reduced to the three operations the LinkedIn transport needs (quorum#571):
 * a read-only channel check, `createPost`, and reading one post back.
 *
 * What an answer means decides whether a failed send is ambiguous. Before the create request
 * leaves, nothing can exist, so every failure is a `ProviderRejectedError`. A create refused with a
 * 429, a 401 or 403, or a typed validation, plan-limit, authorization or not-found error created
 * nothing either. A timeout, a server error, an unreadable body or Buffer's `UNEXPECTED` may hide a
 * post, and stays an ordinary error the runner holds for reconciliation. A refused read says
 * nothing about the post it asked for, so a read is never definite.
 *
 * Sources, read 2026-09-25: https://developers.buffer.com/guides/error-handling.md,
 * /guides/api-limits.md, /guides/posts-and-scheduling.md and /reference.md.
 */
export const BUFFER_API_URL = "https://api.buffer.com";

/** Buffer's GraphQL API has no version header; fields are added and never changed or removed. */
export const BUFFER_API_VERSION = "graphql-current";

const REQUEST_TIMEOUT_MS = 20_000;
/**
 * The waits between read-backs in one verify call: about 1 minute 45 seconds before the call gives
 * up, and the runner verifies at most twice. Buffer queues a shareNow post and uploads the image to
 * LinkedIn before it reports `sent`; 40 seconds of that is ordinary for an image post, and three
 * reads five seconds apart called it ambiguous, paused the connection and the venture, and left the
 * owner reconciling a post that had gone out (quorum#571 review).
 */
export const BUFFER_VERIFY_WAITS_MS = [5_000, 10_000, 20_000, 30_000, 40_000] as const;
/** Read-backs per verify call: one before the first wait and one after each. */
export const BUFFER_VERIFY_READS = BUFFER_VERIFY_WAITS_MS.length + 1;
/** One channel check, one create and two verify calls' reads: the most a single post can cost. */
export const BUFFER_REQUESTS_PER_POST = 1 + 1 + 2 * BUFFER_VERIFY_READS;

const CHANNEL_QUERY = `query BoardlessBufferChannel($input: ChannelInput!) {
  channel(input: $input) { id service type isDisconnected isLocked isQueuePaused }
}`;

const CREATE_POST_MUTATION = `mutation BoardlessBufferCreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id channelId status } }
    ... on MutationError { message }
  }
}`;

const POST_QUERY = `query BoardlessBufferPost($input: PostInput!) {
  post(input: $input) { id channelId channelService status sentAt externalLink error { message } }
}`;

const GraphqlErrorSchema = z.object({
  message: z.string().optional(),
  extensions: z.object({ code: z.string().optional(), window: z.string().optional() }).optional()
});

const GraphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(GraphqlErrorSchema).optional()
});

const ChannelAnswerSchema = z.object({
  channel: z.object({
    id: z.string().min(1),
    service: z.string(),
    type: z.string(),
    isDisconnected: z.boolean(),
    isLocked: z.boolean(),
    isQueuePaused: z.boolean()
  })
});

const CreatePostAnswerSchema = z.object({
  createPost: z.object({
    __typename: z.string(),
    post: z.object({ id: z.string().min(1), channelId: z.string().min(1), status: z.string() }).optional(),
    message: z.string().optional()
  })
});

const PostAnswerSchema = z.object({
  post: z.object({
    id: z.string().min(1),
    channelId: z.string().min(1),
    channelService: z.string(),
    status: z.enum(["draft", "error", "needs_approval", "scheduled", "sending", "sent"]),
    sentAt: z.string().nullable().optional(),
    externalLink: z.string().nullable().optional(),
    error: z.object({ message: z.string() }).nullable().optional()
  })
});

export type FetchLike = typeof fetch;
export type BufferPost = z.infer<typeof PostAnswerSchema>["post"];

export interface BufferChannelProbe {
  state: "healthy" | "setup-needed" | "unavailable" | "rate-limited";
  reason: string;
  /** The fewest requests left in any of Buffer's windows, when the answer carried the header. */
  requestsRemaining: number | null;
}

type Phase = "probe" | "create" | "read";

interface GraphqlResult {
  data: unknown;
  errors: Array<z.infer<typeof GraphqlErrorSchema>>;
  requestsRemaining: number | null;
}

/** Buffer's own wording can echo the input; keep one bounded line of it. */
export function providerText(value: string | undefined): string {
  return (value ?? "no message").replace(/\s+/gu, " ").trim().slice(0, 200) || "no message";
}

function remainingRequests(response: Response): number | null {
  const header = response.headers.get("ratelimit");
  if (!header) return null;
  const values = [...header.matchAll(/\br=(\d+)/gu)].map((match) => Number(match[1]));
  return values.length === 0 ? null : Math.min(...values);
}

function rateLimitedError(response: Response, body: unknown): ProviderRejectedError {
  const retryAfter = Number(response.headers.get("retry-after"));
  const parsed = GraphqlEnvelopeSchema.safeParse(body);
  const window = parsed.success ? parsed.data.errors?.[0]?.extensions?.window : undefined;
  const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.round(retryAfter) : null;
  return new ProviderRejectedError(
    "rate-limited",
    `Buffer rate limit reached${window ? ` on the ${providerText(window)} window` : ""}; nothing was created${seconds === null ? "" : `; retry after ${seconds} s`}`,
    seconds
  );
}

/** A GraphQL `errors` entry without the operation's result: the code says whether it is proof. */
function graphqlError(error: z.infer<typeof GraphqlErrorSchema>, phase: Phase): Error {
  const code = error.extensions?.code;
  const text = `Buffer ${phase === "create" ? "createPost" : phase === "probe" ? "channel check" : "post read"} refused (${providerText(code)}): ${providerText(error.message)}`;
  if (phase === "read") return new Error(text);
  if (code === "RATE_LIMIT_EXCEEDED") return new ProviderRejectedError("rate-limited", "Buffer rate limit reached; nothing was created");
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return new ProviderRejectedError("unauthorized", text);
  if (code === "NOT_FOUND") return new ProviderRejectedError("not-found", text);
  // UNEXPECTED and anything unknown: Buffer failed on its side, and a create may or may not exist.
  return phase === "probe" ? new ProviderRejectedError("channel-unavailable", `${text}; nothing was created`) : new Error(text);
}

/**
 * One request. It throws only for the transport: no answer, an HTTP refusal or an unreadable body.
 * GraphQL `errors` come back with the data, because a successful create may carry warnings and
 * must never be mistaken for a refused one.
 */
async function graphql(fetchImpl: FetchLike, apiKey: string, query: string, variables: Record<string, unknown>, phase: Phase): Promise<GraphqlResult> {
  const unclear = (message: string): Error => phase === "probe"
    ? new ProviderRejectedError("channel-unavailable", `${message}; nothing was created`)
    : new Error(message);
  let response: Response;
  try {
    response = await fetchImpl(BUFFER_API_URL, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw unclear(`Buffer did not answer: ${error instanceof Error ? providerText(error.name) : "request failed"}`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (phase === "read" && [401, 403, 429].includes(response.status)) {
    throw new Error(`Buffer refused the post read (HTTP ${response.status})`);
  }
  if (response.status === 429) throw rateLimitedError(response, body);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRejectedError("unauthorized", `Buffer refused the API key (HTTP ${response.status}); nothing was created`);
  }
  if (!response.ok) throw unclear(`Buffer returned HTTP ${response.status}`);
  const envelope = GraphqlEnvelopeSchema.safeParse(body);
  if (!envelope.success) throw unclear("Buffer returned an unreadable answer");
  return { data: envelope.data.data ?? null, errors: envelope.data.errors ?? [], requestsRemaining: remainingRequests(response) };
}

/**
 * The read-only health probe: one request proving the key works and the channel is a connected,
 * unlocked LinkedIn Page with a running queue, and that enough requests remain for a whole post.
 * It creates nothing, so any failure it reports is certain to have sent nothing.
 */
export async function probeBufferLinkedInChannel(input: { apiKey: string; channelId: string; fetchImpl?: FetchLike }): Promise<BufferChannelProbe> {
  const failed = (error: unknown): BufferChannelProbe => {
    const reason = error instanceof ProviderRejectedError ? error.reason : null;
    return {
      state: reason === "rate-limited" ? "rate-limited" : reason === "unauthorized" || reason === "not-found" ? "setup-needed" : "unavailable",
      reason: error instanceof Error ? error.message : "Buffer channel check failed",
      requestsRemaining: null
    };
  };
  let result: GraphqlResult;
  try {
    result = await graphql(input.fetchImpl ?? fetch, input.apiKey, CHANNEL_QUERY, { input: { id: input.channelId } }, "probe");
  } catch (error) {
    return failed(error);
  }
  const parsed = ChannelAnswerSchema.safeParse(result.data);
  if (!parsed.success) return failed(result.errors[0] ? graphqlError(result.errors[0], "probe") : new Error("Buffer returned an unreadable channel"));
  const channel = parsed.data.channel;
  const problems = [
    channel.id !== input.channelId ? "the channel id does not match the reference" : null,
    channel.service !== "linkedin" ? `the channel is ${providerText(channel.service)}, not LinkedIn` : null,
    // A Company Page, never a personal profile: owner-personal targets are never live.
    channel.type !== "page" ? `the channel is a LinkedIn ${providerText(channel.type)}, not a Page` : null,
    channel.isDisconnected ? "the channel is disconnected in Buffer" : null,
    channel.isLocked ? "the channel is locked by Buffer's plan" : null,
    channel.isQueuePaused ? "the channel's Buffer queue is paused" : null
  ].filter((problem): problem is string => problem !== null);
  if (problems.length > 0) {
    return { state: "setup-needed", reason: `Buffer channel check failed: ${problems.join("; ")}`, requestsRemaining: result.requestsRemaining };
  }
  if (result.requestsRemaining !== null && result.requestsRemaining < BUFFER_REQUESTS_PER_POST) {
    return {
      state: "rate-limited",
      reason: `Buffer has ${result.requestsRemaining} requests left in a window and a post needs up to ${BUFFER_REQUESTS_PER_POST}`,
      requestsRemaining: result.requestsRemaining
    };
  }
  return { state: "healthy", reason: "LinkedIn Page channel connected", requestsRemaining: result.requestsRemaining };
}

function typedMutationError(typename: string, message: string | undefined): Error {
  const text = `Buffer refused the post (${providerText(typename)}): ${providerText(message)}`;
  switch (typename) {
    case "LimitReachedError": return new ProviderRejectedError("plan-limit", `${text}; nothing was created`);
    case "InvalidInputError": return new ProviderRejectedError("invalid-input", `${text}; nothing was created`);
    case "UnauthorizedError": return new ProviderRejectedError("unauthorized", `${text}; nothing was created`);
    case "NotFoundError": return new ProviderRejectedError("not-found", `${text}; nothing was created`);
    // UnexpectedError, RestProxyError and any error type added later: not proof of absence.
    default: return new Error(text);
  }
}

/** `shareNow`: the queue owns the window and the runner calls this only inside it. */
export async function createBufferPost(input: {
  fetchImpl: FetchLike;
  apiKey: string;
  channelId: string;
  text: string;
  images: ReadonlyArray<{ url: string; altText: string }>;
}): Promise<{ postId: string }> {
  const result = await graphql(input.fetchImpl, input.apiKey, CREATE_POST_MUTATION, {
    input: {
      text: input.text,
      channelId: input.channelId,
      schedulingType: "automatic",
      mode: "shareNow",
      assets: input.images.map(({ url, altText }) => ({ image: { url, metadata: { altText } } }))
    }
  }, "create");
  const parsed = CreatePostAnswerSchema.safeParse(result.data);
  if (!parsed.success) {
    throw result.errors[0] ? graphqlError(result.errors[0], "create") : new Error("Buffer returned an unreadable createPost answer");
  }
  const answer = parsed.data.createPost;
  if (answer.__typename !== "PostActionSuccess") throw typedMutationError(answer.__typename, answer.message);
  if (!answer.post) throw new Error("Buffer reported success without a post");
  if (answer.post.channelId !== input.channelId) throw new Error("Buffer created the post on a channel other than the reference");
  return { postId: answer.post.id };
}

export async function readBufferPost(input: { fetchImpl: FetchLike; apiKey: string; postId: string }): Promise<BufferPost> {
  const result = await graphql(input.fetchImpl, input.apiKey, POST_QUERY, { input: { id: input.postId } }, "read");
  const parsed = PostAnswerSchema.safeParse(result.data);
  if (!parsed.success) throw result.errors[0] ? graphqlError(result.errors[0], "read") : new Error("Buffer post verifier returned an invalid post");
  return parsed.data.post;
}
