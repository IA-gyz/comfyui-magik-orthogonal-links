// Origins stay fixed during a routing job. Keep IDs/ranks in the tree and read
// current geometry from the caller's Map, so sequential route updates stay live.
export class ReferenceIndex {
  constructor(entries) {
    this.entries=entries.map(([id,ref],rank)=>({id,rank,origin:[...ref.origin]}));
    this.finite=this.entries.every(e=>e.origin.length===2 && e.origin.every(Number.isFinite));
    this.root=this.finite && entries.length>128?this.build(this.entries):null;
  }
  build(entries) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,minRank=Infinity;
    for(const e of entries){minX=Math.min(minX,e.origin[0]);minY=Math.min(minY,e.origin[1]);maxX=Math.max(maxX,e.origin[0]);maxY=Math.max(maxY,e.origin[1]);minRank=Math.min(minRank,e.rank);}
    const node={bounds:[minX,minY,maxX,maxY],minRank};
    if(entries.length<=12){node.entries=entries;return node;}
    const axis=maxX-minX>=maxY-minY?0:1,sorted=[...entries].sort((a,b)=>a.origin[axis]-b.origin[axis] || a.rank-b.rank),middle=sorted.length>>1;
    node.left=this.build(sorted.slice(0,middle));node.right=this.build(sorted.slice(middle));return node;
  }
  nearest(origin,excludeId,limit=64) {
    limit=Math.max(0,Math.floor(limit));if(!limit)return [];
    const distance=e=>Math.hypot(e.origin[0]-origin[0],e.origin[1]-origin[1]);
    if(!this.root || origin.length!==2 || !origin.every(Number.isFinite))return this.entries.filter(e=>e.id!==excludeId).map(e=>({...e,distance:distance(e)})).sort((a,b)=>a.distance-b.distance).slice(0,limit).map(e=>e.id);
    const heap=[],worse=(a,b)=>a.distance>b.distance || (a.distance===b.distance && a.rank>b.rank);
    const offer=entry=>{
      if(entry.id===excludeId)return;
      const item={...entry,distance:distance(entry)};
      if(heap.length<limit){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!worse(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}return;}
      if(!worse(heap[0],item))return;
      heap[0]=item;let i=0;
      while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length && worse(heap[child+1],heap[child]))child++;if(!worse(heap[child],heap[i]))break;[heap[i],heap[child]]=[heap[child],heap[i]];i=child;}
    };
    const bound=node=>Math.hypot(Math.max(node.bounds[0]-origin[0],0,origin[0]-node.bounds[2]),Math.max(node.bounds[1]-origin[1],0,origin[1]-node.bounds[3]));
    const stack=[this.root];
    while(stack.length){
      const node=stack.pop(),lower=bound(node),worst=heap[0];
      if(heap.length===limit && (lower>worst.distance || (lower===worst.distance && node.minRank>worst.rank)))continue;
      if(node.entries){for(const e of node.entries)offer(e);}
      else if(bound(node.left)<=bound(node.right)){stack.push(node.right,node.left);}else stack.push(node.left,node.right);
    }
    return heap.sort((a,b)=>a.distance-b.distance || a.rank-b.rank).map(e=>e.id);
  }
}
