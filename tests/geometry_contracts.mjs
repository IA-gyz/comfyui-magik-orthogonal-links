import {WorkerDecoder} from '../js/worker_transport.js';
import {postprocessBatch} from '../js/postprocess_batch.js';
import {buildOverlapIndex,overlapPieces} from '../js/overlaps.js';
import {LOCKED_PATTERNS,lockedPatternStyle} from '../js/locked_patterns.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {autoRoute,manualRoute,bend,simplify,midpoint,translateSegment,translateCorner,cornerDragTarget,deleteCorner,avoidNodes,pathLength,segmentBlocked,reversalCount,optimalRoute,preferredEdgeCost,validateRoute,finalizeAutomaticRoute,pruneDetours,nudgeLanes,routeWithValidation,buildAvoidingPath} from '../js/geometry.js';
const orthogonal=pts=>pts.slice(1).every((p,i)=>p[0]===pts[i][0] || p[1]===pts[i][1]);
let seed=13871;
const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
for(let i=0;i<10000;i++) {
 const a=[Math.floor(random()*2000-1000),Math.floor(random()*2000-1000)],b=[Math.floor(random()*2000-1000),Math.floor(random()*2000-1000)];
 for(const pts of [autoRoute(a,b),manualRoute(a,b,[[30,40],[-70,130],[250,-60]]),bend(a,b,true),bend(a,b,false)]) {
  assert(orthogonal(pts));assert.equal(reversalCount(pts),0);assert.deepEqual(pts[0],a);assert.deepEqual(pts.at(-1),b);assert(midpoint(pts).every(Number.isFinite));
 }
}
assert.deepEqual(simplify([[0,0],[10,0],[20,0]]),[[0,0],[20,0]]);
assert.deepEqual(simplify([[0,0],[20,0],[10,0]]),[[0,0],[10,0]]);
assert.deepEqual(simplify([[0,0],[20,0],[0,0]]),[[0,0]]);
assert.deepEqual(simplify([[0,0],[20,0],[10,0]],[[20,0]]),[[0,0],[10,0]]);
const sample=[[0,0],[100,0],[100,100],[200,100],[200,200],[300,200]];
assert.deepEqual(translateSegment(sample,2,25,40),[[100,0],[100,140],[200,140],[200,200]]);
assert.deepEqual(translateCorner(sample,2,25,40),[[125,0],[125,140],[200,140],[200,200]]);
assert.deepEqual(translateSegment(sample,1,40,80),[[140,0],[140,100],[200,100],[200,200]]);
const mergePath=[[0,0],[100,0],[100,100],[200,100],[200,200],[300,200]];
assert.deepEqual(cornerDragTarget(mergePath,2,104,103,8),{point:[200,200],mergeIndex:4});
assert.equal(cornerDragTarget(mergePath,2,104,103,4).mergeIndex,null);
assert.deepEqual(translateCorner(mergePath,2,100,100),[[200,0],[200,200]]);
assert.deepEqual(translateCorner(mergePath,2,0,-100),[[100,0],[200,0],[200,200]]);
assert.deepEqual(mergePath,[[0,0],[100,0],[100,100],[200,100],[200,200],[300,200]]);
for(let i=1;i<sample.length-1;i++)assert(orthogonal(manualRoute(sample[0],sample.at(-1),translateCorner(sample,i,17,-31))));
for(let i=0;i<sample.length-1;i++)assert(orthogonal(manualRoute(sample[0],sample.at(-1),translateSegment(sample,i,17,-31))));
assert.deepEqual(simplify([[0,0],[50,0],[100,0]],[[50,0]]),[[0,0],[50,0],[100,0]]);
assert(manualRoute([0,0],[500,100],[[150,0],[200,0],[200,100]],24,[[150,0]]).some(p=>p[0]===150&&p[1]===0));
assert.deepEqual(deleteCorner([[0,0],[50,0],[100,0]],1),[[0,0],[100,0]]);
assert.deepEqual(deleteCorner([[0,0],[100,0],[100,100]],1),[[0,0],[0,100],[100,100]]);
for(let i=1;i<sample.length-1;i++)assert(orthogonal(deleteCorner(sample,i)));
// Removing a particular handle must preserve other authored aligned handles.
const authoredCorners=[[0,0],[25,0],[50,0],[100,0],[100,100],[150,100],[200,100]];
assert.deepEqual(deleteCorner(authoredCorners,2),[[0,0],[25,0],[100,0],[100,100],[150,100],[200,100]]);
const deletedBend=deleteCorner(authoredCorners,4);
for(const p of [[25,0],[50,0],[100,0],[150,100]])assert(deletedBend.some(q=>q[0]===p[0]&&q[1]===p[1]));
assert(!deletedBend.some(p=>p[0]===100&&p[1]===100));assert(orthogonal(deletedBend));
assert.deepEqual(authoredCorners,[[0,0],[25,0],[50,0],[100,0],[100,100],[150,100],[200,100]]);

