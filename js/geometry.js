import {copy,simplify,reversalCount,pathLength,segmentBlocked,segmentHitsRectangle} from "./routing_primitives.js";
export {copy,simplify,reversalCount,pathLength,segmentBlocked} from "./routing_primitives.js";
import {buildVisibilityGraph} from "./visibility_graph.js";
import {searchVisibilityGraph} from "./route_search.js";
import {ReferenceSegments} from "./reference_segments.js";
export {buildSparseVisibility} from "./visibility_graph.js";
// Pure geometry. Coordinates are in graph space.
export function bend(a,b,horizontalFirst=true) {
  return simplify([a, horizontalFirst ? [b[0],a[1]] : [a[0],b[1]], b]);
}
export function autoRoute(a,b,stub=24) {
  if (b[0] >= a[0]+2*stub) {
    const x = (a[0]+b[0])/2;
    return simplify([a,[x,a[1]],[x,b[1]],b]);
  }
  const y = Math.min(a[1],b[1])-Math.max(40,stub*2);
  return simplify([a,[a[0]+stub,a[1]],[a[0]+stub,y],[b[0]-stub,y],[b[0]-stub,b[1]],b]);
}
export function manualRoute(a,b,corners,stub=24,protectedPoints=[]) {
  if(!corners.length)return autoRoute(a,b,stub);
  // Retain short socket adapters when nearby obstacles leave less than the
  // default stub length. Reattaching a saved route must not extend it into a node.
  const first=corners[0],lastCorner=corners.at(-1);
  const startStub=first[1]===a[1] && first[0]>a[0]?Math.min(stub,first[0]-a[0]):stub;
  const endStub=lastCorner[1]===b[1] && lastCorner[0]<b[0]?Math.min(stub,b[0]-lastCorner[0]):stub;
  const start=[a[0]+startStub,a[1]],end=[b[0]-endStub,b[1]],out=[copy(a),start];
  for(const p of corners) {
    const last=out.at(-1);
    if(out.length===2 && p[0]<start[0] && p[1]===start[1]) {
      // A backwards waypoint on the socket row needs a rectangular detour.
      const y=start[1]-Math.max(24,stub);
      out.push([start[0],y],[p[0],y],copy(p));continue;
    }
    const horizontal=bend(last,p,true).slice(1),vertical=bend(last,p,false).slice(1);
    // Prefer the L orientation that does not reverse the previous segment.
    out.push(...(reversalCount([...out,...vertical])<reversalCount([...out,...horizontal])?vertical:horizontal));
  }
  const last=out.at(-1);
  if(last[1]===b[1] && last[0]>end[0]) {
    const y=b[1]-Math.max(24,stub);
    out.push([last[0],y],[end[0],y],end);
  } else {
    // Approach the input adapter vertically, then enter the input horizontally.
    out.push(...bend(last,end,false).slice(1));
  }
  out.push(copy(b));
  return simplify(out,protectedPoints);
}
export function distanceToSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1], len=dx*dx+dy*dy;
  const t=len ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
export function midpoint(points) {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  let left=lengths.reduce((a,b)=>a+b,0)/2;
  for(let i=0;i<lengths.length;i++) {
    if(left<=lengths[i]) {
      const t=lengths[i] ? left/lengths[i] : 0;
      return [points[i][0]+t*(points[i+1][0]-points[i][0]),points[i][1]+t*(points[i+1][1]-points[i][1])];
    }
    left-=lengths[i];
  }
  return copy(points[0]);
}

