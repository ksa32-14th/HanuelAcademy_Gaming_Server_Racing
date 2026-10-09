// Track model: centre-line sampling, walls, kerbs, racing line (minimum curvature) and AI speed profile.
import * as THREE from 'three';
import {clamp,wrapA,smooth} from './util.js?v=20261009g';
import {TR,TRACK_LEN,W,HW,KERB_W,PITWALL,PIT_OFF,PIT_HW,TEAMS,MU,RHO,CLA,CDA,POWER,G,BRK,brakeK,VMAX,gripV,PIT_LIMIT,TRACTION} from './config.js?v=20261009g';
export let PIT_A=-345, PIT_B=-265, PIT_L=-265, PIT_C=205, PIT_D=285;
/* ================= TRACK GEOMETRY ================= */
// A GPS trace has a point every few tens of metres, and the fillet below can never use more than
// 45% of the straight either side of a corner — so on the raw trace every corner stayed tight no
// matter how large a radius was asked for. Dropping the points that barely deviate from their
// neighbours first (they are trace jitter, not corners) gives the arcs room to open out.
export function simplifyPath(pts,tol){const out=pts.map(p=>p.slice());
  for(;;){let bi=-1,bd=tol,n=out.length;if(n<=14)break;
    for(let i=0;i<n;i++){const p=out[(i-1+n)%n],c=out[i],q=out[(i+1)%n];
      const ex=q[0]-p[0],ey=q[1]-p[1],l=Math.hypot(ex,ey);if(l<1e-6)continue;
      const d=Math.abs((c[0]-p[0])*ey-(c[1]-p[1])*ex)/l;if(d<bd){bd=d;bi=i;}}
    if(bi<0)break;out.splice(bi,1);}
  return out;}
// round every corner of a closed polyline with a circular arc of radius ≤ Rmax (street-corner geometry)
export function filletPath(pts,Rmax){const out=[],n=pts.length;
  for(let i=0;i<n;i++){const p=pts[(i-1+n)%n],c=pts[i],q=pts[(i+1)%n];
    const ax=c[0]-p[0],ay=c[1]-p[1],bx=q[0]-c[0],by=q[1]-c[1],la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);
    const ux=ax/la,uy=ay/la,vx=bx/lb,vy=by/lb,th=Math.acos(clamp(ux*vx+uy*vy,-1,1));
    if(th<0.06){out.push(c);continue;}
    const t=Math.min(la*0.45,lb*0.45,Rmax*Math.tan(th/2)),R=t/Math.tan(th/2),sg=ux*vy-uy*vx>0?1:-1;
    const sx=c[0]-ux*t,sy=c[1]-uy*t,cx=sx-uy*sg*R,cy=sy+ux*sg*R,a0=Math.atan2(sy-cy,sx-cx),steps=Math.max(2,Math.ceil(R*th/4));
    for(let k=0;k<=steps;k++){const a=a0+sg*th*k/steps;out.push([cx+Math.cos(a)*R,cy+Math.sin(a)*R]);}}
  return out.filter((p,i)=>{const q=out[(i+1)%out.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>0.5;});}
