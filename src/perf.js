// Performance instrumentation. Off unless the page is opened with ?perf; then it records frame times, physics
// substeps, scaler level changes, GPU time, draw calls and memory, keeps the numbers in window.__perf and dumps them
// as JSON to the console every 10 s. WebGL context loss/restore and the boot summary are logged in every build.
const Q=new URLSearchParams(location.search);
const on=Q.has('perf');
const t0=performance.now();
const now=()=>+(performance.now()-t0).toFixed(1); // ms since the page started

// frame-time samples: everything since the last reset() (the scenario's 120 s race) and the current 10 s window
const all=[],win=[],worst=[];
let allSub=0,allSubN=0,winSub=[];
let gpuSum=0,gpuN=0,gpuAll=0,gpuAllN=0;
const scalerLog=[],ctxLog=[],marks=[];
let state={boot:null,last:null};
const sections={};
let src=null; //{renderer, rtBytes(): {...}, phase(): string} provided by game.js

function pct(a,p){if(!a.length)return null;const s=Float64Array.from(a).sort();return +s[Math.min(s.length-1,Math.floor(p/100*s.length))].toFixed(2);}
function stats(a){return {frames:a.length,p50:pct(a,50),p95:pct(a,95),p99:pct(a,99),max:a.length?+Math.max(...a).toFixed(1):null,
  over33:a.filter(x=>x>33).length,over50:a.filter(x=>x>50).length};}
const MB=b=>+(b/1048576).toFixed(1);
function memory(){
  const m=performance.memory,out={};
  if(m)Object.assign(out,{jsHeapUsedMB:MB(m.usedJSHeapSize),jsHeapTotalMB:MB(m.totalJSHeapSize),jsHeapLimitMB:MB(m.jsHeapSizeLimit)});
  if(src){const r=src.renderer;out.gl={geometries:r.info.memory.geometries,textures:r.info.memory.textures,programs:r.info.programs?r.info.programs.length:null};
    try{const e=src.rtBytes();out.rtMB=Object.fromEntries(Object.entries(e).map(([k,v])=>[k,MB(v)]));}catch(e){out.rtMB='n/a: '+e.message;}}
  return out;}

export const perf={
  on,
  attach(s){src=s;},
  // once at boot, in every build: which GPU, which preset, which pixel ratio
  boot(info){state.boot=info;console.info('[HRC boot]',JSON.stringify(info));},
  // one per rendered frame: interval (ms) and physics substeps taken
  frame(ms,sub,calls,tris){if(!on||!(ms>0)||ms>1000)return;all.push(ms);win.push(ms);allSub+=sub;allSubN++;winSub.push(sub);
    state.calls=calls;state.tris=tris;
    // the ten longest frames of the run, with when they happened (a hitch lines up with a scaler change, a context loss …)
    if(ms>50&&(worst.length<10||ms>worst[worst.length-1].ms)){worst.push({t:now(),ms:+ms.toFixed(1),sub,phase:src?src.phase():null});worst.sort((a,b)=>b.ms-a.ms);worst.length=Math.min(worst.length,10);}},
  gpu(ms){if(!on||!(ms>0))return;gpuSum+=ms;gpuN++;gpuAll+=ms;gpuAllN++;},
  // CPU time accumulated per named section (ms total, calls) — e.g. the AI vs the rest of step()
  acc(name,ms){const a=sections[name]||(sections[name]={ms:0,n:0});a.ms+=ms;a.n++;},
  sections(){return Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,{msPerCall:+(v.ms/v.n).toFixed(4),calls:v.n}]));},
  scaler(scale,why){scalerLog.push({t:now(),scale,why});if(on)console.info('[HRC scaler]',now(),'ms → scale',scale,why||'');},
  ctx(ev){ctxLog.push({t:now(),ev});console.warn('[HRC webgl]',ev,'at',now(),'ms');},
  // a labelled memory snapshot (lobby, race start, +5 min …)
  mark(label){const m={t:now(),label,phase:src?src.phase():null,...memory()};marks.push(m);if(on)console.info('[HRC mark]',JSON.stringify(m));return m;},
  reset(){all.length=0;win.length=0;worst.length=0;allSub=0;allSubN=0;winSub=[];gpuAll=gpuAllN=0;gpuSum=gpuN=0;for(const k in sections)delete sections[k];},
  report(){return {t:now(),run:{...stats(all),substepsAvg:allSubN?+(allSub/allSubN).toFixed(2):null,gpuMsAvg:gpuAllN?+(gpuAll/gpuAllN).toFixed(2):null,sections:perf.sections(),worst:worst.slice()},
    window:state.last,calls:state.calls,tris:state.tris,scaler:scalerLog,ctx:ctxLog,marks,boot:state.boot,mem:memory()};},
};
if(on){
  window.__perf=perf;
  setInterval(()=>{
    const sub=winSub.length?winSub.reduce((a,b)=>a+b,0)/winSub.length:null;
    state.last={...stats(win),substepsAvg:sub!=null?+sub.toFixed(2):null,substepsMax:winSub.length?Math.max(...winSub):null,gpuMsAvg:gpuN?+(gpuSum/gpuN).toFixed(2):null,
      calls:state.calls,tris:state.tris,phase:src?src.phase():null};
    win.length=0;winSub=[];gpuSum=gpuN=0;
    console.log('[HRC perf]',JSON.stringify({t:now(),window:state.last,mem:memory()}));
  },10000);
  if(Q.has('scenario'))import('../tools/scenario.js').catch(e=>console.error('scenario',e));
}
