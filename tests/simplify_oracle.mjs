// Frozen v0.4.15 simplifier for equivalence tests.
// Shared graph-space geometry predicates; no UI or search dependencies.
export const copy = p => [Number(p[0]), Number(p[1])];
export function simplify(points, protectedPoints=[]) {
  const out=[];
  for(const raw of points) {
    const p=copy(raw);if(!p.every(Number.isFinite))continue;
    if(out.length && out.at(-1)[0]===p[0] && out.at(-1)[1]===p[1])continue;
    out.push(p);
    while(out.length>=3) {
      const [a,b,c]=out.slice(-3);
      const collinear=(a[0]===b[0]&&b[0]===c[0]) || (a[1]===b[1]&&b[1]===c[1]);
      const reverse=(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0;
      const pinned=protectedPoints.some(p=>p[0]===b[0]&&p[1]===b[1]);
      if(!collinear || (pinned && !reverse))break;
      out.splice(-2,1);
      if(out.length>=2 && out.at(-1)[0]===out.at(-2)[0] && out.at(-1)[1]===out.at(-2)[1])out.pop();
    }
  }
  return out;
}