// Return editable interior vertices. Socket positions stay fixed; when an
// endpoint's virtual vertex moves, retain it as an interior adapter vertex.
function interior(points,original) {
  const out=points.slice(1,-1);
  if(points[0][0]!==original[0][0] || points[0][1]!==original[0][1]) out.unshift(points[0]);
  if(points.at(-1)[0]!==original.at(-1)[0] || points.at(-1)[1]!==original.at(-1)[1]) out.push(points.at(-1));
  return simplify(out,out);
}
export function translateSegment(points,index,dx,dy) {
  const moved=points.map(copy),a=points[index],b=points[index+1];
  const horizontal=a[1]===b[1];
  for(const i of [index,index+1]) moved[i][horizontal?1:0]+=horizontal?dy:dx;
  return interior(moved,points);
}
export function cornerDragTarget(points,index,dx,dy,radius=0) {
  const point=[points[index][0]+dx,points[index][1]+dy];
  let mergeIndex=null,best=radius*radius;
  for(let i=1;i<points.length-1;i++) {
    if(i===index)continue;
    const distance=(points[i][0]-point[0])**2+(points[i][1]-point[1])**2;
    if(distance<=best && (mergeIndex===null || distance<best)) {best=distance;mergeIndex=i;}
  }
  return {point:mergeIndex===null?point:copy(points[mergeIndex]),mergeIndex};
}
export function translateCorner(points,index,dx,dy) {
  const moved=points.map(copy),p=points[index];
  moved[index]=[p[0]+dx,p[1]+dy];
  // Each adjoining segment retains its orientation. Its remote corner moves
  // on the perpendicular axis, which lengthens/shortens the next segment.
  for(const j of [index-1,index+1]) {
    if(j<0 || j>=points.length)continue;
    const horizontal=points[j][1]===p[1];
    moved[j][horizontal?1:0]=moved[index][horizontal?1:0];
  }
  // A corner dropped onto another corner collapses the intervening loop.
  // Keep one shared vertex and preserve the path on either side of it.
  const target=cornerDragTarget(points,index,dx,dy);
  if(target.mergeIndex!==null) {
    const lo=Math.min(index,target.mergeIndex),hi=Math.max(index,target.mergeIndex);
    moved.splice(lo+1,hi-lo);
  }
  return interior(moved,points);
}

export function deleteCorner(points,index) {
  if(index<=0 || index>=points.length-1)return points.map(copy);
  const before=points[index-1],corner=points[index],after=points[index+1];
  // Aligned neighbours join directly. A real bend requires the opposite elbow
  // to preserve right angles while removing the chosen corner's position.
  const horizontal=before[1]===corner[1];
  const replacement=bend(before,after,!horizontal);
  const remaining=[...points.slice(0,index),...replacement.slice(1,-1),...points.slice(index+1)];
  // Deleting one corner is not a whole-route cleanup. Other deliberately
  // inserted, aligned handles must remain available for subsequent editing.
  return simplify(remaining,remaining);
}

// Topology construction and path search are separate, reusable stages.
function detour(a,b,rects,extraBudget,options={}) {
  const graph=buildVisibilityGraph(a,b,rects,extraBudget,options);
  return graph?searchVisibilityGraph(graph,a,b,rects,extraBudget,{...options,edgeCost:preferredEdgeCost}):null;
}
export function avoidNodes(points,rects,{maxExtra=400,maxFactor=1.75,exemptStart=[],exemptEnd=[],strictAvoidance=false}={}) {
  const base=pathLength(points);
  let remaining=Math.max(0,Math.min(maxExtra,base*(maxFactor-1))),detours=0,fallbacks=0;
  const out=[copy(points[0])];
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1];
    const blockedBy=rects.filter(r=>!(i===0 && exemptStart.includes(r)) && !(i===points.length-2 && exemptEnd.includes(r)));
    if(!segmentBlocked(a,b,blockedBy)){out.push(copy(b));continue;}
    const path=detour(a,b,blockedBy,remaining);
    if(path){remaining-=Math.max(0,pathLength(path)-pathLength([a,b]));out.push(...path.slice(1));detours++;}
    else{out.push(copy(b));fallbacks++;}
  }
  if(fallbacks && strictAvoidance) {
    const extra=sceneEscapeAllowance(points,rects,maxExtra);
    const retry=avoidNodes(points,rects,{maxExtra:extra,maxFactor:Math.max(maxFactor,1+extra/Math.max(1,base)),exemptStart,exemptEnd});
    if(retry.fallbacks<fallbacks)return {...retry,relaxedLimits:true};
  }
  return {points:simplify(out,points),detours,fallbacks};
}


