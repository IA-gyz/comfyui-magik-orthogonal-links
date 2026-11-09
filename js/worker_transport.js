// A transport belongs to one routing job. Keep object identity on both sides:
// exemption rectangles must be the same objects as the obstacle rectangles.
export class WorkerEncoder {
  constructor(){this.rects=null;this.references=new Map();this.paths=new WeakMap();this.nextPath=0;}
  encode(data){
    if(!data.rects)return data;
    const out={...data};
    if(this.rects!==data.rects){
      this.rects=data.rects;this.references.clear();this.paths=new WeakMap();this.nextPath=0;
      out.sceneRects=data.rects;
      this.indices=new Map(data.rects.map((rect,index)=>[rect,index]));
    }
    delete out.rects;out.residentScene=true;
    if(data.options){
      out.options={...data.options};
      for(const key of ['exemptStart','exemptEnd'])if(data.options[key]){
        out.options[key]=data.options[key].map(rect=>this.indices.has(rect)?{sceneRect:this.indices.get(rect)}:{literal:rect});
      }
      out.pathUpdates=[];
      const encodePaths=refs=>refs.map(ref=>{
        if(!this.paths.has(ref)){this.paths.set(ref,this.nextPath++);out.pathUpdates.push([this.paths.get(ref),ref]);}
        return this.paths.get(ref);
      });
      if(data.options.references){out.optionReferenceIds=encodePaths(data.options.references);delete out.options.references;}
      if(data.options.preferences?.references){
        out.options.preferences={...data.options.preferences};
        out.preferenceReferenceIds=encodePaths(data.options.preferences.references);
        delete out.options.preferences.references;
      }
    }
    if(data.nodeRects)out.nodeRects=data.nodeRects.map(([id,rect])=>[id,this.indices.has(rect)?{sceneRect:this.indices.get(rect)}:{literal:rect}]);
    if(data.references){
      out.referenceUpdates=data.references.filter(([id,ref])=>this.references.get(id)!==ref);
      out.referenceIds=data.references.map(([id])=>id);
      for(const [id,ref] of out.referenceUpdates)this.references.set(id,ref);
      delete out.references;
    }
    return out;
  }
}

export class WorkerDecoder {
  constructor(){this.rects=null;this.references=new Map();this.paths=new Map();}
  decode(data){
    if(!data.residentScene)return data;
    if(data.sceneRects){this.rects=data.sceneRects;this.references.clear();this.paths.clear();}
    if(!this.rects)throw Error('Missing routing worker scene');
    const rectangle=entry=>'sceneRect' in entry?this.rects[entry.sceneRect]:entry.literal;
    const out={...data,rects:this.rects};
    if(data.options){
      out.options={...data.options};
      for(const key of ['exemptStart','exemptEnd'])if(data.options[key])out.options[key]=data.options[key].map(rectangle);
      for(const [id,ref] of data.pathUpdates??[])this.paths.set(id,ref);
      const decodePaths=ids=>ids.map(id=>{if(!this.paths.has(id))throw Error('Missing worker reference');return this.paths.get(id);});
      if(data.optionReferenceIds)out.options.references=decodePaths(data.optionReferenceIds);
      if(data.preferenceReferenceIds)out.options.preferences={...data.options.preferences,references:decodePaths(data.preferenceReferenceIds)};
    }
    if(data.nodeRects)out.nodeRects=data.nodeRects.map(([id,rect])=>[id,rectangle(rect)]);
    if(data.referenceIds){
      for(const [id,ref] of data.referenceUpdates)this.references.set(id,ref);
      out.references=data.referenceIds.map(id=>[id,this.references.get(id)]);
    }
    return out;
  }
}