const obstacle=[[80,-20,120,20]],straight=[[0,0],[200,0]];
const avoided=avoidNodes(straight,obstacle);
assert.equal(avoided.detours,1);assert.equal(avoided.fallbacks,0);assert(orthogonal(avoided.points));
assert(avoided.points.slice(1).every((p,i)=>!segmentBlocked(avoided.points[i],p,obstacle)));
assert.equal(pathLength(avoided.points),240);
assert.deepEqual(avoidNodes(straight,obstacle,{maxExtra:10,maxFactor:4}).points,straight);
assert.deepEqual(avoidNodes(straight,obstacle,{maxExtra:400,maxFactor:1.1}).points,straight);
assert.deepEqual(avoidNodes(straight,[[-10,-10,10,10]]).points,straight);
const wall=[[80,-1000,120,1000]];
assert.deepEqual(avoidNodes(straight,wall).points,straight);
const two=[[50,-20,90,20],[110,-30,150,30]];
const multi=avoidNodes(straight,two);
assert.equal(multi.fallbacks,0);assert(orthogonal(multi.points));assert(multi.points.slice(1).every((p,i)=>!segmentBlocked(multi.points[i],p,two)));
const enclosed=[[-20,-20,20,-10],[-20,10,20,20],[-20,-20,-10,20],[10,-20,20,20]];
assert.equal(avoidNodes(straight,enclosed).fallbacks,1);
// Source and destination clearance boxes allow their short socket segments.
const startBox=[-10,-10,10,10],endBox=[190,-10,210,10];
const socketPath=[[0,0],[24,0],[176,0],[200,0]];
assert.equal(avoidNodes(socketPath,[startBox,endBox],{exemptStart:[startBox],exemptEnd:[endBox]}).fallbacks,0);
assert.equal(reversalCount(manualRoute([0,0],[300,0],[[-50,0],[350,0]],24,[[-50,0],[350,0]])),0);
const optimal=optimalRoute([0,0],[200,0],obstacle);
assert(!optimal.fallback);assert.equal(pathLength(optimal.points),240);assert.equal(reversalCount(optimal.points),0);
assert(optimal.points.slice(1).every((p,i)=>!segmentBlocked(optimal.points[i],p,obstacle)));
assert.deepEqual(optimalRoute([0,0],[200,0],[]).points,[[0,0],[200,0]]);
assert(optimalRoute([0,0],[200,0],wall).fallback);
const backwards=optimalRoute([200,0],[0,0],[]);
assert(!backwards.fallback);assert.equal(reversalCount(backwards.points),0);assert(orthogonal(backwards.points));
const parallel={points:[[24,0],[176,0]]};
const spacingPolicy={laneDistance:20,references:[parallel]};
assert(preferredEdgeCost([24,10],[176,10],spacingPolicy)>preferredEdgeCost([24,20],[176,20],spacingPolicy));
const cross=validateRoute([[0,0],[200,0]],[],{references:[{points:[[100,-50],[100,0],[100,50]]}]});
assert.equal(cross.crossings,1);
assert.equal(validateRoute([[0,0],[100,0],[100,50]],[],{references:[{points:[[100,-50],[100,0]]}]}).crossings,0);
assert.equal(validateRoute([[0,0],[100,0]],[],{references:[{points:[[100,0],[200,0]]}]}).overlaps,0);
assert.equal(validateRoute([[0,0],[100,0]],[],{references:[{points:[[0,4],[100,4]]}],laneDistance:8}).laneViolations,1);
assert.equal(validateRoute([[0,0],[100,0]],[[40,-20,60,20]]).nodeHits,1);
const verified=finalizeAutomaticRoute([0,0],[200,0],[[0,0],[200,0]],[[80,-20,120,20]],{maxExtra:400,maxFactor:2});
assert.equal(verified.report.nodeHits,0);assert.equal(verified.report.reversals,0);
const staircase=[[0,0],[100,0],[100,40],[110,40],[110,120],[200,120],[200,100],[300,100]];
const polished=pruneDetours(staircase,[],{});
assert(polished.points.length<staircase.length);assert.equal(polished.report.corners,2);assert.equal(polished.report.reversals,0);
assert(pathLength(polished.points)<=pathLength(staircase));
const protectedObstacle=[[90,10,120,90]];
const aroundObstacle=[[0,0],[150,0],[150,100],[300,100]];
const stillClear=pruneDetours(aroundObstacle,protectedObstacle,{});
assert.equal(stillClear.report.nodeHits,0);
const manyObstacles=Array.from({length:48},(_,i)=>[40+i*10,10+i*3,47+i*10,12+i*3]);
const sparseClear=optimalRoute([0,0],[1000,300],manyObstacles,{maxExtra:600,maxFactor:2});assert(!sparseClear.fallback);assert.equal(validateRoute(sparseClear.points,manyObstacles).nodeHits,0);
const lanePath=[[0,0],[100,0],[100,100],[300,100],[300,200],[400,200]];
const laneOptions={laneDistance:12,maxExtra:400,maxFactor:2,references:[{points:[[80,100],[320,100]]}]};
const lanes=nudgeLanes(lanePath,[],laneOptions);
assert(lanes.nudged>0);assert(lanes.report.overlapLength<validateRoute(lanePath,[],laneOptions).overlapLength);assert.equal(lanes.report.laneDeficit,0);assert.equal(lanes.report.reversals,0);
assert.deepEqual(nudgeLanes(lanePath,[],{laneDistance:0,references:laneOptions.references}).points,lanePath);
const wallPinned=[[0,0],[100,0]];assert.deepEqual(nudgeLanes(wallPinned,[],laneOptions).points,wallPinned);
assert.equal(LOCKED_PATTERNS.length,18);
for(const name of LOCKED_PATTERNS){const style=lockedPatternStyle(name,1000,1);assert(Number.isFinite(style.offset));assert(style.alpha>=0&&style.alpha<=1);assert(style.dash.every(v=>Number.isFinite(v)&&v>=0));}
assert.notEqual(lockedPatternStyle('Marching stripes',0,1).offset,lockedPatternStyle('Marching stripes',100,1).offset);
assert.notEqual(lockedPatternStyle('Pulse',0,1).alpha,lockedPatternStyle('Pulse',250,1).alpha);
assert.equal(lockedPatternStyle('Marching stripes',1000,0).animated,false);
assert.deepEqual(lockedPatternStyle('Unknown'),lockedPatternStyle('Stripes'));
for(const name of LOCKED_PATTERNS.slice(8)) {
 const style=lockedPatternStyle(name,175,1);assert(style.animated);assert.equal(lockedPatternStyle(name,175,0).animated,false);
 for(const layer of style.layers ?? [style]){assert(Number.isFinite(layer.offset));assert(layer.alpha>=0&&layer.alpha<=1);assert(layer.dash.every(v=>v>=0&&Number.isFinite(v)));}
 assert.notDeepEqual(lockedPatternStyle(name,0,1),lockedPatternStyle(name,175,1));
}
assert.equal(lockedPatternStyle('Comet trail',100,1).layers.length,3);
assert.equal(lockedPatternStyle('Twin comets',100,1).layers.length,6);
const overlapIndex=buildOverlapIndex([{id:1,points:[[0,0],[100,0]]},{id:2,points:[[100,0],[0,0]]},{id:3,points:[[25,0],[75,0]]},{id:4,points:[[50,-10],[50,10]]},{id:5,points:[[0,2],[100,2]]}]);
assert.deepEqual(overlapPieces([[0,0],[100,0]],overlapIndex).map(p=>p.count),[2,3,2]);
assert.deepEqual(overlapPieces([[100,0],[0,0]],overlapIndex).map(p=>p.distance),[0,25,75]);
assert.equal(overlapPieces([[50,-10],[50,10]],overlapIndex)[0].count,1);
assert.equal(overlapPieces([[0,2],[100,2]],overlapIndex)[0].count,1);
const splitSame=buildOverlapIndex([{id:1,points:[[0,0],[50,0],[100,0]]}]);assert.equal(overlapPieces([[0,0],[100,0]],splitSame)[0].count,1);
const wideNodes=[[-300,100,300,250],[-300,300,300,450]];
const budgetLimited=routeWithValidation([0,0],[0,600],wideNodes,{maxExtra:100,maxFactor:1.1});
assert(budgetLimited.report.nodeHits>0);
const strictClear=routeWithValidation([0,0],[0,600],wideNodes,{maxExtra:100,maxFactor:1.1,strictAvoidance:true});
assert.equal(strictClear.report.nodeHits,0);assert(strictClear.relaxedLimits);
const previewPath=[[0,0],[0,600],[100,600]];
assert(avoidNodes(previewPath,wideNodes,{maxExtra:100,maxFactor:1.1}).fallbacks>0);
const strictPreview=avoidNodes(previewPath,wideNodes,{maxExtra:100,maxFactor:1.1,strictAvoidance:true});
assert.equal(strictPreview.fallbacks,0);assert.equal(validateRoute(strictPreview.points,wideNodes).nodeHits,0);
assert.deepEqual(strictPreview.points[0],previewPath[0]);assert.deepEqual(strictPreview.points.at(-1),previewPath.at(-1));
const strictEnclosed=[[-10,-10,10,10]];
assert(avoidNodes([[0,0],[100,0]],strictEnclosed,{strictAvoidance:true}).fallbacks>0);

