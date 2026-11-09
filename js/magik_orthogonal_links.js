import { app } from "../../scripts/app.js";
import { IncrementalOverlapIndex, overlapDependencies, overlapsUnchanged, overlapPieces } from "./overlaps.js";
import { LOCKED_PATTERNS, lockedPatternStyle } from "./locked_patterns.js";
import { ARROW_DESIGNS, drawFlowArrows } from "./flow_arrows.js";
import { arrangeNodes } from "./node_layout.js";
import { routeWaypoints, cleanWaypoints, inside, insertionIndex } from "./waypoints.js";
import { autoRoute, manualRoute, simplify, distanceToSegment, midpoint, copy, buildAvoidingPath, validateRoute, pruneDetours, nudgeLanes, moveRouteEndpoints, routeWithValidation } from "./geometry.js";

import {samePoints,routeBounds,intersects,sceneDelta,RectangleIndex,pathTouchesRectangle} from "./performance_cache.js";

import {ReferenceIndex} from "./reference_index.js";
import {WorkerEncoder} from "./worker_transport.js";
import {prepareInChunks} from "./routing_preparation.js";
import {RoutingSnapshot} from "./routing_snapshot.js";
import {viewportBounds,pathVisible,piecesVisible} from "./viewport.js";

const KEY = "magikOrthogonalRoutes", ID = "Magik.OrthogonalLinks";
const bindings = new WeakMap();
const motion = new WeakMap();
const routingCanvases = new WeakSet();
const routes = node => (node.properties ??= {})[KEY] ??= {};
const links = graph => graph?.links instanceof Map ? [...graph.links.values()] : Object.values(graph?.links ?? {});
const getLink = (graph,id) => graph?.getLink?.(id) ?? (graph?.links instanceof Map ? graph.links.get(id) : graph?.links?.[id]);
const slotPos = (node,index,input) => copy(input && node.getInputPos ? node.getInputPos(index) : !input && node.getOutputPos ? node.getOutputPos(index) : node.getConnectionPos(input,index));
const dirty = c => c.setDirty?.(true,true);
const samePosition=(a,b)=>a && b && a[0]===b[0] && a[1]===b[1];
function getRoute(c,link,snapshot=false,resolved=null) {
  snapshot ||= routingCanvases.has(c);
  const node=c.graph?.getNodeById(link.target_id);
  const source=c.graph?.getNodeById(link.origin_id);
  if(resolved && (resolved.node!==node || resolved.source!==source))resolved=null;
  let r=node?.properties?.[KEY]?.[link.target_slot];
  if (!source?.outputs?.[link.origin_slot] || !node?.inputs?.[link.target_slot] || !r || !Array.isArray(r.points)) return null;
  const signature=`${source?.type}|${source?.outputs?.[link.origin_slot]?.name}|${node.inputs?.[link.target_slot]?.name}`;
  if (r.signature !== signature) return null;
  const known=bindings.get(r);
  if (known !== undefined && known !== link.id) { if(!snapshot)delete routes(node)[link.target_slot]; return null; }
  const stored=r;
  if(snapshot)r={...r};else bindings.set(r,link.id);
  if(r.savedNodeId !== undefined && r.savedNodeId !== node.id) {
    const dx=node.pos[0]-(r.savedPos?.[0] ?? node.pos[0]),dy=node.pos[1]-(r.savedPos?.[1] ?? node.pos[1]);
    r.points=r.points.map(p=>[p[0]+dx,p[1]+dy]);if(Array.isArray(r.waypoints))r.waypoints=r.waypoints.map(p=>[p[0]+dx,p[1]+dy]);r.pins=r.points.map(copy);r.savedNodeId=node.id;r.savedPos=copy(node.pos);
  }
  const previous=motion.get(stored);
  const a=resolved?.a ?? slotPos(source,link.origin_slot,false),b=resolved?.b ?? slotPos(node,link.target_slot,true);
  if(previous && source && !Array.isArray(r.waypoints)) {
    const dx=node.pos[0]-previous.target[0],dy=node.pos[1]-previous.target[1];
    const oldA=previous.a ?? [a[0]-(source.pos[0]-previous.source[0]),a[1]-(source.pos[1]-previous.source[1])];
    const oldB=previous.b ?? [b[0]-dx,b[1]-dy];
    if(a[0]!==oldA[0]||a[1]!==oldA[1]||b[0]!==oldB[0]||b[1]!==oldB[1]) {
      if(dx===source.pos[0]-previous.source[0] && dy===source.pos[1]-previous.source[1] && a[0]-oldA[0]===dx && a[1]-oldA[1]===dy && b[0]-oldB[0]===dx && b[1]-oldB[1]===dy)r.points=r.points.map(p=>[p[0]+dx,p[1]+dy]);
      else r.points=moveRouteEndpoints(manualRoute(oldA,oldB,r.points,24,r.pins ?? []),oldA,oldB,a,b).slice(1,-1);
    }
  }
  if(!samePoints(r.pins,r.points))r.pins=r.points.map(copy);
  if(!snapshot && (!previous || !samePosition(previous.source,source.pos) || !samePosition(previous.target,node.pos) || !samePosition(previous.a,a) || !samePosition(previous.b,b)))motion.set(r,{source:copy(source.pos),target:copy(node.pos),a,b});
  return r;
}
function saveRoute(c,link,points) {
  if(!link) return;
  const node=c.graph.getNodeById(link.target_id), source=c.graph.getNodeById(link.origin_id);
  if (!node?.inputs?.[link.target_slot] || !source?.outputs?.[link.origin_slot] || String(node.inputs[link.target_slot].link)!==String(link.id)) return;
  const r={locked:!!node.properties?.[KEY]?.[link.target_slot]?.locked, points:simplify(points,points), pins:points.map(copy), signature:`${source.type}|${source.outputs[link.origin_slot]?.name}|${node.inputs[link.target_slot]?.name}`, savedPos:copy(node.pos), savedNodeId:node.id};
  routes(node)[link.target_slot]=r;
  // ComfyUI may expose properties through reactive proxies. Use the stored
  // identity, rather than the raw object, for gesture ownership and caches.
  const stored=routes(node)[link.target_slot];
  bindings.set(stored,link.id);
  motion.set(stored,{source:copy(source.pos),target:copy(node.pos),a:slotPos(source,link.origin_slot,false),b:slotPos(node,link.target_slot,true)});
  return stored;
}
function saveWaypoints(c,link,points) {
  const r=saveRoute(c,link,[]);if(r)r.waypoints=cleanWaypoints(points);return r;
}
function change(c,fn) {
  const graph=c.graph;
  if(c.read_only || !graph)return;
  graph.beforeChange?.();
  try {if(c.graph===graph && !c.read_only)fn();}
  finally {graph.afterChange?.();dirty(c);}
}
function cleanRouteMetadata(value) {
  const result={};
  if(!value || typeof value!=="object" || Array.isArray(value))return result;
  for(const [slot,r] of Object.entries(value)) {
    if(!/^\d+$/.test(slot) || !r || typeof r!=="object" || !Array.isArray(r.points) || typeof r.signature!=="string")continue;
    const points=r.points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map(copy);
    result[slot]={points,pins:points.map(copy),signature:r.signature,locked:r.locked===true};
    if(Array.isArray(r.waypoints))result[slot].waypoints=cleanWaypoints(r.waypoints);
    if(Array.isArray(r.savedPos)&&r.savedPos.length===2&&r.savedPos.every(Number.isFinite))result[slot].savedPos=copy(r.savedPos);
    if(typeof r.savedNodeId==="string" || (typeof r.savedNodeId==="number" && Number.isFinite(r.savedNodeId)))result[slot].savedNodeId=r.savedNodeId;
  }
  return result;
}
function editableTarget(e) { return e.target?.closest?.('input,textarea,select,[contenteditable="true"]'); }

const SETTINGS = [
    {id:`${ID}.Enabled`, name:"Magik Orthogonal Links: Enable extension", type:"boolean", defaultValue:true},
    {id:`${ID}.FlowArrows`,name:"Magik Orthogonal Links: Show flow arrows",type:"boolean",defaultValue:false,category:["Magik","Flow Arrows","Enabled"]},
    {id:`${ID}.HideArrowsOnLocked`,name:"Magik Orthogonal Links: Hide on locked routes",type:"boolean",defaultValue:false,category:["Magik","Flow Arrows","Hide on locked routes"]},
    {id:`${ID}.ArrowDesign`,name:"Magik Orthogonal Links: Flow arrow design",type:"combo",defaultValue:"Chevron",options:ARROW_DESIGNS,category:["Magik","Flow Arrows","Design"]},
    {id:`${ID}.LockedPattern`, name:"Magik Orthogonal Links: locked route pattern", type:"combo", defaultValue:"Marching stripes",options:LOCKED_PATTERNS,category:["Magik","Locked Routes","Pattern"]},
    {id:`${ID}.PatternSpeed`, name:"Magik Orthogonal Links: locked pattern animation speed", type:"slider", defaultValue:1,attrs:{min:0,max:3,step:0.1},category:["Magik","Locked Routes","Animation speed"]},
    {id:`${ID}.Width`, name:"Magik Orthogonal Links: Link thickness", type:"slider", defaultValue:3, attrs:{min:1,max:8,step:1}},
    {id:`${ID}.Grid`, name:"Magik Orthogonal Links: grid snapping (0 disables)", type:"slider", defaultValue:0, attrs:{min:0,max:40,step:1}},
    {id:`${ID}.Handles`, name:"Magik Orthogonal Links: handle size", type:"slider", defaultValue:5, attrs:{min:3,max:12,step:1},category:["Magik","Orthogonal Links Advanced","Handles"]},
    {id:`${ID}.RoutingEngine`,name:"Magik automatic routing: engine",type:"combo",defaultValue:"JavaScript",options:["JavaScript","libavoid (experimental)"],category:["Magik","Orthogonal Links Advanced","RoutingEngine"]},
    {id:`${ID}.RouteOnDrop`, name:"Magik Orthogonal Links: Automatically route after moving nodes",type:"boolean",defaultValue:true},
    {id:`${ID}.Clearance`, name:"Magik Orthogonal Links: node clearance", type:"slider", defaultValue:12, attrs:{min:0,max:60,step:1}},
    {id:`${ID}.MaxDetour`, name:"Magik Orthogonal Links: Maximum detour",tooltip:"Preferred maximum extra route length in graph units. Node avoidance may exceed it when necessary to find a clear path.", type:"slider", defaultValue:400, attrs:{min:0,max:2000,step:25},category:["Magik","Orthogonal Links Advanced","MaxDetour"]},
    {id:`${ID}.LaneDistance`, name:"Magik Orthogonal Links: Preferred lane spacing",tooltip:"Preferred gap between parallel links in graph units; 0 disables spacing. Shared sockets can converge.", type:"slider", defaultValue:8, attrs:{min:0,max:100,step:1},category:["Magik","Orthogonal Links","Preferred lane spacing"]},
  ];

