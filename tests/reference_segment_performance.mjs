import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import * as current from '../js/geometry.js';
const baseline=process.argv[2]?await import(pathToFileURL(process.argv[2]).href):null;
const count=Number(process.argv[3]??3000),repeats=Number(process.argv[4]??15);
const points=[[0,0],[80,0]],rects=[];
for(let row=1;row<=16;row++){
 const x=row%2?80:600,y=row*100;
 points.push([x,y]);if(row<16)points.push([row%2?600:80,y]);
 rects.push(row%2?[120,y-70,660,y-30]:[20,y-70,560,y-30]);
}
points.push([720,1600],[800,1600]);
const options={references:Array.from({length:count},(_,i)=>({points:[[0,3000+i*20],[300,3000+i*20],[300,3010+i*20],[800,3010+i*20]]})),laneDistance:12,maxExtra:400,maxFactor:Infinity};
const samples={before:[],after:[]};let expected;
for(let run=-3;run<repeats;run++)for(const version of run%2?['after','before']:['before','after']){
 const module=version==='before'?baseline:current;if(!module)continue;
 const start=performance.now(),result=module.pruneDetours(points,rects,options),elapsed=performance.now()-start;
 expected??=result;assert.deepEqual(result,expected);
 if(run>=0)samples[version].push(elapsed);
}
const median=xs=>xs.length?[...xs].sort((a,b)=>a-b)[xs.length>>1]:null;
console.log(JSON.stringify({references:count,inputCorners:points.length-2,outputCorners:expected.points.length-2,repeats,beforeMs:median(samples.before),afterMs:median(samples.after),samples}));
