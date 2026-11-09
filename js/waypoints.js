import {bend,copy,validateRoute} from './geometry.js';
import {buildVisibilityGraph} from './visibility_graph.js';
import {searchVisibilityGraph} from './route_search.js';

export const inside=(p,r)=>p[0]>r[0]&&p[0]<r[2]&&p[1]>r[1]&&p[1]<r[3];
export const cleanWaypoints=points=>(Array.isArray(points)?points:[]).filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map(copy).filter((p,i,all)=>!i||p[0]!==all[i-1][0]||p[1]!==all[i-1][1]);

function escape(p,towards,rects,direction=0,bodies=rects) {
  const containing=rects.filter(r=>inside(p,r));if(!containing.length)return copy(p);
  const candidates=direction===1?[[1,0]]:direction===-1?[[-1,0]]:[[1,0],[-1,0],[0,1],[0,-1]];
  let best=null,score=Infinity,bestHits=Infinity;
  for(const [dx,dy] of candidates) {
    const q=copy(p);
    for(let i=0;i<=rects.length;i++) {
      const hits=rects.filter(r=>inside(q,r));if(!hits.length)break;
      for(const r of hits)if(dx)q[0]=dx>0?Math.max(q[0],r[2]):Math.min(q[0],r[0]);else q[1]=dy>0?Math.max(q[1],r[3]):Math.min(q[1],r[1]);
    }
    const cost=Math.abs(q[0]-p[0])+Math.abs(q[1]-p[1])+Math.abs(q[0]-towards[0])+Math.abs(q[1]-towards[1]);
    const hits=validateRoute([p,q],bodies.filter(r=>!inside(p,r))).nodeHits;
    if(hits<bestHits || (hits===bestHits && cost<score)){bestHits=hits;score=cost;best=q;}
  }
  return best??copy(p);
}

// Route each span independently: global cleanup/search must never erase a
// mandatory anchor, even when reaching it requires retracing or a node crossing.
export function routeWaypoints(a,b,waypoints,items,{maxExtra=400,clearance=0}={}) {
  const anchors=[a,...waypoints,b],rects=items.map(o=>o.rect),points=[copy(a)],indices=[];
  const bodies=rects.map(r=>[r[0]+clearance,r[1]+clearance,r[2]-clearance,r[3]-clearance]);
  const append=p=>{const last=points.at(-1);if(last[0]!==p[0]||last[1]!==p[1])points.push(copy(p));};
  let minX=Math.min(a[0],b[0]),minY=Math.min(a[1],b[1]),maxX=Math.max(a[0],b[0]),maxY=Math.max(a[1],b[1]);
  for(const r of rects){minX=Math.min(minX,r[0]);minY=Math.min(minY,r[1]);maxX=Math.max(maxX,r[2]);maxY=Math.max(maxY,r[3]);}
  const budget=Math.max(maxExtra,2*(maxX-minX+maxY-minY)+96);
  for(let i=1;i<anchors.length;i++) {
    const from=anchors[i-1],to=anchors[i];
    const start=escape(from,to,rects,i===1?1:0,bodies),end=escape(to,from,rects,i===anchors.length-1?-1:0,bodies);
    append(start);
    let path;
    if(start[0]===end[0]&&start[1]===end[1])path=[start];
    else {
      const options={outerRails:true,initialDirection:i===1?1:0,finalDirection:i===anchors.length-1?1:0};
      const graph=buildVisibilityGraph(start,end,rects,budget,options);
      path=graph&&searchVisibilityGraph(graph,start,end,rects,budget,options);
      if(!path) {
        const h=bend(start,end,true),v=bend(start,end,false);
        path=validateRoute(h,rects).nodeHits<=validateRoute(v,rects).nodeHits?h:v;
      }
    }
    for(const p of path.slice(1))append(p);
    append(to);if(i<anchors.length-1)indices.push(points.length-1);
  }
  return {points,indices};
}

export function insertionIndex(points,indices,segment) {
  return indices.filter(i=>i<=segment).length;
}
