import type { DatasetEntry } from "../contracts/boardless-dataset.js";
import { OWNER_SLOT_MARKER, type DneskaiRecipe } from "../contracts/dneskai-recipe.js";
import { clipCaption, wordsWithin, withUtm } from "./pack-extras.js";
import type { EditionSummary, RoomQuote, WeekTool } from "./recipe-sources.js";

/**
 * The words of each DNESKAi recipe (quorum#592), as pure functions of the records it reads. Czech,
 * in the magazine's register, and never a fact the records do not hold: a tool's price is a slot
 * the owner fills, a cost the ledger does not record is named as missing.
 */

const WEEKDAYS_CS = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"] as const;

export function czechDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day}. ${month}.`;
}

export function czechWeekday(date: string): string {
  return WEEKDAYS_CS[(new Date(`${date}T12:00:00.000Z`).getUTCDay() + 6) % 7]!;
}

const HASHTAGS = "#ai #umelainteligence #dneskai";

/** A carousel built by the article splitter, or one card drawn by a fixed template. */
export type RecipeVisual =
  | { kind: "deck"; title: string; dek: string; points: string[]; outro: string }
  | { kind: "card"; templateId: "quote-card"; strings: { quote: string; attribution: string } };

export interface RecipeCopy {
  recipe: DneskaiRecipe;
  visual: RecipeVisual;
  caption: string;
  threads: string;
  destination: string;
  ownerSlots: Array<{ label: string }>;
  sourceRefs: string[];
  /** The story of the same post, when the recipe has one: the card's words at 9:16. */
  story?: { quote: string; line: string; link: string };
}

function fitThreads(parts: string[], link: string): string {
  const tail = `\n\n${link}`;
  const body = parts.join("\n\n");
  return `${clipCaption(body, 500 - tail.length)}${tail}`;
}

export function fridayToolsCopy(tools: readonly WeekTool[]): RecipeCopy | null {
  const picked = tools.slice(-3);
  if (picked.length === 0) return null;
  const label = picked.length === 1 ? "1 nástroj" : `${picked.length} nástroje`;
  const latest = picked.at(-1)!;
  const link = withUtm(latest.destination, "instagram", "post", "friday-tools");
  const lines = picked.map((tool, index) => [
    `${index + 1}. ${tool.practical.title}: ${wordsWithin(tool.practical.body, 220)}`,
    `Cena: ${OWNER_SLOT_MARKER}: ověřit u výrobce]`,
    `Z vydání ${czechDay(tool.date)}: ${withUtm(tool.destination, "instagram", "post", "friday-tools")}`
  ].join("\n"));
  return {
    recipe: "friday-tools",
    visual: {
      kind: "deck",
      title: `${label} z tohoto týdne`,
      dek: "Co se objevilo ve vydáních DNESKAi. Cenu si vždy ověřte u výrobce.",
      // The closing point is a fact about prices in general, and it keeps a one-tool week at the
      // deck's five-slide minimum without inventing anything about the tool.
      points: [...picked.map((tool) => `${tool.practical.title}: ${tool.practical.body}`), "Ceny nástrojů se mění. Než si některý pořídíte, ověřte si cenu přímo u výrobce."],
      outro: "Každé ráno jedno vydání. Zdroje jsou u každého článku."
    },
    caption: clipCaption([`${label} týdne z DNESKAi`, ...lines, HASHTAGS].join("\n\n"), 2_200),
    threads: fitThreads([`${label} z tohoto týdne v DNESKAi: ${picked.map((tool) => tool.practical.title).join(", ")}.`, "Co dělají a odkud jsou, najdete ve vydáních."], withUtm(latest.destination, "threads", "post", "friday-tools")),
    destination: link,
    ownerSlots: picked.map((tool) => ({ label: `Cena: ${tool.practical.title}` })),
    sourceRefs: [...new Set(picked.flatMap((tool) => [tool.ref, tool.practical.source_url]))]
  };
}

export function weeklyRecapCopy(input: { editions: readonly EditionSummary[]; siteUrl: string; from: string; to: string }): RecipeCopy | null {
  if (input.editions.length < 2) return null;
  const week = new URL("/tyden", input.siteUrl).toString();
  const range = `${czechDay(input.from)}–${czechDay(input.to)}`;
  return {
    recipe: "weekly-recap",
    visual: {
      kind: "deck",
      title: `Týden v AI: ${range}`,
      dek: `${input.editions.length} vydání, jeden přehled.`,
      points: input.editions.map((edition) => `${czechWeekday(edition.date)}: ${edition.headline}`),
      outro: "Celý týden najdete v DNESKAi v rubrice Poslední týden."
    },
    caption: clipCaption([
      `Týden v AI: ${range}`,
      input.editions.map((edition) => `${czechWeekday(edition.date)}: ${edition.headline}`).join("\n"),
      `Celý týden: ${withUtm(week, "instagram", "post", "weekly-recap")}`,
      HASHTAGS
    ].join("\n\n"), 2_200),
    threads: fitThreads([`Týden v AI (${range}):`, input.editions.map((edition) => `– ${edition.headline}`).join("\n")], withUtm(week, "threads", "post", "weekly-recap")),
    destination: withUtm(week, "instagram", "post", "weekly-recap"),
    ownerSlots: [],
    sourceRefs: input.editions.map((edition) => edition.ref)
  };
}

export function howItWasMadeCopy(input: { room: RoomQuote; edition: EditionSummary; costUsd: number | null; siteUrl: string }): RecipeCopy | null {
  if (!input.room.text || !input.room.agent) return null;
  const article = new URL(`/articles/${input.edition.slug}`, input.siteUrl).toString();
  const quote = wordsWithin(input.room.text, 190);
  const cost = input.costUsd === null
    ? "Náklad na modely za ten den v účetní knize chybí."
    : `Modely na ten den stály ${input.costUsd.toFixed(2)} USD (účetní kniha BoardlessAI).`;
  return {
    recipe: "how-it-was-made",
    visual: { kind: "card", templateId: "quote-card", strings: { quote, attribution: wordsWithin(`${input.room.agent} · redakční místnost ${czechDay(input.edition.date)}`, 80) } },
    caption: clipCaption([
      "Jak vzniká DNESKAi",
      `Každé vydání projde redakční místností agentů. ${czechDay(input.edition.date)} v ní ${input.room.agent} k vydání „${input.edition.headline}“ řekl: „${quote}“`,
      cost,
      `Článek: ${withUtm(article, "instagram", "post", "how-it-was-made")}`,
      HASHTAGS
    ].join("\n\n"), 2_200),
    threads: fitThreads([`Jak vzniká DNESKAi: ${input.room.agent} v redakční místnosti ${czechDay(input.edition.date)}: „${quote}“`, cost], withUtm(article, "threads", "post", "how-it-was-made")),
    destination: withUtm(article, "instagram", "post", "how-it-was-made"),
    ownerSlots: [],
    sourceRefs: [input.room.ref, input.edition.ref, "state/budget/ledger.json"]
  };
}

export function noEditionCopy(input: { entry: DatasetEntry; kind: "lesson" | "fact"; siteUrl: string; date: string }): RecipeCopy {
  const label = input.kind === "lesson" ? "Pojem dne" : "Fakt dne";
  const quote = wordsWithin(input.kind === "lesson" && input.entry.term ? `${input.entry.term}: ${input.entry.cs.short}` : input.entry.cs.short, 190);
  const site = withUtm(input.siteUrl, "instagram", "post", "no-edition");
  return {
    recipe: "no-edition",
    visual: { kind: "card", templateId: "quote-card", strings: { quote, attribution: `${label} · DNESKAi` } },
    caption: clipCaption([
      `Dnes vydání DNESKAi nevyšlo. ${label}:`,
      input.kind === "lesson" && input.entry.term ? `${input.entry.term}: ${input.entry.cs.full}` : input.entry.cs.full,
      `Zdroj: ${input.entry.source}`,
      `Další vydání: ${site}`,
      HASHTAGS
    ].join("\n\n"), 2_200),
    threads: fitThreads([`Dnes vydání DNESKAi nevyšlo. ${label}: ${input.kind === "lesson" && input.entry.term ? `${input.entry.term}: ` : ""}${input.entry.cs.full}`, `Zdroj: ${input.entry.source}`], withUtm(input.siteUrl, "threads", "post", "no-edition")),
    destination: site,
    ownerSlots: [],
    sourceRefs: [`aifirst:data/ai-${input.kind === "lesson" ? "lessons" : "facts"}.json#${input.entry.id}`],
    story: { quote, line: `${label} · odkaz v příběhu`, link: withUtm(input.siteUrl, "instagram", "story", "no-edition") }
  };
}
