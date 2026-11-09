import assert from 'node:assert/strict';
import {arrangeNodes} from '../js/node_layout.js';
const node=(id,x=0,y=0,width=150,height=80)=>({id,x,y,width,height});
const items=[node(1,40,100,260,120),node(2,600,60),node(3,200,400,100,200),node(4,0,800)];
const edges=[{from:1,to:2},{from:1,to:3},{from:2,to:4},{from:3,to:4}];
const untouched=structuredClone(items),plan=arrangeNodes(items,edges);
assert.equal(plan.size,4);assert(plan.get(1)[0]<plan.get(2)[0]);assert.equal(plan.get(2)[0],plan.get(3)[0]);assert(plan.get(4)[0]>plan.get(2)[0]);assert.deepEqual(items,untouched);
function clear(nodes,positions,fixed=[]) {
 const boxes=nodes.map(n=>({...n,x:positions.get(n.id)[0],y:positions.get(n.id)[1]}));
 for(let i=0;i<boxes.length;i++)for(const b of [...boxes.slice(i+1),...fixed]) {
  const a=boxes[i];assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),JSON.stringify([a,b]));
 }
}
clear(items,plan);
assert.deepEqual(arrangeNodes(items.map(n=>({...n,x:plan.get(n.id)[0],y:plan.get(n.id)[1]})),edges),plan);
const cycle=arrangeNodes(items,[{from:1,to:2},{from:2,to:1},{from:2,to:3}]);
assert.equal(cycle.get(1)[0],cycle.get(2)[0]);assert(cycle.get(3)[0]>cycle.get(2)[0]);clear(items,cycle);
const fixed=[node(99,0,0,700,700)],movable=[node('a',0,0),node('b',400,50)];
clear(movable,arrangeNodes(movable,[],fixed),fixed);
assert.equal(arrangeNodes([],[]).size,0);
assert.equal(arrangeNodes([node(1,NaN)],[]).size,0);
const chain=Array.from({length:6000},(_,i)=>node(i,800000+i,-160000));
const longPlan=arrangeNodes(chain,chain.slice(1).map(n=>({from:n.id-1,to:n.id})));
assert.equal(longPlan.size,6000);assert(longPlan.get(5999)[0]>longPlan.get(0)[0]);
assert([...longPlan.values()].flat().every(Number.isFinite));
console.log('PASS: layered variable-size layout, fork/join, cycles, disconnected nodes, stationary obstacles, idempotence, immutable inputs and 6,000-node nonrecursive chain');
