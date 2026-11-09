import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathVisible,viewportBounds} from '../js/viewport.js';
let allocations=0,nativeCalls=0,fallbackCalls=0,dirtyCalls=0;
globalThis.Path2D=class{constructor(){allocations++;this.points=[];}moveTo(x,y){this.points.push([x,y]);}lineTo(x,y){this.points.push([x,y]);}};
const frames=[];globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
globalThis.document={body:{append(){}},addEventListener(){},createElement:()=>({style:{}})};
globalThis.window={addEventListener(){}};globalThis.LiteGraph={};
const widths=[],states=[];
const ctx={globalAlpha:0.8,save(){states.push(this.globalAlpha);},restore(){this.globalAlpha=states.pop();},stroke(){widths.push(this.lineWidth);},setLineDash(){}};
function makeGraph(a,b,{locked=false,corners=null,count=1}={}){
 const source={id:1,type:'Source',pos:[a[0]-100,a[1]-30],size:[100,60],properties:{},inputs:[],outputs:[{name:'out'}],getConnectionPos(){return [...a];},getBounding(){return [...this.pos,100,60];}};
 const target={id:2,type:'Target',pos:[...b],size:[100,60],properties:{},inputs:[],outputs:[],getConnectionPos(){return [...b];},getBounding(){return [...this.pos,100,60];}};
 const links={};
 for(let id=0;id<count;id++){
  target.inputs.push({name:'in',link:id});links[id]={id,origin_id:1,origin_slot:0,target_id:2,target_slot:id,_pos:[0,0]};
  if(locked || corners)(target.properties.magikOrthogonalRoutes ??= {})[id]={signature:'Source|out|in',points:corners??[],locked};
 }
 return {_nodes:[source,target],links,getNodeById:id=>id===1?source:id===2?target:null};
}
let enabled=true,flowArrows=false,hideArrowsOnLocked=false,arrowDesign="Chevron";
let beforeNative=null,afterNative=null;
const c={canvas:{},graph:makeGraph([0,50],[100,50]),visible_area:[0,0,100,100],ds:{scale:1},renderedPaths:new Set(),setDirty(){dirtyCalls++;},renderLink(){fallbackCalls++;},
 // Minimal frontend 1.55.18 fixture: native pre-cull, normal paint, rendered
 // registry and execution pulse. Full upstream Vue/link-store setup is absent.
 _renderAllLinkSegments(ctx,link,a,b,reroutes,seen,now,startDir,endDir,disabled=false,startsAtBadge=false){
  nativeCalls++;
  if(!pathVisible([a,b],viewportBounds(this.visible_area),20) || link._dragging)return;
  this.renderLink(ctx,a,b,link,false,0,null,startDir,endDir,{disabled});this.renderedPaths.add(link);
 },
 drawConnections(){this.renderedPaths.clear();beforeNative?.();for(const link of Object.values(this.graph.links)){this._renderAllLinkSegments(ctx,link,this.graph.getNodeById(1).getConnectionPos(),this.graph.getNodeById(2).getConnectionPos(),[],new Set(),200,undefined,undefined);afterNative?.(link);}}
};
// Optional verification against the supplied frontend's actual method body.
// The source runner strips only its two local TypeScript annotations.
if(process.env.MAGIK_NATIVE_SEGMENTS){
 const margin=[0,0,0,0];
 const overlaps=(a,b)=>a[0]<=b[0]+b[2] && a[0]+a[2]>=b[0] && a[1]<=b[1]+b[3] && a[1]+a[3]>=b[1];
 const original=new Function('LLink','overlapBounding','link_bounding','margin_area','LinkDirection','return ('+await readFile(process.env.MAGIK_NATIVE_SEGMENTS,'utf8')+')')({getReroutes:()=>[]},overlaps,[0,0,0,0],margin,{RIGHT:4,LEFT:3,CENTER:0});
 c._renderAllLinkSegments=function(ctx,link,a,b,reroutes,seen,now,startDir,endDir,disabled=false,startsAtBadge=false){
  nativeCalls++;
  const v=this.visible_area??[-1e9,-1e9,2e9,2e9];margin[0]=v[0]-20;margin[1]=v[1]-20;margin[2]=v[2]+40;margin[3]=v[3]+40;
  return original.apply(this,arguments);
 };
}
globalThis.__viewportApp={canvas:c,ui:{settings:{addSetting(){}}},extensionManager:{setting:{get:id=>id.endsWith('.Enabled')?enabled:id.endsWith('.FlowArrows')?flowArrows:id.endsWith('.HideArrowsOnLocked')?hideArrowsOnLocked:id.endsWith('.ArrowDesign')?arrowDesign:undefined}},registerExtension(e){this.extension=e;}};
let code=await readFile(new URL('../js/magik_orthogonal_links.js',import.meta.url),'utf8');
code=code.replace('import { app } from "../../scripts/app.js";','const app=globalThis.__viewportApp;').replace(/(["'])\.\/([a-z_]+\.js)\1/g,(_,q,n)=>JSON.stringify(new URL('../js/'+n,import.meta.url).href));
if(process.env.MAGIK_CHECK_PLANNING){
 assert(code.includes('const livePaths=new Map();'));
 code=code.replace('const livePaths=new Map();','const livePaths=new Map();globalThis.__planningState=()=>({livePaths,planned:previousPlanned});');
}
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));await __viewportApp.extension.setup();
c.drawConnections();assert.equal(nativeCalls,1);assert(widths.length);
c.graph=makeGraph([50,140],[60,160]);nativeCalls=0;widths.length=0;
c.drawConnections();assert.equal(nativeCalls,0);assert(widths.length,'Visible automatic detour survives native endpoint pre-culling');assert(c.graph.links[0].path.points.some(p=>p[1]<100));assert(c.renderedPaths.has(c.graph.links[0]));
// Preserve the execution pulse and alpha when recovering a native-culled link.
c.graph.links[0]._last_time=100;widths.length=0;c.drawConnections();assert.equal(widths.length,2);assert.equal(ctx.globalAlpha,0.8);
c.graph=makeGraph([50,1140],[60,1160],{locked:true});allocations=0;widths.length=0;
c.drawConnections();assert.equal(widths.length,0);assert.equal(allocations,0);assert.equal(frames.length,0);assert.equal(c.renderedPaths.size,0);
c.graph=makeGraph([-50,-50],[-50,150],{locked:true,corners:[[-26,-50],[150,-50],[150,150],[-74,150]]});
c.drawConnections();assert.equal(widths.length,0);assert.equal(frames.length,0,'An enclosing but invisible route must not animate');
c.graph=makeGraph([50,1140],[60,1160],{locked:true});
c.visible_area=[0,1000,100,200];c.drawConnections();assert(widths.length);assert.equal(frames.length,1);
c.visible_area=[0,0,100,100];widths.length=0;c.drawConnections();const beforeDirty=dirtyCalls;frames.shift()(500);assert.equal(dirtyCalls,beforeDirty);assert.equal(frames.length,0);assert.equal(widths.length,0);
c.graph=makeGraph([-200,-20],[200,-20],{count:20});widths.length=0;c.drawConnections();assert(widths.includes(60),'A visible widened lane must not disappear');
c.graph=makeGraph([-200,-20],[200,-20]);widths.length=0;c.drawConnections();assert.equal(widths.length,0);
// The native renderer/other extensions may edit records after preparation.
c.graph=makeGraph([50,1140],[60,1160],{locked:true});widths.length=0;
beforeNative=()=>{c.graph.getNodeById(2).properties.magikOrthogonalRoutes[0].points=[[74,1140],[74,50],[36,50],[36,1160]];};
c.drawConnections();assert(widths.length,'An in-place corner edit after preparation must enter view immediately');beforeNative=null;
c.graph=makeGraph([50,1140],[60,1160]);widths.length=0;
beforeNative=()=>{c.graph.getNodeById(2).properties.magikOrthogonalRoutes={0:{signature:'Source|out|in',points:[[74,1140],[74,50],[36,50],[36,1160]]}};};
c.drawConnections();assert(widths.length,'A newly stored route after preparation must be observed');beforeNative=null;
c.graph=makeGraph([50,140],[60,160],{corners:[[74,140],[74,250],[36,250],[36,160]]});widths.length=0;
beforeNative=()=>{delete c.graph.getNodeById(2).properties.magikOrthogonalRoutes;};
c.drawConnections();assert(widths.length,'A reset after preparation must recover the visible automatic detour');beforeNative=null;
for(const mutate of [
 ()=>{c.graph.getNodeById(1).type='RenamedSource';},
 ()=>{c.graph.getNodeById(1).outputs[0].name='renamed-output';},
 ()=>{c.graph.getNodeById(2).inputs[0].name='renamed-input';},
 ()=>{c.graph.getNodeById(2).properties.magikOrthogonalRoutes[0].signature='invalid';},
]){
 c.graph=makeGraph([50,140],[60,160],{corners:[[74,140],[74,250],[36,250],[36,160]]});widths.length=0;
 beforeNative=mutate;c.drawConnections();assert(widths.length,'Schema changes after preparation must invalidate a manual route immediately');beforeNative=null;
}
// Custom object-valued names cannot use a primitive-name signature cache.
let customName='out';
c.graph=makeGraph([50,140],[60,160],{corners:[[74,140],[74,250],[36,250],[36,160]]});
c.graph.getNodeById(1).outputs[0].name={toString:()=>customName};widths.length=0;
beforeNative=()=>{customName='changed';};c.drawConnections();assert(widths.length);beforeNative=null;
c.graph=makeGraph([50,1140],[60,1160],{count:2});widths.length=0;
afterNative=()=>{c.visible_area[1]=1000;c.visible_area[3]=200;};
c.drawConnections();assert(widths.length,'An in-place viewport change during painting invalidates the viewport cache');afterNative=null;c.visible_area=[0,0,100,100];
// Special native paths keep their original entry point.
c.graph=makeGraph([50,1140],[60,1160]);c.graph.links[0].parentId=99;nativeCalls=0;c.drawConnections();assert.equal(nativeCalls,1);
c.graph=makeGraph([50,1140],[60,1160]);c.subgraph={};nativeCalls=0;c.drawConnections();assert.equal(nativeCalls,1);delete c.subgraph;
c.graph=makeGraph([50,1140],[60,1160]);c.graph.links[0]._dragging=true;nativeCalls=0;c.drawConnections();assert.equal(nativeCalls,1);
c.graph=makeGraph([50,1140],[60,1160]);c.graph.floatingLinks=new Map([[0,c.graph.links[0]]]);nativeCalls=0;c.drawConnections();assert.equal(nativeCalls,1);
c.graph=makeGraph([50,1140],[60,1160]);nativeCalls=0;
beforeNative=()=>c._renderAllLinkSegments(ctx,c.graph.links[0],[50,1140],[60,1160],[],new Set(),200,undefined,undefined,false,true);
c.drawConnections();assert.equal(nativeCalls,1,'Badge rendering stays native');beforeNative=null;
c.graph=makeGraph([50,1140],[60,1160]);widths.length=0;c.ds.scale=Infinity;c.drawConnections();assert(widths.length,'Invalid scales fail open before broad culling');c.ds.scale=1;
c.visible_area=undefined;c.drawConnections();assert(widths.length,'Missing viewport fails open');
enabled=false;fallbackCalls=0;c.drawConnections();assert(fallbackCalls,'Disabled extension uses native renderer');
if(process.env.MAGIK_CHECK_PLANNING){
 enabled=true;c.graph=makeGraph([0,50],[100,50]);c.drawConnections();
 const first=__planningState().planned[0];c.drawConnections();assert.equal(__planningState().planned[0],first,'Stable planning reuses records');
 const transient={...c.graph.links[0],id:999};c.renderLink(ctx,[0,50],[100,50],transient,false,0,null,0,0);
 assert(__planningState().livePaths.has(999));c.drawConnections();assert(!__planningState().livePaths.has(999),'Paint-only cache entries must be pruned even with unchanged planned IDs');
 beforeNative=()=>{c.renderLink(ctx,[0,50],[100,50],transient,false,0,null,0,0);throw Error('injected paint interruption');};
 assert.throws(()=>c.drawConnections(),/injected paint interruption/);assert(__planningState().livePaths.has(999));beforeNative=null;
 c.drawConnections();assert(!__planningState().livePaths.has(999),'Interrupted paint must preserve pending cache cleanup');
 delete c.graph.links[0];c.graph.getNodeById(2).inputs[0].link=null;c.drawConnections();assert.equal(__planningState().livePaths.size,0);
 c.graph=makeGraph([0,50],[100,50],{count:2});c.graph.links[0].parentId=99;c.drawConnections();
 assert.equal(__planningState().livePaths.size,1);
 c.renderLink(ctx,[0,50],[100,50],{...c.graph.links[1],id:999},false,0,null,0,0);
 assert.equal(__planningState().livePaths.size,__planningState().planned.length,'Equal cache/planned sizes alone cannot prove equal membership');
 c.drawConnections();assert(!__planningState().livePaths.has(999));assert(__planningState().livePaths.has(1));
 c.graph=makeGraph([50,140],[60,160]);c.drawConnections();assert.deepEqual([...__planningState().livePaths.keys()],[0]);
 enabled=false;c.drawConnections();assert.equal(__planningState().livePaths.size,0);
 enabled=true;c.drawConnections();assert.equal(__planningState().livePaths.size,1);
 delete globalThis.__planningState;
 console.log('PASS: stable planning identity, transient cache additions, deletion, native-chain size ambiguity, workflow switching and disable/re-enable cleanup.');
}
// Arrow settings reach the real render wrapper, including glyph-only viewport edges.
enabled=true;
c.visible_area=[0,0,100,100];c.graph=makeGraph([-200,-4],[200,-4]);
flowArrows=false;widths.length=0;c.drawConnections();assert.equal(widths.length,0);
let glyphs=0,fills=0;
Object.assign(ctx,{beginPath(){glyphs++;},moveTo(){},lineTo(){},closePath(){},fill(){fills++;}});
flowArrows=true;
for(const design of ['Chevron','Triangle','Open arrow','Double chevron']) {
 arrowDesign=design;glyphs=0;fills=0;c.drawConnections();assert(glyphs>0,design);
 assert.equal(fills>0,design==='Triangle');
}
flowArrows=false;glyphs=0;c.drawConnections();assert.equal(glyphs,0);
// Locked styling must not suppress directional arrows.
c.graph=makeGraph([0,50],[400,50],{locked:true});flowArrows=true;glyphs=0;c.drawConnections();assert(glyphs>0);
hideArrowsOnLocked=true;glyphs=0;c.drawConnections();assert.equal(glyphs,0);
c.graph.getNodeById(2).properties.magikOrthogonalRoutes[0].locked=false;
glyphs=0;c.drawConnections();assert(glyphs>0,'Unlocked routes retain arrows when hide-on-locked is enabled');
c.graph.getNodeById(2).properties.magikOrthogonalRoutes[0].locked=true;
hideArrowsOnLocked=false;glyphs=0;c.drawConnections();assert(glyphs>0);
flowArrows=false;hideArrowsOnLocked=true;glyphs=0;c.drawConnections();assert.equal(glyphs,0);
hideArrowsOnLocked=false;

flowArrows=false;
console.log('PASS: native pre-cull recovery, crossing detours, execution pulses/alpha, off-screen allocations, pan/animation, shared lane widths, missing viewport and disabled fallback.');
