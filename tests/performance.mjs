// Synthetic canvas preparation benchmark; no browser paint/GPU timing.
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
const count=Number(process.argv[2]??500),source=process.argv[3] && !process.argv[3].startsWith('--') && process.argv[3]!=='-'?new URL(process.argv[3],'file://'+process.cwd()+'/'):new URL('../js/magik_orthogonal_links.js',import.meta.url);
let paths=0;globalThis.Path2D=class {constructor(){paths++;this.points=[];}moveTo(x,y){this.points.push([x,y]);}lineTo(x,y){this.points.push([x,y]);}};
const ctx=new Proxy({save(){},restore(){},stroke(){},setLineDash(){},globalAlpha:1},{get:(o,k)=>o[k]??(()=>{})});
const dense=process.argv.includes('--dense');
const nodes=[],nodeMap=new Map(),links={};
const commonTarget={id:count*2+1,pos:[400,0],size:[100,60],properties:{},type:'Target',outputs:[],inputs:[],getConnectionPos(){return [400,30];}};
for(let i=0;i<count;i++) {
 const y=i*160;
 const a={id:i*2,pos:[0,y],size:[100,60],properties:{},type:'Source',outputs:[{name:'out'}],inputs:[],getConnectionPos(){return [100,this.pos[1]+30];}};
 const b={id:i*2+1,pos:[400,y],size:[100,60],properties:{},type:'Target',outputs:[],inputs:[{name:'in',link:i}],getConnectionPos(){return [400,this.pos[1]+30];}};
 nodes.push(a);nodeMap.set(a.id,a);
 if(dense)commonTarget.inputs.push({name:'in_'+i,link:i});else {nodes.push(b);nodeMap.set(b.id,b);}
 links[i]={id:i,origin_id:a.id,origin_slot:0,target_id:dense?commonTarget.id:b.id,target_slot:dense?i:0,_pos:[0,0]};
}
if(dense){nodes.push(commonTarget);nodeMap.set(commonTarget.id,commonTarget);}
const remote={id:count*2,pos:[2000,2000],size:[100,60],properties:{},inputs:[],outputs:[]};nodes.push(remote);nodeMap.set(remote.id,remote);
const graph={_nodes:nodes,links,getNodeById:id=>nodeMap.get(id)};
if(process.argv.includes('--manual'))for(const l of Object.values(links)){
 const a=nodeMap.get(l.origin_id).getConnectionPos(),b=nodeMap.get(l.target_id).getConnectionPos(),target=nodeMap.get(l.target_id);
 (target.properties.magikOrthogonalRoutes ??= {})[l.target_slot]={signature:`Source|out|${target.inputs[l.target_slot].name}`,points:[[180,a[1]],[180,a[1]+40],[280,a[1]+40],[280,b[1]]],pins:[]};
}
const canvas={canvas:{},graph,ds:{scale:1},setDirty(){},renderLink(){},drawConnections(){for(const l of Object.values(this.graph.links))this.renderLink(ctx,this.graph.getNodeById(l.origin_id).getConnectionPos(),this.graph.getNodeById(l.target_id).getConnectionPos(),l,process.argv.includes('--skip-border'),0,undefined,undefined,undefined,{disabled:process.argv.includes('--disabled') && l.id%2===0});}};
if(process.argv.includes('--viewport')){
 canvas.visible_area=[0,0,600,600];canvas.renderedPaths=new Set();
 canvas._renderAllLinkSegments=function(ctx,link,a,b,reroutes,seen,now,startDir,endDir){
  const [x,y,w,h]=this.visible_area;
  if(Math.min(a[0],b[0])>x+w+20 || Math.max(a[0],b[0])<x-20 || Math.min(a[1],b[1])>y+h+20 || Math.max(a[1],b[1])<y-20)return;
  this.renderLink(ctx,a,b,link,false,0,null,startDir,endDir);
 };
 canvas.drawConnections=function(){for(const l of Object.values(this.graph.links))this._renderAllLinkSegments(ctx,l,this.graph.getNodeById(l.origin_id).getConnectionPos(),this.graph.getNodeById(l.target_id).getConnectionPos(),[],null,200,undefined,undefined);};
}
if(process.argv.includes('--border'))canvas.render_connections_border=true;
const paintHash=process.argv.includes('--paint-check')?createHash('sha256'):null;
if(paintHash){
 const states=[];Object.assign(ctx,{strokeStyle:'#000',lineWidth:1,lineCap:'butt',globalAlpha:1,lineDashOffset:0,_dash:[]});
 ctx.save=function(){states.push({strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,lineCap:this.lineCap,globalAlpha:this.globalAlpha,lineDashOffset:this.lineDashOffset,_dash:this._dash});};
 ctx.restore=function(){Object.assign(this,states.pop());};
 ctx.setLineDash=function(dash){this._dash=[...dash];};
 ctx.stroke=function(path){paintHash.update(JSON.stringify([path.points,this.strokeStyle,this.lineWidth,this.globalAlpha,this._dash,this.lineDashOffset,this.lineCap]));};
 canvas.highlighted_links={3:true};for(const link of Object.values(links))link.color=['#f00','#0f0','#00f'][link.id%3];
}
const listeners=new Map();
globalThis.document={body:{append(){}},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},createElement:()=>({style:{}})};
globalThis.window={addEventListener(){}};
globalThis.__perfApp={canvas,ui:{settings:{addSetting(){}}},extensionManager:{setting:{get(){}}},registerExtension(e){this.extension=e;}};
let code=await readFile(source,'utf8');code=code.replace('import { app } from "../../scripts/app.js";','const app=globalThis.__perfApp;').replace(/(["'])\.\/([a-z_]+\.js)\1/g,(_,q,n)=>JSON.stringify(process.env.MAGIK_BENCH_HELPERS && existsSync(new URL(n,'file://'+process.env.MAGIK_BENCH_HELPERS+'/'))?new URL(n,'file://'+process.env.MAGIK_BENCH_HELPERS+'/').href:new URL('../js/'+n,import.meta.url).href));
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));await __perfApp.extension.setup();
if(process.argv.includes('--memory')){
 if(!globalThis.gc)throw Error('Run memory soak with node --expose-gc');
 const retired=[],samples=[];
 let enabled=true;
 __perfApp.extensionManager.setting.get=id=>id.endsWith('.Enabled')?enabled:undefined;
 const makeGraph=()=>{
  const ns=[],ls={},map=new Map();
  for(let i=0;i<count;i++){
   const a={id:i*2,pos:[0,i*160],size:[100,60],type:'Source',properties:{},inputs:[],outputs:[{name:'out'}],getConnectionPos(){return [100,this.pos[1]+30];}};
   const b={id:i*2+1,pos:[400,i*160],size:[100,60],type:'Target',properties:{magikOrthogonalRoutes:{0:{signature:'Source|out|in',points:[[180,i*160+30],[180,i*160+70],[280,i*160+70],[280,i*160+30]]}}},inputs:[{name:'in',link:i}],outputs:[],getConnectionPos(){return [400,this.pos[1]+30];}};
   ns.push(a,b);map.set(a.id,a);map.set(b.id,b);ls[i]={id:i,origin_id:a.id,origin_slot:0,target_id:b.id,target_slot:0,_pos:[0,0]};
  }
  return {_nodes:ns,links:ls,getNodeById:id=>map.get(id)};
 };
 for(let cycle=0;cycle<120;cycle++){
  canvas.graph=makeGraph();
  retired.push(new WeakRef(canvas.graph),new WeakRef(canvas.graph.links[0]));
  canvas.drawConnections();canvas.drawConnections();
  if(canvas.graph.links[0].path.points.length<4)throw Error('Memory soak must exercise manual routes');
  for(const n of canvas.graph._nodes)if(n.inputs.length)n.properties.magikOrthogonalRoutes[0].points[1][1]+=8;
  canvas.drawConnections();
  for(const n of canvas.graph._nodes)if(n.inputs.length && n.id%4===1)delete n.properties.magikOrthogonalRoutes;
  for(const [id,l] of Object.entries(canvas.graph.links))if(Number(id)%5===0){canvas.graph.getNodeById(l.target_id).inputs[0].link=null;delete canvas.graph.links[id];}
  canvas.drawConnections();
  enabled=false;canvas.drawConnections();enabled=true;canvas.drawConnections();
  if(cycle%10===9){await new Promise(setImmediate);gc();samples.push({cycle:cycle+1,...process.memoryUsage()});}
 }
 canvas.graph={_nodes:[],links:{},getNodeById(){}};canvas.drawConnections();
 await new Promise(setImmediate);gc();await new Promise(setImmediate);gc();
 const retained=retired.filter(ref=>ref.deref()).length;
 console.log(JSON.stringify({cycles:120,linksPerWorkflow:count,retiredObjects:retired.length,retained,samples,final:process.memoryUsage()},null,2));
 if(retained)throw Error('Retired workflow/link objects remain reachable after collection');
 process.exit(0);
}
const measure=fn=>{const start=performance.now();fn();return performance.now()-start;};
const hash=createHash('sha256');
const recordGeometry=()=>hash.update(JSON.stringify(Object.values(links).map(link=>link.path?.points ?? null)));
const cold=measure(()=>canvas.drawConnections());recordGeometry();
if(process.argv.includes('--manual') && !dense && links[0].path.points.length<4)throw Error('Manual benchmark routes were not recognized');
const steady=process.argv.includes('--steady');
if(steady)for(let i=0;i<60;i++)canvas.drawConnections();
const warm=[],moving=[];paths=0;
for(let i=0;i<(steady?60:12);i++)warm.push(measure(()=>canvas.drawConnections()));
const warmPaths=paths;recordGeometry();paths=0;
for(let i=0;i<5;i++){remote.pos[0]++;moving.push(measure(()=>canvas.drawConnections()));}
recordGeometry();const movingPaths=paths;const local=[];paths=0;remote.pos=[dense?135:240,10];
for(let i=0;i<(steady?30:3);i++){remote.pos[1]=(i%3)*160+10;local.push(measure(()=>canvas.drawConnections()));recordGeometry();}
const localPaths=paths;
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
let batchMs=null,batchRoutes=null,batchGeometryHash=null;
if(process.argv.includes('--worker'))globalThis.Worker=class {
 constructor(entry){this.worker=new NodeWorker(new URL('./worker-runner.mjs',import.meta.url),{workerData:{entry:entry.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
 postMessage(data){this.worker.postMessage(data);}
 terminate(){return this.worker.terminate();}
};
if(process.argv.includes('--route')){
 remote.pos=[2000,2000];
 const action=canvas.getCanvasMenuOptions().find(item=>item?.content==='Automatically route every connection');
 const begin=performance.now(),pending=action.callback();
 const cancelTimer=process.argv.includes('--cancel')?setTimeout(()=>{for(const fn of listeners.get('keydown')??[])fn({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});},60):null;
 await pending;if(cancelTimer!==null)clearTimeout(cancelTimer);batchMs=performance.now()-begin;
 batchRoutes=Object.values(links).filter(link=>nodeMap.get(link.target_id).properties.magikOrthogonalRoutes?.[link.target_slot]).length;
 if(process.argv.includes('--cancel')?batchRoutes!==0:batchRoutes!==count)throw Error('Unexpected automatic routing commit count');
 if(batchRoutes===count)batchGeometryHash=createHash('sha256').update(JSON.stringify(Object.values(links).map(link=>nodeMap.get(link.target_id).properties.magikOrthogonalRoutes[link.target_slot].points))).digest('hex');
}
console.log(JSON.stringify({paintHash:paintHash?.digest('hex')??null,dense,worker:process.argv.includes('--worker'),batchMs,batchRoutes,batchGeometryHash,nodes:nodes.length,links:count,coldMs:cold,staticMedianMs:median(warm),remoteMoveMedianMs:median(moving),staticPathAllocations:warmPaths,movingPathAllocations:movingPaths,localMoveMedianMs:median(local),localPathAllocations:localPaths,geometryHash:hash.digest('hex')}));
export {canvas,graph,links,remote};
