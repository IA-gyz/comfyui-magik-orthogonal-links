import assert from 'node:assert/strict';
import {ReferenceIndex} from '../js/reference_index.js';
const oracle=(entries,point,exclude,limit=64)=>entries.filter(([id])=>id!==exclude).sort(([,a],[,b])=>Math.hypot(a.origin[0]-point[0],a.origin[1]-point[1])-Math.hypot(b.origin[0]-point[0],b.origin[1]-point[1])).slice(0,limit).map(([id])=>id);
let seed=91;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
for(const size of [0,1,64,128,129,1000,4000]){
 const entries=Array.from({length:size},(_,i)=>[i%2?String(i):i,{origin:[Math.floor(rand()*500),Math.floor(rand()*500)],points:[[0,0],[1,0]]}]);
 const index=new ReferenceIndex(entries);
 for(let q=0;q<60;q++){
  const point=[rand()*700-100,rand()*700-100],exclude=q%2?entries[q%Math.max(1,size)]?.[0]:-1,limit=[1,24,64,size+3][q%4];
  assert.deepEqual(index.nearest(point,exclude,limit),oracle(entries,point,exclude,limit));
 }
 assert.deepEqual(index.nearest([0,0],-1,0),[]);
}
const coincident=Array.from({length:2000},(_,i)=>[i,{origin:[10,10]}]);
assert.deepEqual(new ReferenceIndex(coincident).nearest([10,10],3),oracle(coincident,[10,10],3));
const symmetric=Array.from({length:600},(_,i)=>[i,{origin:[[1,0],[-1,0],[0,1],[0,-1]][i%4]}]);
assert.deepEqual(new ReferenceIndex(symmetric).nearest([0,0],0),oracle(symmetric,[0,0],0));
const extreme=Array.from({length:400},(_,i)=>[i,{origin:[(i%2?1:-1)*1e300+i*1e285,(i%3?1:-1)*1e-300]}]);
for(const p of [[0,0],[1e300,0],[-1e300,0]])assert.deepEqual(new ReferenceIndex(extreme).nearest(p,5),oracle(extreme,p,5));
const refs=new Map(coincident),index=new ReferenceIndex([...refs]);
refs.set(0,{origin:[10,10],points:[[12,34],[56,34]]});
assert.equal(index.nearest([10,10],-1).map(id=>refs.get(id))[0],refs.get(0),'Resolve live geometry after sequential updates');
console.log('PASS: nearest reference IDs/order match full stable sorting across random, tied, mixed-ID and extreme-coordinate cases.');

const unusual=Array.from({length:150},(_,i)=>[i,{origin:[i===13?Infinity:i,i===7?NaN:0]}]);
assert.deepEqual(new ReferenceIndex(unusual).nearest([0,0],-1),oracle(unusual,[0,0],-1));

assert.deepEqual(new ReferenceIndex(symmetric).nearest([NaN,0],-1),oracle(symmetric,[NaN,0],-1));
assert.deepEqual(new ReferenceIndex(symmetric).nearest([Infinity,0],-1),oracle(symmetric,[Infinity,0],-1));
