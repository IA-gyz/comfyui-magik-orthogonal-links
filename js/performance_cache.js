// Numeric comparisons avoid serializing full route/scene geometry every frame.
export function samePoints(a,b) {
  if(a===b)return true;
  if(!a || !b || a.length!==b.length)return false;
  for(let i=0;i<a.length;i++){
    const p=a[i];if(p===undefined && !(i in a))continue;
    const q=b[i];if(p.length!==q.length)return false;
    if(p.length===2 && p[0]===q[0] && p[1]===q[1])continue;
    for(let j=0;j<p.length;j++)if(j in p && p[j]!==q[j])return false;
  }
  return true;
}
export function routeBounds(...paths) {
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const points of paths)for(const p of points){bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}
  return bounds;
}
export const intersects=(a,b)=>a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1];
function rectangleBounds(items){
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const {rect:r} of items){
    bounds[0]=Math.min(bounds[0],r[0],r[2]);bounds[1]=Math.min(bounds[1],r[1],r[3]);
    bounds[2]=Math.max(bounds[2],r[0],r[2]);bounds[3]=Math.max(bounds[3],r[1],r[3]);
  }
  return bounds;
}
export function sceneDelta(previous,current) {
  // Static frames dominate rendering. Do not allocate a replacement map or
  // entry pairs until a changed rectangle or membership actually requires it.
  if(previous.size===current.length){
    let unchanged=true;
    const entries=previous.entries();
    for(const {id,rect} of current){
      const entry=entries.next().value,old=entry[1];
      if(!(entry[0]===id || (Number.isNaN(entry[0]) && Number.isNaN(id))) || (old!==rect && (old.length!==rect.length || !old.every((v,i)=>v===rect[i])))){unchanged=false;break;}
    }
    if(unchanged)return {next:previous,changes:[]};
  }
  const changes=[],next=new Map();
  for(const {id,rect} of current)next.set(id,rect);
  for(const [id,rect] of previous){const replacement=next.get(id);if(!replacement || !rect.every((v,i)=>v===replacement[i])){changes.push(rect);if(replacement)changes.push(replacement);}}
  for(const [id,rect] of next)if(!previous.has(id))changes.push(rect);
  return {next,changes};
}

// Broad-phase obstacle queries. The exact segment validator remains authoritative.
export class RectangleIndex {
  constructor(items) {this.rebuilds=0;this.refits=0;this.sinceRebuild=0;this.rebuild(items);}
  rebuild(items) {
    this.locations=new Map();this.root=this.build(items);this.sinceRebuild=0;this.rebuilds++;
  }
  build(items,parent=null) {
    if(!items.length)return null;
    const bounds=rectangleBounds(items);
    const node={bounds,parent};
    if(items.length<=8){
      node.items=items.map(item=>({...item,rect:[...item.rect]}));
      node.items.forEach((item,index)=>this.locations.set(item.id,{node,index}));
      return node;
    }
    const axis=bounds[2]-bounds[0]>=bounds[3]-bounds[1]?0:1;
    const sorted=[...items].sort((a,b)=>(a.rect[axis]+a.rect[axis+2])-(b.rect[axis]+b.rect[axis+2]));
    const middle=sorted.length>>1;
    node.left=this.build(sorted.slice(0,middle),node);node.right=this.build(sorted.slice(middle),node);return node;
  }
  update(items) {
    if(items.length!==this.locations.size || items.some(item=>!this.locations.has(item.id))){this.rebuild(items);return;}
    const changed=items.filter(item=>{const at=this.locations.get(item.id);return item.rect.some((v,i)=>v!==at.node.items[at.index].rect[i]);});
    if(!changed.length)return;
    // Repartition occasionally, or after broad changes, so a refitted tree cannot
    // degrade indefinitely as nodes travel away from their original clusters.
    if(changed.length>Math.max(8,items.length/4) || this.sinceRebuild>=128){this.rebuild(items);return;}
    const leaves=new Set();
    for(const item of changed){const at=this.locations.get(item.id);at.node.items[at.index]={...item,rect:[...item.rect]};leaves.add(at.node);}
    for(const node of leaves)node.bounds=rectangleBounds(node.items);
    for(const leaf of leaves)for(let node=leaf.parent;node;node=node.parent){
      const a=node.left.bounds,b=node.right.bounds;
      node.bounds=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
    }
    this.refits++;this.sinceRebuild++;
  }
  query(bounds) {
    const found=[],stack=this.root?[this.root]:[];
    while(stack.length){const node=stack.pop();if(!intersects(bounds,node.bounds))continue;
      if(node.items){for(const item of node.items)if(intersects(bounds,item.rect))found.push(item);}
      else {stack.push(node.left,node.right);}
    }
    return found;
  }
}

// After the cheap route-bounds check, reject obstacles in the empty interior of
// a large L/U-shaped route envelope. Inclusive edge tests remain conservative.
export const pathTouchesRectangle=(points,rect)=>points.some((b,i)=>{
  if(!i)return false;const a=points[i-1];
  return Math.min(a[0],b[0])<=rect[2] && Math.max(a[0],b[0])>=rect[0] && Math.min(a[1],b[1])<=rect[3] && Math.max(a[1],b[1])>=rect[1];
});
