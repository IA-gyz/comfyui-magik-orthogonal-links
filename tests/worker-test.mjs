import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {pruneDetours,nudgeLanes,validateRoute} from '../js/geometry.js';
const pageHandler=()=>{};
globalThis.window={};globalThis.self={onmessage:pageHandler};
await import('../js/routing_worker.js?main-thread-guard');
assert.equal(self.onmessage,pageHandler);delete globalThis.window;delete globalThis.self;
const worker=new Worker(new URL('./worker-runner.mjs',import.meta.url));
const result=await new Promise((resolve,reject)=>{
 worker.once('message',resolve);worker.once('error',reject);
 worker.postMessage({a:[0,0],b:[200,0],rects:[[80,-20,120,20]],options:{maxExtra:400,maxFactor:2,preferences:{fewestCorners:true,laneDistance:0,references:[]}}});
});
const nudge=await new Promise((resolve,reject)=>{
 worker.once('message',resolve);worker.once('error',reject);
 worker.postMessage({action:'nudge',points:[[0,0],[100,0],[100,100],[300,100],[300,200],[400,200]],rects:[],options:{laneDistance:12,maxExtra:400,maxFactor:2,preferences:{avoidOverlap:true},references:[{points:[[80,100],[320,100]]}]}});
});
assert(!nudge.error);assert(nudge.nudged>0);assert.equal(nudge.report.laneDeficit,0);
const strict=await new Promise((resolve,reject)=>{
 worker.once('message',resolve);worker.once('error',reject);
 worker.postMessage({a:[0,0],b:[0,600],rects:[[-300,100,300,250],[-300,300,300,450]],options:{strictAvoidance:true,maxExtra:100,maxFactor:1.1}});
});
assert(!strict.error);assert.equal(strict.report.nodeHits,0);assert(strict.relaxedLimits);
// Compare one real-worker finishing batch with the existing sequential passes.
const records=Array.from({length:40},(_,id)=>({id,sourceId:id*2,targetId:id*2+1,points:[[0,id*6],[100,id*6],[100,id*6+100],[400,id*6+100]]}));
const fixed={points:[[80,100],[320,100]],origin:[80,100]};
const references=[...records.map(r=>[r.id,{points:r.points,origin:r.points[0]}]),[999,fixed]];
const options={laneDistance:12,maxExtra:400,maxFactor:Infinity};
const expected=records.map(r=>({...r})),refMap=new Map(references);
let removedCorners=0,nudgedSegments=0;
const forRoute=r=>({...options,references:[...refMap].filter(([id])=>id!==r.id).map(([,ref])=>ref),exemptStart:[undefined],exemptEnd:[undefined]});
const remember=r=>refMap.set(r.id,{points:r.points,origin:refMap.get(r.id).origin});
for(const r of expected){const out=pruneDetours(r.points,[],forRoute(r));removedCorners+=Math.max(0,r.points.length-out.points.length);r.points=out.points;remember(r);}
for(let pass=0;pass<2;pass++)for(const r of expected){const out=nudgeLanes(r.points,[],forRoute(r));r.points=out.points;nudgedSegments+=out.nudged;remember(r);}
for(const r of expected)r.report=validateRoute(r.points,[],forRoute(r));
const finished=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({action:'finishBatch',records,rects:[],nodeRects:[],references,options,lanePasses:2});});
assert(!finished.error);assert.deepEqual(finished.results,expected);assert.equal(finished.removedCorners,removedCorners);assert.equal(finished.nudgedSegments,nudgedSegments);
assert.deepEqual(fixed.points,[[80,100],[320,100]],'Fixed reference geometry remains immutable');
// Chunk boundaries must not change the global polish/nudge/validate ordering.
const chunked=records.map(r=>({...r})),chunkRefs=new Map(references);
const send=data=>new Promise((resolve,reject)=>{
 const message=value=>{worker.off('error',error);resolve(value);},error=value=>{worker.off('message',message);reject(value);};
 worker.once('message',message);worker.once('error',error);worker.postMessage(data);
});
let chunkRemoved=0,chunkNudged=0;
for(const stage of ['polish','nudge','nudge','validate'])for(let offset=0;offset<chunked.length;offset+=7){
 const part=chunked.slice(offset,offset+7);
 const out=await send({action:'finishBatch',stage,records:part,rects:[],nodeRects:[],references:[...chunkRefs],options,lanePasses:1});
 assert(!out.error);chunkRemoved+=out.removedCorners;chunkNudged+=out.nudgedSegments;
 out.results.forEach((result,i)=>{Object.assign(part[i],result);if(stage!=='validate')chunkRefs.set(result.id,{points:result.points,origin:chunkRefs.get(result.id).origin});});
}
assert.deepEqual(chunked,expected);assert.equal(chunkRemoved,removedCorners);assert.equal(chunkNudged,nudgedSegments);
await worker.terminate();assert(!result.error);assert.equal(result.report.nodeHits,0);assert.equal(result.report.reversals,0);
console.log('PASS: worker route computation and final validation.');
