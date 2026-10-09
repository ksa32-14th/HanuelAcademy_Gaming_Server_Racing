// What the AI (and the racing line on screen) learns from the time trial board. The starting point is always the
// theoretical line (minimum curvature, track.js) and the physics speed profile on it; the drivers' fastest laps on the
// board are a REFERENCE, not a copy: the line moves only part of the way towards theirs (and keeps a margin from the
// track limits), and the corner speeds part of the way towards what they carried. Everything is rebuilt whenever the
// board changes, so the line, its braking colours and the AI keep improving as people set faster laps.
import {MU,RHO,CLA,CDA,POWER,G,BRK,brakeK,VMAX,gripV,TRACTION} from './config.js?v=20261010s';
import {N,DS,X,Z,TX,TZ,HWa,TLL,TLR,RL,VP} from './track.js?v=20261010s';

export const RL0=RL.slice(),VP0=VP.slice(); // the theoretical line and its profile, as track.js built them
const LINE_W=0.5,SPEED_W=0.5,EDGE_M=0.8;    // how far towards the drivers' line / corner speeds, and the margin inside the edge

const smoothA=(a,w,p)=>{let c=Float64Array.from(a);for(let q=0;q<p;q++){const n=new Float64Array(N);
  for(let i=0;i<N;i++){let s=0;for(let k=-w;k<=w;k++)s+=c[(i+k+N)%N];n[i]=s/(2*w+1);}c=n;}return c;};

// a ghost ({x, z, n, hz}: the driving line, hz samples a second) on the track: lateral offset and speed per sample
export function ghostOnTrack(g){const sd=new Float64Array(N),sv=new Float64Array(N),cnt=new Float64Array(N);
  let hint=-1;
  for(let j=1;j<g.n-1;j++){let bi=0,bd=1e18;
    if(hint<0){for(let i=0;i<N;i++){const d=(g.x[j]-X[i])**2+(g.z[j]-Z[i])**2;if(d<bd){bd=d;bi=i;}}}
    else for(let k=-40;k<=40;k++){const i=(hint+k+N)%N,d=(g.x[j]-X[i])**2+(g.z[j]-Z[i])**2;if(d<bd){bd=d;bi=i;}}
    hint=bi;
    sd[bi]+=-(g.x[j]-X[bi])*TZ[bi]+(g.z[j]-Z[bi])*TX[bi];
    sv[bi]+=Math.hypot(g.x[j+1]-g.x[j-1],g.z[j+1]-g.z[j-1])*g.hz/2;cnt[bi]++;}
  let first=-1;for(let i=0;i<N;i++)if(cnt[i]){first=i;break;}if(first<0)return null;
  const fill=a=>{const o=new Float64Array(N);
    for(let k=0;k<N;k++){const i=(first+k)%N;if(cnt[i]){o[i]=a[i]/cnt[i];continue;}
      let a0=i,b=i;while(!cnt[a0])a0=(a0-1+N)%N;while(!cnt[b])b=(b+1)%N;const da=(i-a0+N)%N,db=(b-i+N)%N;
      o[i]=(a[a0]/cnt[a0]*db+a[b]/cnt[b]*da)/(da+db);}return o;};
  return {d:smoothA(fill(sd),4,3),v:smoothA(fill(sv),2,2)};}

// curvature (1/m) of a line given as lateral offsets
function curv(line){const px=new Float64Array(N),pz=new Float64Array(N),k=new Float64Array(N);
  for(let i=0;i<N;i++){px[i]=X[i]-TZ[i]*line[i];pz[i]=Z[i]+TX[i]*line[i];}
  for(let i=0;i<N;i++){const a=(i-3+N)%N,c=(i+3)%N,x1=px[i]-px[a],z1=pz[i]-pz[a],x2=px[c]-px[i],z2=pz[c]-pz[i],cr=x1*z2-z1*x2;
    k[i]=Math.abs(2*cr/(Math.hypot(x1,z1)*Math.hypot(x2,z2)*Math.hypot(px[c]-px[a],pz[c]-pz[a])+1e-6));}
  const t=new Float64Array(N);for(let i=0;i<N;i++){let m=0;for(let j=-2;j<=2;j++)m=Math.max(m,k[(i+j+N)%N]);t[i]=m;}return t;}
