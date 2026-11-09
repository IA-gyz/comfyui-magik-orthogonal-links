// Optional baseline module URL/path enables alternating before/after samples.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {RectangleIndex} from '../js/performance_cache.js';
const count=Number(process.argv[2]??10000),repeats=Number(process.argv[3]??15);
const Baseline=process.argv[4]?(await import(pathToFileURL(process.argv[4]).href)).RectangleIndex:null;
let seed=170123;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
const items=Array.from({length:count},(_,id)=>{const x=random()*20000-10000,y=random()*20000-10000;return {id,rect:[x,y,x+random()*300,y+random()*200]};});
const queries=Array.from({length:300},()=>{const x=random()*20000-10000,y=random()*20000-10000;return [x,y,x+300,y+200];});
if(Baseline){
 const before=new Baseline(items),after=new RectangleIndex(items);
 for(const q of queries)assert.deepEqual(after.query(q),before.query(q));
 // Tree structure/order must also stay equivalent after refits and rebuilds.
 for(let step=0;step<140;step++){
  const at=step%count;items[at]={...items[at],rect:items[at].rect.map(v=>v+13)};
  before.update(items);after.update(items);
  assert.deepEqual(after.query(queries[step%queries.length]),before.query(queries[step%queries.length]));
 }
}
const samples={before:[],after:[]};
for(let run=-3;run<repeats;run++)for(const version of run%2?['after','before']:['before','after']){
 const C=version==='before'?Baseline:RectangleIndex;if(!C)continue;
 const start=performance.now(),index=new C(items),elapsed=performance.now()-start;
 assert.equal(index.locations.size,count);
 if(run>=0)samples[version].push(elapsed);
}
const median=xs=>xs.length?[...xs].sort((a,b)=>a-b)[xs.length>>1]:null;
console.log(JSON.stringify({rectangles:count,repeats,beforeMs:median(samples.before),afterMs:median(samples.after),samples}));
