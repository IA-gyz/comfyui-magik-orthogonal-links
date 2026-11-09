// libavoid's constraint solver is sensitive to large absolute coordinates.
// Work near the origin; retain graph coordinates outside the native boundary.
export function nativeOrigin(rects,points=[]){
  const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
  const include=p=>{for(let axis=0;axis<2;axis++)if(Number.isFinite(p[axis])){lo[axis]=Math.min(lo[axis],p[axis]);hi[axis]=Math.max(hi[axis],p[axis]);}};
  for(const r of rects){include(r);include([r[2],r[3]]);}
  for(const p of points)include(p);
  return lo.map((v,axis)=>{
    const origin=Math.round((v/2+hi[axis]/2)/1024)*1024;
    return Number.isFinite(origin)?origin:0;
  });
}
export const localPoint=(p,origin)=>[p[0]-origin[0],p[1]-origin[1]];
export const localRectangle=(r,origin)=>[r[0]-origin[0],r[1]-origin[1],r[2]-origin[0],r[3]-origin[1]];
