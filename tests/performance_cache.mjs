import assert from 'node:assert/strict';
import {samePoints,sceneDelta,intersects,routeBounds,RectangleIndex} from '../js/performance_cache.js';
assert(samePoints([[1,2],[3,4]],[[1,2],[3,4]]));
assert(!samePoints([[1,2]],[[1,3]]));
const before=new Map([[1,[0,0,10,10]],[2,[20,20,30,30]]]);
assert.equal(sceneDelta(before,[{id:1,rect:[0,0,10,10]},{id:2,rect:[20,20,30,30]}]).changes.length,0);
const moved=sceneDelta(before,[{id:1,rect:[100,100,110,110]},{id:3,rect:[40,40,50,50]}]);
assert.deepEqual(moved.changes,[[0,0,10,10],[100,100,110,110],[20,20,30,30],[40,40,50,50]]);
const bounds=routeBounds([[0,0],[10,0]],[[0,0],[0,40],[10,40],[10,0]]);
assert(intersects(bounds,[5,39,6,41]),'Include detour as well as authored geometry');
assert(intersects(bounds,[10,0,11,1]),'Boundary contacts invalidate conservatively');
assert(!intersects(bounds,[100,100,110,110]));
console.log('PASS: numeric geometry comparison, movement/addition/deletion deltas and conservative route bounds.');

// Compare the broad phase against a brute-force oracle, including large boxes,
// negative coordinates, edge contacts and degenerate rectangles.
let seed=77;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
const items=Array.from({length:1000},(_,id)=>{const x=rand()*2000-1000,y=rand()*2000-1000;return {id,rect:[x,y,x+rand()*400,y+rand()*400]};});
items.push({id:1000,rect:[-10000,-10000,10000,10000]},{id:1001,rect:[0,0,0,0]});
const index=new RectangleIndex(items);
for(let i=0;i<250;i++){
 const x=rand()*2000-1000,y=rand()*2000-1000,b=[x,y,x+rand()*300,y+rand()*300];
 assert.deepEqual(index.query(b).map(o=>o.id).sort((a,b)=>a-b),items.filter(o=>intersects(b,o.rect)).map(o=>o.id).sort((a,b)=>a-b));
}
assert.deepEqual(new RectangleIndex([]).query([0,0,1,1]),[]);
console.log('PASS: obstacle index matches brute-force queries on 1,002 rectangles and 250 queries.');

// Frozen scene-delta behavior, including reordered IDs and duplicate entries.
function legacyDelta(previous,current){
 const changes=[],next=new Map(current.map(item=>[item.id,item.rect]));
 for(const [id,rect] of previous){const replacement=next.get(id);if(!replacement || !rect.every((v,i)=>v===replacement[i])){changes.push(rect);if(replacement)changes.push(replacement);}}
 for(const [id,rect] of next)if(!previous.has(id))changes.push(rect);
 return {next,changes};
}
for(let i=0;i<1000;i++){
 const previous=new Map(Array.from({length:20},(_,id)=>[id,[id,0,id+2,4]]));
 const current=Array.from(previous,([id,rect])=>({id,rect:[...rect]}));
 if(i%5===0)current.reverse();
 if(i%5===1)current.splice(i%20,1);
 if(i%5===2)current.push({id:i%20,rect:[1,2,3,4]});
 if(i%5===3)current[i%20].rect[0]+=1;
 if(i%5===4)current.push({id:NaN,rect:[1,2,3,4]});
 assert.deepEqual(sceneDelta(previous,current),legacyDelta(previous,current));
}
console.log('PASS: 1,000 scene deltas match the frozen oracle.');
const legacySamePoints=(a,b)=>a===b || (!!a && !!b && a.length===b.length && a.every((p,i)=>p.length===b[i].length && p.every((v,j)=>v===b[i][j])));
for(let i=0;i<10000;i++){
 const a=Array.from({length:Math.floor(rand()*12)},()=>[Math.floor(rand()*20),rand()<0.03?NaN:Math.floor(rand()*20)]);
 if(a.length && i%7===0)delete a[0][0];
 if(a.length && i%11===0)delete a[0];
 const b=i%13===0?a:structuredClone(a);
 if(i%3===0)b.push([1,2]);
 else if(i%3===1 && b.length && b[0])b[0][0]=123;
 assert.equal(samePoints(a,b),legacySamePoints(a,b));
}
console.log('PASS: 10,000 numeric comparison oracle cases, including sparse arrays and NaNs.');
