import assert from 'node:assert/strict';
import {optimalRoute,pathLength,preferredEdgeCost,validateRoute,pruneDetours,nudgeLanes} from '../js/geometry.js';
import {selectNativeCandidate} from '../js/libavoid_backend.js';
const selectedRail=points=>points[1][0];
const target=[340,55],references=[{points:[[0,114],[200,114],[200,55],target]}];
for(const y of [14,34,54,74,94,114]) {
 const a=[0,y],preferences={laneDistance:18,references,};
 const options={laneDistance:18,preferences,maxExtra:600,maxFactor:2};
 const route=optimalRoute(a,target,[],options);
 assert.equal(pathLength(route.points),340+Math.abs(y-55));
 assert(route.points.length<=4,'Converging routes must remain compact');
 assert.equal(route.points[1][0],286,'Fan-in routes share the same approach rail');
 assert.equal(selectedRail(route.points),286);
 assert.deepEqual(nudgeLanes(route.points,[],{...options,references}).points,route.points,'Nudging preserves the rail');
 const loop=[a,[100,y],[100,-100],[280,-100],[280,55],target];
 const selected=selectNativeCandidate(a,target,loop,[],options);
 assert.equal(pathLength(selected.points),340+Math.abs(y-55));
 assert.equal(selected.points[1][0],286);
 const polished=pruneDetours(loop,[],{...options,references});
 assert(pathLength(polished.points)<pathLength(loop));
 references.push({points:route.points});
}
const ref={points:[[0,20],[200,20],[200,0],[300,0]]};
const opts={laneDistance:18,sourceOrigin:[0,0],targetOrigin:[300,0],references:[ref]};
assert.equal(preferredEdgeCost([270,0],[300,0],opts,[],600),30,'Shared socket tail is exempt');
assert.equal(validateRoute([[270,0],[300,0]],[],{references:[ref],laneDistance:18}).laneViolations,0);
assert.equal(preferredEdgeCost([270,0],[300,0],opts,[],600),preferredEdgeCost([270,0],[285,0],opts,[],600)+preferredEdgeCost([285,0],[300,0],opts,[],600));
assert(preferredEdgeCost([50,20],[150,20],{...opts},[],600)>100,'Interior overlaps still count');
console.log('PASS: six collapsed-input routes, native detour rejection, cleanup, shared socket exemptions and subdivision-invariant costs.');

const blocked=optimalRoute([0,14],target,[[270,0,295,40]],{preferences:{laneDistance:18,references},maxExtra:600,maxFactor:2});
assert.equal(validateRoute(blocked.points,[[270,0,295,40]]).nodeHits,0,'Blocked rail falls back to obstacle search');

// Top-level spacing takes precedence over nested/legacy options in both engines.
const laneOverride={laneDistance:0,preferences:{laneDistance:99,references},maxExtra:600,maxFactor:2};
const zeroLane=optimalRoute([0,14],target,[],laneOverride);
assert.equal(zeroLane.points[1][0],292);
const zeroNative=selectNativeCandidate([0,14],target,[[0,14],[100,14],[100,55],target],[],laneOverride);
assert.deepEqual(zeroNative.points,zeroLane.points);
// Removed settings must have no effect, even if an older caller supplies them.
const obsolete={fewestCorners:true,fewestCrossings:true,avoidOverlap:true,highways:true,alongNodes:true};
assert.deepEqual(optimalRoute([0,14],target,[],{...laneOverride,preferences:{...laneOverride.preferences,...obsolete}}).points,zeroLane.points);

const unrelatedRail=nudgeLanes([[0,0],[100,0],[100,100],[400,100]],[],{laneDistance:12,references:[{points:[[0,20],[100,20],[100,120],[350,120],[350,100],[400,100]]}]});
assert(unrelatedRail.nudged>0,'A common endpoint must not suppress ordinary interior lane nudging');
