import { describe, expect, it } from 'vitest';
import { EDITORIAL_KIT } from '../src/dneskai-kits/editorial.js';
import { DNESKAI_EDITORIAL_METRICS, DNESKAI_STACK_PRESETS, layoutDneskaiSlide, type DneskaiLayoutInput } from '../src/dneskai-layout.js';

const input=(id='dneskai-statement'):DneskaiLayoutInput=>({template:EDITORIAL_KIT.templates.get(id)!,flow:EDITORIAL_KIT.flows.get(id)!,metrics:DNESKAI_EDITORIAL_METRICS,
 text:{headline:{lines:2,fontSize:50,capHeight:0.7},body:{lines:2,fontSize:30,capHeight:0.7},kicker:{lines:1,fontSize:22}},pictures:{}});
const frame=(value:ReturnType<typeof layoutDneskaiSlide>,slot:string)=>value.slides[0]!.layers.find(l=>l.type==='text'&&l.slot===slot)!;

describe('kit-owned DNESKAi flows',()=>{
 it('dispatches by flow even when the template id changes',()=>{
  const base=input();const renamed={...base,template:{...base.template,id:'independent-composition'}};
  expect(layoutDneskaiSlide(renamed).slides).toEqual(layoutDneskaiSlide(base).slides);
  for(let i=0;i<3;i++)expect(layoutDneskaiSlide(base)).toEqual(layoutDneskaiSlide(base));
 });
 it.each([['dneskai-statement',DNESKAI_STACK_PRESETS.statement],['dneskai-single-type',DNESKAI_STACK_PRESETS.singleType]] as const)('expands %s to its stack preset',(id,flow)=>{
  const base=input(id);expect(layoutDneskaiSlide({...base,flow})).toEqual(layoutDneskaiSlide(base));
 });
 it('anchors at the area top and gives an empty item no space or gap',()=>{
  const base=input();base.text={headline:{lines:1,fontSize:40},body:{lines:0,fontSize:30}};
  const laid=layoutDneskaiSlide({...base,flow:{kind:'stack',anchor:'top',items:[{key:'body',gap:99},{key:'headline',gap:99}]}});
  expect(frame(laid,'headline').y).toBe(base.metrics.area.top/1350);
 });
 it('uses the face cap height only when the metrics leave the offset unset',()=>{
  const base=input(),dynamic={...base,metrics:{...base.metrics,capOffset:undefined}};
  expect(layoutDneskaiSlide(dynamic)).toEqual(layoutDneskaiSlide(base));
  const taller={...base,text:{...base.text,body:{...base.text.body!,capHeight:0.859}}};
  expect(layoutDneskaiSlide(taller)).toEqual(layoutDneskaiSlide(base));
  expect(layoutDneskaiSlide({...taller,metrics:dynamic.metrics})).not.toEqual(layoutDneskaiSlide(base));
 });
 it('stands a floor-anchored group\'s last baseline on the area floor, whatever the optical share',()=>{
  const base=input();base.text={headline:{lines:2,fontSize:50},body:{lines:1,fontSize:30}};
  const flow={kind:'stack' as const,anchor:'floor' as const,items:[{key:'headline',gap:0},{key:'body',gap:'headlineToNote' as const}]};
  const laid=layoutDneskaiSlide({...base,flow}),body=frame(laid,'body');
  // One 30 px line: its frame is 34 px tall (30 × 1.12, rounded up) and its baseline 30 px below the top.
  expect(Math.round(body.y*1350)).toBe(base.metrics.area.bottom-30);
  expect(layoutDneskaiSlide({...base,flow,metrics:{...base.metrics,opticalShare:0.1}})).toEqual(laid);
 });
 it('moves a pulled item up by its pull after the gap, and nothing else',()=>{
  const base=input();base.text={headline:{lines:2,fontSize:50},body:{lines:1,fontSize:30}};
  const items=(pull?:number)=>[{key:'headline',gap:0},{key:'body',gap:'headlineToNote' as const,...(pull===undefined?{}:{pull})}];
  const plain=layoutDneskaiSlide({...base,flow:{kind:'stack',anchor:'top',items:items()}});
  const pulled=layoutDneskaiSlide({...base,flow:{kind:'stack',anchor:'top',items:items(12)}});
  expect(Math.round(frame(plain,'body').y*1350)-Math.round(frame(pulled,'body').y*1350)).toBe(12);
  expect(frame(pulled,'headline')).toEqual(frame(plain,'headline'));
 });
 it('moves the following shade stops down by as far as the group landed, and leaves the rest',async()=>{
  const {SPOTLIGHT_KIT}=await import('../src/dneskai-kits/spotlight.js');
  const id='dneskai-spotlight-figure',template=SPOTLIGHT_KIT.templates.get(id)!,flow=SPOTLIGHT_KIT.flows.get(id)! as Extract<DneskaiLayoutInput['flow'],{kind:'stack'}>;
  const shade=(value:ReturnType<typeof layoutDneskaiSlide>)=>value.slides[0]!.layers.find(l=>l.type==='image')!.shade!.stops;
  const base:DneskaiLayoutInput={template,flow,metrics:SPOTLIGHT_KIT.metrics,text:{headline:{lines:1,fontSize:60,capHeight:0.686},body:{lines:1,fontSize:30,capHeight:0.728}},pictures:{}};
  const declared=template.slides[0]!.layers.find(l=>l.type==='image')!.shade!.stops;
  const laid=layoutDneskaiSlide(base),headline=frame(laid,'headline');
  const drop=(Math.round(headline.y*1350)-Math.round(template.slides[0]!.layers.find(l=>l.type==='text'&&l.slot==='headline')!.y*1350))/1296;
  expect(drop).toBeGreaterThan(0);
  expect(shade(laid).slice(0,2)).toEqual(declared.slice(0,2));
  // Stops 2 to 4 move, never past stop 5 at the foot, which stays.
  shade(laid).slice(2,5).forEach((stop,i)=>expect(stop.at).toBeCloseTo(Math.min(declared[5]!.at,declared[i+2]!.at+drop),3));
  expect(shade(laid).slice(5)).toEqual(declared.slice(5));
  expect(shade(laid).map(s=>s.opacity)).toEqual(declared.map(s=>s.opacity));
  const {follow:_,...still}=flow;
  expect(shade(layoutDneskaiSlide({...base,flow:still}))).toEqual(declared);
 });
 it('never moves the shade past an empty text frame left where it was declared',async()=>{
  const {SPOTLIGHT_KIT}=await import('../src/dneskai-kits/spotlight.js');
  const id='dneskai-spotlight-figure',template=SPOTLIGHT_KIT.templates.get(id)!;
  const laid=layoutDneskaiSlide({template,flow:SPOTLIGHT_KIT.flows.get(id)!,metrics:SPOTLIGHT_KIT.metrics,text:{headline:{lines:1,fontSize:60,capHeight:0.686},body:{lines:0,fontSize:30}},pictures:{}});
  const body=frame(laid,'body'),stops=laid.slides[0]!.layers.find(l=>l.type==='image')!.shade!.stops;
  expect(body.y).toBe(template.slides[0]!.layers.find(l=>l.type==='text'&&l.slot==='body')!.y);
  expect(stops[3]!.at*1296).toBeLessThanOrEqual(Math.round(body.y*1350)+0.01);
 });
 it('rejects a stack item the template cannot serve with its key named',()=>{
  expect(()=>layoutDneskaiSlide({...input(),flow:{kind:'stack',anchor:'centre',items:[{key:'missing-picture',gap:0}]}})).toThrow('Flow item missing-picture names no layer');
 });
});
