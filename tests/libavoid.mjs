import assert from 'node:assert/strict';
import {AvoidLib} from '../js/vendor/libavoid/index.js';
import http from 'node:http';
import fs from 'node:fs';
import {routeWithLibavoid} from '../js/libavoid_backend.js';
import {manualRoute,validateRoute} from '../js/geometry.js';
// Exercise the shipped web bundle with HTTP WASM loading in a worker-like
// environment. This is not a substitute for a running ComfyUI/browser test.
globalThis.WorkerGlobalScope=class {};
const wasm=fs.readFileSync(new URL('../js/vendor/libavoid/libavoid.wasm',import.meta.url));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/wasm');res.end(wasm);}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
try {await AvoidLib.load(`http://127.0.0.1:${server.address().port}/libavoid.wasm`);}finally {server.close();}

const A=AvoidLib.getInstance();
for(let i=0;i<40;i++) {
 const rects=[[-100,-50,40,50],[160,150,300,250],[60,40,120,140]];
 const options={strictAvoidance:true,exemptStart:[rects[0]],exemptEnd:[rects[1]],preferences:{laneDistance:8}};
 const result=await routeWithLibavoid([0,0],[200,200],rects,options,A);
 assert.equal(result.backend,'libavoid',result.backendWarning);assert.equal(result.report.nodeHits,0);
 assert.equal(validateRoute(manualRoute([0,0],[200,200],result.points.slice(1,-1)),rects,options).nodeHits,0);
}
// Instrument the real binding: each displayRoute() copy must be deleted.
let outstandingRoutes=0;
const tracked={...A,ConnRef:class {
 constructor(...args){
  const native=new A.ConnRef(...args);
  this.displayRoute=()=>{
   const route=native.displayRoute();outstandingRoutes++;
   return new Proxy(route,{get(target,key){
    if(key==='delete')return ()=>{target.delete();outstandingRoutes--;};
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
   }});
  };
 }
}};
for(let i=0;i<10;i++){
 const result=await routeWithLibavoid([0,0],[200,100],[],{},tracked);
 assert.equal(result.report.nodeHits,0);assert.equal(outstandingRoutes,0,'native route copy leaked');
}
// An obstacle-free layout still compares candidate policy scores. The empty
// native scene cannot silently bypass the Fewest corners objective.
const suboptimal={...A,ConnRef:class {
 constructor(...args){
  new A.ConnRef(...args); // native connector remains owned by the router
  this.displayRoute=()=>{
   const points=[[0,0],[24,0],[24,200],[1976,200],[1976,100],[2000,100]];
   return {size:()=>points.length,at:i=>({x:points[i][0],y:points[i][1],delete(){}}),delete(){}};
  };
 }
}};
const compared=await routeWithLibavoid([0,0],[2000,100],[],{strictAvoidance:true,preferences:{}},suboptimal);
assert.equal(compared.backend,'javascript');assert.equal(compared.report.corners,2);
const lone=await routeWithLibavoid([0,0],[10000,5000],[],{strictAvoidance:true,preferences:{}},A);
assert.equal(lone.report.nodeHits,0);assert(lone.report.corners<=2);
const denied=await routeWithLibavoid([0,0],[200,100],[],{}, {Router(){throw Error('test unavailable backend');}});
assert.equal(denied.backend,'javascript');assert(denied.backendWarning);assert.equal(denied.report.nodeHits,0);
console.log('PASS: real WASM routing; owned native route copies released; policy comparison without references; inset pins, reattachment and failure fallback.');