// the cornering speed the curvature allows (as track.js), for a car with `grip` × the base tyres
function cornerCaps(line,grip=1){const k=curv(line),m=820,mu=MU*0.985*grip,kd=0.5*RHO*CLA/m,o=new Float64Array(N);
  for(let i=0;i<N;i++){let v=VMAX;for(let it=0;it<4;it++){const mv=mu*gripV(v);v=k[i]<=mv*kd?VMAX:Math.min(VMAX,Math.sqrt(mv*G/(k[i]-mv*kd)));}o[i]=v;}return o;}
// braking (backwards) and acceleration (forwards) passes over corner caps: the speed profile
export function profileFrom(caps,{grip=1,brake=1,power=1}={}){const m=820,mu=MU*0.985*grip,kd=0.5*RHO*CLA/m,P=Float32Array.from(caps);
  for(let p=0;p<2;p++)for(let i=N-1;i>=0;i--){const v=P[(i+1)%N];
    const dec=mu*gripV(v)*BRK*brake*brakeK(v)*0.97*(G+kd*v*v)+0.5*RHO*CDA*v*v/m;P[i]=Math.min(P[i],Math.sqrt(v*v+2*dec*DS));}
  for(let p=0;p<2;p++)for(let i=0;i<N;i++){const v=P[i];
    const acc=Math.max(0.4,Math.min(POWER*power/(m*Math.max(v,5)),mu*gripV(v)*TRACTION*(G+kd*v*v))-0.5*RHO*CDA*v*v/m);
    const j=(i+1)%N;P[j]=Math.min(P[j],Math.sqrt(v*v+2*acc*DS));}
  return P;}
// the curvature-relaxed line: no stretch tighter than the car can be steered round (24 m), as track.js does
// (never past the painted edge: on the straights the tarmac runs on almost to the wall, and a line out there put the
// cars into it under braking)
function relax(line){const lim=i=>[-(Math.min(TLL[i],HWa[i])-EDGE_M),Math.min(TLR[i],HWa[i])-EDGE_M];
  for(let i=0;i<N;i++){const [a,b]=lim(i);line[i]=Math.min(b,Math.max(a,line[i]));}
  for(let it=0;it<200;it++){const k=curv(line);let bad=false;
    for(let i=0;i<N;i++){if(k[i]<=1/24)continue;bad=true;
      for(let j=-3;j<=3;j++){const t=(i+j+N)%N,[a,b]=lim(t);line[t]=Math.min(b,Math.max(a,line[t]+((line[(t-1+N)%N]+line[(t+1)%N])/2-line[t])*0.5));}}
    if(!bad)break;}
  return line;}

/* learn(laps): laps = the board's laps that have a driving line, fastest first, each {t (lap s), g (ghost)}. Returns
   null without any, else {line (the reference line), caps (reference corner speeds, base car), ref (the reference
   profile for the base car: the racing line's colours), top (P1's lap), rest (the mean lap of the others)} */
export function learn(laps){
  const on=laps.map(l=>({t:l.t,o:ghostOnTrack(l.g)})).filter(l=>l.o);if(!on.length)return null;
  // the drivers' line: P1 counts double
  const w=on.map((_,k)=>k===0?2:1),ws=w.reduce((a,b)=>a+b,0),hd=new Float64Array(N),hv=new Float64Array(N);
  on.forEach((l,k)=>{for(let i=0;i<N;i++){hd[i]+=l.o.d[i]*w[k]/ws;hv[i]+=l.o.v[i]*w[k]/ws;}});
  const line=new Float64Array(N);for(let i=0;i<N;i++)line[i]=RL0[i]+LINE_W*(hd[i]-RL0[i]);
  relax(line);
  // corner speeds: the physics on the new line, moved part of the way towards what the drivers carried there (only
  // where it is a corner — on the straights it is power and drag that decide)
  const th=cornerCaps(line),caps=new Float64Array(N);
  for(let i=0;i<N;i++)caps[i]=th[i]>=VMAX-0.1?VMAX:Math.max(10,th[i]+SPEED_W*(hv[i]-th[i]));
  const sm=smoothA(caps,1,1);for(let i=0;i<N;i++)caps[i]=caps[i]>=VMAX-0.1?VMAX:Math.min(caps[i],sm[i]+2);
  const rest=on.length>1?on.slice(1).reduce((a,l)=>a+l.t,0)/(on.length-1):on[0].t*1.012;
  return {line:Float32Array.from(line),caps,ref:profileFrom(caps),top:on[0].t,rest};}

// no board laps yet: the theoretical line and its corner speeds
export const theory=()=>({line:RL0,caps:cornerCaps(RL0),ref:VP0,top:null,rest:null});
export {cornerCaps};
