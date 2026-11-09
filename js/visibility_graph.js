import {copy,segmentBlocked} from "./routing_primitives.js";

// Obstacle-free graph construction is independent of the search objective.
export function buildVisibilityGraph(a,b,rects,extraBudget,{outerRails=false,preferences=null}={}) {
  const inside=(p,r)=>p[0]>r[0]&&p[0]<r[2]&&p[1]>r[1]&&p[1]<r[3];
  if(rects.some(r=>inside(a,r)||inside(b,r)))return null;
  // Any route within the budget stays within this conservative search window.
  const margin=extraBudget/2;
  const minX=Math.min(a[0],b[0])-margin,maxX=Math.max(a[0],b[0])+margin;
  const minY=Math.min(a[1],b[1])-margin,maxY=Math.max(a[1],b[1])+margin;
  const relevant=rects.filter(r=>r[2]>=minX&&r[0]<=maxX&&r[3]>=minY&&r[1]<=maxY);
  let xs=[...new Set([a[0],b[0],...(outerRails?[minX,maxX,a[0]+Math.min(24,margin),b[0]-Math.min(24,margin)]:[]),...relevant.flatMap(r=>[r[0],r[2]]).filter(x=>x>=minX&&x<=maxX)])].sort((x,y)=>x-y);
  let ys=[...new Set([a[1],b[1],...(outerRails?[minY,maxY,a[1]-Math.min(24,margin),a[1]+Math.min(24,margin),b[1]-Math.min(24,margin),b[1]+Math.min(24,margin)]:[]),...relevant.flatMap(r=>[r[1],r[3]]).filter(y=>y>=minY&&y<=maxY)])].sort((x,y)=>x-y);
  if(preferences) {
    const rails=(preferences.references ?? []).slice(0,24);
    for(const reference of rails) for(const p of reference.points) for(const delta of [-(preferences.laneDistance ?? 8),preferences.laneDistance ?? 8]) {
      const x=p[0]+delta,y=p[1]+delta;
      if(x>=minX&&x<=maxX&&!xs.includes(x)&&(xs.length+1)*ys.length<=4096)xs.push(x);
      if(y>=minY&&y<=maxY&&!ys.includes(y)&&xs.length*(ys.length+1)<=4096)ys.push(y);
    }
    xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);
  }
  // Keep pointer updates bounded even in extremely dense workflows.
  const sparse=xs.length*ys.length>4096?buildSparseVisibility(a,b,relevant,{minX,maxX,minY,maxY}):null;
  if(xs.length*ys.length>4096 && !sparse)return null;
  const width=xs.length,size=sparse?sparse.points.length:width*ys.length,start=sparse?sparse.start:ys.indexOf(a[1])*width+xs.indexOf(a[0]),goal=sparse?sparse.goal:ys.indexOf(b[1])*width+xs.indexOf(b[0]);
  const point=id=>sparse?sparse.points[id]:[xs[id%width],ys[Math.floor(id/width)]];
  const cache=new Map();
  const neighbours=id=>{
    if(cache.has(id))return cache.get(id);
    const x=id%width,y=Math.floor(id/width),candidates=[];
    if(sparse)candidates.push(...sparse.adjacency[id]);
    else {if(x)candidates.push([id-1,3]);if(x+1<width)candidates.push([id+1,1]);if(y)candidates.push([id-width,4]);if(y+1<ys.length)candidates.push([id+width,2]);}
    const result=candidates.filter(([next])=>!segmentBlocked(point(id),point(next),relevant));
    cache.set(id,result);return result;
  };
  return {size,start,goal,point,neighbours,kind:sparse?"sparse-rails":"rails"};
}

// Sparse escape from a Cartesian rail explosion: obstacle corners, endpoint
// projections, frame projections and nearest boundary ray hits. Connect only
// neighbouring visible points on each horizontal/vertical rail.
export function buildSparseVisibility(a,b,rects,{minX,maxX,minY,maxY}) {
  const points=[],lookup=new Map();
  const add=p=>{
    if(p[0]<minX||p[0]>maxX||p[1]<minY||p[1]>maxY || rects.some(r=>p[0]>r[0]&&p[0]<r[2]&&p[1]>r[1]&&p[1]<r[3]))return;
    const key=`${p[0]},${p[1]}`;if(!lookup.has(key)){lookup.set(key,points.length);points.push(copy(p));}
  };
  add(a);add(b);add([a[0],b[1]]);add([b[0],a[1]]);
  for(const r of rects)for(const p of [[r[0],r[1]],[r[0],r[3]],[r[2],r[1]],[r[2],r[3]]])add(p);
  const seeds=points.map(copy);
  for(const [x,y] of seeds) {
    for(const p of [[a[0],y],[b[0],y],[x,a[1]],[x,b[1]],[minX,y],[maxX,y],[x,minY],[x,maxY]])add(p);
  }
  // Ray hits provide turning points at obstacle boundaries without expanding
  // every x/y intersection. Two rounds improve connectivity near obstacles.
  for(let round=0;round<2;round++) {
    const sources=round===0?points.map(copy):points.slice(seeds.length).map(copy);
    for(const [x,y] of sources) {
      let left=minX,right=maxX,up=minY,down=maxY;
      for(const r of rects) {
        if(y>r[1]&&y<r[3]){if(r[2]<=x)left=Math.max(left,r[2]);if(r[0]>=x)right=Math.min(right,r[0]);}
        if(x>r[0]&&x<r[2]){if(r[3]<=y)up=Math.max(up,r[3]);if(r[1]>=y)down=Math.min(down,r[1]);}
      }
      for(const p of [[left,y],[right,y],[x,up],[x,down]])add(p);
      if(points.length>12000)return null;
    }
  }
  const rows=new Map(),cols=new Map(),adjacency=points.map(()=>[]);
  points.forEach((p,id)=>{if(!rows.has(p[1]))rows.set(p[1],[]);if(!cols.has(p[0]))cols.set(p[0],[]);rows.get(p[1]).push(id);cols.get(p[0]).push(id);});
  const join=(groups,axis)=>{for(const ids of groups.values()) {
    ids.sort((i,j)=>points[i][axis]-points[j][axis]);
    for(let i=0;i<ids.length-1;i++) {
      const first=ids[i],second=ids[i+1];if(segmentBlocked(points[first],points[second],rects))continue;
      adjacency[first].push([second,axis===0?1:2]);adjacency[second].push([first,axis===0?3:4]);
    }
  }};
  join(rows,0);join(cols,1);
  const start=lookup.get(`${a[0]},${a[1]}`),goal=lookup.get(`${b[0]},${b[1]}`);
  return start===undefined||goal===undefined?null:{points,adjacency,start,goal};
}

