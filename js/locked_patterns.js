export const LOCKED_PATTERNS=["Stripes","Dashes","Dots","Dash-dot","Marching stripes","Flowing dots","Moving highlight","Pulse","Reverse stripes","Reverse dots","Alternating bands","Double dashes","Comet trail","Twin comets","Scanning light","Breathing bands","Spark packets","Heartbeat"];
export function lockedPatternStyle(name,timeMs=0,speed=1) {
  const t=timeMs/1000*Math.max(0,Number(speed)||0);
  const base={dash:[6,6],offset:0,alpha:0.55,lineCap:"butt",animated:false};
  const wave=0.5+0.5*Math.sin(t*Math.PI*2);
  const comet=(phase=0)=>[
    {dash:[30,90],offset:-(t*72+phase)%120,alpha:0.16,lineCap:"round"},
    {dash:[18,102],offset:-(t*72+phase)%120,alpha:0.35,lineCap:"round"},
    {dash:[6,114],offset:-(t*72+phase)%120,alpha:0.95,lineCap:"round"},
  ];
  switch(name) {
    case "Dashes":return {...base,dash:[12,8]};
    case "Dots":return {...base,dash:[0.1,10],lineCap:"round",alpha:0.8};
    case "Dash-dot":return {...base,dash:[10,4,2,4]};
    case "Marching stripes":return {...base,offset:-(t*24)%12,animated:speed>0};
    case "Flowing dots":return {...base,dash:[0.1,12],lineCap:"round",alpha:0.8,offset:-(t*24)%12.1,animated:speed>0};
    case "Moving highlight":return {...base,dash:[28,72],alpha:0.8,offset:-(t*60)%100,animated:speed>0};
    case "Pulse":return {...base,dash:[],alpha:0.2+0.5*(0.5+0.5*Math.sin(t*Math.PI*2)),animated:speed>0};
    case "Reverse stripes":return {...base,offset:(t*24)%12,animated:speed>0};
    case "Reverse dots":return {...base,dash:[0.1,12],lineCap:"round",alpha:0.8,offset:(t*24)%12.1,animated:speed>0};
    case "Alternating bands":return {...base,dash:[12,12],alpha:0.3+0.5*wave,offset:-(t*18)%24,animated:speed>0};
    case "Double dashes":return {...base,dash:[4,3,12,9],alpha:0.75,offset:-(t*36)%28,animated:speed>0};
    case "Comet trail":return {...base,layers:comet(),animated:speed>0};
    case "Twin comets":return {...base,layers:[...comet(),...comet(60)],animated:speed>0};
    case "Scanning light":return {...base,dash:[18,90],alpha:0.85,offset:80*Math.sin(t*Math.PI/2),animated:speed>0};
    case "Breathing bands":return {...base,dash:[2+10*wave,14-10*wave],alpha:0.65,offset:-(t*12)%16,animated:speed>0};
    case "Spark packets":return {...base,dash:[0.1,3,0.1,3,8,38],lineCap:"round",alpha:0.9,offset:-(t*40)%52.2,animated:speed>0};
    case "Heartbeat": {
      const phase=t%1,beat=Math.exp(-Math.pow((phase-0.15)/0.07,2))+0.6*Math.exp(-Math.pow((phase-0.35)/0.08,2));
      return {...base,dash:[],alpha:Math.min(0.95,0.2+0.7*beat),animated:speed>0};
    }
    default:return base;
  }
}
