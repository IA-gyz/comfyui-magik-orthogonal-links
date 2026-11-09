import assert from 'node:assert/strict';
import {buildOverlapIndex,IncrementalOverlapIndex,overlapPieces} from '../js/overlaps.js';
import {legacyOverlapPieces} from './overlap_pieces_oracle.mjs';
let seed=74271;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
const coordinate=()=>Math.floor(random()*20)*8-80;
for(let n=0;n<500;n++){
 const routes=Array.from({length:30},(_,id)=>{
  let p=[coordinate(),coordinate()],points=[p];
  for(let i=0;i<8;i++){p=i%2?[coordinate(),p[1]]:[p[0],coordinate()];points.push(p);}
  return {id,points};
 });
 const index=buildOverlapIndex(routes),incremental=new IncrementalOverlapIndex();incremental.update(routes);
 for(const route of routes){assert.deepEqual(overlapPieces(route.points,index),legacyOverlapPieces(route.points,index));assert.deepEqual(overlapPieces(route.points,incremental.index),legacyOverlapPieces(route.points,index));}
}
const index=new Map([['h:0',[{start:0,end:10,count:2},{start:20,end:30,count:1},{start:30,end:40,count:3}]]]);
for(const points of [[[0,0],[40,0]],[[40,0],[0,0]],[[-10,0],[50,0]],[[0,0],[0,0],[40,0]],[[10,0],[20,0]],[[5,0],[35,0]]])assert.deepEqual(overlapPieces(points,index),legacyOverlapPieces(points,index));
assert.deepEqual(overlapPieces([[0,0],[100,0]],new Map()),legacyOverlapPieces([[0,0],[100,0]],new Map()));
for(const points of [[[-0,0],[10,0]],[[10,-0],[-0,-0]],[[0,-0],[0,10]],[[0,10],[0,-0]]])assert.deepEqual(overlapPieces(points,new Map()),legacyOverlapPieces(points,new Map()));
console.log('PASS: 15,000 overlap paths match the prior splitter exactly, including reverse travel, gaps, count-one runs, clipping and distance offsets');
