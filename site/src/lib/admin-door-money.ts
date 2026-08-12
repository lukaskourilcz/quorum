import "server-only";
import { createHash } from "node:crypto";
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
import { parseRatingRecord, type RatingRecord } from "./rating-model";
import type { DoorMoneyActionsView } from "@/components/admin/door-money-actions-panel";

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
  contentHash: string;
  ratings: RatingRecord[];
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
  actions: DoorMoneyActionsView;
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

function projectRecommendation(
  value: DoorMoneyRecommendation,
  raw: string,
  ratings: readonly RatingRecord[]
): AdminDoorMoneyRecommendation {
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
    updatedAt: value.updatedAt,
    contentHash: `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`,
    ratings: ratings
      .filter((rating) => rating.objectKind === "recommendation" && rating.objectRef.id === value.id)
      .sort((left, right) => right.ratedAt.localeCompare(left.ratedAt) || right.id.localeCompare(left.id))
  };
}

async function readRatings(root: string): Promise<{ items: RatingRecord[]; unreadable: number }> {
  let raw: string;
  try {
    raw = await readFile(path.join(root, "state", "ratings", "door-money", "ledger.jsonl"), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { items: [], unreadable: 0 }
      : { items: [], unreadable: 1 };
  }
  const items: RatingRecord[] = [];
  let unreadable = 0;
  for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
    let parsed: RatingRecord | null = null;
    try { parsed = parseRatingRecord(JSON.parse(line) as unknown); } catch { /* Count below. */ }
    if (!parsed || parsed.ventureId !== "door-money") unreadable += 1;
    else items.push(parsed);
  }
  return { items, unreadable };
}

async function readRecommendations(root: string): Promise<AdminDoorMoneyRecommendations> {
  const directory = path.join(root, "state", "ventures", "door-money", "recommendations");
  const ratings = await readRatings(root);
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(({ name }) => name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "missing", items: [], unreadable: ratings.unreadable };
    }
    return { state: "unreadable", items: [], unreadable: ratings.unreadable + 1 };
  }

  let unreadable = ratings.unreadable;
  const items: AdminDoorMoneyRecommendation[] = [];
  for (const name of names) {
    let raw: string | null = null;
    try { raw = await readFile(path.join(directory, name), "utf8"); } catch { /* Count below. */ }
    let parsed: DoorMoneyRecommendation | null = null;
    try { parsed = raw === null ? null : parseDoorMoneyRecommendation(JSON.parse(raw) as unknown); } catch { /* Count below. */ }
    if (!parsed) unreadable += 1;
    else items.push(projectRecommendation(parsed, raw!, ratings.items));
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

async function readActions(root: string): Promise<DoorMoneyActionsView> {
  const directories = ["actions", "playbooks"];
  const results = await Promise.all(directories.map(async (directory) => {
    try {
      const entries = await readdir(path.join(root, "state", "ventures", "door-money", directory), { withFileTypes: true });
      return { state: "present" as const, count: entries.filter((entry) => entry.isFile()).length };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT"
        ? { state: "missing" as const, count: 0 }
        : { state: "unreadable" as const, count: 1 };
    }
  }));
  if (results.every(({ state }) => state === "missing")) {
    return { state: "missing", packets: [], playbooks: [], unreadable: 0 };
  }
  const unreadable = results.reduce((sum, result) =>
    sum + (result.state === "missing" ? 0 : Math.max(1, result.count)), 0);
  return { state: "unreadable", packets: [], playbooks: [], unreadable };
}

/** Load the owner-facing public derivatives and drop malformed records at their boundary. */
export async function readAdminDoorMoney(explicitRoot?: string): Promise<AdminDoorMoneySnapshot> {
  const root = rootAtCallTime(explicitRoot);
  const [recommendations, actions, knowledge] = await Promise.all([
    readRecommendations(root),
    readActions(root),
    readKnowledge(root)
  ]);
  return {
    recommendations,
    actions,
    knowledge,
    unreadable: recommendations.unreadable + actions.unreadable + knowledge.unreadable
  };
}
