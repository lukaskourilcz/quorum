import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseDoorMoneyKnowledgeIndex,
  parseDoorMoneyStyleProfile,
  type AdminDoorMoneyKnowledgeIndex,
  type AdminDoorMoneyStyleProfile
} from "./door-money-knowledge-model";
import {
  hasOnlyKeys,
  isDateTime,
  isRecord,
  parseDoorMoneyRecommendation,
  type DoorMoneyCopyBlock,
  type DoorMoneyRecommendation,
  type DoorMoneyRecommendationFormat,
  type DoorMoneyRecommendationStatus
} from "./door-money-recommendation-model";

export type AdminDoorMoneyArtifactState = "missing" | "unreadable" | "present";

export interface AdminDoorMoneyRecommendation {
  id: string;
  date: string;
  status: DoorMoneyRecommendationStatus;
  hook: string;
  formats: DoorMoneyRecommendationFormat[];
  platforms: string[];
  copyBlocks: DoorMoneyCopyBlock[];
  rationale: string;
  curiosityBridge: string;
  cta: DoorMoneyRecommendation["cta"];
  evidence: {
    manuscriptHash: string;
    chunkIds: string[];
    excerptChunkId: string;
    excerpt: string;
    privateStoreLink: string;
  };
  gateResults: DoorMoneyRecommendation["gateResults"];
  designLab: { eligible: boolean; readyAt: string | null };
  owner: Omit<DoorMoneyRecommendation["owner"], "ratingRef">;
  statusHistory: DoorMoneyRecommendation["statusHistory"];
  generatedAt: string;
  updatedAt: string;
}

export interface AdminDoorMoneyRecommendations {
  state: AdminDoorMoneyArtifactState;
  items: AdminDoorMoneyRecommendation[];
  unreadable: number;
}

export interface AdminDoorMoneyKnowledge {
  state: AdminDoorMoneyArtifactState;
  index: AdminDoorMoneyKnowledgeIndex | null;
  styleProfile: AdminDoorMoneyStyleProfile | null;
  unreadable: number;
}

export interface AdminDoorMoneySnapshot {
  recommendations: AdminDoorMoneyRecommendations;
  knowledge: AdminDoorMoneyKnowledge;
  unreadable: number;
}

interface CurrentKnowledge {
  manuscriptHash: string;
  bookKbIndexPath: string;
  styleProfilePath: string;
}

type JsonRead = { state: "missing" } | { state: "unreadable" } | { state: "present"; value: unknown };

function rootAtCallTime(explicitRoot?: string): string {
  return explicitRoot ?? process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

async function readJson(absolutePath: string): Promise<JsonRead> {
  try {
    return { state: "present", value: JSON.parse(await readFile(absolutePath, "utf8")) as unknown };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { state: "missing" } : { state: "unreadable" };
  }
}

function projectRecommendation(value: DoorMoneyRecommendation): AdminDoorMoneyRecommendation {
  const { ratingRef: ignoredRatingRef, ...owner } = value.owner;
  void ignoredRatingRef;
  return {
    id: value.id,
    date: value.date,
    status: value.status,
    hook: value.hook,
    formats: value.formats,
    platforms: value.platforms,
    copyBlocks: value.copyBlocks,
    rationale: value.rationale,
    curiosityBridge: value.curiosityBridge,
    cta: value.cta,
    evidence: {
      manuscriptHash: value.evidence.manuscriptHash,
      chunkIds: value.evidence.chunkIds,
      excerptChunkId: value.evidence.excerptChunkId,
      excerpt: value.evidence.excerpt,
      privateStoreLink: value.evidence.privateStoreLink
    },
    gateResults: value.gateResults,
    designLab: { eligible: value.designLab.eligible, readyAt: value.designLab.readyAt },
    owner,
    statusHistory: value.statusHistory,
    generatedAt: value.generatedAt,
    updatedAt: value.updatedAt
  };
}

async function readRecommendations(root: string): Promise<AdminDoorMoneyRecommendations> {
  const directory = path.join(root, "state", "ventures", "door-money", "recommendations");
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(({ name }) => name)
      .sort();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", items: [], unreadable: 0 }
      : { state: "unreadable", items: [], unreadable: 1 };
  }

  let unreadable = 0;
  const items: AdminDoorMoneyRecommendation[] = [];
  for (const name of names) {
    const result = await readJson(path.join(directory, name));
    const parsed = result.state === "present" ? parseDoorMoneyRecommendation(result.value) : null;
    if (!parsed) unreadable += 1;
    else items.push(projectRecommendation(parsed));
  }
  items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
  return {
    state: items.length === 0 && unreadable > 0 ? "unreadable" : "present",
    items,
    unreadable
  };
}

function parseCurrentKnowledge(value: unknown): CurrentKnowledge | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "manuscriptHash", "bookKbIndexPath", "styleProfilePath", "generatedAt"
  ]) || value.schemaVersion !== "door-money-knowledge-current/1" ||
      typeof value.manuscriptHash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value.manuscriptHash) ||
      typeof value.bookKbIndexPath !== "string" || typeof value.styleProfilePath !== "string" ||
      !isDateTime(value.generatedAt)) return null;
  const version = value.manuscriptHash.slice("sha256:".length);
  const prefix = `state/ventures/door-money/knowledge/versions/${version}`;
  if (value.bookKbIndexPath !== `${prefix}/book-kb-index.json` ||
      value.styleProfilePath !== `${prefix}/style-profile.json`) return null;
  return {
    manuscriptHash: value.manuscriptHash,
    bookKbIndexPath: value.bookKbIndexPath,
    styleProfilePath: value.styleProfilePath
  };
}

async function readKnowledge(root: string): Promise<AdminDoorMoneyKnowledge> {
  const currentResult = await readJson(path.join(root, "state", "ventures", "door-money", "knowledge", "current.json"));
  if (currentResult.state === "missing") return { state: "missing", index: null, styleProfile: null, unreadable: 0 };
  const current = currentResult.state === "present" ? parseCurrentKnowledge(currentResult.value) : null;
  if (!current) return { state: "unreadable", index: null, styleProfile: null, unreadable: 1 };

  const [indexResult, styleResult] = await Promise.all([
    readJson(path.join(root, current.bookKbIndexPath)),
    readJson(path.join(root, current.styleProfilePath))
  ]);
  const index = indexResult.state === "present" ? parseDoorMoneyKnowledgeIndex(indexResult.value) : null;
  const styleProfile = styleResult.state === "present" ? parseDoorMoneyStyleProfile(styleResult.value) : null;
  const indexReadable = index?.manuscriptHash === current.manuscriptHash;
  const styleReadable = styleProfile?.manuscriptHash === current.manuscriptHash;
  const unreadable = Number(!indexReadable) + Number(!styleReadable);
  if (unreadable > 0) return { state: "unreadable", index: null, styleProfile: null, unreadable };
  return { state: "present", index: index!, styleProfile: styleProfile!, unreadable: 0 };
}

/** Load the owner-facing public derivatives and drop malformed records at their boundary. */
export async function readAdminDoorMoney(explicitRoot?: string): Promise<AdminDoorMoneySnapshot> {
  const root = rootAtCallTime(explicitRoot);
  const [recommendations, knowledge] = await Promise.all([
    readRecommendations(root),
    readKnowledge(root)
  ]);
  return { recommendations, knowledge, unreadable: recommendations.unreadable + knowledge.unreadable };
}
