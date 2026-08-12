import { boundedText, hasOnlyKeys, isDateTime, isRecord } from "./door-money-recommendation-model";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_WEEK = /^\d{4}-W\d{2}$/u;
const TEMPLATE_KINDS = ["pitch-email", "video-script", "engagement-guide", "other"] as const;
const LEARNING_REF = /^(?:completion:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*|result:[a-z0-9]+(?:-[a-z0-9]+)*)$/u;

export type DoorMoneyActionStatus = "open" | "completed";
export type DoorMoneyTemplateKind = (typeof TEMPLATE_KINDS)[number];

export interface DoorMoneyPreparedTemplateView {
  id: string;
  label: string;
  kind: DoorMoneyTemplateKind;
  body: string;
}

export interface DoorMoneyActionTaskView {
  id: string;
  title: string;
  why: string;
  steps: string[];
  templates: DoorMoneyPreparedTemplateView[];
  effort: string;
  expectedImpact: string;
  status: DoorMoneyActionStatus;
  outcome: string | null;
  completedAt: string | null;
}

export interface DoorMoneyActionPacketView {
  id: string;
  date: string;
  agenda: string;
  title: string;
  summary: string;
  tasks: DoorMoneyActionTaskView[];
}

export interface DoorMoneyChannelPlaybookView {
  id: string;
  channel: string;
  title: string;
  revision: string;
  summary: string;
  steps: string[];
  updatedAt: string;
  evidenceRefs: string[];
}

export interface DoorMoneyActionsView {
  state: "missing" | "unreadable" | "present";
  packets: DoorMoneyActionPacketView[];
  playbooks: DoorMoneyChannelPlaybookView[];
  unreadable: number;
}

export interface StoredDoorMoneyActionTask {
  id: string;
  title: string;
  why: string;
  steps: string[];
  templates: DoorMoneyPreparedTemplateView[];
  effort: string;
  expectedImpact: string;
  evidenceRefs: string[];
  completion: { completedAt: string; outcome: string } | null;
}

export interface StoredDoorMoneyActionPacket {
  schemaVersion: "action-packet/1";
  id: string;
  ventureId: "door-money";
  date: string;
  weekOf: string;
  agenda: { isoWeek: string; topicId: string; title: string };
  title: string;
  summary: string;
  outcome: "ACTIONS" | "NO_ACTION";
  noActionReason: string | null;
  contextRefs: string[];
  tasks: StoredDoorMoneyActionTask[];
  generatedAt: string;
  updatedAt: string;
}

interface StoredPlaybookRevision {
  revision: number;
  sourceCycleId: string;
  summary: string;
  steps: string[];
  evidenceRefs: string[];
  updatedAt: string;
}

export interface StoredDoorMoneyPlaybook {
  schemaVersion: "door-money-playbook/1";
  id: string;
  ventureId: "door-money";
  channel: string;
  title: string;
  revisions: StoredPlaybookRevision[];
}

function slug(value: unknown, max = 160): value is string {
  return boundedText(value, max) && SLUG.test(value);
}

function date(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function boundedStrings(value: unknown, min: number, max: number, textMax: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every((entry) => boundedText(entry, textMax));
}

function evidenceRefs(value: unknown, min: number, max: number, learningOnly = false): value is string[] {
  return boundedStrings(value, min, max, 160) && new Set(value).size === value.length &&
    (!learningOnly || value.every((reference) => LEARNING_REF.test(reference)));
}

function preparedTemplate(value: unknown): DoorMoneyPreparedTemplateView | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "label", "kind", "body"]) ||
      !slug(value.id) || !boundedText(value.label, 160) || !boundedText(value.body, 4_000) ||
      typeof value.kind !== "string" || !(TEMPLATE_KINDS as readonly string[]).includes(value.kind)) return null;
  return { id: value.id, label: value.label.trim(), kind: value.kind as DoorMoneyTemplateKind, body: value.body.trim() };
}

function actionTask(value: unknown): StoredDoorMoneyActionTask | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "id", "title", "why", "steps", "templates", "effort", "expectedImpact", "evidenceRefs", "completion"
  ]) || !slug(value.id, 100) || !boundedText(value.title, 200) || !boundedText(value.why, 500) ||
      !boundedStrings(value.steps, 1, 12, 500) || !Array.isArray(value.templates) ||
      value.templates.length < 1 || value.templates.length > 8 || !boundedText(value.effort, 160) ||
      !boundedText(value.expectedImpact, 500) || !evidenceRefs(value.evidenceRefs, 0, 20)) return null;
  const templates = value.templates.map(preparedTemplate);
  if (templates.some((template) => template === null) ||
      new Set(templates.map((template) => template!.id)).size !== templates.length) return null;
  let completion: StoredDoorMoneyActionTask["completion"] = null;
  if (value.completion !== null) {
    if (!isRecord(value.completion) || !hasOnlyKeys(value.completion, ["completedAt", "outcome"]) ||
        !isDateTime(value.completion.completedAt) || !boundedText(value.completion.outcome, 1_000)) return null;
    completion = { completedAt: value.completion.completedAt, outcome: value.completion.outcome.trim() };
  }
  return {
    id: value.id,
    title: value.title.trim(),
    why: value.why.trim(),
    steps: value.steps.map((step) => step.trim()),
    templates: templates as DoorMoneyPreparedTemplateView[],
    effort: value.effort.trim(),
    expectedImpact: value.expectedImpact.trim(),
    evidenceRefs: value.evidenceRefs,
    completion
  };
}