// Automatic whole-connection routing: shortest permitted node-free route,
// then fewest bends. Connections may cross or overlap other connections.
export function optimalRoute(a,b,rects,{stub=24,maxExtra=400,maxFactor=1.75,laneDistance,preferences=null,exemptStart=[],exemptEnd=[]}={}) {
  if(preferences)preferences={...preferences,laneDistance:laneDistance ?? preferences.laneDistance ?? 8,sourceOrigin:copy(a),targetOrigin:copy(b),references:(preferences.references ?? []).map(ref=>({...ref,points:simplify(ref.points),normalized:true}))};
  // Socket positions may be inset in custom/collapsed nodes. Escape the
  // owning node's expanded bounds before asking visibility search to begin.
  let startX=a[0]+stub,endX=b[0]-stub;
  for(const r of exemptStart)if(r && a[1]>r[1] && a[1]<r[3])startX=Math.max(startX,r[2]);
  for(const r of exemptEnd)if(r && b[1]>r[1] && b[1]<r[3])endX=Math.min(endX,r[0]);
  const start=[startX,a[1]],end=[endX,b[1]];
  // Use one deterministic approach rail for simple fan-in routes. It depends
  // only on the destination and spacing, never reference order or native nudges.
  if(preferences && preferences.references.some(ref=>ref.points.at(-1)?.every((v,i)=>v===b[i]))) {
    const rail=Math.min(endX,b[0]-Math.max(stub,48,3*(preferences.laneDistance ?? 0)));
    if(rail>=startX) {
      const points=simplify([a,[rail,a[1]],[rail,b[1]],b]);
      if(!validateRoute(points,rects,{exemptStart,exemptEnd}).nodeHits)
        return {points,fallback:false,compactTerminal:true};
    }
  }
  const baseline=pathLength([a,start])+Math.abs(end[0]-start[0])+Math.abs(end[1]-start[1])+pathLength([end,b]);
  const budget=Math.max(0,Math.min(maxExtra,baseline*(maxFactor-1)));
  let path=detour(start,end,rects,budget,{initialDirection:1,finalDirection:1,outerRails:true,preferences});
  if(!path && preferences)path=detour(start,end,rects,budget,{initialDirection:1,finalDirection:1,outerRails:true});
  if(path)return {points:simplify([a,...path,b]),fallback:false};
  return {points:autoRoute(a,b,stub),fallback:true};
}


// Ignore the unavoidable convergence zone around a shared visible socket.
// Clip intervals, rather than whole edges, so visibility-graph subdivisions
// receive exactly the same cost as an unsplit segment.
function spacedSpan(a,b,c,d,endpoints,reference,lane) {
  const axis=a[1]===b[1]?0:1,other=1-axis;
  let intervals=[[Math.max(Math.min(a[axis],b[axis]),Math.min(c[axis],d[axis])),Math.min(Math.max(a[axis],b[axis]),Math.max(c[axis],d[axis]))]];
  const radius=Math.max(48,3*lane);
  for(const p of endpoints.filter(Boolean)) {
    if(!reference.some(q=>q && Math.abs(p[0]-q[0])<1e-7 && Math.abs(p[1]-q[1])<1e-7))continue;
    if(Math.abs(a[other]-p[other])>radius || Math.abs(c[other]-p[other])>radius)continue;
    const lo=p[axis]-radius,hi=p[axis]+radius;
    intervals=intervals.flatMap(([l,h])=>[[l,Math.min(h,lo)],[Math.max(l,hi),h]]).filter(([l,h])=>h>l);
  }
  return intervals.reduce((n,[l,h])=>n+Math.max(0,h-l),0);
}

export function preferredEdgeCost(a,b,options) {
  const horizontal=a[1]===b[1],length=pathLength([a,b]);
  const lane=Math.max(0,options.laneDistance ?? 8);
  if(!lane)return length;
  let spacing=0;
  for(const ref of options.references ?? [])for(let i=0;i<ref.points.length-1;i++) {
    const c=ref.points[i],d=ref.points[i+1];
    if(horizontal!==(c[1]===d[1]))continue;
    const gap=Math.abs(a[horizontal?1:0]-c[horizontal?1:0]);
    if(gap>=lane)continue;
    spacing+=spacedSpan(a,b,c,d,[options.sourceOrigin,options.targetOrigin],[ref.points[0],ref.points.at(-1)],lane)*(1-gap/lane);
  }
  return length+0.25*spacing;
}


