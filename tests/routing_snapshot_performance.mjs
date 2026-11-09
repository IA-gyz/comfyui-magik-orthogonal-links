import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {RoutingSnapshot} from '../js/routing_snapshot.js';
const count=Number(process.argv[2]??5000),repeats=Number(process.argv[3]??25);
const graph={_nodes:Array.from({length:count},(_,id)=>{const points=Array.from({length:8},(_,i)=>[id*200+i*20,i%2*100]);return {id,pos:[id*200,0],size:[100,60],inputs:[{link:id}],flags:{collapsed:false},properties:{magikOrthogonalRoutes:{0:{points,pins:points.map(p=>[...p]),locked:false,savedNodeId:id,savedPos:[id*200,0],signature:'source|out|in'}}}};}),links:Object.fromEntries(Array.from({length:count},(_,id)=>[id,{id,origin_id:id,target_id:(id+1)%count,origin_slot:0,target_slot:0}]))};
const fingerprint=()=>JSON.stringify({nodes:graph._nodes.map(n=>[n.id,[Number(n.pos[0]),Number(n.pos[1])],Array.from(n.size??[]),n.flags?.collapsed,n.properties?.magikOrthogonalRoutes,n.inputs?.map(i=>i.link)]),links:Object.values(graph.links).map(l=>[l.id,l.origin_id,l.origin_slot,l.target_id,l.target_slot,l.parentId])});
const expected=fingerprint(),captureStart=performance.now(),snapshot=new RoutingSnapshot(graph),captureMs=performance.now()-captureStart,samples={before:[],after:[]};
for(let run=-5;run<repeats;run++)for(const version of run%2?['after','before']:['before','after']){
 const start=performance.now(),valid=version==='before'?fingerprint()===expected:snapshot.matches(graph),elapsed=performance.now()-start;assert(valid);
 if(run>=0)samples[version].push(elapsed);
}
const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];
console.log(JSON.stringify({nodes:count,links:count,repeats,captureMs,beforeMs:median(samples.before),afterMs:median(samples.after),samples}));
