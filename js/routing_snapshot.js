import {prepareInChunks} from './routing_preparation.js';
const graphLinks=graph=>graph.links instanceof Map?[...graph.links.values()]:Object.values(graph.links ?? {});
const endpointFields=['id','origin_id','origin_slot','target_id','target_slot','parentId'];

// Copy once, compare in place later. Arrays (especially route vertices) need no
// temporary coordinate arrays or JSON strings during repeated checks.
function capture(value){
  if(value===null || typeof value!=='object')return value;
  if(typeof value.toJSON==='function')return {kind:'json',value:JSON.stringify(value)};
  if(Array.isArray(value))return Array.from(value,capture);
  const keys=Object.keys(value);
  return {kind:'object',prototype:Object.getPrototypeOf(value),keys,items:keys.map(key=>capture(value[key]))};
}
function matches(snapshot,value){
  if(snapshot===null || typeof snapshot!=='object')return Object.is(snapshot,value);
  if(snapshot.kind==='json')return JSON.stringify(value)===snapshot.value;
  if(value===null || typeof value!=='object' || typeof value.toJSON==='function')return false;
  if(Array.isArray(snapshot)){
    if(!Array.isArray(value) || value.length!==snapshot.length)return false;
    for(let i=0;i<value.length;i++)if(!matches(snapshot[i],value[i]))return false;
    return true;
  }
  if(Object.getPrototypeOf(value)!==snapshot.prototype)return false;
  const keys=Object.keys(value);
  if(keys.length!==snapshot.keys.length)return false;
  for(let i=0;i<keys.length;i++)if(keys[i]!==snapshot.keys[i] || !matches(snapshot.items[i],value[keys[i]]))return false;
  return true;
}
const sameArray=(expected,current)=>{
  if(current===undefined || current===null)return expected===undefined;
  if(!expected || expected.length!==current.length)return false;
  for(let i=0;i<expected.length;i++)if(!Object.is(expected[i],current[i]))return false;
  return true;
};
export class RoutingSnapshot {
  constructor(graph,routeKey='magikOrthogonalRoutes',defer=false){
    this.graph=graph;this.routeKey=routeKey;
    this.nodeRefs=[...(graph._nodes ?? [])];this.linkRefs=graphLinks(graph);this.nodes=[];this.links=[];this.ready=false;
    if(!defer){this.nodes=this.nodeRefs.map(node=>this.captureNode(node));this.links=this.linkRefs.map(link=>this.captureLink(link));this.ready=true;}
  }
  captureNode(node){return {node,id:node.id,pos:[Number(node.pos[0]),Number(node.pos[1])],size:Array.from(node.size ?? []),collapsed:node.flags?.collapsed,routes:capture(node.properties?.[this.routeKey]),inputs:node.inputs?.map(input=>input.link)};}
  captureLink(link){return {link,values:endpointFields.map(key=>link[key])};}
  async prepare(check){
    if(this.ready)return;
    await prepareInChunks(this.nodeRefs,node=>this.nodes.push(this.captureNode(node)),check);
    await prepareInChunks(this.linkRefs,link=>this.links.push(this.captureLink(link)),check);
    this.ready=true;
  }
  sameObjects(graph){
    if(graph!==this.graph)return false;
    const nodes=graph._nodes ?? [],links=graphLinks(graph);
    if(nodes.length!==this.nodeRefs.length || links.length!==this.linkRefs.length)return false;
    for(let i=0;i<nodes.length;i++)if(nodes[i]!==this.nodeRefs[i])return false;
    for(let i=0;i<links.length;i++)if(links[i]!==this.linkRefs[i])return false;
    return true;
  }
  matches(graph){
    if(!this.ready || graph!==this.graph)return false;
    const nodes=graph._nodes ?? [];
    if(nodes.length!==this.nodes.length)return false;
    for(let i=0;i<nodes.length;i++){
      const node=nodes[i],old=this.nodes[i];
      if(node!==old.node || !Object.is(node.id,old.id) || !Object.is(Number(node.pos[0]),old.pos[0]) || !Object.is(Number(node.pos[1]),old.pos[1]) || !Object.is(node.flags?.collapsed,old.collapsed))return false;
      if(!sameArray(old.size,node.size ?? []) || !matches(old.routes,node.properties?.[this.routeKey]))return false;
      const inputs=node.inputs;
      if(inputs==null){if(old.inputs!==undefined)return false;}
      else{
        if(!old.inputs || inputs.length!==old.inputs.length)return false;
        for(let j=0;j<inputs.length;j++)if(!Object.is(inputs[j].link,old.inputs[j]))return false;
      }
    }
    const links=graphLinks(graph);
    if(links.length!==this.links.length)return false;
    for(let i=0;i<links.length;i++){
      const link=links[i],old=this.links[i];if(link!==old.link)return false;
      for(let j=0;j<endpointFields.length;j++)if(!Object.is(link[endpointFields[j]],old.values[j]))return false;
    }
    return true;
  }
}
