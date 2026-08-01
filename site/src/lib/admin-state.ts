import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repositoryRoot =
  process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

const socialStatuses = new Set([
  "draft",
  "approved",
  "queued",
  "publishing",
  "published",
  "failed",
  "expired",
  "needs_reconciliation",
  "cancelled"
]);

type SocialLocale = "en" | "cs";
type SocialChannel = "instagram" | "threads";

export interface AdminSocialChannel {
  text: string;
  hashtags: string[];
  frames: string[];
}

export interface AdminSocialLocale {
  destination: string;
  instagram: AdminSocialChannel;
  threads: AdminSocialChannel;
}

export interface AdminSocialQueueItem {
  channel: SocialChannel;
  locale: SocialLocale;
  status: string;
  publishWindow: {
    notBefore: string;
    notAfter: string;
  } | null;
}

export interface AdminSocialPack {
  date: string;
  editionRef: string;
  byLocale: Record<SocialLocale, AdminSocialLocale>;
  quoteCard: {
    frame: string;
    sourceTurnRef: string;
  };
  queue: AdminSocialQueueItem[];
}

export interface AdminSocialArchive {
  packs: AdminSocialPack[];
  unreadableFiles: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maximum = 4_000): string | null {
  return typeof value === "string" && value.trim() && value.length <= maximum
    ? value
    : null;
}

