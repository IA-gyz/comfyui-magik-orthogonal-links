import assert from 'node:assert/strict';
import {routeWaypoints,cleanWaypoints,insertionIndex} from '../js/waypoints.js';
import {validateRoute} from '../js/geometry.js';
const orthogonal=p=>p.slice(1).every((q,i)=>q[0]===p[i][0]||q[1]===p[i][1]);
const a=[0,0],b=[600,0],controls=[[150,160],[440,-100]],obstacles=[{id:1,rect:[220,-40,350,120]}];
const before=structuredClone(controls),r=routeWaypoints(a,b,controls,obstacles);
assert(orthogonal(r.points));assert.equal(validateRoute(r.points,obstacles.map(n=>n.rect)).nodeHits,0);
assert.deepEqual(r.indices.map(i=>r.points[i]),controls);assert.deepEqual(controls,before);
assert(r.indices[0]<r.indices[1]);assert.deepEqual(r.points[0],a);assert.deepEqual(r.points.at(-1),b);
assert.equal(insertionIndex(r.points,r.indices,0),0);assert.equal(insertionIndex(r.points,r.indices,r.indices[0]),1);
// Covering a mandatory point may create a local crossing but cannot remove it.
const covered=routeWaypoints(a,b,[[280,40]],obstacles);
assert.deepEqual(covered.points[covered.indices[0]],[280,40]);assert(orthogonal(covered.points));
assert(validateRoute(covered.points,obstacles.map(n=>n.rect)).nodeHits>0);
const clear=routeWaypoints(a,b,[[280,40]],[{id:1,rect:[220,200,350,360]}]);
assert.deepEqual(clear.points[clear.indices[0]],[280,40]);assert.equal(validateRoute(clear.points,[[220,200,350,360]]).nodeHits,0);
// Collinear and backward mandatory points remain in ordered traversal.
for(const anchors of [[[100,0],[200,0]],[[400,0],[100,0]],[[100,100],[100,100],[300,100]]]) {
 const p=routeWaypoints(a,b,anchors,[]);assert.deepEqual(p.indices.map(i=>p.points[i]),anchors);assert(orthogonal(p.points));
}
// A point inside soft clearance but outside the node must not create a
// portal crossing through that node when a clear side is available.
const padded=[{id:1,rect:[80,-20,220,120]}],body=[[100,0,200,100]];
const soft=routeWaypoints([0,50],[400,50],[[90,50]],padded,{clearance:20});
assert.deepEqual(soft.points[soft.indices[0]],[90,50]);assert.equal(validateRoute(soft.points,body).nodeHits,0);
const shift=[850000,-160000];
const translated=routeWaypoints(a.map((v,i)=>v+shift[i]),b.map((v,i)=>v+shift[i]),controls.map(p=>p.map((v,i)=>v+shift[i])),obstacles.map(o=>({...o,rect:o.rect.map((v,i)=>v+shift[i%2])})));
assert.deepEqual(translated.indices.map(i=>translated.points[i]),controls.map(p=>p.map((v,i)=>v+shift[i])));
assert(orthogonal(translated.points));
assert.deepEqual(cleanWaypoints([[1,2],[1,2],[NaN,0],[4,5]]),[[1,2],[4,5]]);
for(let i=0;i<80;i++) {
 const anchors=[[50+i,80+i],[400-i,-80-i]],result=routeWaypoints(a,b,anchors,obstacles);
 assert.deepEqual(result.indices.map(j=>result.points[j]),anchors);assert(orthogonal(result.points));
}
console.log('PASS: mandatory ordered anchors, clear spans, node-covered anchors, restoration after obstacle movement, collinear/backward/duplicate points, insertion ordering and immutable inputs');
