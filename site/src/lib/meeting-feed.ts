import { agentById, type AgentId } from "@/data/agents";
import type { PublicStandup } from "@/data/fixtures";
import type { PublicArticleSlotOutcome, PublicMeetingSkip } from "@/lib/calendar-feed-model";
import type { PublicMeetingKind, PublicMeetingRecord } from "@/lib/meeting-record-model";
import { publicAgentText } from "@/components/agent-language";
import { publicKindLabel } from "@/lib/slot-labels";

/**
 * The meeting archive as a chat feed: seven channels, day dividers, message-by-message replay.
 *
 * This is the data layer for the approved workspace viewer and nothing else. It renders no
 * markup, picks no colours and makes no language decision — the recorded text is stored as-is and
 * the Czech-vs-English question belongs to whoever implements the design.
 *
 * The one editorial rule it does enforce is the one the workspace would otherwise break: every
 * `text` here is prose a reader can read. Refs, hashes and phase tokens live in `attachment.ref`,
 * where they are a machine address behind a labelled disclosure, and nowhere else.
 */
export const WORKSPACE_CHANNELS = [
  { id: "vydani-dneskai", label: "DNESKAi edition" },
  { id: "ranni-porada", label: "Company board" },
  { id: "kontrola-mma-dat", label: "Fight data checks" },
  { id: "redakcni-porada-mma", label: "MMA Files story desk" },
  { id: "vecerni-redakce", label: "MMA Files evening desk" },
  { id: "titty-tuesdays-marketing", label: "Titty Tuesdays marketing" },
  { id: "goviral-trend-room", label: "GoVIRAL trend room" }
] as const;

export type WorkspaceChannelId = (typeof WORKSPACE_CHANNELS)[number]["id"];

/**
 * Which channel a room's records belong to.
 *
 * Seven channels for eleven slots, because a reader thinks in rooms rather than in cron entries:
 * the three board shifts are one conversation across a day, and the two fight-data rooms are one
 * running check. `article-am`/`article-pm` are not meetings at all — they are what the story desk
 * decided, so they land in that desk's channel as delivery or system lines.
 */
const CHANNEL_BY_KIND: Record<string, WorkspaceChannelId> = {
  "cu-edition": "vydani-dneskai",
  morning: "ranni-porada",
  afternoon: "ranni-porada",
  night: "ranni-porada",
  "mma-intake": "kontrola-mma-dat",
  "mma-analysis": "kontrola-mma-dat",
  "mag-editorial": "redakcni-porada-mma",
  "article-am": "redakcni-porada-mma",
  "article-pm": "redakcni-porada-mma",
  "mag-desk": "vecerni-redakce",
  "tt-marketing": "titty-tuesdays-marketing",
  "gv-brief": "goviral-trend-room"
};

export function channelForKind(kind: string): WorkspaceChannelId | null {
  return CHANNEL_BY_KIND[kind] ?? null;
}

export interface FeedAuthor {
  id: AgentId | "system";
  title: string;
}

export interface FeedMessage {
  id: string;
  at: string;
  author: FeedAuthor;
  kind: "system" | "message" | "decision" | "delivery";
  text: string;
  /** The only place a machine ref is allowed to appear, behind a label the reader chooses to open. */
  attachment?: { label: string; ref: string };
}

export interface FeedDay {
  date: string;
  messages: FeedMessage[];
}

export interface FeedChannel {
  id: WorkspaceChannelId;
  label: string;
  days: FeedDay[];
}

const SYSTEM: FeedAuthor = { id: "system", title: "BoardlessAI" };

function author(agent: AgentId): FeedAuthor {
  const profile = agentById.get(agent);
  return { id: agent, title: profile?.title ?? agent };
}

/** `cu-product` and `studio` have no channel; a room nobody opens gets no conversation. */
function isFeedKind(kind: PublicMeetingKind | string): boolean {
  return CHANNEL_BY_KIND[kind] !== undefined;
}

/**
 * The narrow shape a room record has to have to become messages.
 *
 * Both a meeting and a board standup satisfy it, which is the point: the workspace does not care
 * which of the two a conversation came from, and a cast between the two full types would have
 * been a lie about their fields rather than a statement about what this function reads.
 */
interface FeedSourceRecord {
  id: string;
  status: string;
  decision: { summary: string };
  roomTranscript: {
    openedAt: string;
    closedAt: string;
    gavel: AgentId;
    setting: string;
    turns: readonly { agent: AgentId; sentAt?: string; text: string }[];
  };
  generatedAt?: string;
}

function messagesForMeeting(record: FeedSourceRecord): FeedMessage[] {
  const messages: FeedMessage[] = [];
  const transcript = record.roomTranscript;

  // A PAUSED room never convened. One system line carrying the recorded reason, and nothing that
  // would let a reader click into a meeting that did not happen.
  if (record.status === "PAUSED") {
    return [{
      id: `${record.id}:paused`,
      at: record.generatedAt ?? record.roomTranscript.closedAt,
      author: SYSTEM,
      kind: "system",
      text: publicAgentText(record.decision.summary)
    }];
  }

  messages.push({
    id: `${record.id}:open`,
    at: transcript.openedAt,
    author: SYSTEM,
    kind: "system",
    text: publicAgentText(transcript.setting)
  });
  for (const [index, turn] of transcript.turns.entries()) {
    messages.push({
      id: `${record.id}:turn-${index}`,
      at: turn.sentAt ?? transcript.openedAt,
      author: author(turn.agent),
      kind: "message",
      text: publicAgentText(turn.text)
    });
  }
  messages.push({
    id: `${record.id}:decision`,
    at: transcript.closedAt,
    author: author(transcript.gavel),
    kind: "decision",
    text: publicAgentText(record.decision.summary)
  });
  return messages;
}

