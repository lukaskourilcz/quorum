const venturePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const agentPattern = /^[A-Z][A-Z0-9_]{1,31}$/;

export interface VentureControlRecord {
  lockedOn: string[];
  switchable: string[];
  disabled: string[];
}

export interface AgentControlDocument {
  schemaVersion: 1;
  ventures: Record<string, VentureControlRecord>;
}

export interface AdminAgentControl {
  id: string;
  title: string;
  mission: string;
  provider: string;
  model: string;
  estimatedCost: string;
  enabled: boolean;
  locked: boolean;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !agentPattern.test(entry))) return null;
  return value as string[];
}

export function parseAgentControlDocument(value: unknown): AgentControlDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== 1 || !document.ventures || typeof document.ventures !== "object" || Array.isArray(document.ventures)) return null;
  const ventures: Record<string, VentureControlRecord> = {};
  for (const [ventureId, raw] of Object.entries(document.ventures as Record<string, unknown>)) {
    if (!venturePattern.test(ventureId) || !raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const lockedOn = stringList(record.lockedOn);
    const switchable = stringList(record.switchable);
    const disabled = stringList(record.disabled);
    if (!lockedOn || !switchable || !disabled) return null;
    const locked = new Set(lockedOn);
    const optional = new Set(switchable);
    if (locked.size !== lockedOn.length || optional.size !== switchable.length || disabled.some((agent) => !optional.has(agent) || locked.has(agent))) return null;
    ventures[ventureId] = { lockedOn, switchable, disabled };
  }
  return { schemaVersion: 1, ventures };
}

export function validVentureId(value: string): boolean {
  return venturePattern.test(value);
}

export function validAgentId(value: string): boolean {
  return agentPattern.test(value);
}