const preparedReferences=Symbol('prepared validation references');
// Candidates within one finishing operation share a fixed reference snapshot.
// Keep this cache local: public callers may mutate their paths between calls.
const prepareValidation=options=>{
  const paths=(options.references ?? []).map(ref=>simplify(ref.points));
  return {...options,[preparedReferences]:new ReferenceSegments(paths)};
};
export function validateRoute(points,rects,options={}) {
  const {references=[],laneDistance=0,exemptStart=[],exemptEnd=[]}=options;
  const clean=simplify(points),report={corners:Math.max(0,clean.length-2),reversals:reversalCount(points),redundant:points.length-clean.length,nodeHits:0,crossings:0,laneViolations:0,overlaps:0,overlapLength:0,laneViolationLength:0,laneDeficit:0};
  const prepared=options[preparedReferences],referencePaths=prepared?.paths ?? references.map(ref=>simplify(ref.points));
  for(let i=0;i<clean.length-1;i++) {
    const a=clean[i],b=clean[i+1];
    if(segmentBlocked(a,b,rects,i===0?exemptStart:undefined,i===clean.length-2?exemptEnd:undefined))report.nodeHits++;
    const candidates=prepared?.query(a,b,laneDistance);
    for(const other of candidates?candidates.map(item=>item.segment):referencePaths){
      for(let j=0;j<other.length-1;j++){
        const c=other[j],d=other[j+1],horizontal=a[1]===b[1],parallel=horizontal===(c[1]===d[1]);
        if(!parallel) {
          const x=horizontal?c[0]:a[0],y=horizontal?a[1]:c[1];
          const insideFirst=horizontal?x>Math.min(a[0],b[0])&&x<Math.max(a[0],b[0]):y>Math.min(a[1],b[1])&&y<Math.max(a[1],b[1]);
          const insideOther=horizontal?y>Math.min(c[1],d[1])&&y<Math.max(c[1],d[1]):x>Math.min(c[0],d[0])&&x<Math.max(c[0],d[0]);
          if(insideFirst&&insideOther)report.crossings++;
        } else {
          const gap=horizontal?Math.abs(a[1]-c[1]):Math.abs(a[0]-c[0]);
          if(gap>=1e-7 && gap>=laneDistance-1e-7)continue;
          const endpoints=other.sourcePath ?? other;
          const span=spacedSpan(a,b,c,d,[clean[0],clean.at(-1)],[endpoints[0],endpoints.at(-1)],laneDistance);
          if(span>0) {
            if(gap<1e-7){report.overlaps++;report.overlapLength+=span;}
            if(gap<laneDistance-1e-7){report.laneViolations++;report.laneViolationLength+=span;report.laneDeficit+=span*(laneDistance-gap);}
          }
        }
      }
    }
  }
  return report;
}
export function finalizeAutomaticRoute(a,b,points,rects,options={}) {
  let full=simplify(manualRoute(a,b,points.slice(1,-1),24,[]));
  let report=validateRoute(full,rects,options);
  // Repair socket attachment collisions using only the remaining original
  // detour budget, then validate the actual geometry the renderer will show.
  const stub=options.stub ?? 24,start=[a[0]+stub,a[1]],end=[b[0]-stub,b[1]];
  const baseline=2*stub+Math.abs(end[0]-start[0])+Math.abs(end[1]-start[1]);
  const allowed=baseline+Math.max(0,Math.min(options.maxExtra ?? 400,baseline*((options.maxFactor ?? 1.75)-1)));
  if(report.nodeHits) {
    const repaired=avoidNodes(full,rects,{maxExtra:Math.max(0,allowed-pathLength(full)),maxFactor:full.length>1?allowed/Math.max(1,pathLength(full)):1,exemptStart:options.exemptStart ?? [],exemptEnd:options.exemptEnd ?? []});
    const candidate=simplify(manualRoute(a,b,repaired.points.slice(1,-1),24,[])),next=validateRoute(candidate,rects,options);
    if(next.nodeHits<report.nodeHits && pathLength(candidate)<=allowed+1e-7) {full=candidate;report=next;}
  }
  return {points:full,report};
}

