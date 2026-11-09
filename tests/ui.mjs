import {manualRoute,validateRoute,reversalCount} from '../js/geometry.js';
const orthogonal=pts=>pts.slice(1).every((p,i)=>p[0]===pts[i][0]||p[1]===pts[i][1]);
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const listeners={},elements=[],settings=new Map([['RouteOnDrop',false]]),definitions=[];
const canvasElement={getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},hasPointerCapture:()=>false,addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)};
globalThis.document={body:{append(){}},createElement(){const e={style:{}};elements.push(e);return e;},addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)};
globalThis.window={addEventListener:(name,fn)=>(listeners['window:'+name]??=[]).push(fn)};
globalThis.Path2D=class{constructor(){this.points=[];}moveTo(...p){this.points.push(p);}lineTo(...p){this.points.push(p);}};
globalThis.LiteGraph={};
let nextId=0,begins=0,ends=0,nativePaint=0;
class Node {
 constructor(id,pos,output=false){Object.assign(this,{id,pos,size:[100,60],type:output?'Source':'Target',properties:{},outputs:output?[{name:'out',type:'IMAGE'}]:[],inputs:output?[]:[{name:'in',type:'IMAGE',link:null}]});}
 getConnectionPos(input){return input?[...this.pos]:[this.pos[0]+100,this.pos[1]+30];}
 connect(first,second){const target=second ?? first;if(target.inputs[0].link!==null)delete graph.links[target.inputs[0].link];const l={id:nextId++,origin_id:this.id,origin_slot:0,target_id:target.id,target_slot:0,_pos:[0,0]};graph.links[l.id]=l;target.inputs[0].link=l.id;return l;}
}
const source=new Node(1,[0,100],true),target=new Node(2,[500,300]);
const graph={_nodes:[source,target],links:{},getNodeById:id=>graph._nodes.find(n=>n.id===id),getNodeOnPos:()=>null,beforeChange(){begins++;},afterChange(){ends++;}};
source.graph=target.graph=graph;
const strokes=[],ctx={save(){},restore(){},stroke(){strokes.push(this.strokeStyle);},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},arc(){},fill(){},fillRect(){},strokeRect(){},closePath(){}};
const c={canvas:canvasElement,graph,ds:{scale:1,offset:[0,0]},setDirty(){},renderLink(){nativePaint++;},drawConnections(){for(const l of Object.values(this.graph.links)){const a=this.graph.getNodeById(l.origin_id),b=this.graph.getNodeById(l.target_id);if(a&&b)this.renderLink(ctx,a.getConnectionPos(false),b.getConnectionPos(true),l,false,0,null,0,0);}},getCanvasMenuOptions:()=>[],graph_mouse:[0,0]};
globalThis.__nativeApp={canvas:c,ui:{settings:{addSetting:d=>definitions.push(d)}},extensionManager:{setting:{get:id=>settings.get(id.split('.').at(-1))}},registerExtension(e){this.extension=e;}};
let code=await readFile(new URL('../js/magik_orthogonal_links.js',import.meta.url),'utf8');
code=code.replace('import { app } from "../../scripts/app.js";','const app=globalThis.__nativeApp;').replace(/(["'])\.\/([a-z_]+\.js)\1/g,(_,q,n)=>JSON.stringify(new URL('../js/'+n,import.meta.url).href));
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
__nativeApp.extension.beforeRegisterNodeDef(Node);await __nativeApp.extension.setup();
function event(name,x=0,y=0,extra={}){const e={target:canvasElement,clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of listeners[name]??[]){fn(e);if(e.stopped)break;}return e;}
const menu=text=>c.getCanvasMenuOptions().find(x=>x?.content===text);
const metadata=()=>target.properties.magikOrthogonalRoutes?.[0];
const paint=()=>c.drawConnections(),bulk=menu,previewContext=ctx;
globalThis.__magikApp=__nativeApp;
assert.equal(definitions.length,14);assert(!definitions.some(d=>d.id.endsWith('.Horizontal')));
assert(!menu('Magik Orthogonal Links: cancel drawing'));assert.equal(listeners.contextmenu,undefined);
for(const input of [false,true])for(const extra of [{},{shiftKey:true},{ctrlKey:true}]) {
 const [x,y]=input?target.getConnectionPos(true):source.getConnectionPos(false);
 for(const name of ['pointerdown','pointermove','pointerup'])assert(!event(name,x,y,extra).stopped);
}
assert.equal(Object.keys(graph.links).length,0);
assert(!event('contextmenu',350,250,{button:2}).stopped);
assert(!event('pointercancel',350,250).stopped,'Native pointer cancellation remains native');
for(const key of ['Control','Backspace','Delete','Escape'])assert(!event('keydown',0,0,{key}).stopped);
c.renderLink(ctx,[100,130],[300,200],null);assert.equal(nativePaint,1);
c.renderLink(ctx,[100,130],[300,200],{_dragging:true});assert.equal(nativePaint,2);
// Model only the native handler boundary; this is not a full ComfyUI browser.
let nativeStart=null,nativeDown=0,nativeUp=0;
listeners.pointerdown.push(e=>{if(e.button!==0)return;nativeDown++;if(e.clientX===100&&e.clientY===130)nativeStart='output';if(e.clientX===500&&e.clientY===300)nativeStart='input';});
listeners.pointerup.push(e=>{nativeUp++;const compatible=source.outputs[0].type===target.inputs[0].type;if(compatible&&((nativeStart==='output'&&e.clientX===500&&e.clientY===300)||(nativeStart==='input'&&e.clientX===100&&e.clientY===130)))source.connect(target);nativeStart=null;});
event('pointerdown',100,130);event('pointermove',500,300);event('pointerup',500,300);
assert.equal(nativeDown,1);assert.equal(nativeUp,1);assert.equal(target.inputs[0].link,0);assert(!metadata());
paint();let link=graph.links[0];assert(link.path.points.length>=2);assert(link.path.points.slice(1).every((p,i)=>p[0]===link.path.points[i][0]||p[1]===link.path.points[i][1]));
const old=target.inputs[0].link;target.inputs[0].type='MASK';event('pointerdown',500,300);assert.equal(target.inputs[0].link,old);event('pointerup',100,130);assert.equal(target.inputs[0].link,old);target.inputs[0].type='IMAGE';
event('pointerdown',500,300);assert.equal(target.inputs[0].link,old);event('pointerup',100,130);assert.notEqual(target.inputs[0].link,old);paint();link=graph.links[target.inputs[0].link];
event('pointerdown',100,130);event('pointerup',800,800);assert.equal(Object.keys(graph.links).length,1);assert(!event('contextmenu',800,800,{button:2}).stopped);
assert(!event('pointerdown',800,800).stopped);event('pointerup',800,800);
event('pointerdown',200,130);event('pointerup',200,130);event('pointerdown',300,130);event('pointermove',340,170);event('pointerup',340,170);
assert(metadata());assert.equal(begins,1);assert.equal(ends,1);assert.equal(Object.keys(graph.links).length,1);
paint();const original=structuredClone(metadata()),points=link.path.points;
const corner=points.find(p=>p[0]===340&&p[1]===170);assert(corner);
event('pointerdown',...corner);event('pointermove',360,190);assert(event('keydown',0,0,{key:'Escape'}).stopped);assert.deepEqual(metadata(),original);event('pointerup',360,190);assert.equal(begins,ends);
event('pointerdown',100,130);assert(!event('keydown',0,0,{key:'Delete'}).stopped);event('pointerup',800,800);
const priorPoints=metadata().points.map(p=>[...p]);source.pos[0]+=50;target.pos[0]+=50;
const saved={properties:target.properties};target.onSerialize(saved);
assert.deepEqual(saved.properties.magikOrthogonalRoutes[0].points,priorPoints.map(p=>[p[0]+50,p[1]]));assert.deepEqual(metadata().points,priorPoints);paint();
strokes.length=0;event('pointermove',150,130);paint();assert(strokes.includes('#68d9ff'));
const tooltip=elements.find(e=>e.innerHTML?.includes('<strong>Alt+click:</strong>'));assert.equal(tooltip.style.display,'block');
const beforePin=begins;assert(event('pointerdown',150,130,{altKey:true}).stopped);event('pointerup',150,130,{altKey:true});event('pointermove',900,900);strokes.length=0;paint();assert(strokes.includes('#ffc857'));assert.equal(begins,beforePin);
event('keydown',0,0,{key:'Escape'});strokes.length=0;paint();assert(!strokes.includes('#ffc857'));
metadata().locked=true;paint();const locked=JSON.stringify(metadata());event('pointerdown',390,170);event('pointermove',420,200);event('pointerup',420,200);assert.equal(JSON.stringify(metadata()),locked);
assert(menu('Automatically arrange all nodes'));await menu('Automatically arrange all nodes').callback();assert(target.pos[0]>source.pos[0]);assert.equal(begins,ends);
c.read_only=true;assert(!event('pointerdown',...source.getConnectionPos(false)).stopped);assert(!event('pointerup',...target.getConnectionPos(true)).stopped);c.read_only=false;
// Mandatory waypoint editing and node-over-waypoint conflicts.
{
 const sn=new Node(19200,[30000,10000],true),tn=new Node(19201,[30600,10200]),obstacle=new Node(19202,[30300,10100]);
 graph._nodes.push(sn,tn,obstacle);const link=sn.connect(tn);
 const wp=()=>tn.properties.magikOrthogonalRoutes?.[0]?.waypoints;
 const redraw=()=>{c.drawConnections();return link.path.points;};
 redraw();
 // Model ComfyUI's deep reactive properties: reads wrap newly assigned records.
 const proxies=new WeakMap();
 const reactive=value=>{
   if(!value || typeof value!=='object')return value;
   if(proxies.has(value))return proxies.get(value);
   const proxy=new Proxy(value,{get:(target,key)=>reactive(Reflect.get(target,key))});
   proxies.set(value,proxy);proxies.set(proxy,proxy);return proxy;
 };
 tn.properties=reactive(tn.properties);
 // Drag any segment in one action to create an explicit mandatory point.
 event('pointerdown',30200,10030);event('pointermove',30200,10200);redraw();
 event('pointermove',30200,10225);redraw();event('pointermove',30200,10250);redraw();event('pointerup',30200,10250);
 assert.deepEqual(wp(),[[30200,10250]]);assert(redraw().some(p=>p[0]===30200&&p[1]===10250));
 const before=JSON.parse(JSON.stringify(wp()));
 // Releasing inside a node rejects the edit, preserving the original point.
 event('pointerdown',30200,10250);event('pointermove',30350,10130);event('pointerup',30350,10130);assert.deepEqual(wp(),before);
 // Move through the node to a valid position on its far side in one drag.
 event('pointerdown',30200,10250);event('pointermove',30350,10130);event('pointermove',30500,10100);event('pointerup',30500,10100);
 assert.deepEqual(wp(),[[30500,10100]]);redraw();
 // Moving the node over the waypoint preserves its world coordinates.
 obstacle.pos=[30470,10090];let route=redraw();assert.deepEqual(wp(),[[30500,10100]]);assert(route.some(p=>p[0]===30500&&p[1]===10100));
 let red=false;const nodeContext={...ctx,fill(){if(this.fillStyle==='#ff6262')red=true;}};c.onDrawForeground(nodeContext);assert(red);
 // The covered waypoint remains draggable, even when native body hit-testing
 // says a node is under the pointer.
 const oldHit=graph.getNodeOnPos;graph.getNodeOnPos=()=>obstacle;
 event('pointerdown',30500,10100);event('pointermove',30400,10250);event('pointerup',30400,10250);assert.deepEqual(wp(),[[30400,10250]]);graph.getNodeOnPos=oldHit;
 obstacle.pos=[31000,11000];route=redraw();red=false;c.onDrawForeground(nodeContext);assert(!red);
 // Explicit endpoints move independently of world-space mandatory points.
 sn.pos[0]+=20;tn.pos[0]+=20;redraw();assert.deepEqual(wp(),[[30400,10250]]);
 const saved={properties:tn.properties};tn.graph=graph;tn.onSerialize(saved);assert.deepEqual(saved.properties.magikOrthogonalRoutes[0].waypoints,wp());
 // Copied metadata follows the pasted target once, then stays fixed.
 const pasted=new Node(19203,[tn.pos[0]+100,tn.pos[1]+100]);pasted.graph=graph;pasted.properties=structuredClone(saved.properties);pasted.onConfigure({});graph._nodes.push(pasted);const copiedLink=sn.connect(pasted);
 redraw();assert.deepEqual(pasted.properties.magikOrthogonalRoutes[0].waypoints,[[30500,10350]]);
 redraw();assert.deepEqual(pasted.properties.magikOrthogonalRoutes[0].waypoints,[[30500,10350]]);
 delete graph.links[copiedLink.id];graph._nodes=graph._nodes.filter(n=>n!==pasted);
 // Double-click removes a waypoint; double-click on a line adds one.
 assert(event('dblclick',30400,10250).stopped);assert.deepEqual(wp(),[]);route=redraw();
 const a=route[0],b=route[1],middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
 event('dblclick',...middle);assert.equal(wp().length,1);redraw();
 const original=JSON.parse(JSON.stringify(wp()));event('pointerdown',...wp()[0]);event('pointermove',30280,10400);event('keydown',0,0,{key:'Escape'});assert.deepEqual(wp(),original);event('pointerup',30280,10400);
 // Hover/Delete works without first selecting the connection.
 event('keydown',0,0,{key:'Escape'});event('pointermove',...wp()[0]);event('keydown',0,0,{key:'Delete'});assert.deepEqual(wp(),[]);
 // Shift segment dragging creates two controls, not one automatic bend.
 route=redraw();const vertical=route.findIndex((p,i)=>i<route.length-1 && p[0]===route[i+1][0] && p[1]!==route[i+1][1]);
 const va=route[vertical],vb=route[vertical+1],mx=va[0],my=(va[1]+vb[1])/2;
 event('pointerdown',mx,my,{shiftKey:true});event('pointermove',mx+40,my,{shiftKey:true});event('pointerup',mx+40,my,{shiftKey:true});assert.equal(wp().length,2);redraw();
 const constrained=JSON.stringify(wp());await menu('Automatically route every connection').callback();assert.equal(JSON.stringify(wp()),constrained);
 await menu('Remove every redundant corner').callback();assert.equal(JSON.stringify(wp()),constrained);
 // Removing only the moved waypoint during a merge preserves intervening controls.
 const record=tn.properties.magikOrthogonalRoutes[0];record.waypoints=[[30200,10400],[30400,10500],[30500,10400]];redraw();
 event('pointerdown',30200,10400);event('pointermove',30503,10402);event('pointerup',30503,10402);
 assert.deepEqual(wp(),[[30400,10500],[30500,10400]]);
 // Invalid position is checked again at release if another node moved mid-drag.
 redraw();const stable=JSON.parse(JSON.stringify(wp()));event('pointerdown',30400,10500);event('pointermove',30300,10400);obstacle.pos=[30270,10390];event('pointerup',30300,10400);assert.deepEqual(wp(),stable);
 // Start the invalid-new-point case with no mandatory controls.
 tn.properties.magikOrthogonalRoutes[0].waypoints=[];redraw();
 // A new mandatory point cannot be dropped inside a node either.
 obstacle.pos=[30300,10100];route=redraw();
 event('pointerdown',...route[1]);event('pointermove',30350,10130);event('pointerup',30350,10130);assert.deepEqual(wp(),[]);
 delete graph.links[link.id];graph._nodes=graph._nodes.filter(n=>![sn.id,tn.id,obstacle.id].includes(n.id));
}
console.log('PASS: mandatory drag/add/remove, covered-node conflict rendering, cross-node drag, invalid-drop rollback, fixed world positions and serialization');
// A route drag owns specific endpoint objects, socket objects and metadata.
for(const mutation of ['source-slot','target-slot','source-move','target-move','metadata','target-node'])for(const moved of [false,true]) {
 const sn=new Node(19500,[20000,10000],true),tn=new Node(19501,[20600,10200]);
 graph._nodes.push(sn,tn);const link=sn.connect(0,tn,0);
 c.graph=graph;__magikApp.extensionManager.setting.get=id=>id.endsWith('.RouteOnDrop')?false:undefined;
 c.drawConnections();c.renderLink(ctx,[20100,10030],[20600,10200],link,false,0,null,0,0);
 const originalBefore=graph.beforeChange,originalAfter=graph.afterChange;let starts=0,ends=0;
 graph.beforeChange=()=>starts++;graph.afterChange=()=>ends++;
 event('pointerdown',20200,10030);
 if(moved)event('pointermove',20200,10070);
 let currentTarget=tn,external;
 if(mutation==='source-slot')sn.outputs[0]={...sn.outputs[0]};
 if(mutation==='target-slot')tn.inputs[0]={...tn.inputs[0]};
 if(mutation==='source-move')sn.pos[1]+=20;
 if(mutation==='target-move')tn.pos[1]+=20;
 if(mutation==='metadata') {
  external={signature:'Source|out|in',points:[[20400,10030],[20400,10200]],locked:false};
  (tn.properties.magikOrthogonalRoutes??={})[0]=external;
 }
 if(mutation==='target-node') {
  currentTarget=new Node(tn.id,[...tn.pos]);currentTarget.inputs[0].link=link.id;
  external={signature:'Source|out|in',points:[[20450,10030],[20450,10200]],locked:false};
  currentTarget.properties.magikOrthogonalRoutes={0:external};graph._nodes=graph._nodes.map(n=>n===tn?currentTarget:n);
 }
 event('pointermove',20200,10090);event('pointerup',20200,10090);
 assert.equal(starts,moved?1:0,mutation);assert.equal(ends,starts,mutation);
 assert.equal(currentTarget.properties.magikOrthogonalRoutes?.[0],external,mutation);
 graph.beforeChange=originalBefore;graph.afterChange=originalAfter;
 delete graph.links[link.id];graph._nodes=graph._nodes.filter(n=>n.id!==sn.id && n.id!==tn.id);
}
// Undo completion may synchronously trigger blur; close the gesture first.
{
 const sn=new Node(19600,[22000,10000],true),tn=new Node(19601,[22600,10200]);
 graph._nodes.push(sn,tn);const link=sn.connect(0,tn,0);
 c.drawConnections();c.renderLink(ctx,[22100,10030],[22600,10200],link,false,0,null,0,0);
 const before=graph.beforeChange,after=graph.afterChange;let starts=0,ends=0;
 graph.beforeChange=()=>starts++;graph.afterChange=()=>{ends++;assert(ends<=1);event('window:blur',0,0);};
 event('pointerdown',22200,10030);event('pointermove',22200,10070);event('pointerup',22200,10070);
 assert.equal(starts,1);assert.equal(ends,1);assert(tn.properties.magikOrthogonalRoutes?.[0]);
 graph.beforeChange=before;graph.afterChange=after;
 delete graph.links[link.id];graph._nodes=graph._nodes.filter(n=>n!==sn && n!==tn);
}
console.log('PASS: route drag invalidation on replaced sockets/nodes/metadata and moved endpoints');

// Node arrangement menu integration: selection scope, pinned nodes and undo.
{
 const priorGraph=c.graph,priorSelection=c.selectedItems,priorLegacy=c.selected_nodes;
 const nodes=[new Node(29000,[100,100]),new Node(29001,[500,500]),new Node(29002,[100,250]),new Node(29003,[800,900])];
 nodes[2].flags={pinned:true};
 let begins=0,ends=0;
 const layoutGraph={_nodes:nodes,links:{},getNodeById:id=>nodes.find(n=>n.id===id),beforeChange(){begins++;},afterChange(){ends++;}};
 c.graph=layoutGraph;c.selectedItems=new Set([nodes[0],nodes[1],nodes[2]]);c.selected_nodes={};
 const fixedBefore=nodes.slice(2).map(n=>[...n.pos]);
 await bulk('Automatically arrange selected nodes').callback();
 assert.equal(begins,1);assert.equal(ends,1);assert.equal(nodes[0].pos[0],nodes[1].pos[0]);
 assert.deepEqual(nodes.slice(2).map(n=>[...n.pos]),fixedBefore);
 const stable=nodes.map(n=>[...n.pos]);await bulk('Automatically arrange selected nodes').callback();assert.deepEqual(nodes.map(n=>[...n.pos]),stable);
 assert.equal(begins,1,'Unchanged layout creates no undo transaction');
 c.selectedItems=new Set();c.selected_nodes=new Map([[nodes[1].id,nodes[1]]]);
 assert.equal(bulk('Automatically arrange selected nodes').disabled,false);
 c.selected_nodes={};assert.equal(bulk('Automatically arrange selected nodes').disabled,true);
 await bulk('Automatically arrange all nodes').callback();
 assert.equal(nodes[3].pos[0],nodes[0].pos[0]);assert.deepEqual(nodes[2].pos,fixedBefore[0]);
 c.read_only=true;const beforeReadOnly=nodes.map(n=>[...n.pos]);
 assert(bulk('Automatically arrange all nodes').disabled);await bulk('Automatically arrange all nodes').callback();assert.deepEqual(nodes.map(n=>[...n.pos]),beforeReadOnly);c.read_only=false;
 // A synchronous undo hook invalidates the plan before any layout writes.
 nodes[1].pos=[500,500];const beforeHook=nodes.map(n=>[...n.pos]);
 layoutGraph.beforeChange=()=>{begins++;nodes[3].pos[0]++;};
 await bulk('Automatically arrange all nodes').callback();
 assert.deepEqual(nodes[0].pos,beforeHook[0]);assert.deepEqual(nodes[1].pos,beforeHook[1]);assert.equal(nodes[3].pos[0],beforeHook[3][0]+1);
 c.graph=priorGraph;c.selectedItems=priorSelection;c.selected_nodes=priorLegacy;
}
// Layout reroutes affected unlocked links and preserves locked route metadata.
{
 const prior=c.graph;
 const sn=new Node(29100,[700,300],true),tn=new Node(29101,[100,100]),lockedNode=new Node(29102,[120,500]);
 const nodes=[sn,tn,lockedNode],first={id:91001,origin_id:sn.id,origin_slot:0,target_id:tn.id,target_slot:0},second={id:91002,origin_id:sn.id,origin_slot:0,target_id:lockedNode.id,target_slot:0};
 tn.inputs[0].link=first.id;lockedNode.inputs[0].link=second.id;
 lockedNode.properties.magikOrthogonalRoutes={0:{signature:'Source|out|in',points:[[824,330],[824,500],[96,500]],locked:true}};
 const candidate={_nodes:nodes,links:{[first.id]:first,[second.id]:second},getNodeById:id=>nodes.find(n=>n.id===id),beforeChange(){},afterChange(){}};
 c.graph=candidate;c.drawConnections();
 c.renderLink(ctx,sn.getConnectionPos(false),tn.getConnectionPos(true),first,false,0,null,0,0);
 c.renderLink(ctx,sn.getConnectionPos(false),lockedNode.getConnectionPos(true),second,false,0,null,0,0);
 const lockedBefore=JSON.stringify(lockedNode.properties.magikOrthogonalRoutes);
 await bulk('Automatically arrange all nodes').callback();
 assert(tn.pos[0]>sn.pos[0]);assert(tn.properties.magikOrthogonalRoutes?.[0],'Affected unlocked route was recalculated');
 assert.equal(JSON.stringify(lockedNode.properties.magikOrthogonalRoutes),lockedBefore);
 c.graph=prior;
}

console.log('PASS: native socket gesture pass-through, previews, both-direction native-handler stand-in, occupied/incompatible input behavior, native menus, editing/cancel/undo, serialization, highlighting/tooltip, locked routes and layout');
