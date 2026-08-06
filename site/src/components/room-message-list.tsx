import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { publicAgentText, publicAgentTitle } from "@/components/agent-language";
import { describeReference } from "@/lib/reference-label";
import { RoomMessageTime } from "@/components/room-message-time";
import { resolveRoomTurnTiming } from "@/components/room-timeline";
import { Badge } from "@/components/ui/badge";
import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageContent,
  MessageHeader,
  MessageList,
  MessageMeta,
  MessageName,
  MessageRole
} from "@/components/ui/message";
import { agentById } from "@/data/agents";
import type { RoomTranscript, RoomTurnMode } from "@/data/fixtures";

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the meeting",
  statement: "sets a position",
  response: "responds",
  "reads-ledger": "checks the budget record",
  "raises-concern": "tests the case",
  veto: "records a veto",
  vote: "casts a vote",
  close: "closes the meeting"
};

/**
 * Every saved message of one meeting, with its speaker, time and source links.
 *
 * Both meeting pages read the same saved transcript shape, so they render it from here.
 * The daily-meeting replay page used to draw this list only for the test example, which
 * left every live morning, afternoon and night page showing "Read every message." above
 * nothing at all while the saved record held the full discussion.
 */
export function RoomMessageList({
  className,
  transcript
}: {
  className?: string;
  transcript: RoomTranscript;
}) {
  return (
    <MessageList className={className}>
      {transcript.turns.map((turn, index) => {
        const speaker = agentById.get(turn.agent)!;
        const listener = turn.addressedTo ? agentById.get(turn.addressedTo) : null;
        const timing = resolveRoomTurnTiming(transcript, index);
        return (
          <Message key={`${turn.agent}-${index}`}>
            <MessageAvatar>
              <AgentPortrait agent={speaker} className="size-11 rounded-full md:size-12" />
              <span className="font-mono text-[0.625rem] text-[var(--fog)]">
                #{String(index + 1).padStart(2, "0")}
              </span>
            </MessageAvatar>
            <MessageBubble
              emphasis={
                turn.agent === "AUDIT"
                  ? "control"
                  : turn.mode === "veto" || turn.mode === "vote"
                    ? "accent"
                    : "default"
              }
            >
              <MessageHeader>
                <MessageName>{publicAgentTitle(speaker)}</MessageName>
                <MessageRole>· AI role</MessageRole>
                {turn.agent === "AUDIT" ? (
                  <ShieldAlert aria-label="Safety reviewer" className="size-4 text-[var(--accent)]" />
                ) : null}
                <Badge className="ml-auto">{modeLabel[turn.mode]}</Badge>
              </MessageHeader>
              {listener ? (
                <p className="mb-2 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  To {publicAgentTitle(listener)}
                </p>
              ) : null}
              <MessageContent>{publicAgentText(turn.text)}</MessageContent>
              <MessageMeta>
                <RoomMessageTime timing={timing} />
                {turn.evidenceRefs?.map((reference) => {
                  const described = describeReference(reference);
                  if (!described) return null;
                  return described.href ? (
                    <Link
                      className="rounded-full border border-[var(--slate)] px-2 py-0.5 underline-offset-2 hover:underline"
                      href={described.href}
                      key={reference}
                    >
                      {described.label}
                    </Link>
                  ) : (
                    <span className="rounded-full border border-[var(--slate)] px-2 py-0.5" key={reference}>
                      {described.label}
                    </span>
                  );
                })}
              </MessageMeta>
            </MessageBubble>
          </Message>
        );
      })}
    </MessageList>
  );
}
