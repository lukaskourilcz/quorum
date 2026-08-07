import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLibrary } from "./load.js";
import type { Library, Surface } from "./schema.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * The libraries sit beside the engine, not inside `src`.
 *
 * `src/hooks/` and `dist/hooks/` are both two levels under the package root, so one relative path
 * resolves the same whether the studio is consumed as TypeScript source (which `site` does, because
 * webpack applies the `.js`→`.ts` alias) or as built output.
 */
export const HOOKS_ROOT = path.resolve(moduleDirectory, "../../hooks");

export interface LibraryFiles {
  readonly hooks: string;
  readonly research: string;
}

/**
 * Where each surface's files live, whether or not they exist yet.
 *
 * news and MMA are listed with the names their authoring issues will create. A surface with no
 * files loads as an empty library — "not written yet" is a valid state and must not look like a
 * broken one.
 */
export const LIBRARY_FILES: Readonly<Record<Surface, LibraryFiles>> = {
  quiz: { hooks: "quiz.hooks.json", research: "quiz.research.json" },
  news: { hooks: "news.hooks.json", research: "news.research.json" },
  mma: { hooks: "mma.hooks.json", research: "mma.research.json" }
};

async function readJsonOrEmpty(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** One surface's library, parsed and gated. An absent file is an empty library, not a failure. */
export async function readLibrary(surface: Surface, root = HOOKS_ROOT): Promise<Library> {
  const files = LIBRARY_FILES[surface];
  const [hooks, research] = await Promise.all([
    readJsonOrEmpty(path.join(root, files.hooks)),
    readJsonOrEmpty(path.join(root, files.research))
  ]);
  return loadLibrary({ surface, hooks, research });
}

/** The library file's bytes as written, for delivery and hashing. */
export async function readLibrarySource(surface: Surface, root = HOOKS_ROOT): Promise<string> {
  return readFile(path.join(root, LIBRARY_FILES[surface].hooks), "utf8");
}
