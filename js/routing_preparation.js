// Bound uninterrupted collection work by time and entry count. Individual
// callbacks remain synchronous; check the job again after every event-loop yield.
export async function prepareInChunks(items,visit,check){
  let started=performance.now(),entries=0;
  for(let i=0;i<items.length;i++){
    visit(items[i],i);entries++;
    if(i+1<items.length && entries%32===0 && (entries>=512 || performance.now()-started>=8)){
      await new Promise(resolve=>setTimeout(resolve,0));check();
      started=performance.now();entries=0;
    }
  }
}
