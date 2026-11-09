import {ReferenceIndex} from './reference_index.js';
import {loadLibavoidRuntime,selectNativeCandidate,markLibavoidRuntimeFailed,libavoidRuntimeFailed} from './libavoid_backend.js';
import {routeWithValidation} from './geometry.js';
import {nativeOrigin,localPoint,localRectangle} from './native_coordinates.js';

const same=(a,b)=>a?.length===b?.length && a.every((v,i)=>v===b[i]);
function releaseValues(values,runtime){
  const errors=[];
  for(const value of values)try{value?.delete();}catch(error){errors.push(String(error?.message ?? error));}
  if(errors.length){markLibavoidRuntimeFailed(runtime);console.warn('[Magik Orthogonal Links] native cleanup failed',errors);}
}
// Only eligible connections enter the native scene. Locked/unselected paths
// remain immutable policy references; this binding has no fixed-route setter.
export class NativeRoutingScene {
  constructor(A) {this.A=A;this.router=new A.Router(A.RouterFlag.OrthogonalRouting.value);this.shapes=new Map();this.connections=new Map();this.nextPin=1;this.policyKey=null;}
  dispose() {const router=this.router;this.router=null;this.shapes.clear();this.connections.clear();router?.delete();}
  polygon(rect,fn) {
    const A=this.A,p=new A.Point(rect[0],rect[1]),q=new A.Point(rect[2],rect[3]);let polygon;
    try {polygon=new A.Rectangle(p,q);return fn(polygon);}finally {releaseValues([polygon,q,p],A);}
  }
  removeConnection(id) {
    const entry=this.connections.get(id);if(!entry)return;
    this.router.deleteConnector(entry.ref);
    for(const pin of entry.pins)pin.delete();
    this.connections.delete(id);
  }
  endpoint(point,nodeId,direction,pins,values) {
    const {A}=this,entry=this.shapes.get(nodeId),r=entry?.rect;
    if(r && point[0]>=r[0] && point[0]<=r[2] && point[1]>=r[1] && point[1]<=r[3]) {
      const id=this.nextPin++,pin=new A.ShapeConnectionPin(entry.ref,id,point[0]-r[0],point[1]-r[1],false,0,direction);
      pins.push(pin);pin.setExclusive(false);
      const end=new A.ConnEnd(entry.ref,id);values.push(end);return end;
    }
    const p=new A.Point(...point);values.push(p);
    const end=new A.ConnEnd(p);values.push(end);return end;
  }
  route(snapshot) {
    if(!this.router)throw Error('Native routing scene has been disposed');
    const origin=nativeOrigin(snapshot.nodes.map(n=>n.rect),snapshot.connections.flatMap(c=>[c.a,c.b]));
    snapshot={...snapshot,nodes:snapshot.nodes.map(n=>({...n,rect:localRectangle(n.rect,origin)})),connections:snapshot.connections.map(c=>({...c,a:localPoint(c.a,origin),b:localPoint(c.b,origin)}))};
    const {A,router}=this,options=snapshot.options ?? {},stats={createdShapes:0,movedShapes:0,removedShapes:0,createdConnections:0,updatedConnections:0,removedConnections:0,reusedConnections:0,transactions:1};
    const policyKey=JSON.stringify([options.laneDistance]);
    const policyChanged=this.policyKey!==null && policyKey!==this.policyKey;
    if(policyKey!==this.policyKey) {
      router.setRoutingParameter(A.RoutingParameter.segmentPenalty,10);
      router.setRoutingParameter(A.RoutingParameter.shapeBufferDistance,0);
      router.setRoutingParameter(A.RoutingParameter.crossingPenalty,0);
      router.setRoutingParameter(A.RoutingParameter.fixedSharedPathPenalty,0);
      router.setRoutingParameter(A.RoutingParameter.idealNudgingDistance,Math.max(0,options.laneDistance ?? 8));
      // Common visible sockets require convergence; separate interior lanes later.
      router.setRoutingOption(A.RoutingOption.nudgeSharedPathsWithCommonEndPoint,false);
      this.policyKey=policyKey;
    }
    const nodes=new Map(snapshot.nodes.map(n=>[n.id,n.rect])),requested=new Map(snapshot.connections.map(c=>[c.id,c]));
    // Remove endpoints before removing their shapes or changing pin offsets.
    for(const [id,entry] of this.connections) {
      const next=requested.get(id);
      const signature=next && JSON.stringify([next.a,next.b,next.sourceId,next.targetId,nodes.get(next.sourceId),nodes.get(next.targetId)]);
      if(!next || policyChanged || signature!==entry.signature) {
        this.removeConnection(id);
        if(next)stats.updatedConnections++;else stats.removedConnections++;
      }
    }
    for(const [id,entry] of this.shapes)if(!nodes.has(id)) {router.deleteShape(entry.ref);this.shapes.delete(id);stats.removedShapes++;}
    for(const [id,rect] of nodes) {
      const entry=this.shapes.get(id);
      if(!entry){this.shapes.set(id,{ref:this.polygon(rect,p=>new A.ShapeRef(router,p)),rect:[...rect]});stats.createdShapes++;}
      else if(!same(entry.rect,rect)){this.polygon(rect,p=>router.moveShape_poly(entry.ref,p,false));entry.rect=[...rect];stats.movedShapes++;}
    }
    for(const connection of snapshot.connections) {
      if(this.connections.has(connection.id)){stats.reusedConnections++;continue;}
      const values=[],pins=[];
      try {
        const a=this.endpoint(connection.a,connection.sourceId,8,pins,values),b=this.endpoint(connection.b,connection.targetId,4,pins,values);
        const ref=new A.ConnRef(router,a,b);
        const signature=JSON.stringify([connection.a,connection.b,connection.sourceId,connection.targetId,nodes.get(connection.sourceId),nodes.get(connection.targetId)]);
        this.connections.set(connection.id,{ref,pins,signature});stats.createdConnections++;
      } catch(error) {releaseValues(pins,A);throw error;}
      finally {releaseValues(values.reverse(),A);}
    }
    router.processTransaction();
    const paths=new Map();
    for(const connection of snapshot.connections) {
      const line=this.connections.get(connection.id).ref.displayRoute(),points=[];
      try {for(let i=0;i<line.size();i++){const p=line.at(i);try{points.push([p.x+origin[0],p.y+origin[1]]);}finally{releaseValues([p],A);}}}
      finally {releaseValues([line],A);}
      paths.set(connection.id,points);
    }
    return {paths,stats};
  }
}

