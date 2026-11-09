// Canvas visible_area is [x,y,width,height] in graph coordinates. Missing or
// invalid viewport information must fail open (exports/custom canvases).
export function viewportBounds(area) {
  if(!area || area.length<4 || !Number.isFinite(area[0]) || !Number.isFinite(area[1]) || !Number.isFinite(area[2]) || !Number.isFinite(area[3]) || area[2]<=0 || area[3]<=0)return null;
  const right=area[0]+area[2],bottom=area[1]+area[3];
  return Number.isFinite(right) && Number.isFinite(bottom)?[area[0],area[1],right,bottom]:null;
}
function segmentVisible(a,b,view,padding) {
  if(!a || !b || !Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1]))return true;
  return Math.min(a[0],b[0])-padding<=view[2] && Math.max(a[0],b[0])+padding>=view[0] && Math.min(a[1],b[1])-padding<=view[3] && Math.max(a[1],b[1])+padding>=view[1];
}
export function pathVisible(points,view,padding=0) {
  if(!view || !Number.isFinite(padding) || padding<0 || !points?.length)return true;
  if(points.length===1)return segmentVisible(points[0],points[0],view,padding);
  for(let i=1;i<points.length;i++)if(segmentVisible(points[i-1],points[i],view,padding))return true;
  return false;
}
export function piecesVisible(pieces,view,width,bordered,scale,edgePixels=2) {
  if(!view || !Number.isFinite(width) || width<=0 || !Number.isFinite(scale) || scale<=0 || !Number.isFinite(edgePixels) || edgePixels<0)return true;
  for(const piece of pieces){
    const padding=piece.count*width/2+(bordered?1:0)+edgePixels/scale;
    if(!Number.isFinite(padding) || segmentVisible(piece.a,piece.b,view,padding))return true;
  }
  return false;
}
