import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TICKER_KIT } from '../src/dneskai-kits/ticker.js';
import { DNESKAI_MAX_THUMBNAILS, DNESKAI_TEMPLATE_ROLES, DNESKAI_TEMPLATE_VARIANTS, DNESKAI_TEXT_LIMITS, dneskaiImageSlots } from '../src/dneskai-kits/contract.js';
import { DneskaiGoldenSchema } from '../src/dneskai-golden.js';
import { renderDneskaiSlide, type DneskaiSlideInput } from '../src/dneskai-slide.js';
import { validateTemplateAsRendered } from '../src/renderer.js';
import { CAROUSEL_BRANDS } from '../src/library.js';
import { syntheticPhoto } from '../src/index.js';
import { acceptanceDeck } from './fixtures/dneskai-acceptance-deck.js';

/*
 * The ticker kit (src/dneskai-kits/ticker.ts) against the shared DNESKAi contract: the same slots,
 * limits, image slots and variants as every kit, every template passing the checks as its look
 * draws it, the one-face-per-field tables OwnDashboard reads, the acceptance deck pinned by hash in
 * golden/dneskai-ticker.json, and every role rendering at the limits, short and required-only.
 */

const GOLDEN = path.resolve(import.meta.dirname, '../golden/dneskai-ticker.json');
const brand = CAROUSEL_BRANDS['caught-up'];

describe('the ticker kit contract', () => {
  it('implements all fourteen templates under its own prefix', () => {
    expect(TICKER_KIT.templates.size).toBe(14);
    for (const id of TICKER_KIT.templates.keys()) expect(id).toMatch(/^dneskai-ticker-/);
    const keys = [...TICKER_KIT.roles.entries()].map(([id, role]) => role === 'sources' ? `sources-${id.split('-').at(-1)}` : role);
    expect(new Set(keys)).toEqual(new Set([...DNESKAI_TEMPLATE_ROLES.filter((role) => role !== 'sources'), ...Array.from({ length: DNESKAI_MAX_THUMBNAILS + 1 }, (_, n) => `sources-${n}`)]));
  });

  it('keeps every role slot, limit, image slot and variant of the shared tables', () => {
    for (const t of TICKER_KIT.templates.values()) {
      const role = TICKER_KIT.roles.get(t.id)!;
      expect(t.slides[0]!.layers.filter((l) => l.type === 'text').map((l) => [l.slot, l.maxChars]), t.id).toEqual(Object.entries(DNESKAI_TEXT_LIMITS[role]).filter(([slot]) => slot !== 'images-label' || !t.id.endsWith('sources-0')));
      expect(t.slides[0]!.layers.filter((l) => l.type === 'text').every((l) => l.type === 'text' && l.keepWithNext === 'cs'), t.id).toBe(true);
      expect(t.slides[0]!.layers.filter((l) => l.type === 'image').map((l) => ({ slot: l.slot, optional: l.optional })), t.id).toEqual(dneskaiImageSlots(role, Number(t.id.match(/sources-(\d)$/)?.[1] ?? 0)));
      expect(t.slides[0]!.variants.map((v) => v.id), t.id).toEqual(DNESKAI_TEMPLATE_VARIANTS[role]);
    }
  });

  it('passes every template check as the ticker look draws it', () => {
    for (const t of TICKER_KIT.templates.values()) {
      expect(validateTemplateAsRendered(t, brand, 'instagram-portrait', 'ticker').filter((check) => check.status === 'fail'), t.id).toEqual([]);
    }
  });

  it('keeps the flat rules: colour pictures, no bleed, no shade, no gradient, square corners', () => {
    for (const t of TICKER_KIT.templates.values()) for (const layer of t.slides[0]!.layers) {
      expect(['mesh', 'linear-gradient']).not.toContain(layer.type);
      if (layer.type === 'image') expect([layer.treatment, layer.scrim, layer.shade, layer.width < 1]).toEqual(['none', 'none', undefined, true]);
      if (layer.type === 'shape') expect(layer.radius).toBe(0);
      if (layer.type === 'text') expect(layer.glow).toBe(false);
    }
  });

  it('derives one face per field and the fields each slide type places', () => {
    expect(TICKER_KIT.fieldFaces).toEqual({
      headline: { family: 'Inter', weight: 700, uppercase: false }, body: { family: 'Inter', weight: 400, uppercase: false },
      kicker: { family: 'JetBrains Mono', weight: 400, uppercase: true }, credit: { family: 'JetBrains Mono', weight: 400, uppercase: false },
      sources: { family: 'JetBrains Mono', weight: 400, uppercase: false }
    });
    expect(TICKER_KIT.placedFields).toEqual({ 'cover-photo': ['headline', 'kicker', 'credit'], figure: ['headline', 'body', 'credit'], split: ['headline', 'body', 'kicker', 'credit'], statement: ['headline', 'body'], sources: ['sources'], single: ['headline', 'body', 'kicker', 'credit'] });
  });
});

