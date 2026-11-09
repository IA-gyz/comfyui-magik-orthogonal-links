import {RectangleIndex} from './performance_cache.js';

// Only used with an operation-local, normalized reference snapshot. Delay the
// tree until repeated candidate checks can amortize construction. Small/brief
// operations keep the original exhaustive scan.
export class ReferenceSegments {
  constructor(paths){
    this.paths=paths;this.count=paths.reduce((sum,path)=>sum+Math.max(0,path.length-1),0);
    this.queries=0;this.index=null;this.broadQueries=0;
  }
  query(a,b,lane){
    if(this.count<256 || ++this.queries<=16 || this.broadQueries>=3 || !Number.isFinite(lane))return null;
    const pad=Math.max(1e-7,lane)+4*Number.EPSILON*Math.max(1,Math.abs(a[0]),Math.abs(a[1]),Math.abs(b[0]),Math.abs(b[1]),Math.abs(lane));
    const bounds=[Math.min(a[0],b[0])-pad,Math.min(a[1],b[1])-pad,Math.max(a[0],b[0])+pad,Math.max(a[1],b[1])+pad];
    if(!bounds.every(Number.isFinite))return null;
    if(!this.index){
      const items=[];
      for(const other of this.paths)for(let j=0;j<other.length-1;j++){
        const c=other[j],d=other[j+1];
        const segment=[c,d];segment.sourcePath=other;
        items.push({id:items.length,other,c,d,segment,rect:[Math.min(c[0],d[0]),Math.min(c[1],d[1]),Math.max(c[0],d[0]),Math.max(c[1],d[1])]});
      }
      this.index=new RectangleIndex(items);
    }
    const found=this.index.query(bounds);
    // Broad queries gain nothing from sorting most of the original segments.
    if(found.length>this.count/2){this.broadQueries++;return null;}
    this.broadQueries=0;
    // Floating-point report accumulation must follow the exhaustive order.
    return found.sort((a,b)=>a.id-b.id);
  }
}
