import assert from 'node:assert/strict';
import {buildOverlapIndex,IncrementalOverlapIndex,overlapPieces,overlapDependencies,overlapsUnchanged} from '../js/overlaps.js';
import {RectangleIndex,intersects,pathTouchesRectangle} from '../js/performance_cache.js';
const canonical=index=>[...index].sort(([a],[b])=>a.localeCompare(b));
const state=new IncrementalOverlapIndex();
const routes=[{id:1,points:[[0,0],[100,0],[20,0],[20,50]]},{id:2,points:[[40,0],[150,0]]},{id:3,points:[[0,200],[100,200]]}];
state.update(routes);assert.deepEqual(canonical(state.index),canonical(buildOverlapIndex(routes)));
const dependencies=overlapDependencies(routes[2].points,state.index),oldLine=state.index.get('h:200');
routes[0].points[1][0]=120;state.update(routes);
assert.deepEqual(canonical(state.index),canonical(buildOverlapIndex(routes)));
assert.equal(state.index.get('h:200'),oldLine);assert(overlapsUnchanged(routes[2].points,state.index,dependencies));
state.update(routes);assert.equal(state.lastUpdatedLines,0);
let seed=53;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
for(let step=0;step<400;step++){
 const id=Math.floor(random()*50),at=routes.findIndex(r=>r.id===id);
 if(random()<0.2){if(at>=0)routes.splice(at,1);}
 else {const x=Math.floor(random()*10)*10,y=Math.floor(random()*10)*10;const entry={id,points:[[x,y],[x+40,y],[x+40,y+30],[x,y+30],[x,y]]};if(at>=0)routes[at]=entry;else routes.push(entry);}
 state.update(routes);const expected=buildOverlapIndex(routes);
 assert.deepEqual(canonical(state.index),canonical(expected));
 for(const r of routes)assert.deepEqual(overlapPieces(r.points,state.index),overlapPieces(r.points,expected));
}
state.update([]);assert.equal(state.index.size,0);assert.equal(state.groups.size,0);assert.equal(state.routes.size,0);
const items=Array.from({length:200},(_,id)=>({id,rect:[id*10,0,id*10+8,8]}));
const tree=new RectangleIndex(items),initialBuilds=tree.rebuilds;
for(let step=0;step<300;step++){
 const item=items[step%items.length],x=random()*4000-1000,y=random()*100-50;
 item.rect=[x,y,x+10,y+10];tree.update(items);
 for(let q=0;q<5;q++){const x=random()*4000-1000,b=[x,-20,x+100,30];assert.deepEqual(tree.query(b).map(i=>i.id).sort((a,b)=>a-b),items.filter(i=>intersects(i.rect,b)).map(i=>i.id).sort((a,b)=>a-b));}
}
assert(tree.refits>250);assert(tree.rebuilds<10,'Single movements should refit rather than repeatedly rebuild');assert(tree.rebuilds>initialBuilds,'Periodically rebalance after long movement sequences');
items.pop();tree.update(items);assert.equal(tree.locations.size,items.length);
items.push({id:999,rect:[-1,-1,1,1]});tree.update(items);assert(tree.query([0,0,0,0]).some(i=>i.id===999));
tree.update([]);assert.equal(tree.root,null);
console.log('PASS: 400 overlap edits against full rebuild; 300 obstacle moves and 1,500 queries against brute force; structural edits and periodic rebalancing.');

const elbow=[[0,0],[200,0],[200,200]];
assert(!pathTouchesRectangle(elbow,[50,50,60,60]),'Empty L envelope must not invalidate geometry');
assert(pathTouchesRectangle(elbow,[190,50,210,60]));
assert(pathTouchesRectangle(elbow,[200,200,210,210]),'Include endpoint/boundary contacts');
