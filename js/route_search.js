import {simplify} from "./routing_primitives.js";

// Direction-aware, resource-constrained A*. Search policy is injected.
export function searchVisibilityGraph(graph,a,b,rects,extraBudget,{initialDirection=0,finalDirection=0,preferences=null,edgeCost}={}) {
  // Direction is part of the state, so equal-length alternatives can be
  // ranked by bend count and socket entry/exit reversals can be forbidden.
  const {size,start,goal,point,neighbours}=graph;
  const direct=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),limit=direct+extraBudget;
  const frontiers=new Array(size*5),records=[],heap=[];
  const less=(a,b)=>a.f<b.f || (a.f===b.f && a.rank<b.rank);
  const push=item=>{heap.push(item);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(!less(item,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const root=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&less(heap[j+1],heap[j]))j++;if(!less(heap[j],last))break;heap[i]=heap[j];i=j;}heap[i]=last;}return root;};
  const dominates=(a,b)=>a.score<=b.score && a.g<=b.g && (a.score<b.score || a.g<b.g || a.t<=b.t);
  const add=(state,g,score,t,parent,h,rank)=>{
    const candidate={state,g,score,t,parent,active:true,closed:false,index:records.length};
    const previous=(frontiers[state] ?? []).filter(id=>records[id].active);
    if(previous.some(id=>dominates(records[id],candidate)))return;
    const survivors=previous.filter(id=>{if(dominates(candidate,records[id])){records[id].active=false;return false;}return true;});
    records.push(candidate);survivors.push(candidate.index);
    // Keep up to four active cost/length trade-offs per directed state,
    // with the cheapest and shortest alternatives always protected.
    if(survivors.length>4) {
      const byScore=[...survivors].sort((a,b)=>records[a].score-records[b].score || records[a].g-records[b].g);
      const byLength=[...survivors].sort((a,b)=>records[a].g-records[b].g || records[a].score-records[b].score);
      const keep=new Set([byScore[0],byLength[0]]);
      for(const id of byScore){if(keep.size>=4)break;keep.add(id);}
      for(const id of survivors)if(!keep.has(id))records[id].active=false;
      frontiers[state]=survivors.filter(id=>keep.has(id));
    } else frontiers[state]=survivors;
    if(candidate.active)push({label:candidate.index,f:score+h*(preferences?0.65:1),rank});
  };
  add(start*5+initialDirection,0,0,0,-1,direct,0);
  while(heap.length) {
    const item=pop(),label=records[item.label],state=label.state,id=Math.floor(state/5),dir=state%5;
    if(!label.active || label.closed)continue;
    if(id===goal && !(finalDirection && dir && Math.abs(finalDirection-dir)===2)) {
      const path=[];for(let n=item.label;n!==-1;n=records[n].parent)path.push(point(Math.floor(records[n].state/5)));
      return simplify(path.reverse());
    }
    label.closed=true;const p=point(id);
    for(const [next,nextDir] of neighbours(id)){
      if(dir && Math.abs(dir-nextDir)===2)continue;
      const nextState=next*5+nextDir,q=point(next);
      const length=Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1]),g=label.g+length,h=Math.abs(q[0]-b[0])+Math.abs(q[1]-b[1]);
      if(g+h>limit+1e-7)continue;
      const t=label.t+(dir && dir!==nextDir?1:0),cornerWeight=preferences?8:0;
      const turnPenalty=cornerWeight*((dir && dir!==nextDir?1:0)+(next===goal && finalDirection && nextDir!==finalDirection?1:0));
      const score=label.score+(preferences?edgeCost(p,q,{...preferences,previousDirection:dir},rects,limit):length)+turnPenalty;
      const rank=t+(next===goal && finalDirection && nextDir!==finalDirection?1:0);
      add(nextState,g,score,t,item.label,h,rank);
    }
  }
  return null;
}
