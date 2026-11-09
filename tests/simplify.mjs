import assert from 'node:assert/strict';
import {simplify} from '../js/routing_primitives.js';
import {simplify as oracle} from './simplify_oracle.mjs';
let seed=173;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const fixtures=[[],[[0,0]],[[0,0],[1,0],[0,0]],[[0,0],[1,0],[2,0],[1,0],[0,0]],[[0,-0],[-0,0],[1,0]],[[NaN,0],[Infinity,0],[0,0],[1,undefined],[2,0]],[["0","1"],[null,true],[2,1]]];
for(let i=0;i<20000;i++){
  const points=[];let x=0,y=0;
  for(let j=0,n=random()*60;j<n;j++){
    if(random()<0.5)x+=Math.floor(random()*7)-3;else y+=Math.floor(random()*7)-3;
    points.push(random()<0.02?[NaN,y]:[x,y]);
  }
  fixtures.push(points);
}
for(const points of fixtures){
  const pins=points.filter(()=>random()<0.3).map(p=>[...p]);
  const original=structuredClone(points),originalPins=structuredClone(pins);
  assert.deepEqual(simplify(points,pins),oracle(points,pins));
  assert.deepEqual(points,original);assert.deepEqual(pins,originalPins);
  const result=simplify(points,pins);
  for(const p of result)assert(!points.includes(p),'Returned points must be independent copies');
}
console.log('PASS: 20,007 simplifier oracle cases, pinned corners, reversals, invalid coordinates, coercion, signed zero and input ownership.');
