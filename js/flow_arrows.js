export const ARROW_DESIGNS=["Chevron","Triangle","Open arrow","Double chevron"];

// Screen-sized glyphs, directed in stored output-to-input order. Clip the
// placement index range before iterating, including very long world segments.
export function arrowPlacements(points,scale=1,view=null) {
  scale=Number.isFinite(scale)&&scale>0?scale:1;
  const size=7/scale,spacing=140/scale,margin=18/scale,result=[],runs=[];
  if(![size,spacing,margin].every(Number.isFinite)||spacing<=0)return result;
  // Aligned editable handles do not change the painted line. Merge only
  // forward continuations for glyph placement, retaining real bends/reversals.
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];
    if(!a.every(Number.isFinite)||!b.every(Number.isFinite)||(dx!==0&&dy!==0)||(!dx&&!dy))continue;
    const ux=Math.sign(dx),uy=Math.sign(dy),last=runs.at(-1);
    if(last && last.b[0]===a[0] && last.b[1]===a[1] && last.ux===ux && last.uy===uy)last.b=b;
    else runs.push({a,b,ux,uy});
  }
  for(const run of runs) {
    const {a,b}=run,dx=b[0]-a[0],dy=b[1]-a[1];
    const length=Math.hypot(dx,dy);if(!Number.isFinite(length)||length<2*margin)continue;
    const ux=dx/length,uy=dy/length,count=Math.floor((length-2*margin)/spacing)+1;
    if(!Number.isSafeInteger(count))continue;
    const offset=(length-(count-1)*spacing)/2;
    let first=0,last=count-1;
    if(view) {
      const x0=view[0]-size*2,y0=view[1]-size*2,x1=view[2]+size*2,y1=view[3]+size*2;
      if((dx===0&&(a[0]<x0||a[0]>x1))||(dy===0&&(a[1]<y0||a[1]>y1)))continue;
      const lo=dx?Math.min((x0-a[0])/ux,(x1-a[0])/ux):Math.min((y0-a[1])/uy,(y1-a[1])/uy);
      const hi=dx?Math.max((x0-a[0])/ux,(x1-a[0])/ux):Math.max((y0-a[1])/uy,(y1-a[1])/uy);
      first=Math.max(first,Math.ceil((lo-offset)/spacing));last=Math.min(last,Math.floor((hi-offset)/spacing));
    }
    for(let j=first;j<=last && result.length<1024;j++)result.push({x:a[0]+ux*(offset+j*spacing),y:a[1]+uy*(offset+j*spacing),ux,uy,size});
    if(result.length===1024)break;
  }
  return result;
}

export function drawFlowArrows(ctx,points,{scale=1,view=null,design="Chevron",color="#fff"}={}) {
  ctx.save();
  try {
    ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.strokeStyle=color;ctx.fillStyle=color;
    ctx.lineWidth=1.8/(Number.isFinite(scale)&&scale>0?scale:1);ctx.lineCap="round";ctx.lineJoin="round";
    for(const p of arrowPlacements(points,scale,view)) {
      const point=(along,across)=>[p.x+p.ux*along-p.uy*across,p.y+p.uy*along+p.ux*across];
      const chevron=(offset=0)=>{ctx.moveTo(...point(offset-p.size,p.size*.65));ctx.lineTo(...point(offset,0));ctx.lineTo(...point(offset-p.size,-p.size*.65));};
      ctx.beginPath();
      if(design==="Triangle") {
        ctx.moveTo(...point(p.size*.5,0));ctx.lineTo(...point(-p.size*.65,p.size*.7));ctx.lineTo(...point(-p.size*.65,-p.size*.7));ctx.closePath();ctx.fill();
      } else {
        chevron(p.size*.5);
        if(design==="Double chevron")chevron(-p.size*.5);
        if(design==="Open arrow"){ctx.moveTo(...point(-p.size,0));ctx.lineTo(...point(p.size*.5,0));}
        ctx.stroke();
      }
    }
  } finally {ctx.restore();}
}
