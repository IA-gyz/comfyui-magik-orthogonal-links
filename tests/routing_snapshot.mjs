import assert from 'node:assert/strict';
import {RoutingSnapshot} from '../js/routing_snapshot.js';
const fingerprint=g=>JSON.stringify({nodes:(g._nodes??[]).map(n=>[n.id,[Number(n.pos[0]),Number(n.pos[1])],Array.from(n.size??[]),n.flags?.collapsed,n.properties?.magikOrthogonalRoutes,n.inputs?.map(i=>i.link)]),links:(g.links instanceof Map?[...g.links.values()]:Object.values(g.links??{})).map(l=>[l.id,l.origin_id,l.origin_slot,l.target_id,l.target_slot,l.parentId])});
const fixture=()=>({_nodes:Array.from({length:12},(_,id)=>({id,pos:[id*200,0],size:new Float32Array([100,60]),flags:{collapsed:false},inputs:[{link:id}],properties:{magikOrthogonalRoutes:{0:{points:[[id*200,0],[id*200+50,0],[id*200+50,80]],pins:[[0,0]],locked:false,savedPos:[0,0],savedNodeId:id,signature:'A|out|in',other:{value:null,flag:undefined,array:[undefined,NaN,-0]}}}}})),links:Object.fromEntries(Array.from({length:12},(_,id)=>[id,{id,origin_id:id,target_id:(id+1)%12,origin_slot:0,target_slot:0}]))});
const mutations=[g=>g._nodes[2].pos[0]++,g=>g._nodes[2].size[1]++,g=>g._nodes[2].flags.collapsed=true,g=>g._nodes[2].inputs[0].link=99,g=>g._nodes[2].properties.magikOrthogonalRoutes[0].points[1][1]++,g=>g._nodes[2].properties.magikOrthogonalRoutes[0].pins.push([7,9]),g=>g._nodes[2].properties.magikOrthogonalRoutes[0].locked=true,g=>g._nodes[2].properties.magikOrthogonalRoutes[0].savedNodeId++,g=>g._nodes[2].properties.magikOrthogonalRoutes[0].signature='changed',g=>g._nodes[2].properties.magikOrthogonalRoutes[0].other.value=3,g=>delete g._nodes[2].properties.magikOrthogonalRoutes[0].other,g=>g._nodes.reverse(),g=>g._nodes.pop(),g=>g.links[2].origin_slot++,g=>g.links[2].target_id++,g=>g.links[2].parentId=10,g=>delete g.links[2],g=>g.links[99]={id:99},g=>g._nodes[2].inputs.push({link:9})];
for(const mutate of mutations){const g=fixture(),before=fingerprint(g),snapshot=new RoutingSnapshot(g);assert(snapshot.matches(g));mutate(g);assert.notEqual(fingerprint(g),before);assert(!snapshot.matches(g));}
for(const asMap of [false,true]){
 const g=fixture();if(asMap)g.links=new Map(Object.entries(g.links));const snapshot=new RoutingSnapshot(g);
 assert(snapshot.matches(g));assert(!snapshot.matches({...g}));
 // Identity changes must reject stale objects even when serialized fields agree.
 const n=g._nodes[0];g._nodes[0]={...n};assert(!snapshot.matches(g));g._nodes[0]=n;assert(snapshot.matches(g));
 if(asMap)g.links.set('0',{...g.links.get('0')});else g.links[0]={...g.links[0]};assert(!snapshot.matches(g));
}
let seed=86527;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
for(let n=0;n<1000;n++){
 const g=fixture(),snapshot=new RoutingSnapshot(g),before=fingerprint(g),node=g._nodes[Math.floor(random()*12)];
 if(n%3===0)node.pos[Math.floor(random()*2)]+=random()+1;
 else if(n%3===1)node.properties.magikOrthogonalRoutes[0].points[Math.floor(random()*3)][Math.floor(random()*2)]+=random()+1;
 else node.properties.magikOrthogonalRoutes[0].other['field'+n]=random();
 assert.notEqual(fingerprint(g),before);assert(!snapshot.matches(g));
}
const unusual=fixture();unusual._nodes[0].properties.magikOrthogonalRoutes[0].date=new Date(0);unusual._nodes[1].inputs=null;
const unusualSnapshot=new RoutingSnapshot(unusual);assert(unusualSnapshot.matches(unusual));unusual._nodes[0].properties.magikOrthogonalRoutes[0].date.setTime(1000);assert(!unusualSnapshot.matches(unusual));
console.log('PASS: graph snapshots reject legacy-fingerprint mutations, node/link replacement, Map edits, nested route changes and mutable toJSON values');
const deferredGraph=fixture();
// Force several preparation chunks without relying on clock timing.
for(let i=12;i<1200;i++)deferredGraph._nodes.push({...deferredGraph._nodes[0],id:i,pos:[i,0]});
const deferredBefore=fingerprint(deferredGraph),deferred=new RoutingSnapshot(deferredGraph,'magikOrthogonalRoutes',true);
assert(deferred.sameObjects(deferredGraph));assert(!deferred.ready);
queueMicrotask(()=>{deferredGraph._nodes[0].pos[0]++;});
await assert.rejects(deferred.prepare(()=>{if(fingerprint(deferredGraph)!==deferredBefore)throw Error('Changed during snapshot preparation');}),/Changed during/);
assert(!deferred.ready);
const complete=new RoutingSnapshot(fixture(),'magikOrthogonalRoutes',true);await complete.prepare(()=>{});assert(complete.ready);assert(complete.matches(complete.graph));
console.log('PASS: deferred snapshot capture yields, rejects concurrent mutations and completes unchanged scenes');