// A nearby obstacle contains the normal 24-unit socket adapter, but a
// shorter departure can turn around it. Saved rendering must preserve it.
const closeObstacle=[[10,-20,80,60]];
const closeRoute=routeWithValidation([0,0],[200,100],closeObstacle,{strictAvoidance:true});
assert.equal(closeRoute.report.nodeHits,0);
const closeRendered=manualRoute([0,0],[200,100],closeRoute.points.slice(1,-1));
assert.equal(validateRoute(closeRendered,closeObstacle).nodeHits,0);
assert.deepEqual(closeRendered,closeRoute.points);
// Custom inset sockets: short-stub retries cannot escape their owning node.
const insetRects=[[-100,-50,40,50],[160,150,300,250]];
const insetOptions={strictAvoidance:true,exemptStart:[insetRects[0]],exemptEnd:[insetRects[1]]};
const insetResult=routeWithValidation([0,0],[200,200],insetRects,insetOptions);
assert.equal(insetResult.report.nodeHits,0);
assert.equal(validateRoute(manualRoute([0,0],[200,200],insetResult.points.slice(1,-1)),insetRects,insetOptions).nodeHits,0);
const adapterRects=[[-50,-50,50,50],[60,-20,80,20]];
const adapterPath=[[0,0],[100,0],[100,100],[200,100]];
const adapterLocal=avoidNodes(adapterPath,adapterRects,{exemptStart:[adapterRects[0]]});
assert.equal(adapterLocal.fallbacks,0);
assert(validateRoute(adapterLocal.points,adapterRects,{exemptStart:[adapterRects[0]]}).nodeHits>0);
assert.equal(routeWithValidation([0,0],[200,100],adapterRects,{strictAvoidance:true,exemptStart:[adapterRects[0]]}).report.nodeHits,0);
// The shared builder validates local detours and replaces buried waypoints.
const builtAdapter=buildAvoidingPath(adapterPath,adapterRects,{strictAvoidance:true,exemptStart:[adapterRects[0]]});
assert.equal(builtAdapter.report.nodeHits,0);assert.equal(builtAdapter.strategy,'global');
const buriedPath=[[0,0],[100,0],[100,100],[200,100]];
const buriedRects=[[80,-20,120,80]];
const builtBuried=buildAvoidingPath(buriedPath,buriedRects,{strictAvoidance:true});
assert.equal(builtBuried.report.nodeHits,0);assert(orthogonal(builtBuried.points));
assert.deepEqual(builtBuried.points[0],buriedPath[0]);assert.deepEqual(builtBuried.points.at(-1),buriedPath.at(-1));
const untouched=buildAvoidingPath(sample,[],{strictAvoidance:true});
assert.equal(untouched.strategy,'unchanged');assert.deepEqual(untouched.points,sample);
const freeBuilt=buildAvoidingPath(previewPath,wideNodes,{strictAvoidance:true,freeEndpoint:true,maxExtra:100,maxFactor:1.1});
assert.equal(freeBuilt.report.nodeHits,0);assert.deepEqual(freeBuilt.points.at(-1),previewPath.at(-1));

console.log('PASS: existing 10,000-case geometry and routing contracts');
