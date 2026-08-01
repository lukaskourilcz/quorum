"use client";

import { Check, Copy, Gauge, Users } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { AgentPortrait } from "@/components/agent-portrait";
import {
  publicAgentCheck,
  publicAgentMandate,
  publicAgentText,
  publicAgentTitle
} from "@/components/agent-language";
import {
  buildCouncilSetupUrl,
  getRecordedRelationships,
  parseCouncilSetup,
  type CouncilRoomPreview
} from "@/components/council-simulator-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePreservePageScroll } from "@/components/use-preserve-page-scroll";
import type { Agent, AgentId } from "@/data/agents";
import type { RoomTranscript } from "@/data/fixtures";
import { cn } from "@/lib/utils";

export interface OperatingNeed {
  id: string;
  label: string;
  value: number | null;
  max: number;
  valueLabel: string;
  state: "blocked" | "ready" | "unknown";
  detail: string;
}

const roleLabels = {
  owner: "Lead",
  reviewer: "Reviewer",
  preset: "Always joins",
  control: "Safety check"
} as const;

const needTone = {
  blocked: "warning",
  ready: "success",
  unknown: "neutral"
} as const;

const needStateLabel = {
  blocked: "Blocked",
  ready: "Ready",
  unknown: "Not confirmed"
} as const;

function getAgent(agents: readonly Agent[], id: AgentId) {
  return agents.find((agent) => agent.id === id);
}

