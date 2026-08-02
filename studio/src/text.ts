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

export function fitText(input: {
  value: string;
  locale: "en" | "cs";
  widthPx: number;
  heightPx: number;
  minFontSize: number;
  maxFontSize: number;
  maxLines: number;
  maxChars: number;
}): FittedText {
  const normalized = graphemes(input.value.normalize("NFC").trim(), input.locale)
    .slice(0, input.maxChars)
    .join("");
  const clippedByContract = graphemes(input.value.normalize("NFC").trim(), input.locale).length > input.maxChars;
  for (let fontSize = input.maxFontSize; fontSize >= input.minFontSize; fontSize -= 1) {
    const maximum = Math.max(1, Math.floor(input.widthPx / (fontSize * 0.56)));
    const wrapped = wrapAt(normalized, maximum, input.maxLines, input.locale);
    const fitsHeight = wrapped.lines.length * fontSize * 1.12 <= input.heightPx;
    if (fitsHeight && !wrapped.truncated) {
      return { lines: wrapped.lines, fontSize, truncated: clippedByContract, normalized };
    }
  }
  const maximum = Math.max(1, Math.floor(input.widthPx / (input.minFontSize * 0.56)));
  const wrapped = wrapAt(normalized, maximum, input.maxLines, input.locale);
  return {
    lines: wrapped.lines,
    fontSize: input.minFontSize,
    truncated: clippedByContract || wrapped.truncated,
    normalized
  };
}