/** A delivered edition or article, with the package the JSON disclosure opens. */
function deliveryMessage(input: {
  id: string;
  at: string;
  text: string;
  ref: string;
}): FeedMessage {
  return {
    id: input.id,
    at: input.at,
    author: SYSTEM,
    kind: "delivery",
    text: input.text,
    attachment: { label: "Delivered package", ref: input.ref }
  };
}

/**
 * Time order, with one deliberate tie-break.
 *
 * A room's closing turn and its decision share an instant — the decision *is* the close — so a
 * plain timestamp sort put them in whichever order their ids happened to compare in. The decision
 * is the last thing said in a room, so it sorts last within its instant; a delivery comes after
 * that, because it is what happened once the room was over.
 */
const KIND_ORDER: Record<FeedMessage["kind"], number> = {
  system: 0,
  message: 1,
  decision: 2,
  delivery: 3
};

function sortMessages(messages: readonly FeedMessage[]): FeedMessage[] {
  return [...messages].sort((left, right) =>
    Date.parse(left.at) - Date.parse(right.at)
    || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
    || left.id.localeCompare(right.id));
}

/**
 * Every channel, every day, in order.
 *
 * A day a room did not meet emits exactly one system message carrying the recorded plain reason —
 * never a blank day, and never an invented sentence. A day with no record and no skip emits
 * nothing at all, because "we have no record" and "the room decided not to sit" are different
 * things and only the second one is news.
 */
export function buildMeetingFeed(input: {
  meetings: readonly PublicMeetingRecord[];
  standups: readonly PublicStandup[];
  skips: readonly PublicMeetingSkip[];
  articleSlots?: readonly PublicArticleSlotOutcome[];
  deliveries?: readonly { date: string; kind: string; text: string; ref: string }[];
}): FeedChannel[] {
  const byChannel = new Map<WorkspaceChannelId, Map<string, FeedMessage[]>>();
  for (const channel of WORKSPACE_CHANNELS) byChannel.set(channel.id, new Map());

  const push = (channel: WorkspaceChannelId, date: string, messages: readonly FeedMessage[]) => {
    const days = byChannel.get(channel);
    if (!days) return;
    days.set(date, [...(days.get(date) ?? []), ...messages]);
  };

  for (const record of input.meetings) {
    if (record.fixture) continue;
    const channel = channelForKind(record.kind);
    if (!channel || !isFeedKind(record.kind)) continue;
    push(channel, record.date, messagesForMeeting(record));
  }

  for (const standup of input.standups) {
    if (standup.fixture) continue;
    const channel = channelForKind(standup.phase);
    if (!channel) continue;
    // Up to three board blocks in one day, each its own run of messages under the same divider.
    push(channel, standup.date, messagesForMeeting(standup));
  }

  for (const skip of input.skips) {
    const channel = channelForKind(skip.phase);
    if (!channel) continue;
    push(channel, skip.date, [{
      id: `skip:${skip.date}:${skip.phase}`,
      // Midday, so a skip sorts inside its own day rather than ahead of or behind every meeting.
      at: `${skip.date}T12:00:00.000Z`,
      author: SYSTEM,
      kind: "system",
      text: publicAgentText(skip.reason)
    }]);
  }

  for (const slot of input.articleSlots ?? []) {
    const channel = channelForKind(`article-${slot.slot}`);
    if (!channel || !slot.reason) continue;
    push(channel, slot.date, [{
      id: `article:${slot.date}:${slot.slot}`,
      at: `${slot.date}T12:00:00.000Z`,
      author: SYSTEM,
      kind: "system",
      text: publicAgentText(slot.reason)
    }]);
  }

  for (const delivery of input.deliveries ?? []) {
    const channel = channelForKind(delivery.kind);
    if (!channel) continue;
    push(channel, delivery.date, [deliveryMessage({
      id: `delivery:${delivery.date}:${delivery.kind}`,
      at: `${delivery.date}T23:00:00.000Z`,
      text: delivery.text,
      ref: delivery.ref
    })]);
  }

  return WORKSPACE_CHANNELS.map((channel) => ({
    id: channel.id,
    label: channel.label,
    days: [...(byChannel.get(channel.id) ?? new Map<string, FeedMessage[]>()).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, messages]) => ({ date, messages: sortMessages(messages) }))
  }));
}

/** The channels a room's phase can reach, for a viewer that wants to link the two. */
export function channelLabel(id: WorkspaceChannelId): string {
  return WORKSPACE_CHANNELS.find((channel) => channel.id === id)?.label ?? id;
}

/** What a room is called, for a viewer that shows the phase beside the channel. */
export function roomLabel(kind: string): string {
  return publicKindLabel(kind);
}
