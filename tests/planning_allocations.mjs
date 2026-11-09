// V8 allocation sampling includes objects reclaimed during the sample. Run
// with the same arguments as performance.mjs; estimates are not exact bytes.
import {Session} from 'node:inspector';
const {canvas,remote}=await import('./performance.mjs');
remote.pos=[2000,2000];for(let i=0;i<80;i++)canvas.drawConnections();
const session=new Session();session.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
try {
 await post('HeapProfiler.startSampling',{samplingInterval:8192,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 const frames=400;for(let i=0;i<frames;i++)canvas.drawConnections();
 const {profile}=await post('HeapProfiler.stopSampling');
 const bytes=node=>node.selfSize+node.children.reduce((sum,child)=>sum+bytes(child),0);
 const estimatedBytes=bytes(profile.head);
 console.log(JSON.stringify({frames,estimatedBytes,estimatedBytesPerFrame:estimatedBytes/frames,samplingInterval:8192}));
}finally{session.disconnect();}
