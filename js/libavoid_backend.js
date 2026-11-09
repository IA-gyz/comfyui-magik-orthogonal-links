import {simplify,pathLength} from './routing_primitives.js';
import {finalizeAutomaticRoute,routeWithValidation,preferredEdgeCost} from './geometry.js';
import {nativeOrigin,localPoint,localRectangle} from './native_coordinates.js';

let initialization;
const failedRuntimes=new WeakSet();
export function markLibavoidRuntimeFailed(runtime){if(runtime && (typeof runtime==='object' || typeof runtime==='function'))failedRuntimes.add(runtime);}
export function libavoidRuntimeFailed(runtime){return !!runtime && failedRuntimes.has(runtime);}
export async function loadLibavoidRuntime() {
  initialization ??= import('./vendor/libavoid/index.js').then(async ({AvoidLib})=>{
    await AvoidLib.load(new URL('./vendor/libavoid/libavoid.wasm',import.meta.url).href);
    return AvoidLib.getInstance();
  }).catch(error=>{initialization=null;throw error;});
  const runtime=await initialization;
  if(libavoidRuntimeFailed(runtime))throw Error('libavoid runtime is unavailable after a native failure; using JavaScript');
  return runtime;
}

// Isolated transaction: native owns shapes, pins and connectors; local value
// wrappers are released even when routing/validation throws. No graph is mutated.
export async function routeWithLibavoid(a,b,rects,options={},providedRuntime=null) {
  const fallback=reason=>({...routeWithValidation(a,b,rects,options),backend:'javascript',backendWarning:reason});
  let A;
  try {A=providedRuntime ?? await loadLibavoidRuntime();}catch(error){return fallback(`libavoid unavailable: ${error?.message ?? error}`);}
  if(libavoidRuntimeFailed(A))return fallback('libavoid runtime is unavailable after a native failure; using JavaScript');
  const owned=[];let router;
  const origin=nativeOrigin(rects,[a,b]),localRects=rects.map(r=>localRectangle(r,origin));
  const keep=value=>{owned.push(value);return value;};
  try {
    router=new A.Router(A.RouterFlag.OrthogonalRouting.value);
    const policy=options.preferences ?? {},lane=options.laneDistance ?? policy.laneDistance ?? 8;
    router.setRoutingParameter(A.RoutingParameter.segmentPenalty,10);
    router.setRoutingParameter(A.RoutingParameter.shapeBufferDistance,0); // bounds already expanded
    router.setRoutingParameter(A.RoutingParameter.idealNudgingDistance,Math.max(0,lane));
    const shapes=localRects.map(r=>new A.ShapeRef(router,keep(new A.Rectangle(keep(new A.Point(r[0],r[1])),keep(new A.Point(r[2],r[3]))))));
    const endpoint=(p,exempt,direction,classId)=>{
      const index=rects.findIndex(r=>exempt.includes(r) && p[0]>=r[0] && p[0]<=r[2] && p[1]>=r[1] && p[1]<=r[3]);
      const local=localPoint(p,origin);
      if(index<0)return keep(new A.ConnEnd(keep(new A.Point(...local))));
      const r=localRects[index],pin=new A.ShapeConnectionPin(shapes[index],classId,local[0]-r[0],local[1]-r[1],false,0,direction);
      pin.setExclusive(false); // owned by its shape/router
      return keep(new A.ConnEnd(shapes[index],classId));
    };
    const connector=new A.ConnRef(router,endpoint(a,options.exemptStart ?? [],8,1),endpoint(b,options.exemptEnd ?? [],4,2));
    router.processTransaction();
    const line=keep(connector.displayRoute()),points=[];
    for(let i=0;i<line.size();i++){const p=keep(line.at(i));points.push([p.x+origin[0],p.y+origin[1]]);}
    return selectNativeCandidate(a,b,points,rects,options);
  } catch(error) {markLibavoidRuntimeFailed(A);return fallback(`libavoid failed: ${error?.message ?? error}`);}
  finally {
    // displayRoute() and at() return owned copies in this pinned binding.
    // Dispose all temporary values even if one destructor fails. Router-owned
    // shapes, pins and connectors must only be destroyed through the router.
    const errors=[];
    for(const value of owned.reverse())try {value.delete();}catch(error){errors.push(String(error?.message ?? error));}
    try {router?.delete();}catch(error){errors.push(String(error?.message ?? error));}
    if(errors.length){markLibavoidRuntimeFailed(A);console.warn("[Magik Orthogonal Links] libavoid cleanup failed",errors);}
  }
}

// Shared policy gate for native single-route and multi-route transactions.
export function selectNativeCandidate(a,b,points,rects,options={},nativeBackend='libavoid') {
  const policy=options.preferences ?? {};
  const fallback=reason=>({...routeWithValidation(a,b,rects,options),backend:'javascript',backendWarning:reason});
    if(points.length<2 || points.some(p=>!p.every(Number.isFinite)) || points.some((p,i)=>i && p[0]!==points[i-1][0] && p[1]!==points[i-1][1]))return fallback('libavoid returned invalid geometry');
    if(points[0][0]!==a[0] || points[0][1]!==a[1] || points.at(-1)[0]!==b[0] || points.at(-1)[1]!==b[1])return fallback('libavoid changed socket positions');
    const result=finalizeAutomaticRoute(a,b,simplify(points),rects,{...options,references:policy.references ?? []});
    const stub=options.stub ?? 24,baseline=2*stub+Math.abs(b[0]-a[0]-2*stub)+Math.abs(b[1]-a[1]);
    const allowed=baseline+Math.max(0,Math.min(options.maxExtra ?? 400,baseline*((options.maxFactor ?? 1.75)-1)));
    if(result.report.nodeHits || result.report.reversals)return fallback('libavoid route failed socket/obstacle validation');
    if(!options.strictAvoidance && pathLength(result.points)>allowed+1e-7)return fallback('libavoid route exceeds configured detour limits');
    // Compare native and JavaScript candidates using the same spacing and bend costs.
    {
      const js=routeWithValidation(a,b,rects,options);
      if(js.compactTerminal && !js.report.nodeHits)return {...js,backend:'javascript',backendWarning:'Canonical compact socket approach'};
      const normalized={...policy,laneDistance:options.laneDistance ?? policy.laneDistance ?? 8,sourceOrigin:a,targetOrigin:b,references:(policy.references ?? []).map(ref=>({...ref,points:simplify(ref.points),normalized:true}))};
      const score=path=>{
        let cost=0,previousDirection=1;
        for(let i=1;i<path.length;i++) {
          const p=path[i-1],q=path[i],dir=p[1]===q[1]?(q[0]>p[0]?1:3):(q[1]>p[1]?2:4);
          cost+=preferredEdgeCost(p,q,normalized);
          if(dir!==previousDirection)cost+=8;
          previousDirection=dir;
        }
        if(previousDirection!==1)cost+=8;
        return cost;
      };
      if(!js.report.nodeHits && score(js.points)<score(result.points)-1e-7)return {...js,backend:'javascript',backendWarning:'JavaScript candidate better matches enabled routing preferences'};
    }
    return {...result,fallback:false,backend:nativeBackend,relaxedLimits:pathLength(result.points)>allowed+1e-7};
}
