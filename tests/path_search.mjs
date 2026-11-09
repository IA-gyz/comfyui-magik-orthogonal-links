import assert from 'node:assert/strict';
import {buildVisibilityGraph} from '../js/visibility_graph.js';
import {searchVisibilityGraph} from '../js/route_search.js';
import {pathLength} from '../js/routing_primitives.js';
// Independent Lee-style unit-grid BFS, with its own open-rectangle collision
// predicate. Integer rectangle bounds make grid and continuous L1 optima agree
// in these fixtures. This is a test oracle, not a production fallback.
function maze(a,b,rects) {
 const queue=[[...a,0]],seen=new Set([a.join(',')]);
 for(let head=0;head<queue.length;head++) {
  const [x,y,d]=queue[head];if(x===b[0]&&y===b[1])return d;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
   const u=x+dx,v=y+dy,key=`${u},${v}`;
   if(u < -2 || u>14 || v < -2 || v>14 || seen.has(key))continue;
   if(rects.some(([l,t,r,b])=>dx?y>t&&y<b&&Math.max(x,u)>l&&Math.min(x,u)<r:x>l&&x<r&&Math.max(y,v)>t&&Math.min(y,v)<b))continue;
   seen.add(key);queue.push([u,v,d+1]);
  }
 }
 return null;
}
let seed=91273;const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
for(let test=0;test<150;test++) {
 const rects=Array.from({length:6},()=>{const x=1+random(8),y=1+random(8);return [x,y,x+1+random(3),y+1+random(3)];});
 const a=[0,6],b=[12,6],expected=maze(a,b,rects),graph=buildVisibilityGraph(a,b,rects,80,{outerRails:true});
 const actual=graph&&searchVisibilityGraph(graph,a,b,rects,80);
 assert.equal(actual?pathLength(actual):null,expected,`oracle mismatch ${test}`);
}
console.log('PASS: directional visibility search agrees with independent maze BFS on 150 obstacle layouts.');
