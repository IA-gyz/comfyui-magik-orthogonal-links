import assert from 'node:assert/strict';
import {simplify} from '../js/routing_primitives.js';
import {simplify as baseline} from './simplify_oracle.mjs';
const paths=Array.from({length:2000},(_,i)=>{
  const x=i%100,y=Math.floor(i/100);
  return [[x,y],[x+10,y],[x+20,y],[x+20,y+30],[x+20,y+40],[x+60,y+40]];
});
const run=fn=>{
  let checksum=0;const start=performance.now();
  for(let n=0;n<100;n++)for(const path of paths){const p=fn(path);checksum+=p.length+p.at(-1)[0];}
  return {ms:performance.now()-start,checksum};
};
run(baseline);run(simplify);
const result={baseline:[],current:[]};
for(let i=0;i<9;i++)for(const [key,fn] of i%2?[['current',simplify],['baseline',baseline]]:[['baseline',baseline],['current',simplify]])result[key].push(run(fn));
assert.equal(new Set(Object.values(result).flat().map(r=>r.checksum)).size,1);
const median=xs=>xs.map(r=>r.ms).sort((a,b)=>a-b)[xs.length>>1];
console.log(JSON.stringify({callsPerRun:200000,baselineMedianMs:median(result.baseline),currentMedianMs:median(result.current),runs:result},null,2));
