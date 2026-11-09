// Compare two independent canvases in one process, alternating frame order to
// reduce machine-load drift. Source/helper modules remain version-specific.
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const original=[...process.argv],baselineDir=resolve(original[2]??''),count=original[3]??'1000',flags=original.slice(4);
if(!original[2])throw Error('Usage: node tests/paired_performance.mjs BASELINE_JS_DIR COUNT [--manual] [--viewport]');
const savedHelpers=process.env.MAGIK_BENCH_HELPERS;
process.env.MAGIK_BENCH_HELPERS=baselineDir;
process.argv=[original[0],new URL('./performance.mjs',import.meta.url).pathname,count,join(baselineDir,'magik_orthogonal_links.js'),...flags];
const baseline=await import('./performance.mjs?paired-baseline');
delete process.env.MAGIK_BENCH_HELPERS;
process.argv=[original[0],new URL('./performance.mjs',import.meta.url).pathname,count,'-',...flags];
const current=await import('./performance.mjs?paired-current');
process.argv=original;
if(savedHelpers!==undefined)process.env.MAGIK_BENCH_HELPERS=savedHelpers;
const versions={baseline,current};
for(const mod of Object.values(versions))mod.remote.pos=[2000,2000];
const order=i=>i%2?['current','baseline']:['baseline','current'];
for(let i=0;i<80;i++)for(const key of order(i))versions[key].canvas.drawConnections();
const results={baseline:{static:[],local:[]},current:{static:[],local:[]}};
const measure=(key,metric)=>{const start=performance.now();versions[key].canvas.drawConnections();results[key][metric].push(performance.now()-start);};
const geometry=mod=>createHash('sha256').update(JSON.stringify(Object.values(mod.links).map(link=>link.path?.points??null))).digest('hex');
for(let i=0;i<100;i++)for(const key of order(i))measure(key,'static');
assert.equal(geometry(baseline),geometry(current));
for(let i=0;i<30;i++){
 for(const key of order(i)){versions[key].remote.pos=[240,(i%3)*160+10];measure(key,'local');}
 assert.equal(geometry(baseline),geometry(current));
}
const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];
console.log(JSON.stringify({links:Number(count),flags,summary:Object.fromEntries(Object.entries(results).map(([key,value])=>[key,{staticMs:median(value.static),localMs:median(value.local)}])),results}));