// resample a closed polyline every `step` m, then relax any stretch tighter than Rmin (a 20 m wide
// track needs a centre-line radius well above its half width, or the inside of a hairpin folds over)
// `wide`: [[x,y,R,reach], …] — around (x,y) the minimum radius is raised to R (within `reach` m),
// so a single corner can be opened out without touching its neighbours; `tight`: [[x,y,R,reach], …] — the opposite, a
// smaller minimum radius around (x,y) for a corner that really is that tight (Seoul's rotary round Dongsipjagak)
export function enforceMinRadius(pts,Rmin,step=3,wide=[],tight=[]){
  const out=[];const n=pts.length;
  for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]),k=Math.max(1,Math.round(l/step));
    for(let j=0;j<k;j++)out.push([a[0]+(b[0]-a[0])*j/k,a[1]+(b[1]-a[1])*j/k]);}
  const m=out.length,rad=i=>{const p=out[(i-4+m)%m],c=out[i],q=out[(i+4)%m],x1=c[0]-p[0],y1=c[1]-p[1],x2=q[0]-c[0],y2=q[1]-c[1];
    const cr=Math.abs(x1*y2-y1*x2);return cr<1e-6?1e9:Math.hypot(x1,y1)*Math.hypot(x2,y2)*Math.hypot(q[0]-p[0],q[1]-p[1])/(2*cr);};
  const rm=out.map(p=>{let r=Rmin;for(const [x,y,R,reach] of tight)if(Math.hypot(p[0]-x,p[1]-y)<reach)r=Math.min(r,R);
    for(const [x,y,R,reach] of wide)if(Math.hypot(p[0]-x,p[1]-y)<reach)r=Math.max(r,R);return r;});
  // the usual 400 passes everywhere; any extra passes only work on the widened corners, so the rest
  // of the circuit comes out exactly as before
  for(let it=0;it<(wide.length?1500:400);it++){let moved=false;
    for(let i=0;i<m;i++){if(rad(i)>=rm[i]||(it>=400&&rm[i]<=Rmin))continue;moved=true;
      for(let j=-3;j<=3;j++){const t=(i+j+m)%m,p=out[(t-1+m)%m],q=out[(t+1)%m],c=out[t];c[0]+=((p[0]+q[0])/2-c[0])*0.5;c[1]+=((p[1]+q[1])/2-c[1])*0.5;}}
    if(!moved)break;}
  return out;}
// a generous fillet turns the city's square street corners into sweeping bends instead of a lap of
// 90° hairpins; the short zigzag sections keep their character because the arc can never eat more
// than 45% of the straights either side of it
export const RAW=TR.fillet?enforceMinRadius(filletPath(simplifyPath(TR.raw,TR.simp||0),TR.fillet),TR.minR||26,3,TR.wide||[],TR.tight||[]):TR.raw;
export const rawV=RAW.map(p=>new THREE.Vector3(p[0],0,-p[1]));
export let curve=new THREE.CatmullRomCurve3(rawV,true,'centripetal'); curve.arcLengthDivisions=6000;
export const SC=TRACK_LEN/curve.getLength();
curve=new THREE.CatmullRomCurve3(rawV.map(v=>v.clone().multiplyScalar(SC)),true,'centripetal'); curve.arcLengthDivisions=12000;
export const N=Math.round(TRACK_LEN/2);
export const L=curve.getLength(), DS=L/N;
export const sp0=curve.getSpacedPoints(N); sp0.pop();
export const rw=(x,y)=>[x*SC,-y*SC];
export let si=0;{const [sx,sz]=rw(...TR.start);let bd=1e18;sp0.forEach((p,i)=>{const d=(p.x-sx)**2+(p.z-sz)**2;if(d<bd){bd=d;si=i;}});}
export const X=new Float32Array(N),Z=new Float32Array(N),TX=new Float32Array(N),TZ=new Float32Array(N),ANG=new Float32Array(N),K=new Float32Array(N);
for(let i=0;i<N;i++){const p=sp0[(i+si)%N];X[i]=p.x;Z[i]=p.z;}
for(let i=0;i<N;i++){const a=(i-1+N)%N,b=(i+1)%N;let tx=X[b]-X[a],tz=Z[b]-Z[a];const l=Math.hypot(tx,tz);TX[i]=tx/l;TZ[i]=tz/l;ANG[i]=Math.atan2(TZ[i],TX[i]);}
{const k0=new Float32Array(N);for(let i=0;i<N;i++){k0[i]=wrapA(ANG[(i+1)%N]-ANG[(i-1+N)%N])/(2*DS);}
 for(let i=0;i<N;i++){let s=0;for(let j=-4;j<=4;j++)s+=k0[(i+j+N)%N];K[i]=s/9;}}
