// Shared graph-space geometry predicates; no UI or search dependencies.
export const copy = p => [Number(p[0]), Number(p[1])];
export function simplify(points, protectedPoints=[]) {
  const out=[];
  for(const raw of points) {
    const p=copy(raw);if(!Number.isFinite(p[0]) || !Number.isFinite(p[1]))continue;
    const last=out[out.length-1];
    if(last && last[0]===p[0] && last[1]===p[1])continue;
    out.push(p);
    while(out.length>=3) {
      const length=out.length,a=out[length-3],b=out[length-2],c=out[length-1];
      const collinear=(a[0]===b[0]&&b[0]===c[0]) || (a[1]===b[1]&&b[1]===c[1]);
      const reverse=(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0;
      if(!collinear || (!reverse && protectedPoints.some(p=>p[0]===b[0]&&p[1]===b[1])))break;
      out[length-2]=c;out.pop();
      const previous=out[out.length-2];
      if(previous && c[0]===previous[0] && c[1]===previous[1])out.pop();
    }
  }
  return out;
}
export function reversalCount(points) {
  let count=0;
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    if(((a[0]===b[0]&&b[0]===c[0]) || (a[1]===b[1]&&b[1]===c[1])) &&
       (b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)count++;
  }
  return count;
}
export const pathLength=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.abs(p[0]-points[i][0])+Math.abs(p[1]-points[i][1]),0);
export const segmentHitsRectangle=(a,b,r)=>a[1]===b[1]
    ? a[1]>r[1] && a[1]<r[3] && Math.max(a[0],b[0])>r[0] && Math.min(a[0],b[0])<r[2]
    : a[0]>r[0] && a[0]<r[2] && Math.max(a[1],b[1])>r[1] && Math.min(a[1],b[1])<r[3];
// Exemptions use rectangle identity, matching the previous filter-based scan.
export function segmentBlocked(a,b,rects,exemptStart,exemptEnd) {
  for(const r of rects){
    if(exemptStart?.includes(r) || exemptEnd?.includes(r))continue;
    if(segmentHitsRectangle(a,b,r))return true;
  }
  return false;
}