// Preserve obstacle-array IDs and endpoint exemptions without temporary lists.
function collisionIds(path,rects,options){
  const found=new Set(),last=path.length-2;
  for(let id=0;id<rects.length;id++){
    const rect=rects[id];
    for(let i=0;i<=last;i++){
      if((i===0 && options.exemptStart?.includes(rect)) || (i===last && options.exemptEnd?.includes(rect)))continue;
      if(segmentHitsRectangle(path[i],path[i+1],rect)){found.add(id);break;}
    }
  }
  return found;
}
// Remove whole staircases/doglegs, not just collinear points. Candidates are
// checked after socket attachment for obstacles, direction and soft spacing.
export function pruneDetours(points,rects,options={}) {
  options=prepareValidation(options);
  let current=simplify(points);
  const a=copy(current[0]),b=copy(current.at(-1));
  const check=path=>validateRoute(path,rects,options);
  const collisions=path=>collisionIds(path,rects,options);
  let budget=600;
  for(let pass=0;pass<8 && budget>0;pass++) {
    const before=check(current),beforeHits=collisions(current),beforeLength=pathLength(current);
    let best=current,bestReport=before,bestLength=beforeLength;
    // Prefer large shortcuts; cap candidate checks for worker responsiveness.
    for(let span=current.length-1;span>=2 && budget>0;span--)for(let i=0;i+span<current.length && budget>0;i++) {
      const j=i+span;
      for(const horizontalFirst of [true,false]) {
        if(--budget<0)break;
        const shortcut=bend(current[i],current[j],horizontalFirst);
        const raw=simplify([...current.slice(0,i),...shortcut,...current.slice(j+1)]);
        const candidate=simplify(manualRoute(a,b,raw.slice(1,-1),24,[]));
        const corners=Math.max(0,candidate.length-2),length=pathLength(candidate);
        if(corners>bestReport.corners || (corners===bestReport.corners && length>=bestLength-1e-7))continue;
        // Socket exit/entry directions must still point right.
        if(candidate.length<2 || candidate[1][1]!==a[1] || candidate[1][0]<=a[0] || candidate.at(-2)[1]!==b[1] || candidate.at(-2)[0]>=b[0])continue;
        if(length>beforeLength+1e-7)continue;
        const report=check(candidate);
        if(report.reversals || report.nodeHits>before.nodeHits)continue;
        if([...collisions(candidate)].some(index=>!beforeHits.has(index)))continue;
        if(length+0.25*report.laneViolationLength>beforeLength+0.25*before.laneViolationLength+1e-7)continue;
        best=candidate;bestReport=report;bestLength=length;
      }
    }
    if(best===current)break;current=best;
  }
  return {points:current,report:check(current)};
}

