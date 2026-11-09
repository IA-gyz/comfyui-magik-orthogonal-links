import './libavoid.mjs';
import assert from 'node:assert/strict';
import {AvoidLib} from '../js/vendor/libavoid/index.js';
import {NativeRoutingScene,routeSharedLibavoid,disposeSharedLibavoid} from '../js/libavoid_scene.js';
import {validateRoute} from '../js/geometry.js';
const A=AvoidLib.getInstance();
const nodes=[{id:1,rect:[-10,-10,110,110]},{id:2,rect:[390,-10,510,110]},{id:3,rect:[200,-20,300,120]}];
const connections=[{id:10,a:[100,20],b:[400,20],sourceId:1,targetId:2},{id:11,a:[100,80],b:[400,80],sourceId:1,targetId:2}];
const options={strictAvoidance:true,laneDistance:10,preferences:{}};
const scene=new NativeRoutingScene(A);
try {
 const first=scene.route({nodes,connections,options});assert.equal(first.stats.transactions,1);assert.equal(first.stats.createdShapes,3);assert.equal(first.stats.createdConnections,2);
 for(const c of connections)assert.equal(validateRoute(first.paths.get(c.id),nodes.map(n=>n.rect),{exemptStart:[nodes[0].rect],exemptEnd:[nodes[1].rect]}).nodeHits,0);
 const moved=nodes.map(n=>n.id===3?{...n,rect:[200,150,300,250]}:n);
 const second=scene.route({nodes:moved,connections,options});assert.equal(second.stats.movedShapes,1);assert.equal(second.stats.createdShapes,0);assert.equal(second.stats.reusedConnections,2);assert.equal(second.stats.createdConnections,0);
 assert.notDeepEqual(first.paths.get(10),second.paths.get(10));
 const changed=connections.map(c=>c.id===10?{...c,a:[100,30]}:c);
 const third=scene.route({nodes:moved,connections:changed,options});assert.equal(third.stats.updatedConnections,1);assert.equal(third.stats.reusedConnections,1);
 const fourth=scene.route({nodes:moved.slice(0,2),connections:[changed[0]],options});assert.equal(fourth.stats.removedConnections,1);assert.equal(fourth.stats.removedShapes,1);
 const resized=moved.slice(0,2).map(n=>n.id===1?{...n,rect:[-10,-10,130,110]}:n);
 const fifth=scene.route({nodes:resized,connections:[changed[0]],options});assert.equal(fifth.stats.movedShapes,1);assert.equal(fifth.stats.updatedConnections,1);
 const emptied=scene.route({nodes:[resized[1]],connections:[],options});assert.equal(emptied.stats.removedConnections,1);assert.equal(emptied.stats.removedShapes,1);assert.equal(emptied.paths.size,0);
}finally {scene.dispose();}
const fixed={id:99,origin:[0,200],points:[[0,200],[500,200]]},fixedBefore=JSON.stringify(fixed);
const snapshot={sceneId:'test',nodes,connections,options,references:[fixed]};
const first=await routeSharedLibavoid(snapshot,A);assert.equal(first.results.length,2);assert(first.results.every(r=>r.report.nodeHits===0));
const again=await routeSharedLibavoid(snapshot,A);assert.equal(again.stats.reusedConnections,2);assert.equal(JSON.stringify(fixed),fixedBefore);assert(!again.results.some(r=>r.id===99));
const switched=await routeSharedLibavoid({...snapshot,sceneId:'other'},A);assert.equal(switched.stats.createdShapes,3);
const failed=await routeSharedLibavoid(snapshot,{...A,Router:class {constructor(){throw Error('Injected scene initialization failure');}}});
assert(failed.stats.failed);assert.equal(failed.results.length,2);assert(failed.results.every(r=>r.backend==='javascript' && r.report.nodeHits===0));
const recovered=await routeSharedLibavoid(snapshot,A);assert.equal(recovered.stats.createdShapes,3);
disposeSharedLibavoid();
// A native transaction abort can also make its destructor throw. Cleanup must
// neither replace the original error nor suppress JavaScript recovery.
let nativeCalls=0,deleteCalls=0;const abandoned=[];
const poisoned={...A,Router:class {
 constructor(...args){
  nativeCalls++;const router=new A.Router(...args);abandoned.push(router);
  return new Proxy(router,{get(target,key){
   if(key==='processTransaction')return ()=>{throw Error('Injected native spacing failure at 12');};
   if(key==='delete')return ()=>{deleteCalls++;throw Error('program has already aborted!');};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 }
}};
const lane12={...snapshot,options:{...options,laneDistance:12}};
try{
 const fallback=await routeSharedLibavoid(lane12,poisoned);
 assert(fallback.stats.failed);assert.equal(fallback.results.length,connections.length);
 assert(fallback.results.every(r=>r.backend==='javascript' && r.report.nodeHits===0 && r.backendWarning.includes('Injected native spacing failure at 12')));
 assert.equal(nativeCalls,1);assert.equal(deleteCalls,1);
 disposeSharedLibavoid();assert.equal(deleteCalls,1,'Disposal must detach the scene even if the destructor throws');
 const repeated=await routeSharedLibavoid(lane12,poisoned);assert(repeated.stats.failed);assert.equal(nativeCalls,1,'Never re-enter a failed runtime');
 for(const laneDistance of [8,12]){
  const clean=await routeSharedLibavoid({...snapshot,options:{...options,laneDistance}},A);
  assert(!clean.stats.failed);assert(clean.results.every(r=>r.report.nodeHits===0));
 }
}finally{disposeSharedLibavoid();for(const router of abandoned)router.delete();}
console.log('PASS: shared native transaction, moved obstacles, endpoint changes, reused connectors, deletions, scene reset and immutable fixed references.');