export function CouncilSimulator({
  agents,
  operatingNeeds,
  previews,
  replayHref,
  transcript
}: {
  agents: readonly Agent[];
  operatingNeeds: readonly OperatingNeed[];
  previews: readonly CouncilRoomPreview[];
  replayHref: string;
  transcript: RoomTranscript;
}) {
  const firstScenario = previews[0]!;
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    firstScenario.id
  );
  const [selectedSeatId, setSelectedSeatId] = useState<AgentId>(
    firstScenario.owner
  );
  const [urlReady, setUrlReady] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const preservePageScroll = usePreservePageScroll();

  const selectedScenario =
    previews.find((scenario) => scenario.id === selectedScenarioId) ??
    firstScenario;
  const selectedSeat =
    getAgent(agents, selectedSeatId) ??
    getAgent(agents, selectedScenario.owner) ??
    agents[0]!;
  const relationshipRecord = useMemo(
    () => getRecordedRelationships(transcript, selectedSeat.id),
    [selectedSeat.id, transcript]
  );

  const selectScenario = useCallback(
    (scenarioId: CouncilRoomPreview["id"]) => {
      const scenario = previews.find((item) => item.id === scenarioId);
      if (!scenario) return;
      setSelectedScenarioId(scenario.id);
      setSelectedSeatId(scenario.owner);
      setActionStatus(
        `${scenario.label} preview uses ${scenario.participants.length} roles.`
      );
    },
    [previews]
  );

  const selectSeat = useCallback((agentId: AgentId) => {
    setSelectedSeatId(agentId);
    setActionStatus(`${agentId} role selected.`);
  }, []);

  const copySetup = useCallback(async () => {
    const url = buildCouncilSetupUrl(window.location.href, {
      scenarioId: selectedScenario.id,
      seatId: selectedSeat.id
    });
    try {
      await navigator.clipboard.writeText(url);
      setActionStatus(`${selectedScenario.label} meeting link copied.`);
    } catch {
      setActionStatus("Copying is unavailable in this browser.");
    }
  }, [selectedScenario.id, selectedScenario.label, selectedSeat.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const setup = parseCouncilSetup(window.location.search, previews);
      if (setup) {
        setSelectedScenarioId(setup.scenarioId);
        setSelectedSeatId(setup.seatId);
      }
      setUrlReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previews]);

  useEffect(() => {
    if (!urlReady) return;
    window.history.replaceState(
      null,
      "",
      buildCouncilSetupUrl(window.location.href, {
        scenarioId: selectedScenario.id,
        seatId: selectedSeat.id
      })
    );
  }, [selectedScenario.id, selectedSeat.id, urlReady]);

  return (
    <section
      aria-labelledby="council-simulator-title"
      className="border-y border-[var(--border)] bg-[var(--surface)]"
      id="council-simulator"
      onClickCapture={preservePageScroll}
    >
      <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.58fr)] lg:items-end">
          <div>
            <p className="mono-label text-[var(--accent)]">
              Try a meeting setup
            </p>
            <h2
              className="mt-5 max-w-3xl text-[2.5rem] font-semibold leading-none tracking-[-0.055em]"
              id="council-simulator-title"
            >
              Choose a topic. See who joins.
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--fog)]">
              Pick a type of decision. The preview shows the smallest team that
              can handle it, why each role joins and which roles are not needed.
            </p>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="flex items-start gap-3">
              <Gauge
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[var(--accent)]"
              />
              <div>
                <p className="text-sm font-semibold">Preview only</p>
                <p className="mt-1.5 text-sm leading-6 text-[var(--fog)]">
                  Nothing runs and no task is sent. This preview cannot change
                  an AI role or a company decision.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                  Meeting setup
                </p>
                <p className="mt-2 text-sm text-[var(--fog)]">
                  Choose a topic. Roles required for that meeting stay included.
                </p>
              </div>
              <Button onClick={copySetup} type="button" variant="secondary">
                {actionStatus.endsWith("link copied.") ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
                Copy setup
              </Button>
            </div>
            <div
              aria-label="Meeting topics"
              className="mt-5 flex gap-2 overflow-x-auto pb-2"
              role="group"
            >
              {previews.map((scenario) => (
                <Button
                  aria-pressed={scenario.id === selectedScenario.id}
                  className="shrink-0"
                  key={scenario.id}
                  onClick={() => selectScenario(scenario.id)}
                  type="button"
                  variant={
                    scenario.id === selectedScenario.id
                      ? "accent"
                      : "secondary"
                  }
                >
                  {scenario.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
            <div className="border-b border-[var(--border)] p-5 md:p-7 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{selectedScenario.topicLabel}</Badge>
                {selectedScenario.riskTags.map((tag) => (
                  <Badge key={tag} tone="warning">
                    {tag.replaceAll("_", " ")}
                  </Badge>
                ))}
              </div>
              <h3 className="mt-6 text-3xl font-semibold tracking-[-0.045em]">
                {selectedScenario.label}
              </h3>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--fog)]">
                {selectedScenario.objective}
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  ["Joining", `${selectedScenario.participants.length} roles`],
                  ["Message limit", `${selectedScenario.caps.maxTurns} messages`],
                  ["Time limit", `${selectedScenario.caps.ttlMinutes} min`]
                ].map(([label, value]) => (
                  <div
                    className="rounded-[0.875rem] border border-[var(--border)] bg-[var(--surface)] p-4"
                    key={label}
                  >
                    <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between gap-4">
                <h4 className="text-lg font-semibold">Who joins</h4>
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  {selectedScenario.standby.length} not needed
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {selectedScenario.participants.map((participant) => {
                  const agent = getAgent(agents, participant.agent);
                  if (!agent) return null;
                  const isSelected = participant.agent === selectedSeat.id;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={cn(
                        "min-h-20 rounded-[0.875rem] border p-4 text-left transition-colors",
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--secondary)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--ash)] hover:bg-[var(--surface-raised)]"
                      )}
                      key={participant.agent}
                      onClick={() => selectSeat(participant.agent)}
                      type="button"
                    >
                      <span className="flex items-start gap-3">
                        <AgentPortrait
                          agent={agent}
                          className="size-11 shrink-0 rounded-lg"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {publicAgentTitle(agent)}
                            </span>
                            {participant.roles.map((role) => (
                              <span
                                className="font-mono text-[0.59375rem] uppercase tracking-[0.1em] text-[var(--fog)]"
                                key={role}
                              >
                                {roleLabels[role]}
                              </span>
                            ))}
                          </span>
                          <span className="mt-1.5 block text-xs leading-5 text-[var(--fog)]">
                            {participant.reasons.join(" ")}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <details className="mt-5 rounded-[0.875rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
                  Show roles not needed
                </summary>
                <p className="pb-2 text-sm leading-6 text-[var(--fog)]">
                  {selectedScenario.standby.map((agentId) => {
                    const agent = getAgent(agents, agentId);
                    return agent ? publicAgentTitle(agent) : "AI role";
                  }).join(" · ")}
                </p>
              </details>
            </div>

            <aside className="p-5 md:p-7" aria-label="Selected AI role">
              <div className="flex items-start gap-4">
                <AgentPortrait
                  agent={selectedSeat}
                  className="size-16 shrink-0 rounded-[0.875rem]"
                />
                <div>
                  <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
                    Role details
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    {publicAgentTitle(selectedSeat)}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--fog)]">
                    AI role
                  </p>
                </div>
              </div>

              <dl className="mt-7 space-y-5">
                {[
                  ["Main job", publicAgentMandate(selectedSeat)],
                  ["Working rule", publicAgentText(selectedSeat.operatingPrinciple)],
                  ["Expected result", publicAgentText(selectedSeat.output)],
                  [
                    "How success is checked",
                    publicAgentCheck(selectedSeat.primaryAccountability)
                  ]
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="mono-label text-[0.625rem] text-[var(--fog)]">
                      {label}
                    </dt>
                    <dd className="mt-2 text-sm leading-6">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-7">
                <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                  Skills
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedSeat.capabilityTags.map((capability) => (
                    <Badge key={capability}>
                      {capability.replaceAll("_", " ")}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="my-7 h-px bg-[var(--border)]" />

              <div className="flex items-center gap-2">
                <Users
                  aria-hidden="true"
                  className="size-4 text-[var(--accent)]"
                />
                <h4 className="font-semibold">Who this role spoke with</h4>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--fog)]">
                {relationshipRecord.speakingTurns} messages in the first test
                meeting. The counts below include only messages addressed to a
                named role.
              </p>
              {relationshipRecord.relationships.length ? (
                <div className="mt-4 space-y-3">
                  {relationshipRecord.relationships.map((relationship) => {
                    const counterpart = getAgent(agents, relationship.counterpart);
                    const counterpartTitle = counterpart ? publicAgentTitle(counterpart) : "AI role";
                    return <div
                      className="rounded-[0.875rem] border border-[var(--border)] bg-[var(--surface)] p-4"
                      key={relationship.counterpart}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">
                          {counterpartTitle}
                        </span>
                        <span className="font-mono text-[0.65625rem] text-[var(--fog)]">
                          {relationship.directExchanges} messages
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--fog)]">
                        {relationship.outgoing} addressed by{" "}
                        {publicAgentTitle(selectedSeat)} · {relationship.incoming} addressed to{" "}
                        {publicAgentTitle(selectedSeat)}
                      </p>
                    </div>;
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-[0.875rem] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--fog)]">
                  This role did not speak directly to another named role in the
                  saved test meeting.
                </p>
              )}
            </aside>
          </div>
        </div>

        <div className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mono-label text-[var(--accent)]">Current checks</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                What the team needs before it can act
              </h3>
            </div>
            <Link
              className="text-sm font-semibold underline decoration-[var(--accent)] decoration-2 underline-offset-4"
              href={replayHref}
            >
              See the recorded decision
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {operatingNeeds.map((need) => (
              <div
                className="rounded-[1rem] border border-[var(--border)] bg-[var(--card)] p-5"
                key={need.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{need.label}</p>
                  <Badge tone={needTone[need.state]}>
                    {needStateLabel[need.state]}
                  </Badge>
                </div>
                <p className="mt-6 text-2xl font-semibold tracking-[-0.04em]">
                  {need.valueLabel}
                </p>
                {need.value === null ? (
                  <div
                    aria-label={`${need.label}: not measured`}
                    className="mt-4 h-1.5 rounded-[var(--radius-pill)] border border-[var(--steel)]"
                    role="status"
                  />
                ) : (
                  <Progress
                    className="mt-4"
                    max={need.max}
                    value={need.value}
                  />
                )}
                <p className="mt-4 text-xs leading-5 text-[var(--fog)]">
                  {need.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p aria-live="polite" className="sr-only" role="status">
          {actionStatus}
        </p>
      </div>
    </section>
  );
}