// Separate parallel interior lanes after topology/path search. Socket-attached
// segments remain fixed; conflicts with locks/bounds are left and reported.
export function nudgeLanes(points,rects,options={}) {
  let current=simplify(points),nudged=0,budget=240;
  const policy=options.preferences ?? options,lane=Math.max(0,options.laneDistance ?? policy.laneDistance ?? 8);
  const gap=lane,a=current[0],b=current.at(-1);
  const references=(options.references ?? []).map(ref=>({...ref,points:simplify(ref.points)}));
  const validation=prepareValidation({...options,references});
  const check=path=>validateRoute(path,rects,validation);
  // Preserve the common approach rail selected for unconstrained fan-in.
  let rail=b[0]-Math.max(options.stub ?? 24,48,3*lane);
  for(const r of options.exemptEnd ?? [])if(r && b[1]>r[1] && b[1]<r[3])rail=Math.min(rail,r[0]);
  if(current.length===4 && current[1][0]===rail && current[2][0]===rail && references.some(ref=>ref.points.at(-1)?.every((v,i)=>v===b[i])))
    return {points:current,report:check(current),nudged};
  if(!gap || !references.length)return {points:current,report:check(current),nudged};
  const baseline=48+Math.abs(b[0]-24-a[0]-24)+Math.abs(b[1]-a[1]);
  const allowed=baseline+Math.max(0,Math.min(options.maxExtra ?? 400,baseline*((options.maxFactor ?? 1.75)-1)));
  const obstacleIds=path=>collisionIds(path,rects,options);
  for(let pass=0;pass<4&&budget>0;pass++) {
    const before=check(current),hits=obstacleIds(current);
    let best=current,bestReport=before,bestShift=Infinity;
    for(let i=1;i<current.length-2&&budget>0;i++) {
      const p=current[i],q=current[i+1],horizontal=p[1]===q[1],axis=horizontal?1:0,along=1-axis,offsets=new Set();
      for(const ref of references)for(let j=0;j<ref.points.length-1;j++) {
        const u=ref.points[j],v=ref.points[j+1];if(horizontal!==(u[1]===v[1]))continue;
        const shared=Math.min(Math.max(p[along],q[along]),Math.max(u[along],v[along]))-Math.max(Math.min(p[along],q[along]),Math.min(u[along],v[along]));
        if(shared<=0 || Math.abs(p[axis]-u[axis])>=gap-1e-7)continue;
        offsets.add(u[axis]+gap-p[axis]);offsets.add(u[axis]-gap-p[axis]);
      }
      for(const shift of [...offsets].sort((a,b)=>Math.abs(a)-Math.abs(b))) {
        if(--budget<0)break;
        const interior=translateSegment(current,i,horizontal?0:shift,horizontal?shift:0);
        const candidate=simplify(manualRoute(a,b,interior,24,[]));
        if(candidate.length>current.length || pathLength(candidate)>Math.min(Math.max(allowed,pathLength(current)),pathLength(current)+2*gap)+1e-7)continue;
        const report=check(candidate);
        if(report.reversals || [...obstacleIds(candidate)].some(id=>!hits.has(id)))continue;
        if(lane && report.laneDeficit>before.laneDeficit+1e-7)continue;
        const improved=report.laneDeficit<bestReport.laneDeficit-1e-7 || (Math.abs(report.laneDeficit-bestReport.laneDeficit)<1e-7 && report.overlapLength<bestReport.overlapLength-1e-7);
        const equalBetterShift=best!==current && Math.abs(report.laneDeficit-bestReport.laneDeficit)<1e-7 && Math.abs(report.overlapLength-bestReport.overlapLength)<1e-7 && Math.abs(shift)<bestShift;
        if(!improved&&!equalBetterShift)continue;
        best=candidate;bestReport=report;bestShift=Math.abs(shift);
      }
    }
    if(best===current)break;current=best;nudged++;
  }
  return {points:current,report:check(current),nudged};
}

export function moveRouteEndpoints(points,oldA,oldB,a,b) {
  const path=simplify(points);
  if(path.length<3)return autoRoute(a,b);
  const total=Math.max(1,pathLength(path)),segments=[];let travelled=0;
  const deltaA=[a[0]-oldA[0],a[1]-oldA[1]],deltaB=[b[0]-oldB[0],b[1]-oldB[1]];
  for(let i=0;i<path.length-1;i++) {
    const p=path[i],q=path[i+1],horizontal=p[1]===q[1],length=pathLength([p,q]),t=(travelled+length/2)/total,axis=horizontal?1:0;
    let coordinate=p[axis]+deltaA[axis]*(1-t)+deltaB[axis]*t;
    if(i===0&&horizontal)coordinate=a[1];if(i===path.length-2&&horizontal)coordinate=b[1];
    segments.push({horizontal,coordinate});travelled+=length;
  }
  const result=[copy(a)];
  for(let i=1;i<path.length-1;i++) {
    const left=segments[i-1],right=segments[i];
    if(left.horizontal===right.horizontal)continue;
    result.push(left.horizontal?[right.coordinate,left.coordinate]:[left.coordinate,right.coordinate]);
  }
  result.push(copy(b));return simplify(manualRoute(a,b,result.slice(1,-1),24,[]));
}


