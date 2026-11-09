import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {WorkerEncoder,WorkerDecoder} from '../js/worker_transport.js';
import {postprocessBatch} from '../js/postprocess_batch.js';
import {routeWithValidation} from '../js/geometry.js';
const encoder=new WorkerEncoder(),decoder=new WorkerDecoder();
assert.throws(()=>decoder.decode({residentScene:true}),/Missing/);
const rects=[[0,-30,40,30],[240,-30,280,30],[100,-20,160,20]];
const options={strictAvoidance:true,exemptStart:[rects[0]],exemptEnd:[rects[1]],maxExtra:400,maxFactor:Infinity};
const request={a:[40,0],b:[240,0],rects,options};
const wire=encoder.encode(request),decoded=decoder.decode(structuredClone(wire));
assert.strictEqual(decoded.options.exemptStart[0],decoded.rects[0]);
assert.strictEqual(decoded.options.exemptEnd[0],decoded.rects[1]);
assert(!encoder.encode(request).sceneRects);
assert.deepEqual(request.options,options);
const ref={points:[[0,100],[200,100]],origin:[0,100]};
const paths={...request,options:{...options,references:[ref],preferences:{references:[ref]}}};
let packet=encoder.encode(paths);
assert.equal(packet.pathUpdates.length,1);
let hydrated=decoder.decode(structuredClone(packet));
assert.strictEqual(hydrated.options.references[0],hydrated.options.preferences.references[0]);
assert.equal(encoder.encode(paths).pathUpdates.length,0);
const replacement={...paths,rects:rects.slice()};
packet=encoder.encode(replacement);assert.equal(packet.pathUpdates.length,1);
hydrated=decoder.decode(structuredClone(packet));assert.deepEqual(hydrated.options.references,[ref]);
// Restore the original scene before using this encoder with the real worker.
const initial=encoder.encode(request);
const worker=new Worker(new URL('./worker-runner.mjs',import.meta.url));
const send=data=>new Promise((resolve,reject)=>{
 const error=e=>{worker.off('message',message);reject(e);};
 const message=data=>{worker.off('error',error);data.error?reject(Error(data.error)):resolve(data);};
 worker.once('message',message);worker.once('error',error);worker.postMessage(data);
});
try{
 const result=await send(initial);
 assert.deepEqual(result,routeWithValidation(request.a,request.b,rects,options));
 const references=new Map([[1,{points:result.points,origin:request.a}],[2,{points:[[40,80],[240,80]],origin:[40,80]}]]);
 let points=result.points;
 for(const stage of ['polish','nudge','nudge','validate']){
  const data={action:'finishBatch',stage,rects,nodeRects:[[10,rects[0]],[20,rects[1]]],references:[...references],records:[{id:1,sourceId:10,targetId:20,points}],options:{laneDistance:12,maxExtra:400,maxFactor:Infinity},lanePasses:1};
  const expected=postprocessBatch(data),packet=encoder.encode(data);
  assert(!packet.sceneRects);
  assert.equal(packet.referenceUpdates.length,stage==='polish'?2:1);
  const actual=await send(packet);assert.deepEqual(actual,expected);
  points=actual.results[0].points;
  references.set(1,{points,origin:request.a});
 }
 // A reused worker receives a completely new job snapshot, including [] scenes.
 const fresh=new WorkerEncoder(),empty={a:[0,0],b:[20,0],rects:[],options:{}};
 assert.deepEqual(await send(fresh.encode(empty)),routeWithValidation(empty.a,empty.b,[],{}));
 assert.deepEqual(await send(request),routeWithValidation(request.a,request.b,rects,options));
}finally{await worker.terminate();}
console.log('PASS: worker scene identity, delta references, sequential finishing parity, new-job reset and legacy protocol');
