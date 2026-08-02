import { z } from "zod";

export const ContractAgentIdSchema = z.enum([
  "VIZE",
  "FORGE",
  "PULSE",
  "AUDIT",
  "SCOUT",
  "SCRIBE",
  "LENS",
  "QUILL",
  "RADAR",
  "KEEPER",
  "THREADS",
  "INSTAGRAM",
  "PEOPLE",
  "LEDGER",
  "HERALD",
  "STET",
  "HACEK",
  "SPARK",
  "VAULT",
  "FRAME",
  "RELAY",
  "ANGLE",
  "COHORT",
  "FUNNEL",
  "PALATE",
  "SCENE",
  "STUNT",
  "CORNER",
  "SPOTTER",
  "TAPE",
  "SIGMA",
  "VIG",
  "SONAR",
  "CANVAS",
  "JAB",
  "REACH",
  "SPLIT",
  "EASEL",
  "MOTIF",
  "PIVOT"
]);

export const DateSchema = z.iso.date();
export const DateTimeSchema = z.iso.datetime({ offset: true });
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const FingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const HttpsUrlSchema = z.string().url().regex(/^https:\/\//);
export const MeetingRefSchema = z.string().min(1).max(160);
export const EvidenceRefSchema = z.string().min(1).max(160);
export const VentureIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

export function openObject<T extends z.ZodRawShape>(shape: T) {
  return z.looseObject(shape);
}
