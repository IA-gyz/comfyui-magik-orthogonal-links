// Frozen pre-v0.4.6 exhaustive validator for equivalence tests.
import {simplify,reversalCount} from "../js/routing_primitives.js";
function segmentBlocked(a,b,rects) {
 return rects.some(r=>a[1]===b[1]
  ? a[1]>r[1] && a[1]<r[3] && Math.max(a[0],b[0])>r[0] && Math.min(a[0],b[0])<r[2]
  : a[0]>r[0] && a[0]<r[2] && Math.max(a[1],b[1])>r[1] && Math.min(a[1],b[1])<r[3]);
}
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

export function legacyValidateRoute(points,rects,{references=[],laneDistance=0,exemptStart=[],exemptEnd=[]}={}) {
  const clean=simplify(points),report={corners:Math.max(0,clean.length-2),reversals:reversalCount(points),redundant:points.length-clean.length,nodeHits:0,crossings:0,laneViolations:0,overlaps:0,overlapLength:0,laneViolationLength:0,laneDeficit:0};
  const referencePaths=references.map(ref=>simplify(ref.points));
  for(let i=0;i<clean.length-1;i++) {
    const a=clean[i],b=clean[i+1];
    const obstacles=rects.filter(r=>!(i===0&&exemptStart.includes(r)) && !(i===clean.length-2&&exemptEnd.includes(r)));
    if(segmentBlocked(a,b,obstacles))report.nodeHits++;
    for(const other of referencePaths) {
      for(let j=0;j<other.length-1;j++) {
        const c=other[j],d=other[j+1],horizontal=a[1]===b[1],parallel=horizontal===(c[1]===d[1]);
        if(!parallel) {
          const x=horizontal?c[0]:a[0],y=horizontal?a[1]:c[1];
          const insideFirst=horizontal?x>Math.min(a[0],b[0])&&x<Math.max(a[0],b[0]):y>Math.min(a[1],b[1])&&y<Math.max(a[1],b[1]);
          const insideOther=horizontal?y>Math.min(c[1],d[1])&&y<Math.max(c[1],d[1]):x>Math.min(c[0],d[0])&&x<Math.max(c[0],d[0]);
          if(insideFirst&&insideOther)report.crossings++;
        } else {
          const span=spacedSpan(a,b,c,d,[clean[0],clean.at(-1)],[other[0],other.at(-1)],laneDistance);
          const gap=horizontal?Math.abs(a[1]-c[1]):Math.abs(a[0]-c[0]);
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