app.registerExtension({
  name: ID,
  beforeRegisterNodeDef(Node) {
    const serialize=Node.prototype.onSerialize, configure=Node.prototype.onConfigure;
    Node.prototype.onSerialize=function(info) {
      const result=serialize?.apply(this,arguments);
      if (info.properties?.[KEY]) {
        // Detach metadata from live properties before updating serialization coordinates.
        const metadata=cleanRouteMetadata(info.properties[KEY]);
        if(this.graph)for(const slot of Object.keys(metadata)) {
          const link=getLink(this.graph,this.inputs?.[slot]?.link);
          // Serialize current endpoint adaptation even if node movement has not
          // been painted yet. Snapshot reads must not advance live motion state.
          const current=link && link.target_id===this.id && String(link.target_slot)===slot
            ?getRoute({graph:this.graph},link,true):null;
          if(current)metadata[slot]=cleanRouteMetadata({[slot]:current})[slot];
          else delete metadata[slot];
        }
        info.properties={...info.properties,[KEY]:metadata};
        for(const r of Object.values(metadata)) {r.savedPos=copy(this.pos);r.savedNodeId=this.id;}
      }
      return result;
    };
    Node.prototype.onConfigure=function(info) {
      const result=configure?.apply(this,arguments);
      if(this.properties?.[KEY]) {
        this.properties[KEY]=cleanRouteMetadata(this.properties[KEY]);
        for(const r of Object.values(this.properties[KEY])) {
          if(Array.isArray(r.waypoints))continue;
          const dx=this.pos[0]-(r.savedPos?.[0] ?? this.pos[0]);
          const dy=this.pos[1]-(r.savedPos?.[1] ?? this.pos[1]);
          r.points=(r.points ?? []).filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map(p=>[p[0]+dx,p[1]+dy]);
          if(!samePoints(r.pins,r.points))r.pins=r.points.map(copy);
          r.savedPos=copy(this.pos);
        }
      }
      return result;
    };
  },
  async setup() {
    // Register through ComfyUI's imperative settings API. Older frontends
    // ignore the declarative extension.settings field entirely.
    const settingsAPI=app.ui?.settings;
    if(typeof settingsAPI?.addSetting === "function") {
      for(const definition of SETTINGS) {
        settingsAPI.addSetting({
          ...definition,
          category:definition.category ?? ["Magik", "Orthogonal Links", definition.id.split(".").at(-1)],
          onChange:()=>app.canvas?.setDirty?.(true,true),
        });
      }
    } else {
      console.error("[Magik Orthogonal Links] ComfyUI settings API unavailable; extension was not activated.");
      return;
    }
    const c=app.canvas, element=c?.canvas;
    if(!element || typeof c.renderLink !== "function") {
      console.error("[Magik Orthogonal Links] Canvas renderer unavailable."); return;
    }
    const setting=(name,fallback)=>app.extensionManager?.setting?.get?.(`${ID}.${name}`) ?? app.ui?.settings?.getSettingValue?.(`${ID}.${name}`,fallback) ?? fallback;
    const active=()=>setting("Enabled",true) && !globalThis.LiteGraph?.vueNodesMode;
    let selected=null,drag=null,lastGraph=c.graph,hover=[NaN,NaN],routingJob=null;
    let nodeDropSnapshot=null,dropTimer=null,dropGraph=null;
    let connectedNodeHighlights=null;
    let cachedNativeWorker=null,cachedNativeGraph=null,nextSceneId=1;
    const sceneIds=new WeakMap();
    function releaseNativeWorker() {cachedNativeWorker?.terminate();cachedNativeWorker=null;cachedNativeGraph=null;}

    const queuedDrops=new Set();
    function queueDroppedNodes(graph,ids) {
      if(dropGraph!==graph){queuedDrops.clear();dropGraph=graph;}
      for(const id of ids)queuedDrops.add(id);
      if(routingJob){for(const id of routingJob.dropScope ?? [])queuedDrops.add(id);cancelRouting();}
      if(dropTimer!==null)return;
      const run=()=>{
        dropTimer=null;
        if(c.graph!==dropGraph || !active() || c.read_only || !setting("RouteOnDrop",true)){queuedDrops.clear();return;}
        if(routingJob){dropTimer=setTimeout(run,16);return;}
        const ids=new Set(queuedDrops);queuedDrops.clear();
        if(ids.size){void automaticallyRoute(true,ids,obstructedLinks(ids));if(routingJob)routingJob.dropScope=ids;}
      };
      dropTimer=setTimeout(run,0);
    }
    let hoverSocket=null,pinnedSocket=null,pinnedRoute=null;
    const rendered=new Map();
    let overlapState=new IncrementalOverlapIndex(),overlapIndex=overlapState.index,previousPlanned=[],sceneVersion=0,frameObstacles=null;
    let sceneRects=new Map(),sceneChanges=[],sceneItems=[],obstacleIndex=new RectangleIndex([]);
    const paintCache=new WeakMap();
    const livePaths=new Map();
    let liveMembershipChanged=false;
    // Return change bits (1: geometry, 2: membership) while appending, so an
    // unchanged frame needs neither a second comparison pass nor an ID set.
    function appendPlan(planned,id,points) {
      const previous=previousPlanned[planned.length];
      if(previous && previous.id===id){
        if(previous.points===points){planned.push(previous);return 0;}
        planned.push({id,points});return samePoints(points,previous.points)?0:1;
      }
      planned.push({id,points});return 3;
    }
    let frameViewportArea=null,frameViewport=null;
    function canvasViewport() {
      const area=c.visible_area;
      if(frameObstacles && frameViewportArea && area && frameViewportArea[0]===area[0] && frameViewportArea[1]===area[1] && frameViewportArea[2]===area[2] && frameViewportArea[3]===area[3])return frameViewport;
      const view=viewportBounds(area);
      if(frameObstacles){frameViewportArea=area?[area[0],area[1],area[2],area[3]]:null;frameViewport=view;}
      return view;
    }
    function nodeRectangles() {
      if(frameObstacles)return frameObstacles;
      const items=[],gap=setting("Clearance",12);
      let unchanged=true;
      for(const n of c.graph?._nodes ?? []){
        const box=n.getBounding?.() ?? [n.pos[0],n.pos[1]-30,n.size?.[0] ?? 140,(n.size?.[1] ?? 100)+30];
        const x=box[0]-gap,y=box[1]-gap,right=box[0]+box[2]+gap,bottom=box[1]+box[3]+gap;
        if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(right)||!Number.isFinite(bottom))continue;
        const old=sceneRects.get(n.id);
        const rect=old && old[0]===x && old[1]===y && old[2]===right && old[3]===bottom?old:[x,y,right,bottom];
        const previous=sceneItems[items.length];
        if(previous && previous.id===n.id && previous.rect===rect)items.push(previous);
        else {items.push({id:n.id,rect});unchanged=false;}
      }
      if(unchanged && items.length===sceneItems.length)return sceneItems;
      const delta=sceneDelta(sceneRects,items);
      if(delta.changes.length){sceneRects=delta.next;sceneChanges=delta.changes;sceneItems=items;obstacleIndex.update(items);sceneVersion++;}
      return sceneItems;
    }
    function nearbyObstacles(points,obstacles) {
      const bounds=routeBounds(points);
      return obstacles===sceneItems?obstacleIndex.query(bounds):obstacles.filter(item=>intersects(bounds,item.rect));
    }
    function avoidLive(points,obstacles,startId,endId) {
      const nearby=nearbyObstacles(points,obstacles);
      // If the authored geometry is already clear, no path search is needed.
      if(!validateRoute(points,nearby.map(item=>item.rect),{
        exemptStart:nearby.filter(item=>item.id===startId).map(item=>item.rect),
        exemptEnd:nearby.filter(item=>item.id===endId).map(item=>item.rect),
      }).nodeHits)return points;
      return buildAvoidingPath(points,obstacles.map(item=>item.rect),{
        strictAvoidance:true,freeEndpoint:startId===null || endId===null,
        exemptStart:obstacles.filter(item=>item.id===startId).map(item=>item.rect),
        exemptEnd:obstacles.filter(item=>item.id===endId).map(item=>item.rect),
        stub:Math.max(24,setting("Clearance",12)+4),maxExtra:setting("MaxDetour",400),maxFactor:Infinity,
      }).points;
    }
    function liveRoute(link,a,b,r) {
      const old=livePaths.get(link.id);
      if(Array.isArray(r?.waypoints) && !link.parentId) {
        const obstacles=nodeRectangles(),maxDetour=setting("MaxDetour",400);
        if(old?.waypointMode && old.sceneVersion===sceneVersion && old.maxDetour===maxDetour && samePosition(old.raw[0],a) && samePosition(old.raw.at(-1),b) && samePoints(old.waypoints,r.waypoints))return old.points;
        const routed=r.waypoints.length?routeWaypoints(a,b,r.waypoints,obstacles,{maxExtra:maxDetour,clearance:setting("Clearance",12)}):{points:avoidLive(autoRoute(a,b),obstacles,link.origin_id,link.target_id),indices:[]};
        if(!old)liveMembershipChanged=true;
        livePaths.set(link.id,{waypointMode:true,waypoints:r.waypoints.map(copy),indices:routed.indices,raw:routed.points,points:routed.points,sceneVersion,maxDetour,automatic:false,manualRecord:r,manualPoints:[],manualPins:[],origin:link.origin_id,target:link.target_id,bounds:routeBounds(routed.points)});
        return routed.points;
      }

      // The automatic seed depends only on socket positions. Reuse that seed,
      // not its obstacle detour; scene invalidation below still runs normally.
      const first=old?.raw[0],last=old?.raw.at(-1);
      const reuseAutomatic=!r && !link.parentId && old?.automatic && first && last && first[0]===a[0] && first[1]===a[1] && last[0]===b[0] && last[1]===b[1];
      const reuseManual=r && !link.parentId && old && !old.automatic && first && last && first[0]===a[0] && first[1]===a[1] && last[0]===b[0] && last[1]===b[1] && samePoints(old.manualPoints,r.points) && samePoints(old.manualPins,r.pins ?? []);
      const raw=reuseAutomatic || reuseManual?old.raw:r?manualRoute(a,b,r.points,24,r.pins ?? []):autoRoute(a,b);
      if(link.parentId)return raw;
      const manualPoints=r?(reuseManual?old.manualPoints:r.points.map(p=>p.slice())):null;
      const manualPins=r?(reuseManual?old.manualPins:(r.pins ?? []).map(p=>p.slice())):null;
      const obstacles=nodeRectangles(),maxDetour=setting("MaxDetour",400);
      if(old && old.origin===link.origin_id && old.target===link.target_id && old.maxDetour===maxDetour && samePoints(old.raw,raw)) {
        const unchanged=old.sceneVersion===sceneVersion;
        const unrelated=old.sceneVersion===sceneVersion-1 && !sceneChanges.some(rect=>intersects(rect,old.bounds) && (pathTouchesRectangle(old.raw,rect) || pathTouchesRectangle(old.points,rect)));
        if(unchanged || unrelated){old.sceneVersion=sceneVersion;old.automatic=!r;old.manualRecord=r;old.manualPoints=manualPoints;old.manualPins=manualPins;return old.points;}
      }
      // Start from the user's intended route on each scene change; avoid
      // accumulating detours that remain after the obstacle moves away.
      const points=avoidLive(raw,obstacles,link.origin_id,link.target_id);
      const nearby=nearbyObstacles(points,obstacles);
      const checkOptions={exemptStart:nearby.filter(o=>o.id===link.origin_id).map(o=>o.rect),exemptEnd:nearby.filter(o=>o.id===link.target_id).map(o=>o.rect)};
      const report=validateRoute(points,nearby.map(o=>o.rect),checkOptions);
      if(report.nodeHits)console.warn("[Magik Orthogonal Links] Node avoidance could not clear route",{
        linkId:link.id,originId:link.origin_id,targetId:link.target_id,strictAvoidance:true,
        points:points.map(copy),obstacles:obstacles.filter(o=>validateRoute(points,[o.rect],checkOptions).nodeHits).map(o=>({nodeId:o.id,bounds:[...o.rect]})),
      });
      if(!old)liveMembershipChanged=true;
      livePaths.set(link.id,{raw,points,automatic:!r,manualRecord:r,manualPoints,manualPins,origin:link.origin_id,target:link.target_id,maxDetour,sceneVersion,bounds:routeBounds(raw,points)});return points;
    }
    let lockedFrame=null,lastAnimatedPaint=-Infinity;
    function scheduleLockedAnimation() {
      if(lockedFrame!==null || typeof requestAnimationFrame!=="function")return;
      const tick=time=>{
        lockedFrame=null;
        if(!active() || document.hidden || ![...rendered.values()].some(r=>r.animated))return;
        if(time-lastAnimatedPaint<33) {lockedFrame=requestAnimationFrame(tick);return;}
        lastAnimatedPaint=time;dirty(c);
      };
      lockedFrame=requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange",()=>{if(!document.hidden){dirty(c);if(connectedNodeHighlights)scheduleHighlightPulse();}});
    const badge=document.createElement("div");
    badge.style.cssText="position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:10000;background:#18202e;color:#eee;border:1px solid #6486b9;border-radius:7px;padding:9px 14px;font:13px sans-serif;display:none;pointer-events:none;max-width:80vw";
    document.body.append(badge);
    function status(text="") { badge.textContent=text; badge.style.display=text?"block":"none"; }
    const linkIdentity=link=>link && JSON.stringify([link.origin_id,link.origin_slot,link.target_id,link.target_slot]);
    function validDrag() {
      const link=drag && getLink(c.graph,drag.id);
      if(!drag)return true;
      const source=c.graph?.getNodeById(link?.origin_id),target=c.graph?.getNodeById(link?.target_id);
      return drag.graph===c.graph && link===drag.link && linkIdentity(link)===drag.linkIdentity &&
        source===drag.sourceNode && target===drag.targetNode &&
        source?.outputs?.[link.origin_slot]===drag.sourceSlot && target?.inputs?.[link.target_slot]===drag.targetSlot &&
        samePosition(slotPos(source,link.origin_slot,false),drag.a) && samePosition(slotPos(target,link.target_slot,true),drag.b) &&
        target.properties?.[KEY]?.[link.target_slot]===drag.expectedRoute &&
        !lockedRoute(drag.id) && String(target.inputs[link.target_slot].link)===String(link.id);
    }
    function restoreDrag(edit) {
      // Only roll back metadata owned by this gesture on its original link.
      // A replaced connection or externally replaced record belongs to somebody else.
      if(!edit?.writtenRoute)return;
      const graph=edit.graph,link=getLink(graph,edit.id),target=graph?.getNodeById(link?.target_id);
      if(link!==edit.link || linkIdentity(link)!==edit.linkIdentity ||
         String(target?.inputs?.[link.target_slot]?.link)!==String(link.id) ||
         target?.properties?.[KEY]?.[link.target_slot]!==edit.writtenRoute || edit.writtenRoute.locked)return;
      if(graph.getNodeById(link.origin_id)!==edit.sourceNode || target!==edit.targetNode)return;
      if(edit.sourceNode.outputs?.[link.origin_slot]!==edit.sourceSlot || target.inputs?.[link.target_slot]!==edit.targetSlot) {
        delete target.properties[KEY][link.target_slot];edit.writtenRoute=null;edit.expectedRoute=undefined;return;
      }
      if(edit.originalRoute) {
        const restored=JSON.parse(JSON.stringify(edit.originalRoute));routes(target)[link.target_slot]=restored;
        const stored=routes(target)[link.target_slot];
        bindings.set(stored,link.id);edit.expectedRoute=stored;
        const source=graph.getNodeById(link.origin_id);
        if(source)motion.set(stored,{source:edit.sourcePos,target:edit.targetPos,a:edit.a,b:edit.b});
      } else {delete target.properties[KEY][link.target_slot];edit.expectedRoute=undefined;}
      edit.writtenRoute=null;
    }
    function cancel() {
      nodeDropSnapshot=null;
      const edit=drag;drag=null;
      try {restoreDrag(edit);}
      finally {
        if(edit?.moved)edit.graph?.afterChange?.();
        if(edit && element.hasPointerCapture?.(edit.pointerId))element.releasePointerCapture(edit.pointerId);
        status();dirty(c);
      }
    }
    const graphPoint=e=>{
      const rect=element.getBoundingClientRect();
      const x=e.clientX-rect.left;
      const y=e.clientY-rect.top;
      const p=[x/c.ds.scale-c.ds.offset[0],y/c.ds.scale-c.ds.offset[1]];
      const grid=setting("Grid",0);
      return grid ? p.map(v=>Math.round(v/grid)*grid) : p;
    };
    // Socket hit-testing uses un-snapped coordinates and native slot positions.
    function socket(e,input) {return socketAt(graphPointRaw(e),input);}
    function socketAt(p,input) {
      const threshold=12/c.ds.scale;
      const nodes=[...(c.graph?._nodes ?? [])].reverse();
      for(const n of nodes) {
        const slots=input?n.inputs:n.outputs;
        for(let i=0;i<(slots?.length ?? 0);i++) {
          const q=slotPos(n,i,input);
          if(Math.hypot(p[0]-q[0],p[1]-q[1])<=threshold) return {node:n,index:i,pos:q};
        }
      }
      return null;
    }
    function socketMark(e) {
      const output=socket(e,false),input=output?null:socket(e,true),found=output ?? input;
      return found?{...found,clientX:e.clientX,clientY:e.clientY,input:!!input,graph:c.graph,slotRef:(input?found.node.inputs:found.node.outputs)[found.index]}:null;
    }
    const socketTooltip=document.createElement("div");
    socketTooltip.innerHTML="<strong>Alt+click:</strong> pin an amber highlight.<br><strong>Empty canvas or Escape:</strong> clear highlighting.";
    socketTooltip.setAttribute?.("role","tooltip");
    Object.assign(socketTooltip.style,{position:"fixed",display:"none",pointerEvents:"none",zIndex:"10000",padding:"9px 12px",border:"1px solid #657181",borderRadius:"6px",background:"#151923",color:"#eef3fa",font:"13px/1.5 sans-serif",maxWidth:"min(320px, calc(100vw - 16px))",boxShadow:"0 3px 12px #0008"});
    document.body.append(socketTooltip);
    let tooltipSize=null;
    function updateSocketTooltip(mark) {
      if(!mark) {socketTooltip.style.display="none";tooltipSize=null;return;}
      socketTooltip.style.display="block";
      const w=window.innerWidth ?? 1024,h=window.innerHeight ?? 768;
      if(!tooltipSize || tooltipSize.viewportWidth!==w) {
        const box=socketTooltip.getBoundingClientRect?.();
        tooltipSize={width:box?.width ?? 320,height:box?.height ?? 64,viewportWidth:w};
      }
      socketTooltip.style.left=`${Math.max(8,Math.min(mark.clientX+16,w-tooltipSize.width-8))}px`;
      socketTooltip.style.top=`${Math.max(8,Math.min(mark.clientY+16,h-tooltipSize.height-8))}px`;
    }
    function sameSocket(a,b) {return a===b || !!(a && b && a.graph===b.graph && a.node===b.node && a.slotRef===b.slotRef && a.input===b.input && a.index===b.index);}
    function setSocketHover(mark) {const changed=!sameSocket(hoverSocket,mark);hoverSocket=mark;updateSocketTooltip(mark);if(changed)dirty(c);}
    function clearSocketHighlights() {updateSocketTooltip(null);if(hoverSocket || pinnedSocket || pinnedRoute){hoverSocket=null;pinnedSocket=null;pinnedRoute=null;dirty(c);}}
    let highlightPulseFrame=null,highlightPulseStart=0,lastHighlightPulsePaint=-Infinity;
    function scheduleHighlightPulse() {
      if(highlightPulseFrame!==null || typeof requestAnimationFrame!=="function")return;
      if(!highlightPulseStart)highlightPulseStart=performance.now();
      const tick=time=>{
        highlightPulseFrame=null;
        if(!connectedNodeHighlights || !active() || document.hidden) return;
        if(time-lastHighlightPulsePaint>=33) {lastHighlightPulsePaint=time;dirty(c);}
        highlightPulseFrame=requestAnimationFrame(tick);
      };
      highlightPulseFrame=requestAnimationFrame(tick);
    }
    function clearConnectedNodeHighlights() {
      const had=!!connectedNodeHighlights;
      connectedNodeHighlights=null;highlightPulseStart=0;
      if(highlightPulseFrame!==null && typeof cancelAnimationFrame==="function")cancelAnimationFrame(highlightPulseFrame);
      highlightPulseFrame=null;
      if(had)dirty(c);
    }
    function highlightConnectedNodes(graph,movedIds) {
      const moved=new Set(movedIds), upstream=new Set(), downstream=new Set();
      for(const link of links(graph)) {
        if(moved.has(link.target_id) && !moved.has(link.origin_id)) upstream.add(link.origin_id);
        if(moved.has(link.origin_id) && !moved.has(link.target_id)) downstream.add(link.target_id);
      }
      connectedNodeHighlights={graph,moved,upstream,downstream};
      scheduleHighlightPulse();
      dirty(c);
    }
    function socketMatches(mark,link) {
      if(!mark || !link || mark.graph!==c.graph || c.graph?.getNodeById(mark.node.id)!==mark.node ||
         (mark.input?mark.node.inputs:mark.node.outputs)?.[mark.index]!==mark.slotRef)return false;
      return mark.input?link.target_id===mark.node.id && link.target_slot===mark.index
        :link.origin_id===mark.node.id && link.origin_slot===mark.index;
    }
    function socketHighlight(link) {
      const route=pinnedRoute;
      const routeMatch=route && route.graph===c.graph && route.link===link && getLink(c.graph,link.id)===link && linkIdentity(link)===route.identity &&
        c.graph.getNodeById(link.origin_id)===route.source && c.graph.getNodeById(link.target_id)===route.target &&
        route.source.outputs?.[link.origin_slot]===route.output && route.target.inputs?.[link.target_slot]===route.input && String(route.input.link)===String(link.id);
      return routeMatch || socketMatches(pinnedSocket,link)?"#ffc857":socketMatches(hoverSocket,link)?"#68d9ff":null;
    }
    element.addEventListener?.("pointerleave",()=>setSocketHover(null));
    function graphPointRaw(e) {
      const rect=element.getBoundingClientRect();
      return [(e.clientX-rect.left)/c.ds.scale-c.ds.offset[0],(e.clientY-rect.top)/c.ds.scale-c.ds.offset[1]];
    }
    if(globalThis.LiteGraph?.vueNodesMode) status("Magik Orthogonal Links requires Canvas rendering. Disable Nodes 2.0 in ComfyUI settings.");
    function waypointPoints(id) {
      const link=getLink(c.graph,id),r=link && getRoute(c,link);
      return link?.parentId?[]:r?.waypoints ?? [];
    }
    function covered(p,obstacles=nodeRectangles()) {
      const gap=setting("Clearance",12);
      return obstacles.some(o=>inside(p,[o.rect[0]+gap,o.rect[1]+gap,o.rect[2]-gap,o.rect[3]-gap]));
    }
    function waypointIndex(h) {
      const cached=livePaths.get(h.id);
      return insertionIndex(cached?.points ?? [],cached?.indices ?? [],h.segment ?? 0);
    }
    function storeWaypointEdit(id,points) {return saveWaypoints(c,getLink(c.graph,id),points);}
    function hit(p) {
      const threshold=8/c.ds.scale;
      for(const [id] of rendered) {
        const wp=waypointPoints(id);
        for(let i=0;i<wp.length;i++)if(Math.hypot(p[0]-wp[i][0],p[1]-wp[i][1])<=threshold)return {id,waypoint:i};
      }
      const hits=[];
      for(const [id,record] of rendered) {
        const pieces=record.pieces ?? overlapPieces(record.points,overlapIndex);
        for(const piece of pieces) {
          const radius=Math.max(threshold,piece.count*setting("Width",3)/2+3/c.ds.scale);
          if(distanceToSegment(p,piece.a,piece.b)<=radius){hits.push({id,segment:piece.segment});break;}
        }
      }
      return hits.find(h=>h.id===selected) ?? hits[0];
    }
    const originalRender=c.renderLink;
    c.renderLink=function(ctx,a,b,link,skipBorder,flow,color,startDir,endDir,extras={}) {
      if(!active() || !link || link._dragging) return originalRender.apply(this,arguments);
      const r=link && !extras.reroute && !link.parentId ? getRoute(this,link) : null;
      const points=link && !extras.reroute?liveRoute(link,a,b,r):avoidLive(autoRoute(a,b),nodeRectangles(),null,null);
      const view=canvasViewport(),width=setting("Width",3),bordered=this.render_connections_border && !skipBorder;
      const arrows=setting("FlowArrows",false) && !(r?.locked && setting("HideArrowsOnLocked",false));
      const trace=socketHighlight(link);
      const scale=this.ds?.scale,edgePixels=Math.max(arrows?14:2,trace?6:2,r?.waypoints?.length?setting("Handles",5)+1:2,link?.id===selected?setting("Handles",5)+1:2);
      // Every swept run counts distinct planned links. This upper bound lets
      // distant paths skip overlap-piece/Path2D construction safely, even when
      // a thick shared lane extends into the viewport from outside its centre.
      const padding=Number.isFinite(scale) && scale>0 && Number.isFinite(width) && width>0?Math.max(1,overlapState.routes.size)*width/2+(bordered?1:0)+edgePixels/scale:NaN;
      if(!pathVisible(points,view,padding)) {if(link && !extras.reroute && !flow)rendered.delete(link.id);return;}
      let paint=link && !extras.reroute?paintCache.get(link):null;
      const overlapCurrent=paint?.owner===overlapState && paint.revision===overlapState.revision;
      if(!paint || paint.points!==points || (!overlapCurrent && !overlapsUnchanged(points,overlapIndex,paint.dependencies)) || paint.constructor!==Path2D) {
        const pieces=overlapPieces(points,overlapIndex),reusable=paint?.constructor===Path2D && paint.points===points;
        const path=reusable?paint.path:new Path2D();
        if(!reusable){path.moveTo(...points[0]);for(let i=1;i<points.length;i++)path.lineTo(...points[i]);}
        const samePieces=reusable && pieces.length===paint.pieces.length && pieces.every((p,i)=>{
          const q=paint.pieces[i];return p.count===q.count && p.distance===q.distance && p.a[0]===q.a[0] && p.a[1]===q.a[1] && p.b[0]===q.b[0] && p.b[1]===q.b[1];
        });
        // Pieces follow increasing path distance. Merge with the prior pieces
        // to reuse unchanged stroke geometry without allocating lookup maps.
        const previousWide=reusable?paint.wide:[];let previousPiece=0;
        const wide=samePieces?paint.wide:pieces.filter(piece=>piece.count>1).map(piece=>{
          while(previousPiece<previousWide.length && previousWide[previousPiece].distance<piece.distance)previousPiece++;
          const old=previousWide[previousPiece];
          let p=old && old.distance===piece.distance && old.a[0]===piece.a[0] && old.a[1]===piece.a[1] && old.b[0]===piece.b[0] && old.b[1]===piece.b[1]?old.path:null;
          if(!p){p=new Path2D();p.moveTo(...piece.a);p.lineTo(...piece.b);}
          return {...piece,path:p};
        });
        paint={constructor:Path2D,owner:overlapState,revision:overlapState.revision,points,dependencies:overlapDependencies(points,overlapIndex),pieces,path,wide,mid:reusable?paint.mid:midpoint(points)};
        if(link && !extras.reroute)paintCache.set(link,paint);
      }
      paint.owner=overlapState;paint.revision=overlapState.revision;
      const {pieces,path,wide}=paint;
      if(!piecesVisible(pieces,view,width,bordered,scale,edgePixels)) {if(link && !extras.reroute && !flow)rendered.delete(link.id);return;}
      const colour=color || link?.color || this.constructor.link_type_colors?.[link?.type] || this.default_link_color || "#9ab";
      const strokeColour=this.highlighted_links?.[link?.id]?"#fff":colour;
      ctx.save(); ctx.lineJoin="miter"; ctx.lineCap="butt";
      if(trace) {
        ctx.save();ctx.setLineDash([]);ctx.lineDashOffset=0;
        for(const [colour,extra] of [["#141414",8],[trace,5]]) {
          ctx.strokeStyle=colour;ctx.lineWidth=width+(bordered?2:0)+extra/(scale || 1);ctx.stroke(path);
          for(const piece of wide){ctx.lineWidth=piece.count*width+(bordered?2:0)+extra/(scale || 1);ctx.stroke(piece.path);}
        }
        ctx.restore();
      }
      if(bordered) {ctx.strokeStyle="#141414";ctx.lineWidth=width+2;ctx.stroke(path);}
      ctx.strokeStyle=strokeColour;
      ctx.lineWidth=width; if(extras.disabled) ctx.setLineDash([6,5]); ctx.stroke(path);
      if(bordered)for(const piece of wide) {
        ctx.strokeStyle="#141414";ctx.lineWidth=piece.count*width+2;ctx.stroke(piece.path);
        ctx.strokeStyle=strokeColour;ctx.lineWidth=piece.count*width;ctx.stroke(piece.path);
      } else for(const piece of wide){ctx.lineWidth=piece.count*width;ctx.stroke(piece.path);}
      let animated=false;
      if(r?.locked) {
        const scale=Math.max(0.05,this.ds.scale);
        const style=lockedPatternStyle(setting("LockedPattern","Marching stripes"),performance.now(),setting("PatternSpeed",1));
        const opacity=ctx.globalAlpha ?? 1;
        ctx.lineWidth=width;ctx.strokeStyle="#fff";
        for(const layer of style.layers ?? [style]) {
          ctx.globalAlpha=opacity*layer.alpha;ctx.lineCap=layer.lineCap ?? style.lineCap;
          ctx.lineDashOffset=layer.offset/scale;
          ctx.setLineDash(layer.dash.map(value=>value/scale));ctx.stroke(path);
          for(const piece of wide) {
            ctx.lineWidth=piece.count*width;
            ctx.lineDashOffset=layer.offset/scale+piece.distance;ctx.stroke(piece.path);
          }
          ctx.lineWidth=width;
        }
        animated=style.animated;
      }
      ctx.restore();
      if(link && !flow && arrows)drawFlowArrows(ctx,points,{scale,view,design:setting("ArrowDesign","Chevron")});
      const segment=extras.reroute ?? link;
      if(segment) { segment.path=path; const mid=paint.mid; if(segment._pos) {segment._pos[0]=mid[0];segment._pos[1]=mid[1];} segment._centreAngle=0; }
      if(link && !extras.reroute && !flow) rendered.set(link.id,{points,pieces,a:copy(a),b:copy(b),animated});
      if(animated)scheduleLockedAnimation();
    };
    // Frontend 1.55.x rejects links using only sockets/native reroutes before
    // calling renderLink. Recover ordinary managed links whose orthogonal
    // detour may enter the viewport. Keep native chains/badges/dragging intact.
    const originalSegments=c._renderAllLinkSegments;
    if(typeof originalSegments==="function" && originalSegments.length>=7)c._renderAllLinkSegments=function(ctx,link,a,b,visibleReroutes,rerouteSegments,now,startDir,endDir,disabled=false,startsAtBadge=false) {
      if(!active() || !frameObstacles || !link || link.parentId || link._dragging || startsAtBadge || this.subgraph || this.graph?.floatingLinks?.has(link.id) || !this.renderedPaths?.add)return originalSegments.apply(this,arguments);
      const view=canvasViewport();
      if(!view || (Math.min(a[0],b[0])<=view[2]+20 && Math.max(a[0],b[0])>=view[0]-20 && Math.min(a[1],b[1])<=view[3]+20 && Math.max(a[1],b[1])>=view[1]-20) || getLink(this.graph,link.id)!==link)return originalSegments.apply(this,arguments);
      // Most native-culled paths really are distant. Reuse preparation only
      // after checking endpoints and current metadata, including in-place edits.
      const old=livePaths.get(link.id),target=this.graph.getNodeById(link.target_id);
      const record=target?.properties?.[KEY]?.[link.target_slot];
      const source=record?this.graph.getNodeById(link.origin_id):null;
      // getRoute normalizes pins to corner values before building a seed, so
      // a pin-only edit cannot change this geometry while corners still match.
      const seedMatches=!Array.isArray(record?.waypoints) && (old?.automatic?record==null:old && record===old.manualRecord && record?.signature===`${source?.type}|${source?.outputs?.[link.origin_slot]?.name}|${target?.inputs?.[link.target_slot]?.name}` && (record.savedNodeId===undefined || record.savedNodeId===target?.id) && samePoints(old.manualPoints,record.points));
      const edgePixels=Math.max(setting("FlowArrows",false)?14:2,socketHighlight(link)?6:2,link.id===selected?setting("Handles",5)+1:2);
      const width=setting("Width",3),scale=this.ds?.scale;
      const padding=Number.isFinite(scale) && scale>0 && Number.isFinite(width) && width>0?Math.max(1,overlapState.routes.size)*width/2+1+edgePixels/scale:NaN;
      if(lastGraph===this.graph && seedMatches && old.sceneVersion===sceneVersion && old.maxDetour===setting("MaxDetour",400) && samePosition(old.raw[0],a) && samePosition(old.raw.at(-1),b) && !pathVisible(old.points,view,padding))return;
      // renderLink performs the actual path/stroke visibility test and current
      // metadata validation; do not trust a stale preparation-only bound here.
      this.renderLink(ctx,a,b,link,false,0,null,startDir,endDir,{disabled});
      if(!rendered.has(link.id))return;
      this.renderedPaths.add(link);
      if(link._last_time && now-link._last_time<1000){
        const alpha=ctx.globalAlpha;
        try {const flow=2-(now-link._last_time)*0.002;ctx.globalAlpha=alpha*flow;this.renderLink(ctx,a,b,link,true,flow,"white",startDir,endDir,{disabled});}
        finally {ctx.globalAlpha=alpha;}
      }
    };
    const originalConnections=c.drawConnections;
    c.drawConnections=function() {
      rendered.clear();
      if(lastGraph!==this.graph) {clearSocketHighlights();previousPlanned=[];overlapState=new IncrementalOverlapIndex();overlapIndex=overlapState.index;releaseNativeWorker();cancel(); selected=null;livePaths.clear();liveMembershipChanged=false;lastGraph=this.graph;}
      if(!active() || !setting("RoutingEngine","JavaScript").startsWith("libavoid"))releaseNativeWorker();
      if(!active()) {clearSocketHighlights();if(drag)cancel();}
      try {
      if(active()) {
        frameObstacles=nodeRectangles();
        const planned=[];let planChanges=0;
        for(const link of links(this.graph)) {
          const source=this.graph?.getNodeById(link.origin_id),target=this.graph?.getNodeById(link.target_id);
          if(!source?.outputs?.[link.origin_slot] || !target?.inputs?.[link.target_slot] || String(target.inputs[link.target_slot].link)!==String(link.id))continue;
          const a=slotPos(source,link.origin_slot,false),b=slotPos(target,link.target_slot,true);
          const r=!link.parentId?getRoute(this,link,false,{source,node:target,a,b}):null;
          if(link.parentId && this.graph.getReroute) {
            const stops=[],seen=new Set();let parent=link.parentId;
            while(parent && !seen.has(parent)) {seen.add(parent);const reroute=this.graph.getReroute(parent);if(!reroute)break;stops.push(copy(reroute.pos));parent=reroute.parentId;}
            const vertices=[a,...stops.reverse(),b],points=[];
            for(let i=0;i<vertices.length-1;i++)points.push(...autoRoute(vertices[i],vertices[i+1]).slice(i?1:0));
            planChanges|=appendPlan(planned,link.id,points);
          } else planChanges|=appendPlan(planned,link.id,liveRoute(link,a,b,r));
        }
        if(planned.length!==previousPlanned.length)planChanges=3;
        if((planChanges&2) || liveMembershipChanged){
          const plannedIds=new Set();for(const item of planned)plannedIds.add(item.id);
          for(const id of livePaths.keys())if(!plannedIds.has(id))livePaths.delete(id);
          liveMembershipChanged=false;
        }
        if(planChanges&1) {
          overlapIndex=overlapState.update(planned);previousPlanned=planned;
        }
      } else {previousPlanned=[];livePaths.clear();liveMembershipChanged=false;overlapState=new IncrementalOverlapIndex();overlapIndex=overlapState.index;}
      return originalConnections.apply(this,arguments);
      } finally {frameObstacles=null;frameViewportArea=null;frameViewport=null;}
    };
    const originalForeground=c.onDrawForeground;
    c.onDrawForeground=function(ctx) {
      originalForeground?.apply(this,arguments);
      if(!active()) {if(drag)cancel();return;}
      // Dynamic nodes can remove sockets and request a redraw before the next
      // pointer event. Never paint a gesture against its retired endpoints.
      if(!validDrag())cancel();
      const waypointObstacles=nodeRectangles();
      if(drag?.changedPositions)drag.invalid=drag.changedPositions.some(p=>covered(p,waypointObstacles));
      // Pulsing graph-space overlays identify immediate neighbours during node drag:
      // upstream sources in yellow, downstream targets in dark blue.
      if(connectedNodeHighlights?.graph===c.graph) {
        const phase=((performance.now()-(highlightPulseStart||performance.now()))/650)*Math.PI*2;
        const pulse=(1-Math.cos(phase))/2;
        const yellowAlpha=(0.14+0.30*pulse).toFixed(3),blueAlpha=(0.22+0.38*pulse).toFixed(3);
        ctx.save();
        for(const [ids,colour] of [[connectedNodeHighlights.upstream,`rgba(255,205,35,${yellowAlpha})`],[connectedNodeHighlights.downstream,`rgba(20,55,145,${blueAlpha})`]]) {
          for(const id of ids) {
            const node=c.graph?.getNodeById(id);if(!node)continue;
            const box=node.getBounding?.() ?? [node.pos[0],node.pos[1]-30,node.size?.[0] ?? 140,(node.size?.[1] ?? 100)+30];
            if(!box.every(Number.isFinite))continue;
            ctx.fillStyle=colour;ctx.fillRect(box[0],box[1],box[2],box[3]);
          }
        }
        // Make the exact sockets involved in the connection stand out as well
        // as their parent nodes. Paint both ends so the direction is obvious.
        const scale=Math.max(0.25,this.ds?.scale ?? 1);
        const radius=5.2/scale, ring=8.2/scale;
        for(const link of links(c.graph)) {
          const originId=link.origin_id,targetId=link.target_id;
          const upstream=connectedNodeHighlights.moved.has(targetId) && !connectedNodeHighlights.moved.has(originId);
          const downstream=connectedNodeHighlights.moved.has(originId) && !connectedNodeHighlights.moved.has(targetId);
          if(!upstream && !downstream)continue;
          const colour=upstream?"255,205,35":"55,105,255";
          const source=c.graph?.getNodeById(originId),target=c.graph?.getNodeById(targetId);
          const a=source && slotPos(source,link.origin_slot,false),b=target && slotPos(target,link.target_slot,true);
          for(const p of [a,b]) {
            if(!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))continue;
            ctx.save();
            ctx.shadowColor=`rgba(${colour},${(0.65+0.30*pulse).toFixed(2)})`;
            ctx.shadowBlur=(12+8*pulse)/scale;
            ctx.fillStyle=`rgba(${colour},${(0.22+0.24*pulse).toFixed(2)})`;
            ctx.beginPath();ctx.arc(p[0],p[1],ring,0,Math.PI*2);ctx.fill();
            ctx.shadowBlur=0;
            ctx.strokeStyle=`rgba(${colour},${(0.85+0.15*pulse).toFixed(2)})`;
            ctx.lineWidth=2/scale;ctx.beginPath();ctx.arc(p[0],p[1],ring,0,Math.PI*2);ctx.stroke();
            ctx.fillStyle=`rgb(${colour})`;ctx.beginPath();ctx.arc(p[0],p[1],radius,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle="#ffffff";ctx.lineWidth=1.35/scale;ctx.beginPath();ctx.arc(p[0],p[1],radius,0,Math.PI*2);ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      } else if(connectedNodeHighlights) clearConnectedNodeHighlights();
      ctx.save();
      for(const [id] of rendered)for(const p of waypointPoints(id)) {
        const s=setting("Handles",5)/this.ds.scale;
        ctx.fillStyle=covered(p,waypointObstacles)?"#ff6262":lockedRoute(id)?"#aab4c4":"#3e9fff";ctx.strokeStyle="#14202e";ctx.lineWidth=1/this.ds.scale;
        ctx.beginPath();ctx.moveTo(p[0],p[1]-s);ctx.lineTo(p[0]+s,p[1]);ctx.lineTo(p[0],p[1]+s);ctx.lineTo(p[0]-s,p[1]);ctx.closePath();ctx.fill();ctx.stroke();
      }
      if(drag?.cornerPosition) {
        const p=drag.cornerPosition,s=(setting("Handles",5)+2)/this.ds.scale;
        ctx.fillStyle=drag.invalid?"#ff6262":drag.merging?"#55df9b":"#68d9ff";ctx.strokeStyle="#14202e";
        ctx.beginPath();ctx.moveTo(p[0],p[1]-s);ctx.lineTo(p[0]+s,p[1]);ctx.lineTo(p[0],p[1]+s);ctx.lineTo(p[0]-s,p[1]);ctx.closePath();ctx.fill();ctx.stroke();
      }
      ctx.restore();
    };
    function consume(e) { e.preventDefault();e.stopImmediatePropagation(); }
    document.addEventListener("pointerdown",e=>{
      if(e.target!==element) return;
      if(drag && e.button===0) {consume(e);return;}
      hover=graphPointRaw(e);
      if(e.button===0 && active() && !c.read_only && setting("RouteOnDrop",true)) {
        clearConnectedNodeHighlights();
        nodeDropSnapshot={graph:c.graph,positions:new Map((c.graph?._nodes ?? []).map(n=>[n.id,copy(n.pos)]))};
      }
      if(active() && !drag && e.button===0 && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const mark=socketMark(e);
        if(mark) {consume(e);nodeDropSnapshot=null;pinnedSocket=mark;pinnedRoute=null;setSocketHover(null);status("Connected routes highlighted · click empty canvas or Escape to clear.");dirty(c);return;}
        if(!c.graph?.getNodeOnPos?.(...hover)) {
          const h=hit(hover),link=h && getLink(c.graph,h.id);
          const source=link && c.graph.getNodeById(link.origin_id),target=link && c.graph.getNodeById(link.target_id);
          if(source?.outputs?.[link.origin_slot] && target?.inputs?.[link.target_slot] && String(target.inputs[link.target_slot].link)===String(link.id)) {
            consume(e);nodeDropSnapshot=null;pinnedSocket=null;setSocketHover(null);
            pinnedRoute={graph:c.graph,link,identity:linkIdentity(link),source,target,output:source.outputs[link.origin_slot],input:target.inputs[link.target_slot]};
            status("Route highlighted · click empty canvas or Escape to clear.");dirty(c);return;
          }
        }
      }
      if(!active() || e.button!==0 || e.metaKey)return;
      if(c.read_only) {
        if(!socketMark(e) && !c.graph?.getNodeOnPos?.(...hover) && !hit(hover)) {clearSocketHighlights();status();}
        return;
      }
      const waypointHit=hit(hover);
      const startSocket=waypointHit?.waypoint!==undefined?null:socket(e,false) ?? socket(e,true);
      if(startSocket) {
        // Native ComfyUI owns all socket creation/reconnection gestures.
        nodeDropSnapshot=null;selected=null;setSocketHover(null);status();dirty(c);return;
      }
      const p=graphPoint(e);
      if(e.ctrlKey)return;
      // Preserve native node/widget interaction even when a link lies behind a node.
      if(waypointHit?.waypoint===undefined && c.graph?.getNodeOnPos?.(...graphPointRaw(e))) {selected=null;dirty(c);return;}
      const h=waypointHit;
      if(h) {
        consume(e);selected=h.id;
        const record=rendered.get(h.id),link=getLink(c.graph,h.id);
        const target=link && c.graph.getNodeById(link.target_id),source=link && c.graph.getNodeById(link.origin_id);
        if(!link || !source?.outputs?.[link.origin_slot] || !target || String(target.inputs?.[link.target_slot]?.link)!==String(link.id)) {selected=null;dirty(c);return;}
        if(lockedRoute(h.id)) {status("Route locked. Right-click to unlock.");dirty(c);return;}
        if(link?.parentId) {status("Native reroutes: remove reroutes before editing a manual route.");return;}
        const originalRoute=target.properties?.[KEY]?.[link.target_slot];
        drag={...h,pointerId:e.pointerId,link,linkIdentity:linkIdentity(link),sourceNode:source,targetNode:target,sourceSlot:source.outputs[link.origin_slot],targetSlot:target.inputs[link.target_slot],expectedRoute:originalRoute,originalRoute:originalRoute?JSON.parse(JSON.stringify(originalRoute)):null,graph:c.graph,sourcePos:copy(source.pos),targetPos:copy(target.pos),initial:record.points.map(copy),a:record.a,b:record.b,start:p,moved:false,waypoints:waypointPoints(h.id).map(copy),insertAt:waypointIndex(h),shift:!!e.shiftKey};
        element.setPointerCapture?.(e.pointerId);dirty(c);
      } else {selected=null;clearSocketHighlights();status();dirty(c);}
    },true);
    document.addEventListener("pointermove",e=>{
      // Native ComfyUI handles node dragging. Sample positions after its
      // pointer handler so neighbour overlays follow the moving node(s).
      const nodeMove=nodeDropSnapshot;
      if(nodeMove && e.button!==2 && (e.buttons & 1)) {
        setTimeout(()=>{
          if(nodeDropSnapshot!==nodeMove || c.graph!==nodeMove.graph || !active())return;
          const moved=(nodeMove.graph?._nodes ?? []).filter(n=>{
            const old=nodeMove.positions.get(n.id);
            return old && (old[0]!==n.pos[0] || old[1]!==n.pos[1]);
          }).map(n=>n.id);
          if(moved.length)highlightConnectedNodes(nodeMove.graph,moved);
          else if(connectedNodeHighlights)clearConnectedNodeHighlights();
        },0);
      }
      if(drag && e.pointerId!==drag.pointerId)return;
      if(e.target!==element && !drag) {setSocketHover(null);return;}
      if(active() && !drag && !e.buttons)setSocketHover(socketMark(e));else setSocketHover(null);
      hover=graphPointRaw(e);
      if(!active() || c.read_only) {if(drag)cancel();return;}
      if(!validDrag()) {cancel();return;}
      if(!drag) return;
      consume(e); if(drag.graph!==c.graph) {cancel();return;}
      const p=graphPoint(e),pts=drag.initial.map(copy),dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];
      const displacement=drag.shift && drag.waypoint===undefined?Math.abs(pts[drag.segment][1]===pts[drag.segment+1][1]?dy:dx):Math.hypot(dx,dy);
      if(displacement<2/c.ds.scale) {
        if(drag.moved) {restoreDrag(drag);drag.cornerPosition=null;drag.changedPositions=null;drag.invalid=false;dirty(c);}
        return;
      }
      if(!drag.moved) {
        const edit=drag;edit.moved=true;c.graph.beforeChange?.();
        if(drag!==edit)return;
        if(!active() || c.read_only || !validDrag()) {cancel();return;}
      }
      const controls=drag.waypoints.map(copy);let index=drag.waypoint,position;
      if(index!==undefined)position=[controls[index][0]+dx,controls[index][1]+dy];
      else {index=drag.insertAt;position=p;controls.splice(index,0,copy(position));}
      if(drag.shift && drag.waypoint===undefined) {
        const a=pts[drag.segment],b=pts[drag.segment+1],horizontal=a[1]===b[1];
        const one=horizontal?[a[0],a[1]+dy]:[a[0]+dx,a[1]],two=horizontal?[b[0],b[1]+dy]:[b[0]+dx,b[1]];
        controls.splice(index,1,one,two);drag.changedPositions=[one,two];drag.invalid=covered(one)||covered(two);position=one;
      } else {
        let merge=null,distance=(8/c.ds.scale)**2;
        for(let i=0;i<controls.length;i++)if(i!==index) {
          const d=(controls[i][0]-position[0])**2+(controls[i][1]-position[1])**2;
          if(d<=distance){merge=i;distance=d;}
        }
        drag.merging=merge!==null;
        if(merge!==null) {
          position=copy(controls[merge]);controls[index]=position;
          controls.splice(index,1);
        } else controls[index]=position;
        drag.changedPositions=[position];drag.invalid=covered(position);
      }
      drag.cornerPosition=position;
      drag.expectedRoute=drag.writtenRoute=storeWaypointEdit(drag.id,controls);
      dirty(c);
    },true);
    const finishDrag=e=>{
      if(!drag || e.pointerId!==drag.pointerId) return;consume(e);
      if(!active() || c.read_only || !validDrag() || drag.invalid || drag.changedPositions?.some(p=>covered(p))) {cancel();return;}
      const edit=drag;drag=null;
      try {if(edit.moved)edit.graph?.afterChange?.();}
      finally {
        if(element.hasPointerCapture?.(e.pointerId))element.releasePointerCapture(e.pointerId);
        dirty(c);
      }
    };
    document.addEventListener("pointerup",e=>{
      if(e.button===0 && nodeDropSnapshot) {
        const snapshot=nodeDropSnapshot;nodeDropSnapshot=null;
        // The live overlay is intentionally transient: remove it as soon as
        // the node is released. Keep post-drop routing bookkeeping unchanged.
        clearConnectedNodeHighlights();
        // Run after native pointerup completes node movement/undo bookkeeping.
        setTimeout(()=>{
          if(c.graph!==snapshot.graph)return;
          const moved=(c.graph?._nodes ?? []).filter(n=>{const old=snapshot.positions.get(n.id);return old && (old[0]!==n.pos[0] || old[1]!==n.pos[1]);}).map(n=>n.id);
          if(moved.length)queueDroppedNodes(snapshot.graph,moved);
        },0);
      }
      if(e.target!==element && !drag)return;
      finishDrag(e);
    },true);
    document.addEventListener("pointercancel",e=>{
      if(drag && e.pointerId!==drag.pointerId)return;
      nodeDropSnapshot=null;setSocketHover(null);
      if(drag) {consume(e);cancel();}
    },true);
    element.addEventListener?.("lostpointercapture",e=>{if(drag && e.pointerId===drag.pointerId)cancel();});
    document.addEventListener("keydown",e=>{
      if(e.key==="Escape" && !editableTarget(e)) {clearSocketHighlights();clearConnectedNodeHighlights();}
      if(routingJob && e.key==="Escape") {consume(e);cancelRouting();return;}
      if(e.key==="Escape" && drag) {consume(e);cancel();return;}
      if(editableTarget(e) || !active()) return;
      if(!drag && selected!==null && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !c.read_only) {
        const key=e.key.toLowerCase();
        if(key==="r" && getLink(c.graph,selected)) {
          consume(e);if(!e.repeat)resetRoute(selected);return;
        }
        if(key==="l" && getLink(c.graph,selected)) {
          consume(e);if(!e.repeat)lockOption({id:selected}).callback();return;
        }
        if(key==="c") {
          const h=hit(hover);
          if(h?.id===selected) {
            consume(e);if(!e.repeat)addCornerOption(h,copy(hover)).callback();return;
          }
        }
      }
      if(e.key==="Escape") {selected=null;status();dirty(c);}
      if(!c.read_only && !drag && (e.key==="Delete" || e.key==="Backspace")) {
        const h=hit(hover);
        if(h?.waypoint!==undefined) {consume(e);if(!e.repeat)removeWaypoint(h);return;}
      }
      if(!c.read_only && selected!==null && (e.key==="Delete" || e.key==="Backspace")) {
        consume(e);
        // Delete the hovered corner, never the underlying connection.
        const h=hit(hover);
        if(h?.id===selected && h.waypoint!==undefined) {
          consume(e);removeWaypoint(h);
        } else status("Point at a waypoint, then press Delete to remove it.");
      }
    },true);
    window.addEventListener("blur",()=>{setSocketHover(null);cancel();});
    function lockedRoute(id) {
      const link=getLink(c.graph,id);
      return !!(link && c.graph.getNodeById(link.target_id)?.properties?.[KEY]?.[link.target_slot]?.locked);
    }
    function editRoute(id,fn) {
      const graph=c.graph,link=getLink(graph,id),fingerprint=routingFingerprint(graph);
      change(c,()=>{
        // beforeChange listeners run synchronously and may lock, replace or
        // reroute the connection. Do not apply an edit built from stale state.
        if(getLink(graph,id)===link && routingFingerprint(graph)===fingerprint)fn();
      });
    }
    function lockOption(h) {
      const locked=lockedRoute(h.id);
      return {content:locked?"Unlock route (Alt+L)":"Lock route (Alt+L)",callback:()=>editRoute(h.id,()=>{
        const link=getLink(c.graph,h.id);if(!link)return;
        const node=c.graph.getNodeById(link.target_id);
        let r=getRoute(c,link);
        if(!r) {
          const record=rendered.get(h.id);if(!record)return;
          saveRoute(c,link,record.points.slice(1,-1));r=node.properties[KEY][link.target_slot];
        }
        r.locked=!locked;selected=h.id;status(r.locked?"Route locked. Right-click to unlock.":"Route unlocked.");
      })};
    }
    function selectedNodeIds() {
      const legacy=c.selected_nodes instanceof Map ? [...c.selected_nodes.values()] : Object.values(c.selected_nodes ?? {});
      return new Set((c.graph?._nodes ?? []).filter(n=>c.selectedItems?.has?.(n) || legacy.includes(n)).map(n=>n.id));
    }
    function resetConnections(selectedOnly=false) {
      const ids=selectedNodeIds();
      if(selectedOnly && !ids.size)return;
      change(c,()=>{
        if(!selectedOnly) {
          for(const node of c.graph?._nodes ?? [])if(node.properties?.[KEY]) {
            for(const [slot,r] of Object.entries(node.properties[KEY]))if(!r.locked)delete node.properties[KEY][slot];
            if(!Object.keys(node.properties[KEY]).length)delete node.properties[KEY];
          }
        } else {
          for(const link of links(c.graph)) {
            if(!ids.has(link.origin_id) && !ids.has(link.target_id))continue;
            const node=c.graph.getNodeById(link.target_id);
            if(node?.properties?.[KEY] && !lockedRoute(link.id))delete node.properties[KEY][link.target_slot];
          }
        }
      });
    }
    function cancelRouting() {
      if(!routingJob)return;
      routingJob.cancelled=true;routingJob.worker?.terminate();releaseNativeWorker();
      routingJob.reject?.(new Error("Routing cancelled"));
    }
    function routingFingerprint(graph) {
      return JSON.stringify({nodes:(graph._nodes ?? []).map(n=>[n.id,copy(n.pos),Array.from(n.size ?? []),n.flags?.collapsed,n.properties?.[KEY],n.inputs?.map(i=>i.link)]),links:links(graph).map(l=>[l.id,l.origin_id,l.origin_slot,l.target_id,l.target_slot,l.parentId])});
    }
    function obstructedLinks(movedIds) {
      const obstacles=nodeRectangles().filter(item=>movedIds.has(item.id)).map(item=>item.rect),affected=new Set();
      if(!obstacles.length)return affected;
      for(const link of links(c.graph)) {
        if(link.parentId || lockedRoute(link.id))continue;
        const source=c.graph.getNodeById(link.origin_id),target=c.graph.getNodeById(link.target_id);
        if(!source?.outputs?.[link.origin_slot] || !target?.inputs?.[link.target_slot])continue;
        if(movedIds.has(source.id)||movedIds.has(target.id)){affected.add(link.id);continue;}
        const a=slotPos(source,link.origin_slot,false),b=slotPos(target,link.target_slot,true),r=getRoute(c,link);
        const authored=r?manualRoute(a,b,r.points,24,r.pins ?? []):autoRoute(a,b);
        if(validateRoute(authored,obstacles).nodeHits)affected.add(link.id);
      }
      return affected;
    }
    async function automaticallyRoute(selectedOnly=false,scopeIds=null,forcedLinks=null) {
      if(routingJob || c.read_only)return;
      const ids=scopeIds ?? selectedNodeIds();if(selectedOnly && !ids.size)return;
      const graph=c.graph,job={cancelled:false,worker:null,reject:null,completed:false};routingJob=job;routingCanvases.add(c);
      let sharedNative=false;
      try {
        const routingSettings=()=>JSON.stringify(['RoutingEngine','LaneDistance','Clearance','MaxDetour'].map(name=>setting(name,null)));
        const settingsFingerprint=routingSettings(),fingerprint=routingFingerprint(graph),snapshot=new RoutingSnapshot(graph,KEY,true);
        let lastFingerprintCheck=-Infinity;
        const check=(force=false)=>{
          if(job.cancelled)throw new Error("Routing cancelled");
          if(c.read_only || !active())throw new Error("Routing disabled or graph is read-only; staged routes discarded");
          if(routingSettings()!==settingsFingerprint)throw new Error("Routing settings changed; staged routes discarded");
          if(c.graph!==graph)throw new Error("Graph changed during routing; staged routes discarded");
          const now=performance.now();
          if(force || now-lastFingerprintCheck>=33) {
            lastFingerprintCheck=now;
            const changed=(force || !snapshot.ready)
              ? !snapshot.sameObjects(graph) || routingFingerprint(graph)!==fingerprint
              : !snapshot.matches(graph);
            if(changed)throw new Error("Graph changed during routing; staged routes discarded");
          }
        };

        sharedNative=setting("RoutingEngine","JavaScript").startsWith("libavoid");
        const cancelStatus=message=>{
          status(message);badge.style.pointerEvents="auto";
          const button=document.createElement("button");button.textContent="Cancel";button.style.marginLeft="12px";button.onclick=cancelRouting;badge.append?.(button);
        };
        cancelStatus("Preparing connections · Escape to cancel");
        await new Promise(resolve=>setTimeout(resolve,0));check();
        await snapshot.prepare(check);
        const clearance=setting("Clearance",12),nodeRects=new Map(),rectangles=[];
        await prepareInChunks([...(graph._nodes ?? [])],n=>{
          const box=n.getBounding?.() ?? [n.pos[0],n.pos[1]-30,n.size?.[0] ?? 140,(n.size?.[1] ?? 100)+30];
          const r=[box[0]-clearance,box[1]-clearance,box[0]+box[2]+clearance,box[1]+box[3]+clearance];
          nodeRects.set(n.id,r);if(r.every(Number.isFinite))rectangles.push(r);
        },check);
        const currentLinks=[];
        await prepareInChunks(links(graph),l=>{
          if(graph.getNodeById(l.origin_id)?.outputs?.[l.origin_slot] && graph.getNodeById(l.target_id)?.inputs?.[l.target_slot] && String(graph.getNodeById(l.target_id)?.inputs?.[l.target_slot]?.link)===String(l.id))currentLinks.push(l);
        },check);
        currentLinks.sort((a,b)=>String(a.origin_id).localeCompare(String(b.origin_id),undefined,{numeric:true}) || a.origin_slot-b.origin_slot || String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
        const laneDistance=setting("LaneDistance",8),references=new Map();
        await prepareInChunks(currentLinks,link=>{
          const source=graph.getNodeById(link.origin_id),target=graph.getNodeById(link.target_id);
          if(!source?.outputs?.[link.origin_slot] || !target?.inputs?.[link.target_slot])return;
          const a=slotPos(source,link.origin_slot,false),b=slotPos(target,link.target_slot,true),r=getRoute(c,link,true);
          references.set(link.id,{points:r?.waypoints?.length?routeWaypoints(a,b,r.waypoints,[...nodeRects].map(([id,rect])=>({id,rect})),{maxExtra:setting("MaxDetour",400),clearance}).points:r?manualRoute(a,b,r.points,24,r.pins):autoRoute(a,b),origin:a});
        },check);
        check(true);
        const referenceIndex=new ReferenceIndex([...references]);
        const eligible=currentLinks.filter(l=>!c.graph.getNodeById(l.target_id)?.properties?.[KEY]?.[l.target_slot]?.waypoints?.length && !lockedRoute(l.id) && !l.parentId && l.origin_slot>=0 && l.target_slot>=0 && (!selectedOnly || ids.has(l.origin_id) || ids.has(l.target_id) || forcedLinks?.has(l.id)));
        if(!eligible.length){status("No unconstrained connections to reroute; locked routes and mandatory waypoints are preserved.");return;}
        const staged=new Map(),passes=sharedNative?1:2,lanePasses=laneDistance>0?2:0,total=eligible.length*(passes+2+lanePasses);
        const progress=done=>cancelStatus(`Routing connections: ${done}/${total} · Escape to cancel`);
        const transport=new WorkerEncoder();
        const compute=async data=>{
          check();
          if(job.worker)return new Promise((resolve,reject)=>{
            job.reject=reject;
            const timer=setTimeout(()=>{job.worker?.terminate();job.reject=null;reject(new Error("Routing worker timed out; staged routes discarded"));},["routeBatch","finishBatch"].includes(data.action)?45000:15000);
            const finish=(fn,value)=>{clearTimeout(timer);job.reject=null;fn(value);};
            job.reject=error=>finish(reject,error);
            job.worker.onmessage=e=>e.data.error?finish(reject,new Error(e.data.error)):finish(resolve,e.data);
            job.worker.onerror=()=>finish(reject,new Error("Routing worker failed; staged routes discarded"));
            try {job.worker.postMessage(transport.encode(data));} catch(error) {finish(reject,error);}
          });
          // Compatibility fallback yields between connections.
          await new Promise(resolve=>setTimeout(resolve,0));check();
          if(data.action==="routeBatch") {
            job.usedMainNative=true;
            const {routeSharedLibavoid}=await import("./libavoid_scene.js");
            return routeSharedLibavoid(data.snapshot);
          }
          if(data.action==="nudge")return nudgeLanes(data.points,data.rects,data.options);
          if(data.action==="polish")return pruneDetours(data.points,data.rects,data.options);
          if(data.action==="validate")return {report:validateRoute(data.points,data.rects,data.options)};
          if(data.options?.backend==="libavoid") {
            const {routeWithLibavoid}=await import("./libavoid_backend.js");
            return routeWithLibavoid(data.a,data.b,data.rects,data.options);
          }
          return routeWithValidation(data.a,data.b,data.rects,data.options);
        };
        if(sharedNative && cachedNativeWorker && cachedNativeGraph===graph) {
          job.worker=cachedNativeWorker;cachedNativeWorker=null;cachedNativeGraph=null;
        } else {
          releaseNativeWorker();
          if(typeof Worker!=="undefined")try {job.worker=new Worker(new URL("./routing_worker.js",import.meta.url),{type:"module"});}catch{};
        }
        progress(0);let done=0;
        if(sharedNative) {
          if(!sceneIds.has(graph))sceneIds.set(graph,nextSceneId++);
          const connections=eligible.map(link=>({id:link.id,sourceId:link.origin_id,targetId:link.target_id,a:slotPos(graph.getNodeById(link.origin_id),link.origin_slot,false),b:slotPos(graph.getNodeById(link.target_id),link.target_slot,true)}));
          const snapshot={sceneId:sceneIds.get(graph),nodes:[...nodeRects].filter(([,r])=>r.every(Number.isFinite)).map(([id,rect])=>({id,rect})),connections,references:[...references].map(([id,r])=>({id,...r})),options:{strictAvoidance:true,stub:Math.max(24,clearance+4),maxExtra:setting("MaxDetour",400),maxFactor:Infinity,laneDistance,preferences:{laneDistance}}};
          const batch=await compute({action:"routeBatch",snapshot});check();job.sceneStats=batch.stats;
          const byId=new Map(batch.results.map(result=>[result.id,result])),origins=new Map(connections.map(c=>[c.id,c.a]));
          for(const link of eligible) {
            const result=byId.get(link.id);if(!result)throw Error("Shared router omitted a connection");
            references.set(link.id,{points:result.points,origin:origins.get(link.id)});staged.set(link.id,{link,...result});progress(++done);
          }
        } else for(let pass=0;pass<passes;pass++)for(const link of eligible) {
          check();
          const source=graph.getNodeById(link.origin_id),target=graph.getNodeById(link.target_id),origin=slotPos(source,link.origin_slot,false),destination=slotPos(target,link.target_slot,true);
          const refs=referenceIndex.nearest(origin,link.id).map(id=>references.get(id));
          const options={backend:setting("RoutingEngine","JavaScript").startsWith("libavoid")?"libavoid":"javascript",strictAvoidance:true,stub:Math.max(24,clearance+4),maxExtra:setting("MaxDetour",400),maxFactor:Infinity,laneDistance,exemptStart:[nodeRects.get(source.id)],exemptEnd:[nodeRects.get(target.id)],preferences:{laneDistance,references:refs}};
          const result=await compute({a:origin,b:destination,rects:rectangles,options});check();
          references.set(link.id,{points:result.points,origin});staged.set(link.id,{link,...result});progress(++done);
          // Worker responses already cross the event loop. Keep an explicit
          // yield only for the compatibility path that computes on this thread.
          if(!job.worker)await new Promise(resolve=>setTimeout(resolve,0));
        }
        check();
        let removedCorners=0,nudgedSegments=0,fallbacks=0,compromises=0;
        if(job.worker && staged.size>=32){
          const ordered=[...staged.values()];
          // Preserve global pass ordering; bounded chunks keep worker operations
          // cancellable and limit the size of each finishing response.
          for(const stage of ["polish",...Array(lanePasses).fill("nudge"),"validate"])for(let offset=0;offset<ordered.length;offset+=64){
            const chunk=ordered.slice(offset,offset+64);
            const finished=await compute({action:"finishBatch",stage,records:chunk.map(result=>({id:result.link.id,points:result.points,sourceId:result.link.origin_id,targetId:result.link.target_id})),rects:rectangles,nodeRects:[...nodeRects],references:[...references],options:{laneDistance,maxExtra:setting("MaxDetour",400),maxFactor:Infinity},lanePasses:1});check();
            const returned=new Map(finished.results.map(result=>[result.id,result]));
            for(const result of chunk){
              const next=returned.get(result.link.id);if(!next)throw Error("Routing finishing pass omitted a connection");
              result.points=next.points;if(next.report)result.report=next.report;
              if(stage!=="validate")references.set(result.link.id,{points:result.points,origin:references.get(result.link.id).origin});
              else {
                if(result.fallback)fallbacks++;
                if(next.report.nodeHits || next.report.reversals || next.report.laneViolations)compromises++;
              }
            }
            removedCorners+=finished.removedCorners;nudgedSegments+=finished.nudgedSegments;
            done+=chunk.length;progress(done);
          }
        } else {

        for(const result of staged.values()) {
          const link=result.link,refs=[...references.entries()].filter(([id])=>id!==link.id).map(([,r])=>r);
          const polished=await compute({action:"polish",points:result.points,rects:rectangles,options:{references:refs,laneDistance,exemptStart:[nodeRects.get(link.origin_id)],exemptEnd:[nodeRects.get(link.target_id)]}});check();
          removedCorners+=Math.max(0,result.points.length-polished.points.length);
          result.points=polished.points;result.report=polished.report;
          references.set(link.id,{points:result.points,origin:references.get(link.id).origin});progress(++done);
        }

        for(let pass=0;pass<lanePasses;pass++)for(const result of staged.values()) {
          const link=result.link,refs=[...references.entries()].filter(([id])=>id!==link.id).map(([,r])=>r);
          const nudged=await compute({action:"nudge",points:result.points,rects:rectangles,options:{references:refs,laneDistance,maxExtra:setting("MaxDetour",400),maxFactor:Infinity,exemptStart:[nodeRects.get(link.origin_id)],exemptEnd:[nodeRects.get(link.target_id)]}});check();
          result.points=nudged.points;result.report=nudged.report;nudgedSegments+=nudged.nudged;
          references.set(link.id,{points:result.points,origin:references.get(link.id).origin});progress(++done);
        }

        // Revalidate against the final reference paths, rather than only routes
        // available when this connection was first planned.
        for(const result of staged.values()) {
          const link=result.link,refs=[...references.entries()].filter(([id])=>id!==link.id).map(([,r])=>r);
          const validation=await compute({action:"validate",points:result.points,rects:rectangles,options:{references:refs,laneDistance,exemptStart:[nodeRects.get(link.origin_id)],exemptEnd:[nodeRects.get(link.target_id)]}});check();
          const report=validation.report;progress(++done);
          result.report=report;if(result.fallback)fallbacks++;
          if(report.nodeHits || report.reversals || report.laneViolations)compromises++;
        }
        }
        check(true);
        change(c,()=>{check(true);for(const result of staged.values())saveRoute(c,result.link,result.points.slice(1,-1));});
        const relaxed=[...staged.values()].filter(result=>result.relaxedLimits).length;
        const native=[...staged.values()].filter(result=>result.backend?.startsWith("libavoid")).length;
        const engineFallbacks=[...staged.values()].filter(result=>result.backendWarning).length;
        const reused=job.sceneStats?.reusedConnections ?? 0;
        job.completed=true;
        status(`Automatically routed ${staged.size} connections${sharedNative?` · shared scene, ${reused} reused connectors`:""}${native?` · ${native} libavoid`:""}${engineFallbacks?` · ${engineFallbacks} JavaScript engine fallbacks`:""}${relaxed?` · ${relaxed} expanded avoidance searches`:""} · removed ${removedCorners} extra corners · shifted ${nudgedSegments} lane segments · ${fallbacks} direct fallbacks · ${compromises} routes with remaining constraints. Escape dismisses this message.`);
      } catch(error) {
        status(`${error?.message ?? error}. No staged routes applied.`);
      } finally {
        try {
          if(sharedNative && job.worker && job.completed && !job.sceneStats?.failed && !job.cancelled && c.graph===graph) {
            job.worker.onmessage=null;job.worker.onerror=null;cachedNativeWorker=job.worker;cachedNativeGraph=graph;
          } else job.worker?.terminate();
          if(job.usedMainNative) {
            const {disposeSharedLibavoid}=await import("./libavoid_scene.js");disposeSharedLibavoid();
          }
        } finally {
          routingCanvases.delete(c);routingJob=null;badge.style.pointerEvents="none";
        }
      }
    }
    function removeEveryRedundantCorner() {
      let removed=0,changed=0;
      change(c,()=>{
        for(const link of links(c.graph)) {
          if(link.parentId || lockedRoute(link.id))continue;
          const inputNode=c.graph.getNodeById(link.target_id);
          if(String(inputNode?.inputs?.[link.target_slot]?.link)!==String(link.id))continue;
          const r=getRoute(c,link);if(!r || Array.isArray(r.waypoints))continue;
          const source=c.graph.getNodeById(link.origin_id),target=c.graph.getNodeById(link.target_id);
          if(!source?.outputs?.[link.origin_slot] || !target?.inputs?.[link.target_slot])continue;
          const full=manualRoute(slotPos(source,link.origin_slot,false),slotPos(target,link.target_slot,true),r.points,24,r.pins ?? []);
          const clean=simplify(full);
          const count=Math.max(full.length-clean.length,r.points.length-simplify(r.points).length);
          if(count>0){saveRoute(c,link,clean.slice(1,-1));removed+=count;changed++;}
        }
      });
      status(`Removed ${removed} redundant corners from ${changed} connections. Escape dismisses this message.`);
    }
    function guardMenuOptions(items) {
      const graph=c.graph,fingerprint=routingFingerprint(graph);
      return items.map(item=>!item?.callback?item:{...item,callback:(...args)=>{
        if(!active() || c.read_only || c.graph!==graph || routingFingerprint(graph)!==fingerprint)return;
        return item.callback(...args);
      }});
    }
    async function automaticallyArrange(selectedOnly=false) {
      if(!active() || c.read_only || routingJob || drag)return;
      const graph=c.graph,selection=selectedNodeIds(),fingerprint=routingFingerprint(graph);
      const bounds=n=>Array.from(n.getBounding?.() ?? [n.pos[0],n.pos[1]-30,n.size?.[0] ?? 140,(n.size?.[1] ?? 100)+30]);
      const records=(graph?._nodes ?? []).map(node=>({node,id:node.id,box:bounds(node),pinned:!!(node.flags?.pinned || node.pinned)}));
      const items=[],fixed=[];
      for(const r of records) {
        const [x,y,width,height]=r.box,item={id:r.id,x,y,width,height};
        if(!r.pinned && (!selectedOnly || selection.has(r.id)))items.push(item);else fixed.push(item);
      }
      if(!items.length){status("No movable nodes to arrange.");return;}
      const plan=arrangeNodes(items,links(graph).map(l=>({from:l.origin_id,to:l.target_id})),fixed);
      const moves=[];
      for(const r of records) {
        const point=plan.get(r.id);if(!point)continue;
        const position=[point[0]+r.node.pos[0]-r.box[0],point[1]+r.node.pos[1]-r.box[1]];
        if(!position.every(Number.isFinite)){status("Node layout exceeded valid coordinates. No nodes moved.");return;}
        if(!samePosition(position,r.node.pos))moves.push({node:r.node,position});
      }
      if(!moves.length){status("Nodes are already arranged.");return;}
      let applied=false;
      change(c,()=>{
        if(!active() || routingJob || drag || routingFingerprint(graph)!==fingerprint ||
           records.some(r=>graph.getNodeById(r.id)!==r.node || !!(r.node.flags?.pinned || r.node.pinned)!==r.pinned || JSON.stringify(bounds(r.node))!==JSON.stringify(r.box)))return;
        for(const move of moves){move.node.pos[0]=move.position[0];move.node.pos[1]=move.position[1];}
        applied=true;
      });
      if(!applied){status("Graph changed before layout could be applied. No layout applied.");return;}
      status(`Arranged ${moves.length} nodes.`);
      if(c.graph===graph && !c.read_only && active()) {
        const ids=new Set(moves.map(m=>m.node.id)),affected=obstructedLinks(ids);
        if(affected.size)await automaticallyRoute(true,ids,affected);
      }
    }
    function bulkResetOptions() {
      return [
        {content:"Automatically arrange all nodes",disabled:!!routingJob || !!drag || c.read_only || !(c.graph?._nodes?.length),callback:()=>automaticallyArrange(false)},
        {content:"Automatically arrange selected nodes",disabled:!!routingJob || !!drag || c.read_only || !selectedNodeIds().size,callback:()=>automaticallyArrange(true)},
        {content:"Automatically route every connection",disabled:!!routingJob,callback:()=>automaticallyRoute(false)},
        {content:"Automatically route selected connections",disabled:!!routingJob || selectedNodeIds().size===0,callback:()=>automaticallyRoute(true)},
        {content:"Remove every redundant corner",callback:removeEveryRedundantCorner},
        {content:"Reset every connection",callback:()=>resetConnections(false)},
        {content:"Reset selected connections",disabled:selectedNodeIds().size===0,callback:()=>resetConnections(true)},
      ];
    }
    function resetRoute(id) {
      if(lockedRoute(id)){status("Route locked. Right-click to unlock.");return;}
      editRoute(id,()=>{
        const link=getLink(c.graph,id),node=link&&c.graph.getNodeById(link.target_id);
        if(node?.properties?.[KEY] && !lockedRoute(link.id))delete node.properties[KEY][link.target_slot];
      });
    }
    function removeWaypoint(h) {
      if(h.waypoint===undefined || lockedRoute(h.id))return;
      editRoute(h.id,()=>{const points=waypointPoints(h.id).map(copy);points.splice(h.waypoint,1);storeWaypointEdit(h.id,points);});
    }
    function cleanupOptions(h) {
      return [{content:"Magik: delete waypoint",disabled:h.waypoint===undefined || lockedRoute(h.id),callback:()=>removeWaypoint(h)}];
    }
    function addCornerOption(h,position) {
      return {content:"Magik: add waypoint here (Alt+C)",disabled:lockedRoute(h.id) || !!getLink(c.graph,h.id)?.parentId,callback:()=>{
        if(lockedRoute(h.id)||getLink(c.graph,h.id)?.parentId||covered(position))return;
        editRoute(h.id,()=>{const points=waypointPoints(h.id).map(copy);points.splice(waypointIndex(h),0,copy(position));storeWaypointEdit(h.id,points);selected=h.id;});
      }};
    }
    document.addEventListener("dblclick",e=>{
      if(e.target!==element || !active() || c.read_only || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)return;
      const h=hit(graphPointRaw(e));if(!h || lockedRoute(h.id) || getLink(c.graph,h.id)?.parentId)return;
      if(h.waypoint===undefined && c.graph?.getNodeOnPos?.(...graphPointRaw(e)))return;
      consume(e);if(h.waypoint!==undefined)removeWaypoint(h);else addCornerOption(h,graphPoint(e)).callback();
    },true);
    // Native link context menus bypass getCanvasMenuOptions on newer frontends.
    const originalLinkMenu=c.showLinkMenu;
    if(originalLinkMenu)c.showLinkMenu=function(segment,event,link) {
      const position=event?graphPointRaw(event):copy(this.graph_mouse ?? hover),h=hit(position);
      const ContextMenu=globalThis.LiteGraph?.ContextMenu;
      if(!active() || !h || !ContextMenu)return originalLinkMenu.apply(this,arguments);
      new ContextMenu(guardMenuOptions([lockOption(h),addCornerOption(h,position),...cleanupOptions(h),{content:"Magik: reset orthogonal route (Alt+R)",callback:()=>resetRoute(h.id)},...bulkResetOptions(),null,{content:"ComfyUI link options…",callback:()=>originalLinkMenu.call(this,segment,event,link)}]),{event});
    };
    const menu=c.getCanvasMenuOptions;
    c.getCanvasMenuOptions=function() {
      const options=menu?.apply(this,arguments) ?? [];
      if(!active()) return options;
      const nativeOptionCount=options.length;
      const h=hit(this.graph_mouse ?? [NaN,NaN]);
      if(h) {
        options.push(lockOption(h),addCornerOption(h,copy(this.graph_mouse ?? hover)),...cleanupOptions(h));
        options.push(null,{content:"Magik: reset orthogonal route (Alt+R)",callback:()=>resetRoute(h.id)});

      }
      options.push(null,...bulkResetOptions());
      options.push(null,{content:"Magik Orthogonal Links: cancel route edit",disabled:!drag,callback:cancel});
      options.splice(nativeOptionCount,options.length-nativeOptionCount,...guardMenuOptions(options.slice(nativeOptionCount)));
      return options;
    };
    const nodeMenu=c.getNodeMenuOptions;
    if(typeof nodeMenu==="function")c.getNodeMenuOptions=function() {
      const options=nodeMenu.apply(this,arguments) ?? [];
      if(active())options.push(null,...guardMenuOptions(bulkResetOptions()));
      return options;
    };
    console.info("[Magik Orthogonal Links] ready — Canvas renderer. Create links normally; click a route to edit.");
  }
});
