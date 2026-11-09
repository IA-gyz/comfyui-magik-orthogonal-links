import {pruneDetours,nudgeLanes,validateRoute} from './geometry.js';

// Equivalent to the UI's sequential finishing passes, but the scene crosses the
// worker boundary once. No graph objects or persisted route records are mutated.
export function postprocessBatch({records,rects,nodeRects,references,options,lanePasses,stage}) {
  const nodes=new Map(nodeRects),refs=new Map(references),results=records.map(record=>({...record}));
  let removedCorners=0,nudgedSegments=0;
  const forRoute=record=>({...options,references:[...refs].filter(([id])=>id!==record.id).map(([,ref])=>ref),exemptStart:[nodes.get(record.sourceId)],exemptEnd:[nodes.get(record.targetId)]});
  const remember=record=>refs.set(record.id,{points:record.points,origin:refs.get(record.id)?.origin});
  if(!stage || stage==="polish")for(const record of results){
    const polished=pruneDetours(record.points,rects,forRoute(record));
    removedCorners+=Math.max(0,record.points.length-polished.points.length);
    record.points=polished.points;record.report=polished.report;remember(record);
  }
  if(!stage || stage==="nudge")for(let pass=0;pass<lanePasses;pass++)for(const record of results){
    const nudged=nudgeLanes(record.points,rects,forRoute(record));
    record.points=nudged.points;record.report=nudged.report;nudgedSegments+=nudged.nudged;remember(record);
  }
  if(!stage || stage==="validate")for(const record of results)record.report=validateRoute(record.points,rects,forRoute(record));
  return {results,removedCorners,nudgedSegments};
}
