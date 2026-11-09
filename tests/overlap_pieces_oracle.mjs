// Frozen pre-v0.4.14 splitter for equivalence tests.
const key=(horizontal,coordinate)=>`${horizontal?'h':'v'}:${coordinate}`;
export function legacyOverlapPieces(points,index) {
  const pieces=[];let distance=0;
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],horizontal=a[1]===b[1],axis=horizontal?0:1,low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]);
    if(high===low)continue;
    const runs=index.get(key(horizontal,a[1-axis])) ?? [],cuts=[low,high];
    let left=0,right=runs.length;
    while(left<right){const middle=(left+right)>>1;if(runs[middle].end<=low)left=middle+1;else right=middle;}
    const overlaps=[];
    for(let j=left;j<runs.length&&runs[j].start<high;j++) {const r=runs[j];overlaps.push(r);if(r.start>low)cuts.push(r.start);if(r.end<high)cuts.push(r.end);}
    const sorted=[...new Set(cuts)].sort((a,b)=>a-b),segment=[];let cursor=0;
    for(let j=0;j<sorted.length-1;j++) {
      const start=sorted[j],end=sorted[j+1];while(cursor<overlaps.length&&overlaps[cursor].end<=start)cursor++;
      const r=overlaps[cursor],count=r&&r.start<=start&&r.end>=end?r.count:1;
      const p=horizontal?[start,a[1]]:[a[0],start],q=horizontal?[end,a[1]]:[a[0],end];
      segment.push({a:p,b:q,count,segment:i});
    }
    if(b[axis]<a[axis])segment.reverse();
    for(const piece of segment) {
      if(b[axis]<a[axis])[piece.a,piece.b]=[piece.b,piece.a];
      piece.distance=distance;distance+=Math.abs(piece.b[axis]-piece.a[axis]);pieces.push(piece);
    }
  }
  return pieces;
}