export const idxOf=(rx,ry)=>{const [x,z]=rw(rx,ry);let bi=0,bd=1e18;for(let i=0;i<N;i++){const d=(X[i]-x)**2+(Z[i]-z)**2;if(d<bd){bd=d;bi=i;}}return bi;};
export const spOf=s=>s>L/2?s-L:s;
export const idxSp=sp=>((Math.round(((sp%L)+L)%L/DS))%N+N)%N;
export const spI=i=>spOf(i*DS);
if(TR.pitEntry){PIT_A=spI(idxOf(...TR.pitEntry));PIT_B=PIT_A+(TR.pitRamp||200);PIT_L=Math.max(PIT_B,-300);
  // `pitLimit`: the 60 km/h line this far past the entry (a lane that turns a corner is speed-limited through it)
  if(TR.pitLimit!=null)PIT_L=PIT_A+TR.pitLimit;}
// …and the exit (`pitExit`: where the lane starts to bend back, `pitExitLen`: how long the merge is)
if(TR.pitExit){PIT_C=spI(idxOf(...TR.pitExit));PIT_D=PIT_C+(TR.pitExitLen||80);}
// PS: the side of the circuit the pit lane is on, as a sign on the lateral offset (+1 right, the default; -1 left,
// `pitLeft` — Seoul, where the paddock is Gwanghwamun Square on the left of the clockwise main straight). Every pit
// offset (pitOffSp, PIT_OFF + BOX_D, the pit wall at PITWALL, …) is a distance from the centre line; PS turns it into
// a signed lateral position.
export const PS=TR.pitLeft?-1:1;
export function pitOffSp(sp){if(sp<PIT_A||sp>PIT_D)return null;if(sp<PIT_B)return PS*PIT_OFF*smooth((sp-PIT_A)/(PIT_B-PIT_A));if(sp>PIT_C)return PS*PIT_OFF*(1-smooth((sp-PIT_C)/(PIT_D-PIT_C)));return PS*PIT_OFF;}
// the pit wall (between the track and the lane) starts as soon as the peeling-off lane has cleared it, not only where
// the lane is fully out (PIT_B) — so on a short entry ramp it already stands before the corner the lane takes
export const PIT_W=(()=>{for(let sp=PIT_A;sp<PIT_B;sp++)if(Math.abs(pitOffSp(sp))-PIT_HW>=PITWALL+0.6)return sp;return PIT_B;})();
// the start line: `gridAhead` m past the timing line (as on circuits whose start and finish lines differ) — the grid
// forms up behind it. The timing line, laps, sectors and the leaderboard all stay on the finish line (s = 0).
export const GRID_S=TR.gridAhead||0;

// half width per sample: the circuit is W metres wide, but a track can list stretches that are
// deliberately narrower (`narrow: [[fromRaw],[toRaw],width], …`), blended in over ~60 m each end
export const HWa=new Float32Array(N).fill(HW);
for(const [a,b,w] of TR.narrow||[]){const ia=idxOf(...a),ib=idxOf(...b);
  for(let k=0;k<N;k++){const i=(ia+k)%N;HWa[i]=w/2;if(i===ib)break;}}
for(let p=0;p<26;p++){const c=HWa.slice();for(let i=0;i<N;i++)HWa[i]=(c[(i-1+N)%N]+2*c[i]+c[(i+1)%N])*0.25;}
export const HWmin=Math.min(...HWa);
// wall offsets (street circuit: concrete walls close to the track). `wallGap`: run-off between the track edge and the
// wall (3 m by default; less where the circuit squeezes through narrow city streets)
export const WALL_GAP=TR.wallGap??3.0;
export const WL=new Float32Array(N),WR=new Float32Array(N),KB=new Uint8Array(N);
// `innerGap`: extra run-off on the inside of every kerbed corner (room for the wider kerb, `kerbW`, and for clipping it);
// `exitGap` / `exitLen`: the outside wall stays set back that much further for `exitLen` m past each corner, where a
// car runs out wide on the exit (both 0 by default: the walls are exactly as before)
const IN_GAP=TR.innerGap||0,EX_GAP=TR.exitGap||0,EX_N=Math.round((TR.exitLen||0)/DS),exL=new Float32Array(N),exR=new Float32Array(N);
if(EX_GAP&&EX_N){let left=0,side=0;
  for(let k=0;k<2*N;k++){const i=k%N,kk=K[i];if(Math.abs(kk)>1/90){left=EX_N;side=kk>0?1:-1;continue;}
    if(left>0){left--;(side>0?exL:exR)[i]=EX_GAP;}}}
