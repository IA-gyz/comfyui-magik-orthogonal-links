import './libavoid.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AvoidLib} from '../js/vendor/libavoid/index.js';
import {NativeRoutingScene} from '../js/libavoid_scene.js';
import {routeWithLibavoid,selectNativeCandidate} from '../js/libavoid_backend.js';
import {nativeOrigin,localPoint,localRectangle} from '../js/native_coordinates.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./large_coordinate_scene.json',import.meta.url)));
const before=JSON.stringify(fixture),A=AvoidLib.getInstance(),offset=[851968,-155648];
const shifted={nodes:fixture.nodes.map(n=>({...n,rect:localRectangle(n.rect,offset)})),connections:fixture.connections.map(c=>({...c,a:localPoint(c.a,offset),b:localPoint(c.b,offset)}))};
const world=new NativeRoutingScene(A),local=new NativeRoutingScene(A);
try{
 for(const laneDistance of [8,12,8,12]){
  const options={laneDistance},actual=world.route({...fixture,options}),expected=local.route({...shifted,options});
  assert.equal(actual.paths.size,93);
  for(const n of fixture.nodes)assert.deepEqual(world.shapes.get(n.id).rect,local.shapes.get(n.id).rect);
  for(const c of fixture.connections){
   const path=actual.paths.get(c.id);
   const selected=selectNativeCandidate(c.a,c.b,path,[],{strictAvoidance:true});
   assert.deepEqual(selected.points[0],c.a);assert.deepEqual(selected.points.at(-1),c.b);
   assert(selected.points.slice(1).every((p,i)=>p[0]===selected.points[i][0] || p[1]===selected.points[i][1]));
   assert(path.every(p=>p.every(Number.isFinite)));
   assert(expected.paths.get(c.id).every(p=>p.every(Number.isFinite)));
   // Compare exact inputs, not C++ tie choices across independent routers.
   assert.equal(world.connections.get(c.id).signature,local.connections.get(c.id).signature);
  }
 }
}finally{world.dispose();local.dispose();}
assert.equal(JSON.stringify(fixture),before);
const delta=[850000,-154000],a=[850000,-154000],b=[850200,-153800];
const rects=[[-100,-50,40,50],[160,150,300,250],[60,40,120,140]].map(r=>[r[0]+delta[0],r[1]+delta[1],r[2]+delta[0],r[3]+delta[1]]);
const result=await routeWithLibavoid(a,b,rects,{strictAvoidance:true,laneDistance:12,exemptStart:[rects[0]],exemptEnd:[rects[1]],preferences:{laneDistance:12}},A);
assert.equal(result.backend,'libavoid',result.backendWarning);assert.equal(result.report.nodeHits,0);
assert.deepEqual(result.points[0],a);assert.deepEqual(result.points.at(-1),b);
assert.deepEqual(nativeOrigin([],[]),[0,0]);
const fractional=[850000.125,-154000.375],origin=nativeOrigin([],[fractional]);
assert.deepEqual(localPoint(fractional,origin).map((v,i)=>v+origin[i]),fractional);
console.log('PASS: 120-node/93-link large-coordinate native regression, lane 8/12 switching, identical normalized scene inputs, original endpoints and immutable workflow geometry');
