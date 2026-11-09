import assert from 'node:assert/strict';
import {validateRoute,pruneDetours,nudgeLanes} from '../js/geometry.js';
import {legacyValidateRoute} from './validation_oracle.mjs';
let seed=984375;
const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
const integer=()=>Math.floor(random()*20)*10-100;
const path=()=>{
 let p=[integer(),integer()],out=[p];
 for(let i=0;i<8;i++){p=i%2?[integer(),p[1]]:[p[0],integer()];out.push(p);}
 return out;
};
for(let n=0;n<1500;n++){
 const points=path(),references=Array.from({length:12},()=>({points:path()}));
 if(n%3===0)references[0].points[0]=points[0];
 if(n%5===0)references[1].points.at(-1)[0]=points.at(-1)[0];
 const rects=Array.from({length:8},()=>{const x=integer(),y=integer();return [x,y,x+40,y+40];});
 const options={references,laneDistance:[0,1e-8,1e-7,2e-7,8,12,100][n%7],exemptStart:[rects[0]],exemptEnd:[rects[1]]};
 assert.deepEqual(validateRoute(points,rects,options),legacyValidateRoute(points,rects,options));
}
// Distance thresholds on either side of the epsilon cutoffs.
for(const gap of [0,0.999e-7,1e-7,1.001e-7,7.9999998,7.9999999,8,9]){
 const points=[[0,0],[300,0]],options={laneDistance:8,references:[{points:[[40,gap],[250,gap]]}]};
 assert.deepEqual(validateRoute(points,[],options),legacyValidateRoute(points,[],options));
}
// No persistent normalization cache: public callers can edit existing arrays.
const ref={points:[[0,1],[300,1]]},options={references:[ref],laneDistance:8};
for(const y of [1,40,0,4]){
 ref.points[0][1]=y;ref.points[1][1]=y;
 const points=[[0,0],[80,0],[80,60],[220,60],[220,0],[300,0]];
 const before=structuredClone(options);
 for(const finish of [pruneDetours,nudgeLanes]){
  const result=finish(points,[],options);
  assert.deepEqual(result.report,legacyValidateRoute(result.points,[],options));
  assert.deepEqual(options,before);
 }
}
console.log('PASS: 1,500 exhaustive-validator comparisons, epsilon boundaries, mutable callers and finishing report parity');
