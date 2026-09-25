import { readFile } from "node:fs/promises";
import path from "node:path";
import { mondayOfWeek } from "../../meetings/calendar.js";
import { factSheetFor, factSheetText, type Brand } from "./config.js";
import { readTrendHook, categoryForTopic, type TrendHookRead } from "./intelligence.js";
import { clipToWords, dayName, dayShort, fillPattern, weekdayOf, type PostKind } from "./kinds.js";
import { AnyMarketingSharkPackage, isPostPackage, packagePath } from "./package.js";
import type { PostDayPlan } from "./post-plan.js";
import { codeSlideAlt, codeSlidesClip } from "./post-render.js";
import { topicHeading } from "./topics.js";

/**
 * Friday's "this week on devShark" note (quorum#576): the week's own posts, recapped from the
 * packages the room committed, with a theme GoVIRAL's trend hook may choose.
 *
 * Every fact on it is one the room already recorded: a question line, a screen, a challenge title.
 * The trend hook never adds one. It only picks which of devShark's own topic labels leads the week
 * and which of the week's posts the note recommends, and when it cannot, the week's own most
 * frequent topic does, and then the configured fallback. The hook, or why there was none, is
 * recorded in the package.
 */

export interface WeekItem {
  date: string;
  kind: PostKind;
  packageRef: string;
  /** The recap line, before it is fitted to its slot. */
  line: string;
  /** The bank category the post was about, when it was about one. */
  category: string | null;
  /** What the post said on its middle slides, for the writer when it is the week's pick. */
  text: string;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function middleText(slides: ReadonlyArray<{ headline: string; body?: string | undefined }>): string {
  return clipToWords(slides.slice(1, 4).map((slide) => [slide.headline, slide.body ?? ""].filter(Boolean).join(": ")).join("\n"), 700);
}

function itemOf(date: string, relative: string, built: AnyMarketingSharkPackage): WeekItem {
  const packageRef = `state/${relative}`;
  if (!isPostPackage(built)) {
    const category = built.question.category;
    return {
      date,
      kind: "quiz",
      packageRef,
      line: `${dayShort(date)} · ${topicHeading(category)}: ${built.carousels.en.slides[1]!.headline}`,
      category,
      text: middleText(built.carousels.en.slides)
    };
  }
  return {
    date,
    kind: built.kind,
    packageRef,
    line: `${dayShort(date)} · ${built.hook.en}`,
    category: built.challenge?.track ?? null,
    text: middleText(built.carousels.en.slides)
  };
}

/**
 * The brand's packages from Monday up to the day before `date`, oldest first. A missing day is
 * skipped; a package that does not parse is counted and dropped, never recapped.
 */
export async function readWeekItems(input: { stateRoot: string; brandId: string; date: string }): Promise<{ weekOf: string; items: WeekItem[]; dropped: number }> {
  const weekOf = mondayOfWeek(input.date);
  const items: WeekItem[] = [];
  let dropped = 0;
  for (let day = weekOf; day < input.date; day = addDays(day, 1)) {
    const relative = packagePath(day, input.brandId);
    let raw: string;
    try {
      raw = await readFile(path.join(input.stateRoot, relative), "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = AnyMarketingSharkPackage.safeParse(JSON.parse(raw));
      if (parsed.success) items.push(itemOf(day, relative, parsed.data));
      else dropped += 1;
    } catch {
      dropped += 1;
    }
  }
  return { weekOf, items, dropped };
}

export interface WeekTheme {
  label: string;
  category: string | null;
  from: "trend" | "week" | "fallback";
}

/**
 * The week's theme: the trend hook's category when it names one the bank carries, else the week's
 * most frequent category (the earliest wins a tie), else the configured fallback. A label that
 * would not fit its slot passes to the next source.
 */
export function chooseTheme(input: {
  trend: TrendHookRead;
  items: readonly WeekItem[];
  categories: readonly string[];
  fallback: string;
  fits: (label: string) => boolean;
}): WeekTheme {
  const fromTrend = input.trend.packet ? categoryForTopic(input.trend.packet.topic, input.categories) : null;
  if (fromTrend && input.fits(topicHeading(fromTrend))) return { label: topicHeading(fromTrend), category: fromTrend, from: "trend" };
  const counts = new Map<string, number>();
  for (const item of input.items) if (item.category) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const best = [...counts.entries()].reduce<[string, number] | null>((top, entry) => (!top || entry[1] > top[1] ? entry : top), null);
  if (best && input.fits(topicHeading(best[0]))) return { label: topicHeading(best[0]), category: best[0], from: "week" };
  return { label: input.fallback, category: null, from: "fallback" };
}

/** Recap lines that fit their slots: each is cut back, word by word, until the slide stops clipping. */
function fittedRecap(brand: Brand, headline: string, lines: readonly string[], otherSlides: Record<string, { headline: string; body: string; alt: string }>): string[] | null {
  let fitted = [...lines];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const recap = { headline, body: fitted.join("\n"), alt: "" };
    const clipped = codeSlidesClip(brand, "this-week", { ...otherSlides, recap });
    if (!clipped.some((entry) => entry.startsWith("recap:"))) return fitted;
    const slots = new Set(clipped.filter((entry) => entry.startsWith("recap:option-")).map((entry) => "abcd".indexOf(entry.slice(-1))));
    if (slots.size === 0) return null;
    fitted = fitted.map((line, index) => (slots.has(index) ? clipToWords(line, Math.max(24, line.length - 12)) : line));
  }
  return null;
}

/** Friday: the week's posts, a theme and one pick. No week to recap is no note. */
export async function planWeek(input: {
  brand: Brand;
  date: string;
  stateRoot: string;
  factStateRoot: string;
  configRoot: string;
}): Promise<PostDayPlan | string> {
  const { brand, date } = input;
  const settings = brand.postKinds["this-week"];
  if (!settings) return "no weekly note is configured";
  const { weekOf, items: all } = await readWeekItems({ stateRoot: input.stateRoot, brandId: brand.id, date });
  // The four latest days fit the recap's four lines; the rotation drafts at most four before Friday.
  const items = all.slice(-4);
  if (items.length === 0) return "no package was drafted earlier this week, so there is no week to recap";

  const hook = fillPattern(settings.hookPattern.en, { displayName: brand.displayName });
  const hookSlide = { headline: hook, body: "", alt: codeSlideAlt(1, hook) };
  const footer = { headline: settings.footer.en, body: "", alt: codeSlideAlt(5, settings.footer.en) };
  const trend = await readTrendHook({ stateRoot: input.factStateRoot, configRoot: input.configRoot, brandId: brand.id, date });
  const categories = [...new Set(Object.values(brand.categoryLists).flat())];
  const theme = chooseTheme({
    trend,
    items,
    categories,
    fallback: settings.themeFallback,
    fits: (label) => codeSlidesClip(brand, "this-week", { theme: { headline: label, body: "", alt: "" } }).length === 0
  });
  const pick = items.find((item) => theme.category !== null && item.category === theme.category) ?? items[0]!;

  const headline = items.length > 1 ? `${dayName(items[0]!.date)} to ${dayName(items.at(-1)!.date)}` : dayName(items[0]!.date);
  const themeSlide = { headline: theme.label, body: "", alt: codeSlideAlt(2, `this week's theme, ${theme.label}`) };
  const lines = fittedRecap(brand, headline, items.map((item) => item.line), { hook: hookSlide, theme: themeSlide, footer });
  if (!lines) return "the week's recap does not fit its slide";
  const recap = { headline, body: lines.join("\n"), alt: codeSlideAlt(3, `${headline}. ${lines.join("; ")}`) };
  const clipped = codeSlidesClip(brand, "this-week", { hook: hookSlide, theme: themeSlide, recap, footer });
  if (clipped.length > 0) return `the weekly note's own slides would clip (${clipped.join(", ")})`;

  return {
    kind: "this-week",
    weekday: weekdayOf(date),
    scheduled: "this-week",
    subject: { ref: `marketingshark:week:${weekOf}`, label: `${hook}, week of ${weekOf}` },
    hook: { patternId: settings.hookPattern.id, en: hook },
    // The theme slide's label is code's; its line underneath is the writer's.
    codeSlides: { hook: hookSlide, theme: themeSlide, recap, footer },
    provenance: {
      week: {
        weekOf,
        items: items.map((item, index) => ({ date: item.date, kind: item.kind, packageRef: item.packageRef, line: lines[index]! })),
        theme,
        pick: { date: pick.date, packageRef: pick.packageRef },
        trend: { packet: trend.packet, reason: trend.reason }
      }
    },
    brief: `## Today's post: this week on ${brand.displayName}\n`
      + `theme: ${theme.label} (slide 2 prints it; write the one line under it)\n`
      + `Slide 3 lists the week's posts, and code has written it:\n${lines.map((line) => `- ${line}`).join("\n")}\n`
      + `Slide 4 recommends one of them, this one: ${pick.line}\n`
      + `What that post said, which is all you may say about it:\n${pick.text}\n`
      + `Never say that a topic is trending, viral or popular, and never mention reach, engagement or any platform's figures.`,
    numberSource: [...items.map((item) => `${item.line}\n${item.text}`), factSheetText(factSheetFor(brand, date))].join("\n"),
    ownerCopy: null
  };
}
