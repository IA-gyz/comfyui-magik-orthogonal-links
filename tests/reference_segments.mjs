import assert from 'node:assert/strict';
import {ReferenceSegments} from '../js/reference_segments.js';
import {pruneDetours,nudgeLanes,validateRoute} from '../js/geometry.js';
import {legacyValidateRoute} from './validation_oracle.mjs';
import {simplify} from '../js/routing_primitives.js';
let seed=712386;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
const coordinate=()=>Math.floor(random()*200)*8-800;
const paths=Array.from({length:350},()=>{
 const a=[coordinate(),coordinate()],b=[coordinate(),coordinate()];
 return simplify([a,[b[0],a[1]],b]);
});
// Deliberate diagonal input and epsilon-adjacent coordinates stay conservative.
paths.push([[0,0],[100,100]],[[0,1e-7],[400,1e-7]],[],[[0,0]]);
paths.push([[0,0],[24,0],[24,100],[376,100],[376,0],[400,0]],[[0,0],[12,0],[12,80],[400,80]]);
const index=new ReferenceSegments(paths);
const potential=(a,b,c,d,lane)=>{
 const horizontal=a[1]===b[1],parallel=horizontal===(c[1]===d[1]);
 if(!parallel){
  const x=horizontal?c[0]:a[0],y=horizontal?a[1]:c[1];
  return (horizontal?x>Math.min(a[0],b[0])&&x<Math.max(a[0],b[0]):y>Math.min(a[1],b[1])&&y<Math.max(a[1],b[1])) && (horizontal?y>Math.min(c[1],d[1])&&y<Math.max(c[1],d[1]):x>Math.min(c[0],d[0])&&x<Math.max(c[0],d[0]));
 }
 const along=horizontal?0:1,gap=Math.abs(a[1-along]-c[1-along]);
 return (gap<1e-7 || gap<lane-1e-7) && Math.min(Math.max(a[along],b[along]),Math.max(c[along],d[along]))>Math.max(Math.min(a[along],b[along]),Math.min(c[along],d[along]));
};
let indexed=0;
for(let n=0;n<1000;n++){
 const a=[coordinate(),coordinate()],b=n%7===0?[coordinate(),coordinate()]:n%3?[coordinate(),a[1]]:[a[0],coordinate()],lane=[0,1e-7,8,12,100][n%5];
 const found=index.query(a,b,lane);if(!found)continue;indexed++;
 const ids=new Set(found.map(item=>item.id));assert.deepEqual([...ids],[...ids].sort((a,b)=>a-b));
 let id=0;
 for(const other of paths)for(let j=0;j<other.length-1;j++,id++)if(potential(a,b,other[j],other[j+1],lane))assert(ids.has(id),'Broad phase omitted a contributing segment');
}
assert(indexed>500);assert(index.index);
assert.equal(index.query([0,0],[100,0],Infinity),null);
assert.equal(index.query([1e308,1e308],[1e308,1e308],1e308),null);
const tiny=new ReferenceSegments([[[0,0],[100,0]]]);
for(let n=0;n<20;n++)assert.equal(tiny.query([0,0],[100,0],12),null);
// Reports from indexed finishing must match exhaustive validation exactly.
for(let n=0;n<40;n++){
 const points=[[0,0],[80,0],[80,80],[160,80],[160,-80],[320,-80],[320,0],[400,0]];
 const references=paths.map(points=>({points})),options={references,laneDistance:[0,8,12][n%3],maxExtra:400,maxFactor:2};
 for(const finish of [pruneDetours,nudgeLanes]){
  const result=finish(points,[],options);
  assert.deepEqual(result.report,legacyValidateRoute(result.points,[],options));
 }
 // Mutating the same caller-owned array between operations must remain visible.
 paths[n][0][0]+=8;
 assert.deepEqual(validateRoute(points,[],options),legacyValidateRoute(points,[],options));
}
console.log('PASS: conservative indexed queries, ordered candidates, exhaustive report parity, small/nonfinite fallback and mutable callers');