export function parseStoredDoorMoneyActionPacket(value: unknown): StoredDoorMoneyActionPacket | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "id", "ventureId", "date", "weekOf", "agenda", "title", "summary", "outcome",
    "noActionReason", "contextRefs", "tasks", "generatedAt", "updatedAt"
  ]) || value.schemaVersion !== "action-packet/1" || value.ventureId !== "door-money" || !slug(value.id) ||
      !date(value.date) || !date(value.weekOf) ||
      !isRecord(value.agenda) || !hasOnlyKeys(value.agenda, ["isoWeek", "topicId", "title"]) ||
      typeof value.agenda.isoWeek !== "string" || !ISO_WEEK.test(value.agenda.isoWeek) || !slug(value.agenda.topicId) ||
      !boundedText(value.agenda.title, 160) || !boundedText(value.title, 200) || !boundedText(value.summary, 1_000) ||
      !evidenceRefs(value.contextRefs, 0, 100) || !Array.isArray(value.tasks) || value.tasks.length > 12 ||
      !isDateTime(value.generatedAt) || !isDateTime(value.updatedAt)) return null;
  if (value.outcome !== "ACTIONS" && value.outcome !== "NO_ACTION") return null;
  if (value.id !== `action-packet-${value.date}`) return null;
  const tasks = value.tasks.map(actionTask);
  if (tasks.some((task) => task === null) || new Set(tasks.map((task) => task!.id)).size !== tasks.length) return null;
  const noActionReason = value.noActionReason === null ? null : boundedText(value.noActionReason, 1_000) ? value.noActionReason.trim() : undefined;
  if (noActionReason === undefined || (value.outcome === "ACTIONS") !== (tasks.length > 0) ||
      (value.outcome === "ACTIONS") === (noActionReason !== null)) return null;
  const contextRefs = new Set(value.contextRefs);
  const generatedAt = value.generatedAt as string;
  const updatedAt = value.updatedAt as string;
  if (tasks.some((task) => task!.evidenceRefs.some((reference) => !contextRefs.has(reference))) ||
      Date.parse(updatedAt) < Date.parse(generatedAt)) return null;
  if (tasks.some((task) => task!.completion &&
      (Date.parse(task!.completion.completedAt) < Date.parse(generatedAt) ||
       Date.parse(task!.completion.completedAt) > Date.parse(updatedAt)))) return null;
  return {
    schemaVersion: "action-packet/1", id: value.id, ventureId: "door-money", date: value.date, weekOf: value.weekOf,
    agenda: { isoWeek: value.agenda.isoWeek, topicId: value.agenda.topicId, title: value.agenda.title.trim() },
    title: value.title.trim(), summary: value.summary.trim(), outcome: value.outcome, noActionReason,
    contextRefs: value.contextRefs, tasks: tasks as StoredDoorMoneyActionTask[], generatedAt, updatedAt
  };
}

export function projectDoorMoneyActionPacket(packet: StoredDoorMoneyActionPacket): DoorMoneyActionPacketView {
  return {
    id: packet.id,
    date: packet.date,
    agenda: `${packet.agenda.isoWeek} · ${packet.agenda.title}`,
    title: packet.title,
    summary: packet.summary,
    tasks: packet.tasks.map((task) => ({
      id: task.id, title: task.title, why: task.why, steps: task.steps, templates: task.templates,
      effort: task.effort, expectedImpact: task.expectedImpact,
      status: task.completion ? "completed" : "open",
      outcome: task.completion?.outcome ?? null,
      completedAt: task.completion?.completedAt ?? null
    }))
  };
}

export function parseStoredDoorMoneyPlaybook(value: unknown): StoredDoorMoneyPlaybook | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "id", "ventureId", "channel", "title", "revisions"]) ||
      value.schemaVersion !== "door-money-playbook/1" || value.ventureId !== "door-money" || !slug(value.id, 120) ||
      !boundedText(value.channel, 160) || !boundedText(value.title, 200) || !Array.isArray(value.revisions) ||
      value.revisions.length < 1 || value.revisions.length > 100) return null;
  const revisions: StoredPlaybookRevision[] = [];
  for (const [index, revision] of value.revisions.entries()) {
    if (!isRecord(revision) || !hasOnlyKeys(revision, ["revision", "sourceCycleId", "summary", "steps", "evidenceRefs", "updatedAt"]) ||
        revision.revision !== index + 1 || !slug(revision.sourceCycleId) || !boundedText(revision.summary, 1_000) ||
        !boundedStrings(revision.steps, 1, 24, 500) || !evidenceRefs(revision.evidenceRefs, 1, 20, true) ||
        !isDateTime(revision.updatedAt) || (index > 0 && Date.parse(revision.updatedAt) < Date.parse(revisions[index - 1]!.updatedAt))) return null;
    revisions.push({ revision: revision.revision, sourceCycleId: revision.sourceCycleId, summary: revision.summary.trim(),
      steps: revision.steps.map((step) => step.trim()), evidenceRefs: revision.evidenceRefs, updatedAt: revision.updatedAt });
  }
  if (new Set(revisions.map(({ sourceCycleId }) => sourceCycleId)).size !== revisions.length) return null;
  return { schemaVersion: "door-money-playbook/1", id: value.id, ventureId: "door-money",
    channel: value.channel.trim(), title: value.title.trim(), revisions };
}

export function projectDoorMoneyPlaybook(playbook: StoredDoorMoneyPlaybook): DoorMoneyChannelPlaybookView {
  const revision = playbook.revisions.at(-1)!;
  return { id: playbook.id, channel: playbook.channel, title: playbook.title, revision: `Revision ${revision.revision}`,
    summary: revision.summary, steps: revision.steps, updatedAt: revision.updatedAt, evidenceRefs: revision.evidenceRefs };
}