describe('the ticker kit renders', () => {
  let photos: Buffer[];
  beforeAll(async () => { photos = await Promise.all([syntheticPhoto(1_600, 1_200, 31), syntheticPhoto(1_200, 630, 32), syntheticPhoto(900, 1_200, 33)]); });

  it('resolves and pins the acceptance deck by hash, twice equal', async () => {
    const deck = await acceptanceDeck();
    const golden = DneskaiGoldenSchema.parse(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    const rendered = [];
    for (const [index, slide] of deck.entries()) {
      const result = await renderDneskaiSlide({ ...slide, kit: 'ticker' });
      expect(result.status, `${index}`).toBe('rendered');
      expect(result.kit).toBe('ticker');
      rendered.push({ name: `acceptance-${index + 1}`, templateId: result.template!.id, version: result.template!.version, pngHash: result.pngHash! });
    }
    expect(rendered.map((entry) => entry.templateId)).toEqual(['cover-photo', 'figure', 'figure', 'split-pair', 'statement', 'figure', 'sources-4'].map((role) => `dneskai-ticker-${role}`));
    expect(rendered).toEqual(golden.entries);
    expect((await renderDneskaiSlide({ ...deck[3]!, kit: 'ticker' })).pngHash).toBe(rendered[3]!.pngHash);
  }, 180_000);

  const long = (limit: number) => {
    const words = 'Žluťoučký kůň úpěl ďábelské ódy a redakce čeká na nezávislé ověření smyšleného příkladu';
    let out = '';
    while (out.length < limit) out += (out ? ' ' : '') + words;
    return out.slice(0, limit).trimEnd();
  };
  const image = (n: number, photo = n - 1) => ({ slot: `image-${n}`, bytes: photos[photo % photos.length]! });
  const cases = (length: (limit: number) => string | undefined): Array<[string, DneskaiSlideInput]> => {
    const at = { index: 1, count: 5 };
    const f = (role: keyof typeof DNESKAI_TEXT_LIMITS, slot: string) => length(DNESKAI_TEXT_LIMITS[role][slot]!);
    return [
      ['cover-photo', { type: 'cover-photo', position: { index: 0, count: 5 }, headline: f('cover-photo', 'headline')!, kicker: f('cover-photo', 'kicker'), credit: f('cover-photo', 'credit'), images: [image(1)] }],
      ['figure', { type: 'figure', position: at, headline: f('figure', 'headline')!, body: f('figure', 'body'), credit: f('figure', 'credit'), images: [image(1, 1)] }],
      ['split', { type: 'split', position: at, headline: f('split', 'headline')!, body: f('split', 'body'), kicker: f('split', 'kicker'), credit: f('split', 'credit'), images: [image(1, 2)] }],
      ['split-pair', { type: 'split', position: at, headline: f('split-pair', 'headline')!, body: f('split-pair', 'body'), kicker: f('split-pair', 'kicker'), credit: f('split-pair', 'credit'), images: [image(1), image(2)] }],
      ['statement', { type: 'statement', position: at, headline: f('statement', 'headline')!, body: f('statement', 'body') }],
      ['statement-ink', { type: 'statement', variant: 'ink', position: at, headline: f('statement', 'headline')!, body: f('statement', 'body') }],
      ...Array.from({ length: DNESKAI_MAX_THUMBNAILS + 1 }, (_, n): [string, DneskaiSlideInput] => [`sources-${n}`, { type: 'sources', position: { index: 4, count: 5 }, sources: length(DNESKAI_TEXT_LIMITS.sources['source-1']!) ? Array.from({ length: 4 }, () => length(DNESKAI_TEXT_LIMITS.sources['source-1']!)!) : ['Zdroj'], images: Array.from({ length: n }, (_, i) => image(i + 1)) }]),
      ['single-photo', { type: 'single', variant: 'photo', position: { index: 0, count: 1 }, headline: f('single-photo', 'headline')!, body: f('single-photo', 'body'), kicker: f('single-photo', 'kicker'), credit: f('single-photo', 'credit'), images: [image(1)] }],
      ['single-type', { type: 'single', variant: 'type', position: { index: 0, count: 1 }, headline: f('single-type', 'headline')!, body: f('single-type', 'body'), kicker: f('single-type', 'kicker'), credit: f('single-type', 'credit') }]
    ];
  };

  it.each([
    ['the longest strings', long],
    ['the shortest strings', () => 'Model X'],
    ['the required strings only', () => undefined]
  ] as const)('sets every role with %s, with nothing cut', async (_name, length) => {
    for (const [name, input] of cases((limit) => length(limit) ?? (undefined as never))) {
      const required = { ...input, headline: input.headline ?? 'Model X' } as DneskaiSlideInput;
      const result = await renderDneskaiSlide({ ...(input.type === 'sources' ? input : required), kit: 'ticker' });
      expect(result.problems.filter((p) => p.code !== 'image-upscaled'), name).toEqual([]);
      expect(result.status, name).toBe('rendered');
      expect(result.truncatedSlots, name).toEqual([]);
    }
  }, 300_000);
});
