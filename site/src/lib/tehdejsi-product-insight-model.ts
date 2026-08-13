export type TehdejsiProductInsightStatus = "proposed" | "accepted" | "rejected" | "done";
export interface TehdejsiProductInsight {
  schemaVersion: "ts-product-insight/1";
  id: string;
  ventureId: "tehdejsi-svet";
  title: string;
  finding: string;
  evidence: Array<{ filePath: string; detail: string }>;
  proposedAction: string;
  status: TehdejsiProductInsightStatus;
  ownerNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const statuses: readonly TehdejsiProductInsightStatus[] = ["proposed", "accepted", "rejected", "done"];
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function parseTehdejsiProductInsight(value: unknown): TehdejsiProductInsight | null {
  const insight = object(value);
  if (!insight || !exact(insight, ["schemaVersion", "id", "ventureId", "title", "finding", "evidence", "proposedAction", "status", "ownerNote", "createdAt", "updatedAt"]) ||
      insight.schemaVersion !== "ts-product-insight/1" || insight.ventureId !== "tehdejsi-svet" || typeof insight.id !== "string" ||
      !/^ts-insight-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(insight.id) || insight.id.length > 120 || !text(insight.title, 160) ||
      !text(insight.finding, 1_000) || !text(insight.proposedAction, 1_000) || !statuses.includes(insight.status as TehdejsiProductInsightStatus) ||
      (insight.ownerNote !== null && !text(insight.ownerNote, 500)) || typeof insight.createdAt !== "string" || typeof insight.updatedAt !== "string" ||
      !INSTANT.test(insight.createdAt) || !INSTANT.test(insight.updatedAt) || Number.isNaN(Date.parse(insight.createdAt)) ||
      Number.isNaN(Date.parse(insight.updatedAt)) || Date.parse(insight.updatedAt) < Date.parse(insight.createdAt) ||
      !Array.isArray(insight.evidence) || insight.evidence.length < 1 || insight.evidence.length > 8) return null;
  const evidence: TehdejsiProductInsight["evidence"] = [];
  for (const raw of insight.evidence) {
    const item = object(raw);
    if (!item || !exact(item, ["filePath", "detail"]) || typeof item.filePath !== "string" ||
        !/^src\/[a-zA-Z0-9._/-]+$/u.test(item.filePath) || item.filePath.includes("..") || item.filePath.length > 240 ||
        !text(item.detail, 500)) return null;
    evidence.push({ filePath: item.filePath, detail: item.detail.trim() });
  }
  if (new Set(evidence.map(({ filePath }) => filePath)).size !== evidence.length) return null;
  return {
    schemaVersion: "ts-product-insight/1", id: insight.id, ventureId: "tehdejsi-svet", title: insight.title.trim(),
    finding: insight.finding.trim(), evidence, proposedAction: insight.proposedAction.trim(),
    status: insight.status as TehdejsiProductInsightStatus, ownerNote: insight.ownerNote === null ? null : insight.ownerNote.trim(),
    createdAt: insight.createdAt, updatedAt: insight.updatedAt
  };
}

export function parseTehdejsiProductInsightAction(value: unknown): { id: string; status: TehdejsiProductInsightStatus; ownerNote: string | null } | null {
  const action = object(value);
  if (!action || !exact(action, ["id", "status", "ownerNote"]) || typeof action.id !== "string" ||
      !/^ts-insight-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(action.id) || action.id.length > 120 ||
      !statuses.includes(action.status as TehdejsiProductInsightStatus) || (action.ownerNote !== null && !text(action.ownerNote, 500))) return null;
  return { id: action.id, status: action.status as TehdejsiProductInsightStatus, ownerNote: action.ownerNote === null ? null : action.ownerNote.trim() };
}
