import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ventureRegistry from "../../../config/ventures.json";

export type VentureIndexGroup = "Publications and editorial desks" | "Research, growth and product" | "Shared production";

export interface VentureIndexCard {
  id: string;
  name: string;
  promise: string;
  boundary: string;
  status: string;
  group: VentureIndexGroup;
  color: string;
  metric: { count: number | null; label: string };
  href: string | null;
  external: boolean;
}

type MetricSource =
  | { kind: "files"; directory: string; label: string; recursive?: boolean; fileName?: string }
  | { kind: "jsonl"; file: string; label: string };

interface CardCopy {
  promise: string;
  boundary: string;
  group: VentureIndexGroup;
  color: string;
  metric: MetricSource;
  href: string | null;
  external?: boolean;
}

const COPY: Record<string, CardCopy> = {
  "caught-up": {
    promise: "One important AI story a day, or an honest no-edition decision.",
    boundary: "Sources and release checks stay mandatory; delivery goes only to the existing DNESKAi reader.",
    group: "Publications and editorial desks",
    color: "#fe45e2",
    metric: { kind: "files", directory: "state/edition/deliveries", label: "edition receipts" },
    href: "/ventures/caught-up"
  },
  "mma-files": {
    promise: "Czech combat-sports articles built from verified fighter files.",
    boundary: "A story can be dropped; social posting stays off until the owner enables it separately.",
    group: "Publications and editorial desks",
    color: "#f7a8ea",
    metric: { kind: "files", directory: "state/ventures/mma-files/articles", label: "article records" },
    href: "https://mma-files.vercel.app/cs",
    external: true
  },
  booksofhistory: {
    promise: "Verified stories about books, authors and the history around them.",
    boundary: "Cheap candidate research comes first; paid research is bounded and drafts require owner approval.",
    group: "Publications and editorial desks",
    color: "#c4b5fd",
    metric: { kind: "files", directory: "state/ventures/booksofhistory/dossiers", label: "research dossiers", recursive: true },
    href: "/ventures/booksofhistory"
  },
  "door-money": {
    promise: "Practical money lessons shaped into owner-reviewed story recommendations.",
    boundary: "The public repository stores only bounded excerpts; results are entered by hand and nothing posts itself.",
    group: "Publications and editorial desks",
    color: "#c4b5fd",
    metric: { kind: "files", directory: "state/ventures/door-money/recommendations", label: "recommendations" },
    href: "/ventures/door-money"
  },
  "tehdejsi-svet": {
    promise: "Czech and Ukrainian historical explainers grounded in a verified facts file.",
    boundary: "The two-day cycle produces drafts only and has no connection to a product repository.",
    group: "Publications and editorial desks",
    color: "#d9684f",
    metric: { kind: "files", directory: "state/ventures/tehdejsi-svet/drafts", label: "draft recommendations" },
    href: "/ventures/tehdejsi-svet"
  },
  kvorum: {
    promise: "Czech political claims checked before one recommendation is recorded.",
    boundary: "Every factual claim needs eligible evidence; approval never publishes or contacts anyone.",
    group: "Publications and editorial desks",
    color: "#f6df45",
    metric: { kind: "files", directory: "state/ventures/kvorum/recommendations", label: "recommendations" },
    href: "/ventures/kvorum"
  },
  fightaiq: {
    promise: "Sourced fighter files and probabilities whose model version stays visible.",
    boundary: "A value needs two independent sources that agree; the project does not place bets.",
    group: "Research, growth and product",
    color: "#fecaca",
    metric: { kind: "files", directory: "state/ventures/fightaiq/deliveries", label: "verified deliveries" },
    href: "/ventures/fightaiq"
  },
  goviral: {
    promise: "A weekly read of measured trends, turned into bounded things to write.",
    boundary: "The room can propose drafts and one agenda handoff; it cannot post, schedule or open an account.",
    group: "Research, growth and product",
    color: "#bbf7d0",
    metric: { kind: "jsonl", file: "state/ideas/goviral/ledger.jsonl", label: "recorded ideas" },
    href: "/ventures/goviral"
  },
  "titty-tuesdays": {
    promise: "A complete inventory of brand and campaign concepts before a shop exists.",
    boundary: "Planning only: no prices, stock, availability, commerce or publishing.",
    group: "Research, growth and product",
    color: "#fde68a",
    metric: { kind: "files", directory: "state/ventures/titty-tuesdays/plans", label: "marketing plans" },
    href: "/ventures/titty-tuesdays"
  },
  marketingshark: {
    promise: "Two language versions of one daily quiz carousel, both left as drafts.",
    boundary: "Questions come from a pinned bank; the standalone source app receives nothing back.",
    group: "Research, growth and product",
    color: "#a5d8f3",
    metric: { kind: "files", directory: "state/ventures/marketingshark/packages", label: "draft packages", recursive: true, fileName: "package.json" },
    href: "/ventures/marketingshark"
  },
  "carousel-studio": {
    promise: "Deterministic social layouts shared by the portfolio's brands.",
    boundary: "The workshop makes no editorial decision and spends no image-model money.",
    group: "Shared production",
    color: "#d4d4d8",
    metric: { kind: "files", directory: "state/ventures/carousel-studio/summaries", label: "render summaries", recursive: true },
    href: "/ventures/carousel-studio"
  }
};

export const VENTURE_INDEX_GROUPS: readonly VentureIndexGroup[] = [
  "Publications and editorial desks",
  "Research, growth and product",
  "Shared production"
];

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

async function countFiles(directory: string, recursive: boolean, fileName?: string): Promise<number | null> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory() && recursive) {
      const nested = await countFiles(path.join(directory, entry.name), true, fileName);
      if (nested === null) return null;
      count += nested;
    } else if (entry.isFile() && (fileName ? entry.name === fileName : entry.name.endsWith(".json"))) {
      count += 1;
    }
  }
  return count;
}

async function countJsonLines(file: string): Promise<number | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  try {
    for (const line of lines) {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    }
  } catch {
    return null;
  }
  return lines.length;
}

async function metricCount(root: string, source: MetricSource): Promise<number | null> {
  if (source.kind === "jsonl") return countJsonLines(path.join(root, source.file));
  return countFiles(path.join(root, source.directory), source.recursive ?? false, source.fileName);
}

export async function readVentureIndex(root = repositoryRoot()): Promise<VentureIndexCard[]> {
  return Promise.all(ventureRegistry.ventures
    .filter((venture) => venture.visibility === "public")
    .map(async (venture) => {
    const copy = COPY[venture.id];
    if (!copy) throw new Error(`Missing public venture-index copy for ${venture.id}`);
    return {
      id: venture.id,
      name: venture.name,
      promise: copy.promise,
      boundary: copy.boundary,
      status: venture.status === "operating" ? "Operating" : venture.status,
      group: copy.group,
      color: copy.color,
      metric: { count: await metricCount(root, copy.metric), label: copy.metric.label },
      href: copy.href,
      external: copy.external ?? false
    };
    }));
}
