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
 it('rejects a stack item the template cannot serve with its key named',()=>{
  expect(()=>layoutDneskaiSlide({...input(),flow:{kind:'stack',anchor:'centre',items:[{key:'missing-picture',gap:0}]}})).toThrow('Flow item missing-picture names no layer');
 });
});