for(let i=0;i<N;i++){const k=K[i],ak=Math.abs(k),base=HWa[i]+WALL_GAP,extra=ak>1/90?(TR.cornerGap??3.5):0,inner=ak>1/140?IN_GAP:0;
  let wl=base+(k>0?extra:inner)+exL[i],wr=base+(k<0?extra:inner)+exR[i];
  if(ak>1e-4){const cap=0.7/ak;if(k>0)wr=Math.min(wr,cap);else wl=Math.min(wl,cap);}
  WL[i]=Math.max(HWa[i]+1.6,wl);WR[i]=Math.max(HWa[i]+1.6,wr);}
for(let pass=0;pass<4;pass++){for(const A of [WL,WR]){const c=A.slice();for(let i=0;i<N;i++){let s=0;for(let j=-4;j<=4;j++)s+=c[(i+j+N)%N];A[i]=s/9;}}}
// outer wall follows the pit lane; a little more room where the entry road is still bending away
// (WP / TLP: the wall and the track limit on the pit side)
export const WP=PS>0?WR:WL;
for(let i=0;i<N;i++){const sp=spI(i),p=pitOffSp(sp);if(p!=null)WP[i]=Math.max(WP[i],Math.abs(p)+PIT_HW+(sp<PIT_B?3.2:1.8));}
// KWa: kerb width per sample — KERB_W everywhere, except that a circuit may give its right-angle (and tighter) corners a
// slightly wider kerb (`kerbWide`, m): a kerbed bend that turns ≥ ~70° through a radius under ~45 m
export const KWa=new Float32Array(N).fill(KERB_W);
{const raw=new Uint8Array(N);for(let i=0;i<N;i++)raw[i]=Math.abs(K[i])>1/140?1:0;
 for(let i=0;i<N;i++){for(let j=-6;j<=6;j++)if(raw[(i+j+N)%N]){KB[i]=1;break;}}
 if(TR.kerbWide){let i0=0;while(i0<N&&raw[i0])i0++;
   for(let k=0;k<N;k++){const i=(i0+k)%N;if(!raw[i])continue;let n=0,ang=0,km=0;
     while(n<N&&raw[(i+n)%N]){const kk=K[(i+n)%N];ang+=kk*DS;km=Math.max(km,Math.abs(kk));n++;}
     if(Math.abs(ang)>=1.2&&km>1/45)for(let j=-6;j<n+6;j++)KWa[(i+j+N)%N]=TR.kerbWide;
     k+=n-1;}
   // ease in and out along the kerb rather than stepping
   for(let p=0;p<3;p++){const c=KWa.slice();for(let i=0;i<N;i++)KWa[i]=Math.max(KERB_W,(c[(i-1+N)%N]+2*c[i]+c[(i+1)%N])/4);}}}
