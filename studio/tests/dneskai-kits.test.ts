import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDITORIAL_KIT } from '../src/dneskai-kits/editorial.js';
import { defineDneskaiKit } from '../src/dneskai-kits/kit.js';
import { DNESKAI_TEXT_LIMITS, DNESKAI_TEMPLATE_VARIANTS, dneskaiImageSlots } from '../src/dneskai-kits/contract.js';
import { DNESKAI_PHOTO_TEMPLATES } from '../src/dneskai-photo.js';
import { ACCEPTANCE_TEMPLATES, acceptanceDeck } from './fixtures/dneskai-acceptance-deck.js';

describe('the editorial kit contract',()=>{
 it('keeps the facade objects and acceptance resolver identities',async()=>{
  expect([...EDITORIAL_KIT.templates]).toEqual([...DNESKAI_PHOTO_TEMPLATES]);
  const deck=await acceptanceDeck();
  expect(deck.map(s=>EDITORIAL_KIT.resolve(s.type,s.variant,(s.images??[]).map(i=>i.slot)).id)).toEqual(ACCEPTANCE_TEMPLATES);
  expect(EDITORIAL_KIT.resolve('split',undefined,['image-1','image-3']).id).toBe('dneskai-split');
 });
 it('derives the field and placed-field tables held by OwnDashboard',()=>{
  expect(EDITORIAL_KIT.fieldFaces).toEqual({
   headline:{family:'Space Grotesk',weight:700,uppercase:false},body:{family:'Source Serif 4',weight:400,uppercase:false},
   kicker:{family:'IBM Plex Mono',weight:400,uppercase:true},credit:{family:'IBM Plex Mono',weight:400,uppercase:false},sources:{family:'Source Serif 4',weight:400,uppercase:false}
  });
  expect(EDITORIAL_KIT.placedFields).toEqual({'cover-photo':['headline','kicker','credit'],figure:['headline','body','credit'],split:['headline','body','kicker','credit'],statement:['headline','body'],sources:['sources'],single:['headline','body','kicker','credit']});
  expect(EDITORIAL_KIT.fieldFaces).toBe(EDITORIAL_KIT.fieldFaces);
 });
 it('pins each role limits, image slots and template variants',()=>{
  expect(EDITORIAL_KIT.templates.size).toBe(14);
  for(const t of EDITORIAL_KIT.templates.values()){
   const role=EDITORIAL_KIT.roles.get(t.id)!;
   expect(t.slides[0]!.layers.filter(l=>l.type==='text').map(l=>[l.slot,l.maxChars])).toEqual(Object.entries(DNESKAI_TEXT_LIMITS[role]).filter(([slot])=>t.requiredSlots.includes(slot)));
   expect(t.slides[0]!.layers.filter(l=>l.type==='image').map(l=>({slot:l.slot,optional:l.optional}))).toEqual(dneskaiImageSlots(role,Number(t.id.match(/sources-(\d)$/)?.[1]??0)));
   expect(t.slides[0]!.variants.map(v=>v.id)).toEqual(DNESKAI_TEMPLATE_VARIANTS[role]);
   expect(EDITORIAL_KIT.flows.has(t.id)).toBe(true);
  }
 });
 it('rejects incomplete and repeated structural roles at definition',()=>{
  const templates=[...EDITORIAL_KIT.templates.values()].map(template=>({template,role:EDITORIAL_KIT.roles.get(template.id)!,flow:EDITORIAL_KIT.flows.get(template.id)!,...(template.id.includes('sources-')?{thumbnails:Number(template.id.split('-').at(-1))}:{})}));
  const base={id:'editorial' as const,label:'Test',purpose:'Test',look:'editorial',metrics:EDITORIAL_KIT.metrics};
  expect(()=>defineDneskaiKit({...base,templates:templates.slice(1)})).toThrow('lacks role');
  expect(()=>defineDneskaiKit({...base,templates:[...templates,templates[0]!]})).toThrow('Duplicate');
 });
 it('keeps the slide import graph away from hooks',()=>{
  const seen=new Set<string>(),root=path.resolve(import.meta.dirname,'../src');
  function walk(file:string){
   if(seen.has(file))return;seen.add(file);expect(file).not.toMatch(/[/\\]hooks[/\\]/);
   const source=readFileSync(file,'utf8');
   for(const m of source.matchAll(/(?:from\s*|import\s*\()\s*["'](\.\.?\/[^"']+)["']/g))walk(path.resolve(path.dirname(file),m[1]!.replace(/\.js$/,'.ts')));
  }
  walk(path.join(root,'dneskai-slide.ts'));expect(seen.size).toBeGreaterThan(15);
 });
});

describe('named kit slide API',()=>{
 it('names the default and explicit editorial kit and refuses an unimplemented id',async()=>{
  const {renderDneskaiSlide,validateDneskaiSlide,dneskaiKit,DNESKAI_KITS}=await import('../src/dneskai-slide.js');
  const slide=(await acceptanceDeck())[2]!;
  const defaultRender=await renderDneskaiSlide(slide),explicit=await renderDneskaiSlide({...slide,kit:'editorial'});
  expect(defaultRender.kit).toBe('editorial');expect(explicit.kit).toBe('editorial');expect(explicit.pngHash).toBe(defaultRender.pngHash);
  const refused=await renderDneskaiSlide({...slide,kit:'unknown' as never});
  expect(refused).toMatchObject({status:'refused',kit:null,png:null,template:null,payload:null,problems:[{code:'kit-invalid',blocking:true,field:'kit',message:expect.any(String)}]});
  expect(await validateDneskaiSlide({...slide,kit:'unknown' as never})).toEqual(refused.problems);
  expect(dneskaiKit('bold')).toBeNull();expect([...DNESKAI_KITS.keys()]).toEqual(['editorial']);
 });
});