function safeHttpsUrl(value: unknown): string | null {
  const candidate = safeString(value, 2_048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeFramePath(value: unknown): string | null {
  return typeof value === "string" && /^\/social\/[a-zA-Z0-9/_-]+\.webp$/.test(value)
    ? value
    : null;
}

function parseChannel(value: unknown, textKey: "caption" | "text"): AdminSocialChannel | null {
  if (!isRecord(value)) return null;
  const text = safeString(value[textKey]);
  const hashtags = Array.isArray(value.hashtags)
    ? value.hashtags.filter((tag): tag is string => typeof tag === "string" && /^[a-z0-9_]+$/.test(tag))
    : null;
  const rawFrames = value.frames;
  const rawFrameCount = Array.isArray(rawFrames) ? rawFrames.length : 0;
  const frames = Array.isArray(rawFrames)
    ? rawFrames.map(safeFramePath).filter((frame): frame is string => Boolean(frame))
    : null;
  if (!text || !hashtags || !frames?.length || frames.length !== rawFrameCount) return null;
  return { text, hashtags, frames };
}

function parseLocale(value: unknown): AdminSocialLocale | null {
  if (!isRecord(value)) return null;
  const destination = safeHttpsUrl(value.destination);
  const instagram = parseChannel(value.instagram, "caption");
  const threads = parseChannel(value.threads, "text");
  return destination && instagram && threads
    ? { destination, instagram, threads }
    : null;
}

function parsePack(value: unknown, expectedDate: string): Omit<AdminSocialPack, "queue"> | null {
  if (!isRecord(value) || value.schemaVersion !== "social-pack/1" || value.date !== expectedDate) return null;
  const editionRef = typeof value.editionRef === "string" && /^[a-f0-9]{64}$/.test(value.editionRef)
    ? value.editionRef
    : null;
  const locales = isRecord(value.byLocale) ? value.byLocale : null;
  const en = parseLocale(locales?.en);
  const cs = parseLocale(locales?.cs);
  const quote = isRecord(value.quoteCard) ? value.quoteCard : null;
  const frame = safeFramePath(quote?.frame);
  const sourceTurnRef = safeString(quote?.sourceTurnRef, 240);
  if (!editionRef || !en || !cs || !frame || !sourceTurnRef) return null;
  return {
    date: expectedDate,
    editionRef,
    byLocale: { en, cs },
    quoteCard: { frame, sourceTurnRef }
  };
}

async function readQueueItem(
  root: string,
  date: string,
  locale: SocialLocale,
  channel: SocialChannel
): Promise<AdminSocialQueueItem> {
  const fallback: AdminSocialQueueItem = {
    channel,
    locale,
    status: "unavailable",
    publishWindow: null
  };
  try {
    const raw = JSON.parse(
      await readFile(path.join(root, "state", "social", "queue", `${date}-${locale}-${channel}.json`), "utf8")
    ) as unknown;
    if (!isRecord(raw) || raw.channel !== channel || !socialStatuses.has(String(raw.status))) return fallback;
    const window = isRecord(raw.publishWindow) ? raw.publishWindow : null;
    const notBefore = safeString(window?.notBefore, 80);
    const notAfter = safeString(window?.notAfter, 80);
    return {
      channel,
      locale,
      status: String(raw.status),
      publishWindow: notBefore && notAfter ? { notBefore, notAfter } : null
    };
  } catch {
    return fallback;
  }
}

export async function readAdminSocialArchive(root = repositoryRoot): Promise<AdminSocialArchive> {
  const packDirectory = path.join(root, "state", "social", "packs");
  let filenames: string[];
  try {
    filenames = (await readdir(packDirectory))
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort((left, right) => right.localeCompare(left));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { packs: [], unreadableFiles: [] };
    }
    throw error;
  }

  const packs: AdminSocialPack[] = [];
  const unreadableFiles: string[] = [];
  for (const filename of filenames) {
    const date = filename.slice(0, 10);
    try {
      const parsed = parsePack(
        JSON.parse(await readFile(path.join(packDirectory, filename), "utf8")) as unknown,
        date
      );
      if (!parsed) {
        unreadableFiles.push(filename);
        continue;
      }
      const queue = await Promise.all(
        (["en", "cs"] as const).flatMap((locale) =>
          (["instagram", "threads"] as const).map((channel) =>
            readQueueItem(root, date, locale, channel)
          )
        )
      );
      packs.push({ ...parsed, queue });
    } catch {
      unreadableFiles.push(filename);
    }
  }
  return { packs, unreadableFiles };
}

export interface AdminSnapshot {
  generatedAt: string;
  brand: string;
  business: string;
  finance: string;
  experiments: string;
  inbox: string;
  opportunities: string;
  social: string;
  budgetLedger: string;
  financeLedger: string;
  treasuryLedger: string;
  meetingAgendas: string;
  socialArchive: AdminSocialArchive;
}

export async function readAdminSnapshot(root = repositoryRoot): Promise<AdminSnapshot> {
  const rootStateDirectory = path.join(root, "state");
  const readRootStateFile = async (relativePath: string): Promise<string> => {
    const target = path.resolve(rootStateDirectory, relativePath);
    const relative = path.relative(rootStateDirectory, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Admin state path escaped its root");
    }
    try {
      return await readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "Unavailable in this runtime.";
      throw error;
    }
  };
  const [
    brand,
    business,
    finance,
    experiments,
    inbox,
    opportunities,
    social,
    budgetLedger,
    financeLedger,
    treasuryLedger,
    meetingAgendas,
    socialArchive
  ] = await Promise.all([
    readRootStateFile("BRAND.md"),
    readRootStateFile("BUSINESS.md"),
    readRootStateFile("FINANCE.md"),
    readRootStateFile("EXPERIMENTS.md"),
    readRootStateFile("INBOX.md"),
    readRootStateFile("OPPORTUNITIES.md"),
    readRootStateFile("SOCIAL_STRATEGY.md"),
    readRootStateFile("budget/ledger.json"),
    readRootStateFile("finance/ledger.json"),
    readRootStateFile("treasury/ledger.json"),
    readRootStateFile("meeting-agendas/queue.json"),
    readAdminSocialArchive(root)
  ]);
  return {
    generatedAt: new Date().toISOString(),
    brand,
    business,
    finance,
    experiments,
    inbox,
    opportunities,
    social,
    budgetLedger,
    financeLedger,
    treasuryLedger,
    meetingAgendas,
    socialArchive
  };
}