// the track limits (white line) per side, left TLL / right TLR, as an offset from the centre line. With a kerb it is the
// circuit's edge (HWa) as before, kerb outside it; where there is no kerb (the straights) the tarmac runs on to within
// EDGE_GAP of the wall, as on a street circuit. It eases out over EDGE_RAMP metres from each kerb, and never widens
// into the pit lane (entry and exit included).
export const TLL=new Float32Array(N),TLR=new Float32Array(N);
{const EDGE_GAP=0.6,EDGE_RAMP=40,MIN_RUN=220,R=Math.max(1,Math.round(EDGE_RAMP/DS)),dist=new Float32Array(N).fill(1e9);
 // a short kerb-free gap between kerbs (a chicane, a run of corners) keeps the original edge: only a real straight —
 // at least MIN_RUN m without a kerb — is widened, so the limits never zig-zag in and out through a corner sequence
 const KX=KB.slice();{let k0=0;while(k0<N&&!KB[k0])k0++;
   if(k0<N)for(let k=1;k<=N;k++){const i=(k0+k)%N;if(KB[i])continue;let n=0;while(n<N&&!KB[(i+n)%N])n++;
     if(n*DS<MIN_RUN)for(let j=0;j<n;j++)KX[(i+j)%N]=1;k+=n-1;}}
 // samples to the nearest kerb (or short gap), both ways round the lap
 for(let pass=0;pass<2;pass++)for(let k=0;k<2*N;k++){const i=k%N,p=(i-1+N)%N;dist[i]=KX[i]?0:Math.min(dist[i],dist[p]+1);}
 for(let pass=0;pass<2;pass++)for(let k=2*N-1;k>=0;k--){const i=k%N,q=(i+1)%N;dist[i]=KX[i]?0:Math.min(dist[i],dist[q]+1);}
 for(let i=0;i<N;i++){const f=smooth(Math.min(1,dist[i]/R)),hw=HWa[i],pit=pitOffSp(spI(i))!=null;
   TLL[i]=pit&&PS<0?hw:hw+f*Math.max(0,WL[i]-EDGE_GAP-hw);
   TLR[i]=pit&&PS>0?hw:hw+f*Math.max(0,WR[i]-EDGE_GAP-hw);}
 // the pit entry / exit ends: ease the pit-side edge back in rather than stepping
 const TLP=PS>0?TLR:TLL;
 for(let pass=0;pass<6;pass++){const c=TLP.slice();for(let i=0;i<N;i++)TLP[i]=Math.max(HWa[i],Math.min(c[i],(c[(i-1+N)%N]+2*c[i]+c[(i+1)%N])*0.25));}}

// DRS zones (detection / activation start / end), sectors, pit boxes
// auto DRS: the three longest near-straight runs (≥300 m); activation starts 40 m after the
// corner exit and ends before the braking zone, detection 150 m before activation
export function autoDRS(){const th=1/220,runs=[];let s0=0;while(s0<N&&Math.abs(K[s0])<th)s0++;let st=-1;
  for(let k=0;k<=N;k++){const i=(s0+k)%N,str=k<N&&Math.abs(K[i])<th;if(str&&st<0)st=s0+k;else if(!str&&st>=0){runs.push([st,s0+k]);st=-1;}}
  return runs.filter(r=>(r[1]-r[0])*DS>=300).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])).slice(0,3)
    .map(([a,b])=>{const ia=a+Math.round(40/DS),ib=b-Math.round(90/DS);return {det:((ia-Math.round(150/DS))%N+N)%N*DS,a:(ia%N)*DS,b:(ib%N)*DS};});}
export const DRSZ=TR.drs==='auto'?autoDRS():TR.drs.map(z=>({det:idxOf(...z[0])*DS,a:idxOf(...z[1])*DS,b:idxOf(...z[2])*DS}));
export const SEC=[L/3,2*L/3];
// a track with a short paddock can pack its boxes tighter (`boxStart`, `boxGap`)
export const BOX_GAP=TR.boxGap||40,BOX_S=TEAMS.map((_,j)=>(TR.boxStart??-215)+j*BOX_GAP);
export function drsZoneOf(s){for(let k=0;k<DRSZ.length;k++){const z=DRSZ[k];if(z.a<z.b?(s>=z.a&&s<=z.b):(s>=z.a||s<=z.b))return k;}return -1;}

