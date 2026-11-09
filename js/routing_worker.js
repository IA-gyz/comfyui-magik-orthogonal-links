import { validateRoute, pruneDetours, nudgeLanes, routeWithValidation } from './geometry.js';
import {routeSharedLibavoid} from './libavoid_scene.js';
import {postprocessBatch} from './postprocess_batch.js';
import {routeWithLibavoid} from './libavoid_backend.js';
import {WorkerDecoder} from './worker_transport.js';
const transport=new WorkerDecoder();
// Frontends may enumerate helper JS files as extension modules. Never replace
// the page message handler when this worker entry is imported on the main thread.
if(typeof window==="undefined" && typeof self!=="undefined")self.onmessage=async ({data})=>{
  try {
    data=transport.decode(data);
    if(data.action==="finishBatch") {self.postMessage(postprocessBatch(data));return;}
    if(data.action==="routeBatch") {self.postMessage(await routeSharedLibavoid(data.snapshot));return;}
    if(data.action==="nudge") {self.postMessage(nudgeLanes(data.points,data.rects,data.options));return;}
    if(data.action==="polish") {self.postMessage(pruneDetours(data.points,data.rects,data.options));return;}
    if(data.action==="validate") {self.postMessage({report:validateRoute(data.points,data.rects,data.options)});return;}
    self.postMessage(data.options?.backend==="libavoid"?await routeWithLibavoid(data.a,data.b,data.rects,data.options):routeWithValidation(data.a,data.b,data.rects,data.options));
  } catch(error) {self.postMessage({error:String(error?.message ?? error)});}
};
