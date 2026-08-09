export interface FittedText {
  lines: string[];
  fontSize: number;
  truncated: boolean;
  normalized: string;
}

function graphemes(value: string, locale: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(value)]
      .map((part) => part.segment);
  }
  return Array.from(value);
}

function breakLongWord(word: string, maximum: number, locale: string): string[] {
  const parts = graphemes(word, locale);
  if (parts.length <= maximum) return [word];
  const chunks: string[] = [];
  for (let index = 0; index < parts.length; index += maximum) {
    chunks.push(parts.slice(index, index + maximum).join(""));
  }
  return chunks;
}

function wrapAt(value: string, maximum: number, maxLines: number, locale: string): { lines: string[]; truncated: boolean } {
  const words = value
    .normalize("NFC")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .split(" ")
    .flatMap((word) => breakLongWord(word, maximum, locale));
  const lines: string[] = [];
  let truncated = false;
  for (const word of words) {
    const current = lines.at(-1);
    if (!current) {
      lines.push(word);
      continue;
    }
    if (graphemes(`${current} ${word}`, locale).length <= maximum) {
      lines[lines.length - 1] = `${current} ${word}`;
      continue;
    }
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    lines.push(word);
  }
  if (truncated && lines.length) {
    const last = graphemes(lines.at(-1)!, locale).slice(0, Math.max(1, maximum - 1)).join("");
    lines[lines.length - 1] = `${last.replace(/…$/u, "")}…`;
  }
  return { lines, truncated };
}

/**
 * The nominal width of one character, in em.
 *
 * A rough constant, and knowingly so until per-font metrics land. What it must not do is ignore
 * letter-spacing: a kicker tracked at 0.14 em is 25% wider per character than the same string
 * untracked, and measuring it untracked is exactly how a label that "fits" runs off the canvas.
 */
export const NOMINAL_ADVANCE = 0.56;

export function charactersPerLine(widthPx: number, fontSize: number, tracking = 0): number {
  return Math.max(1, Math.floor(widthPx / (fontSize * (NOMINAL_ADVANCE + tracking))));
}

export function fitText(input: {
  value: string;
  locale: "en" | "cs";
  widthPx: number;
  heightPx: number;
  minFontSize: number;
  maxFontSize: number;
  maxLines: number;
  maxChars: number;
  /** Letter-spacing in em, which widens every character and so narrows every line. */
  tracking?: number;
}): FittedText {
  const tracking = input.tracking ?? 0;
  const normalized = graphemes(input.value.normalize("NFC").trim(), input.locale)
    .slice(0, input.maxChars)
    .join("");
  const clippedByContract = graphemes(input.value.normalize("NFC").trim(), input.locale).length > input.maxChars;
  for (let fontSize = input.maxFontSize; fontSize >= input.minFontSize; fontSize -= 1) {
    const maximum = charactersPerLine(input.widthPx, fontSize, tracking);
    const wrapped = wrapAt(normalized, maximum, input.maxLines, input.locale);
    const fitsHeight = wrapped.lines.length * fontSize * 1.12 <= input.heightPx;
    if (fitsHeight && !wrapped.truncated) {
      return { lines: wrapped.lines, fontSize, truncated: clippedByContract, normalized };
    }
  }
  const maximum = charactersPerLine(input.widthPx, input.minFontSize, tracking);
  const wrapped = wrapAt(normalized, maximum, input.maxLines, input.locale);
  return {
    lines: wrapped.lines,
    fontSize: input.minFontSize,
    truncated: clippedByContract || wrapped.truncated,
    normalized
  };
}