// racing line: MINIMUM-CURVATURE path. Rather than placing turn-in/apex/track-out by hand, the line
// is solved for: of all the paths that fit between the white lines, take the one whose total
// curvature is smallest. That is what out-in-out actually is — running wide on entry and exit buys
// a bigger radius through the corner — and it falls out for chicanes, double apexes and long
// sweepers without any special cases. Each offset is solved from its neighbours (a projected
// Gauss-Seidel sweep on a convex problem), coarse spacing first so the long wavelengths settle.
export const RL=new Float32Array(N);{const lm_=i=>HWa[i]-1.2;
 const nx=new Float32Array(N),nz=new Float32Array(N),ax=new Float32Array(N),az=new Float32Array(N);
 for(let i=0;i<N;i++){nx[i]=-TZ[i];nz[i]=TX[i];ax[i]=X[i];az[i]=Z[i];}
 for(const d of [48,32,21,14,9,6,4,3,2,1]){const sweeps=d>8?150:260;
   for(let t=0;t<sweeps;t++)for(let i=0;i<N;i++){
     const a=(i-2*d+2*N)%N,b=(i-d+N)%N,c=(i+d)%N,e=(i+2*d)%N;
     const gx=ax[a]-4*ax[b]+6*ax[i]-4*ax[c]+ax[e],gz=az[a]-4*az[b]+6*az[i]-4*az[c]+az[e];
     RL[i]=clamp(RL[i]-(nx[i]*gx+nz[i]*gz)*0.19,-lm_(i),lm_(i));
     ax[i]=X[i]+nx[i]*RL[i];az[i]=Z[i]+nz[i]*RL[i];}}
 // the line must stay inside what the steering lock can actually hold: relax any stretch tighter than 24 m
 {const rad=i=>{const P=k=>{const j=(k+N)%N,rx=-TZ[j],rz=TX[j];return [X[j]+rx*RL[j],Z[j]+rz*RL[j]];};
    const a=P(i-4),b=P(i),c2=P(i+4),x1=b[0]-a[0],z1=b[1]-a[1],x2=c2[0]-b[0],z2=c2[1]-b[1],cr=Math.abs(x1*z2-z1*x2);
    return cr<1e-6?1e9:Math.hypot(x1,z1)*Math.hypot(x2,z2)*Math.hypot(c2[0]-a[0],c2[1]-a[1])/(2*cr);};
  for(let it=0;it<300;it++){let bad=false;
    for(let i=0;i<N;i++){if(rad(i)>=24)continue;bad=true;
      for(let j=-3;j<=3;j++){const t=(i+j+N)%N;RL[t]=clamp(RL[t]+((RL[(t-1+N)%N]+RL[(t+1)%N])/2-RL[t])*0.5,-lm_(t),lm_(t));}}
    if(!bad)break;}}}
// speed profile along racing line
export const VP=new Float32Array(N);{
 const RX=new Float32Array(N),RZ=new Float32Array(N);for(let i=0;i<N;i++){RX[i]=X[i]-TZ[i]*RL[i];RZ[i]=Z[i]+TX[i]*RL[i];}
 const kr=new Float32Array(N);for(let i=0;i<N;i++){const a=(i-3+N)%N,c=(i+3)%N;const x1=RX[i]-RX[a],z1=RZ[i]-RZ[a],x2=RX[c]-RX[i],z2=RZ[c]-RZ[i];
  const cr=x1*z2-z1*x2;kr[i]=Math.abs(2*cr/(Math.hypot(x1,z1)*Math.hypot(x2,z2)*Math.hypot(RX[c]-RX[a],RZ[c]-RZ[a])+1e-6));}
 const m=820,mu=MU*0.985,kd=0.5*RHO*CLA/m; // tiny margin: the car cannot sit exactly on the limit
 // use the TIGHTEST curvature in the window, not the average: averaging hid real apexes and the
 // AI arrived at corners far too fast (it then ran wide into the barriers)
 for(let i=0;i<N;i++){let k=0;for(let j=-2;j<=2;j++)k=Math.max(k,kr[(i+j+N)%N]);let v=VMAX;
  for(let it=0;it<4;it++){const mv=mu*gripV(v);v=k<=mv*kd?VMAX:Math.min(VMAX,Math.sqrt(mv*G/(k-mv*kd)));}VP[i]=v;}
 for(let p=0;p<2;p++)for(let i=N-1;i>=0;i--){const v=VP[(i+1)%N];const dec=mu*gripV(v)*BRK*brakeK(v)*0.97*(G+kd*v*v)+0.5*RHO*CDA*v*v/m;VP[i]=Math.min(VP[i],Math.sqrt(v*v+2*dec*DS));}
 for(let p=0;p<2;p++)for(let i=0;i<N;i++){const v=VP[i];const acc=Math.max(0.4,Math.min(POWER/(m*Math.max(v,5)),mu*gripV(v)*TRACTION*(G+kd*v*v))-0.5*RHO*CDA*v*v/m);const j=(i+1)%N;VP[j]=Math.min(VP[j],Math.sqrt(v*v+2*acc*DS));}
}

