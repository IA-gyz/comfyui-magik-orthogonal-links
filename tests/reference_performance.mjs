import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ReferenceIndex} from '../js/reference_index.js';
const count=Number(process.argv[2]??10000),queries=Number(process.argv[3]??300);
let seed=123;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
const entries=Array.from({length:count},(_,id)=>[id,{origin:[Math.floor(rand()*10000),Math.floor(rand()*10000)]}]);
const points=Array.from({length:queries},()=>[rand()*10000,rand()*10000]);
const samples=[];
for(let run=0;run<3;run++){
 const startBuild=performance.now(),index=new ReferenceIndex(entries),buildMs=performance.now()-startBuild;
 const before=performance.now();
 const sorted=points.map((p,q)=>entries.filter(([id])=>id!==q).sort(([,a],[,b])=>Math.hypot(a.origin[0]-p[0],a.origin[1]-p[1])-Math.hypot(b.origin[0]-p[0],b.origin[1]-p[1])).slice(0,64).map(([id])=>id));
 const fullSortMs=performance.now()-before,after=performance.now();
 const indexed=points.map((p,q)=>index.nearest(p,q));
 const indexedMs=performance.now()-after;
 assert.deepEqual(indexed,sorted);
 samples.push({buildMs,fullSortMs,indexedMs,selectionHash:createHash('sha256').update(JSON.stringify(indexed)).digest('hex')});
}
const median=key=>samples.map(s=>s[key]).sort((a,b)=>a-b)[1];
console.log(JSON.stringify({references:count,queries,buildMs:median('buildMs'),fullSortMs:median('fullSortMs'),indexedMs:median('indexedMs'),samples}));
