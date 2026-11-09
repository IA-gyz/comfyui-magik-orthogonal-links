const key=(horizontal,coordinate)=>`${horizontal?'h':'v'}:${coordinate}`;
export function buildOverlapIndex(routes) {
  const groups=new Map();
  for(const {id,points} of routes)for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],horizontal=a[1]===b[1];
    if(!horizontal && a[0]!==b[0])continue;
    const axis=horizontal?0:1,low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]);if(high<=low)continue;
    const k=key(horizontal,a[1-axis]);if(!groups.has(k))groups.set(k,new Map());
    const events=groups.get(k);
    for(const [position,delta] of [[low,1],[high,-1]]) {
      if(!events.has(position))events.set(position,new Map());
      const event=events.get(position);event.set(id,(event.get(id) ?? 0)+delta);
    }
  }
  const index=new Map();
  for(const [k,events] of groups) {
    const positions=[...events.keys()].sort((a,b)=>a-b),active=new Map(),runs=[];
    for(let i=0;i<positions.length-1;i++) {
      const start=positions[i];
      for(const [id,delta] of events.get(start)) {
        const count=(active.get(id) ?? 0)+delta;if(count>0)active.set(id,count);else active.delete(id);
      }
      const count=active.size,end=positions[i+1];if(!count||end<=start)continue;
      const previous=runs.at(-1);
      if(previous && previous.end===start && previous.count===count)previous.end=end;
      else runs.push({start,end,count});
    }
    index.set(k,runs);
  }
  return index;
}
export function overlapPieces(points,index) {
  const pieces=[];let distance=0;
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],horizontal=a[1]===b[1],axis=horizontal?0:1,low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]);
    if(high===low)continue;
    const runs=index.get(key(horizontal,a[1-axis])) ?? [];
    let left=0,right=runs.length;
    while(left<right){const middle=(left+right)>>1;if(runs[middle].end<=low)left=middle+1;else right=middle;}
    // The sweep index already contains ordered, disjoint runs. Clip directly
    // rather than allocating cut sets and sorting the same boundaries again.
    const segment=[];
    const append=(start,end,count)=>{
      // The old Set-based splitter canonicalized signed zero on the along axis.
      if(start===0)start=0;if(end===0)end=0;
      const p=horizontal?[start,a[1]]:[a[0],start],q=horizontal?[end,a[1]]:[a[0],end];
      segment.push({a:p,b:q,count,segment:i});
    };
    let position=low;
    for(let j=left;j<runs.length && runs[j].start<high;j++){
      const r=runs[j],start=Math.max(low,r.start),end=Math.min(high,r.end);
      if(start>position)append(position,start,1);
      if(end>start)append(start,end,r.count);
      position=end;
    }
    if(position<high)append(position,high,1);
    if(b[axis]<a[axis])segment.reverse();
    for(const piece of segment) {
      if(b[axis]<a[axis])[piece.a,piece.b]=[piece.b,piece.a];
      piece.distance=distance;distance+=Math.abs(piece.b[axis]-piece.a[axis]);pieces.push(piece);
    }
  }
  return pieces;
}

// Keep event sets between frames and sweep only changed horizontal/vertical lines.
export class IncrementalOverlapIndex {
  constructor(){this.index=new Map();this.groups=new Map();this.routes=new Map();this.lastUpdatedLines=0;this.revision=0;}
  update(routes) {
    const dirty=new Set(),seen=new Set();
    const apply=(id,segments,sign)=>{
      for(const {k,low,high} of segments){
        let events=this.groups.get(k);
        if(!events){events=new Map();this.groups.set(k,events);}
        for(const [position,delta] of [[low,sign],[high,-sign]]){
          let event=events.get(position);if(!event){event=new Map();events.set(position,event);}
          const value=(event.get(id)??0)+delta;
          if(value)event.set(id,value);else event.delete(id);
          if(!event.size)events.delete(position);
        }
        if(!events.size)this.groups.delete(k);
        dirty.add(k);
      }
    };
    for(const {id,points} of routes){
      seen.add(id);const old=this.routes.get(id);
      if(old && points.length===old.points.length && points.every((p,i)=>p[0]===old.points[i][0] && p[1]===old.points[i][1]))continue;
      if(old)apply(id,old.segments,-1);
      const segments=[];
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],horizontal=a[1]===b[1];
        if(!horizontal && a[0]!==b[0])continue;
        const axis=horizontal?0:1,low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]);
        if(high>low)segments.push({k:key(horizontal,a[1-axis]),low,high});
      }
      apply(id,segments,1);this.routes.set(id,{points:points.map(p=>[...p]),segments});
    }
    for(const [id,old] of this.routes)if(!seen.has(id)){apply(id,old.segments,-1);this.routes.delete(id);}
    let changedVisible=false;
    for(const k of dirty){
      const events=this.groups.get(k);
      if(!events){if(this.index.delete(k))changedVisible=true;continue;}
      const positions=[...events.keys()].sort((a,b)=>a-b),active=new Map(),runs=[];
      for(let i=0;i<positions.length-1;i++){
        const start=positions[i];
        for(const [id,delta] of events.get(start)){
          const count=(active.get(id)??0)+delta;if(count>0)active.set(id,count);else active.delete(id);
        }
        const count=active.size,end=positions[i+1];if(!count || end<=start)continue;
        const previous=runs.at(-1);
        if(previous && previous.end===start && previous.count===count)previous.end=end;
        else runs.push({start,end,count});
      }
      // Preserve dependencies when changes leave the visible overlap counts identical.
      const old=this.index.get(k);
      if(!old || old.length!==runs.length || runs.some((r,i)=>r.start!==old[i].start || r.end!==old[i].end || r.count!==old[i].count)){this.index.set(k,runs);changedVisible=true;}
    }
    if(changedVisible)this.revision++;
    this.lastUpdatedLines=dirty.size;return this.index;
  }
}
export const overlapDependencies=(points,index)=>points.slice(1).map((b,i)=>index.get(key(points[i][1]===b[1],points[i][points[i][1]===b[1]?1:0])));
export const overlapsUnchanged=(points,index,dependencies)=>dependencies?.length===points.length-1 && dependencies.every((runs,i)=>runs===index.get(key(points[i][1]===points[i+1][1],points[i][points[i][1]===points[i+1][1]?1:0])));
