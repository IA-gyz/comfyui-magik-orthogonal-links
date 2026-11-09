// Deterministic layered layout. Strongly connected nodes share a layer;
// the condensation DAG determines left-to-right depth without recursion.
export function arrangeNodes(items,edges,fixed=[],{horizontalGap=100,verticalGap=50}={}) {
  const valid=p=>[p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.width>0&&p.height>0;
  const nodes=items.filter(valid);if(!nodes.length)return new Map();
  const byId=new Map(nodes.map(n=>[n.id,n])),out=new Map(),incoming=new Map();
  for(const n of nodes){out.set(n.id,new Set());incoming.set(n.id,new Set());}
  for(const e of edges)if(byId.has(e.from)&&byId.has(e.to)&&e.from!==e.to){out.get(e.from).add(e.to);incoming.get(e.to).add(e.from);}
  const seen=new Set(),order=[];
  for(const n of nodes) {
    if(seen.has(n.id))continue;
    seen.add(n.id);const stack=[[n.id,out.get(n.id).values()]];
    while(stack.length) {
      const [id,iter]=stack.at(-1),next=iter.next();
      if(next.done){order.push(id);stack.pop();}
      else if(!seen.has(next.value)){seen.add(next.value);stack.push([next.value,out.get(next.value).values()]);}
    }
  }
  const component=new Map(),groups=[];
  for(let i=order.length-1;i>=0;i--) {
    const root=order[i];if(component.has(root))continue;
    const index=groups.length,group=[],stack=[root];groups.push(group);component.set(root,index);
    while(stack.length){const id=stack.pop();group.push(id);for(const prev of incoming.get(id))if(!component.has(prev)){component.set(prev,index);stack.push(prev);}}
  }
  const successors=groups.map(()=>new Set()),indegree=groups.map(()=>0),depth=groups.map(()=>0);
  for(const n of nodes)for(const id of out.get(n.id)) {
    const a=component.get(n.id),b=component.get(id);
    if(a!==b&&!successors[a].has(b)){successors[a].add(b);indegree[b]++;}
  }
  const queue=[];for(let i=0;i<groups.length;i++)if(!indegree[i])queue.push(i);
  for(let i=0;i<queue.length;i++)for(const b of successors[queue[i]]){depth[b]=Math.max(depth[b],depth[queue[i]]+1);if(!--indegree[b])queue.push(b);}
  const layers=[];
  for(const n of nodes)(layers[depth[component.get(n.id)]]??=[]).push(n);
  const original=new Map(nodes.map((n,i)=>[n.id,i]));
  for(const layer of layers)layer.sort((a,b)=>a.y-b.y||a.x-b.x||original.get(a.id)-original.get(b.id));
  // A few barycentric sweeps reduce crossings without optimizing globally.
  for(let sweep=0;sweep<4;sweep++) {
    const positions=new Map();for(const layer of layers)layer.forEach((n,i)=>positions.set(n.id,i));
    const indices=layers.map((_,i)=>i);if(sweep%2)indices.reverse();
    for(const index of indices) {
      const layer=layers[index],previous=new Map(layer.map((n,i)=>[n.id,i]));
      const score=n=>{
        const neighbours=[...(sweep%2?out:incoming).get(n.id)].filter(id=>depth[component.get(id)]!==index);
        return neighbours.length?neighbours.reduce((sum,id)=>sum+positions.get(id),0)/neighbours.length:previous.get(n.id);
      };
      const scores=new Map(layer.map(n=>[n.id,score(n)]));
      layer.sort((a,b)=>scores.get(a.id)-scores.get(b.id)||previous.get(a.id)-previous.get(b.id));
      layer.forEach((n,i)=>positions.set(n.id,i));
    }
  }
  const result=new Map(),obstacles=fixed.filter(valid);
  let x=nodes.reduce((m,n)=>Math.min(m,n.x),Infinity);
  const top=nodes.reduce((m,n)=>Math.min(m,n.y),Infinity);
  for(const layer of layers) {
    let y=top;
    // Columns cannot overlap; stationary nodes can only push a node down.
    const columnWidth=layer.reduce((m,n)=>Math.max(m,n.width),0);
    const column=obstacles.filter(o=>o.x<x+columnWidth+horizontalGap/2&&o.x+o.width>x-horizontalGap/2);
    for(const n of layer) {
      for(let attempt=0;attempt<=column.length;attempt++) {
        let next=y;
        for(const o of column)if(x<o.x+o.width+horizontalGap/2&&x+n.width>o.x-horizontalGap/2&&y<o.y+o.height+verticalGap&&y+n.height>o.y-verticalGap)next=Math.max(next,o.y+o.height+verticalGap);
        if(next===y)break;y=next;
      }
      result.set(n.id,[x,y]);y+=n.height+verticalGap;
    }
    x+=layer.reduce((m,n)=>Math.max(m,n.width),0)+horizontalGap;
  }
  return result;
}