// Reduce bounds without spreading scene-sized arrays into function arguments.
function sceneEscapeAllowance(points,rects,minimum=400) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
  for(const r of rects){minX=Math.min(minX,r[0]);maxX=Math.max(maxX,r[2]);minY=Math.min(minY,r[1]);maxY=Math.max(maxY,r[3]);}
  return Math.max(minimum,2*(maxX-minX+maxY-minY)+96);
}

// Never let soft appearance preferences retain avoidable node collisions.
export function routeWithValidation(a,b,rects,options={}) {
  const run=opts=>{
    const route=optimalRoute(a,b,rects,opts);
    return {...route,...finalizeAutomaticRoute(a,b,route.points,rects,{...opts,references:options.preferences?.references ?? []})};
  };
  let best=run(options);
  if(best.report.nodeHits && options.preferences) {
    const clear=run({...options,preferences:null});if(clear.report.nodeHits<best.report.nodeHits)best=clear;
  }
  if(best.report.nodeHits && options.strictAvoidance) {
    // Finite enclosing-scene escape allowance; search limits still apply.
    const extra=sceneEscapeAllowance([a,b],rects,options.maxExtra ?? 400);
    const stub=options.stub ?? 24,base=2*stub+Math.abs(b[0]-stub-a[0]-stub)+Math.abs(b[1]-a[1]);
    const clear=run({...options,preferences:null,maxExtra:extra,maxFactor:Math.max(options.maxFactor ?? 1.75,1+extra/Math.max(1,base))});
    if(clear.report.nodeHits<best.report.nodeHits)best={...clear,relaxedLimits:true};
    // A fixed socket stub can itself end inside a nearby obstacle. More
    // search distance cannot solve that; allow the first bend closer to the port.
    if(best.report.nodeHits)for(const shortStub of [12,4,1]) {
      if(shortStub>=stub)continue;
      const candidate=run({...options,stub:shortStub,preferences:null,maxExtra:extra,maxFactor:1+extra});
      if(candidate.report.nodeHits<best.report.nodeHits)best={...candidate,relaxedLimits:true};
      if(!best.report.nodeHits)break;
    }
  }
  return best;
}

// One entry point for preserving an authored path while avoiding obstacles.
// Automatic layout commands use routeWithValidation directly because they
// intentionally replace all manual geometry and apply appearance preferences.
export function buildAvoidingPath(points,rects,options={}) {
  const original=simplify(points,points);
  const inspect=(path,metadata={})=>({points:path,...metadata,report:validateRoute(path,rects,options)});
  let best=inspect(original,{strategy:"unchanged"});
  if(original.length<2 || !best.report.nodeHits)return best;
  // Compare unique obstructing nodes first: splitting a segment must not
  // make a candidate appear to cross more distinct obstacles.
  const counts=new WeakMap();
  const hitCount=path=>{
    if(counts.has(path))return counts.get(path);
    const clean=simplify(path),start=options.exemptStart ?? [],end=options.exemptEnd ?? [];
    const count=rects.reduce((sum,r)=>sum+(clean.slice(1).some((p,i)=>
      !(i===0 && start.includes(r)) && !(i===clean.length-2 && end.includes(r)) && segmentBlocked(clean[i],p,[r]))?1:0),0);
    counts.set(path,count);return count;
  };
  const improve=candidate=>{
    if(!candidate.report.nodeHits){best=candidate;return;}
    const hits=hitCount(candidate.points),before=hitCount(best.points);
    if(hits<before || (hits===before && (candidate.report.nodeHits<best.report.nodeHits ||
       (candidate.report.nodeHits===best.report.nodeHits && candidate.report.reversals<best.report.reversals))))best=candidate;
  };
  const local=avoidNodes(original,rects,{...options,strictAvoidance:!!options.freeEndpoint && options.strictAvoidance});
  improve(inspect(local.points,{...local,strategy:"local"}));
  if(!best.report.nodeHits || options.freeEndpoint)return best;
  const whole=routeWithValidation(original[0],original.at(-1),rects,options);
  improve({...whole,strategy:"global"});
  return best;
}
