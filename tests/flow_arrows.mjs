import assert from 'node:assert/strict';
import {ARROW_DESIGNS,arrowPlacements,drawFlowArrows} from '../js/flow_arrows.js';
const route=[[0,0],[300,0],[300,-300],[0,-300],[0,0]];
const placements=arrowPlacements(route);
assert.equal(placements.length,8);
assert.deepEqual(placements.map(p=>[p.ux,p.uy]),[[1,0],[1,0],[0,-1],[0,-1],[-1,0],[-1,0],[0,1],[0,1]]);
assert.equal(arrowPlacements([[0,0],[20,0]]).length,0);
assert.equal(arrowPlacements([[0,0],[0,0],[10,20]]).length,0);
assert.deepEqual(arrowPlacements([[0,0],[300,0]],NaN),arrowPlacements([[0,0],[300,0]],1));
for(const scale of [.1,.5,1,2,4]) {
 const p=arrowPlacements([[0,0],[300/scale,0]],scale);
 assert.equal(p.length,2);assert.equal(p[0].size*scale,7);assert.equal(p[0].x*scale,80);
}
for(const points of [[[-1e12,0],[1e12,0]],[[1e12,0],[-1e12,0]],[[0,-1e12],[0,1e12]],[[0,1e12],[0,-1e12]]]) {
 const p=arrowPlacements(points,1,[-500,-500,500,500]);
 assert(p.length>0&&p.length<12);assert(p.every(q=>Math.abs(q.x)<=514&&Math.abs(q.y)<=514));
}
assert.equal(arrowPlacements([[0,100],[1000,100]],1,[0,0,500,50]).length,0);
assert(arrowPlacements([[0,0],[1e12,0]]).length<=1024);
// Adding/removing aligned editable handles must not move or erase arrows.
for(const [ux,uy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
 const split=Array.from({length:31},(_,i)=>[ux*i*10,uy*i*10]);
 split.splice(7,0,[...split[7]]);
 const before=structuredClone(split);
 assert.deepEqual(arrowPlacements(split),arrowPlacements([[0,0],[ux*300,uy*300]]));
 assert.deepEqual(split,before);
 assert.deepEqual(arrowPlacements(split,.5,[-100,-100,100,100]),arrowPlacements([[0,0],[ux*300,uy*300]],.5,[-100,-100,100,100]));
}
const reversing=arrowPlacements([[0,0],[300,0],[0,0]]);
assert.deepEqual(reversing.map(p=>p.ux),[1,1,-1,-1]);
for(const scale of [1e-320,1e308])assert(arrowPlacements([[0,0],[300,0]],scale).every(p=>Object.values(p).every(Number.isFinite)));
assert.deepEqual(arrowPlacements([[-1e308,0],[1e308,0]]),[]);
assert.equal(ARROW_DESIGNS.length,4);
const geometry=new Set();
for(const design of ARROW_DESIGNS) {
 let depth=0,fills=0,strokes=0;const commands=[];
 const ctx={save(){depth++;},restore(){depth--;},setLineDash(v){assert.deepEqual(v,[]);},beginPath(){},moveTo(...p){commands.push(['M',...p]);},lineTo(...p){commands.push(['L',...p]);},closePath(){commands.push(['Z']);},fill(){fills++;},stroke(){strokes++;}};
 drawFlowArrows(ctx,[[0,0],[300,0]],{design});
 assert.equal(depth,0);assert(commands.length);assert(commands.flat().every(x=>typeof x==='string'||Number.isFinite(x)));
 assert.equal(fills,design==='Triangle'?2:0);assert.equal(strokes,design==='Triangle'?0:2);
 geometry.add(JSON.stringify(commands));
}
assert.equal(geometry.size,4);
const badContext={save(){},restore(){this.restored=true;},setLineDash(){throw Error('injected');}};
assert.throws(()=>drawFlowArrows(badContext,route),/injected/);assert(badContext.restored);
console.log('PASS: flow direction on all axes; four distinct designs; zoom, short segments, clipping, huge coordinates, bounded placements and canvas-state cleanup');
