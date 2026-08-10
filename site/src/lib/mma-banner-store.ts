import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const contractPath = "state/ventures/mma-files/banners/contract.json";
const manifestPath = "state/ventures/mma-files/banners/payload/data/boardless/ads.json";
const payloadPrefix = "state/ventures/mma-files/banners/payload/";
const tokenEnvironment = "BOARDLESSAI_GITHUB_TOKEN";

interface Size { width: number; height: number }
interface SlotDefinition {
  id: string;
  desktop: Size & { variants: Size[] };
  mobile: Size | null;
}
interface SlotValue {
  enabled: boolean;
  image: ({ src: string } & Size) | null;
  alt: string;
  href: string | null;
}
interface StagedManifest {
  schemaVersion: "mma-ads/1";
  updatedAt: string;
  slots: Record<string, SlotValue>;
}

export interface BannerStageResult {
  contractPath: string;
  payloadHash: string;
  preparedAt: string;
  commit: string | null;
}

export class MmaBannerStoreError extends Error {
  constructor(readonly code: "INVALID" | "UNCONFIGURED" | "REFUSED" | "REMOTE" | "CONFLICT", message: string) {
    super(message);
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function payloadHash(files: ReadonlyArray<{ path: string; sha256: string }>): string {
  return sha256([...files].sort((left, right) => left.path.localeCompare(right.path)).map((file) => `${file.path}:${file.sha256}`).join("\n"));
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseSize(value: unknown): Size | null {
  const item = object(value);
  return typeof item?.width === "number" && Number.isInteger(item.width) && item.width > 0
    && typeof item.height === "number" && Number.isInteger(item.height) && item.height > 0
    ? { width: item.width, height: item.height }
    : null;
}

async function definitions(root: string): Promise<SlotDefinition[]> {
  const raw = JSON.parse(await readFile(path.join(root, "config", "mma-ad-slots.json"), "utf8")) as unknown;
  const specification = object(raw);
  if (specification?.schemaVersion !== "mma-ad-slots/1" || !Array.isArray(specification.slots)) {
    throw new MmaBannerStoreError("INVALID", "The shared MMA banner slot specification is malformed.");
  }
  const parsed = specification.slots.flatMap((value): SlotDefinition[] => {
    const slot = object(value);
    const id = typeof slot?.id === "string" && /^[a-z0-9-]+$/u.test(slot.id) ? slot.id : null;
    const desktop = parseSize(slot?.desktop);
    const desktopObject = object(slot?.desktop);
    const variants = Array.isArray(desktopObject?.variants) ? desktopObject.variants.map(parseSize) : [];
    const mobile = slot?.mobile === null ? null : parseSize(slot?.mobile);
    return id && desktop && variants.every((size): size is Size => size !== null)
      ? [{ id, desktop: { ...desktop, variants }, mobile }]
      : [];
  });
  if (parsed.length !== 6 || new Set(parsed.map((slot) => slot.id)).size !== parsed.length) {
    throw new MmaBannerStoreError("INVALID", "The shared MMA banner slot list must contain six unique slots.");
  }
  return parsed;
}

function parseManifest(value: unknown, slots: SlotDefinition[]): StagedManifest {
  const manifest = object(value);
  const values = object(manifest?.slots);
  if (manifest?.schemaVersion !== "mma-ads/1" || typeof manifest.updatedAt !== "string" || Number.isNaN(Date.parse(manifest.updatedAt)) || !values) {
    throw new MmaBannerStoreError("INVALID", "The staged MMA banner manifest is malformed.");
  }
  if (Object.keys(values).sort().join("\n") !== slots.map((slot) => slot.id).sort().join("\n")) {
    throw new MmaBannerStoreError("INVALID", "The staged MMA banner manifest must preserve all six slots.");
  }
  const parsed: StagedManifest["slots"] = {};
  for (const definition of slots) {
    const raw = object(values[definition.id]);
    const image = raw?.image === null ? null : object(raw?.image);
    const size = image ? parseSize(image) : null;
    const src = image && typeof image.src === "string" ? image.src : null;
    const href = raw?.href === null ? null : typeof raw?.href === "string" ? raw.href : undefined;
    if (!raw || typeof raw.enabled !== "boolean" || typeof raw.alt !== "string" || href === undefined) {
      throw new MmaBannerStoreError("INVALID", `The staged value for ${definition.id} is malformed.`);
    }
    if (href !== null) {
      try { if (new URL(href).protocol !== "https:") throw new Error(); }
      catch { throw new MmaBannerStoreError("INVALID", `The link for ${definition.id} must use HTTPS.`); }
    }
    if (image && (!size || src !== `/ads/${definition.id}-${size.width}x${size.height}.webp`)) {
      throw new MmaBannerStoreError("INVALID", `The staged image path for ${definition.id} is not canonical.`);
    }
    if (raw.enabled && !image) throw new MmaBannerStoreError("INVALID", `${definition.id} cannot be enabled without a creative.`);
    parsed[definition.id] = { enabled: raw.enabled, image: image && size && src ? { src, ...size } : null, alt: raw.alt, href };
  }
  return { schemaVersion: "mma-ads/1", updatedAt: manifest.updatedAt, slots: parsed };
}

function allowedSizes(slot: SlotDefinition): Size[] {
  return [slot.desktop, ...slot.desktop.variants, ...(slot.mobile ? [slot.mobile] : [])];
}

function githubContext() {
  return {
    token: process.env[tokenEnvironment],
    repository: process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum",
    branch: process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main"
  };
}

function githubHeaders(token: string): Record<string, string> {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" };
}

function githubFailure(status: number, action: string): MmaBannerStoreError {
  if (status === 401 || status === 403) return new MmaBannerStoreError("REFUSED", `GitHub refused the banner ${action} with ${status}; check ${tokenEnvironment} permissions.`);
  return new MmaBannerStoreError("REMOTE", `GitHub banner ${action} failed with ${status}.`);
}

async function readPayload(relative: string, root: string): Promise<Buffer> {
  const context = githubContext();
  if (!context.token || (!process.env.VERCEL && process.env.NODE_ENV !== "production")) return readFile(path.join(root, relative));
  const endpoint = `https://api.github.com/repos/${context.repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(context.branch)}`;
  const response = await fetch(endpoint, { headers: githubHeaders(context.token), cache: "no-store" });
  if (!response.ok) throw githubFailure(response.status, "read");
  const body = await response.json() as { content?: unknown; encoding?: unknown };
  if (body.encoding !== "base64" || typeof body.content !== "string") throw new MmaBannerStoreError("REMOTE", "GitHub returned an invalid banner file.");
  return Buffer.from(body.content.replaceAll("\n", ""), "base64");
}

async function writeLocal(files: Map<string, Buffer>, root: string): Promise<string | null> {
  // Payload first and contract last: a failed local write can leave unreferenced bytes, never a
  // contract that vouches for bytes which have not landed.
  const ordered = [...files.entries()].sort(([left], [right]) => (left === contractPath ? 1 : right === contractPath ? -1 : left.localeCompare(right)));
  for (const [relative, bytes] of ordered) {
    const target = path.resolve(root, relative);
    const boundary = path.relative(root, target);
    if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new MmaBannerStoreError("CONFLICT", "Banner path escaped the repository.");
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
  }
  return null;
}

async function writeGitTree(files: Map<string, Buffer>, message: string, token: string): Promise<string> {
  const { repository, branch } = githubContext();
  const base = `https://api.github.com/repos/${repository}`;
  const headers = githubHeaders(token);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const refResponse = await fetch(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (!refResponse.ok) throw githubFailure(refResponse.status, "branch read");
    const ref = await refResponse.json() as { object?: { sha?: unknown } };
    const parent = typeof ref.object?.sha === "string" ? ref.object.sha : null;
    if (!parent) throw new MmaBannerStoreError("REMOTE", "GitHub returned an invalid banner branch reference.");
    const commitResponse = await fetch(`${base}/git/commits/${parent}`, { headers, cache: "no-store" });
    if (!commitResponse.ok) throw githubFailure(commitResponse.status, "commit read");
    const baseCommit = await commitResponse.json() as { tree?: { sha?: unknown } };
    const baseTree = typeof baseCommit.tree?.sha === "string" ? baseCommit.tree.sha : null;
    if (!baseTree) throw new MmaBannerStoreError("REMOTE", "GitHub returned an invalid banner base tree.");
    const entries = [];
    for (const [relative, bytes] of files) {
      const blobResponse = await fetch(`${base}/git/blobs`, { method: "POST", headers, body: JSON.stringify({ content: bytes.toString("base64"), encoding: "base64" }) });
      if (!blobResponse.ok) throw githubFailure(blobResponse.status, "blob write");
      const blob = await blobResponse.json() as { sha?: unknown };
      if (typeof blob.sha !== "string") throw new MmaBannerStoreError("REMOTE", "GitHub returned an invalid banner blob.");
      entries.push({ path: relative, mode: "100644", type: "blob", sha: blob.sha });
    }
    const treeResponse = await fetch(`${base}/git/trees`, { method: "POST", headers, body: JSON.stringify({ base_tree: baseTree, tree: entries }) });
    if (!treeResponse.ok) throw githubFailure(treeResponse.status, "tree write");
    const tree = await treeResponse.json() as { sha?: unknown };
    if (typeof tree.sha !== "string") throw new MmaBannerStoreError("REMOTE", "GitHub returned an invalid banner tree.");
    const newCommitResponse = await fetch(`${base}/git/commits`, { method: "POST", headers, body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) });
    if (!newCommitResponse.ok) throw githubFailure(newCommitResponse.status, "commit write");
    const newCommit = await newCommitResponse.json() as { sha?: unknown };
    if (typeof newCommit.sha !== "string") throw new MmaBannerStoreError("REMOTE", "GitHub returned an invalid banner commit.");
    const update = await fetch(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", headers, body: JSON.stringify({ sha: newCommit.sha, force: false }) });
    if (update.ok) return newCommit.sha.slice(0, 7);
    if (update.status !== 409 && update.status !== 422) throw githubFailure(update.status, "branch update");
  }
  throw new MmaBannerStoreError("CONFLICT", "Banner state changed during every save attempt.");
}

async function persist(files: Map<string, Buffer>, message: string, root: string): Promise<string | null> {
  const context = githubContext();
  if (context.token) return writeGitTree(files, message, context.token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new MmaBannerStoreError("UNCONFIGURED", `${tokenEnvironment} is not set, so banner state cannot be committed.`);
  }
  return writeLocal(files, root);
}

async function stageManifest(manifest: StagedManifest, newAssets: Map<string, Buffer>, now: Date, root: string): Promise<BannerStageResult> {
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const assets = new Map<string, Buffer>();
  for (const slot of Object.values(manifest.slots)) {
    if (!slot.image) continue;
    const targetPath = `public${slot.image.src}`;
    const statePath = `${payloadPrefix}${targetPath}`;
    assets.set(targetPath, newAssets.get(targetPath) ?? await readPayload(statePath, root));
  }
  const contractFiles = [
    { path: "data/boardless/ads.json", bytes: manifestBytes },
    ...[...assets.entries()].map(([targetPath, bytes]) => ({ path: targetPath, bytes }))
  ].sort((left, right) => left.path.localeCompare(right.path));
  const files = contractFiles.map((file) => ({ path: file.path, sha256: sha256(file.bytes), bytes: file.bytes.byteLength }));
  const preparedAt = now.toISOString();
  const aggregate = payloadHash(files);
  const contract = {
    schemaVersion: "mma-files-banner/1",
    targetRepo: "lukaskourilcz/mma-files",
    files,
    payloadHash: aggregate,
    preparedAt,
    status: "staged",
    receiptRef: null
  };
  const writes = new Map<string, Buffer>([
    [manifestPath, manifestBytes],
    ...[...assets.entries()].map(([targetPath, bytes]) => [`${payloadPrefix}${targetPath}`, bytes] as const),
    [contractPath, Buffer.from(`${JSON.stringify(contract, null, 2)}\n`)]
  ]);
  const commit = await persist(writes, "admin: stage MMA Files banners", root);
  return { contractPath, payloadHash: aggregate, preparedAt, commit };
}

async function current(root: string): Promise<{ manifest: StagedManifest; definitions: SlotDefinition[] }> {
  const slots = await definitions(root);
  const manifest = parseManifest(JSON.parse((await readPayload(manifestPath, root)).toString("utf8")), slots);
  return { manifest, definitions: slots };
}

export async function stageMmaBannerCreative(input: {
  slotId: string;
  width: number;
  height: number;
  source: Uint8Array;
  alt: string;
  href: string | null;
  enabled: boolean;
  now?: Date;
}, root = repositoryRoot): Promise<BannerStageResult> {
  const state = await current(root);
  const slot = state.definitions.find((candidate) => candidate.id === input.slotId);
  if (!slot) throw new MmaBannerStoreError("INVALID", "Choose one of the six MMA Files banner slots.");
  if (!allowedSizes(slot).some((size) => size.width === input.width && size.height === input.height)) {
    throw new MmaBannerStoreError("INVALID", "The requested banner size does not belong to that slot.");
  }
  const alt = input.alt.trim();
  if (!alt || alt.length > 300) throw new MmaBannerStoreError("INVALID", "Banner alt text must contain 1–300 characters.");
  const href = input.href?.trim() || null;
  if (href) {
    try { if (new URL(href).protocol !== "https:") throw new Error(); }
    catch { throw new MmaBannerStoreError("INVALID", "Banner links must use HTTPS."); }
  }
  if (!input.source.byteLength || input.source.byteLength > 15_000_000) throw new MmaBannerStoreError("INVALID", "Banner upload must be between 1 byte and 15 MB.");
  let creative: Buffer;
  try {
    creative = await sharp(input.source, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(input.width, input.height, { fit: "cover", position: "centre" })
      .webp({ quality: 88, smartSubsample: true })
      .toBuffer();
  } catch {
    throw new MmaBannerStoreError("INVALID", "The uploaded banner is not a readable supported image.");
  }
  const now = input.now ?? new Date();
  const src = `/ads/${slot.id}-${input.width}x${input.height}.webp`;
  const manifest: StagedManifest = {
    ...state.manifest,
    updatedAt: now.toISOString(),
    slots: { ...state.manifest.slots, [slot.id]: { enabled: input.enabled, image: { src, width: input.width, height: input.height }, alt, href } }
  };
  return stageManifest(manifest, new Map([[`public${src}`, creative]]), now, root);
}

export async function setMmaBannerEnabled(input: { slotId: string; enabled: boolean; now?: Date }, root = repositoryRoot): Promise<BannerStageResult> {
  const state = await current(root);
  const slot = state.manifest.slots[input.slotId];
  if (!slot) throw new MmaBannerStoreError("INVALID", "Choose one of the six MMA Files banner slots.");
  if (input.enabled && !slot.image) throw new MmaBannerStoreError("INVALID", "Upload a creative before enabling this slot.");
  const now = input.now ?? new Date();
  const manifest: StagedManifest = {
    ...state.manifest,
    updatedAt: now.toISOString(),
    slots: { ...state.manifest.slots, [input.slotId]: { ...slot, enabled: input.enabled } }
  };
  return stageManifest(manifest, new Map(), now, root);
}
