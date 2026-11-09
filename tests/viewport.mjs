import assert from 'node:assert/strict';
import {viewportBounds,pathVisible,piecesVisible} from '../js/viewport.js';
const view=viewportBounds([0,0,100,100]);
assert.deepEqual(view,[0,0,100,100]);
for(const area of [undefined,[],[0,0,0,100],[0,0,-1,100],[NaN,0,10,10],[0,Infinity,10,10],[1e308,0,1e308,10]])assert.equal(viewportBounds(area),null);
assert(pathVisible([[-50,50],[150,50]],view));
assert(pathVisible([[50,140],[74,140],[74,92],[36,92],[36,160],[60,160]],view));
assert(!pathVisible([[-50,-50],[150,-50],[150,150],[-50,150]],view,2),'A surrounding bounding box alone does not imply visibility');
assert(pathVisible([[NaN,0],[1,2]],view));
assert(pathVisible([[0,0]],null));
assert(pathVisible([[200,0],[200,100]],view,NaN));
const outside=[{a:[-200,-20],b:[200,-20],count:20}];
assert(piecesVisible(outside,view,3,false,1),'Overlapping lanes extend into view');
assert(!piecesVisible([{...outside[0],count:1}],view,3,false,1));
assert(piecesVisible([{a:[0,-3],b:[100,-3],count:1}],view,1,true,1),'Border and antialias margin are conservative');
assert(piecesVisible([{a:[0,-7],b:[100,-7],count:1}],view,1,false,0.25),'Margin follows zoom');
assert(piecesVisible([{a:[0,-6],b:[100,-6],count:1}],view,1,false,1,7),'Selected handles remain visible');
let seed=977;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let i=0;i<10000;i++){
 const x=random()*1000-500,y=random()*1000-500,amount=random()*300-150;
 const a=[x,y],b=i%2?[x+amount,y]:[x,y+amount],padding=random()*20;
 const expected=Math.min(a[0],b[0])<=100+padding && Math.max(a[0],b[0])>=-padding && Math.min(a[1],b[1])<=100+padding && Math.max(a[1],b[1])>=-padding;
 assert.equal(pathVisible([a,b],view,padding),expected);
}
console.log('PASS: 10,000 visibility comparisons; crossing paths, detours, hollow bounds, invalid viewports, shared widths, borders, zoom and handles.');