let cachedScene=null,cachedId=null;
export function disposeSharedLibavoid() {
  const scene=cachedScene;cachedScene=null;cachedId=null;
  try{scene?.dispose();}catch(error){markLibavoidRuntimeFailed(scene.A);console.warn('[Magik Orthogonal Links] native scene disposal failed',String(error?.message ?? error));}
}
export async function routeSharedLibavoid(snapshot,providedRuntime=null) {
  const rectangles=snapshot.nodes.map(n=>n.rect),nodeRects=new Map(snapshot.nodes.map(n=>[n.id,n.rect]));
  const optionsFor=(connection,refs)=>({...snapshot.options,exemptStart:[nodeRects.get(connection.sourceId)].filter(Boolean),exemptEnd:[nodeRects.get(connection.targetId)].filter(Boolean),preferences:{...snapshot.options?.preferences,references:refs}});
  const references=new Map((snapshot.references ?? []).map(r=>[r.id,r]));
  let runtime;
  try {
    const A=runtime=providedRuntime ?? await loadLibavoidRuntime();
    if(libavoidRuntimeFailed(A))throw Error('libavoid runtime is unavailable after a native failure; using JavaScript');
    if(!cachedScene || cachedId!==snapshot.sceneId || cachedScene.A!==A) {disposeSharedLibavoid();cachedScene=new NativeRoutingScene(A);cachedId=snapshot.sceneId;}
    const {paths,stats}=cachedScene.route(snapshot);
    if(libavoidRuntimeFailed(A))throw Error('Native cleanup failed; using JavaScript');
    for(const connection of snapshot.connections)references.set(connection.id,{id:connection.id,origin:connection.a,points:paths.get(connection.id)});
    const referenceIndex=new ReferenceIndex([...references]);
    const results=[];
    for(const connection of snapshot.connections) {
      const refs=referenceIndex.nearest(connection.a,connection.id).map(id=>references.get(id));
      const result=selectNativeCandidate(connection.a,connection.b,paths.get(connection.id),rectangles,optionsFor(connection,refs),'libavoid-shared');
      results.push({id:connection.id,...result});references.set(connection.id,{id:connection.id,origin:connection.a,points:result.points});
    }
    return {results,stats};
  } catch(error) {
    markLibavoidRuntimeFailed(runtime);
    disposeSharedLibavoid();
    console.warn('[Magik Orthogonal Links] shared native routing failed; using JavaScript',{message:String(error?.message ?? error),laneDistance:snapshot.options?.laneDistance});
    const results=snapshot.connections.map(connection=>({id:connection.id,...routeWithValidation(connection.a,connection.b,rectangles,optionsFor(connection,[...references.values()].filter(r=>r.id!==connection.id))),backend:'javascript',backendWarning:`Shared libavoid failed: ${error?.message ?? error}`}));
    return {results,stats:{transactions:0,failed:true}};
  }
}
