import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The state of GoVIRAL's writing profile.
 *
 * The venture stores no plans and no ideas, so both its tabs read "nothing is stored" and the one
 * artefact it actually owns — `state/ventures/goviral/profile.md` — was invisible in the admin.
 * Filling it is one of the two things blocking the venture, and the weekly brief is degraded until
 * it happens, so the workspace has to lead with it rather than with an empty table.
 *
 * Nothing here reads the profile's *content* into the page. The room treats that file as data
 * rather than instructions, and so does this: the panel reports which sections are still empty and
 * links the file viewer for the rest.
 */
export interface GoViralProfileSection {
  /** The heading exactly as written in the file. */
  title: string;
  filled: boolean;
}

export interface GoViralProfileStatus {
  /** `missing` means the template itself is gone, which is a different problem from an unfilled one. */
  state: "missing" | "template" | "partial" | "filled";
  sections: GoViralProfileSection[];
  filledCount: number;
  /** Relative to `state/`, for the admin file viewer. */
  relativePath: string;
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
export const GOVIRAL_PROFILE_PATH = "ventures/goviral/profile.md";

/**
 * A section counts as filled when it holds a line that is not a heading, not blank, and not part
 * of the guidance comment. The template ships every prompt inside `<!-- -->` precisely so an
 * unanswered section is machine-detectable rather than a judgement call.
 */
function sectionsOf(markdown: string): GoViralProfileSection[] {
  const sections: GoViralProfileSection[] = [];
  let current: GoViralProfileSection | null = null;
  let inComment = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.startsWith("<!--")) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      current = { title: heading[1]!.trim(), filled: false };
      sections.push(current);
      continue;
    }
    if (current && line.length > 0 && !line.startsWith("#")) current.filled = true;
  }
  return sections;
}

export async function readGoViralProfile(root = repositoryRoot): Promise<GoViralProfileStatus> {
  let markdown: string;
  try {
    markdown = await readFile(path.join(root, "state", GOVIRAL_PROFILE_PATH), "utf8");
  } catch {
    return { state: "missing", sections: [], filledCount: 0, relativePath: GOVIRAL_PROFILE_PATH };
  }

  const sections = sectionsOf(markdown);
  const filledCount = sections.filter((section) => section.filled).length;
  return {
    state: filledCount === 0 ? "template" : filledCount === sections.length ? "filled" : "partial",
    sections,
    filledCount,
    relativePath: GOVIRAL_PROFILE_PATH
  };
}
