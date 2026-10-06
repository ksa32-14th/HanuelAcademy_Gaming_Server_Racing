// HRC — Haneul Racing Championship: game runtime (physics, AI, scene, HUD, audio).
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {$,clamp,wrapA,smooth,rand,rnd,reseed,hex,fmt,fmtRace} from './util.js?v=20261006c';
import {perf} from './perf.js?v=20261006c';
import {TRACKS,INTROS} from './data/tracks.js?v=20261006c';
import {TRACK_ID,TR,TOD,TIMES,TRACK_LEN,W,HW,GRID_D,KERB_W,CAR_SX,CAR_SY,CAR_SZ,WHEEL_S,TL_EDGE,G,RHO,MASS,POWER,CDA,CLA,MU,CRR,WB,VMAX,TRACTION,TC_SLACK,BRK,TC_P,SLIDE,gripV,PITWALL,PIT_HW,PIT_OFF,PIT_LIMIT,BOX_D,FAST_D,COMP,POINTS,DRS_GAP,DRS_FROM_LAP,GEARS,FUEL_PER_LAP,TEAMS,DRIVERS} from './config.js?v=20261006c';
import {PIT_A,PIT_B,PIT_L,PIT_C,PIT_D,curve,SC,N,L,DS,rw,X,Z,TX,TZ,ANG,K,idxOf,spOf,idxSp,spI,pitOffSp,HWa,HWmin,WL,WR,KB,DRSZ,SEC,BOX_S,BOX_GAP,drsZoneOf,RL,VP,rawV,sp0} from './track.js?v=20261006c';
import {createTextures,canvasTex,winTex} from './textures.js?v=20261006c';
import {lbLoad,lbSubmit,lbShared,checkName} from './leaderboard.js?v=20261006c';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {PRESETS,ORDER,MODES,loadMode,saveMode,detectPreset,ResolutionScaler,GpuTimer,pixelRatioFor} from './quality.js?v=20261006c';
// OpenStreetMap scenery: each OSM circuit has its own data module (osm-songdo.js, osm-busan.js), loaded only when chosen
const OSM=TR.osm?Object.values(await (TRACK_ID==='busan'?import('./data/osm-busan.js?v=20261006c'):import('./data/osm-songdo.js?v=20261006c')))[0]:null;
const DAY=TOD==='day'; // daylight (Busan, Songdo by choice): bright sky, haze instead of night fog, unlit windows
const DUSK=TOD==='dusk'; // blue-hour dusk over the West Sea (Songdo's default)

/* ================= RENDERER / SCENE / QUALITY ================= */
const qState={mode:loadMode()};
const renderer=new THREE.WebGLRenderer({canvas:$('gl'),antialias:false,powerPreference:'high-performance',stencil:false});
let qName=qState.mode==='auto'?detectPreset(renderer.getContext()):qState.mode;
let Q=PRESETS[qName];
const BUILT_TEX=Q.texRes; // texture resolution is baked at load; everything else can change live
const scaler=new ResolutionScaler();scaler.enabled=true;
// measurement flags (see src/perf.js): ?noscaler pins the render scale, ?autopilot lets the AI drive the player's car
const URLQ=new URLSearchParams(location.search),NOSCALER=URLQ.has('noscaler'),AUTOPILOT=URLQ.has('autopilot');
if(NOSCALER)scaler.enabled=false;
// WebGL context loss (GPU driver reset, memory pressure, the browser's GPU watchdog): three.js rebuilds its own GL state
// on restore. Meanwhile nothing is drawn, the frozen/black canvas is covered and a running session is paused; on restore
// the render targets are re-sized and the shadow map redrawn.
const ctxOv=document.createElement('div');
ctxOv.style.cssText='position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:#05070d;'+
  'color:#c9d3ea;font:700 16px/1.5 Titillium Web,sans-serif;letter-spacing:.14em';
ctxOv.textContent='GRAPHICS RESET · RESTORING…';document.body.appendChild(ctxOv);
let ctxLost=false;
$('gl').addEventListener('webglcontextlost',e=>{e.preventDefault();ctxLost=true;ctxOv.style.display='flex';perf.ctx('lost');
  if(!paused)togglePause();});
$('gl').addEventListener('webglcontextrestored',()=>{ctxLost=false;gpuTimer.reset();scaler.enabled=scalerAllowed();resizeAll();renderer.shadowMap.needsUpdate=true;
  ctxOv.style.display='none';perf.ctx('restored');});
if(perf.on)renderer.info.autoReset=false; // count every pass of a frame (composer, mirror), reset once per frame
renderer.setPixelRatio(pixelRatioFor(Q,scaler.scale));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false; // the shadow map is refreshed once per frame by frame(); the mirror pass reuses it
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=DAY?0.92:1.05;
const MAXANI=renderer.capabilities.getMaxAnisotropy();
const scene=new THREE.Scene();
{const c=document.createElement('canvas');c.width=4;c.height=256;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,256);
 // Busan by day: deep autumn blue overhead fading into the sea haze on the horizon
 (DAY?[[0,'#2a66b8'],[.3,'#4f8bd2'],[.48,'#93bce4'],[.58,'#c9dcec'],[.64,'#d3e1ec'],[1,'#b9c7d2']]
  :DUSK?[[0,'#16204a'],[.34,'#34407e'],[.5,'#7a5c93'],[.6,'#d7847f'],[.66,'#f3ae7c'],[.7,'#f6c592'],[1,'#2b2735']]
      :[[0,'#02030a'],[.45,'#0a1030'],[.62,'#2a1f3e'],[.72,'#4a2f3a'],[1,'#0c0d14']]).forEach(([p,c])=>g.addColorStop(p,c));x.fillStyle=g;x.fillRect(0,0,4,256);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;scene.background=t;}
scene.fog=DAY?new THREE.Fog(0xc6d8e7,700,5600):DUSK?new THREE.Fog(0x8a6d8c,500,3600):new THREE.Fog(0x1a1530,350,2800);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,0.3,8000);
// On track nothing past the fog's far distance can be seen (it is exactly the fog colour), so the far plane is pulled in
// to just beyond it: distant city tiles are frustum-culled instead of being drawn fully fogged. The lobby's orbiting
// camera keeps the long far plane. The stars ride along with the camera inside that range.
const FAR_RACE=scene.fog.far+250,FAR_MENU=8000,STAR_R=Math.min(2600,scene.fog.far*0.9);
scene.add(DAY?new THREE.HemisphereLight(0xdcebff,0x5d5a4f,1.25):DUSK?new THREE.HemisphereLight(0xc2a9d6,0x2e2b36,1.35):new THREE.HemisphereLight(0x8a96c8,0x1c1a22,0.9));
const sun=new THREE.DirectionalLight(DAY?0xfff4e2:DUSK?0xffd2b0:0xfff1dc,DAY?3.1:2.4);sun.castShadow=true;
sun.shadow.camera.near=1;sun.shadow.camera.far=260;sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.02;
scene.add(sun,sun.target);
// stars for the night circuit (a hard-edged point cloud on a huge sphere, unaffected by fog)
const stars=(()=>{if(DUSK||DAY)return null;const n=1600,p=new Float32Array(n*3);
  for(let i=0;i<n;i++){const u=Math.random()*2-1,a=Math.random()*Math.PI*2,r=Math.sqrt(1-u*u),y=Math.abs(u)*.92+.08;p[i*3]=Math.cos(a)*r*STAR_R;p[i*3+1]=y*STAR_R;p[i*3+2]=Math.sin(a)*r*STAR_R;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
  const s=new THREE.Points(g,new THREE.PointsMaterial({color:0xcfd8ff,size:1.6,sizeAttenuation:false,fog:false,transparent:true,opacity:.75,depthWrite:false}));
  s.frustumCulled=false;s.renderOrder=-1;scene.add(s);return s;})();
// post-processing: MSAA scene target → (GTAO) → bloom → tone-map/output.
// The old build rendered into a non-multisampled target, so `antialias:true` did nothing at all and every edge crawled.
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
// (by day sunlit concrete and sky already reach 1.0, so only real highlights may bloom)
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.26,0.4,DAY?1.6:0.95);composer.addPass(bloom);composer.addPass(new OutputPass());
let gtao=null;
const smaa=new SMAAPass(innerWidth,innerHeight);composer.addPass(smaa); // post AA for HIGH: hardware MSAA on half-float targets cost ~9 ms/frame on integrated GPUs
// FXAA for MEDIUM: one full-screen pass. Measured on Iris Xe at 720p: SMAA ~6 ms, FXAA ~1.5 ms.
const fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
// Bloom's blur chain runs at Q.bloomScale of the frame (UnrealBloomPass already halves it internally); it is a soft glow,
// so a quarter-resolution chain looks the same and saves ~1.5 ms on an integrated GPU.
{const set=bloom.setSize.bind(bloom);bloom.setSize=(w,h)=>set(Math.max(4,Math.round(w*(Q.bloomScale||1))),Math.max(4,Math.round(h*(Q.bloomScale||1))));}
// With no post effect enabled (LOW) the composer is skipped altogether: rendering into its half-float target and copying
// that to the screen cost ~4.5 ms on its own, about as much as drawing the scene.
let usePost=true;
// studio environment only for car paint / carbon reflections (the night scene itself stays dark)
const envTex=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),0.04).texture;
// by day, glass towers reflect the sky rather than a studio: the sky gradient wrapped round as an environment
// (without it Marine City's blue curtain walls came out nearly black against the sun)
const skyEnv=DAY?(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,128);
  [[0,'#3f7fd0'],[.35,'#86b4e4'],[.49,'#d8e6f2'],[.52,'#b9c8d4'],[.6,'#5d7186'],[1,'#3d4752']].forEach(([p,v])=>g.addColorStop(p,v));
  x.fillStyle=g;x.fillRect(0,0,256,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.mapping=THREE.EquirectangularReflectionMapping;
  return new THREE.PMREMGenerator(renderer).fromEquirectangular(t).texture;})():envTex;
let vw=0,vh=0; // resize lazily each frame: also covers pages that load while hidden (0×0)
function resizeAll(){const w=vw||innerWidth,h=vh||innerHeight;if(!w||!h)return;
  const pr=pixelRatioFor(Q,scaler.scale);renderer.setPixelRatio(pr);renderer.setSize(w,h);composer.setPixelRatio(pr);composer.setSize(w,h);
  fxaa.material.uniforms.resolution.value.set(1/(w*pr),1/(h*pr));
  camera.aspect=w/h;camera.updateProjectionMatrix();mRect=null;}
function fitViewport(){const w=innerWidth,h=innerHeight;if(w===vw&&h===vh)return w>0&&h>0;if(!w||!h)return false;vw=w;vh=h;resizeAll();return true;}
// snap the shadow frustum to whole shadow-map texels in light space so shadow edges do not shimmer as the car moves
const _sl=new THREE.Vector3(),_sx=new THREE.Vector3(),_sy=new THREE.Vector3(),_st=new THREE.Vector3(),SUN_OFF=new THREE.Vector3(30,80,20);
function aimSun(tx,tz,off=SUN_OFF){
  _sl.copy(off).normalize();_sx.set(0,1,0).cross(_sl).normalize();_sy.copy(_sl).cross(_sx);
  const tex=Q.shadowSpan/Q.shadow;_st.set(tx,0,tz);
  const px=_st.dot(_sx),py=_st.dot(_sy);
  _st.addScaledVector(_sx,Math.round(px/tex)*tex-px).addScaledVector(_sy,Math.round(py/tex)*tex-py);
  sun.target.position.copy(_st);sun.position.copy(_st).add(off);}
function setAniso(n){const seen=new Set();scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
  for(const m of ms)for(const k of ['map','normalMap','roughnessMap','emissiveMap','alphaMap'])if(m[k]&&!seen.has(m[k])){seen.add(m[k]);m[k].anisotropy=Math.min(n,MAXANI);}});}
function applyQuality(){
  // shadows
  const span=Q.shadowSpan/2;Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span});sun.shadow.camera.updateProjectionMatrix();
  if(sun.shadow.mapSize.x!==Q.shadow){sun.shadow.mapSize.set(Q.shadow,Q.shadow);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  // MSAA on the scene targets (ping-pong buffers, so both)
  for(const rt of [composer.renderTarget1,composer.renderTarget2])if(rt.samples!==Q.msaa){rt.samples=Q.msaa;rt.dispose();}
  bloom.enabled=Q.bloom>0;bloom.strength=Q.bloom*(DAY?0.6:1);smaa.enabled=!!Q.smaa;fxaa.enabled=!!Q.fxaa;
  if(Q.ao&&!gtao){try{gtao=new GTAOPass(scene,camera,vw||innerWidth,vh||innerHeight);
      gtao.output=GTAOPass.OUTPUT.Default;gtao.blendIntensity=1;
      gtao.updateGtaoMaterial({radius:1.6,distanceExponent:1.4,thickness:2,scale:1.1,samples:12,distanceFallOff:1,screenSpaceRadius:false});
      gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,radiusExponent:1,rings:2,samples:12});
      composer.insertPass(gtao,1);}catch(e){console.warn('GTAO unavailable',e);gtao=null;}}
  if(gtao)gtao.enabled=Q.ao;
  usePost=Q.bloom>0||!!Q.smaa||!!Q.fxaa||!!Q.ao||Q.msaa>0;
  if(stars)stars.visible=Q.stars;
  document.body.classList.toggle('nomirror',Q.mirror===0);
  setAniso(Q.aniso);
  resizeAll();
}
try{await Promise.race([document.fonts.load('900 22px "Titillium Web"'),new Promise(r=>setTimeout(r,1500))]);}catch(e){}
const texSet=createTextures(BUILT_TEX,Math.min(Q.aniso,MAXANI));
const {texAsphalt,texAsphaltN,texAsphaltR,texKerb,texCheck,texRubber,texConcrete,texConcreteN,texFence,texAds,texCrowd}=texSet;
function setQualityMode(mode){qState.mode=mode;qName=mode==='auto'?detectPreset(renderer.getContext()):mode;Q=PRESETS[qName];
  scaler.enabled=scalerAllowed();scaler.reset();saveMode(mode);applyQuality();}
// Dynamic resolution only with GPU timings: judged on frame intervals alone it also shrank CPU-bound frames, which only
// blurs them, and every step re-allocates the render targets (a hitch)
// …and only in AUTO: a fixed preset (shown as "fixed preset" in the lobby) keeps its resolution
function scalerAllowed(){return !NOSCALER&&gpuTimer.ok&&qState.mode==='auto';}

const mat=(o)=>new THREE.MeshStandardMaterial(o);
// Flat ground layers (ground, footways, parks, sea, car parks, streets) lie centimetres apart, and seen from a
// kilometre away the depth buffer cannot tell them apart. By day the sea against pale ground shows that as
// stripes, so there they are painted bottom-up in a fixed order without writing depth: the higher layer simply
// draws last, and everything standing on them still depth-tests against the track and buildings as usual.
function groundLayer(me){me.renderOrder=-100+Math.round((me.position.y+1)*100);me.material.depthWrite=false;}
const po=f=>({polygonOffset:true,polygonOffsetFactor:f,polygonOffsetUnits:f});
const asphaltMaps={map:texAsphalt,normalMap:texAsphaltN,normalScale:new THREE.Vector2(.9,.9),roughnessMap:texAsphaltR,roughness:1,metalness:0};
const matRunoff=mat({...asphaltMaps,color:0x9aa2b4,...po(-1)});
const matRoad=mat({...asphaltMaps,color:0xffffff,...po(-2)});
const matPitRoad=mat({...asphaltMaps,color:0xc4c9d6,...po(-1.5)});
const matRubber=mat({color:0x08080a,roughness:.5,transparent:true,opacity:.55,alphaMap:texRubber,depthWrite:false,...po(-3)});
const matLine=mat({color:0xf2f2ee,roughness:.45,...po(-4)});
const matKerb=mat({color:0xffffff,map:texKerb,roughness:.45,...po(-4)});
const matWall=mat({color:0xffffff,map:texAds,roughness:.35,metalness:.05,side:THREE.DoubleSide});
const matConcrete=mat({color:0xffffff,map:texConcrete,normalMap:texConcreteN,roughness:.85,side:THREE.DoubleSide});
const matFence=mat({color:0xffffff,map:texFence,transparent:true,depthWrite:false,metalness:.6,roughness:.4,side:THREE.DoubleSide});
const matRail=mat({color:0x8d95a3,metalness:.7,roughness:.35,side:THREE.DoubleSide});
const matPitWall=matConcrete;

function strip(i0,n,offA,offB,yA,yB,m,uLen=20,shadow=true,geoOnly=false){
  const pos=new Float32Array(n*6),uv=new Float32Array(n*4),idx=[];
  for(let k=0;k<n;k++){const i=(i0+k)%N,rx=-TZ[i],rz=TX[i],a=offA(i),b=offB(i);
    pos[k*6]=X[i]+rx*a;pos[k*6+1]=yA;pos[k*6+2]=Z[i]+rz*a;pos[k*6+3]=X[i]+rx*b;pos[k*6+4]=yB;pos[k*6+5]=Z[i]+rz*b;
    const u=k*DS/uLen;uv[k*4]=u;uv[k*4+1]=0;uv[k*4+2]=u;uv[k*4+3]=1;
    if(k<n-1){const o=k*2;idx.push(o,o+1,o+2,o+1,o+3,o+2);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  if(geoOnly)return g;
  if(batch){batchAdd(g,m,shadow);return null;}
  const me=new THREE.Mesh(g,m);me.receiveShadow=shadow;scene.add(me);return me;}
// `rgb` (optional THREE.Color): baked into a vertex colour, for markings that share one vertex-coloured material
function flatAt(i,off,along,across,y,m,rgb){const g=new THREE.PlaneGeometry(along,across).rotateX(-Math.PI/2);
  g.applyMatrix4(_fm.makeRotationY(-ANG[i]).setPosition(X[i]-TZ[i]*off,y,Z[i]+TX[i]*off));
  if(rgb)vColor(g,rgb);
  if(batch){batchAdd(g,m,true);return {material:m};}
  const me=new THREE.Mesh(g,m);me.receiveShadow=true;me.matrixAutoUpdate=false;scene.add(me);return me;}
const _fm=new THREE.Matrix4(),_v3=new THREE.Vector3();
function vColor(g,c){const n=g.attributes.position.count,a=new Float32Array(n*3);for(let k=0;k<n;k++){a[k*3]=c.r;a[k*3+1]=c.g;a[k*3+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}
// Static circuit dressing (road/kerb/barrier strips, painted markings, garage doors, grandstands) is collected per
// material while buildWorld() runs and merged into one mesh per material at the end. The strips span the whole lap and
// could never be culled anyway, so ~70 draw calls — paid again in the mirror — became ~15.
let batch=null;
// mergeGeometries() wants all-indexed or all-non-indexed input. Everything was un-indexed (toNonIndexed), which tripled the
// vertices of strips and boxes; now the odd non-indexed piece gets a trivial index instead, and shared vertices stay shared.
function indexed(g){if(!g.index){const n=g.attributes.position.count,a=new (n>65535?Uint32Array:Uint16Array)(n);for(let i=0;i<n;i++)a[i]=i;g.setIndex(new THREE.BufferAttribute(a,1));}return g;}
function batchAdd(g,m,shadow){indexed(g);for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);
  const key=m.uuid+(shadow?'+s':'');let b=batch.get(key);if(!b)batch.set(key,b={m,shadow,geos:[]});b.geos.push(g);}
function flushBatch(){for(const b of batch.values()){const me=new THREE.Mesh(mergeGeometries(b.geos),b.m);me.receiveShadow=b.shadow;scene.add(me);}batch=null;}
// An InstancedMesh has ONE bounding sphere, so it is either fully drawn or fully skipped: 7000 tree crowns (400k triangles)
// were pushed through the GPU every frame even when none were on screen. Splitting each one into ~350 m tiles gives every
// tile its own bounding sphere, so frustum culling works again (and the mirror / shadow passes benefit too).
// `addTiledT(tile, maxDist, …)`: the generic skyline boxes are so cheap to draw that big tiles (fewer draw calls) win.
// `maxDist` > 0 gives small street clutter (lamps, trees, fence posts) a draw distance: a tile further than that from the
// camera is hidden before culling, so its draw call is never issued — a 3 m tree 700 m away is a pixel or two.
const distTiles=[];
function addTiled(...list){addTiledT(520,0,...list);}
function addTiledT(TILE,maxDist,...list){
  for(const im of list){const n=im.count,arr=im.instanceMatrix.array,tiles=new Map();
    for(let k=0;k<n;k++){const key=Math.floor(arr[k*16+12]/TILE)+','+Math.floor(arr[k*16+14]/TILE);let a=tiles.get(key);if(!a)tiles.set(key,a=[]);a.push(k);}
    for(const ids of tiles.values()){const t=new THREE.InstancedMesh(im.geometry,im.material,ids.length);
      ids.forEach((k,j)=>t.instanceMatrix.array.set(arr.subarray(k*16,k*16+16),j*16));
      t.instanceMatrix.needsUpdate=true;t.computeBoundingSphere();t.castShadow=im.castShadow;t.receiveShadow=im.receiveShadow;scene.add(t);
      if(maxDist>0)distTiles.push({t,x:t.boundingSphere.center.x,z:t.boundingSphere.center.z,r:maxDist+t.boundingSphere.radius});}
    im.dispose();}}
const rangeN=(a,b)=>Math.round((b-a)/DS)+1;
const gantryLamps=[];

async function buildWorld(){
  batch=new Map(); // see batchAdd(): static dressing is merged per material at the end of this block
  // ground & water
  // the city floor between the mapped streets and parks: weathered paving and plot concrete rather than a flat black
  // sheet (from above at night it read as a void). One 64 m tile of mottled slabs, repeated.
  const groundTex=canvasTex(512,512,(x)=>{x.fillStyle='#8a8c90';x.fillRect(0,0,512,512);
    for(let i=0;i<260;i++){const v=118+Math.random()*40|0;x.fillStyle=`rgba(${v},${v},${v-4},.35)`;x.fillRect(Math.random()*512,Math.random()*512,20+Math.random()*90,20+Math.random()*90);}
    for(let i=0;i<9000;i++){const v=100+Math.random()*80|0;x.fillStyle=`rgba(${v},${v},${v},.4)`;x.fillRect(Math.random()*512,Math.random()*512,2,2);}
    x.strokeStyle='rgba(60,62,66,.35)';x.lineWidth=2;for(let k=0;k<=512;k+=64){x.beginPath();x.moveTo(k,0);x.lineTo(k,512);x.stroke();x.beginPath();x.moveTo(0,k);x.lineTo(512,k);x.stroke();}},true);
  const GS=DAY?16000:9000;groundTex.repeat.set(GS/64,GS/64);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(GS,GS).rotateX(-Math.PI/2),mat({color:DAY?0x7a7c80:DUSK?0x5a5660:0x3c3e46,map:groundTex,roughness:1}));ground.position.y=-0.6;ground.receiveShadow=true;groundLayer(ground);scene.add(ground);
  const matWater=mat({color:DAY?0x2a5d80:0x071226,metalness:DAY?.35:.8,roughness:DAY?.22:.18});
  const addWater=shape=>{const w=new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2),matWater);w.position.y=-0.03;scene.add(w);};
  if(TR.water)addWater(new THREE.Shape(TR.water.map(p=>new THREE.Vector2(p[0]*SC,p[1]*SC))));
  for(const [px,py,r] of TR.ponds||[]){const s=new THREE.Shape();s.absarc(px*SC,py*SC,r*SC,0,Math.PI*2,false);addWater(s);}
  // surfaces
  strip(0,N+1,i=>-WL[i],i=>WR[i],0.0,0.0,matRunoff,16);
  const pa=idxSp(PIT_A);strip(pa,rangeN(PIT_A,PIT_D),i=>pitOffSp(spI(i))-PIT_HW,i=>pitOffSp(spI(i))+PIT_HW,0.01,0.01,matPitRoad,10);
  const hwI=i=>HWa[i%N];
  strip(0,N+1,i=>-hwI(i),hwI,0.02,0.02,matRoad,W);
  strip(0,N+1,i=>RL[i]-1.3,i=>RL[i]+1.3,0.025,0.025,matRubber,20,false); // rubbered-in racing line
  strip(0,N+1,i=>-hwI(i)-0.05,i=>-hwI(i)+0.15,0.03,0.03,matLine);
  strip(0,N+1,i=>hwI(i)-0.15,i=>hwI(i)+0.05,0.03,0.03,matLine);
  const pl=idxSp(PIT_B-30);strip(pl,rangeN(PIT_B-30,PIT_C+35),i=>pitOffSp(spI(i))-PIT_HW,i=>pitOffSp(spI(i))-PIT_HW+0.15,0.03,0.03,matLine);
  await stage("Kerbs & barriers…",.1);
  // kerbs: raised, sloped profile with a vertical outer lip
  const runs=[];let on=false,st=0;for(let k=0;k<N;k++){if(KB[k]&&!on){on=true;st=k;}else if(!KB[k]&&on){on=false;runs.push([st,k-st+1]);}}if(on)runs.push([st,N-st+1]);
  {const kg=[];for(const [a,n] of runs){kg.push(strip(a,n,i=>-hwI(i)-KERB_W,i=>-hwI(i),0.09,0.03,matKerb,2,true,true),strip(a,n,hwI,i=>hwI(i)+KERB_W,0.03,0.09,matKerb,2,true,true),
    strip(a,n,i=>-hwI(i)-KERB_W,i=>-hwI(i)-KERB_W,0,0.09,matKerb,2,false,true),strip(a,n,i=>hwI(i)+KERB_W,i=>hwI(i)+KERB_W,0,0.09,matKerb,2,false,true));}
   const km=new THREE.Mesh(mergeGeometries(kg),matKerb);km.receiveShadow=true;scene.add(km);} // one draw call for every kerb
  // concrete barriers: sponsor-board face, concrete cap and back, debris fence with posts and rails
  const barrier=(i0,n,off,side,flip)=>{ // side: -1 = wall on the left of the track, +1 = right
    strip(i0,n,off,off,0,1.05,matWall,flip?-64:64,false);
    strip(i0,n,i=>off(i)+side*0.45,i=>off(i)+side*0.45,0,1.05,matConcrete,8,false);
    strip(i0,n,i=>Math.min(off(i),off(i)+side*.45),i=>Math.max(off(i),off(i)+side*.45),1.05,1.05,matConcrete,8,false);
    const fo=i=>off(i)+side*0.22;
    strip(i0,n,fo,fo,1.05,4.4,matFence,3,false);strip(i0,n,fo,fo,4.3,4.4,matRail,8,false);strip(i0,n,fo,fo,2.7,2.76,matRail,8,false);};
  barrier(0,N+1,i=>-WL[i],-1,false);barrier(0,N+1,i=>WR[i],1,true);
  const pw=idxSp(PIT_B);barrier(pw,rangeN(PIT_B,PIT_C),()=>PITWALL,1,true);
  {const ps=[];for(let i=0;i<N;i+=2){ps.push([i,-WL[i]-.22],[i,WR[i]+.22]);}for(let k=0;k<rangeN(PIT_B,PIT_C);k+=2)ps.push([(pw+k)%N,PITWALL+.22]);
   const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.045,3.35,6),matRail,ps.length);const m4=new THREE.Matrix4();
   ps.forEach(([i,o],k)=>{m4.makeTranslation(X[i]-TZ[i]*o,2.72,Z[i]+TX[i]*o);posts.setMatrixAt(k,m4);});addTiledT(520,450,posts);}
  // start/finish, grid slots, DRS lines
  flatAt(0,0,1.2,W,0.045,mat({map:texCheck,roughness:.6,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6})).material.map.repeat.set(1,8);
  const matMark=mat({color:0xffffff,roughness:.6,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
  for(let k=0;k<20;k++){const i=idxSp(-(8+k*8)+1.2);flatAt(i,k%2?GRID_D:-GRID_D,0.18,2.3,0.045,matMark);}
  const matDrs=mat({color:0xffffff,roughness:.6,transparent:true,opacity:.75,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
  for(const z of DRSZ){flatAt(Math.round(z.det/DS)%N,0,0.3,W,0.045,matDrs);flatAt(Math.round(z.a/DS)%N,0,0.6,W,0.045,matDrs);}
  // ---- pit entry: marked only in paint — the entry road itself is red. It starts as a thin red line
  // at the right-hand edge of the circuit and widens to fill the whole lane as it peels away ----
  {const red=mat({color:0xc8102e,roughness:.6,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8});
   const A0=PIT_A-30,E=PIT_B+20,lIn=sp=>{const p=pitOffSp(sp);return p!=null?Math.max(p-PIT_HW,HW-2.4):HW-2.4;};
   const lOut=sp=>{const p=pitOffSp(sp);return Math.max(p!=null?p+PIT_HW:0,lIn(sp)+0.45);};
   strip(idxSp(A0),rangeN(A0,E),i=>lIn(spI(i)),i=>lOut(spI(i)),0.035,0.035,red,1,false);
   // the speed-limit line across the lane, where the limiter actually cuts in
   const chev=mat({color:0xffffff,roughness:.55,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8});
   flatAt(idxSp(PIT_L),pitOffSp(PIT_L)??PIT_OFF,0.7,PIT_HW*2,0.04,chev);
  }
  await stage("Pit lane & stands…",.15);
  // pit boxes, garages
  // the garage block spans the boxes (with the standard 40 m boxes that is the usual 440 m building centred 25 m before the line)
  const std=BOX_GAP===40,gLen=std?440:BOX_GAP*TEAMS.length+4,gMid=std?-25:(BOX_S[0]+BOX_S[TEAMS.length-1])/2;
  const garage=new THREE.Group();const gi=idxSp(gMid);garage.position.set(X[gi]-TZ[gi]*(PIT_OFF+PIT_HW+7),0,Z[gi]+TX[gi]*(PIT_OFF+PIT_HW+7));garage.rotation.y=-ANG[gi];scene.add(garage);
  const gb=new THREE.Mesh(new THREE.BoxGeometry(gLen,9,8),mat({color:DAY?0x3a404c:0x2b2f3a,roughness:.8}));gb.position.y=4.5;garage.add(gb);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(gLen+4,.5,10),new THREE.MeshBasicMaterial({color:0xeaf2ff}));roof.position.y=9.2;garage.add(roof);
  // team garage doors and box markings: team colours live in the vertices, so all ten share one material each
  {const doorMat=new THREE.MeshBasicMaterial({vertexColors:true}),boxMat=mat({vertexColors:true,roughness:.6,...po(-6)}),tc=new THREE.Color();
   TEAMS.forEach((t,j)=>{const i=idxSp(BOX_S[j]);tc.setHex(t.c);
     const door=new THREE.BoxGeometry(Math.min(14,BOX_GAP-3),5,.3).applyMatrix4(_fm.makeRotationY(-ANG[i]).setPosition(X[i]-TZ[i]*(PIT_OFF+PIT_HW+2.85),2.6,Z[i]+TX[i]*(PIT_OFF+PIT_HW+2.85)));
     batchAdd(vColor(door,tc),doorMat,false);
     // the box: a team-coloured 7.5 × 3.6 m rectangle in the working lane, outlined in white with a stop bar at the
     // front — the car has to be brought to rest inside it
     flatAt(i,PIT_OFF+BOX_D,7.5,3.6,0.045,boxMat,tc);
     for(const e of [-1,1])flatAt(i,PIT_OFF+BOX_D+e*1.8,7.5,0.14,0.05,matMark);
     flatAt(idxSp(BOX_S[j]+3.75),PIT_OFF+BOX_D,0.3,3.6,0.05,matMark);flatAt(idxSp(BOX_S[j]-3.75),PIT_OFF+BOX_D,0.14,3.6,0.05,matMark);});
   // the line between the fast lane and the working lane
   strip(idxSp(PIT_B),rangeN(PIT_B,PIT_C),()=>PIT_OFF+0.2,()=>PIT_OFF+0.32,0.03,0.03,matLine);}
  // start gantry
  const gg=new THREE.Group();gg.position.set(X[0],0,Z[0]);gg.rotation.y=-ANG[0];scene.add(gg);
  const mG=mat({color:0x1c2030,metalness:.5,roughness:.4});
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.6,7.5,.6),mG);p.position.set(0,3.75,s*(HW+1.4));gg.add(p);}
  const bar=new THREE.Mesh(new THREE.BoxGeometry(1,1.4,W+3.4),mG);bar.position.y=7;gg.add(bar);
  for(let k=0;k<5;k++){const m=new THREE.MeshBasicMaterial({color:0x220404});const l=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.2,16).rotateZ(Math.PI/2),m);l.position.set(-.56,7,(k-2)*1.1);gg.add(l);gantryLamps.push(m);}
  // grandstands
  // (the crowd texture's repeat is baked into the UVs, so every stand shares one texture and one material)
  const crowdMat=mat({map:texCrowd,roughness:.9}),standRoofMat=mat({color:0x30364a,roughness:.7});
  const stand=(sp,side,len,dist)=>{const i=idxSp(sp);const off=side<0?-(WL[i]+dist):WR[i]+dist;const g=new THREE.Group();g.position.set(X[i]-TZ[i]*off,8,Z[i]+TX[i]*off);g.rotation.y=-ANG[i];
    const inner=new THREE.Group();inner.rotation.y=side<0?0:Math.PI;g.add(inner);
    const pg=new THREE.PlaneGeometry(len,24),uv=pg.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*len/20,uv.getY(k)*1.6);
    const p=new THREE.Mesh(pg,crowdMat);p.rotation.x=-0.62;inner.add(p);
    const r=new THREE.Mesh(new THREE.BoxGeometry(len,.6,16),standRoofMat);r.position.set(0,10,-6);inner.add(r);
    g.updateMatrixWorld(true);for(const m of [p,r])batchAdd(m.geometry.clone().applyMatrix4(m.matrixWorld),m.material,false);};
  stand(-40,-1,300,14);for(const [rx,ry,side,len] of TR.stands)stand(spOf(idxOf(rx,ry)*DS),side,len,12);
  // floodlight poles
  const cnt=Math.floor(N/20);const poles=new THREE.InstancedMesh(new THREE.BoxGeometry(.3,12,.3),mat({color:0x3a3f4c,roughness:.6}),cnt);
  const heads=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.3,3.4),new THREE.MeshBasicMaterial({color:0xfff4dc}),cnt);
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),one=new THREE.Vector3(1,1,1);
  for(let k=0;k<cnt;k++){const i=k*20,s=k%2?1:-1,off=s>0?WR[i]+1.3:-(WL[i]+1.3),hoff=off-s*1.6;q.setFromEuler(e.set(0,-ANG[i],0));
    m4.compose(new THREE.Vector3(X[i]-TZ[i]*off,6,Z[i]+TX[i]*off),q,one);poles.setMatrixAt(k,m4);
    m4.compose(new THREE.Vector3(X[i]-TZ[i]*hoff,12,Z[i]+TX[i]*hoff),q,one);heads.setMatrixAt(k,m4);}
  addTiled(poles,heads);
  buildBrakingBoards();
  buildMarshalPanels();
  flushBatch();
  await stage("Scenery…",.2);if(TR.osm)await buildOSM();
  await stage("Skyline…",.75);await buildCity(); // real footprints first, then the generic skyline out past where OSM was downloaded
}

/* ---- braking boards: the 150 / 100 / 50 m countdown to the corner, as at Yas Marina ----
   Placed wherever a fast stretch ends in a real stop: a minimum of the speed profile with at least 230 km/h in the
   700 m before it and a 90 km/h+ drop. The distances count down to the corner entry — where the braking ends and the
   car reaches its cornering speed; a long braking zone gets a 200 m board too. They stand on the barrier on the outside of the corner, facing
   the cars, and are merged into one mesh through a 2 × 2 number atlas. */
function brakingZones(){const zones=[],lim=Math.round(700/DS);
  for(let i=0;i<N;i++){const v=VP[i];if(!(v<=VP[(i-1+N)%N]&&v<VP[(i+1)%N]))continue;
    // back from the apex while the speed keeps rising: that is where this braking zone starts (a window maximum
    // could reach past the previous corner into an earlier, faster straight)
    let jmax=0;while(jmax<lim&&VP[(i-jmax-1+N)%N]>=VP[(i-jmax+N)%N]-0.01)jmax++;const vmax=VP[(i-jmax+N)%N];
    if(vmax*3.6<230||(vmax-v)*3.6<90)continue;
    let k=0;while(k<jmax&&VP[(i-k+N)%N]<v*1.08)k++; // back from the apex to where the braking ends (corner entry speed)
    const z={apex:i,turn:(i-k+N)%N,brake:(jmax-k)*DS,v,vmax,side:K[i]>0?-1:1};
    const dup=zones.find(o=>Math.min(Math.abs(o.apex-i),N-Math.abs(o.apex-i))*DS<200);
    if(dup){if(v<dup.v)Object.assign(dup,z);}else zones.push(z);}
  return zones;}
function buildBrakingBoards(){
  const atlas=canvasTex(512,512,(x)=>{['200','150','100','50'].forEach((t,n)=>{const cx=(n%2)*256,cy=(n>>1)*256;
      x.fillStyle='#0d1a3a';x.fillRect(cx,cy,256,256);x.fillStyle='#e10600';x.fillRect(cx,cy,256,30); // navy board, red header
      x.strokeStyle='#ffffff';x.lineWidth=10;x.strokeRect(cx+14,cy+44,228,198);
      x.fillStyle='#ffffff';x.font='900 128px Titillium Web, Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(t,cx+128,cy+148);});},false);
  const face=new THREE.MeshBasicMaterial({map:atlas}),frame=mat({color:0x2a2f3a,roughness:.6,metalness:.3});
  const BW=2.6,BH=2.3,BY=1.25; // a board 2.6 × 2.3 m standing on the 1.05 m barrier
  for(const z of brakingZones()){const dists=z.brake>220?[200,150,100,50]:[150,100,50];
    for(const d of dists){const i=(z.turn-Math.round(d/DS)+N)%N,cell=d===200?0:d===150?1:d===100?2:3;
      if(spOf(i*DS)>PIT_A-20&&spOf(i*DS)<PIT_D+20&&z.side>0)continue; // never in the pit lane
      const off=z.side<0?-(WL[i]-0.25):WR[i]-0.25,px=X[i]-TZ[i]*off,pz=Z[i]+TX[i]*off,ry=Math.atan2(-TX[i],-TZ[i]);
      const m=_fm.makeRotationY(ry).setPosition(px,0,pz);
      const pl=new THREE.PlaneGeometry(BW,BH).translate(0,BY+BH/2,0.08),uv=pl.attributes.uv;
      for(let q=0;q<uv.count;q++){const u=uv.getX(q),v=uv.getY(q),col=cell%2,row=cell>>1;uv.setXY(q,(col+u)/2,(1-row+v)/2);} // 2 × 2 atlas, row 0 = top
      batchAdd(pl.applyMatrix4(m),face,false);
      batchAdd(new THREE.BoxGeometry(BW+0.2,BH+0.2,0.12).translate(0,BY+BH/2,0).applyMatrix4(m),frame,false);
      for(const sx of [-0.9,0.9])batchAdd(new THREE.BoxGeometry(0.12,BY,0.12).translate(sx,BY/2,0).applyMatrix4(m),frame,false);}}}

/* ---- real-world scenery from OpenStreetMap (Songdo) ---- */
async function buildOSM(){
  const D=OSM,cell=50,hash=new Map();
  for(let i=0;i<N;i+=2){const k=Math.floor(X[i]/cell)+','+Math.floor(Z[i]/cell);if(!hash.has(k))hash.set(k,[]);hash.get(k).push(i);}
  // clearance a real object needs from the circuit: walls + runoff, more around the pit complex
  const blocked=(x,z,extra=0)=>{const cx=Math.floor(x/cell),cz=Math.floor(z/cell);
    for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++){const l=hash.get((cx+a)+','+(cz+b));if(l)for(const i of l){
      // clearance = this sample's own barrier offset plus the fence; the pit complex only needs the extra
      // room on its own (right-hand) side — the far side of the road keeps its buildings (BEXCO hall 1)
      // (Busan, where the paddock is squeezed between the BEXCO corner and the auditorium: the full allowance
      // only alongside the garages, elsewhere just the pit lane itself plus a margin)
      const sp=spI(i),pit=sp>PIT_A-60&&sp<PIT_D+60,lat=(x-X[i])*-TZ[i]+(z-Z[i])*TX[i],right=lat>0;
      const busan=TRACK_ID==='busan',gar=sp>=BOX_S[0]-12&&sp<=BOX_S[BOX_S.length-1]+12,po=pitOffSp(sp);
      // the garage block itself is a strip beside the lane: test it square to the track, not as a circle
      if(busan&&gar&&right){if(Math.abs((x-X[i])*TX[i]+(z-Z[i])*TZ[i])<1.5&&lat<PIT_OFF+PIT_HW+12.5+extra)return true;continue;}
      const r=(!pit||(busan&&!right)?Math.max(WL[i],WR[i])+3:busan?Math.max(WR[i],(po??0)+PIT_HW)+2.5:PIT_OFF+22)+extra;
      if(Math.hypot(X[i]-x,Z[i]-z)<r)return true;}}return false;};
  const W2=(x,y)=>[x*SC,-y*SC];
  // A building is kept only if NO part of it reaches the circuit. Testing its corners alone missed
  // big blocks the track now runs straight through (the Michuhol straight cuts a city block): every
  // corner was 30–50 m away while the middle of the building sat on the tarmac. So: walk every wall
  // every 4 m, and check whether any track sample lies inside the footprint.
  const inPolyXZ=(p,x,z)=>{let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const [xi,zi]=p[i],[xj,zj]=p[j];
    if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}return c;};
  const footprintHitsTrack=pts=>{
    for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(l/4));
      for(let k=0;k<n;k++){const t=k/n;if(blocked(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))return true;}}
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [x,z] of pts){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
    for(let cx=Math.floor(x0/cell);cx<=Math.floor(x1/cell);cx++)for(let cz=Math.floor(z0/cell);cz<=Math.floor(z1/cell);cz++){
      const l=hash.get(cx+','+cz);if(l)for(const i of l)if(inPolyXZ(pts,X[i],Z[i]))return true;}
    return false;};
  // ground layers: parks, water, city streets (all below the circuit surface). By day the layers are spread a few
  // centimetres apart: a 5 mm gap z-fights at a few hundred metres, which the dark night palettes hide but
  // pale concrete against blue sea does not
  const LY={road:-0.035,lot:-0.05,isl:-0.06,sand:-0.08,water:-0.10,green:-0.12,walk:-0.14};
  const flatPoly=(arr,m,y)=>{const geos=[];for(const p of arr){const pts=[];for(let k=0;k<p.length;k+=2)pts.push(new THREE.Vector2(p[k]*SC,p[k+1]*SC));
      if(pts.length<3)continue;geos.push(new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI/2));}
    if(geos.length){const me=new THREE.Mesh(mergeGeometries(geos),m);me.position.y=y;me.receiveShadow=true;groundLayer(me);scene.add(me);}};
  flatPoly(D.g,mat({color:DAY?0x48703a:DUSK?0x2c4a2e:0x1b3a22,roughness:1,...po(1)}),LY.green);
  // at dusk the water picks up the violet sky; at night it stays dark but still reads against the lawns
  const waterMat=DAY?mat({color:0x2a5d80,metalness:.35,roughness:.22,...po(0.5)}):mat({color:DUSK?0x3a4f86:0x10284a,metalness:.7,roughness:.14,envMap:envTex,envMapIntensity:DUSK?.9:.6,...po(0.5)});
  flatPoly(D.w,waterMat,LY.water);
  // Central Park's seawater lake: one outer shore with its islands cut out (the park lawn shows through them)
  if(D.lk){const V=a=>{const v=[];for(let k=0;k<a.length;k+=2)v.push(new THREE.Vector2(a[k]*SC,a[k+1]*SC));return v;};
    const sh=new THREE.Shape(V(D.lk[0]));for(const h of D.lk.slice(1))sh.holes.push(new THREE.Path(V(h)));
    const me=new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI/2),waterMat);me.position.y=LY.water;me.receiveShadow=true;groundLayer(me);scene.add(me);}
  if(D.s)flatPoly(D.s,mat({color:0xd8c7a2,roughness:1,...po(0.4)}),LY.sand); // Gwangalli / Haeundae beach sand
  if(D.isl)flatPoly(D.isl,mat({color:0x8d8a80,roughness:1,...po(0.3)}),LY.isl); // breakwaters and rocks in the bay
  // surface car parks (BEXCO's is the paddock): asphalt with white bays, the bays squared to each lot's long side
  if(D.p){const tex=canvasTex(256,256,(x)=>{x.fillStyle='#55585e';x.fillRect(0,0,256,256);
      for(let i=0;i<3000;i++){const v=70+Math.random()*30|0;x.fillStyle=`rgba(${v},${v},${v+3},.5)`;x.fillRect(Math.random()*256,Math.random()*256,1.5,1.5);}
      x.fillStyle='#e8e8e2';for(const r of [0,128]){x.fillRect(0,r+50,256,2);for(let c=0;c<256;c+=32){x.fillRect(c,r,2,50);x.fillRect(c,r+52,2,50);}}},true);
    const geos=[];
    for(const p of D.p){const pts=[];for(let k=0;k<p.length;k+=2)pts.push([p[k]*SC,-p[k+1]*SC]);if(pts.length<3)continue;
      // long axis = the longest edge
      let ax=1,az=0,best=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>best){best=l;ax=(b[0]-a[0])/l;az=(b[1]-a[1])/l;}}
      const g=new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x,z])=>new THREE.Vector2(x,-z)))).rotateX(-Math.PI/2);
      const pa=g.attributes.position,uv=g.attributes.uv;
      // one texture tile = 8 bays × 2 rows: 20 m along the lot, 26 m across
      for(let k=0;k<pa.count;k++){const x=pa.getX(k),z=pa.getZ(k);uv.setXY(k,(x*ax+z*az)/20,(-x*az+z*ax)/26);}
      geos.push(g);}
    if(geos.length){const me=new THREE.Mesh(mergeGeometries(geos),mat({map:tex,roughness:.9,...po(0.15)}));me.position.y=LY.lot;me.receiveShadow=true;groundLayer(me);scene.add(me);}}
  await stage("City streets…",.3);
  // ---- city streets: OSM width (lanes) with lane markings, kerbs/footways, lamps and street trees ----
  // markings are drawn into the surface texture; UVs are (distance / width, across 0…1) so a wide
  // boulevard gets wide lanes and a back street stays narrow
  const roadTex=(lanes)=>canvasTex(256,128,(x)=>{
    const g=x.createLinearGradient(0,0,0,128);g.addColorStop(0,'#3d4149');g.addColorStop(.5,'#474b54');g.addColorStop(1,'#3d4149');x.fillStyle=g;x.fillRect(0,0,256,128);
    for(let i=0;i<5000;i++){const v=55+Math.random()*35|0;x.fillStyle=`rgba(${v},${v},${v+3},.5)`;x.fillRect(Math.random()*256,Math.random()*128,1.5,1.5);}
    x.fillStyle='#d9d7cf';x.fillRect(0,3,256,3.5);x.fillRect(0,121.5,256,3.5); // edge lines
    if(lanes>1)for(let l=1;l<lanes;l++){const y=6+ (116/lanes)*l;x.fillStyle='#cfcdc4';for(let u=0;u<256;u+=40)x.fillRect(u,y-1.2,22,2.4);} // dashed lane lines
    if(lanes>1){x.fillStyle='#e6c95a';x.fillRect(0,62,256,2);x.fillRect(0,66,256,2);} // yellow centre pair
  },true);
  const roadMats=[null,null,mat({map:roadTex(4),normalMap:texAsphaltN,normalScale:new THREE.Vector2(.5,.5),roughness:.85,side:THREE.DoubleSide,...po(0.2)}),
    mat({map:roadTex(2),normalMap:texAsphaltN,normalScale:new THREE.Vector2(.5,.5),roughness:.85,side:THREE.DoubleSide,...po(0.2)}),
    mat({map:roadTex(1),normalMap:texAsphaltN,normalScale:new THREE.Vector2(.5,.5),roughness:.88,side:THREE.DoubleSide,...po(0.2)})];
  const roadG={2:[],3:[],4:[]},waterG=[],walkG=[],lampPos=[],treePos=[];
  const ribbon=(pts,w,uScale)=>{const pos=[],uv=[],ix=[];let u=0;
    for(let k=0;k<pts.length;k++){const a=pts[Math.max(0,k-1)],b=pts[Math.min(pts.length-1,k+1)];let dx=b[0]-a[0],dz=b[1]-a[1];const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
      if(k>0)u+=Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]);
      pos.push(pts[k][0]+dz*w/2,0,pts[k][1]-dx*w/2,pts[k][0]-dz*w/2,0,pts[k][1]+dx*w/2);uv.push(u/uScale,0,u/uScale,1);
      if(k<pts.length-1){const o=k*2;ix.push(o,o+2,o+1,o+1,o+2,o+3);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;};
  // The circuit IS a set of these streets. Where the mapped street runs along the circuit (or lies under its tarmac and
  // run-off) it is dropped, so the city road no longer shows as a second road beside the barriers or pokes out where
  // the circuit's corners are rounded off; cross streets now stop at the barrier. Polylines are split into ≤8 m steps first.
  const onCircuit=(x,z,w,dx,dz)=>{const cx=Math.floor(x/cell),cz=Math.floor(z/cell);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const l=hash.get((cx+a)+','+(cz+b));if(l)for(const i of l){
      const d=Math.hypot(X[i]-x,Z[i]-z);if(d<Math.max(WL[i],WR[i])+1.5)return true;
      if(d<HWa[i]+w/2+4&&Math.abs(dx*TX[i]+dz*TZ[i])>0.8)return true;}}return false;};
  const runs=[];
  for(const r of D.r){const w=r[0],cls=r[1],raw=[];for(let k=2;k<r.length;k+=2)raw.push(W2(r[k],r[k+1]));if(raw.length<2)continue;
    if(cls===1){runs.push([w,cls,raw]);continue;}
    const dense=[raw[0]];for(let k=1;k<raw.length;k++){const a=raw[k-1],b=raw[k],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8));
      for(let j=1;j<=n;j++)dense.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}
    let cur=[];for(let k=0;k<dense.length;k++){const a=dense[Math.max(0,k-1)],b=dense[Math.min(dense.length-1,k+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
      if(onCircuit(dense[k][0],dense[k][1],w,(b[0]-a[0])/l,(b[1]-a[1])/l)){if(cur.length>=2)runs.push([w,cls,cur]);cur=[];}else cur.push(dense[k]);}
    if(cur.length>=2)runs.push([w,cls,cur]);}
  for(const [w,cls,pts] of runs){
    if(cls===1){waterG.push(ribbon(pts,w,w));continue;}
    roadG[cls].push(ribbon(pts,w,w));
    if(cls<4)walkG.push(ribbon(pts,w+7,12)); // paved footway/kerb strip either side
    // lamps and trees at a steady spacing along the whole run (the points are only ~8 m apart now)
    const lampGap=cls===2?28:cls===3?34:55,treeGap=cls<4?16:0;let nextL=0,nextT=8,acc=0;
    for(let k=1;k<pts.length;k++){const ax=pts[k][0]-pts[k-1][0],az=pts[k][1]-pts[k-1][1],seg=Math.hypot(ax,az)||1,dx=ax/seg,dz=az/seg;
      for(;nextL<acc+seg;nextL+=lampGap){const t=(nextL-acc)/seg,x=pts[k-1][0]+ax*t,z=pts[k-1][1]+az*t,sd=(lampPos.length&1)?1:-1;
        const lx=x+dz*sd*(w/2+1.6),lz=z-dx*sd*(w/2+1.6);if(!blocked(lx,lz,-1)&&!blocked(lx-dz*sd*2.2,lz+dx*sd*2.2,-1))lampPos.push([lx,lz,Math.atan2(dz,dx),sd]);}
      if(treeGap)for(;nextT<acc+seg;nextT+=treeGap){const t=(nextT-acc)/seg,x=pts[k-1][0]+ax*t,z=pts[k-1][1]+az*t;
        for(const sd of [-1,1]){const tx=x+dz*sd*(w/2+3.4),tz=z-dx*sd*(w/2+3.4);if(!blocked(tx,tz,-3)&&treePos.length<7000)treePos.push([tx,tz,rand(.75,1.15)]);}}
      acc+=seg;}}
  // park trees (Central Park and the other lawns) — only within ~700 m of the circuit; nobody sees the far ones
  {const near=new Set();for(let i=0;i<N;i+=10){const cx=Math.floor(X[i]/100),cz=Math.floor(Z[i]/100);for(let a=-7;a<=7;a++)for(let b=-7;b<=7;b++)near.add((cx+a)+','+(cz+b));}
   const inP=(p,x,z)=>{let c=false;for(let i=0,j=p.length-2;i<p.length;j=i,i+=2){const xi=p[i]*SC,zi=-p[i+1]*SC,xj=p[j]*SC,zj=-p[j+1]*SC;
     if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}return c;};
   const bbOf=p=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(let k=0;k<p.length;k+=2){const x=p[k]*SC,z=-p[k+1]*SC;a=Math.min(a,x);b=Math.max(b,x);c=Math.min(c,z);d=Math.max(d,z);}return [a,b,c,d];};
   const WB=D.w.map(w=>[w,bbOf(w)]);
   const wet=(x,z)=>(D.lk&&inP(D.lk[0],x,z)&&!D.lk.slice(1).some(h=>inP(h,x,z)))||WB.some(([w,b])=>x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3]&&inP(w,x,z));
   for(const p of D.g){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(let k=0;k<p.length;k+=2){const x=p[k]*SC,z=-p[k+1]*SC;x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
     for(let x=x0;x<x1;x+=15)for(let z=z0;z<z1;z+=15){if(treePos.length>=11000)break;const tx=x+rand(-6,6),tz=z+rand(-6,6);
       if(!near.has(Math.floor(tx/100)+','+Math.floor(tz/100))||Math.random()<0.35||!inP(p,tx,tz)||wet(tx,tz)||blocked(tx,tz,-2))continue;treePos.push([tx,tz,rand(.8,1.3)]);}}}
  if(walkG.length){const m=new THREE.Mesh(mergeGeometries(walkG),mat({color:0x6b6e75,map:texConcrete,normalMap:texConcreteN,roughness:.95,side:THREE.DoubleSide,...po(0.1)}));m.position.y=LY.walk;m.receiveShadow=true;groundLayer(m);scene.add(m);}
  for(const cls of [2,3,4])if(roadG[cls].length){const m=new THREE.Mesh(mergeGeometries(roadG[cls]),roadMats[cls]);m.position.y=LY.road;m.receiveShadow=true;groundLayer(m);scene.add(m);}
  if(waterG.length){const m=new THREE.Mesh(mergeGeometries(waterG),waterMat);m.material.side=THREE.DoubleSide;m.position.y=LY.water;scene.add(m);}
  {const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.11,.15,8.5,6).translate(0,4.25,0),mat({color:0x41464f,roughness:.5,metalness:.5}),lampPos.length);
   const arms=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.18,.18),mat({color:0x41464f,roughness:.5,metalness:.5}),lampPos.length);
   const heads=new THREE.InstancedMesh(new THREE.BoxGeometry(1.1,.22,.5),new THREE.MeshBasicMaterial({color:0xffe9c4}),lampPos.length);
   const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),one=new THREE.Vector3(1,1,1),v3=new THREE.Vector3();
   lampPos.forEach(([x,z,ang,sd],k)=>{q.setFromEuler(e.set(0,-ang+Math.PI/2,0));
     m4.compose(v3.set(x,0,z),q,one);poles.setMatrixAt(k,m4);
     m4.compose(v3.set(x-Math.sin(ang)*sd*0.9*-1,8.4,z+Math.cos(ang)*sd*0.9*-1),q,one);arms.setMatrixAt(k,m4);
     m4.compose(v3.set(x+Math.sin(ang)*sd*1.7,8.2,z-Math.cos(ang)*sd*1.7),q,one);heads.setMatrixAt(k,m4);});
   addTiledT(520,800,poles,arms,heads);}
  {const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.26,3,5).translate(0,1.5,0),mat({color:0x3b2f25,roughness:1}),treePos.length);
   const crown=new THREE.InstancedMesh(new THREE.SphereGeometry(2.6,7,5),mat({color:DAY?0x355f2c:0x1d3a22,roughness:1}),treePos.length);
   const m4=new THREE.Matrix4(),v3=new THREE.Vector3(),q=new THREE.Quaternion();
   treePos.forEach(([x,z,s],k)=>{m4.compose(v3.set(x,0,z),q,new THREE.Vector3(s,s,s));trunk.setMatrixAt(k,m4);
     m4.compose(v3.set(x,3.2*s+1.6,z),q,new THREE.Vector3(s,s*1.15,s));crown.setMatrixAt(k,m4);});addTiledT(520,700,trunk,crown);}
  await stage("Trees & lamps…",.4);
  // trees scattered through parks
  {const trees=[];const inP=(p,x,y)=>{let c=false;for(let i=0,j=p.length-2;i<p.length;j=i,i+=2){const xi=p[i],yi=p[i+1],xj=p[j],yj=p[j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
   for(const p of D.g){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(let k=0;k<p.length;k+=2){x0=Math.min(x0,p[k]);x1=Math.max(x1,p[k]);y0=Math.min(y0,p[k+1]);y1=Math.max(y1,p[k+1]);}
     const n=Math.min(400,Math.floor((x1-x0)*(y1-y0)/350));for(let t=0;t<n&&trees.length<5000;t++){const x=rand(x0,x1),y=rand(y0,y1);if(!inP(p,x,y))continue;const [wx,wz]=W2(x,y);if(!blocked(wx,wz,-2))trees.push([wx,wz,rand(.7,1.4)]);}}
   const im=new THREE.InstancedMesh(new THREE.ConeGeometry(2.6,8,7).translate(0,4.6,0),mat({color:DAY?0x2d5229:0x16331d,roughness:.9}),trees.length);const m4=new THREE.Matrix4();
   trees.forEach(([x,z,s],k)=>{m4.makeScale(s,s,s);m4.setPosition(x,0,z);im.setMatrixAt(k,m4);});addTiledT(520,700,im);}
  await stage("Buildings…",.5);
  // ---- buildings: real OSM footprints and heights, dressed by type like present-day Songdo ----
  // facade styles: 0 apartment tower (light concrete, floor bands), 1 glass office/hotel curtain wall,
  // 2 retail (warm facade, lit shopfronts), 3 civic/other (grey concrete)
  // facade styles: 0 Songdo apartment tower (precast piers, recessed window columns, balcony rails),
  // 1 glass office/hotel curtain wall, 2 stone-panel retail with lit shopfronts, 3 civic concrete,
  // 4 dark panelled commercial — Triple Street's charcoal fins, billboards and signage
  const ST=[{tw:26,th:26,rough:.72,metal:.05,env:.22},{tw:26,th:34,rough:.15,metal:.72,env:1.05},
    {tw:22,th:22,rough:.68,metal:.05,env:.2},{tw:26,th:26,rough:.8,metal:.05,env:.22},
    {tw:20,th:20,rough:.72,metal:.04,env:.18},
    {tw:44,th:64,rough:.82,metal:.02,env:.15}]; // 5: Shinsegae Centum City — sandstone panels, almost no windows
  // facades are drawn at 512×1024, one floor every 64 px, so mullions, balcony rails and shopfronts
  // still read as building parts at the distance you actually drive past them
  const facade=s=>{const map=canvasTex(512,1024,(x)=>{
      const grain=(n,a)=>{for(let i=0;i<n;i++){const v=Math.random();x.fillStyle=`rgba(${v>0.5?255:0},${v>0.5?255:0},${v>0.5?255:0},${Math.random()*a})`;x.fillRect(Math.random()*512,Math.random()*1024,3,3);}};
      if(s===0){
        // apartment tower: pale precast bays, each with a recessed glazed column and a balcony rail
        x.fillStyle='#ecebe6';x.fillRect(0,0,512,1024);
        for(let c=0;c<512;c+=128){
          x.fillStyle='#d7d3ca';x.fillRect(c,0,128,1024);
          x.fillStyle='#f6f4ef';x.fillRect(c,0,15,1024);x.fillRect(c+113,0,15,1024);
          x.fillStyle='rgba(0,0,0,.17)';x.fillRect(c+15,0,7,1024);x.fillRect(c+106,0,7,1024);
        }
        for(let f=0;f<16;f++){const y=f*64;
          for(let c=0;c<512;c+=128){
            x.fillStyle='#3a4553';x.fillRect(c+25,y+11,79,37);
            x.fillStyle='rgba(0,0,0,.38)';x.fillRect(c+25,y+7,79,5);
            x.fillStyle='rgba(255,255,255,.13)';x.fillRect(c+25,y+12,79,5);
            x.fillStyle='#cdd2d6';for(let m=c+45;m<c+104;m+=20)x.fillRect(m,y+11,2,37);
          }
          x.fillStyle='#faf9f6';x.fillRect(0,y+50,512,8);
          x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,y+58,512,5);
          x.fillStyle='rgba(150,158,166,.5)';for(let m=0;m<512;m+=9)x.fillRect(m,y+40,2,10);
        }
      } else if(s===1){
        // curtain wall: Songdo's blue-green glass, slab spandrel at every floor, sky caught unevenly
        const g=x.createLinearGradient(0,0,420,1024);
        g.addColorStop(0,'#a4c4cb');g.addColorStop(.38,'#5f8c96');g.addColorStop(.74,'#3d626f');g.addColorStop(1,'#294654');
        x.fillStyle=g;x.fillRect(0,0,512,1024);
        for(let r=0;r<1024;r+=64){
          for(let c=0;c<512;c+=32)if(Math.random()<.4){x.fillStyle=`rgba(${190+Math.random()*50|0},${214+Math.random()*36|0},238,${.04+Math.random()*.13})`;x.fillRect(c+3,r+4,27,34);}
          x.fillStyle='rgba(14,24,32,.6)';x.fillRect(0,r+44,512,19);
          x.fillStyle='rgba(0,0,0,.2)';x.fillRect(0,r+38,512,6);
          x.fillStyle='rgba(255,255,255,.14)';x.fillRect(0,r+3,512,4);
        }
        x.fillStyle='#93a3ae';for(let c=0;c<512;c+=32)x.fillRect(c,0,3,1024);
        x.fillStyle='rgba(255,255,255,.2)';for(let c=0;c<512;c+=32)x.fillRect(c+3,0,1,1024);
      } else if(s===2){
        // stone-panel retail: cladding panels with visible joints, a deep glazed shopfront at the base
        x.fillStyle='#ddd6c8';x.fillRect(0,0,512,1024);
        for(let r=0;r<1024;r+=52)for(let c=0;c<512;c+=86){
          const t=212+Math.random()*24|0;x.fillStyle=`rgb(${t},${t-6},${t-20})`;x.fillRect(c+2,r+2,82,48);
          x.fillStyle='rgba(0,0,0,.14)';x.fillRect(c,r,86,2);x.fillRect(c,r,2,52);
        }
        x.fillStyle='#b6ad9c';x.fillRect(0,784,512,18);
        x.fillStyle='#1e242b';x.fillRect(0,802,512,222);
        x.fillStyle='rgba(255,255,255,.09)';for(let c=12;c<512;c+=96)x.fillRect(c,814,74,198);
        x.fillStyle='#8d8676';for(let c=0;c<512;c+=96)x.fillRect(c,802,8,222);
      } else if(s===3){
        // civic / light industrial: precast concrete with long strip windows
        x.fillStyle='#c8cbcf';x.fillRect(0,0,512,1024);
        for(let r=44;r<1024;r+=112){x.fillStyle='#48525f';x.fillRect(20,r,472,38);
          x.fillStyle='rgba(0,0,0,.3)';x.fillRect(20,r,472,6);
          x.fillStyle='rgba(255,255,255,.35)';x.fillRect(20,r+38,472,4);}
        x.strokeStyle='rgba(0,0,0,.15)';x.lineWidth=2;for(let r=0;r<1024;r+=112)x.strokeRect(0,r,512,112);
      } else if(s===5){
        // Shinsegae Centum City: big blank sandstone panels, each a slightly different tone, fine joints —
        // the glazing is all at street level (a separate band) and in the frosted corner fins
        x.fillStyle='#d9ccb4';x.fillRect(0,0,512,1024);
        for(let r=0;r<1024;r+=64)for(let c=(r/64%2)*64;c<512+128;c+=128){const t=Math.random()*18-9|0;
          x.fillStyle=`rgb(${214+t},${200+t},${176+t})`;x.fillRect(c-128,r,126,62);}
        x.fillStyle='rgba(90,72,48,.28)';for(let r=0;r<1024;r+=64)x.fillRect(0,r,512,2);
        x.fillStyle='rgba(90,72,48,.18)';for(let r=0;r<1024;r+=64)for(let c=(r/64%2)*64;c<512;c+=128)x.fillRect(c,r,2,64);
        x.fillStyle='rgba(255,255,255,.12)';for(let r=2;r<1024;r+=64)x.fillRect(0,r,512,2);
      } else {
        // Triple Street: white panel walls between slim vertical fins, dark glazed shopfronts below
        x.fillStyle='#eeece8';x.fillRect(0,0,512,1024);
        for(let c=0;c<512;c+=26){const t=226+Math.random()*24|0;x.fillStyle=`rgb(${t},${t-1},${t-5})`;x.fillRect(c,0,22,1024);
          x.fillStyle='rgba(255,255,255,.9)';x.fillRect(c+22,0,2,1024);
          x.fillStyle='rgba(0,0,0,.17)';x.fillRect(c+24,0,2,1024);}
        x.fillStyle='rgba(0,0,0,.07)';for(let r=0;r<1024;r+=128)x.fillRect(0,r,512,4);
        x.fillStyle='#dcd6cc';x.fillRect(0,286,512,28);
        x.fillStyle='rgba(0,0,0,.13)';x.fillRect(0,312,512,4);
        x.fillStyle='#3a3833';x.fillRect(0,804,512,16);
        x.fillStyle='#1a1c20';x.fillRect(0,820,512,204);
        x.fillStyle='rgba(255,255,255,.1)';for(let c=8;c<512;c+=86)x.fillRect(c,832,70,184);
      }
      grain(5200,.06);},true);
    const emi=canvasTex(256,512,(x)=>{x.fillStyle='#000';x.fillRect(0,0,256,512);
      const warm=()=>`hsl(${33+Math.random()*12},${55+Math.random()*25}%,${58+Math.random()*18}%)`;
      // not every flat is in and not every office floor is lit — an even grid of identical bright
      // squares is exactly what makes a night skyline look drawn rather than photographed
      if(s===0){for(let f=0;f<16;f++){const dark=Math.random()<.18;if(dark)continue;
        for(let c=0;c<256;c+=64)if(Math.random()<.34){x.globalAlpha=.45+Math.random()*.55;x.fillStyle=warm();x.fillRect(c+13,f*32+6,39,18);}}x.globalAlpha=1;}
      else if(s===1){for(let r=0;r<512;r+=32){const lit=Math.random();if(lit<.22)continue;
        for(let c=0;c<256;c+=16)if(Math.random()<lit*.55){x.globalAlpha=.4+Math.random()*.6;x.fillStyle=`hsl(${196+Math.random()*24},22%,${60+Math.random()*22}%)`;x.fillRect(c+2,r+3,13,18);}}x.globalAlpha=1;}
      else if(s===2){x.fillStyle='#ffdfae';x.fillRect(0,407,256,105);
        for(let r=60;r<390;r+=52)for(let c=6;c<256;c+=48)if(Math.random()<.24){x.fillStyle=warm();x.fillRect(c,r,40,26);}}
      else if(s===3){for(let r=22;r<512;r+=56)for(let c=10;c<246;c+=30)if(Math.random()<.14){x.fillStyle=warm();x.fillRect(c,r+2,24,16);}}
      else if(s===5){} // blank stone: nothing lights up
      else{
        // warm shopfront glow, the deck's light line and the big graphic billboards on the facades
        x.fillStyle='#ffdca8';x.fillRect(0,410,256,102);
        x.fillStyle='#ffca84';x.fillRect(0,150,256,5);
        const sign=['#ff5a1e','#ff2f55','#ffd43a','#2fa8ff','#ffffff','#ff8a1e'];
        for(let i=0;i<16;i++){const w=22+Math.random()*54,h2=12+Math.random()*30;
          x.fillStyle=sign[(Math.random()*sign.length)|0];x.fillRect(Math.random()*(256-w),150+Math.random()*250,w,h2);}
        for(let r=0;r<140;r+=32)for(let c=0;c<256;c+=24)if(Math.random()<.2){x.fillStyle='#cfe0f0';x.fillRect(c+3,r+4,17,19);}
      }},true);
    // by day only the shopfronts glow a little; the windows are just glass
    return mat({map,emissiveMap:emi,emissive:0xffffff,emissiveIntensity:DAY?(s===2||s===4?.25:0):.8,vertexColors:true,roughness:ST[s].rough,metalness:ST[s].metal,envMap:s===1?skyEnv:envTex,envMapIntensity:ST[s].env*(DAY&&s===1?1.35:1),side:THREE.DoubleSide});};
  const TINT=[[0xffffff,0xf1ece2,0xe7e9ec,0xf6efe4,0xdfe3e6,0xece4d6,0xd9dde2,0xf7f3ea,0xe3dcd0],
    [0xffffff,0xd8e6f2,0xcfe0da,0xe4e4ea,0xbcd2e6,0xc9dcd6,0xdce8f0,0xaec6da],
    [0xffffff,0xf0d9c0,0xcf8f6a,0xb86b52,0x6d6f75,0xe9dcc6,0xd8c8a8,0xc2a184],
    [0xffffff,0xe0e0dc,0xd2d6da,0xcdd2cf,0xe8e6df],
    [0xffffff,0xf4f2ee,0xe8e5df,0xfaf9f6,0xece9e3],
    [0xffffff]];
  // the LED crowns Songdo's towers wear after dark (see the Central Park skyline at dusk)
  const CROWN=[0x36d67a,0xff4f8b,0xff6a2b,0x49b7ff,0xc46bff,0xffd24a,0x4ae0d0];
  // `overhead`: structures that really do pass over the circuit (Busan's viaducts, sky bridges, footbridges).
  // They skip the overhang check below and cast shadows onto the track.
  const WB_=[0,1,2,3,4,5].map(()=>({p:[],u:[],c:[]})),ROOF={p:[],c:[]},beacons=[],extra=[],overhead=[];
  const col=new THREE.Color();
  // walls between successive footprint rings [y, scale-toward-centroid, twist (rad, optional)]
  const ringWalls=(pts,rings,s,tint)=>{const B=WB_[s],n=pts.length;let cx=0,cz=0;for(const [x,z] of pts){cx+=x;cz+=z;}cx/=n;cz/=n;col.setHex(tint);
    for(let r=0;r<rings.length-1;r++){const [y0,s0,t0=0]=rings[r],[y1,s1,t1=0]=rings[r+1];let u=0;
      for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        const P=(p,sc,y,t=0)=>{const dx=(p[0]-cx)*sc,dz=(p[1]-cz)*sc,c=Math.cos(t),sn=Math.sin(t);return [cx+dx*c-dz*sn,y,cz+dx*sn+dz*c];};
        const A0=P(a,s0,y0,t0),B0=P(b,s0,y0,t0),B1=P(b,s1,y1,t1),A1=P(a,s1,y1,t1);
        B.p.push(...A0,...B0,...B1,...A0,...B1,...A1);
        const u0=u/ST[s].tw,u1=(u+l)/ST[s].tw,v0=y0/ST[s].th,v1=y1/ST[s].th;B.u.push(u0,v0,u1,v0,u1,v1,u0,v0,u1,v1,u0,v1);u+=l;
        // slight ambient darkening near the ground, brighter higher up
        const sh=y=>0.72+0.28*Math.min(1,y/28),g0=sh(y0),g1=sh(y1);
        B.c.push(col.r*g0,col.g*g0,col.b*g0, col.r*g0,col.g*g0,col.b*g0, col.r*g1,col.g*g1,col.b*g1,
                 col.r*g0,col.g*g0,col.b*g0, col.r*g1,col.g*g1,col.b*g1, col.r*g1,col.g*g1,col.b*g1);}}
    const [yt,st,tt=0]=rings[rings.length-1],c=Math.cos(tt),sn=Math.sin(tt);
    return {cx,cz,top:pts.map(p=>{const dx=(p[0]-cx)*st,dz=(p[1]-cz)*st;return [cx+dx*c-dz*sn,cz+dx*sn+dz*c];}),yt};};
  // (`top` is a footprint ring, or a THREE.Shape already in (x,-z) — e.g. a roof with a courtyard hole)
  const roofCap=(top,y,tint)=>{const sh=new THREE.ShapeGeometry(top instanceof THREE.Shape?top:new THREE.Shape(top.map(([x,z])=>new THREE.Vector2(x,-z)))).rotateX(-Math.PI/2).toNonIndexed();
    const p=sh.attributes.position.array;col.setHex(tint);for(let k=0;k<p.length;k+=3){ROOF.p.push(p[k],y,p[k+2]);ROOF.c.push(col.r,col.g,col.b);}};
  const oba=pts=>{let cx=0,cz=0;for(const [x,z] of pts){cx+=x;cz+=z;}cx/=pts.length;cz/=pts.length;let a=0,b=0,c=0;for(const [x,z] of pts){const dx=x-cx,dz=z-cz;a+=dx*dx;b+=dx*dz;c+=dz*dz;}
    const ang=0.5*Math.atan2(2*b,a-c),ux=Math.cos(ang),uz=Math.sin(ang);let l0=1e9,l1=-1e9,w0=1e9,w1=-1e9;
    for(const [x,z] of pts){const s=(x-cx)*ux+(z-cz)*uz,t=-(x-cx)*uz+(z-cz)*ux;l0=Math.min(l0,s);l1=Math.max(l1,s);w0=Math.min(w0,t);w1=Math.max(w1,t);}
    // mx/mz is the middle of the box, which on an L-shaped plan is nowhere near the centroid
    const mx=cx+ux*(l0+l1)/2-uz*(w0+w1)/2,mz=cz+uz*(l0+l1)/2+ux*(w0+w1)/2;
    return {cx,cz,ux,uz,l0,l1,w0,w1,mx,mz,ang:-Math.atan2(uz,ux)};};
  const mWhite=mat({color:0xe9edf2,metalness:.55,roughness:.3,envMap:envTex,envMapIntensity:.8});
  const r_c=(p,pts,f)=>{let cx=0,cz=0;for(const q of pts){cx+=q[0];cz+=q[1];}cx/=pts.length;cz/=pts.length;return [cx+(p[0]-cx)*f,cz+(p[1]-cz)*f];};
  // the facade (footprint edge) that faces a point best, weighted toward long walls: {mx,mz middle, nx,nz outward normal, len}
  const edgeFacing=(pts,tx,tz)=>{let cx=0,cz=0;for(const [x,z] of pts){cx+=x;cz+=z;}cx/=pts.length;cz/=pts.length;let best=null,bs=-1e9;
    for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<10)continue;
      const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;let nx=(b[1]-a[1])/len,nz=-(b[0]-a[0])/len;if(nx*(mx-cx)+nz*(mz-cz)<0){nx=-nx;nz=-nz;}
      const dx=tx-mx,dz=tz-mz,dl=Math.hypot(dx,dz)||1,sc=(nx*dx+nz*dz)/dl*Math.sqrt(len);if(sc>bs){bs=sc;best={mx,mz,nx,nz,len};}}
    return best;};
  const nearestTrack=(x,z)=>{let bi=0,bd=1e18;for(let i=0;i<N;i+=4){const d=(X[i]-x)**2+(Z[i]-z)**2;if(d<bd){bd=d;bi=i;}}return [X[bi],Z[bi]];};
  // a lettered sign on a facade: transparent unless `bg`; `logo` adds Shinsegae's red flower before the name
  const signAt=(fe,text,y,w,hgt,fg,bg,wt=1,logo=false)=>{const t=canvasTex(1024,256,(x)=>{if(bg){x.fillStyle=bg;x.fillRect(0,0,1024,256);}
      let fs=170;x.font=`900 ${fs}px Titillium Web, Arial, sans-serif`;const tw=x.measureText(text).width+(logo?220:0);if(tw>960){fs*=960/tw;x.font=`900 ${fs}px Titillium Web, Arial, sans-serif`;}
      const full=x.measureText(text).width+(logo?fs*1.25:0);let sx=512-full/2;
      if(logo){const cx=sx+fs*0.5,cy=128;x.fillStyle='#e8352b';
        for(let k=0;k<5;k++){const a=k/5*Math.PI*2-Math.PI/2;x.beginPath();x.ellipse(cx+Math.cos(a)*fs*0.22,cy+Math.sin(a)*fs*0.22,fs*0.2,fs*0.11,a,0,Math.PI*2);x.fill();}
        sx+=fs*1.25;}
      x.fillStyle=fg;x.textBaseline='middle';x.textAlign='left';x.lineWidth=wt*2;x.fillText(text,sx,136);},false);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,hgt),new THREE.MeshBasicMaterial({map:t,transparent:!bg,depthWrite:!!bg}));
    m.position.set(fe.mx+fe.nx*1.1,y,fe.mz+fe.nz*1.1);m.rotation.y=Math.atan2(fe.nx,fe.nz);return m;};
  // every Triple Street block's box centre, so each one can throw a bridge to its neighbour
  const tsC=[];
  D.b.forEach((b,bi)=>{if(b[2]!==6)return;const p=[];for(let k=3;k<b.length;k+=2)p.push(W2(b[k],b[k+1]));
    if(p.length<3)return;const o=oba(p);tsC.push([o.mx,o.mz,bi]);});
  let skipped=0,kept=0;
  D.b.forEach((b,bi)=>{let h=b[0];const kind=b[1],lm=b[2],pts=[];for(let k=3;k<b.length;k+=2)pts.push(W2(b[k],b[k+1]));if(pts.length<3)return;
    if(footprintHitsTrack(pts)){skipped++;return;}kept++;
    let ar=0;for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;ar+=pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1];}ar=Math.abs(ar/2);
    if(h<=0)h=kind===1?(ar>250?rand(60,100):rand(9,15)):kind===2?rand(40,70):ar>1500?rand(16,26):ar>300?rand(9,18):rand(4,8);
    const s=lm===6?4:lm===7?2:lm===1||lm===2||lm===8?1:lm===3?3:kind===1?0:kind===2?1:kind===3?2:3;
    let tint=TINT[s][(bi*7)%TINT[s].length];
    /* ---------------- Busan landmarks (codes 21–34, from the aerial photos and Kakao roadview) ---------------- */
    if(lm===21){ // BEXCO exhibition hall 1: a 26 m glass-and-metal box under three broad pale roof plates, the
      // green-glazed front onto the plaza carrying the BEXCO letters
      const hh=h||26,o=oba(pts);
      const r=ringWalls(pts,[[0,1],[hh,1]],1,0xc6d9dc);roofCap(r.top,hh,0xd9dee2);
      // the roof edge follows the real footprint (a bounding-box slab would reach over the circuit on this L-shaped plan)
      const eave=pts.map(p=>r_c(p,pts,1.025));
      if(!footprintHitsTrack(eave)){const e=ringWalls(eave,[[hh,1],[hh+1.8,1]],3,0xf1f3f4);roofCap(e.top,hh+1.8,0xe6e9ec);}
      // the two dark valleys between the three roof plates (only where the plan is the rectangular body)
      if(ar>0.8*(o.l1-o.l0)*(o.w1-o.w0)){const vg=new THREE.Group();extra.push(vg);
        for(const f of [-1/6,1/6]){const v=new THREE.Mesh(new THREE.BoxGeometry(5,1.2,(o.w1-o.w0)*0.9),mat({color:0x59626c,roughness:.6,metalness:.3}));
          v.position.set(o.mx+o.ux*(o.l1-o.l0)*f,hh+2.3,o.mz+o.uz*(o.l1-o.l0)*f);v.rotation.y=o.ang;vg.add(v);}}
      const fe=edgeFacing(pts,...W2(-590,447)); // the plaza, between the auditorium and the convention hall
      if(fe){const gl=new THREE.Mesh(new THREE.BoxGeometry(fe.len*0.86,hh*0.86,0.8),mat({color:0x6fbf96,metalness:.55,roughness:.12,envMap:skyEnv,envMapIntensity:1}));
        gl.position.set(fe.mx+fe.nx*0.6,hh*0.45,fe.mz+fe.nz*0.6);gl.rotation.y=Math.atan2(fe.nx,fe.nz);extra.push(gl);
        extra.push(signAt(fe,'BEXCO',hh*0.8,Math.min(46,fe.len*0.35),10,'#ffffff',null,1.4));}
      return;}
    if(lm===22){ // BEXCO exhibition hall 2: a long glass hall with a white roof that overhangs every side
      const hh=h||28;const r=ringWalls(pts,[[0,1],[hh,1]],1,0xd2e1ea);roofCap(r.top,hh,0xdfe3e6);
      const eave=pts.map(p=>r_c(p,pts,1.03));
      if(!footprintHitsTrack(eave)){const e=ringWalls(eave,[[hh,1],[hh+2,1]],3,0xf6f7f8);roofCap(e.top,hh+2,0xf0f2f3);}
      return;}
    if(lm===23){ // BEXCO convention hall: glass box with the orange band along the top
      const hh=h||22;const r=ringWalls(pts,[[0,1],[hh-3.5,1]],1,0xc3d4df);
      const b=ringWalls(pts,[[hh-3.5,1],[hh,1]],3,0xe0823a);roofCap(b.top,hh,0xc9ced3);return;}
    if(lm===26){ // BEXCO auditorium: an oval silver shell that swells out above a recessed glass base, its roof a
      // ring around an open-air garden in the middle
      const o=oba(pts),A=(o.l1-o.l0)/2,Bm=(o.w1-o.w0)/2,hh=h||28,n=56;
      const ell=f=>{const q=[];for(let k=0;k<n;k++){const t=k/n*Math.PI*2,u=Math.cos(t)*A*f,v=Math.sin(t)*Bm*f;q.push([o.mx+o.ux*u-o.uz*v,o.mz+o.uz*u+o.ux*v]);}return q;};
      ringWalls(ell(0.86),[[0,1],[7,1]],1,0x55636e); // glazed ground floor, set back under the shell
      ringWalls(ell(1),[[7,0.9],[12,0.97],[20,1],[hh,0.96]],1,0xdfe5ea);
      const inner=ell(0.56);ringWalls(inner,[[hh*0.55,1],[hh,1]],3,0xd0d5da);
      const ring=new THREE.Shape(ell(0.96).map(([x,z])=>new THREE.Vector2(x,-z)));ring.holes.push(new THREE.Path(inner.map(([x,z])=>new THREE.Vector2(x,-z))));
      roofCap(ring,hh,0xe8ecef);roofCap(inner,hh*0.55,0x6d8b58); // roof ring, garden
      return;}
    if(lm===24){ // Shinsegae Centum City, the world's largest department store: blank sandstone-clad masses (the big
      // one stepped back near the top), dark glass shopfronts at street level, frosted-glass fins proud of the corners
      const hh=h||25,big=hh>60;
      const r=ringWalls(pts,big?[[0,1],[hh*0.64,1],[hh*0.64,0.9],[hh,0.9]]:[[0,1],[hh,1]],5,0xffffff);roofCap(r.top,hh,0xb8ac96);
      if(big)roofCap(pts,hh*0.64,0xa99c84); // the terrace where the mass steps back
      ringWalls(pts.map(p=>r_c(p,pts,1.006)),[[0,1],[9,1]],1,0x3f4a54);
      const par=ringWalls(r.top.map(p=>r_c(p,r.top,1.004)),[[hh,1],[hh+1.4,1]],5,0xe9dfcc);roofCap(par.top,hh+1.4,0xb8ac96);
      // frosted fins at the three sharpest corners
      const turns=pts.map((c,i)=>{const p=pts[(i-1+pts.length)%pts.length],q=pts[(i+1)%pts.length];
        const a1=Math.atan2(c[1]-p[1],c[0]-p[0]),a2=Math.atan2(q[1]-c[1],q[0]-c[0]);return [Math.abs(wrapA(a2-a1)),i];}).sort((a,b)=>b[0]-a[0]).slice(0,3);
      for(const [,i] of turns){const c=pts[i],dx=c[0]-r.cx,dz=c[1]-r.cz,dl=Math.hypot(dx,dz)||1;
        const fin=new THREE.Mesh(new THREE.BoxGeometry(1.2,hh*(big?0.62:0.9),16),mat({color:0xe9f0f4,metalness:.2,roughness:.3,transparent:true,opacity:.78}));
        fin.position.set(c[0]+dx/dl*1.5,hh*(big?0.31:0.45),c[1]+dz/dl*1.5);fin.rotation.y=Math.atan2(dx,dz)+Math.PI/2;extra.push(fin);}
      if(big){const fe=edgeFacing(pts,...nearestTrack(r.cx,r.cz));if(fe)extra.push(signAt(fe,'SHINSEGAE',hh*0.5,Math.min(48,fe.len*0.4),9,'#3a2a20',null,1,true));}
      return;}
    if(lm===25){ // Busan Cinema Center's "double cone": the hourglass column that carries the Big Roof
      const o=oba(pts),R=Math.min(o.l1-o.l0,o.w1-o.w0)/2,top=32,prof=[];
      for(let k=0;k<=16;k++){const y=top*k/16,f=Math.abs(k/8-1);prof.push(new THREE.Vector2(R*(0.32+0.68*f*f),y));}
      const dc=new THREE.Mesh(new THREE.LatheGeometry(prof,32),mat({color:0xa6b6c3,metalness:.6,roughness:.2,envMap:skyEnv,envMapIntensity:1,side:THREE.DoubleSide}));
      dc.position.set(o.mx,0,o.mz);extra.push(dc);return;}
    if(lm>=31&&lm<=34){const o=oba(pts); // Marine City: the glass towers along the Suyeong Bay shore
      if(lm===31){ // Doosan We've the Zenith: floor plates that swell and pull in as the towers rise, dark blue glass
        // behind fine silver mullions, a lighter crown
        const rs=[];for(let k=0;k<=14;k++)rs.push([h*0.95*k/14,1-0.05*Math.sin(k/14*Math.PI*2.3)]);
        const r=ringWalls(pts,rs,1,0x7c95b4);roofCap(r.top,h*0.95,0x5b6c80);
        const cr=ringWalls(r.top,[[h*0.95,1],[h,0.95]],1,0xcad6e0);roofCap(cr.top,h,0x77889a);beacons.push([r.cx,h+1,r.cz]);return;}
      if(lm===32){ // I'Park Marina: sail-shaped blue glass towers whose curtain wall runs up past the roof in a raked crown
        const r=ringWalls(pts,[[0,1],[h*0.84,1],[h*0.9,0.95]],1,0x95bce6);roofCap(r.top,h*0.9,0x6c86a3);
        const Ls=(o.l1-o.l0)*0.92,th=h*0.1+10,sh=new THREE.Shape([new THREE.Vector2(-Ls/2,0),new THREE.Vector2(Ls/2,0),new THREE.Vector2(Ls/2,th)]);
        const g=new THREE.ExtrudeGeometry(sh,{depth:2.4,bevelEnabled:false});g.translate(0,0,-1.2);
        const fin=new THREE.Mesh(g,mat({color:0x9fc3ea,metalness:.65,roughness:.14,envMap:skyEnv,envMapIntensity:1.1}));
        fin.position.set(o.mx-o.uz*(o.w1-o.w0)*0.32,h*0.9,o.mz+o.ux*(o.w1-o.w0)*0.32);fin.rotation.y=o.ang;extra.push(fin);beacons.push([r.cx,h*0.9+th,r.cz]);return;}
      if(lm===33){ // Park Hyatt Busan: a glass prism that twists a quarter of the way round as it rises
        const rs=[];for(let k=0;k<=10;k++)rs.push([h*k/10,1-0.05*k/10,k/10*0.45]);const r=ringWalls(pts,rs,1,0xb4c8d8);roofCap(r.top,h,0x8094a6);return;}
      const t=[0x9cb3c9,0x8ea8c2,0xa9bccc,0x86a1bd][bi%4];
      const r=ringWalls(pts,[[0,1],[h*0.9,1],[h*0.9,0.94],[h,0.94]],1,t);roofCap(r.top,h,0x6b7c8d);if(h>100)beacons.push([r.cx,h+1,r.cz]);return;}
    if(lm===1){ // POSCO Tower-Songdo, ex Northeast Asia Trade Tower (305 m, KPF) — Oakwood Premier Incheon on floors 34–64.
      // The plan morphs from a trapezoid at the base to a triangle at the top, so the reflective blue-silver skin breaks
      // into long triangular facets whose edges converge and diverge up the tower. No spire: it ends in a flat-topped
      // triangular crown. Built as rings resampled to the same number of points, joined by flat-shaded triangles.
      const o=oba(pts),M=24,lerpRing=(ring,f)=>{ // ring resampled to M points evenly along its perimeter
        let per=0;const seg=ring.map((p,i)=>{const q=ring[(i+1)%ring.length],l=Math.hypot(q[0]-p[0],q[1]-p[1]);per+=l;return l;});
        const out=[];let i=0,acc=0;for(let k=0;k<M;k++){const d=(k/M+f)%1*per;while(acc+seg[i%ring.length]<d){acc+=seg[i%ring.length];i++;}
          const p=ring[i%ring.length],q=ring[(i+1)%ring.length],t=(d-acc)/(seg[i%ring.length]||1);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}return out;};
      // the base: the oriented box of the footprint narrowed at one end (trapezoid); the top: a triangle on its long side
      const L0=o.l0,L1=o.l1,W0=o.w0,W1=o.w1,P=(l,w)=>[o.cx+o.ux*l-o.uz*w,o.cz+o.uz*l+o.ux*w];
      const base=[P(L0,W0),P(L1,W0),P(L1-(L1-L0)*0.18,W1),P(L0+(L1-L0)*0.18,W1)];
      const tm=(L0+L1)/2,top=[P(tm-(L1-L0)*0.36,W0+(W1-W0)*0.08),P(tm+(L1-L0)*0.36,W0+(W1-W0)*0.08),P(tm,W1-(W1-W0)*0.12)];
      const rb=lerpRing(base,0),rt=lerpRing(top,0),LV=[0,0.18,0.4,0.62,0.82,0.97],ht=h*0.97;
      const rings=LV.map(f=>{const e=f*f*(3-2*f);return rb.map((p,k)=>[p[0]+(rt[k][0]-p[0])*e,p[1]+(rt[k][1]-p[1])*e,f*ht]);});
      const pos=[];for(let a=0;a<LV.length-1;a++)for(let k=0;k<M;k++){const A=rings[a][k],B=rings[a][(k+1)%M],C=rings[a+1][k],D=rings[a+1][(k+1)%M];
        // alternate the diagonal level by level: the facet edges zig-zag up the tower
        if((a+k)%2){pos.push(A[0],A[2],A[1],C[0],C[2],C[1],B[0],B[2],B[1],B[0],B[2],B[1],C[0],C[2],C[1],D[0],D[2],D[1]);}
        else{pos.push(A[0],A[2],A[1],D[0],D[2],D[1],B[0],B[2],B[1],A[0],A[2],A[1],C[0],C[2],C[1],D[0],D[2],D[1]);}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
      // floor lines in the glass (lit at night: hotel and residences above, offices below)
      const ftex=canvasTex(64,256,(x)=>{x.fillStyle='#000';x.fillRect(0,0,64,256);for(let j=0;j<64;j++)for(let i=0;i<8;i++)if(Math.random()<.5){x.fillStyle=`hsl(${200+Math.random()*30},45%,${55+Math.random()*25}%)`;x.fillRect(i*8+1,j*4+1,6,2);}},true);
      const uv=[];for(let q=0;q<pos.length;q+=3){const x=pos[q],y=pos[q+1],z=pos[q+2];uv.push(((x-o.cx)*o.ux+(z-o.cz)*o.uz+(x-o.cx)*-o.uz+(z-o.cz)*o.ux)/24,y/256);} // 8 bays × 64 floors of 4 m per tile
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      const tw=new THREE.Mesh(geo,mat({color:0x8fb0c8,metalness:.85,roughness:.12,envMap:DAY?skyEnv:envTex,envMapIntensity:DAY?1.2:1.3,flatShading:true,side:THREE.DoubleSide,
        emissiveMap:ftex,emissive:0xffffff,emissiveIntensity:DAY?0:.55}));tw.castShadow=true;extra.push(tw);
      // the crown: a slim triangular cap with a lit band under it
      const cr=rings[LV.length-1],sh=new THREE.Shape(cr.map(p=>new THREE.Vector2(p[0],-p[1])));
      const cap=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:6,bevelEnabled:false}).rotateX(-Math.PI/2),mat({color:0x5d7487,metalness:.7,roughness:.3}));cap.position.y=ht;extra.push(cap);
      const band=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:1.4,bevelEnabled:false}).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:DAY?0xdfe8ef:0xe8f4ff}));band.scale.set(1.0,1,1.0);band.position.y=ht-3;extra.push(band);
      let mx=0,mz=0;for(const p of cr){mx+=p[0];mz+=p[1];}beacons.push([mx/cr.length,ht+7,mz/cr.length]);return;}
    if(lm===2){ // G-Tower (146 m): green-teal glass, stepped crown with the lit observation floor
      const r=ringWalls(pts,[[0,1],[h*0.88,1],[h*0.94,0.86]],1,0x8fc4bd);roofCap(r.top,h*0.94,0x5f7b78);
      const o=oba(pts),sx=(o.l1-o.l0)*0.55,sz=(o.w1-o.w0)*0.55;
      const cap=new THREE.Mesh(new THREE.BoxGeometry(sx,10,sz),mat({color:0x4c7a74,metalness:.7,roughness:.22,envMap:envTex,envMapIntensity:1}));
      cap.position.set(r.cx,h*0.94+5,r.cz);cap.rotation.y=-Math.atan2(o.uz,o.ux);extra.push(cap);
      const band=new THREE.Mesh(new THREE.BoxGeometry(sx*1.06,1.6,sz*1.06),new THREE.MeshBasicMaterial({color:0xfff0cf}));
      band.position.set(r.cx,h*0.90,r.cz);band.rotation.y=cap.rotation.y;extra.push(band);
      beacons.push([r.cx,h*0.94+11,r.cz]);return;}
    if(lm===3){
      // the banded stone tower by the bridge: three stacked blocks, each turned slightly against the
      // one below, with the triangular glazed voids cut where they step past each other
      const o=oba(pts),n3=3,hb=h/n3;let base=0;
      for(let k=0;k<n3;k++){
        const rr=ringWalls(pts,[[base,1],[base+hb*0.97,1]],3,[0xdcd8cf,0xcfcbc2,0xe3dfd6][k]);
        if(k===n3-1)roofCap(rr.top,base+hb*0.97,0x8e9aa6);
        // the recessed glass wedge under each step
        const sx=(o.l1-o.l0)*0.62,sz=(o.w1-o.w0)*0.62;
        const vd=new THREE.Mesh(new THREE.BoxGeometry(sx,hb*0.26,sz),
          mat({color:0x2c4a58,metalness:.85,roughness:.1,envMap:envTex,envMapIntensity:1.2}));
        vd.position.set(o.mx+(k%2?1:-1)*sx*0.22,base+hb*0.16,o.mz);vd.rotation.set(0,o.ang,(k%2?1:-1)*0.11);
        extra.push(vd);base+=hb;}
      const lg=new THREE.Mesh(new THREE.BoxGeometry(Math.min(16,(o.l1-o.l0)*0.4),3.4,1.2),new THREE.MeshBasicMaterial({color:0x2fd07a}));
      lg.position.set(o.mx,h-7,o.mz+(o.w1-o.w0)*0.5);lg.rotation.y=o.ang;extra.push(lg);
      beacons.push([o.mx,h+1,o.mz]);return;}
    if(lm===4){ // Songdo Convensia (KPF): the halls sit under a row of curved silver roofs shaped like upturned boat hulls
      // (bow-truss shells, ends lifting like a bow and stern), and between each pair the roof folds up into a glazed
      // gable — from the street the alternating gables and hulls make the jagged mountain-range skyline. Every shell is
      // clipped to the real footprint, so nothing hangs out over open ground (the old bounding-box shells did).
      const o=oba(pts),len=o.l1-o.l0,hh=clamp(h||18,14,19);
      const r=ringWalls(pts,[[0,1],[hh,1]],1,0xb3c8d8);roofCap(r.top,hh,0x9fabb6);
      const ang=-Math.atan2(o.uz,o.ux),ax=o.ux,az=o.uz,cxw=-o.uz,czw=o.ux; // long axis, and across
      // the longest stretch of the line p + t·(across) that lies inside the footprint
      const inside=(px,pz)=>{const ts=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],ex=b[0]-a[0],ez=b[1]-a[1],den=cxw*ez-czw*ex;
          if(Math.abs(den)<1e-9)continue;const t=((a[0]-px)*ez-(a[1]-pz)*ex)/den,s=((a[0]-px)*czw-(a[1]-pz)*cxw)/den;if(s>=0&&s<=1)ts.push(t);}
        ts.sort((p,q)=>p-q);let best=null;for(let i=0;i+1<ts.length;i+=2)if(!best||ts[i+1]-ts[i]>best[1]-best[0])best=[ts[i],ts[i+1]];return best;};
      const nb=clamp(Math.round(len/40),2,7),bay=len/nb,hw=bay*0.39,rise=Math.min(bay*0.42,14);
      const bx=o.cx+ax*(o.l0+o.l1)/2,bz=o.cz+az*(o.l0+o.l1)/2; // the long axis through the box (across offset is per bay)
      const shellM=mat({color:0xe3e9ee,metalness:.82,roughness:.2,envMap:envTex,envMapIntensity:1.15,side:THREE.DoubleSide});
      const glassM=mat({color:0x9cc4dc,metalness:.6,roughness:.08,envMap:envTex,envMapIntensity:1.1,emissive:DAY?0:0x6a8fb0,emissiveIntensity:DAY?0:.55,transparent:true,opacity:.82,side:THREE.DoubleSide});
      const spans=[];
      for(let k=0;k<=2*nb;k++){const off=-len/2+bay*k/2,px=bx+ax*off-cxw*(o.w0+o.w1)/2*0,pz=bz+az*off;
        // probe across the building at this station (from the box's across-centre)
        const qx=px+cxw*(o.w0+o.w1)/2,qz=pz+czw*(o.w0+o.w1)/2,iv=inside(qx,qz);spans.push(iv&&iv[1]-iv[0]>16?[qx,qz,iv[0]+1.2,iv[1]-1.2]:null);}
      const hullY=(u,t)=>rise*Math.sqrt(Math.max(0,1-u*u))*(0.8+0.2*t*t);
      for(let k=0;k<nb;k++){const sp=spans[2*k+1];if(!sp)continue;const [qx,qz,t0,t1]=sp,sl=t1-t0;
        const g=new THREE.Group();g.rotation.y=ang;g.position.set(qx+cxw*(t0+t1)/2,hh,qz+czw*(t0+t1)/2);extra.push(g);
        const NU=14,NV=16,pos=[],ix=[];
        for(let a=0;a<=NU;a++){const u=-1+2*a/NU;for(let b=0;b<=NV;b++){const t=-1+2*b/NV;pos.push(u*hw,hullY(u,t),t*sl/2);}}
        for(let a=0;a<NU;a++)for(let b=0;b<NV;b++){const p=a*(NV+1)+b;ix.push(p,p+1,p+NV+1,p+1,p+NV+2,p+NV+1);}
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(ix);geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo,shellM));
        // the glazed ends under each hull's arch
        for(const t of [-1,1]){const sh=new THREE.Shape();sh.moveTo(-hw,0);for(let a=0;a<=NU;a++){const u=-1+2*a/NU;sh.lineTo(u*hw,hullY(u,t));}sh.lineTo(hw,0);
          const cap=new THREE.Mesh(new THREE.ShapeGeometry(sh),glassM);cap.position.z=t*sl/2;g.add(cap);}}
      // the glazed gables folded up between neighbouring hulls (and at both ends of the row)
      for(let k=0;k<=nb;k++){const sp=spans[2*k];if(!sp)continue;const [qx,qz,t0,t1]=sp,sl=t1-t0,gw=(bay-2*hw)/2+1.2,ga=rise*1.18;
        const g=new THREE.Group();g.rotation.y=ang;g.position.set(qx+cxw*(t0+t1)/2,hh,qz+czw*(t0+t1)/2);extra.push(g);
        const v=[-gw,0,-sl/2, gw,0,-sl/2, 0,ga,-sl/2, -gw,0,sl/2, gw,0,sl/2, 0,ga,sl/2];
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
        geo.setIndex([0,2,1, 3,4,5, 0,3,5, 0,5,2, 1,2,5, 1,5,4]);geo.computeVertexNormals();g.add(new THREE.Mesh(geo,glassM));
        const rid=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,sl),shellM);rid.position.y=ga;g.add(rid);}
      return;}
    if(lm===5){ // Tri-Bowl: three inverted bowls sitting in the pond
      const o=oba(pts);for(let k=0;k<3;k++){const a=k/3*Math.PI*2,rr=Math.min(14,Math.sqrt(ar)*0.25);
        const bw=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr*0.42,14,28,1,true),mWhite);bw.material.side=THREE.DoubleSide;bw.position.set(o.cx+Math.cos(a)*rr*0.9,7,o.cz+Math.sin(a)*rr*0.9);extra.push(bw);
        const lip=new THREE.Mesh(new THREE.TorusGeometry(rr,.35,6,32).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xbfe2ff}));lip.position.set(bw.position.x,14,bw.position.z);extra.push(lip);}
      return;}
    // Triple Street is white panel and glass; the Hyundai outlet is warm sandstone
    if(lm===6)tint=[0xf2f0ec,0xfbfaf8,0xe6e3dd,0xf6f4f0][bi%4];
    if(lm===7)tint=0xe6d9bf;
    // ordinary buildings get individual massing: a podium, a setback tower, or a plain block
    const style=(bi*13+Math.round(h))%5,rc=new THREE.Color(tint).multiplyScalar(0.5).getHex();
    let r;
    const podPts=pts.map(p=>r_c(p,pts,1.16));
    if(h>70&&style<2&&!footprintHitsTrack(podPts)){ // tower on a wider podium (common in Songdo) — only where the wider base stays clear of the circuit
      const pod=Math.min(h*0.13,16);
      const pr=ringWalls(podPts,[[0,1],[pod,1]],s===1?3:s,new THREE.Color(tint).multiplyScalar(0.92).getHex());
      roofCap(pr.top,pod,rc);
      r=ringWalls(pts,[[0,1],[h*0.82,1],[h,0.9]],s,tint);roofCap(r.top,h,rc);}
    else if(h>70&&style===2){r=ringWalls(pts,[[0,1],[h*0.55,1],[h*0.56,0.9],[h,0.9]],s,tint);roofCap(r.top,h,rc);} // stepped setback
    else {r=ringWalls(pts,[[0,1],[h,1]],s,tint);roofCap(r.top,h,rc);}
    const out=f=>pts.map(p=>[r.cx+(p[0]-r.cx)*f,r.cz+(p[1]-r.cz)*f]);
    if((lm===6||lm===7)&&!footprintHitsTrack(out(1.035))){
      // street level: a lit canopy over the shopfronts, then the signage that covers both malls —
      // Triple Street's orange/red letter boxes, the outlet's long backlit fascia
      const o=oba(pts),sign=lm===7?0x3c4450:[0xe2481f,0xf0901c,0x1f74c8,0xe8e4dc][bi%4];
      const sg=ringWalls(out(1.008),[[h-3.4,1],[h-1.0,1]],2,sign);roofCap(sg.top,h-1.0,sign);
      const cn=ringWalls(out(1.035),[[4.6,1],[5.3,1]],2,lm===7?0xd8ccb4:0x2c3036);roofCap(cn.top,5.3,0xb9b3a6);
      const glow=new THREE.Mesh(new THREE.BoxGeometry((o.l1-o.l0)*1.0,0.5,(o.w1-o.w0)*1.02),
        new THREE.MeshBasicMaterial({color:lm===7?0xffe2b0:0xffcf8a}));
      glow.position.set(o.mx,4.5,o.mz);glow.rotation.y=o.ang;extra.push(glow);
      if(lm===6){ // Triple Street (Kakao roadview, 2026): every floor is wrapped by a white slab with rounded corners that
        // sticks out as a terrace with white railings, carried on fat round concrete columns; the glass shopfronts sit
        // back underneath. Each block has its own colour concept (A pink, B yellow, C green, D sky blue).
        const acc=[0xff7fb0,0xffd23f,0x5cc46a,0x6cc4ff][bi%4],slab=0xf4f4f1,ter=out(1.10);
        for(let y=5.4;y<h-1;y+=5.2){const sl=ringWalls(ter,[[y-0.55,1],[y,1]],2,slab);roofCap(sl.top,y,0xd9d7d0);
          const rl=ringWalls(ter,[[y+1.0,1],[y+1.15,1]],2,0xffffff);roofCap(rl.top,y+1.15,0xffffff);
          const gl=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(ter.map(p=>new THREE.Vector2(p[0],-p[1])))).rotateX(-Math.PI/2),mat({color:slab,roughness:.6,side:THREE.DoubleSide}));
          gl.position.y=y-0.55;extra.push(gl);} // the slab's white underside, seen from the street
        // round columns under the terraces, every ~9 m along the long sides
        const oc=oba(ter),cl=oc.l1-oc.l0;for(const sd of [-1,1])for(let q=4;q<cl-3;q+=9){const l=oc.l0+q,w=sd<0?oc.w0+0.9:oc.w1-0.9;
          const col=new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.75,5.2,14),mat({color:0xcfccc4,roughness:.85}));
          col.position.set(oc.cx+oc.ux*l-oc.uz*w,2.6,oc.cz+oc.uz*l+oc.ux*w);extra.push(col);}
        // the block's colour concept on its corner signage band
        const ab=ringWalls(out(1.012),[[h-3.2,1],[h-1.2,1]],2,acc);roofCap(ab.top,h-1.2,acc);}
      if(lm===6&&h>11){ // the big back-lit graphic panels facing the street
        for(const sd of [-1,1]){const bw=Math.min((o.l1-o.l0)*0.44,26);
          const bb=new THREE.Mesh(new THREE.BoxGeometry(bw,Math.min(h*0.42,9),0.6),
            new THREE.MeshBasicMaterial({color:[0xff6a2b,0xffd24a,0x35a7ff,0xff3d6e][(bi+(sd>0?1:0))%4]}));
          bb.position.set(o.mx-o.uz*sd*((o.w1-o.w0)*0.5+0.4),h*0.58,o.mz+o.ux*sd*((o.w1-o.w0)*0.5+0.4));
          bb.rotation.y=o.ang;extra.push(bb);}}
      if(lm===6){
        // Triple Street's roof is its whole point: a planted deck with round pavilions on it, and
        // bridges hopping over the streets from block to block (the aerial photo)
        const deck=new THREE.Mesh(new THREE.BoxGeometry((o.l1-o.l0)*0.82,0.5,(o.w1-o.w0)*0.72),
          mat({color:0x3f6b34,roughness:1}));
        deck.position.set(o.mx,h+0.5,o.mz);deck.rotation.y=o.ang;extra.push(deck);
        const dr=Math.min((o.w1-o.w0)*0.3,11);
        if(dr>4){const drum=new THREE.Mesh(new THREE.CylinderGeometry(dr,dr*0.92,4.6,26),
            mat({color:0x9aa2ab,metalness:.5,roughness:.35,envMap:envTex,envMapIntensity:.6}));
          drum.position.set(o.mx+o.ux*(o.l1-o.l0)*0.22,h+3,o.mz+o.uz*(o.l1-o.l0)*0.22);extra.push(drum);
          const gl=new THREE.Mesh(new THREE.CylinderGeometry(dr*0.97,dr*0.97,1.5,26),new THREE.MeshBasicMaterial({color:0xffdca4}));
          gl.position.set(drum.position.x,h+1.4,drum.position.z);extra.push(gl);}
        // one bridge from this block to its nearest neighbour, built once per pair
        let best=null,bd=1e9;
        for(const t of tsC){if(t[2]<=bi)continue;const d2=Math.hypot(t[0]-o.mx,t[1]-o.mz);
          if(d2>=26&&d2<=78&&d2<bd){bd=d2;best=t;}}
        // the bridges over the street are wide two-level white decks: a walkway at the first terrace (~5.4 m) and a roof
        // slab ~5 m above it on slim white columns, white railings and strings of lights in between (roadview)
        for(const [ox,oz] of best?[best]:[]){const dx=ox-o.mx,dz=oz-o.mz,dd=Math.hypot(dx,dz),ry=-Math.atan2(dz,dx),cx=o.mx+dx/2,cz=o.mz+dz/2;
          let over=false;for(let q=0;q<=10;q++)if(blocked(o.mx+dx*q/10,o.mz+dz*q/10,-2))over=true;if(over)continue; // never across the circuit
          const white=mat({color:0xf3f2ee,roughness:.6}),B=(sx,sy,sz,y,lz=0,m=white)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),m);
            b.position.set(cx-Math.sin(ry)*lz,y,cz-Math.cos(ry)*lz);b.rotation.y=ry;extra.push(b);return b;};
          B(dd,0.9,10,5.0);B(dd,0.7,11,10.6); // walkway deck, roof slab
          for(const s of [-1,1]){B(dd,0.12,0.12,6.5,s*4.9);B(dd,1.0,0.05,6.0,s*4.9,mat({color:0xdfe6ea,roughness:.2,transparent:true,opacity:.35}));
            for(let q=-dd/2+3;q<dd/2-2;q+=6){const c=new THREE.Mesh(new THREE.BoxGeometry(0.35,5.2,0.35),white);
              c.position.set(cx+Math.cos(ry)*q-Math.sin(ry)*s*4.8,7.9,cz-Math.sin(ry)*q-Math.cos(ry)*s*4.8);c.rotation.y=ry;extra.push(c);}}
          B(dd*0.96,0.08,0.08,9.9,0,new THREE.MeshBasicMaterial({color:0xffd9a0}));}
      }
    }
    else if(h<60&&lm!==6&&lm!==7){const p=ringWalls(out(1.008),[[h,1],[h+1.1,1]],3,new THREE.Color(tint).multiplyScalar(0.8).getHex());roofCap(p.top,h+1.1,rc);} // roof parapet
    if(!DAY&&h>78&&(bi*7+Math.round(h))%5<3){
      // the LED crown band the Songdo towers light up at dusk
      const o=oba(pts),cc=CROWN[(bi*3+Math.round(h))%CROWN.length];
      const bd=new THREE.Mesh(new THREE.BoxGeometry((o.l1-o.l0)*0.94,2.0,(o.w1-o.w0)*0.94+0.6),new THREE.MeshBasicMaterial({color:cc}));
      bd.position.set(o.mx,h-4.5,o.mz);bd.rotation.y=o.ang;extra.push(bd);
      const bd2=new THREE.Mesh(new THREE.BoxGeometry((o.l1-o.l0)*0.94+0.6,2.0,(o.w1-o.w0)*0.94),new THREE.MeshBasicMaterial({color:cc}));
      bd2.position.set(o.mx,h-4.5,o.mz);bd2.rotation.y=o.ang;extra.push(bd2);}
    if(h>100)beacons.push([r.cx,h+1,r.cz]);
    if(h<45&&ar>600){for(let q=0;q<2;q++){const bx=new THREE.Mesh(new THREE.BoxGeometry(rand(3,7),rand(1.5,3),rand(3,6)),mat({color:0x4a4e57,roughness:.9}));
      bx.position.set(r.cx+rand(-6,6),h+1.2,r.cz+rand(-6,6));bx.rotation.y=rand(0,3);extra.push(bx);}} // rooftop plant
  });
  // ---- what passes OVER the circuit (it only ever runs on the street below) ----
  // Elevated expressways — Gwangan-daero and the Jangsan-ro / Haeundae-ro viaducts, which cross the lap four times
  // (twice at BEXCO, twice by the Suyeong river mouth): a deck with concrete parapets, the green-and-yellow noise
  // walls seen from roadview, round piers that are never planted on the track. The double-deck sea bridge sits higher.
  if(D.br){const deckM=mat({color:0xb9bec4,roughness:.8}),pierM=mat({color:0x9ea4aa,roughness:.85}),railM=mat({color:0xd9dcdf,roughness:.7}),
      noiseM=mat({color:0x9cc3a8,roughness:.4,metalness:.1}),noiseTopM=mat({color:0xd9c45c,roughness:.5});
    for(const e of D.br){const w=e[0],lay=e[1],pts=[];let sea=false;for(let k=3;k<e.length;k+=2){pts.push(W2(e[k],e[k+1]));if(e[k+1]<-1300)sea=true;}
      const y=e[2]&&sea?16+lay*8:5+lay*4.5;
      for(let k=1;k<pts.length;k++){const [ax,az]=pts[k-1],[bx,bz]=pts[k],dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz);if(l<1)continue;
        const seg=new THREE.Group();seg.position.set((ax+bx)/2,y,(az+bz)/2);seg.rotation.y=-Math.atan2(dz,dx);overhead.push(seg);
        seg.add(new THREE.Mesh(new THREE.BoxGeometry(l+0.6,2.2,w),deckM));
        for(const sd of [-1,1]){const rl=new THREE.Mesh(new THREE.BoxGeometry(l+0.6,1.1,0.5),railM);rl.position.set(0,1.6,sd*(w/2-0.25));seg.add(rl);
          if(!sea){const nw=new THREE.Mesh(new THREE.BoxGeometry(l+0.6,2.6,0.2),noiseM);nw.position.set(0,3.4,sd*(w/2-0.2));seg.add(nw);
            const nt=new THREE.Mesh(new THREE.BoxGeometry(l+0.6,0.7,0.24),noiseTopM);nt.position.set(0,4.9,sd*(w/2-0.2));seg.add(nt);}}
        for(let s=0;s<l;s+=36){const t=s/l,px=ax+dx*t,pz=az+dz*t;if(blocked(px,pz,2))continue;
          const p=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.5,y-1.1,10),pierM);p.position.set(px,(y-1.1)/2,pz);extra.push(p);}}}}
  // enclosed sky bridges: BEXCO's glass link from hall 2 over the road to hall 1 (white roof), and Shinsegae's
  // 3rd-floor bridge from the main store over the street to its annex — both span the circuit
  if(D.bb)for(const e of D.bb){const lo=Math.max(7.5,e[0]),hi=Math.max(lo+4,e[1]),bex=e[2]===1,pts=[];for(let k=3;k<e.length;k+=2)pts.push(W2(e[k],e[k+1]));
    const r=ringWalls(pts,[[lo,1],[hi,1]],1,bex?0xd6e6ee:0xbfc8cf);roofCap(r.top,lo,0x8d959d);
    const rim=ringWalls(pts.map(p=>r_c(p,pts,1.02)),[[hi,1],[hi+1,1]],bex?3:5,bex?0xf4f5f6:0xe6dccb);roofCap(rim.top,hi+1,bex?0xf2f3f4:0xd8cdb8);}
  // pedestrian overpasses (Haeundae-ro): a deck at 6.5 m with railings, a stair tower at each end
  if(D.fb){const fM=mat({color:0xc9cdd1,roughness:.7}),rM=mat({color:0x7c8792,roughness:.5,metalness:.5});
    for(const e of D.fb){const pts=[];for(let k=0;k<e.length;k+=2)pts.push(W2(e[k],e[k+1]));
      for(let k=1;k<pts.length;k++){const [ax,az]=pts[k-1],[bx,bz]=pts[k],dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz);if(l<1)continue;
        const seg=new THREE.Group();seg.position.set((ax+bx)/2,6.5,(az+bz)/2);seg.rotation.y=-Math.atan2(dz,dx);overhead.push(seg);
        seg.add(new THREE.Mesh(new THREE.BoxGeometry(l+0.4,0.9,3.6),fM));
        for(const sd of [-1,1]){const rl=new THREE.Mesh(new THREE.BoxGeometry(l+0.4,1.2,0.12),rM);rl.position.set(0,1.05,sd*1.75);seg.add(rl);}}
      for(const [x,z] of [pts[0],pts[pts.length-1]])if(!blocked(x,z,1)){const st=new THREE.Mesh(new THREE.BoxGeometry(4.5,7.4,6),fM);st.position.set(x,3.7,z);extra.push(st);}}}
  // the Busan Cinema Center's roofs: the 140 × 167 m Big Roof on its double cone, and the Small Roof
  if(D.rf)for(const e of D.rf){const [lo,th,big]=e,sh=[];for(let k=3;k<e.length;k+=2){const [x,z]=W2(e[k],e[k+1]);sh.push(new THREE.Vector2(x,-z));}
    const g=new THREE.ExtrudeGeometry(new THREE.Shape(sh),{depth:th,bevelEnabled:false}).rotateX(-Math.PI/2);
    const m=new THREE.Mesh(g,[mat({color:big?0xdfe3e7:0xe6e9ec,metalness:.45,roughness:.3,envMap:envTex,envMapIntensity:.7}),mat({color:0x8c959e,roughness:.5,metalness:.3})]);
    m.position.y=lo;extra.push(m);}
  // Split the merged city into ~600 m tiles: one giant mesh can never be frustum-culled, so the GPU used to
  // transform every building on the map on every frame (and again for every extra pass such as the mirror).
  // (Tiles were 300 m; at that size draw-call submission on the CPU cost more than the GPU saved by culling.)
  const CHUNK=600,chunked=(P,U,C)=>{const m=new Map();
    for(let t=0;t<P.length;t+=9){const k=Math.floor((P[t]+P[t+3]+P[t+6])/3/CHUNK)+','+Math.floor((P[t+2]+P[t+5]+P[t+8])/3/CHUNK);
      let e=m.get(k);if(!e){e={p:[],u:[],c:[]};m.set(k,e);}
      for(let v=0;v<3;v++){e.p.push(P[t+v*3],P[t+v*3+1],P[t+v*3+2]);e.c.push(C[t+v*3],C[t+v*3+1],C[t+v*3+2]);if(U)e.u.push(U[(t/3+v)*2],U[(t/3+v)*2+1]);}}
    return m;};
  const chunkMeshes=(P,U,C,material)=>{for(const e of chunked(P,U,C).values()){const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(e.p,3));if(U)g.setAttribute('uv',new THREE.Float32BufferAttribute(e.u,2));g.setAttribute('color',new THREE.Float32BufferAttribute(e.c,3));
      g.computeVertexNormals();g.computeBoundingSphere();scene.add(new THREE.Mesh(g,material));}};
  for(let s=0;s<6;s++){const B=WB_[s];if(!B.p.length)continue;chunkMeshes(B.p,B.u,B.c,facade(s));}
  if(ROOF.p.length)chunkMeshes(ROOF.p,null,ROOF.c,mat({vertexColors:true,roughness:.9,side:THREE.DoubleSide}));
  // Nothing decorative may hang over the circuit. Roofs, signage bands, LED crowns and billboards are
  // all sized from a building's bounding box, and on an L-shaped plan that box reaches well past the
  // walls of the building itself — which is how Convensia's roof and a couple of mall signs ended up
  // stretched across the track. Measure what each piece actually occupies and throw away any that
  // overlaps the circuit, whatever produced it.
  {let dropped=0;const bb=new THREE.Box3();
   for(let k=extra.length-1;k>=0;k--){const m=extra[k];m.updateMatrixWorld(true);bb.setFromObject(m);
     if(!isFinite(bb.min.x)||!isFinite(bb.min.z)){extra.splice(k,1);dropped++;continue;}
     const nx=Math.min(9,Math.max(2,Math.ceil((bb.max.x-bb.min.x)/8))),nz=Math.min(9,Math.max(2,Math.ceil((bb.max.z-bb.min.z)/8)));
     let hit=false;
     for(let a=0;a<=nx&&!hit;a++)for(let b=0;b<=nz&&!hit;b++)
       if(blocked(bb.min.x+(bb.max.x-bb.min.x)*a/nx,bb.min.z+(bb.max.z-bb.min.z)*b/nz,-2.5))hit=true;
     if(hit){extra.splice(k,1);dropped++;}}
   if(dropped)console.info('scenery:',dropped,'decorations dropped for overhanging the circuit');}
  for(const o of overhead){o.userData.overhead=true;extra.push(o);}
  // The decorations used to be ~450 separate meshes, nearly every one with its own material (≈1000 draw calls in view
  // on this circuit). Materials that differ only in colour are folded together (colour → vertex colour), and the pieces
  // are merged per tile like the buildings, so each tile costs a handful of draw calls. Transparent pieces
  // (bridge glass) stay separate so they keep sorting correctly.
  {const shared=new Map(),groups=new Map(),col=new THREE.Color();
   const keyOf=m=>m.isMeshBasicMaterial?'B'+m.side:m.isMeshStandardMaterial?['S',m.side,m.metalness.toFixed(2),m.roughness.toFixed(2),m.envMap?m.envMap.uuid+m.envMapIntensity.toFixed(2):'-'].join('|'):null;
   const sharedFor=(k,m)=>{let s=shared.get(k);if(!s){s=m.isMeshBasicMaterial?new THREE.MeshBasicMaterial({vertexColors:true,side:m.side})
       :mat({vertexColors:true,side:m.side,metalness:m.metalness,roughness:m.roughness,envMap:m.envMap,envMapIntensity:m.envMapIntensity});shared.set(k,s);}return s;};
   for(const root of extra){root.updateMatrixWorld(true);const cast=!!root.userData.overhead;root.traverse(o=>{if(!o.isMesh)return;const m=o.material,k0=keyOf(m),k=k0&&(cast?k0+'|cast':k0);
     if(!k||m.transparent||m.map||m.emissiveMap){const c=o.clone();o.getWorldPosition(c.position);o.getWorldQuaternion(c.quaternion);o.getWorldScale(c.scale);c.castShadow=cast&&!m.transparent;scene.add(c);return;}
     let g=indexed(o.geometry.clone());g.applyMatrix4(o.matrixWorld);
     for(const a of Object.keys(g.attributes))if(a!=='position'&&a!=='normal')g.deleteAttribute(a);
     if(!g.attributes.normal)g.computeVertexNormals();
     vColor(g,col.copy(m.color));
     const wp=o.getWorldPosition(_v3),tk=k+'#'+Math.floor(wp.x/CHUNK)+','+Math.floor(wp.z/CHUNK);
     let e=groups.get(tk);if(!e)groups.set(tk,e={m:sharedFor(k0,m),geos:[],cast});e.geos.push(g);});}
   for(const e of groups.values()){const me=new THREE.Mesh(mergeGeometries(e.geos),e.m);me.geometry.computeBoundingSphere();me.castShadow=e.cast;me.receiveShadow=e.cast;scene.add(me);}}
  {const im=new THREE.InstancedMesh(new THREE.SphereGeometry(.8,6,4),new THREE.MeshBasicMaterial({color:0xff2020}),beacons.length);const m4=new THREE.Matrix4();
   beacons.forEach(([x,y,z],k)=>{m4.makeTranslation(x,y,z);im.setMatrixAt(k,m4);});addTiled(im);} // aviation warning lights
  console.info('OSM scenery:',kept,'buildings,',skipped,'skipped (inside the circuit walls),',lampPos.length,'street lamps');
}

async function buildCity(){
  const wpoly=(TR.water||[]).map(p=>[p[0]*SC,-p[1]*SC]);
  const inP=(poly,x,z)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}return c;};
  // OSM water (Busan's sea and river) keeps the filler skyline out of the bay too
  const owater=TRACK_ID==='busan'?OSM.w.map(p=>{const o=[];for(let k=0;k<p.length;k+=2)o.push([p[k]*SC,-p[k+1]*SC]);return o;}):[];
  const hillsW=(TR.hills||[]).map(([x,y,h,r])=>[x*SC,-y*SC,h,r*SC]);
  const inPoly=(x,z)=>{if(inP(wpoly,x,z))return true;for(const p of owater)if(inP(p,x,z))return true;
    for(const [hx,hz,,hr] of hillsW)if(Math.hypot(x-hx,z-hz)<hr*0.8)return true;
    for(const [px,py,r] of TR.ponds||[])if(Math.hypot(x-px*SC,z+py*SC)<r*SC+25)return true;return false;};
  const cell=50,hash=new Map();for(let i=0;i<N;i+=3){const k=Math.floor(X[i]/cell)+','+Math.floor(Z[i]/cell);if(!hash.has(k))hash.set(k,[]);hash.get(k).push(i);}
  const near=(x,z,r)=>{const cx=Math.floor(x/cell),cz=Math.floor(z/cell);let m=1e9;for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++){const l=hash.get((cx+a)+','+(cz+b));if(l)for(const i of l){const d=Math.hypot(X[i]-x,Z[i]-z);if(d<m)m=d;}}return m<r;};
  const land=TRACK_ID==='singapore'?[[rw(90,720),110],[rw(-520,530),60],[rw(-455,510),60],[rw(-640,-340),200],[rw(40,150),60]]:[[rw(164,781),70]];
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;for(let i=0;i<N;i++){minX=Math.min(minX,X[i]);maxX=Math.max(maxX,X[i]);minZ=Math.min(minZ,Z[i]);maxZ=Math.max(maxZ,Z[i]);}
  // Songdo already has ~1100 real buildings from OpenStreetMap around the circuit. The generic boxes
  // must not be dropped on top of them or anywhere you can see one up close — they only fill in the
  // far skyline beyond the mapped area, which is why the reach is much wider here.
  let osmBox=null,pad=600;
  if(TR.osm){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    for(const b of OSM.b)for(let k=3;k<b.length;k+=2){x0=Math.min(x0,b[k]);x1=Math.max(x1,b[k]);y0=Math.min(y0,b[k+1]);y1=Math.max(y1,b[k+1]);}
    const a=rw(x0,y0),b2=rw(x1,y1);
    osmBox=[Math.min(a[0],b2[0]),Math.max(a[0],b2[0]),Math.min(a[1],b2[1]),Math.max(a[1],b2[1])];pad=2800;}
  const list=[];
  for(let x=minX-pad;x<maxX+pad;x+=58)for(let z=minZ-pad;z<maxZ+pad+100;z+=58){const px=x+rand(-14,14),pz=z+rand(-14,14);
    if(osmBox&&px>osmBox[0]-30&&px<osmBox[1]+30&&pz>osmBox[2]-30&&pz<osmBox[3]+30)continue;
    if(near(px,pz,52)||inPoly(px,pz)||land.some(([p,r])=>Math.hypot(px-p[0],pz-p[1])<r))continue;
    // Busan's outer districts: rows of 25–45 storey apartment towers, lower blocks in between
    const tall=TR.tall(px/SC,-pz/SC);const h=TRACK_ID==='busan'?(Math.random()<.55?rand(60,135):rand(12,40))
      :tall?rand(TRACK_ID==='songdo'?35:60,TRACK_ID==='songdo'?190:240):rand(14,110);list.push([px,pz,rand(20,42),h,rand(20,42)]);}
  // by day the filler blocks are pale concrete with dark glazing instead of lit windows on black
  const dayTex=warm=>{const t=canvasTex(64,128,(x)=>{x.fillStyle=warm?'#d9d4c9':'#c9cfd5';x.fillRect(0,0,64,128);
      for(let j=0;j<32;j++){x.fillStyle=warm?'#5d646c':'#4b5866';x.fillRect(2,j*4+1,60,2);}},true);t.repeat.set(2,6);return t;};
  const mats=DAY?[mat({color:0xffffff,map:dayTex(true),roughness:.85}),mat({color:0xffffff,map:dayTex(false),roughness:.7,metalness:.1})]
    :[mat({color:0x0d111b,roughness:.8,emissive:0xffffff,emissiveMap:winTex(true),emissiveIntensity:.85}),mat({color:0x0d111b,roughness:.8,emissive:0xffffff,emissiveMap:winTex(false),emissiveIntensity:.85})];
  const geo=new THREE.BoxGeometry(1,1,1).translate(0,.5,0);
  mats.forEach((m,mi)=>{const part=list.filter((_,k)=>k%2===mi);const im=new THREE.InstancedMesh(geo,m,part.length);const m4=new THREE.Matrix4();
    part.forEach((b,k)=>{m4.makeScale(b[2],b[3],b[4]);m4.setPosition(b[0],0,b[1]);im.setMatrixAt(k,m4);});addTiledT(1600,0,im);});
  if(TRACK_ID==='songdo')return; // Central Park's towers come from the OSM footprints, not a stand-in
  if(TRACK_ID==='busan'){buildBusanLandmarks();return;}
  // Marina Bay Sands
  const [mx,mz]=rw(-640,-340);const mbs=new THREE.Group();mbs.position.set(mx,0,mz);mbs.rotation.y=0.25;scene.add(mbs);
  const tm=mat({color:0x151a26,roughness:.5,metalness:.3,emissive:0xffffff,emissiveMap:winTex(true),emissiveIntensity:.9});
  for(const o of [-105,0,105]){const t=new THREE.Mesh(new THREE.BoxGeometry(38,195,24),tm);t.position.set(o,97.5,0);mbs.add(t);}
  const park=new THREE.Mesh(new THREE.BoxGeometry(340,7,38),mat({color:0x1b2233,roughness:.6}));park.position.set(20,198,0);mbs.add(park);
  const parkL=new THREE.Mesh(new THREE.BoxGeometry(342,1,40),new THREE.MeshBasicMaterial({color:0x7fd0ff}));parkL.position.set(20,194.3,0);mbs.add(parkL);
  // Singapore Flyer
  const [fx,fz]=rw(90,720);const fly=new THREE.Group();fly.position.set(fx,0,fz);fly.rotation.y=0.9;scene.add(fly);
  const fm=new THREE.MeshBasicMaterial({color:0x9fe3ff}),FLY_SP=new THREE.MeshBasicMaterial({color:0x4b7aa0}),FLY_CAP=new THREE.MeshBasicMaterial({color:0xfff1c0});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(75,1.1,8,120),fm);ring.position.y=90;fly.add(ring);
  for(let k=0;k<16;k++){const sp=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,75,4),FLY_SP);const a=k/16*Math.PI*2;sp.position.set(Math.cos(a)*37.5,90+Math.sin(a)*37.5,0);sp.rotation.z=a-Math.PI/2;fly.add(sp);}
  for(let k=0;k<28;k++){const a=k/28*Math.PI*2;const cap=new THREE.Mesh(new THREE.SphereGeometry(2.2,10,8),FLY_CAP);cap.position.set(Math.cos(a)*77,90+Math.sin(a)*77,0);fly.add(cap);}
  for(const s of [-1,1]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.8,95,8),mat({color:0x5a6275}));leg.position.set(s*22,45,0);leg.rotation.z=s*0.24;fly.add(leg);}
  bakeGroup(fly);
  // Esplanade domes
  const dm=mat({color:0x8e939c,roughness:.5,metalness:.4,emissive:0x302a20,emissiveIntensity:.6});
  for(const [rx,ry] of [[-520,530],[-455,510]]){const [x,z]=rw(rx,ry);const d=new THREE.Mesh(new THREE.SphereGeometry(34,28,14,0,Math.PI*2,0,Math.PI/2),dm);d.scale.set(1.25,.7,1);d.position.set(x,0,z);scene.add(d);}
}

/* ---- Busan: what the OpenStreetMap download does not reach, but every lap looks at ---- */
function buildBusanLandmarks(){
  // Haeundae LCT: the 411 m landmark tower between two 339 m residential towers, blue-silver glass with
  // rounded corners, the tall one with a slanted crown
  if(TR.lct){const [lx,lz]=rw(...TR.lct),g=new THREE.Group();g.position.set(lx,0,lz);g.rotation.y=0.55;scene.add(g);
    const glass=mat({color:0x9db8cf,metalness:.6,roughness:.18,envMap:skyEnv,envMapIntensity:1.1});
    const band=mat({color:0xe8eef3,metalness:.3,roughness:.4});
    for(const [off,h,r] of [[-95,339,22],[0,411,27],[92,339,22]]){
      const t=new THREE.Mesh(new THREE.CylinderGeometry(r*0.86,r,h,24,1),glass);t.scale.z=0.62;t.position.set(off,h/2,0);g.add(t);
      for(let y=60;y<h-10;y+=60){const b=new THREE.Mesh(new THREE.CylinderGeometry(r*0.95,r*0.95,2,24),band);b.scale.z=0.62;b.position.set(off,y,0);g.add(b);}
      const crown=new THREE.Mesh(new THREE.CylinderGeometry(r*0.2,r*0.84,h>400?28:14,24),glass);crown.scale.z=0.62;crown.position.set(off,h+(h>400?14:7),0);g.add(crown);}
    const podium=new THREE.Mesh(new THREE.BoxGeometry(260,26,70),mat({color:0xd6d9db,roughness:.7}));podium.position.y=13;g.add(podium);
    bakeGroup(g);}
  // Gwangan Bridge: the suspension span across Suyeong Bay — two portal towers, main cables and hangers
  // (the decks themselves come from OpenStreetMap)
  if(TR.gwangan){const [[ax,ay],[bx,by]]=TR.gwangan,[x0,z0]=rw(ax,ay),[x1,z1]=rw(bx,by);
    const dx=x1-x0,dz=z1-z0,span=Math.hypot(dx,dz),ux=dx/span,uz=dz/span,nx=-uz,nz=ux,deck=32,top=116,side=340;
    const g=new THREE.Group();scene.add(g);const steel=mat({color:0xdfe4e8,metalness:.5,roughness:.35}),cab=mat({color:0xc9cfd5,metalness:.6,roughness:.4});
    const tower=(x,z)=>{for(const s of [-1,1]){const leg=new THREE.Mesh(new THREE.BoxGeometry(4,top,5),steel);leg.position.set(x+nx*s*14,top/2,z+nz*s*14);leg.rotation.y=-Math.atan2(uz,ux);g.add(leg);}
      for(const y of [deck+10,top-14,top-2]){const bm=new THREE.Mesh(new THREE.BoxGeometry(3,3,32),steel);bm.position.set(x,y,z);bm.rotation.y=-Math.atan2(uz,ux);g.add(bm);}};
    tower(x0,z0);tower(x1,z1);
    for(const s of [-1,1]){const pts=[];
      // side span down to the anchorage, the main span sagging between the towers, side span again
      for(let k=0;k<=8;k++){const t=k/8;pts.push(new THREE.Vector3(x0-ux*side*(1-t),deck+4+(top-deck-6)*t*t,z0-uz*side*(1-t)));}
      for(let k=1;k<=24;k++){const t=k/24,sag=4*t*(1-t);pts.push(new THREE.Vector3(x0+dx*t,top-2-(top-deck-8)*sag,z0+dz*t));}
      for(let k=1;k<=8;k++){const t=k/8;pts.push(new THREE.Vector3(x1+ux*side*t,top-2-(top-deck-6)*t*t,z1+uz*side*t));}
      const c=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),120,0.9,5,false),cab);c.position.set(nx*s*14,0,nz*s*14);g.add(c);
      for(let t=0.04;t<0.97;t+=0.024){const y=top-2-(top-deck-8)*4*t*(1-t),hg=new THREE.Mesh(new THREE.BoxGeometry(.35,y-deck,.35),cab);
        hg.position.set(x0+dx*t+nx*s*14,(y+deck)/2,z0+dz*t+nz*s*14);g.add(hg);}}
    bakeGroup(g);}
  // the mountains that ring Busan (Jangsan behind Haeundae, Geumnyeonsan and Hwangnyeongsan to the west):
  // forested domes with a little ridge noise, rock showing near the summits
  if(TR.hills){const geos=[],c=new THREE.Color(),lo=new THREE.Color(0x3d5c34),hi=new THREE.Color(0x7d7f6a);
    for(const [hx,hy,h,R] of TR.hills){const [cx,cz]=rw(hx,hy),NR=36,NA=72,pos=[],col=[],ix=[],ph=hx*0.013+hy*0.007;
      for(let i=0;i<=NR;i++)for(let j=0;j<NA;j++){const r=i/NR,a=j/NA*Math.PI*2,rr=r*R*SC*(1+0.18*Math.sin(a*3+ph)+0.08*Math.sin(a*7+ph*2));
        const ridge=1+0.12*Math.sin(a*5+r*9+ph)+0.06*Math.sin(a*13+r*21);
        const y=Math.max(0,h*Math.pow(Math.max(0,1-r*r),1.6)*ridge)-(i===NR?2:0);
        pos.push(cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr);c.copy(lo).lerp(hi,Math.min(1,Math.max(0,(y/h-0.62)*2.4)));col.push(c.r,c.g,c.b);
        if(i<NR){const p=i*NA+j,q=i*NA+(j+1)%NA;ix.push(p,q,p+NA,q,q+NA,p+NA);}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
      g.setIndex(ix);g.computeVertexNormals();geos.push(g);}
    const m=new THREE.Mesh(mergeGeometries(geos),mat({vertexColors:true,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=false;scene.add(m);}
}

// ---- shape helpers shared by the race car and the safety car ----
// loft: superellipse cross-sections strung along x. Each section {x, y (centre height), w (half width), h / b (height
// above / below the centre), z (lateral centre, default 0), n (squareness: 2 = ellipse, 4 ≈ rounded box)}.
// Sections may come in any order; the caps get their own rim vertices so they shade flat.
function loft(S,seg=24){S=S.slice().sort((a,b)=>a.x-b.x);const pos=[],idx=[],R=seg;
  const ring=s=>{const e=2/(s.n||2.6),zc=s.z||0,out=[];
    for(let k=0;k<R;k++){const t=k/R*Math.PI*2,c=Math.cos(t),sn=Math.sin(t);
      out.push(s.x,s.y+(sn>=0?s.h:s.b)*Math.sign(sn)*Math.pow(Math.abs(sn),e),zc+s.w*Math.sign(c)*Math.pow(Math.abs(c),e));}return out;};
  for(const s of S)pos.push(...ring(s));
  for(let j=0;j<S.length-1;j++)for(let k=0;k<R;k++){const a=j*R+k,b=j*R+(k+1)%R,c=a+R,d=b+R;idx.push(a,c,b,b,c,d);}
  const cap=(s,flip)=>{const o=pos.length/3;pos.push(...ring(s));const ci=pos.length/3;pos.push(s.x,s.y,s.z||0);
    for(let k=0;k<R;k++){const a=o+k,b=o+(k+1)%R;if(flip)idx.push(ci,b,a);else idx.push(ci,a,b);}};
  cap(S[0],false);cap(S[S.length-1],true);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;}
// an inverted wing section (NACA-style thickness, camber towards the ground), leading edge at the origin, chord running
// back along -x, extruded across the span (z). `aoa` lifts the trailing edge.
function foil(chord,thick,span,aoa=0,camber=.05){const n=12,up=[],lo=[];
  for(let k=0;k<=n;k++){const u=(1-Math.cos(k/n*Math.PI))/2,yt=5*thick*chord*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u*u*u-.1036*u*u*u*u),yc=-camber*chord*4*u*(1-u);
    up.push([-u*chord,yc+yt]);lo.push([-u*chord,yc-yt]);}
  const sh=new THREE.Shape();sh.moveTo(...up[0]);for(let k=1;k<=n;k++)sh.lineTo(...up[k]);for(let k=n-1;k>=1;k--)sh.lineTo(...lo[k]);
  return new THREE.ExtrudeGeometry(sh,{depth:span,bevelEnabled:false}).translate(0,0,-span/2).rotateZ(-aoa);}
// a flat plate: an outline in the x-y plane, `t` thick across z
function plate(pts,t){const sh=new THREE.Shape();sh.moveTo(...pts[0]);for(let k=1;k<pts.length;k++)sh.lineTo(...pts[k]);
  return new THREE.ExtrudeGeometry(sh,{depth:t,bevelEnabled:false}).translate(0,0,-t/2);}
// a round bar from a to b
const _up=new THREE.Vector3(0,1,0);
function rod(a,b,r,seg=6){const A=new THREE.Vector3(...a),d=new THREE.Vector3(...b).sub(A),l=d.length();
  return new THREE.CylinderGeometry(r,r,l,seg,1,true).translate(0,l/2,0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up,d.normalize())).translate(A.x,A.y,A.z);}
// a tyre with rounded shoulders (lathe of its cross-section), axis along z
function tyreGeo(R,w,rim,seg=24){const h=w/2,p=[[rim,-h],[R-.06,-h],[R-.018,-h+.02],[R,-h+.06],[R,h-.06],[R-.018,h-.02],[R-.06,h],[rim,h]].map(([r,y])=>new THREE.Vector2(r,y));
  return new THREE.LatheGeometry(p,seg).rotateX(Math.PI/2);}

/* ================= CAR MODEL (2022-regulation F1 car, real dimensions) =================
   Built to the 2022 technical regulations in metres: 3.6 m wheelbase, 2.0 m wide, ~5.6 m long, 18-inch wheels
   (720 mm tyres, 305 mm front / 405 mm rear) with wheel covers and front-wheel deflectors, the low four-element front
   wing with the nose sitting on it, a survival cell with the halo and the driver's helmet, roll hoop / airbox with the
   T-camera on top (black for the team's first car, fluorescent yellow for the second), undercut sidepods with their
   letterbox inlets, mirrors, the venturi floor with its edge fences and diffuser, push/pull-rod wishbones, the rolled
   rear wing with its DRS flap, the beam wing below it, and the rain light (plus endplate LEDs). x is forward. */
function numTex(n,acc){return canvasTex(256,64,(x)=>{x.font='900 54px Titillium Web, sans-serif';x.fillStyle=acc;x.textAlign='center';x.textBaseline='middle';x.fillText(String(n),128,34);});}
// A car used to be ~65 separate meshes = ~65 draw calls, x20 cars, plus the same again for the shadow pass and the mirror.
// On ANGLE/D3D11 draw calls are the expensive part, so every static part of a group is baked into one mesh per material.
// `recolor` (optional Map: material → shared vertex-coloured material): parts whose materials differ only in colour
// (paint, accent, carbon; tyre, rim) have that colour baked into the vertices and are drawn together with ONE material
// that every car shares.
function bakeGroup(par,recolor){
  const buckets=new Map();
  for(const m of par.children.filter(c=>c.isMesh)){
    m.updateMatrix();let geo=indexed(m.geometry.clone());geo.applyMatrix4(m.matrix);
    for(const k of Object.keys(geo.attributes))if(k!=='position'&&k!=='normal'&&k!=='uv')geo.deleteAttribute(k);
    if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    const target=recolor&&recolor.get(m.material)||m.material;
    if(target!==m.material){const n=geo.attributes.position.count,col=new Float32Array(n*3),c=m.material.color;
      for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}geo.setAttribute('color',new THREE.BufferAttribute(col,3));}
    let b=buckets.get(target);if(!b){b={geos:[],shadow:false};buckets.set(target,b);}
    b.geos.push(geo);if(m.castShadow)b.shadow=true;par.remove(m);m.geometry.dispose();}
  for(const [material,b] of buckets){const me=new THREE.Mesh(mergeGeometries(b.geos),material);me.castShadow=b.shadow;par.add(me);}}
// shared by every car (colours live in the vertices)
const carPaint=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.18,roughness:.42,envMap:envTex,envMapIntensity:.3});
const carWheel=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.2,roughness:.75,envMap:envTex,envMapIntensity:.2});
// Distant cars (> FAR_D from the camera) swap to ONE pre-merged, vertex-coloured mesh: a car costs 1 draw call instead of ~12.
// The small parts (wishbones, mirror stalks, floor fences, uprights — the 'det' group) are left out of it.
const FAR_D=60,farMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.15});
function makeFarLOD(car,root,g){
  root.updateMatrixWorld(true);const geos=[];
  root.traverse(o=>{if(!o.isMesh||o.material.map||o.parent&&(o.parent.name==='det'||o.parent.name==='sw'))return;
    const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);
    const vc=o.material.vertexColors&&geo.attributes.color?geo.attributes.color.array:null;
    for(const k of Object.keys(geo.attributes))if(k!=='position'&&k!=='normal')geo.deleteAttribute(k);
    const n=geo.attributes.position.count,col=new Float32Array(n*3),c=o.material.color||{r:1,g:1,b:1};
    for(let i=0;i<n;i++){col[i*3]=c.r*(vc?vc[i*3]:1);col[i*3+1]=c.g*(vc?vc[i*3+1]:1);col[i*3+2]=c.b*(vc?vc[i*3+2]:1);}
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));geos.push(indexed(geo));});
  const far=new THREE.Mesh(mergeGeometries(geos),farMat);far.name='far';far.visible=false;far.castShadow=true;root.add(far);
  car.far=far;car.isFar=false;car.nearObjs=[g,...car.pivs];}
function setFar(car,far){if(car.isFar===far)return;car.isFar=far;car.far.visible=far;for(const o of car.nearObjs)o.visible=!far;}
// Every car is the same model; only the paint, the number, the T-camera colour and two lamp colours differ. The model is
// built once, painted in sentinel colours, and each car is a clone of it that shares the template's position/normal/uv
// buffers (on the GPU too): a car's own data is the colour buffer of the painted parts, its number texture and its
// tail/band materials.
const SENT_B=0xff0000,SENT_A=0x00ff00,SENT_C=0x0000ff;let carTpl=null;
// shared textures: the steering-wheel display and the sponsor lettering on the chassis top
const swScreenMat=new THREE.MeshBasicMaterial({map:canvasTex(160,96,(x)=>{x.fillStyle='#05070b';x.fillRect(0,0,160,96);
  x.fillStyle='#1be26b';x.fillRect(8,8,144,6);x.font='900 46px Titillium Web, sans-serif';x.textAlign='center';x.fillStyle='#fff';x.fillText('8',80,62);
  x.font='700 14px Titillium Web, sans-serif';x.fillStyle='#ffd200';x.fillText('DELTA +0.12',80,86);x.fillStyle='#8fd3ff';x.textAlign='left';x.fillText('BB 56',8,40);x.textAlign='right';x.fillText('ERS',152,40);})});
const noseTxtMat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,map:canvasTex(512,128,(x)=>{x.clearRect(0,0,512,128);
  x.font='900 76px Titillium Web, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle='rgba(255,255,255,.92)';x.fillText('HANEUL',256,68);})});
function carTemplate(){if(carTpl)return carTpl;
  const car=buildCar(SENT_B,SENT_A,0),recol=new Map();
  car.root.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
    const ca=o.geometry.attributes.color;if(!ca)return;const a=ca.array,b=[],c=[],d=[];
    for(let i=0;i<a.length;i+=3){const r=a[i],gg=a[i+1],bb=a[i+2];
      if(r>0.99&&gg<0.01&&bb<0.01)b.push(i);else if(r<0.01&&gg>0.99&&bb<0.01)c.push(i);else if(r<0.01&&gg<0.01&&bb>0.99)d.push(i);}
    if(b.length||c.length||d.length)recol.set(o.geometry,{b:Int32Array.from(b),a:Int32Array.from(c),c:Int32Array.from(d)});});
  return carTpl={car,recol};}
function carMesh(col,acc,num,cam=0x111214){
  const T=carTemplate(),src=T.car,root=src.root.clone(true),cB=new THREE.Color(col),cA=new THREE.Color(acc),cC=new THREE.Color(cam);
  const nm=new THREE.MeshBasicMaterial({map:numTex(num,hex(col)),transparent:true}),tail=src.tail.clone(),band=src.band.clone();
  root.traverse(o=>{if(!o.isMesh)return;const r=T.recol.get(o.geometry);
    if(r){const s=o.geometry,g=new THREE.BufferGeometry(),a=s.attributes.color.array.slice();
      for(const k in s.attributes)if(k!=='color')g.setAttribute(k,s.attributes[k]);if(s.index)g.setIndex(s.index);
      for(const i of r.b){a[i]=cB.r;a[i+1]=cB.g;a[i+2]=cB.b;}for(const i of r.a){a[i]=cA.r;a[i+1]=cA.g;a[i+2]=cA.b;}
      for(const i of r.c){a[i]=cC.r;a[i+1]=cC.g;a[i+2]=cC.b;}
      g.setAttribute('color',new THREE.BufferAttribute(a,3));g.boundingSphere=s.boundingSphere;o.geometry=g;}
    if(o.material===src.nm)o.material=nm;else if(o.material===src.tail)o.material=tail;else if(o.material===src.band)o.material=band;});
  const car={root,body:root.getObjectByName('body'),flap:root.getObjectByName('flap'),far:root.getObjectByName('far'),tail,band,isFar:false};
  car.pivs=[0,1,2,3].map(k=>root.getObjectByName('piv'+k));car.steer=car.pivs.slice(0,2);car.wheels=car.pivs.map(p=>p.getObjectByName('spin'));car.sw=root.getObjectByName('sw');
  car.nearObjs=[car.body,...car.pivs];car.contact=root.getObjectByName('contact');
  root.traverse(o=>{o.castShadow=false;}); // the cars cast no shadow
  root.position.y=CAR_Y;scene.add(root);return car;}
// the car's ride height: the road surface is at y = 0.02; the tyres sit 1.2 cm into it, so the tread is flattened onto
// the asphalt (a contact patch) instead of touching it at a single point and showing a hairline of daylight underneath
const CAR_Y=0.008;
function buildCar(col,acc,num){
  const root=new THREE.Group(),g=new THREE.Group();g.name='body';root.add(g);g.scale.set(CAR_SX,CAR_SY,CAR_SZ);const car={root,body:g};
  const det=new THREE.Group();det.name='det';g.add(det); // small parts: near view only
  const env={envMap:envTex,envMapIntensity:.25};
  const mB=mat({color:col,...env}),mA=mat({color:acc,...env}),mC=mat({color:0x16171b,...env}),mK=mat({color:0x040405,...env});
  const mCam=mat({color:SENT_C}),mPl=mat({color:0x3a2c1c}),mW=mat({color:0xd9dde3}),mF=mat({color:0x060607});
  const mGl=mat({color:0x0a1120,metalness:.8,roughness:.12,envMap:envTex,envMapIntensity:.45}),mTail=new THREE.MeshBasicMaterial({color:0x4a0000});
  const mLG=mat({color:0x22ff66}),mLR=mat({color:0xff2a1a}),mLB=mat({color:0x3a7bff}); // shift lights
  const add=(geo,m,x=0,y=0,z=0,par=g,sh=true)=>{const me=new THREE.Mesh(geo,m);me.position.set(x,y,z);me.castShadow=sh;par.add(me);return me;};
  const blob=(m,x,y,z,sx,sy,sz,par=g)=>{const o=add(new THREE.SphereGeometry(1,14,8),m,x,y,z,par);o.scale.set(sx,sy,sz);return o;};
  // ---- survival cell, nose and the tail of the gearbox (one loft, front wing to crash structure)
  add(loft([
    {x:-2.5,y:.30,w:.07,h:.06,b:.07},{x:-2.05,y:.31,w:.13,h:.09,b:.17},{x:-1.6,y:.33,w:.21,h:.14,b:.25},
    {x:-1.1,y:.35,w:.29,h:.19,b:.29},{x:-.6,y:.37,w:.36,h:.23,b:.31},{x:-.25,y:.38,w:.39,h:.25,b:.32},
    {x:.3,y:.38,w:.40,h:.25,b:.32},{x:.75,y:.40,w:.37,h:.24,b:.33},{x:1.1,y:.43,w:.30,h:.18,b:.31},
    {x:1.45,y:.45,w:.24,h:.14,b:.24},{x:1.85,y:.40,w:.18,h:.11,b:.14},{x:2.25,y:.32,w:.13,h:.08,b:.09},
    {x:2.65,y:.24,w:.10,h:.06,b:.06},{x:2.93,y:.19,w:.07,h:.04,b:.04}],28),mB);
  blob(mA,2.86,.2,0,.09,.045,.075); // nose tip
  // cockpit opening, headrest, driver
  blob(mK,.22,.625,0,.43,.05,.25);
  add(new THREE.BoxGeometry(.16,.07,.52),mC,-.2,.65,0);
  add(new THREE.SphereGeometry(.125,14,10),mA,.02,.73,0);
  add(new THREE.SphereGeometry(.128,12,6,Math.PI-.9,1.8,1.12,.42),mGl,.02,.73,0,g,false);
  // halo: titanium hoop from the two rear mounts round the driver's head, and the centre pillar down to the chassis
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-.3,.63,.36],[-.22,.85,.34],[.05,.91,.31],[.3,.91,.2],[.42,.9,0],[.3,.91,-.2],[.05,.91,-.31],[-.22,.85,-.34],[-.3,.63,-.36]].map(p=>new THREE.Vector3(...p))),28,.024,6,false),mC);
  add(rod([.41,.9,0],[.74,.635,0],.024,6),mC);
  // steering wheel (turns with the steering) with its display and shift lights, seen from the cockpit camera
  {const sw=new THREE.Group();sw.name='sw';sw.position.set(.47,.665,0);sw.rotation.z=.35;g.add(sw);
   add(new THREE.BoxGeometry(.035,.12,.2),mC,0,0,0,sw,false);
   for(const s of [-1,1])add(new THREE.BoxGeometry(.05,.15,.05),mK,0,-.01,s*.125,sw,false);
   for(let k=0;k<10;k++)add(new THREE.BoxGeometry(.012,.012,.012),k<4?mLG:k<7?mLR:mLB,-.02,.052,(k-4.5)*.016,sw,false);
   const scr=new THREE.Mesh(new THREE.PlaneGeometry(.1,.06).rotateY(-Math.PI/2),swScreenMat);scr.position.set(-.019,-.005,0);sw.add(scr);}
  // sponsor lettering on the top of the chassis in front of the cockpit (one texture shared by every car)
  {const p=new THREE.Mesh(new THREE.PlaneGeometry(.5,.12).rotateX(-Math.PI/2).rotateY(-Math.PI/2),noseTxtMat);p.position.set(1.18,.612,0);g.add(p);}
  // roll hoop / airbox and engine cover, with the T-camera on top and the intake below it
  add(loft([{x:-2.2,y:.38,w:.05,h:.04,b:.04,n:2},{x:-1.7,y:.47,w:.10,h:.07,b:.1,n:2},{x:-1.15,y:.58,w:.15,h:.10,b:.15,n:2.2},
    {x:-.7,y:.70,w:.16,h:.15,b:.2,n:2.2},{x:-.38,y:.80,w:.12,h:.17,b:.2,n:2},{x:-.2,y:.80,w:.09,h:.13,b:.16,n:2},{x:-.12,y:.77,w:.06,h:.06,b:.1,n:2}],18),mB);
  blob(mK,-.14,.85,0,.035,.075,.065);
  add(new THREE.BoxGeometry(.09,.04,.32),mCam,-.37,.99,0);
  add(new THREE.BoxGeometry(.05,.05,.05),mCam,-.37,1.02,0);
  // shark fin (accent) carrying the race number
  add(plate([[-.5,.95],[-2.06,.71],[-2.06,.46],[-1.2,.6],[-.62,.82]],.014),mA);
  const nm=new THREE.MeshBasicMaterial({map:numTex(num,hex(col)),transparent:true});
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(.46,.115),nm);p.position.set(-1.45,.7,s*.009);if(s<0)p.rotation.y=Math.PI;g.add(p);}
  // undercut sidepods with letterbox inlets, mirrors on stalks
  for(const s of [-1,1]){
    add(loft([{x:-1.55,z:s*.30,y:.30,w:.07,h:.07,b:.07},{x:-1.1,z:s*.42,y:.36,w:.13,h:.11,b:.09},{x:-.55,z:s*.53,y:.42,w:.19,h:.16,b:.10},
      {x:0,z:s*.60,y:.47,w:.22,h:.19,b:.12},{x:.38,z:s*.62,y:.49,w:.2,h:.19,b:.13},{x:.58,z:s*.62,y:.50,w:.17,h:.17,b:.12}],22),mB);
    add(loft([{x:-.9,z:s*.47,y:.47,w:.12,h:.012,b:.012,n:2},{x:-.2,z:s*.6,y:.655,w:.17,h:.012,b:.012,n:2},{x:.45,z:s*.62,y:.68,w:.15,h:.012,b:.012,n:2}],12),mA); // accent stripe on the sidepod top
    blob(mK,.6,.51,s*.62,.03,.13,.14);
    blob(mB,.5,.77,s*.57,.05,.045,.11);
    const mg=add(new THREE.PlaneGeometry(.2,.075),mK,.448,.77,s*.57,g,false);mg.rotation.y=-Math.PI/2;
    add(rod([.5,.66,s*.38],[.5,.75,s*.52],.012,5),mC,0,0,0,det);
    add(rod([.47,.62,s*.62],[.5,.74,s*.6],.01,5),mC,0,0,0,det);}
  // venturi floor: plank, edge, fences, diffuser with strakes
  {const fp=[[1.3,.30],[1.05,.55],[.85,.95],[-1.15,.95],[-1.35,.62],[-2.0,.55],[-2.0,-.55],[-1.35,-.62],[-1.15,-.95],[.85,-.95],[1.05,-.55],[1.3,-.30]];
   const sh=new THREE.Shape();sh.moveTo(...fp[0]);for(const p of fp.slice(1))sh.lineTo(...p);
   add(new THREE.ExtrudeGeometry(sh,{depth:.025,bevelEnabled:false}).rotateX(Math.PI/2),mF,0,.06,0);}
  add(new THREE.BoxGeometry(3.0,.012,.3),mPl,-.2,.032,0);
  for(const s of [-1,1]){for(const z of [.42,.5,.58])add(new THREE.BoxGeometry(.3,.13,.01),mC,1.08,.12,s*z,det);
    add(new THREE.BoxGeometry(1.9,.03,.03),mC,-.1,.075,s*.94,det);} // floor edge lip
  {const d=add(new THREE.BoxGeometry(.95,.012,1.0),mF,-2.0,.18,0);d.rotation.z=-.28;
   for(const z of [-.5,-.32,-.14,.14,.32,.5]){const st=add(new THREE.BoxGeometry(.92,.2,.01),mC,-2.02,.15,z,det);st.rotation.z=-.28;}}
  // suspension: wishbones, push/pull rods, track rods and the uprights inside the wheels
  for(const s of [-1,1]){
    for(const [a,b] of [[[1.98,.2,.18],[1.8,.22,.7]],[[1.45,.24,.22],[1.8,.22,.7]],[[1.95,.42,.17],[1.8,.5,.66]],[[1.5,.45,.22],[1.8,.5,.66]],
      [[1.8,.24,.66],[1.6,.52,.2]],[[1.9,.36,.2],[1.9,.36,.68]],
      [[-1.55,.2,.18],[-1.8,.22,.6]],[[-2.05,.2,.15],[-1.8,.22,.6]],[[-1.6,.46,.15],[-1.8,.5,.58]],[[-2.0,.44,.12],[-1.8,.5,.58]],[[-1.8,.23,.6],[-1.98,.43,.14]]])
      add(rod([a[0],a[1],s*a[2]],[b[0],b[1],s*b[2]],.017,5),mC,0,0,0,det);
    add(new THREE.BoxGeometry(.22,.24,.07),mC,1.8,.36,s*.66,det);add(new THREE.BoxGeometry(.24,.26,.08),mC,-1.8,.36,s*.56,det);}
  // front wing: four elements under the nose, endplates curling in at the outer ends
  add(foil(.34,.09,1.86,.06),mC,2.96,.095,0);
  add(foil(.20,.08,1.82,.28),mB,2.66,.145,0);
  add(foil(.16,.08,1.78,.48),mB,2.5,.2,0);
  add(foil(.13,.08,1.74,.68),mA,2.38,.265,0);
  for(const s of [-1,1])add(plate([[2.98,.03],[2.98,.13],[2.84,.24],[2.6,.3],[2.33,.31],[2.27,.26],[2.3,.03]],.016),mB,0,0,s*.93);
  // rear wing: rolled endplates, main plane, DRS flap (pivots on its leading edge), beam wing, centre pillar, rain light
  for(const s of [-1,1]){add(plate([[-2.08,.42],[-2.06,.8],[-2.16,.93],[-2.32,.985],[-2.62,.985],[-2.67,.9],[-2.63,.55],[-2.5,.42]],.018),mB,0,0,s*.5);
    add(new THREE.BoxGeometry(.012,.3,.008),mTail,-2.655,.72,s*.5,g,false);}
  add(foil(.3,.1,.99,.1),mC,-2.14,.8,0);
  const flap=new THREE.Group();flap.name='flap';flap.position.set(-2.4,.875,0);g.add(flap);add(foil(.22,.09,.98,0,.04),mA,0,0,0,flap);flap.rotation.z=-.45;car.flap=flap;
  add(foil(.16,.09,.86,.15),mC,-2.22,.43,0);add(foil(.13,.09,.86,.32),mC,-2.25,.5,0);
  add(plate([[-2.24,.28],[-2.38,.28],[-2.43,.8],[-2.3,.8]],.02),mC);
  add(new THREE.BoxGeometry(.02,.05,.12),mTail,-2.575,.3,0,g,false);
  // wheels: 18-inch rims behind flat covers, 720 mm tyres with the compound band, and the deflector over each front wheel
  const mT=mat({color:0x151515,roughness:.85}),mR=mat({color:0x26282d,metalness:.5,roughness:.4}),mN=mat({color:SENT_A});const mBand=new THREE.MeshBasicMaterial({color:0xffd200});
  car.wheels=[];car.steer=[];car.pivs=[];
  for(const [x,z,w,front] of [[1.8,.845,.305,1],[1.8,-.845,.305,1],[-1.8,.795,.405,0],[-1.8,-.795,.405,0]]){
    const piv=new THREE.Group();piv.name='piv'+car.pivs.length;piv.position.set(x*CAR_SX,.36*WHEEL_S,z*CAR_SZ);piv.scale.setScalar(WHEEL_S);root.add(piv);const spin=new THREE.Group();spin.name='spin';piv.add(spin);
    const sz=Math.sign(z);
    add(tyreGeo(.36,w,.235,40),mT,0,0,0,spin,false); // 40 sides: the tread stays on the road as the wheel turns
    add(new THREE.CylinderGeometry(.236,.236,w-.01,20).rotateX(Math.PI/2),mR,0,0,0,spin,false);
    add(new THREE.CylinderGeometry(.05,.05,.03,10).rotateX(Math.PI/2),mN,0,0,sz*(w/2),spin,false);
    for(let k=0;k<3;k++){const a=k*Math.PI*2/3,m=add(new THREE.BoxGeometry(.11,.025,.006),mW,Math.cos(a)*.3,Math.sin(a)*.3,sz*(w/2+.001),spin,false);m.rotation.z=a+Math.PI/2;}
    add(new THREE.TorusGeometry(.272,.011,4,24),mBand,0,0,sz*(w/2+.002),spin,false);
    if(front){const dfl=add(new THREE.TorusGeometry(.41,.012,3,8,1.1).scale(1,1,8).rotateZ(.55),mC,0,0,0,piv,false);dfl.name='dfl';}
    car.wheels.push(spin);car.pivs.push(piv);if(front)car.steer.push(piv);}
  const paint=new Map([[mB,carPaint],[mA,carPaint],[mC,carPaint],[mK,carPaint],[mCam,carPaint],[mPl,carPaint],[mF,carPaint],[mLG,carPaint],[mLR,carPaint],[mLB,carPaint],[mW,carWheel]]),wheel=new Map([[mT,carWheel],[mR,carWheel],[mN,carWheel],[mW,carWheel]]);
  for(const w of car.wheels)bakeGroup(w,wheel);for(const p of car.pivs)bakeGroup(p,paint);
  bakeGroup(flap,paint);bakeGroup(det,paint);bakeGroup(g.getObjectByName('sw'),paint);bakeGroup(g,paint);
  for(const m of [mB,mA,mC,mK,mCam,mPl,mF,mLG,mLR,mLB,mW,mT,mR,mN])m.dispose();
  makeFarLOD(car,root,g);
  // tyre contact patches: a tight dark footprint under each tyre (only where the rubber meets the road — not a cast
  // shadow), so the car sits ON the asphalt instead of hovering. One mesh per car, hidden while it is on the jacks
  {const geos=[];for(const [x,z,w] of [[1.8,.845,.305],[1.8,-.845,.305],[-1.8,.795,.405],[-1.8,-.795,.405]])
     geos.push(new THREE.PlaneGeometry(.62*WHEEL_S,(w+.12)*WHEEL_S).rotateX(-Math.PI/2).translate(x*CAR_SX,.003,z*CAR_SZ));
   const cp=new THREE.Mesh(mergeGeometries(geos),contactMat);cp.name='contact';cp.renderOrder=1;root.add(cp);}
  car.tail=mTail;car.band=mBand;car.nm=nm;return car;}
const contactMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.78,depthWrite:false,...po(-6),
  alphaMap:canvasTex(64,64,(x)=>{const gr=x.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'#fff');
    gr.addColorStop(.55,'#bbb');gr.addColorStop(1,'#000');x.fillStyle=gr;x.fillRect(0,0,64,64);},false,false)});

/* ---- pit crew: jacks front and rear, a gunner and a fresh tyre at each corner, and the lollipop.
   Built lazily into a small pool and parked on whichever cars are stationary in their box. ---- */
const crews=[];
function makeCrew(){
  const g=new THREE.Group();g.visible=false;scene.add(g);
  const suit=mat({color:0x191d25,roughness:.9}),helm=mat({color:0xd8dde4,roughness:.5});
  const guns=[],wheels=[];
  for(const [x,z] of [[1.9,1],[1.9,-1],[-1.9,1],[-1.9,-1]]){
    const m=new THREE.Mesh(new THREE.CapsuleGeometry(.27,.85,4,8),suit);m.position.set(x,.82,z*2.05);m.castShadow=true;g.add(m);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),helm);hd.position.set(x,1.48,z*2.05);g.add(hd);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.62,.16,.16),new THREE.MeshBasicMaterial({color:0xffc83a}));
    gun.position.set(x,.4,z*1.2);g.add(gun);guns.push(gun);
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.34,14).rotateX(Math.PI/2),mat({color:0x151515,roughness:.9}));
    w.position.set(x,.36,z*2.5);g.add(w);wheels.push(w);}
  for(const s of [1,-1]){
    const m=new THREE.Mesh(new THREE.CapsuleGeometry(.29,.95,4,8),suit);m.position.set(s*3.9,.88,0);m.castShadow=true;g.add(m);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),helm);hd.position.set(s*3.9,1.58,0);g.add(hd);
    const j=new THREE.Mesh(new THREE.BoxGeometry(1.7,.12,.5),mat({color:0xb0b5bd,metalness:.7,roughness:.3}));j.position.set(s*3.1,.2,0);g.add(j);}
  const lolMat=new THREE.MeshBasicMaterial({color:0xff2020,side:THREE.DoubleSide});
  const lol=new THREE.Mesh(new THREE.CircleGeometry(.55,18),lolMat);lol.position.set(4.9,2.5,0);lol.rotation.y=Math.PI/2;g.add(lol);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.6,6),mat({color:0x2a2e36}));pole.position.set(4.9,1.3,0);g.add(pole);
  g.userData={lolMat,guns,wheels};return g;}

/* ---- "YOUR BOX": a marker over the player's own pit box that can't be missed from the lane — a pulsing glowing
   outline and fill on the ground in the team colour, a big bobbing arrow pointing down at it and a "YOUR BOX" sign
   (with the team name) that always faces the camera. Rebuilt whenever a session starts (the team can change). ---- */
let boxMarker=null;
function buildBoxMarker(team){
  if(boxMarker){scene.remove(boxMarker);boxMarker.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});}
  const t=TEAMS[team],i=idxSp(BOX_S[team]),g=new THREE.Group();
  g.position.set(X[i]-TZ[i]*(PIT_OFF+BOX_D),0,Z[i]+TX[i]*(PIT_OFF+BOX_D));g.rotation.y=-ANG[i];
  const add={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false};
  const lineM=new THREE.MeshBasicMaterial({color:0xffffff,...add,...po(-8)}),fillM=new THREE.MeshBasicMaterial({color:t.c,opacity:.35,...add,...po(-7)});
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(7.5,3.6).rotateX(-Math.PI/2),fillM);fill.position.y=0.035;g.add(fill);
  const ln=[];for(const [w,h,x,z] of [[8.1,.3,0,1.95],[8.1,.3,0,-1.95],[.3,4.2,3.9,0],[.3,4.2,-3.9,0]]){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h).rotateX(-Math.PI/2),lineM);m.position.set(x,0.04,z);g.add(m);ln.push(m);}
  const arrowM=new THREE.MeshBasicMaterial({color:t.c===0x1b1d21?t.a:t.c,toneMapped:false});
  const arrow=new THREE.Group();arrow.position.y=5.2;g.add(arrow);
  const head=new THREE.Mesh(new THREE.ConeGeometry(1.0,1.6,4).rotateX(Math.PI),arrowM);arrow.add(head);
  const shaft=new THREE.Mesh(new THREE.BoxGeometry(.5,1.4,.5),arrowM);shaft.position.y=1.4;arrow.add(shaft);
  const rim=new THREE.Mesh(new THREE.ConeGeometry(1.12,1.75,4).rotateX(Math.PI),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,toneMapped:false}));arrow.add(rim);
  const tex=canvasTex(512,192,(x)=>{x.fillStyle='rgba(8,11,16,.88)';x.beginPath();x.roundRect(6,6,500,180,22);x.fill();
    x.lineWidth=10;x.strokeStyle=hex(t.c===0x1b1d21?t.a:t.c);x.stroke();
    x.textAlign='center';x.textBaseline='middle';x.fillStyle='#ffd200';x.font='900 84px Titillium Web, sans-serif';x.fillText('YOUR BOX',256,82);
    x.fillStyle='#fff';x.font='700 30px Titillium Web, sans-serif';x.fillText(t.name.toUpperCase(),256,150);});
  const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,toneMapped:false}));sign.scale.set(8.5,3.2,1);sign.position.y=9.2;g.add(sign);
  g.userData={fillM,lineM,arrow};scene.add(g);boxMarker=g;}
function animBoxMarker(){if(!boxMarker)return;const u=boxMarker.userData,t=performance.now()/1000,p=0.5+0.5*Math.sin(t*4);
  boxMarker.visible=phase!=='menu'&&session!=='tt';
  u.fillM.opacity=0.22+0.3*p;u.lineM.opacity=0.55+0.45*p;u.arrow.position.y=5.2+0.45*Math.sin(t*3);u.arrow.rotation.y=t*1.2;}

/* ================= RACE STATE ================= */
let cars=[],player=null,phase='menu',simTime=0,raceStart=null,gridT0=0,lightsOutAt=0,lightsOn=-1;
let drsEnabled=false,checkered=false,targetLaps=5,totalLaps=5,wearMult=1,timeLimitHit=false,fastest=null;
const bestSecAll=[null,null,null];let paused=false,hudMode=0,lastHist=0,resultsShown=false;
const keys={};

function makeCar(k,team,drv,isPlayer,skill,comp,num){
  const t=TEAMS[team];const c={id:k,team,code:drv[0],name:drv[1],isPlayer,skill,num,col:t.c,
    x:0,z:0,yaw:0,v:0,delta:0,r:0,onWall:false,aLong:0,aLat:0,pitch:0,pitchV:0,roll:0,rollV:0,visSlide:0,deltaCmd:0,steerIn:0,throttle:0,brake:0,idx:0,s:0,d:0,prevS:0,lapCount:-1,progress:0,
    fuel:Math.min(110,totalLaps*FUEL_PER_LAP+2.5),comp,nextComp:comp==='H'?'M':comp==='M'?'H':'M',wear:0,used:new Set([comp]),damage:0,
    surf:1,slip:0,tow:0,drsOpen:false,drsElig:[false,false,false],detT:[null,null,null],zone:-1,pitSide:false,limiter:false,
    pitStop:0,boxDone:false,pitPlan:false,pitLap:Infinity,pitCount:0,tl:0,tlOut:false,pen:0,finished:false,finishT:null,
    lapStart:0,secStart:0,lastLap:null,bestLap:null,sec:[null,null,null],secCol:['','',''],bestSec:[null,null,null],
    laneOff:0,laneOffT:0,laneHold:0,held:true,releaseAt:0,hp:[],ht:[]};
  // T-camera: black on the team's first car, fluorescent yellow on the second (as the FIA uses to tell them apart)
  c.mesh=carMesh(t.c,t.a,num,cars.some(o=>o.team===team)?0xffe600:0x111214);c.mesh.band.color.setHex(COMP[comp].hex);return c;}

function placeOnGrid(c,slot){const dist=8+slot*8;const i=idxSp(-dist);const d=slot%2?GRID_D:-GRID_D;
  c.idx=i;c.x=X[i]-TZ[i]*d;c.z=Z[i]+TX[i]*d;c.yaw=c.chi=ANG[i];locate(c);c.prevS=c.s;c.progress=-dist;c.laneOff=d-RL[i];c.gridD=d;}
// where the first real braking zone of the lap starts (the start-line pack keeps its two columns until then)
const FIRST_BRAKE=(()=>{let vm=0;for(let i=0;i<N;i++){vm=Math.max(vm,VP[i]);if(i*DS>150&&VP[i]<vm*0.82)return i*DS;}return 600;})();

/* ================= SESSION =================
   A weekend runs: lobby → pit box (quali tyre) → one-shot qualifying → classification →
   pit box (race tyre) → grid → race. In one-shot qualifying the car is alone on circuit: an out
   lap, then exactly one timed lap. The rest of the field waits in the garage and their laps are
   worked out from the ideal-line time, scaled by the pace each driver can actually hold. */
const IDEAL_LAP=(()=>{let t=0;for(let i=0;i<N;i++)t+=DS/VP[i];return t;})();
const CUMT=(()=>{const a=new Float32Array(N+1);let t=0;for(let i=0;i<N;i++){a[i]=t;t+=DS/VP[i];}a[N]=t;return a;})();
const QUALI_K=1.03; // a perfect ideal-line lap is not a lap anybody drives; this is the real-world gap
let session='quali',qStage='',qAttempt=0,qTimes=new Map(),qGrid=null,boxMode='quali',boxComp='S';

function parkInGarage(c){c.parked=true;c.mesh.root.visible=false;c.held=true;c.v=0;c.throttle=0;c.brake=0;}
function placeInBox(c){const i=idxSp(BOX_S[c.team]);c.idx=i;
  c.x=X[i]-TZ[i]*(PIT_OFF+BOX_D);c.z=Z[i]+TX[i]*(PIT_OFF+BOX_D);c.yaw=c.chi=ANG[i];
  c.v=0;c.delta=0;c.r=0;c.slip=0;c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;
  locate(c);c.prevS=c.s;c.lapCount=-1;c.laneOff=0;c.laneOffT=0;c.boxDone=true;c.pitStop=0;
  // the box sits between PIT_B and PIT_C, where post() freezes the pit-side flag instead of deriving
  // it — so it has to be set here, or the car counts as being on the circuit while still in its box
  c.pitSide=true;c.limiter=true;camYaw=null;}

// mode 'gp': qualifying → race weekend; 'tt': time trial (the player alone, no damage, every valid lap timed)
function setupSession(mode='gp'){
  for(const c of cars)scene.remove(c.mesh.root); // a restart builds a fresh field
  closeOverlays();resetRaceControl();
  totalLaps=targetLaps=optLaps;wearMult=mode==='tt'?0:1;
  const pt=optTeam,diff=optAI;
  cars=[];player=makeCar(0,pt,['YOU',ttName||'You'],true,1,'S',7);player.auto=AUTOPILOT;cars.push(player);
  if(mode==='gp'){
    const nums=[...Array(98).keys()].map(n=>n+2).sort(()=>rnd()-.5);
    const ai=[];let di=0;
    for(let t=0;t<10;t++)for(let s=0;s<2;s++){if(t===pt&&s===0)continue;const perf=1-t*0.0035+rand(-0.006,0.004);ai.push({team:t,drv:DRIVERS[di++],skill:diff*perf});}
    ai.sort((a,b)=>b.skill-a.skill);
    ai.forEach((a,k)=>cars.push(makeCar(k+1,a.team,a.drv,false,a.skill,'S',nums[k])));}
  qTimes=new Map();
  for(const c of cars)if(!c.isPlayer){qTimes.set(c,IDEAL_LAP*QUALI_K/c.skill*(1+rand(-0.003,0.010)));parkInGarage(c);}
  simTime=0;raceStart=null;lightsOn=-1;drsEnabled=true;checkered=false;timeLimitHit=false;fastest=null;
  bestSecAll.fill(null);resultsShown=false;qGrid=null;session=mode==='tt'?'tt':'quali';
  $('tower').hidden=true;$('lights').hidden=true;
  buildBoxMarker(pt);camYaw=null;recReset();
  if(mode==='tt')startTT();else openBox('quali');
}
function closeOverlays(){if(replay)endReplay();paused=false;for(const id of ['pause','results','qres','box'])$(id).hidden=true;
  for(const k in keys)keys[k]=false;elSty(pitHud,'display','none');for(const g of crews)g.visible=false;}
// restart buttons (pause menu, results): the race again from the same grid, or the whole weekend from qualifying
function restartRace(){if(session!=='race'||!qGrid)return;closeOverlays();resultsShown=false;
  for(const c of cars)if(!c.isPlayer)parkInGarage(c);resetRaceControl();openBox('race');}
function restartQuali(){setupSession('gp');}
function restartTT(){setupSession('tt');}

function openBox(mode){
  boxMode=mode;phase='box';paused=false;
  const c=player;placeInBox(c);c.held=true;c.wear=0;c.damage=0;c.dm=newDmg();c.wingShare=0;c.tT=null;c.bT=null;c.tl=0;c.tlOut=false;c.pen=0;c.drsOpen=false;
  c.fuel=mode==='quali'?12:Math.min(110,totalLaps*FUEL_PER_LAP+2.5);
  $('boxEye').textContent=mode==='quali'?'PIT BOX · ONE-SHOT QUALIFYING':'PIT BOX · RACE';
  $('boxTitle').innerHTML=mode==='quali'?'Qualifying <em>Tyre</em>':'Starting <em>Tyre</em>';
  $('boxSub').textContent=mode==='quali'?'':('P'+(qGrid?qGrid.indexOf(c)+1:1)+' · '+totalLaps+' laps');
  boxComp=mode==='quali'?'S':'M';
  const tb=$('boxTyres');tb.innerHTML='';
  for(const k of ['S','M','H'])tb.appendChild(chip(COMP[k].name,'',k===boxComp,()=>{boxComp=k;
    [...tb.children].forEach((b,i)=>b.classList.toggle('on',['S','M','H'][i]===boxComp));}));
  $('boxGo').textContent=mode==='quali'?'LEAVE THE BOX':'TO THE GRID';
  $('boxGo').onclick=leaveBox;
  $('box').hidden=false;
}

function leaveBox(){
  $('box').hidden=true;const c=player;
  c.comp=boxComp;c.wear=0;c.used=new Set([boxComp]);c.nextComp=boxComp==='H'?'M':'H';
  c.mesh.band.color.setHex(COMP[boxComp].hex);
  if(boxMode==='quali'){phase='quali';qAttempt=1;c.lapInvalid=false;c.held=false;
    // released at the start of the main straight, already at speed, so the flying lap is under way
    // well before the line; the clock itself starts as the car crosses it
    rollingStart(c,straightBack());qStage='out';
    c.bestLap=null;c.lastLap=null;c.sec=[null,null,null];c.secCol=['','',''];
    msg('FLYING LAP');}
  else startRace();
}

// how far before the line the last straight begins: walk back until the road bends
// (Busan's line is only ~160 m past the BEXCO corner: a 200 m floor would drop the car mid-corner)
function straightBack(){let d=900;for(let k=6;k<N;k++){const i=(N-k)%N;if(Math.abs(K[i])>1/200){d=(k-6)*DS;break;}}return clamp(d,120,1500);}
function rollingStart(c,back){const sp=-back,i=idxSp(sp),off=RL[i];
  c.idx=i;c.x=X[i]-TZ[i]*off;c.z=Z[i]+TX[i]*off;c.yaw=c.chi=ANG[i];
  c.v=VP[i]*0.94;c.delta=0;c.r=0;c.slip=0;c.laneOff=0;c.laneOffT=0;c.sep=0;
  c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;c.pitSide=false;c.limiter=false;c.boxDone=false;
  locate(c);c.prevS=c.s;c.lapCount=-1;c.throttle=1;c.brake=0;camYaw=null;}

function qualiCross(c){
  if(c.pitSide)return; // crossing the line inside the pit lane is not a lap of the circuit
  if(qStage==='out'){qStage='flying';c.lapStart=simTime;c.secStart=simTime;c.lapInvalid=false;
    msg('FLYING LAP');return;}
  if(qStage!=='flying')return;
  const lt=simTime-c.lapStart;
  if(c.lapInvalid){finishQuali(null);return;}
  c.lastLap=lt;c.bestLap=lt;finishQuali(lt);
}
function finishQuali(t){
  qStage='done';phase='qdone';const c=player;c.held=true;c.throttle=0;c.brake=0;
  qTimes.set(c,t);
  qGrid=cars.slice().sort((a,b)=>{const ta=qTimes.get(a),tb=qTimes.get(b);
    if(ta==null&&tb==null)return 0;if(ta==null)return 1;if(tb==null)return -1;return ta-tb;});
  const pole=qTimes.get(qGrid[0]);
  $('qresBody').innerHTML=qGrid.map((c2,k)=>{const q=qTimes.get(c2);
    return '<tr class="'+(c2.isPlayer?'me':'')+'"><td class="num">'+(k+1)+'</td>'+
      '<td><span class="sw" style="background:'+hex(c2.col)+'"></span>'+(c2.isPlayer?'<b>YOU</b>':c2.name)+' <span style="color:var(--mute)">#'+c2.num+'</span></td>'+
      '<td>'+TEAMS[c2.team].name+'</td><td class="num">'+(q==null?'NO TIME':fmt(q))+'</td>'+
      '<td class="num">'+(q==null?'—':k===0?'POLE':'+'+(q-pole).toFixed(3))+'</td></tr>';}).join('');
  const p=qGrid.indexOf(c),pt=qTimes.get(c);
  $('qresSub').textContent=pt==null?'LAP DELETED — you start from the back of the grid'
    :'P'+(p+1)+' · '+fmt(pt)+(p===0?' · POLE POSITION':' · +'+(pt-pole).toFixed(3)+'s to pole');
  $('qres').hidden=false;
  msg(pt==null?'NO TIME':'P'+(p+1)+' · '+fmt(pt));
}

/* ================= TIME TRIAL =================
   The player alone on the circuit on fresh softs (no wear, no fuel worries, no damage), from a rolling start. Every
   lap from the line is timed; touching a wall or going beyond the track limits deletes that lap. Each valid lap is
   offered to the leaderboard (only a driver's best counts), under the real name entered before the session. */
let ttName='',tt={stage:'out',laps:0,best:null,board:[],boardShared:false,boardT:-99,pbSplits:null};
try{ttName=localStorage.getItem('hrc-name')||'';}catch(e){}
function startTT(){const c=player;
  tt={stage:'out',laps:0,best:null,board:tt.board,boardShared:tt.boardShared,boardT:-99,pbSplits:null};
  phase='quali';c.comp='S';c.used=new Set(['S']);c.nextComp='M';c.mesh.band.color.setHex(COMP.S.hex);
  c.wear=0;c.damage=0;c.dm=newDmg();c.fuel=12;c.tT=[90,90,90,90];c.bT=[400,400,400,400];c.held=false;c.lapInvalid=false;
  c.bestLap=null;c.lastLap=null;c.sec=[null,null,null];c.secCol=['','',''];c.bestSec=[null,null,null];
  rollingStart(c,straightBack());
  $('tower').hidden=false;refreshBoard(true);
  msg('TIME TRIAL','A WALL OR TRACK LIMITS DELETE THE LAP');}
function ttCross(c){
  if(c.pitSide)return;
  const t=simTime;
  if(tt.stage==='out'){tt.stage='flying';}
  else{const lt=t-c.lapStart;sectorDone(c,2,t);tt.laps++;
    if(c.lapInvalid)msg('LAP DELETED · NO TIME',c.invWhy||'');
    else{c.lastLap=lt;const pb=c.bestLap==null||lt<c.bestLap;
      if(pb){c.bestLap=lt;tt.pbSplits=c.cum?c.cum.slice():null;}
      msg(pb?'PERSONAL BEST':'LAP TIME',fmt(lt));ttSubmit(lt);}}
  // the next lap starts at once
  c.lapCount=0;c.lapStart=t;c.secStart=t;c.lapInvalid=false;c.invWhy=null;c.sec=[null,null,null];c.secCol=['','',''];c.cum=new Float32Array(64);}
function ttInvalidate(why){const c=player;if(session!=='tt'||tt.stage!=='flying'||!c||c.lapInvalid)return;
  c.lapInvalid=true;c.invWhy=why;msg('LAP DELETED',why+' · THIS LAP WILL NOT COUNT');}
async function ttSubmit(lt){if(!ttName)return;
  const r=await lbSubmit(TRACK_ID,{name:ttName,t:+lt.toFixed(3),team:TEAMS[player.team].name,date:Date.now()});
  await refreshBoard(true);
  const p=tt.board.findIndex(x=>x.name===ttName)+1;
  if(r.improved&&p)msg('LEADERBOARD · P'+p,ttName+' · '+fmt(lt));}
async function refreshBoard(force){if(!force&&performance.now()/1000-tt.boardT<20)return;tt.boardT=performance.now()/1000;
  const r=await lbLoad(TRACK_ID);tt.board=r.rows;tt.boardShared=r.shared;}
// lap progress for the delta to the personal best: time at each 1/64 of the lap
function ttTrack(c){if(session!=='tt'||tt.stage!=='flying'||!c.cum)return;const k=Math.min(63,Math.floor(c.s/L*64));if(!c.cum[k])c.cum[k]=simTime-c.lapStart;}
function updateTTInfo(){const c=player;
  elTxt(el('lapNum'),c.lapInvalid&&tt.stage==='flying'?'LAP DELETED':tt.stage==='out'?'OUT LAP':'TIME TRIAL');
  elSty(el('gapA').parentElement,'display','');elTxt(el('gapALbl'),'DELTA TO PB');
  let dl=null;if(tt.stage==='flying'&&tt.pbSplits&&!c.lapInvalid){const k=Math.min(63,Math.floor(c.s/L*64));const a=tt.pbSplits[k],b=c.cum&&c.cum[k];if(a&&b)dl=b-a;}
  elTxt(el('gapA'),dl==null?'—':(dl>=0?'+':'')+dl.toFixed(3));elSty(el('gapA'),'color',dl==null?'':(dl<0?'#1be26b':'#ff5252'));
  elTxt(el('curLap'),tt.stage==='flying'?fmt(simTime-c.lapStart):'—');elTxt(el('lastLap'),fmt(c.lastLap));elTxt(el('bestLap'),fmt(c.bestLap));
  infoTyres(c);
  elHtml(el('flags'),c.lapInvalid&&tt.stage==='flying'?'<span class="flag ret"><i></i>LAP DELETED · '+(c.invWhy||'')+'</span>':'');
  refreshBoard(false);
  const b=tt.board,lead=b.length?b[0].t:null,me=b.findIndex(x=>x.name===ttName);
  let h='<div class="tt-hd">LEADERBOARD'+(tt.boardShared?'':' · THIS BROWSER')+'</div>';
  const show=b.slice(0,10);if(me>=10)show.push(b[me]);
  if(!show.length)h+='<div class="tt-row"><span></span><span>No times yet</span><span></span></div>';
  for(const r of show){const p=b.indexOf(r)+1;
    h+='<div class="tt-row'+(r.name===ttName?' me':'')+'"><span>'+p+'</span><b>'+esc(r.name)+'</b><span>'+(p===1?fmt(r.t):'+'+(r.t-lead).toFixed(3))+'</span></div>';}
  elHtml(el('rows'),h);renderMfd();}
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function startRace(){
  session='race';phase='grid';
  qGrid.forEach((c,slot)=>{
    c.parked=false;c.mesh.root.visible=true;
    if(!c.isPlayer){const comp=slot<10?(rnd()<.5?'S':'M'):(rnd()<.5?'M':'H');
      c.comp=comp;c.nextComp=comp==='H'?'M':'H';c.mesh.band.color.setHex(COMP[comp].hex);
      if(totalLaps>=2){const lo=Math.max(1,Math.floor(totalLaps*0.3)),hi=Math.max(lo,Math.ceil(totalLaps*0.7)-1);c.pitLap=lo+Math.floor(rnd()*(hi-lo+1));}
      else c.pitLap=1;}
    c.used=new Set([c.comp]);c.fuel=Math.min(110,totalLaps*FUEL_PER_LAP+2.5);
    c.wear=0;c.damage=0;c.tl=0;c.tlOut=false;c.pen=0;c.finished=false;c.finishT=null;
    c.pitStop=0;c.boxDone=false;c.pitPlan=false;c.pitCount=0;c.pitSide=false;c.limiter=false;
    c.lastLap=null;c.bestLap=null;c.sec=[null,null,null];c.secCol=['','',''];c.bestSec=[null,null,null];
    c.hp=[];c.ht=[];c.drsOpen=false;c.drsElig=[false,false,false];c.detT=[null,null,null];c.zone=-1;
    c.tow=0;c.slip=0;c.v=0;c.gear=0;c.delta=0;c.r=0;c.laneOff=0;c.laneOffT=0;c.laneHold=0;c.sep=0;c.held=true;
    c.dnf=false;c.dnfWhy=null;c.maxLap=-1;c.defUntil=null;c.mArm=false;c.mT=0;c.passCar=null;
    c.waveBy=false;c.unlap=false;c.vd=0;c.infr=[];c.flagSt=0;c.dyT=0;c.dyFast=0;c.dWarn=0;c.msk=null;c.pRel=null;c.autoBox=false;
    c.dm=newDmg();c.wingShare=0;c.wingChange=false;c.tT=null;c.bT=null;if(c.isPlayer){c.pitWing=c.pitWing||"AUTO";c.planLap=null;}
    placeOnGrid(c,slot);c.lapCount=-1;c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;});
  resetRaceControl();
  simTime=0;raceStart=null;gridT0=0.8;lightsOutAt=gridT0+5+rand(0.3,2.6);lightsOn=-1;
  drsEnabled=false;checkered=false;timeLimitHit=false;fastest=null;bestSecAll.fill(null);resultsShown=false;
  camYaw=null;recReset();
  $('tower').hidden=false;buildTower();$('lights').hidden=false;setLights(0);
  msg('FORMATION COMPLETE · LIGHTS OUT WHEN ALL FIVE GO OUT');
}

/* ================= PHYSICS ================= */
function tyreGrip(c){return COMP[c.comp].grip*(1-0.10*Math.min(c.wear,1.3)-0.35*Math.max(0,c.wear-0.75))*tempGrip(c);}
function locate(c){let best=c.idx,bd=1e18;for(let k=-25;k<=25;k++){const i=(c.idx+k+N)%N,dx=c.x-X[i],dz=c.z-Z[i],d=dx*dx+dz*dz;if(d<bd){bd=d;best=i;}}
  c.idx=best;const dx=c.x-X[best],dz=c.z-Z[best];c.s=((best*DS+dx*TX[best]+dz*TZ[best])%L+L)%L;c.d=-dx*TZ[best]+dz*TX[best];}

function physics(c,dt){
  if(c.pitStop>0){c.v=0;c.pitStop-=dt;if(c.pitStop<=0)finishPit(c);return;}
  if(c.held){c.v=0;c.aLong=0;c.aLat=0;return;}
  // the player's car has driven into its box: it is brought to rest on its marks by itself (a smooth stop onto the
  // stop line, eased onto the box centre line and square to the lane), and the stop starts
  if(c.autoBox){const i=c.idx,along=BOX_S[c.team]-spOf(c.s),lat=PIT_OFF+BOX_D-c.d;
    const dec=Math.min(c.v*c.v/(2*Math.max(0.05,along)),28);c.v=along<0.03?0:Math.max(0,c.v-dec*dt);
    c.yaw+=wrapA(ANG[i]-c.yaw)*Math.min(1,4*dt);c.chi=c.yaw;c.r=0;c.delta-=c.delta*Math.min(1,6*dt);
    const k=Math.min(1,2.5*dt);c.x+=Math.cos(c.yaw)*c.v*dt-TZ[i]*lat*k;c.z+=Math.sin(c.yaw)*c.v*dt+TX[i]*lat*k;
    c.throttle=0;c.brake=c.v>0.1?1:0;c.aLong=-dec;c.aLat=0;temps(c,dt,0,-dec);
    if(c.v<=0){c.autoBox=false;startPit(c);}return;}
  // reverse (S): only a crawl, only in the pit lane — to back into the box after overshooting it
  if(c.isPlayer&&c.revIn&&c.pitSide&&c.v<0.3&&c.throttle<0.05){const vr=2.2;c.v=0;c.aLong=0;c.aLat=0;c.r=0;
    c.delta+=clamp(c.steerIn*0.26-c.delta,-4*dt,4*dt);c.yaw-=vr*Math.tan(c.delta)/WB*dt;c.chi=c.yaw;
    c.x-=Math.cos(c.yaw)*vr*dt;c.z-=Math.sin(c.yaw)*vr*dt;return;}
  if(c.dnf){c.throttle=0;c.brake=1;c.deltaCmd=0;c.steerIn=0;}
  const v=c.v,m=MASS+c.fuel,tg=tyreGrip(c)*c.surf*(1-0.12*c.damage),mu=MU*tg*gripV(v);
  const cla=CLA*(c.drsOpen?0.9:1)*(1-0.3*c.damage),cda=CDA*(c.drsOpen?0.85:1)*(1-0.22*c.tow);
  const Nn=m*G+0.5*RHO*cla*v*v,aMax=mu*Nn/m;
  const thr=c.fuel>0?c.throttle:0;
  // drive and wheelspin: TRACTION × grip is what the rear tyres can put down. A light traction control lets the driver
  // ask for up to TC_SLACK × that; past it the wheels spin (spin 0…1): the drive drops to ~75 % and the rears lose
  // some cornering grip, so too much throttle out of a slow corner is slower and pushes the car wide
  const Fdem=thr>0?POWER*thr/Math.max(v,4):0,Ftr=mu*TRACTION*Nn;
  // pulling away and at crawling speed the traction control catches it completely (fades out from ~80 down to ~50 km/h):
  // otherwise every launch sat in full wheelspin for seconds — revs pinned, speed barely building
  c.spin=Fdem>Ftr*TC_SLACK?Math.min(1,(Fdem/(Ftr*TC_SLACK)-1)*1.5)*clamp((v-14)/8,0,1):0;
  const Fp=Math.min(Fdem,Ftr)*(1-0.25*c.spin);
  const Fdrag=0.5*RHO*cda*v*v+(v>0.1?CRR*m*G:0),Fb=c.brake*mu*BRK*Nn;
  // steering lock shrinks with speed (heavy steering / small angles at 300 km/h); the player may ask
  // for ~30 % more than the grip limit, which now makes the car slide instead of tracking on rails
  const dGrip=Math.atan(aMax*WB/Math.max(v*v,1)),dPhys=0.26/(1+v/70); // ~13.5 m minimum turning radius, and still limited at speed
  // sliding (player): steering INTO the slide (countersteer: towards the direction of travel) gets the slip angle as
  // extra lock, so there is enough of it to catch the car; steering further into the spin gets none
  const slideOn=c.isPlayer&&!c.auto&&SLIDE>0&&v>6,bTr=slideOn?wrapA((c.chi??c.yaw)-c.yaw):0;
  const bSl=c.steerIn*bTr>0?Math.abs(bTr):0;
  const dmax=Math.max(0.03,Math.min(dPhys,dGrip*(c.isPlayer?1.2:1.1))+bSl);
  const want=c.isPlayer&&!c.auto?c.steerIn*dmax:clamp(c.deltaCmd,-dmax,dmax);
  // the front wheels turn at a steady rate (the player's a little gentler still): no instant lock-to-lock darts
  const dr=c.isPlayer&&!c.auto?(bSl>0.03?5:2.2):3;c.delta+=clamp(want-c.delta,-dr*dt,dr*dt);
  if(slideOn){const [ax,ay]=slideStep(c,dt,m,mu,Nn,Fdem,Fb,Fdrag);afterMove(c,dt,thr,ax,ay);return;}
  let axT=(Fp-Fb)/m;if(v<0.05&&axT<0)axT=0;
  // A planted F1 car, not a drift car. The path (chi) bends as far as the tyres allow; the body (yaw) follows the path
  // within a few hundredths of a second, carrying only a small slip angle — it never swings out of line. Asking for
  // more than the grip (friction ellipse: braking / traction and cornering share one budget) makes the tyres slide:
  // past the peak they give a little LESS than the peak, so the car pushes wide and scrubs speed (understeer, wheelspin
  // out of slow corners, locking up into them) — hard to drive on the limit, but no tail-out slides.
  if(c.chi===undefined)c.chi=c.yaw;
  const beta=wrapA(c.yaw-c.chi),rReq=v*Math.tan(c.delta)/WB,ayReq=v*rReq;
  const n=Math.hypot(axT/(aMax*1.05),ayReq/(aMax*(1-0.2*c.spin))); // spinning rears corner worse
  let ay=ayReq;c.slip=0;if(n>1){c.slip=n-1;const lose=1-0.14*Math.min(c.slip,1);axT=axT/n*lose;ay=ayReq/n*lose;}
  const ax=axT-Fdrag/m-Math.min(c.slip,1)*3.0;
  c.v=Math.max(0,v+ax*dt);
  c.chi=v>0.5?c.chi+ay/v*dt:c.yaw;
  // body: turns with the path, plus a tiny slip angle (≤ ~1°). The follow is well damped (no overshoot), so the car
  // never snaps round and letting go of the steering doesn't swing the nose past the path and back; a 5° hard limit
  // eases chi in, never snaps it. The player's car follows softer still (what you see from it); the AI keeps a
  // slightly tighter follow so its body stays square to its line through tight street corners
  const soft=c.isPlayer&&!c.auto,bK=soft?6:8,bTau=soft?0.07:0.05,bS=soft?0.0003:0.0005,bM=soft?0.018:0.025;
  const rT=(v>0.5?ay/v:rReq)+(clamp(ay*bS,-bM,bM)-beta)*bK;
  c.r+=(rT-c.r)*(1-Math.exp(-dt/bTau));c.yaw+=c.r*dt;
  {const b=wrapA(c.yaw-c.chi);if(Math.abs(b)>0.09)c.chi+=(b-Math.sign(b)*0.09)*Math.min(1,10*dt);}
  c.x+=Math.cos(c.chi)*c.v*dt;c.z+=Math.sin(c.chi)*c.v*dt;
  afterMove(c,dt,thr,ax,ay);
}
function afterMove(c,dt,thr,ax,ay){
  c.aLong=ax;c.aLat=ay;
  const dist=c.v*dt;
  c.fuel=Math.max(0,c.fuel-FUEL_PER_LAP/L*dist*(0.35+0.65*thr)*1.12);
  c.wear+=dist/1000*COMP[c.comp].rate*wearMult*(1+1.5*Math.min(c.slip,2)+0.4*c.brake+1.2*c.spin);
  temps(c,dt,ay,ax);updateGear(c,dt);
}
/* ---- the player's car at speed: a two-axle (bicycle) model. Each axle's tyres have their own slip angle and grip; the
   rears share theirs between drive / braking and cornering (friction circle), and past its peak a tyre gives LESS
   (Pacejka-shaped, the rear more so with SLIDE). Nothing pulls the body back in line: once the rear lets go the car
   keeps rotating on its own yaw momentum until the driver countersteers (or lifts, giving the rears their grip back).
   State in and out is the usual v / chi (travel) / yaw (body) / r, so walls, the camera and the AI path see no
   difference; it runs in 10 sub-steps because the tyres are stiff at low speed. ---- */
const CG_F=0.54*WB,CG_R=0.46*WB,CG_H=0.30; // CG to front / rear axle (46 % of the weight on the front), CG height
function pac(al,C,pk){return Math.sin(C*Math.atan(Math.tan(Math.PI/(2*C))/pk*al));} // 1 at slip pk, less past it
function slideStep(c,dt,m,mu,Nn,Fdem,Fb,Fdrag){
  const n=10,h=dt/n,Iz=m*1.8,Cr=1.25+0.25*SLIDE;
  const b0=wrapA(c.chi-c.yaw),v0=c.v;let vx=v0*Math.cos(b0),vy=v0*Math.sin(b0),r=c.r,yaw=c.yaw,x=c.x,z=c.z;
  // weight moves back under power and forward under braking (light rears on the brakes: lift-off / trail-brake oversteer)
  // a sideways car stalls its floor: with the slip angle the downforce goes (the rear, under the diffuser, most), which
  // loosens the rear further — the snap that turns a twitch into a spin, fastest where the downforce is biggest
  const k=Math.min(1,Math.abs(b0)/0.25),Da=Nn-m*G,Ns=m*G+Da*(1-0.5*k);
  const dN=clamp(m*(c.aLong||0)*CG_H/WB,-0.35*Ns,0.35*Ns),Nf=m*G*CG_R/WB+Da*CG_R/WB*(1-0.3*k)-dN,Nr=m*G*CG_F/WB+Da*CG_F/WB*(1-0.7*k)+dN;
  // the (wider) rears have ~10 % more grip than the fronts: off the throttle the car runs wide at the limit, it doesn't spin
  const Ff=mu*Nf,Fr=mu*1.1*Nr,d=c.delta,cd=Math.cos(d),sd=Math.sin(d);
  const Fdrv=Math.min(Fdem,Fr*TC_P);
  c.spin=Fdem>Fr*TC_P?Math.min(1,(Fdem/(Fr*TC_P)-1)*1.5):0;
  const Fxf=-Math.min(Fb*0.58,Ff*0.98),Fxr=Fdrv-Math.min(Fb*0.42,Fr*0.98);
  const Fyf0=Math.sqrt(Math.max(0,Ff*Ff-Fxf*Fxf)),Fyr0=Math.sqrt(Math.max(0,Fr*Fr-Fxr*Fxr));
  let fy=0,alr=0;
  for(let i=0;i<n;i++){const u=Math.max(vx,3);
    const af=d-Math.atan2(vy+CG_F*r,u),ar=-Math.atan2(vy-CG_R*r,u);
    // the rears are the stiffer pair (the car understeers gently and is stable off the throttle); drive eats into their
    // grip, and once that tips the balance they let go and fall off past the peak
    const Fyf=Fyf0*pac(af,1.3,0.12),Fyr=Fyr0*pac(ar,Cr,0.06);
    const Fy=Fyf*cd+Fxf*sd+Fyr;
    vx+=((Fxf*cd-Fyf*sd+Fxr-Fdrag)/m+vy*r)*h;
    vy+=(Fy/m-vx*r)*h;
    r+=((CG_F*(Fyf*cd+Fxf*sd)-CG_R*Fyr)/Iz)*h;
    if(vx<0.5){vx=0.5;}
    x+=(Math.cos(yaw)*vx-Math.sin(yaw)*vy)*h;z+=(Math.sin(yaw)*vx+Math.cos(yaw)*vy)*h;yaw+=r*h;
    fy=Fy;alr=ar;}
  c.x=x;c.z=z;c.yaw=yaw;c.r=r;c.v=Math.hypot(vx,vy);c.chi=yaw+Math.atan2(vy,vx);
  c.slip=Math.min(2,Math.max(0,Math.abs(alr)/0.06-1)); // rear past its peak: tyre squeal, wear and heat
  return [(c.v-v0)/dt,fy/m];
}
/* ---- tyre and brake temperatures (°C), FL FR RL RR. A tyre heats with the work it does — cornering load (more on the
   outside wheels), braking on the fronts, traction on the rears, sliding — and the air cools it, harder at speed. On
   blankets they leave the box at ~80 °C. Each compound has its window (soft 85–105, medium 90–110, hard 95–118); out
   of it the tyre gives a little less grip. Carbon brakes run ~400–900 °C, spiking under heavy braking. ---- */
const T_OPT={S:95,M:100,H:106},T_HEAT={S:1.08,M:1,H:0.93};
function temps(c,dt,ay,ax){if(!c.tT){c.tT=[80,80,80,80];c.bT=[300,300,300,300];}
  const v=c.v,lat=Math.abs(ay),cool=0.012*(1+v/50),hk=T_HEAT[c.comp],sl=Math.min(c.slip||0,1);
  for(let w=0;w<4;w++){const front=w<2,out=ay>0?w%2===0:w%2===1,load=lat<0.5?1:out?1.3:0.7;
    const H=(0.009*v+0.068*lat*load+(front?0.04*Math.max(0,-ax):0.034*Math.max(0,ax)+9*(c.spin||0))+4*sl)*hk;
    c.tT[w]+=(H-(c.tT[w]-32)*cool)*dt;
    const bh=c.brake*v*(front?7:5),bc=(c.bT[w]-60)*0.03*(1+v/80);c.bT[w]=Math.max(60,c.bT[w]+(bh-bc)*dt);}}
// grip from tyre temperature: a mild loss away from the window (never more than 6 %)
function tempGrip(c){if(!c.tT)return 1;const t=(c.tT[0]+c.tT[1]+c.tT[2]+c.tT[3])/4-T_OPT[c.comp];return 1-Math.min(0.06,0.00004*t*t);}
/* ---- part damage (0..1) for the MFD: where a car is hit decides which parts take it. `c.damage` stays the overall
   figure that costs grip / downforce and retires a car at 100 %; a new front wing in the pits takes the share of it
   that came from the wing. ---- */
// Only the WINGS can be damaged: a hit at the front breaks the front wing (that side, or both square on), a hit at the
// rear the rear wing, a side swipe clips the front wing on that side. No crash ever retires a car. `c.damage` (what
// costs downforce / grip) is worked out from the three; a new front wing in the pits clears the front part of it.
// In TIME TRIAL nothing is damaged at all.
const DMG_PARTS=[['fwL','FRONT WING L'],['fwR','FRONT WING R'],['rw','REAR WING']];
const newDmg=()=>({fwL:0,fwR:0,rw:0});
const dmgOverall=d=>Math.min(1,0.45*Math.max(d.fwL,d.fwR)+0.25*Math.min(d.fwL,d.fwR)+0.3*d.rw);
function hurt(c,amt,where,side){if(amt<=0||session==='tt')return;const d=c.dm||(c.dm=newDmg()),a=(k,x)=>{d[k]=Math.min(1,d[k]+x);};
  if(where==='F'){if(side>=0)a('fwR',amt*2.6);if(side<=0)a('fwL',amt*2.6);}
  else if(where==='R')a('rw',amt*2.2);
  else a(side>0?'fwR':'fwL',amt*1.2);
  c.damage=dmgOverall(d);}
// where a contact point sits on a car: 'F' / 'R' / 'S' and the side (+1 right, -1 left)
function hitZone(c,px,pz){const fx=Math.cos(c.yaw),fz=Math.sin(c.yaw),dx=px-c.x,dz=pz-c.z,lg=dx*fx+dz*fz,lt=-dx*fz+dz*fx;
  return [lg>HX*0.55?'F':lg<-HX*0.55?'R':'S',lt>0.15?1:lt<-0.15?-1:0];}

/* ---- contact: cars are 5.6 × 2.0 m boxes ---- */
const HX=2.8*CAR_SX,HZ=1.0*CAR_SZ;
function corners(c){const fx=Math.cos(c.yaw),fz=Math.sin(c.yaw);return [[1,1],[1,-1],[-1,1],[-1,-1]].map(([a,b])=>[c.x+fx*HX*a-fz*HZ*b,c.z+fz*HX*a+fx*HZ*b]);}

// walls: no bounce and no sudden turn — while touching, the car scrapes: speed bleeds off
// progressively (harder the steeper the angle) and the nose eases round to run along the wall
function walls(c){
  const dt=1/120,i=c.idx,rx=-TZ[i],rz=TX[i],sp=spOf(c.s),pitZone=sp>PIT_B&&sp<PIT_C;let w=null;
  for(const [px,pz] of corners(c)){const d=(px-X[i])*rx+(pz-Z[i])*rz;let pen=0,s=0;
    if(d<-WL[i]){pen=-WL[i]-d;s=1;}else if(d>WR[i]){pen=d-WR[i];s=-1;}
    if(pitZone){if(c.pitSide&&d<PITWALL+.3&&PITWALL+.3-d>pen){pen=PITWALL+.3-d;s=1;}else if(!c.pitSide&&d>PITWALL-.3&&d-PITWALL+.3>pen){pen=d-PITWALL+.3;s=-1;}}
    if(pen>0&&(!w||pen>w.pen))w={pen,nx:rx*s,nz:rz*s,px,pz};}
  if(!w){c.onWall=false;c.wallT=0;return;}
  c.x+=w.nx*w.pen;c.z+=w.nz*w.pen;
  const cd=c.chi??c.yaw,fx=Math.cos(cd),fz=Math.sin(cd),into=Math.max(0,-(fx*w.nx+fz*w.nz)); // travel direction vs wall
  if(!c.onWall){const vn=c.v*into;if(vn>1)jolt(c,w.nx,w.nz,c.x+fx*HX*0.8-w.nx*HZ,c.z+fz*HX*0.8-w.nz*HZ,vn);
    // time trial: any touch of the barrier deletes the lap
    if(session==='tt'&&c.isPlayer)ttInvalidate('WALL CONTACT');
    // the barrier breaks a wing (harder the faster the car goes INTO it); a big shunt (~70 km/h square on, i.e.
    // 200 km/h at 20°) leaves debris on the track — that brings out the Safety Car (with a yellow just before it)
    const hz=hitZone(c,w.px,w.pz),zone=into>0.45&&hz[0]==='F'?'F':hz[0]==='R'?'R':'S';
    if(vn>7&&phase==='race'&&!c.dnf){hurt(c,(vn-7)*0.03,zone,hz[1]);
      if(vn>=19)incident(c,'HEAVY IMPACT');
      else if(c.isPlayer&&simTime-lastContact>1.5){lastContact=simTime;msg('CONTACT · DAMAGE '+Math.round(c.damage*100)+'%');}}
    else if(vn>12&&!c.dnf)hurt(c,(vn-12)*0.02,zone,hz[1]);}
  c.onWall=true;
  // scraping the barrier costs speed: a brush barely hurts, but the longer the car stays against it
  // the harder it drags (bodywork, then tyre, biting into the wall)
  c.wallT=Math.min(2.5,(c.wallT||0)+dt);
  c.v=Math.max(0,c.v-(1.2+3.6*c.wallT+26*into)*dt);
  if(into>0){const ta=Math.atan2(fz+w.nz*into,fx+w.nx*into);c.chi=cd+clamp(wrapA(ta-cd),-1.5*dt,1.5*dt);c.yaw+=clamp(wrapA(ta-c.yaw),-0.5*dt,0.5*dt);}
}

// cars: contact only stops them overlapping — no rotation, no sideways shove, no bounce.
// The car driving into the other just gives up the closing speed (rear car matches the car ahead).
function collide(){
  for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++){const A=cars[a],B=cars[b];
    if(A.parked||B.parked)continue;
    const dx=B.x-A.x,dz=B.z-A.z;if(dx*dx+dz*dz>40)continue;
    if(A.pitStop>0||B.pitStop>0)continue;
    const h=obbHit(A,B);if(!h)continue;
    const ca=A.chi??A.yaw,cb=B.chi??B.yaw,fa=Math.cos(ca)*h.nx+Math.sin(ca)*h.nz,fb=Math.cos(cb)*h.nx+Math.sin(cb)*h.nz;
    const ua=fa*A.v,ub=fb*B.v,closing=ua-ub;
    // the car moving into the other is mostly blocked (takes ~80 % of the separation) and the car it
    // hits is nudged a little (~20 %); small capped correction per step so nothing pops or bounces
    const wa=Math.max(0,ua),wb=Math.max(0,-ub),ws=wa+wb,ka=0.2+0.6*(ws>0.01?wa/ws:0.5),cor=Math.min(h.pen*0.6,0.15);
    A.x-=h.nx*cor*ka;A.z-=h.nz*cor*ka;B.x+=h.nx*cor*(1-ka);B.z+=h.nz*cor*(1-ka);
    if(closing<=0)continue;
    // Only the velocity ALONG the contact normal is taken away; the rest of the car's motion carries
    // on. The old version scaled the whole speed to match the normal component, so two cars brushing
    // side by side at a few degrees lost almost all their speed in one frame at 300 km/h — and the
    // pack behind piled into them. Now a glancing touch scrubs a little speed and turns the car a
    // degree or two away; only a genuine rear-ender loses the closing speed.
    const sa=ws>0.01?wa/ws:0.5,dA=closing*(0.15+0.7*sa),dB=closing-dA;
    contactPush(A,h.nx,h.nz,dA);contactPush(B,h.nx,h.nz,-dB);
    const hitter=sa>=0.5?A:B;
    jolt(A,-h.nx,-h.nz,h.px,h.pz,closing);jolt(B,h.nx,h.nz,h.px,h.pz,closing);
    if(hitter&&closing>13){const am=(closing-13)*0.012,vic=hitter===A?B:A,zh=hitZone(hitter,h.px,h.pz),zv=hitZone(vic,h.px,h.pz);
      hurt(hitter,am,zh[0],zh[1]);   // mostly the front wing
      hurt(vic,am*0.5,zv[0],zv[1]);} // the car that was hit: its rear wing / a front wing
    // a big shunt (debris everywhere) brings out the Safety Car; nobody retires from it
    if(phase==='race'&&closing>24&&!A.pitSide&&!B.pitSide)incident(hitter,'COLLISION');
    if((A.isPlayer||B.isPlayer)&&closing>3&&simTime-lastContact>1.5){lastContact=simTime;msg('CONTACT'+(closing>10?' · AERO DAMAGE':''));}}
}
let lastContact=-9;
// remove `dn` m/s of velocity along (nx,nz) from a car, keeping its tangential motion. The heading
// turns with the travel direction (no induced slide); anything that would swing the car round or
// send it backwards is instead taken off its speed, so a contact can never spin or reverse a car.
function contactPush(C,nx,nz,dn){
  const ch=C.chi??C.yaw,vx=Math.cos(ch)*C.v-nx*dn,vz=Math.sin(ch)*C.v-nz*dn,nv=Math.hypot(vx,vz);
  if(nv<0.05){C.v=0;return;}
  const nc=Math.atan2(vz,vx),d=wrapA(nc-ch);
  // a contact bends the path by at most ~1.7° per step and leaves the body alone: the body turns after it through the
  // normal damped follow (snapping yaw by up to 17° in one step was the "flick" on every touch); the rest is speed lost
  if(Math.abs(d)>0.03){C.chi=ch+Math.sign(d)*0.03;C.v=Math.max(0,vx*Math.cos(C.chi)+vz*Math.sin(C.chi));return;}
  C.chi=nc;C.v=nv;}
// visual-only impact motion: a damped twist/shake of the car body (the camera is not affected)
function jolt(c,dx,dz,px,pz,sp){const k=Math.min(sp,25),fx=Math.cos(c.yaw),fz=Math.sin(c.yaw);
  const tq=(px-c.x)*dz-(pz-c.z)*dx;c.jyV=clamp((c.jyV||0)-tq*k*0.008,-0.4,0.4);
  c.rollV+=clamp((dx*-fz+dz*fx)*k*0.012,-0.3,0.3);c.pitchV+=clamp((dx*fx+dz*fz)*k*0.008,-0.2,0.2);}
// separating-axis test between two car boxes → penetration, normal (A→B), contact point
function obbHit(A,B){
  const af=[Math.cos(A.yaw),Math.sin(A.yaw)],ar=[-af[1],af[0]],bf=[Math.cos(B.yaw),Math.sin(B.yaw)],br=[-bf[1],bf[0]];
  const dx=B.x-A.x,dz=B.z-A.z;let best=1e9,nx=0,nz=0,fromA=true;
  for(const [u,own] of [[af,1],[ar,1],[bf,0],[br,0]]){
    const ra=HX*Math.abs(af[0]*u[0]+af[1]*u[1])+HZ*Math.abs(ar[0]*u[0]+ar[1]*u[1]);
    const rb=HX*Math.abs(bf[0]*u[0]+bf[1]*u[1])+HZ*Math.abs(br[0]*u[0]+br[1]*u[1]);
    const dist=dx*u[0]+dz*u[1],ov=ra+rb-Math.abs(dist);if(ov<=0)return null;
    if(ov<best){best=ov;const s=dist<0?-1:1;nx=u[0]*s;nz=u[1]*s;fromA=!!own;}}
  // deepest vertex of the incident box (average when an edge lies flat against the face)
  const pts=fromA?corners(B):corners(A),sg=fromA?-1:1;let m=-1e9;for(const p of pts)m=Math.max(m,sg*(p[0]*nx+p[1]*nz));
  let px=0,pz=0,n=0;for(const p of pts)if(sg*(p[0]*nx+p[1]*nz)>m-0.08){px+=p[0];pz+=p[1];n++;}
  return {pen:best,nx,nz,px:px/n,pz:pz/n};}

/* ================= RACE CONTROL ================= */
function startPit(c){
  if(!c.isPlayer){const i=idxSp(BOX_S[c.team]);c.idx=i;c.x=X[i]-TZ[i]*(PIT_OFF+BOX_D);c.z=Z[i]+TX[i]*(PIT_OFF+BOX_D);c.yaw=c.chi=ANG[i];c.r=0;c.delta=0;}
  // a new front wing: the player's MFD setting (AUTO = only if it is damaged), the AI whenever it is damaged
  c.wingChange=wingNeeded(c);
  c.pitStop=2.2+rand(0,.7)+(c.wingChange?5+rand(0,1.5):0);c.v=0;c.boxDone=true;c.pitCount++;c.drsOpen=false;c.autoBox=false;
  if(c.isPlayer)msg('PIT STOP · '+COMP[c.nextComp].name+(c.wingChange?' · NEW FRONT WING':''));}
function wingNeeded(c){const d=c.dm,fw=d?Math.max(d.fwL,d.fwR):0;
  if(c.isPlayer&&c.pitWing==='CHANGE')return true;if(c.isPlayer&&c.pitWing==='NO')return false;return fw>0.1||(!d&&c.damage>0.05);}
function finishPit(c){c.pitStop=0;c.comp=c.nextComp;c.wear=0;c.used.add(c.comp);c.mesh.band.color.setHex(COMP[c.comp].hex);c.tT=[80,80,80,80];
  if(c.wingChange){c.wingShare=0;if(c.dm){c.dm.fwL=0;c.dm.fwR=0;c.damage=dmgOverall(c.dm);}else c.damage=0;}c.wingChange=false;
  if(!c.isPlayer){c.pitLap=Infinity;c.nextComp=c.comp==='H'?'M':'H';}else{c.nextComp=c.comp==='H'?'M':'H';if(c.planLap!=null&&c.planLap<=c.lapCount+1)c.planLap=null;msg('GO GO GO');}}
function trackLimit(c){
  if(session==='tt'){if(c.isPlayer)ttInvalidate('TRACK LIMITS');return;}
  if(session==='quali'){if(c.isPlayer&&qStage==='flying'&&!c.lapInvalid){c.lapInvalid=true;msg('LAP DELETED · YOU START LAST');}return;}
  c.tl++;if(!c.isPlayer){if(c.tl>=4)c.pen+=5;return;}
  if(c.tl>=4){c.pen+=5;msg('5 SECOND PENALTY · TRACK LIMITS');}
  else if(c.tl===3)msg('BLACK AND WHITE FLAG · TRACK LIMITS');
  else msg('TRACK LIMITS '+c.tl+'/3');}
function sectorDone(c,k,t){const st=t-c.secStart;c.secStart=t;
  if(k===0){c.sec=[st,null,null];c.secCol=['','',''];}else c.sec[k]=st;
  c.secCol[k]=(bestSecAll[k]==null||st<bestSecAll[k])?'pu':(c.bestSec[k]==null||st<c.bestSec[k])?'gr':'ye';
  if(c.bestSec[k]==null||st<c.bestSec[k])c.bestSec[k]=st;if(bestSecAll[k]==null||st<bestSecAll[k])bestSecAll[k]=st;}
function lapCross(c){
  if(session==='tt'){if(c===player){c.fuel=12;ttCross(c);}return;}
  if(session==='quali'){if(c===player)qualiCross(c);return;}
  c.lapCount++;const t=simTime;
  // reversing back over the line in the pit lane and driving forward again must not log a lap
  if(c.lapCount<=(c.maxLap??-1)||c.dnf)return;c.maxLap=c.lapCount;
  if(c.lapCount===0){c.lapStart=raceStart??t;c.secStart=c.lapStart;return;}
  sectorDone(c,2,t);const lt=t-c.lapStart;c.lastLap=lt;c.lapStart=t;
  if(c.bestLap==null||lt<c.bestLap)c.bestLap=lt;
  if(!fastest||lt<fastest.t){fastest={t:lt,car:c};if(c.isPlayer&&c.lapCount>1)msg('FASTEST LAP',fmt(lt));}
  if(!checkered&&c.lapCount>=targetLaps){checkered=true;if(!c.isPlayer)msg('CHEQUERED FLAG · '+c.code+' WINS');}
  if(checkered&&!c.finished){c.finished=true;c.finishT=t-raceStart;if(c.isPlayer){msg('FINISH · P'+(order().indexOf(c)+1));setTimeout(showResults,3000);}}
}
function detect(c,k){const t=simTime;let ok=false;for(const o of cars){if(o===c)continue;const ot=o.detT[k];if(ot!=null&&t-ot>=0&&t-ot<=DRS_GAP)ok=true;}
  c.detT[k]=t;c.drsElig[k]=phase==='quali'?true:(ok&&drsEnabled&&phase==='race');}

function post(c){
  const ps=c.s;locate(c);
  const sp=spOf(c.s);
  const wasPit=c.pitSide;
  if(!(sp>PIT_B&&sp<PIT_C))c.pitSide=c.d>PITWALL;
  if(wasPit&&!c.pitSide&&sp>PIT_C-20)c.exitUntil=(c.s+240)%L; // just rejoined: stay right, off the racing line
  walls(c);
  const hw=HWa[c.idx];
  const s=c.s,ad=Math.abs(c.d),inPit=sp>(c.pitPlan?PIT_A-70:PIT_A)&&sp<PIT_D&&c.d>hw;
  c.surf=(ad<=hw||inPit)?1:(ad<=hw+KERB_W&&KB[c.idx])?0.95:0.8;
  c.limiter=c.pitSide&&sp>PIT_L&&sp<PIT_C;
  if(c.limiter&&c.v>PIT_LIMIT)c.v=PIT_LIMIT;
  const box=BOX_S[c.team],psp=spOf(ps);
  if(phase==='race'&&c.pitSide&&!c.boxDone&&!c.dnf){
    // the player only has to drive INTO the painted box (7.5 × 3.6 m): from there the car stops on its marks by
    // itself and the stop runs (physics → autoBox). Backing into it after an overshoot works as well. The AI drives to it.
    if(c.isPlayer){const along=box-sp,lat=PIT_OFF+BOX_D-c.d;
      if(!c.autoBox&&!c.revIn&&along>-1.2&&along<6.6&&Math.abs(lat)<1.8&&c.v<PIT_LIMIT+2){c.autoBox=true;c.steerIn=0;msg('BOX','CAR STOPPING ON ITS MARKS');}
      else if(!c.autoBox&&c.v<0.4&&Math.abs(along)<3.7&&Math.abs(lat)<1.8&&!c.revIn)startPit(c);}
    else if(c.pitPlan&&psp<box&&sp>=box)startPit(c);}
  if(sp>PIT_D&&sp<PIT_D+120&&c.boxDone){c.boxDone=false;c.pitPlan=false;}
  if(phase==='race'||phase==='quali'){const off=ad>hw+KERB_W+1.2*CAR_SZ&&!inPit&&!c.pitSide;if(off&&!c.tlOut){c.tlOut=true;trackLimit(c);}else if(ad<hw)c.tlOut=false;}
  if(session==='tt'&&c.isPlayer){if(c.pitSide)ttInvalidate('PIT LANE');ttTrack(c);}
  if(ps>L-80&&s<80)lapCross(c);else if(ps<80&&s>L-80&&session!=='tt')c.lapCount--;
  if(c.lapCount>=0)for(let k=0;k<2;k++)if(ps<SEC[k]&&s>=SEC[k]&&s-ps<50)sectorDone(c,k,simTime);
  c.progress=c.lapCount*L+s;
  for(let k=0;k<DRSZ.length;k++){const dz=DRSZ[k].det;if(ps<dz&&s>=dz&&s-ps<50)detect(c,k);}
  c.zone=c.pitSide?-1:drsZoneOf(s);
  if(c.drsOpen&&(c.zone<0||c.brake>0.05||yellowAt(s)))c.drsOpen=false;
  // AI only runs DRS where the road is genuinely straight — the wing loss would send it wide in a fast bend
  if(!c.isPlayer&&c.zone>=0&&c.drsElig[c.zone]&&drsEnabled&&c.brake<0.05&&!yellowAt(s)){let flat=true;
    for(let k=0;k<Math.round((30+c.v*1.6)/DS);k++)if(Math.abs(K[(c.idx+k)%N])>1/900){flat=false;break;}
    c.drsOpen=flat;}
}

function computeTow(){for(const c of cars){c.tow=0;if(c.parked)continue;for(const o of cars){if(o===c||o.parked)continue;let a=o.s-c.s;if(a<-L/2)a+=L;else if(a>L/2)a-=L;
  if(a>3&&a<45&&Math.abs(o.d-c.d)<1.8)c.tow=Math.max(c.tow,1-a/45);}}}

/* ================= DRIVER INPUT / AI ================= */
function playerControl(dt){const c=player;if(c.auto){aiDrive(c,dt);return;}const tg=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  // steering winds on in ~0.25 s at low speed and ~0.75 s at 300 km/h and centres in ~0.2 s: a keyboard tap gives a
  // gentle, progressive turn instead of flicking the car left-right; throttle and brake ~35 ms
  // catching a slide (steering towards the direction of travel) the hands are quick: lock-to-lock in ~0.25 s
  const bTr=SLIDE>0&&c.chi!==undefined?wrapA(c.chi-c.yaw):0,catching=tg*bTr>0&&Math.abs(bTr)>0.03;
  const rate=catching?8:(tg===0||Math.sign(tg)!==Math.sign(c.steerIn))?5:4/(1+c.v/40);c.steerIn+=clamp(tg-c.steerIn,-rate*dt,rate*dt);
  c.throttle+=clamp((keys.KeyW?1:0)-c.throttle,-35*dt,30*dt);c.brake+=clamp((keys.Space?1:0)-c.brake,-35*dt,30*dt);
  if(c.throttle<0.01)c.throttle=0;if(c.brake<0.01)c.brake=0;c.revIn=!!keys.KeyS;
  if(c.dnf){c.throttle=0;c.brake=1;c.steerIn=0;}}

function aiDrive(c,dt){
  if(c.pitStop>0)return;
  if(c.dnf){c.throttle=0;c.brake=1;c.deltaCmd=0;return;}
  // stuck against a barrier (no reverse gear): steer back towards the racing surface and crawl out
  if(c.onWall&&c.v<4){c.stuck=(c.stuck||0)+dt;
    if(c.stuck>0.6){c.deltaCmd=clamp(-c.d*0.06,-0.3,0.3);c.throttle=0.55;c.brake=0;
      if(c.stuck>5){c.yaw=c.chi=ANG[c.idx];c.stuck=0;}return;}}
  else c.stuck=0;
  const sp=spOf(c.s);
  if(!c.pitPlan&&c.pitLap===c.lapCount+1&&sp>-800&&sp<-420&&!c.finished)c.pitPlan=true;
  const look=Math.max(12,6+c.v*0.45+Math.max(0,c.v-50)*0.35),ia=(c.idx+Math.round(look/DS))%N,spa=spI(ia);
  let vcap=1e9,passT=null,yielding=false,ahead=null,aheadA=1e9,beside=null;
  for(const o of cars){if(o===c||o.parked)continue;let a=o.s-c.s;if(a<-L/2)a+=L;else if(a>L/2)a-=L;const lat=o.d-c.d;
    if(a>0&&a<30+c.v*1.8&&Math.abs(lat)<3.0&&o.pitSide===c.pitSide){
      if(a<aheadA){aheadA=a;ahead=o;} // the car directly ahead in our lane (the nearest one, not whichever came last)
      // keep a braking-safe gap (reaction margin + car length) to the car ahead in our lane
      // gap = one car length + margin; 9 m used to freeze the whole grid behind cars 8 m apart
      // keep a car length + ~0.3 s of headway, and assume a conservative braking rate
      // (the first lap used a 0.55 s headway and 14 m/s² of braking: the whole pack queued up and lifted into turn 1,
      // and the player drove round the outside of half the field. The cars can brake at ~25 m/s², so 20 is still safe.)
      vcap=Math.min(vcap,Math.sqrt(o.v*o.v+2*20*Math.max(0,a-7.5-c.v*0.3))+(c.v<8&&o.v<8?2.5:0));}
    if(Math.abs(a)<7&&Math.abs(lat)<3.5&&o.pitSide===c.pitSide&&(!beside||Math.abs(lat)<Math.abs(beside.d-c.d)))beside=o;
    if(a<0&&a>-45&&o.progress>c.progress+L*0.5)yielding=true;}
  // ---- lateral plan. Every decision is COMMITTED: the side is picked once and held until the move is over. The old
  // code re-picked the passing side every frame from whichever side looked roomier, so two cars nose to tail swung
  // 7–8 m across the road and back again and again down every straight (and a lapped car's yielding side followed
  // the sign of the racing line, which flips as the line crosses the road). ----
  const hwc=HWa[c.idx],edge=hwc-1.4;
  if(c.passCar){let a=c.passCar.s-c.s;if(a<-L/2)a+=L;else if(a>L/2)a-=L; // done (we are past) or dropped back
    if(a<-8||a>70+c.v*0.6||c.passCar.pitSide!==c.pitSide)c.passCar=null;}
  if(yielding){if(!c.yieldSide)c.yieldSide=c.d>=0?1:-1;passT=c.yieldSide*(hwc-2.2)-RL[c.idx];}
  else{c.yieldSide=0;
    // no overtaking under yellow, the SC or the VSC — except past a wreck or a car crawling back to the pits, or when
    // race control lets you by (waved past the safety car, or a lapped car unlapping itself)
    const slowAhead=ahead&&(ahead.dnf||ahead.v<6);
    if(!c.pitPlan&&((!yellowAt(c.s)&&!scActive())||slowAhead||c.waveBy||c.unlap)){
      const o=ahead&&c.v>ahead.v-1&&aheadA<40+c.v*0.6?ahead:null;
      if(o&&c.passCar!==o){ // a new pass: choose the roomier side; if it is close, the inside of the next corner
        const lr=o.d+edge,rr=edge-o.d;let side=rr>lr?1:-1;
        if(Math.abs(rr-lr)<1.5){for(let j=0;j<Math.round(400/DS);j++){const kk=K[(c.idx+j)%N];if(Math.abs(kk)>1/300){side=kk>0?1:-1;break;}}}
        c.passCar=o;c.passSide=side;c.passT0=simTime;}
      if(c.passCar){const p=c.passCar,room=c.passSide>0?edge-p.d:p.d+edge,other=c.passSide>0?p.d+edge:edge-p.d;
        if(room>4.0)passT=clamp(p.d+c.passSide*3.8,-edge,edge)-RL[c.idx];
        // our side has closed up: wait in line behind; swap sides only if the other is clearly open, and not often
        // (a door slammed shut — room under 2.5 m — may be answered at once)
        else if(other>5.5&&(simTime-c.passT0>1.5||room<2.5)){c.passSide=-c.passSide;c.passT0=simTime;}}
      // a car alongside: keep to the side we are already on (a tiny lateral gap must not flip it)
      if(passT==null&&beside){const lat=beside.d-c.d,side=Math.abs(lat)<0.5?(c.besideSide||1):-Math.sign(lat);
        c.besideSide=side;passT=clamp(beside.d+side*3.6,-edge,edge)-RL[c.idx];}}
    else c.passCar=null;} // a pass under way is abandoned when the yellow / SC / VSC comes out
  // rejoining from the pit exit at low speed: keep to the right-hand edge until up to speed, never swing across the
  // racing line in front of cars arriving at full speed
  if(c.exitUntil!=null&&(fwd(c.s,c.exitUntil)<0||c.pitSide))c.exitUntil=null;
  if(c.exitUntil!=null&&!yielding)passT=(hwc-2.0)-RL[c.idx];
  // waved past the safety car: go by on the side it has left open
  if((c.waveBy||c.unlap)&&scOn()&&sc.wave){const g=fwd(c.s,sc.s);if(g>-12&&g<90)passT=-sc.waveSide*(hwc-2.4)-RL[c.idx];}
  // the start: hold your grid column (left or right) down to the first braking zone instead of all funnelling onto the
  // racing line within a couple of seconds and queueing nose to tail — the player could drive round the whole queue
  if(passT==null&&!yielding&&c.lapCount<=0&&c.gridD!=null){const until=c.lapCount<0?-1e9:c.s;
    const w=c.lapCount<0?1:clamp((FIRST_BRAKE-120-until)/350,0,1);if(w>0)passT=w*(clamp(c.gridD,-edge,edge)-RL[c.idx]);}
  // defending: with a car within 20 m behind and a corner coming, cover the inside — ONE move, held to the corner
  if(passT==null&&!yielding&&!c.pitPlan&&!scActive()&&c.lapCount>=0){
    if(c.defUntil!=null&&fwd(c.s,c.defUntil)<0)c.defUntil=null;
    if(c.defUntil==null){let att=null;for(const o of cars){if(o===c||o.dnf||o.parked||o.pitSide!==c.pitSide)continue;const a=fwd(c.s,o.s);
        // only a car sitting right in our wake (not one already pulling out to pass), and only on the straight —
        // a move made under braking, into the side the attacker already chose, is how cars get punted off
        if(a<-6&&a>-20&&o.v>c.v-2&&Math.abs(o.d-c.d)<1.5&&!o.passCar){att=o;break;}}
      let braking=false;for(let j=0;j<Math.round(150/DS);j++)if(VP[(c.idx+j)%N]<c.v*0.92){braking=true;break;}
      if(att&&!braking){for(let j=Math.round(150/DS);j<Math.round(400/DS);j++){const kk=K[(c.idx+j)%N];if(Math.abs(kk)>1/250){
        c.defSide=kk>0?1:-1;c.defUntil=(c.s+j*DS+60)%L;break;}}}}
    if(c.defUntil!=null)passT=c.defSide*(edge-0.8)-RL[c.idx];}
  if(passT!=null)vcap=Math.max(vcap,4);
  if(passT!=null){c.laneOffT=passT;c.laneHold=1.3;}else if((c.laneHold-=dt)<=0)c.laneOffT=0;
  // lateral moves are slower at speed: a 3.8 m step takes ~2.5 s at 300 km/h instead of a flick
  const lrate=clamp(1.2+28/Math.max(c.v,10),1.2,2.2);
  c.laneOff+=clamp(c.laneOffT-c.laneOff,-lrate*dt,lrate*dt);
  let off=clamp(RL[ia]+c.laneOff,-(HWa[ia]-1.4),HWa[ia]-1.4);
  // pitting: keep the normal line into the entry and simply follow the lane as it peels away — never
  // snap across the track (the entry now sits in a corner complex, where that meant the wall)
  if(c.pitPlan){
    if(spa>=PIT_A&&spa<PIT_B)off=Math.max(off,pitOffSp(spa));
    else if(spa>=PIT_B&&spa<=PIT_D){
      // drive down the fast lane, swing into the working lane for the box and back out after the stop
      off=pitOffSp(spa)+FAST_D*clamp(Math.min((spa-PIT_B)/40,(PIT_C-spa)/40),0,1);
      const bs=BOX_S[c.team],u=!c.boxDone?smooth(clamp((sp-(bs-48))/34,0,1)):1-smooth(clamp((sp-bs)/30,0,1));
      if(u>0&&sp>bs-60&&sp<bs+40)off=off*(1-u)+(PIT_OFF+BOX_D)*u;}
    else if(spa>PIT_A-120&&spa<PIT_A)off=Math.max(off,-HWa[ia]+(2*HWa[ia]-3)*(spa-PIT_A+120)/120);}
  else{ // never steer into a car that is overlapping us lengthwise: keep ~3.4 m apart (eased in, no jerk)
    let offC=off;for(const o of cars){
      if(o===c||o.pitSide!==c.pitSide)continue;let a=o.s-c.s;if(a<-L/2)a+=L;else if(a>L/2)a-=L;
      if(a>-7.5&&a<7.5&&Math.abs(o.d-c.d)<5){if(o.d>=c.d)offC=Math.min(offC,o.d-3.4);else offC=Math.max(offC,o.d+3.4);}}
    c.sep=(c.sep||0)+clamp((offC-off)-(c.sep||0),-3*dt,3*dt);off+=c.sep;}
  const tx=X[ia]-TZ[ia]*off,tz=Z[ia]+TX[ia]*off,dx=tx-c.x,dz=tz-c.z;
  // aim from the direction the car is actually TRAVELLING (chi), not where the body points: at 300 km/h the body
  // leads the path by a yaw lag of ~0.25 s, and aiming off the body made the AI snake ±3 m down every straight
  const ld=Math.hypot(dx,dz),alpha=wrapA(Math.atan2(dz,dx)-(c.chi??c.yaw)),kap=2*Math.sin(alpha)/Math.max(ld,1);
  // pure pursuit + cross-track correction, so the car actually sits on its line instead of drifting wide
  const err=c.d-(RL[c.idx]+c.laneOff+(c.sep||0));
  // …plus yaw-rate damping: steer against any yaw rate beyond what the pursuit arc asks for
  c.deltaCmd=Math.atan(WB*kap)-clamp(err*0.004,-0.02,0.02)-0.5*(c.r-c.v*kap)*WB/Math.max(c.v,10);
  let vt=1e9;for(let j=0;j<4;j++)vt=Math.min(vt,VP[(c.idx+j)%N]);
  vt*=c.skill*Math.sqrt(tyreGrip(c)/0.975)*(1-0.12*c.damage);
  if(yielding)vt*=0.95;if(c.finished)vt*=0.6;vt=Math.min(vt,vcap);
  // yellow: lift for a single, slow down significantly for a double (and no DRS in either). The cut is eased in — it
  // starts with a yellow in the next sectors and the target pace drops by ~8 %/s — so the cars ahead slow down
  // gradually by lifting instead of all stamping on the brakes at the flag post; it comes back off at ~25 %/s
  if(session==='race'){const fl=flagAt(c.s),yf=fl===2?0.72:fl===1?0.9:yellowAhead(c.s)?0.96:1;
    c.yf=(c.yf??1)+clamp(yf-(c.yf??1),-0.08*dt,0.25*dt);vt*=c.yf;if(fl)c.drsOpen=false;}
  else c.yf=1;
  if(session==='race'&&scActive())vt=Math.min(vt,scCap(c));
  // now and then a driver overcooks a braking zone (≈ once per 300 car-laps): too fast into the corner for ~1.5 s
  if(session==='race'&&!scActive()&&c.lapCount>=0){if(c.mLap!==c.lapCount){c.mLap=c.lapCount;c.mAt=rnd()<0.0035?rnd()*L:null;}
    if(c.mAt!=null&&fwd(c.mAt,c.s)>=0&&fwd(c.mAt,c.s)<30){c.mArm=true;c.mAt=null;} // armed: the next big stop goes wrong
    if(c.mArm&&VP[(c.idx+Math.round(80/DS))%N]<c.v*0.7){c.mArm=false;c.mT=simTime+1.5;}
    if(c.mT>simTime)vt=Math.max(vt,c.v*0.985);}
  // full speed down the entry taper; brake late and hard so the car arrives at the limiter line at
  // exactly 60 km/h — the only slowing happens inside the lane, right before the line
  if(c.pitPlan){if(sp>PIT_A-400&&sp<PIT_L)vt=Math.min(vt,Math.sqrt(PIT_LIMIT**2+2*20*Math.max(0,PIT_L-18-sp)));
    // box speed rules only apply past the 60 km/h line
    if(c.pitSide&&!c.boxDone){const bs=BOX_S[c.team];if(sp<bs&&sp>PIT_L-2)vt=Math.min(vt,PIT_LIMIT-0.4,Math.sqrt(2*7*Math.max(0,bs-sp))+1.2);}}
  if(c.limiter)vt=Math.min(vt,PIT_LIMIT-0.4);
  const dv=vt-c.v;
  if(dv<-0.3){c.brake=clamp(-dv/1.5,0,1);c.throttle=0;}else{c.brake=0;c.throttle=clamp(dv/0.8+0.1,0,1);}
}

/* ================= MAIN STEP ================= */
function orderCmp(a,b){
  if(!!a.dnf!==!!b.dnf)return a.dnf?1:-1; // retired cars drop to the bottom (in the order they got furthest)
  if(a.dnf&&b.dnf)return b.progress-a.progress;
  const la=Math.min(a.lapCount,targetLaps),lb=Math.min(b.lapCount,targetLaps);
  if(a.finished&&b.finished)return (lb-la)||(a.finishT-b.finishT);
  if(a.finished!==b.finished){const f=a.finished?a:b,u=a.finished?b:a;const r=u.lapCount>f.lapCount?(a===u?-1:1):(a===f?-1:1);return r;}
  return b.progress-a.progress;}
const order=()=>cars.slice().sort(orderCmp);

/* ================= RACE CONTROL: FIA flags, Virtual Safety Car, Safety Car =================
   Follows the FIA International Sporting Code (Appendix H, flag signals) and the F1 Sporting Regulations (Safety Car,
   Virtual Safety Car):
   · The lap is divided into MARSHAL SECTORS of ~250 m. Each starts at a marshal post with an LED light panel.
   · SINGLE waved yellow — a hazard beside or partly on the track: slow down, no overtaking, be ready to change direction.
     DOUBLE waved yellow — the track is wholly or partly blocked, or marshals are working on or beside it: slow down
     significantly, no overtaking, be ready to stop. The yellow is shown at the post of the incident's sector (and the
     post before, when the incident is right after a post); the GREEN flag at the next post ends the zone.
   · In this game a yellow only ever comes out in the ~5 s before a Safety Car (a double yellow at the incident — see
     incident()); small offs, stops and touches show nothing.
   · Overtaking a running car in a yellow zone, or under the SC, has to be undone (give the place back) within
     ~12 s, or it is a 5 s penalty. Not slowing down through a double yellow is a 5 s penalty. DRS is closed in yellow sectors.
   · There is NO SC / VSC delta time: under the SC the field closes up into a train behind it. (The VSC code remains
     but nothing calls it any more.)
   · SAFETY CAR — it leaves the pit lane with its orange lights on and goes round in front of the leader; any car between it
     and the leader is waved past (green lights). Nobody overtakes; the field closes up behind. Once the incident is
     cleared: "LAPPED CARS MAY NOW OVERTAKE", then "SAFETY CAR IN THIS LAP" (orange lights off) — it peels into the pit
     lane at the end of that lap, the leader sets the pace, and overtaking is allowed again from the control line.
   · DRS is re-enabled one lap after the green flag (SC or VSC). ---- */
const secOf=s=>s<SEC[0]?0:s<SEC[1]?1:2;
const MS_N=clamp(Math.round(L/250),12,36),MS_L=L/MS_N;
const msOf=s=>Math.min(MS_N-1,Math.floor((((s%L)+L)%L)/MS_L));
let hazards=[];const msFlag=new Uint8Array(MS_N),msGreen=new Float32Array(MS_N).fill(-1);
let vsc=null,drsResume=null,cautionT0=-9;
const fwd=(a,b)=>{let d=b-a;if(d<-L/2)d+=L;else if(d>L/2)d-=L;return d;}; // signed distance from s=a forward to s=b
// a hazard at s: sev 1 = single yellow, 2 = double yellow; an existing one close by is extended instead of duplicated
function hazard(s,sev,dur){if(phase!=='race')return;for(const z of hazards)if(Math.abs(fwd(z.s,s))<60){z.sev=Math.max(z.sev,sev);z.until=Math.max(z.until,simTime+dur);return;}
  hazards.push({s,sev,until:simTime+dur});}
function computeFlags(){
  hazards=hazards.filter(z=>simTime<z.until);
  const prev=msFlag.slice();msFlag.fill(0);
  for(const z of hazards){const k=msOf(z.s);msFlag[k]=Math.max(msFlag[k],z.sev);
    if(z.s-k*MS_L<40){const p=(k-1+MS_N)%MS_N;msFlag[p]=Math.max(msFlag[p],1);}} // right past a post: the post before warns too
  for(let k=0;k<MS_N;k++){
    if(msFlag[k]){const n=(k+1)%MS_N;if(!msFlag[n])msGreen[n]=simTime+0.3;} // green at the post that ends the yellow zone
    else if(prev[k])msGreen[k]=simTime+6;}}                              // a sector that has just been cleared
function greenAll(){msGreen.fill(simTime+6);}
const flagAt=s=>msFlag[msOf(s)];
const yellowAt=s=>msFlag[msOf(s)]>0;
const yellowAhead=s=>{const k=msOf(s);return !!(msFlag[(k+1)%MS_N]||msFlag[(k+2)%MS_N]);};
const scOn=()=>!!sc&&sc.phase!=='pit';           // the safety car is out on track (its period is running)
const scActive=()=>scOn()||scRestart||!!vsc;      // neutralised: nobody overtakes, no DRS
// the FIA reference speed for the VSC / SC delta: roughly 40 % slower than racing pace
const refV=i=>Math.min(VP[i]*0.7,52);
function updateFlags(dt){
  if(phase!=='race'||raceStart==null){computeFlags();return;}
  // yellows come out ONLY in the seconds before a Safety Car (see incident()); nothing else shows one
  if(scPending&&simTime>=scPending.at){const p=scPending;scPending=null;deploySC(p.cause);}
  computeFlags();
  playerRules(dt);
  updateVSC(dt);updateSafetyCar(dt);}
// ---- the player and the rules: overtaking under yellow / SC / VSC, lifting for a double yellow, the delta at each post
const pRef=new Float32Array(N); // the player's own speed at each point of the track on green-flag laps (what "slowing down" is measured against)
function playerRules(dt){const p=player;if(!p||p.dnf||session!=='race')return;p.infr=p.infr||[];
  const fl=p.pitSide?0:flagAt(p.s),neutral=vsc||(scOn()&&!p.waveBy&&!p.unlap)||scRestart;
  if(!fl&&!neutral&&!p.pitSide)pRef[p.idx]=p.v;
  // 1) overtaking: only a running car counts (not a wreck, not a car crawling with a problem, not one in the pit lane)
  // (2 s to react after the SC / VSC is called; a car alongside keeps its previous order until 2 m clear)
  const restricted=!p.pitSide&&(fl>0||(neutral&&simTime-cautionT0>2));
  for(const o of cars){if(o===p||o.dnf||o.parked||o.pitSide||o.finished||p.pitSide){o.pRel=null;continue;}
    const g=fwd(p.s,o.s);if(Math.abs(g)>60){o.pRel=null;continue;}
    const ah=g<-2?true:g>2?false:o.pRel;
    if(o.pRel===false&&ah===true&&restricted&&o.v>8&&!p.infr.some(x=>x.o===o)&&!(o.gaveT>simTime-6)){
      const why=scOn()||scRestart?'OVERTAKING UNDER SAFETY CAR':vsc?'OVERTAKING UNDER VSC':'OVERTAKING UNDER YELLOW';
      p.infr.push({o,why,until:simTime+12});msg(why,'GIVE THE POSITION BACK TO '+o.code);}
    o.pRel=ah;}
  for(let k=p.infr.length-1;k>=0;k--){const x=p.infr[k];
    if(x.o.progress>p.progress+2||x.o.dnf||x.o.pitSide){p.infr.splice(k,1);x.o.gaveT=simTime;msg('POSITION RETURNED','NO FURTHER ACTION');}
    else if(simTime>x.until){p.infr.splice(k,1);p.pen+=5;msg(x.why,'5 SECOND TIME PENALTY');}}
  // 2) double yellow: the car has to be clearly slower than the player's own green-flag pace through that stretch
  if(fl===2){const ref=pRef[p.idx]||VP[p.idx]*0.9;p.dyT=(p.dyT||0)+dt;if(p.v>ref*0.9&&p.v>15)p.dyFast=(p.dyFast||0)+dt;
    p.lift=p.v>ref*0.9&&p.v>15;}
  else{if(p.dyT>1.2&&p.dyFast/p.dyT>0.6){p.pen+=5;msg('FAILED TO SLOW FOR DOUBLE YELLOW','5 SECOND TIME PENALTY');}p.dyT=0;p.dyFast=0;p.lift=false;}
  // 3) (no SC / VSC delta time: under the Safety Car the field simply closes up into a train behind it)
  const k=msOf(p.s);
  // 4) race control messages as the flags come into view
  if(!p.pitSide&&!neutral){const st=fl?10+fl:yellowAhead(p.s)?1:0;
    if(st!==p.flagSt){
      if(st===12)msg('DOUBLE YELLOW','MARSHAL SECTOR '+(k+1)+' · SLOW DOWN · BE READY TO STOP');
      else if(st===11)msg('YELLOW FLAG','MARSHAL SECTOR '+(k+1)+' · NO OVERTAKING');
      else if(st===1&&!p.flagSt)msg('YELLOW FLAG AHEAD');
      else if(st===0&&p.flagSt>=10&&!p.infr.length)msg('GREEN FLAG','END OF THE YELLOW ZONE');
      p.flagSt=st;}}}

/* ---- retirements: a heavy hit ends the race. The wreck coasts to a halt where it is; marshals clear it after
   ~25–40 s (a car stopped on the racing surface takes longer). A car blocking the road, a big shunt with debris, or two
   cars out at once bring out the Safety Car; a single car stopped beside the track the Virtual Safety Car. ---- */
function retire(c,why,sp){
  if(c.dnf||phase!=='race')return;c.dnf=true;c.dnfWhy=why;c.dnfLap=c.lapCount;c.drsOpen=false;c.throttle=0;c.brake=1;c.damage=1;
  const onRoad=Math.abs(c.d)<HWa[c.idx]-0.5&&!c.pitSide;
  c.clearAt=simTime+(onRoad?40:25)+rand(0,10);
  hazard(c.s,2,c.clearAt-simTime+4);
  const wrecks=cars.filter(o=>o.dnf&&!o.parked).length;
  if(c.isPlayer){msg('RETIRED · '+why,'Your race is over');setTimeout(showResults,3500);}
  else msg(c.code+' OUT · '+why);
  if(checkered||c.pitSide)return;
  if(onRoad||sp>26||wrecks>=2)deploySC(c);else deployVSC(c);}
/* ---- incidents: a big shunt (heavy wall impact, a high-speed collision) leaves debris on the track. Nobody retires —
   only the wings get damaged — but the debris needs the Safety Car: race control shows a DOUBLE YELLOW at the scene for
   ~5 s (the only time a yellow ever comes out), then the SC is deployed. Marshals need ~35–50 s to clear the debris. ---- */
let scPending=null,debrisUntil=0;
function resetRaceControl(){sc=null;scRestart=false;restartGo=false;vsc=null;drsResume=null;hazards=[];msFlag.fill(0);msGreen.fill(-1);
  scPending=null;debrisUntil=0;if(scMesh)scMesh.visible=false;}
function incident(c,why){if(phase!=='race'||raceStart==null||checkered||scOn()||scPending||session!=='race')return;
  scPending={at:simTime+5,cause:c};c.incWhy=why;debrisUntil=simTime+5+rand(35,50);
  hazard(c.s,2,30);
  msg('DOUBLE YELLOW',c.code+' · '+why+' · SAFETY CAR TO BE DEPLOYED');}
function clearWrecks(){for(const c of cars)if(c.dnf&&!c.parked&&simTime>=c.clearAt){
  if(c.isPlayer){c.v=0;c.held=true;continue;} // the camera stays on your car
  c.parked=true;c.mesh.root.visible=false;c.held=true;c.v=0;}}
// a cheap stop under SC / VSC: an AI car due to pit in the next few laps comes in now
function pitUnderCaution(){for(const c of cars)if(!c.isPlayer&&!c.dnf&&!c.pitSide&&c.pitCount===0&&isFinite(c.pitLap)&&c.pitLap-c.lapCount<=3)c.pitLap=c.lapCount+1;}

/* ---- Virtual Safety Car ---- */
function deployVSC(cause){if(scOn()||vsc||phase!=='race'||raceStart==null)return;
  vsc={t0:simTime,phase:'on',endAt:null};cautionT0=simTime;for(const c of cars){c.vd=0.6;c.drsOpen=false;}if(player)player.dWarn=0;
  pitUnderCaution();msg('VIRTUAL SAFETY CAR',cause?cause.code+' · '+cause.dnfWhy:'');}
function updateVSC(){if(!vsc)return;
  if(vsc.phase==='on'&&simTime-vsc.t0>20&&!cars.some(c=>c.dnf&&!c.parked&&!c.isPlayer)){vsc.phase='ending';vsc.endAt=simTime+rand(10,15);msg('VSC ENDING','GREEN FLAG IN 10–15 SECONDS');}
  if(vsc.phase==='ending'&&simTime>=vsc.endAt){vsc=null;greenAll();restartDRS();msg('GREEN FLAG','VSC PERIOD OVER');}}
function restartDRS(){let ld=null;for(const c of cars)if(!c.dnf&&!c.parked&&(!ld||c.progress>ld.progress))ld=c;drsResume=ld?ld.progress+L:null;}

/* ---- Safety Car: a road-going GT with a roof light bar (orange: SC out; green: cars may pass it). It is driven, not
   teleported: it waits in the pit lane past the last garage, accelerates out and merges at the exit (holding at the
   red light if the field is about to stream past), runs at a smooth pace in front of the leader, eases aside to wave
   cars by, and on its last lap peels into the pit lane and parks where it started. Its position comes from a
   Catmull-Rom curve through the track samples plus a spring-damped lateral offset; its heading is the direction it is
   actually moving, so nothing snaps from one 2 m sample to the next. ---- */
let sc=null,scMesh=null,scRestart=false,restartGo=false,goSp=-250;
const SC_PARK=Math.min(Math.max(...BOX_S)+28,PIT_C-12),SC_WB=2.63;
// it parks in the working lane past the last garage; where the lane is too short for that (Busan) it waits in the
// fast lane instead, so it never sits on a team's box
const SC_LANE=SC_PARK>Math.max(...BOX_S)+15?PIT_OFF+BOX_D:PIT_OFF+FAST_D;
const _tp={x:0,z:0},_tp2={x:0,z:0};
function trackPt(s,d,out){const f=((s%L)+L)%L/DS,i=Math.floor(f),u=f-i,i0=(i-1+N)%N,i1=i%N,i2=(i+1)%N,i3=(i+2)%N;
  const cr=(a,b,c,e)=>0.5*(2*b+(c-a)*u+(2*a-5*b+4*c-e)*u*u+(3*b-a-3*c+e)*u*u*u);
  const tx=TX[i1]+(TX[i2]-TX[i1])*u,tz=TZ[i1]+(TZ[i2]-TZ[i1])*u,l=Math.hypot(tx,tz)||1;
  out.x=cr(X[i0],X[i1],X[i2],X[i3])-tz/l*d;out.z=cr(Z[i0],Z[i1],Z[i2],Z[i3])+tx/l*d;return out;}
function deploySC(cause){
  if(phase!=='race'||raceStart==null||scOn())return;
  if(vsc)vsc=null; // the VSC is upgraded
  if(!scMesh)scMesh=buildSCMesh();
  if(sc&&sc.phase==='pit'){sc.phase='exit';} // it was on its way in: it simply carries on down the lane and out again
  else{const s=((SC_PARK%L)+L)%L;sc={phase:'exit',s,v:0,a:0,d:pitOffSp(SC_PARK)-PIT_OFF+SC_LANE,dv:0,yaw:ANG[idxSp(SC_PARK)],x:0,z:0,hold:0,
    rollV:0,roll:0,pitchV:0,pitch:0,steer:0,yawR:0};
    trackPt(sc.s,sc.d,_tp);sc.x=sc.px=_tp.x;sc.z=sc.pz=_tp.z;sc.pyaw=sc.yaw;}
  cautionT0=simTime;
  Object.assign(sc,{released:false,go:false,hold:0,t0:simTime,cause,lights:'orange',wave:false,waveSide:-1,unlap:false,inAfterLine:false,inDist:0,formed:false});
  scRestart=false;restartGo=false;hazards=[]; // the yellow that announced it is replaced by the SC boards
  for(const c of cars){c.drsOpen=false;c.waveBy=false;c.unlap=false;}
  pitUnderCaution();
  scMesh.visible=true;msg('SAFETY CAR DEPLOYED',cause?cause.code+' · '+(cause.incWhy||cause.dnfWhy||''):'');}
// the nearest running car ahead on the road (within 250 m) and the gap to it
function carAhead(c){let best=null,bg=250;for(const o of cars){if(o===c||o.dnf||o.parked||o.pitSide||o.finished)continue;
  const g=fwd(c.s,o.s);if(g>0&&g<bg){bg=g;best=o;}}return best?{o:best,gap:bg}:null;}
// the first running car behind the safety car on the road
function scLeader(){if(!sc)return null;let best=null,bd=1e9;for(const c of cars){if(c.dnf||c.parked||c.pitSide||c.finished)continue;
  const d=fwd(c.s,sc.s);const dd=d<0?d+L:d;if(dd<bd){bd=dd;best=c;}}return best;}
function scLeaderAny(){let ld=null;for(const c of cars)if(!c.dnf&&!c.parked&&!c.finished&&(!ld||c.progress>ld.progress))ld=c;return ld;}
// under the SC / VSC / restart, the speed a car may run
function scCap(c){if(c.pitSide||c.dnf)return 1e9;
  if(vsc)return refV(c.idx)*0.97;
  if(scRestart&&!scOn())return restartGo?1e9:VP[c.idx]*0.6;
  if(!scOn())return 1e9;
  if(c.waveBy||c.unlap)return VP[c.idx]*0.8; // allowed past: they make their way round to the back of the queue
  // no delta time: every car runs at a brisk ~80 % of racing pace until it has caught the car in front, then sits
  // ~12 m behind it — so the field closes up into a Safety Car train (the leader ~22 m behind the SC)
  let cap=VP[c.idx]*0.8;
  if(sc.phase!=='exit'){const g=fwd(c.s,sc.s),gg=g<0?g+L:g;if(scLeader()===c||gg<60)cap=Math.min(cap,sc.v+clamp((gg-22)*0.4,-sc.v,15));}
  const ah=carAhead(c);if(ah)cap=Math.min(cap,ah.o.v+clamp((ah.gap-12)*0.5,-ah.o.v,15));
  return Math.max(cap,0);}
function updateSafetyCar(dt){
  if(!sc)return;
  sc.px=sc.x;sc.pz=sc.z;sc.pyaw=sc.yaw;
  const sp=spOf(sc.s),i=Math.floor(sc.s/DS)%N,lead=scLeaderAny(),first=scLeader();
  const wrecksLeft=simTime<debrisUntil||cars.some(c=>c.dnf&&!c.parked&&!c.isPlayer);
  // ---- race control decisions
  if(sc.phase==='exit'&&sp>=PIT_D&&sp<PIT_D+200)sc.phase='out';
  if(sc.phase==='out'){
    const gapLead=lead?((fwd(lead.s,sc.s)%L)+L)%L:1e9;if(gapLead<90)sc.formed=true;
    // wave-by: any car between the safety car and the leader is waved past
    if(!sc.unlap&&first&&lead&&first!==lead&&!first.waveBy){const g=((fwd(first.s,sc.s)%L)+L)%L;if(g<160){first.waveBy=true;if(first.isPlayer)msg('SAFETY CAR · WAVED BY','OVERTAKE THE SAFETY CAR AND JOIN THE BACK OF THE QUEUE');}}
    // incident cleared and the queue formed: lapped cars go first, then "in this lap"
    if(!wrecksLeft&&sc.formed&&simTime-sc.t0>35&&!sc.unlap&&!sc.inAfterLine){
      const laps=lead?cars.filter(c=>c!==lead&&!c.dnf&&!c.parked&&!c.pitSide&&!c.finished&&lead.progress-c.progress>L*0.9):[];
      if(laps.length){sc.unlap=true;sc.inAfterLine=true;for(const c of laps){c.unlap=true;if(c.isPlayer)msg('LAPPED CARS MAY NOW OVERTAKE','PASS THE LEADER AND THE SAFETY CAR');}
        msg('LAPPED CARS MAY NOW OVERTAKE');}
      // "in this lap" only with enough of the lap left for the leader to see it coming
      else if((((PIT_A-sp)%L)+L)%L>Math.min(1000,L*0.4)){sc.phase='in';sc.lights='off';sc.inDist=0;msg('SAFETY CAR IN THIS LAP');}}}
  for(const c of cars){if(!c.waveBy&&!c.unlap)continue;const g=fwd(c.s,sc.s);
    if(g<-15||c.pitSide||c.dnf||sc.phase==='pit'){c.waveBy=false;c.unlap=false;}}
  // ---- speed: a smooth target that brakes early and gently for corners (jerk-limited)
  let vt=1e9;
  if(sc.phase==='exit'||sc.phase==='pit'){
    for(let j=0;j<60;j+=2){const k=(i+j)%N;vt=Math.min(vt,Math.sqrt(Math.min(VP[k]*0.62,55)**2+2*6*j*DS));}
    if(sp>PIT_B&&sp<PIT_C)vt=Math.min(vt,sc.phase==='pit'&&sp>PIT_L?PIT_LIMIT:24);
    if(sc.phase==='pit'){const left=SC_PARK-sp;vt=Math.min(vt,left>0.4?Math.max(1.2,Math.sqrt(2*3.2*left)):0);}
    // race control sends it out so that it joins just ahead of the leader (the field runs to the delta meanwhile; at
    // most a lap's wait), and the pit-exit light holds it while a car is about to stream past the merge
    if(sc.phase==='exit'&&sp<PIT_C){const mS=((PIT_D%L)+L)%L,dl=lead?((mS-lead.s)%L+L)%L:0;
      // released when the leader is a few seconds further from the merge than the SC's own run down the lane
      const tSC=Math.max(0,PIT_D-sp)/20+4,tL=lead?dl/Math.max(lead.v,20):0;
      if(!sc.released&&(!lead||(tL>tSC+1.5&&tL<tSC+14)||simTime-sc.t0>150))sc.released=true;
      // the merge is decided once, while it is still parked: wait (max 6 s) for a gap, then go and never stop again —
      // re-checking on the move made it lurch stop-go-stop as each car streamed past the exit
      if(sc.released&&!sc.go){const busy=cars.some(c=>!c.dnf&&!c.parked&&!c.pitSide&&((mS-c.s+L)%L)<160);
        if(!busy||sc.hold>6||sc.v>3)sc.go=true;else sc.hold+=dt;}
      if(!sc.go)vt=0;}}
  // its pace (~55 % of racing speed) is clearly below the FIA delta (~68 %), so the field always closes up on it
  else{for(let j=0;j<90;j+=2){const k=(i+j)%N;vt=Math.min(vt,Math.sqrt(Math.min(VP[k]*0.55,50)**2+2*7*j*DS));}
    // waits for the leader while the field is still strung out behind it
    // (continuous in the gap, and the wave-by slow-down eased in: switching the target between two speeds made the
    // car surge back and forth whenever the gap hovered around the threshold)
    const gl=lead?((fwd(lead.s,sc.s)%L)+L)%L:0;
    sc.wf=(sc.wf??1)+((sc.wave?0.85:1)-(sc.wf??1))*Math.min(1,dt/1.5);
    vt*=(1-0.25*smooth((gl-120)/200)-0.15*smooth((gl-600)/400))*sc.wf;
    if(sc.phase==='in'&&((PIT_A-sp+L)%L)<200)vt=Math.min(vt,Math.max(22,Math.sqrt(22*22+2*6*((PIT_A-sp+L)%L))));}
  const aT=clamp((vt-sc.v)*0.9,-9,4.5);sc.a+=clamp(aT-sc.a,-10*dt,10*dt);sc.v=Math.max(0,sc.v+sc.a*dt);if(sc.v===0&&sc.a<0)sc.a=0;
  const ps=sc.s;sc.s=((sc.s+sc.v*dt)%L+L)%L;sc.inDist+=sc.v*dt;
  const sps=spOf(sc.s);
  // after the unlapping call the SC comes in at the end of the following lap: declared as it crosses the control line
  if(sc.phase==='out'&&sc.inAfterLine&&ps>L-80&&sc.s<80){sc.phase='in';sc.lights='off';sc.inDist=0;msg('SAFETY CAR IN THIS LAP');}
  // ---- lateral target (spring-damped): racing line, aside to wave cars by, the pit lane, the parking spot
  const hw=HWa[i];
  sc.wave=sc.phase==='out'&&cars.some(c=>(c.waveBy||c.unlap)&&(((fwd(c.s,sc.s))%L)+L)%L<120);
  if(sc.wave&&!sc.waveSideSet){sc.waveSide=RL[i]>0?-1:1;sc.waveSideSet=true;}if(!sc.wave)sc.waveSideSet=false;
  let dT=sc.wave?sc.waveSide*(hw-2.3):RL[i]*0.55;
  const po=pitOffSp(sps);
  if(sc.phase==='exit'||sc.phase==='pit'){
    if(po!=null){const lane=FAST_D*clamp(Math.min((sps-PIT_B)/30,(PIT_C-sps)/30),0,1),park=smooth(1-Math.abs(sps-SC_PARK)/35);
      dT=po+lane+(SC_LANE-PIT_OFF-lane)*park;}}
  else if(sc.phase==='in'){const toA=fwd(sc.s,(PIT_A+L)%L);
    if(toA>0&&toA<160)dT=dT+(hw-2-dT)*smooth(1-toA/160);
    if(toA<=0&&po!=null){dT=Math.max(hw-2,po);if(sps>=PIT_A&&ps!=null&&spOf(ps)<PIT_A&&sc.inDist>300){sc.phase='pit';scRestart=true;restartGo=false;
        goSp=Math.min(-120,Math.max(PIT_A+60,rand(-460,-160)));for(const c of cars){c.waveBy=false;c.unlap=false;}}}}
  const w=1.25;sc.dv+=(w*w*(dT-sc.d)-2*w*sc.dv)*dt;sc.dv=clamp(sc.dv,-3,3);sc.d+=sc.dv*dt;
  // ---- position and heading: heading = direction of travel (look 2.5 m ahead along the same lateral motion)
  trackPt(sc.s,sc.d,_tp);trackPt(sc.s+2.5,sc.d+sc.dv*2.5/Math.max(sc.v,2.5),_tp2);
  sc.x=_tp.x;sc.z=_tp.z;
  const hy=Math.atan2(_tp2.z-_tp.z,_tp2.x-_tp.x),oy=sc.yaw;sc.yaw+=wrapA(hy-sc.yaw)*(1-Math.exp(-dt/0.06));
  sc.yawR=wrapA(sc.yaw-oy)/dt;sc.steer=clamp(Math.atan(SC_WB*sc.yawR/Math.max(sc.v,1.5)),-0.5,0.5);
  // parked in the pit lane again: the period is over
  if(sc.phase==='pit'&&sc.v<0.3&&sps>PIT_B&&sps>SC_PARK-3){sc=null;scMesh.visible=false;}}
// interpolated drawing, body roll/pitch on soft springs, wheels turning, the light bar
function drawSafetyCar(dt,al){if(!sc||!scMesh)return;const u=scMesh.userData,sdt=Math.min(dt,1/30);
  const x=sc.px+(sc.x-sc.px)*al,z=sc.pz+(sc.z-sc.pz)*al,yw=sc.pyaw+wrapA(sc.yaw-sc.pyaw)*al;
  scMesh.position.set(x,CAR_Y,z);scMesh.rotation.y=-yw;
  const tr=clamp(-sc.v*sc.yawR*0.006,-0.035,0.035),tp=clamp(sc.a*0.0035,-0.02,0.015);
  sc.rollV+=((tr-sc.roll)*60-sc.rollV*12)*sdt;sc.roll+=sc.rollV*sdt;sc.pitchV+=((tp-sc.pitch)*60-sc.pitchV*12)*sdt;sc.pitch+=sc.pitchV*sdt;
  u.body.rotation.set(sc.roll,0,sc.pitch);
  for(const w of u.wheels)w.rotation.z-=sc.v*dt/0.345;for(const p of u.steer)p.rotation.y=-sc.steer;
  const t=performance.now()/1000,ph=Math.floor(t*3)%2,orange=sc.lights==='orange';
  u.amber[0].color.setHex(orange&&ph===0?0xffa000:0x3a2400);u.amber[1].color.setHex(orange&&ph===1?0xffa000:0x3a2400);
  const gp=sc.wave&&Math.floor(t*5)%2===0;for(const m of u.green)m.color.setHex(gp?0x22ff55:0x0a2a12);
  u.head[0].color.setHex(orange&&ph===1?0x666a70:0xf4f8ff);u.head[1].color.setHex(orange&&ph===0?0x666a70:0xf4f8ff);
  u.tail.color.setHex(sc.a<-1.2?0xff1a10:0x7a0806);}
function buildSCMesh(){
  const root=new THREE.Group(),g=new THREE.Group();root.add(g);
  const paint=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.6,roughness:.3,envMap:envTex,envMapIntensity:.7});
  const mS=mat({color:0xb8bec6}),mD=mat({color:0x16181c}),mY=mat({color:0xffd200}),mR=mat({color:0xd0101a});
  const glass=mat({color:0x05070c,metalness:.9,roughness:.08,envMap:envTex,envMapIntensity:.9});
  const add=(geo,m,x=0,y=0,z=0,par=g,sh=true)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=sh;par.add(o);return o;};
  // core body, door sills, bumpers, swollen wheel arches (a front-engined GT: long bonnet, cab set back, fastback)
  add(loft([{x:-2.32,y:.62,w:.7,h:.2,b:.3,n:3},{x:-1.9,y:.63,w:.78,h:.3,b:.44,n:3.2},{x:-1.0,y:.62,w:.8,h:.3,b:.46,n:3.4},{x:0,y:.58,w:.8,h:.22,b:.43,n:3.4},
    {x:1.0,y:.55,w:.8,h:.17,b:.4,n:3.4},{x:1.8,y:.5,w:.76,h:.12,b:.34,n:3},{x:2.3,y:.44,w:.62,h:.07,b:.26,n:2.6}],28),mS);
  add(loft([{x:-.9,y:.5,w:.95,h:.27,b:.35,n:4},{x:-.2,y:.5,w:.97,h:.24,b:.35,n:4},{x:.75,y:.47,w:.95,h:.2,b:.32,n:4}],24),mS);
  add(loft([{x:1.72,y:.36,w:.93,h:.16,b:.2,n:3.4},{x:2.05,y:.36,w:.9,h:.14,b:.2,n:3.2},{x:2.34,y:.34,w:.74,h:.08,b:.17,n:2.6}],24),mS);
  add(loft([{x:-2.36,y:.45,w:.86,h:.2,b:.28,n:3.2},{x:-2.0,y:.47,w:.95,h:.26,b:.3,n:3.6},{x:-1.72,y:.47,w:.96,h:.26,b:.3,n:3.6}],24),mS);
  for(const s of [-1,1]){
    add(loft([{x:.75,z:s*.62,y:.6,w:.36,h:.1,b:.04},{x:1.32,z:s*.63,y:.7,w:.37,h:.1,b:.03},{x:1.9,z:s*.6,y:.6,w:.33,h:.08,b:.04}],18),mS);
    add(loft([{x:-1.9,z:s*.62,y:.66,w:.36,h:.14,b:.04},{x:-1.31,z:s*.64,y:.76,w:.37,h:.15,b:.03},{x:-.75,z:s*.62,y:.68,w:.35,h:.12,b:.04}],18),mS);
    add(new THREE.BoxGeometry(1.5,.05,.02),mY,-.1,.27,s*.97,g,false);} // yellow sill stripe
  // glasshouse and roof
  add(loft([{x:-1.6,y:.94,w:.62,h:.03,b:.05},{x:-1.0,y:1.0,w:.71,h:.15,b:.1},{x:-.3,y:1.03,w:.73,h:.21,b:.15},{x:.35,y:.97,w:.71,h:.14,b:.15},{x:.9,y:.84,w:.66,h:.04,b:.06}],24),glass,0,0,0,g,false);
  add(loft([{x:-1.05,y:1.14,w:.56,h:.03,b:.03},{x:-.3,y:1.235,w:.6,h:.04,b:.04},{x:.3,y:1.12,w:.55,h:.03,b:.03}],20),mS);
  // splitter, diffuser, side skirts, mirrors
  add(new THREE.BoxGeometry(.32,.03,1.84),mD,2.2,.13,0);add(new THREE.BoxGeometry(.4,.12,1.5),mD,-2.25,.2,0);
  for(const s of [-1,1]){add(new THREE.BoxGeometry(1.6,.06,.05),mD,-.1,.16,s*.95);const m=add(new THREE.SphereGeometry(1,10,6),mS,.55,.9,s*.95);m.scale.set(.1,.06,.09);}
  // fixed rear wing on two pillars
  add(foil(.32,.1,1.7,.06),mD,-1.85,1.12,0);
  for(const s of [-1,1]){add(plate([[-1.8,.88],[-1.95,.88],[-2.02,1.13],[-1.9,1.13]],.03),mD,0,0,s*.42);add(plate([[-1.82,1.04],[-1.82,1.22],[-2.2,1.24],[-2.22,1.06]],.012),mD,0,0,s*.86);}
  // light bar: two amber lamps (flash while the SC is out), two green ones (flash while cars may overtake it)
  add(new THREE.BoxGeometry(.34,.06,1.24),mD,-.32,1.285,0);
  const lamp=(c,z,w)=>{const m=new THREE.MeshBasicMaterial({color:c});const o=new THREE.Mesh(new THREE.BoxGeometry(.26,.1,w),m);o.position.set(-.32,1.36,z);root.add(o);return m;};
  const amber=[lamp(0x3a2400,.42,.34),lamp(0x3a2400,-.42,.34)],green=[lamp(0x0a2a12,.13,.18),lamp(0x0a2a12,-.13,.18)];
  const head=[0,1].map(k=>{const m=new THREE.MeshBasicMaterial({color:0xf4f8ff});const o=new THREE.Mesh(new THREE.BoxGeometry(.06,.07,.3),m);o.position.set(2.13,.6,(k?1:-1)*.62);o.rotation.y=(k?-1:1)*.35;root.add(o);return m;});
  const tail=new THREE.MeshBasicMaterial({color:0x7a0806});{const o=new THREE.Mesh(new THREE.BoxGeometry(.04,.05,1.5),tail);o.position.set(-2.4,.78,0);root.add(o);}
  // "SAFETY CAR" on both doors and across the tail
  const txt=canvasTex(512,96,(x)=>{x.fillStyle='rgba(0,0,0,0)';x.fillRect(0,0,512,96);x.font='900 64px Titillium Web, sans-serif';x.textAlign='center';x.textBaseline='middle';
    x.lineWidth=8;x.strokeStyle='#111';x.strokeText('SAFETY CAR',256,52);x.fillStyle='#ffd200';x.fillText('SAFETY CAR',256,52);});
  const tm=new THREE.MeshBasicMaterial({map:txt,transparent:true,depthWrite:false});
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.24),tm);p.position.set(-.15,.55,s*.975);if(s<0)p.rotation.y=Math.PI;g.add(p);}
  {const p=new THREE.Mesh(new THREE.PlaneGeometry(.9,.17),tm);p.position.set(-2.375,.6,0);p.rotation.y=-Math.PI/2;g.add(p);}
  // wheels: 20-inch, five spokes (so they visibly turn), front ones steer
  const tyre=mat({color:0x111111,roughness:.9}),rim=mat({color:0x2b2e33,metalness:.8,roughness:.3}),cal=mat({color:0xd0101a});
  const wheels=[],steer=[];
  for(const [x,z,fr] of [[1.32,.84,1],[1.32,-.84,1],[-1.31,.85,0],[-1.31,-.85,0]]){
    const piv=new THREE.Group();piv.position.set(x,.345,z);root.add(piv);const spin=new THREE.Group();piv.add(spin);const sz=Math.sign(z);
    add(tyreGeo(.345,.29,.25,40),tyre,0,0,0,spin,false);
    add(new THREE.CylinderGeometry(.25,.25,.24,18).rotateX(Math.PI/2),rim,0,0,-sz*.02,spin,false);
    for(let k=0;k<5;k++){const a=k*Math.PI*2/5,o=add(new THREE.BoxGeometry(.2,.045,.03),mS,Math.cos(a)*.13,Math.sin(a)*.13,sz*.12,spin,false);o.rotation.z=a;}
    add(new THREE.BoxGeometry(.14,.1,.04),cal,-.05*Math.sign(x),.12,sz*.07,piv,false);
    wheels.push(spin);if(fr)steer.push(piv);}
  const pm=new Map([[mS,paint],[mD,paint],[mY,paint],[mR,paint]]);bakeGroup(g,pm);for(const w of wheels)bakeGroup(w,new Map([[tyre,carWheel],[rim,carWheel],[mS,carWheel]]));
  {const geos=[];for(const [x,z] of [[1.32,.84],[1.32,-.84],[-1.31,.85],[-1.31,-.85]])
     geos.push(new THREE.PlaneGeometry(.55,.4).rotateX(-Math.PI/2).translate(x,.003,z));
   const cp=new THREE.Mesh(mergeGeometries(geos),contactMat);cp.renderOrder=1;root.add(cp);} // tyre contact patches
  root.traverse(o=>{o.castShadow=false;}); // no car shadow
  root.userData={body:g,wheels,steer,amber,green,head,tail};root.visible=false;scene.add(root);return root;}

/* ---- marshal posts: an LED light panel at the start of every marshal sector, on top of the barrier, facing the
   oncoming cars. One instanced draw call for all the panels; their colour is the flag at that post. ---- */
let mPanels=null;
function buildMarshalPanels(){
  const n=MS_N,im=new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.7,1.15),new THREE.MeshBasicMaterial({color:0xffffff}),n),geos=[],m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();
  for(let k=0;k<n;k++){const s=k*MS_L+2,i=Math.round(s/DS)%N,sp=spI(i);
    let side=WL[i]>WR[i]?-1:1;if(sp>PIT_A-40&&sp<PIT_D+40)side=-1; // never on the pit wall side
    const off=side>0?WR[i]+0.5:-(WL[i]+0.5),x=X[i]-TZ[i]*off,z=Z[i]+TX[i]*off,yaw=-ANG[i];
    e.set(0,yaw+side*0.25,0);q.setFromEuler(e);m4.compose(new THREE.Vector3(x,2.75,z),q,new THREE.Vector3(1,1,1));im.setMatrixAt(k,m4);im.setColorAt(k,new THREE.Color(0x101010));
    geos.push(new THREE.BoxGeometry(.14,.86,1.3).applyQuaternion(q).translate(x+TX[i]*.07,2.75,z+TZ[i]*.07)); // housing behind the LED face
    geos.push(new THREE.BoxGeometry(.1,2.4,.1).translate(x,1.2,z));}
  im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.frustumCulled=false;scene.add(im);
  const fr=new THREE.Mesh(mergeGeometries(geos),mat({color:0x1c1f25,roughness:.8}));fr.castShadow=false;scene.add(fr);
  mPanels={im,cur:new Int32Array(n).fill(-1),col:new THREE.Color()};}
function updateMarshalPanels(){if(!mPanels)return;const t=performance.now()/1000,f2=Math.floor(t*2)%2,f4=Math.floor(t*4)%2;let ch=false;
  const neutral=phase==='race'&&(scOn()||vsc);
  for(let k=0;k<MS_N;k++){let c=0x101010;
    if(phase==='race'){const fl=msFlag[k];
      if(neutral)c=f2?0xffc800:0x2a2000;                       // SC / VSC boards: every panel flashes yellow
      else if(fl===2)c=f4?0xffd200:0x3a3000;                   // double yellow: fast flash
      else if(fl===1)c=f2?0xffd200:0x3a3000;                   // single yellow
      else if(msGreen[k]>simTime)c=0x10ff40;}                  // green: the end of a yellow zone / just cleared
    if(mPanels.cur[k]!==c){mPanels.cur[k]=c;mPanels.im.setColorAt(k,mPanels.col.setHex(c));ch=true;}}
  if(ch)mPanels.im.instanceColor.needsUpdate=true;}


function step(dt){
  simTime+=dt;
  for(const c of cars){c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;}
  if(phase==='grid'){const t=simTime-gridT0;const n=t<0?0:Math.min(5,Math.floor(t)+1);if(n!==lightsOn&&t<lightsOutAt-gridT0){lightsOn=n;setLights(n);}
    if(simTime>=lightsOutAt){phase='race';raceStart=simTime;setLights(0);setTimeout(()=>{$('lights').hidden=true;},1200);
      // the AI's reaction to the lights is as sharp as a good human's (it used to sit 0.1–0.3 s longer, which handed
      // the player two or three places off the line every time)
      for(const c of cars)c.releaseAt=c.isPlayer?simTime:simTime+rand(.02,.12);msg('LIGHTS OUT','AND AWAY WE GO!');}}
  if(phase==='race')for(const c of cars)if(c.held&&simTime>=c.releaseAt)c.held=false;
  const pt0=perf.on?performance.now():0;
  playerControl(dt);
  for(const c of cars)if(!c.isPlayer&&!c.parked)aiDrive(c,dt);
  const pt1=perf.on?performance.now():0;
  computeTow();
  for(const c of cars)if(!c.parked)physics(c,dt);
  collide();
  for(const c of cars)if(!c.parked)post(c);
  if(perf.on){const pt2=performance.now();perf.acc('ai',pt1-pt0);perf.acc('physics+post',pt2-pt1);}
  if(phase==='race'){
    let lead=cars[0];for(const c of cars)if(c.progress>lead.progress)lead=c;
    // DRS: off under the SC / VSC, back one lap after the green flag
    if(!drsEnabled&&!scActive()&&lead.lapCount>=DRS_FROM_LAP-1&&(drsResume==null||lead.progress>=drsResume)){drsEnabled=true;drsResume=null;msg('DRS ENABLED');}
    if((scOn()||vsc)&&drsEnabled){drsEnabled=false;for(const c of cars)c.drsOpen=false;}
    // restart: the leader sets the pace once the safety car has peeled off, picks the moment to go, and racing
    // resumes as the field crosses the control line
    if(scRestart&&!scOn()){const ld=scLeaderAny();
      if(ld&&!restartGo&&spOf(ld.s)>goSp&&spOf(ld.s)<0){restartGo=true;if(!ld.isPlayer)msg('RESTART',ld.code+' GOES');}
      if(ld&&ld.s<60&&(ld.prevSc??ld.s)>L-60){scRestart=false;restartGo=false;greenAll();restartDRS();msg('GREEN FLAG','RACING RESUMES');}if(ld)ld.prevSc=ld.s;}
    clearWrecks();
    // the player cannot drive through the safety car: you close up to it and no further (unless waved by)
    if(scOn()&&sc.phase!=='exit'&&player&&!player.dnf&&!player.pitSide&&!player.waveBy&&!player.unlap){const p=player,g=fwd(p.s,sc.s);if(g>0&&g<8&&p.v>sc.v)p.v=sc.v;}
    if(!checkered&&!timeLimitHit&&simTime-raceStart>=7200){timeLimitHit=true;targetLaps=lead.lapCount+1;msg('TWO HOUR LIMIT · FINAL LAP');}
    updateFlags(dt);
    if(simTime-lastHist>=0.1){lastHist=simTime;for(const c of cars){c.hp.push(c.progress);c.ht.push(simTime);if(c.hp.length>6000){c.hp.splice(0,1000);c.ht.splice(0,1000);}}}
  }
}

function gapTime(A,B){const p=B.progress,hp=A.hp,ht=A.ht;if(!hp.length||p<hp[0])return null;if(p>=hp[hp.length-1])return 0;
  let lo=0,hi=hp.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(hp[m]<p)lo=m;else hi=m;}
  const f=(p-hp[lo])/Math.max(1e-6,hp[hi]-hp[lo]);return Math.max(0,simTime-(ht[lo]+f*(ht[hi]-ht[lo])));}
function gapStr(A,B){if(!A||!B)return '—';const dl=Math.floor((A.progress-B.progress)/L);if(dl>=1)return '+'+dl+' LAP';const g=gapTime(A,B);return g==null?'—':'+'+g.toFixed(3);}

/* ================= HUD ================= */
let msgTimer=null;
function msg(t,sub=''){const m=$('msg');m.innerHTML=t+(sub?'<small>'+sub+'</small>':'');m.classList.add('on');clearTimeout(msgTimer);msgTimer=setTimeout(()=>m.classList.remove('on'),2600);}
function setLights(n){[...$('lights').children].forEach((l,i)=>l.classList.toggle('on',i<n));gantryLamps.forEach((m,i)=>m.color.setHex(i<n?0xff1a0a:0x220404));}
let rowEls=[];
function buildTower(){const r=$('rows');r.innerHTML='';rowEls=cars.map(()=>{const d=document.createElement('div');d.className='row';d.innerHTML='<span class="p"></span><span class="bar"></span><span class="cd"></span><span class="gp"></span><span class="ty"></span>';r.appendChild(d);return d;});}
// DOM writes only when the value changed (the last value is kept on the element): rewriting an unchanged text or style
// still invalidates style/layout next to the WebGL canvas
const elTxt=(e,v)=>{v=String(v);if(e._t!==v){e._t=v;e.textContent=v;}};
const elHtml=(e,v)=>{if(e._h!==v){e._h=v;e.innerHTML=v;}};
const elCls=(e,v)=>{if(e._c!==v){e._c=v;e.className=v;}};
const elSty=(e,k,v)=>{const s=e._s||(e._s={});if(s[k]!==v){s[k]=v;e.style[k]=v;}};
const EL={},el=id=>EL[id]||(EL[id]=$(id));
function updateTower(){const o=order();
  const me=o.findIndex(c=>c.isPlayer);
  o.forEach((c,k)=>{const d=rowEls[k];const ch=d.children;
    // compact mode: five rows — you plus the two cars ahead and the two behind
    const lo=clamp(me-2,0,Math.max(0,o.length-5));elSty(d,'display',(hudMode===0&&(k<lo||k>lo+4))?'none':'');elTxt(ch[0],k+1);elSty(ch[1],'background',hex(c.col));elTxt(ch[2],c.code);
    elTxt(ch[3],c.dnf?'OUT':c.pitStop>0||c.limiter?'PIT':c.finished?(k===0?'FINISH':'+'+(c.finishT-o[0].finishT).toFixed(3)):k===0?'Interval':gapStr(o[k-1],c));
    elSty(ch[4],'borderColor',COMP[c.comp].col);elCls(d,'row'+(c.isPlayer?' me':'')+(c.limiter||c.pitStop>0?' pit':'')+(fastest&&fastest.car===c?' fl':''));});}
// minimap canvas at the screen's pixel density (it was drawn at 1× and scaled up, i.e. blurry on HiDPI displays)
const mm=$('minimap'),mctx=mm.getContext('2d'),MMR=Math.min(2,Math.max(1,window.devicePixelRatio||1));
mm.width=mm.height=Math.round(230*MMR);mm.style.width=mm.style.height='230px';mctx.setTransform(MMR,0,0,MMR,0,0);let mmBase=null,mmT=null;
function buildMinimap(){let a=1e9,b=-1e9,c=1e9,d=-1e9;for(let i=0;i<N;i++){a=Math.min(a,X[i]);b=Math.max(b,X[i]);c=Math.min(c,Z[i]);d=Math.max(d,Z[i]);}
  const s=200/Math.max(b-a,d-c),mp=[0,0];mmT=(x,z)=>{mp[0]=15+(x-a)*s+(200-(b-a)*s)/2;mp[1]=15+(z-c)*s+(200-(d-c)*s)/2;return mp;}; // one reused result array
  const off=document.createElement('canvas');off.width=off.height=Math.round(230*MMR);const x=off.getContext('2d');x.setTransform(MMR,0,0,MMR,0,0);x.lineJoin='round';
  x.beginPath();for(let i=0;i<=N;i+=3){const [px,pz]=mmT(X[i%N],Z[i%N]);i?x.lineTo(px,pz):x.moveTo(px,pz);}x.closePath();x.strokeStyle='#55607a';x.lineWidth=5;x.stroke();
  for(const z of DRSZ){x.beginPath();let st=Math.round(z.a/DS),en=Math.round(z.b/DS);if(en<st)en+=N;for(let i=st;i<=en;i+=2){const [px,pz]=mmT(X[i%N],Z[i%N]);i===st?x.moveTo(px,pz):x.lineTo(px,pz);}x.strokeStyle='rgba(27,226,107,.75)';x.lineWidth=5;x.stroke();}
  const [sx,sz]=mmT(X[0],Z[0]);x.fillStyle='#fff';x.fillRect(sx-4,sz-1.5,8,3);mmBase=off;}
// redrawn at 15 Hz: a dot moves a pixel or two between redraws, and the canvas upload was paid every frame
let mmAcc=1;
function drawMinimap(dt){mmAcc+=dt;if(mmAcc<1/15)return;mmAcc=0;
  mctx.clearRect(0,0,230,230);mctx.drawImage(mmBase,0,0,230,230);
  // marshal sectors under yellow (double: thicker, flashing) and the green flag past them; the whole lap under SC / VSC
  if(phase==='race'){const neutral=scOn()||vsc,blink=Math.floor(performance.now()/250)%2;mctx.lineJoin='round';mctx.lineCap='round';
    const run=(k,col,w)=>{const a=Math.round(k*MS_L/DS),b=Math.round((k+1)*MS_L/DS);mctx.beginPath();
      for(let i=a;i<=b;i+=2){const p=mmT(X[i%N],Z[i%N]);i===a?mctx.moveTo(p[0],p[1]):mctx.lineTo(p[0],p[1]);}mctx.strokeStyle=col;mctx.lineWidth=w;mctx.stroke();};
    for(let k=0;k<MS_N;k++){
      if(neutral)run(k,blink?'#ffd200':'#a88a00',4);
      else if(msFlag[k]===2)run(k,blink?'#ffd200':'#ff9d00',8);
      else if(msFlag[k]===1)run(k,'#ffd200',6);
      else if(msGreen[k]>simTime)run(k,'#1be26b',5);}
    if(sc&&scMesh&&scMesh.visible){const p=mmT(sc.x,sc.z);mctx.fillStyle='#111';mctx.fillRect(p[0]-6,p[1]-4.5,12,9);mctx.fillStyle='#ffd200';mctx.font='900 7px Titillium Web, sans-serif';mctx.textAlign='center';mctx.textBaseline='middle';mctx.fillText('SC',p[0],p[1]+.5);}
    if(neutral){mctx.fillStyle='#ffd200';mctx.fillRect(8,8,scOn()?26:32,15);mctx.fillStyle='#111';mctx.font='900 11px Titillium Web, sans-serif';mctx.textAlign='left';mctx.textBaseline='middle';mctx.fillText(scOn()?'SC':'VSC',12,16);}}
  for(const c of cars){if(c===player||c.parked)continue;const p=mmT(c.x,c.z);mctx.fillStyle=c.hexCol||(c.hexCol=hex(c.col));mctx.beginPath();mctx.arc(p[0],p[1],3.4,0,7);mctx.fill();}
  const p=mmT(player.x,player.z),x=p[0],z=p[1];mctx.fillStyle='#fff';mctx.beginPath();mctx.arc(x,z,5.5,0,7);mctx.fill();mctx.fillStyle='#e10600';mctx.beginPath();mctx.arc(x,z,3.4,0,7);mctx.fill();}

// gearbox: the engine revs follow the road speed in the selected gear, and the gear is changed on the REVS — up at
// RPM_UP, down when they drop below RPM_DOWN (with the lower gear landing safely under the limit). A short lock-out
// after each change stops it hunting between two gears.
const RPM_IDLE=4000,RPM_UP=11500,RPM_DOWN=7600;
const engRpm=(kmh,g)=>12000*kmh/GEARS[g];
function updateGear(c,dt){let g=c.gear||0;c.shiftT=Math.max(0,(c.shiftT||0)-dt);const kmh=c.v*3.6;
  if(c.shiftT<=0){
    if(g<7&&engRpm(kmh,g)>=RPM_UP){g++;c.shiftT=0.15;}
    else if(g>0&&engRpm(kmh,g)<RPM_DOWN&&engRpm(kmh,g-1)<RPM_UP-500){g--;c.shiftT=0.15;}}
  c.gear=g;}
const gearOf=c=>c.gear||0;
// HUD writes are guarded: touching the DOM every frame with an unchanged value still dirties style/layout next to a WebGL canvas
const _hc={};
function setTxt(id,v){if(_hc[id]!==v){_hc[id]=v;$(id).textContent=v;}}
function setW(id,p){const v=Math.round(p);if(_hc['w'+id]!==v){_hc['w'+id]=v;$(id).style.width=v+'%';}}
function updateHud(){
  const c=player,kmh=c.v*3.6,g=gearOf(c);
  const rpm=c.held?4000+c.throttle*7500:rpmOf(c);
  setTxt('spd',Math.round(kmh));setTxt('gear',c.v<0.3&&c.held?'N':(g+1));setTxt('rpmTxt',Math.round(rpm/10)*10);
  // the arcs are pathLength=100, so the dash length is a percentage; bars are 60 px wide
  const rp=Math.round(clamp((rpm-4000)/8200,0,1)*100);if(_hc.rp!==rp){_hc.rp=rp;$('rpmArc').style.strokeDasharray=rp+' 100';}
  // pedal bars beside the gear (brake left, throttle right), 76 px tall, filling up from y=112
  const th=Math.round(c.throttle*76),bh=Math.round(c.brake*76);
  if(_hc.th!==th){_hc.th=th;const e=$('thr');e.setAttribute('height',th);e.setAttribute('y',112-th);}
  if(_hc.bh!==bh){_hc.bh=bh;const e=$('brk');e.setAttribute('height',bh);e.setAttribute('y',112-bh);}
  // DRS: ON (flap open), READY (in a zone and eligible — press E), OFF; DISABLED while race control has it switched off
  const avail=drsEnabled&&c.zone>=0&&c.drsElig[c.zone],dc=c.drsOpen?'open':avail?'av':drsEnabled||phase==='quali'?'off':'dis';
  if(_hc.drs!==dc){_hc.drs=dc;$('gDrs').setAttribute('class','g-drs '+dc);setTxt('drsTxt',c.drsOpen?'ON':'OFF');
    setTxt('drsSub',dc==='av'?'READY · E':dc==='dis'?'DISABLED':dc==='open'?'OPEN':'');}
  const lc=c.limiter?'limtxt on':'limtxt';if(_hc.lim!==lc){_hc.lim=lc;$('lim').setAttribute('class',lc);}
  audioUpdate(rpm,c.held?0:g);
}
function updateInfo(){
  const c=player;
  if(session==='tt'){updateTTInfo();return;}
  if(session==='quali'){updateQualiInfo();return;}
  // (no gap-ahead read-out in the race; tyres, fuel, damage, track limits and penalties live in the MFD)
  elSty(el('gapA').parentElement,'display','none');
  const lap=Math.max(1,Math.min(totalLaps,c.lapCount+1));elTxt(el('lapNum'),lap+' / '+targetLaps);
  elTxt(el('curLap'),c.lapCount>=0&&phase==='race'&&!c.finished?fmt(simTime-c.lapStart):'—');elTxt(el('lastLap'),fmt(c.lastLap));elTxt(el('bestLap'),fmt(c.bestLap));
  infoTyres(c);
  // race control strip: [label, style] — the style draws the flag / board icon (see .flag.* in style.css)
  const f=[],race=phase==='race',mk=msOf(c.s),fl=race&&!c.pitSide?msFlag[mk]:0;
  if(c.dnf)f.push(['RETIRED','ret']);
  if(race&&scOn())f.push([sc.phase==='in'?'SC IN THIS LAP':sc.unlap?'SC · LAPPED CARS MAY OVERTAKE':'SAFETY CAR','sc']);
  else if(race&&vsc)f.push([vsc.phase==='ending'?'VSC ENDING':'VIRTUAL SAFETY CAR','vsc']);
  else if(race&&scRestart)f.push([restartGo?'RESTART · OVERTAKE AFTER THE LINE':'RESTART · LEADER SETS THE PACE','sc']);
  if(race&&c.waveBy)f.push(['WAVED BY · PASS THE SC','gr']);
  if(race&&c.unlap)f.push(['UNLAP · PASS THE SC','gr']);
  if(fl===2)f.push(['DOUBLE YELLOW · MS'+(mk+1)+(c.lift?' · LIFT!':''),'y2']);
  else if(fl===1)f.push(['YELLOW · MS'+(mk+1),'y1']);
  else if(race&&!c.pitSide&&yellowAhead(c.s))f.push(['YELLOW AHEAD','ya']);
  else if(race&&!c.pitSide&&msGreen[mk]>simTime)f.push(['GREEN','gr']);
  if(race&&c.infr&&c.infr.length)f.push(['GIVE BACK P · '+c.infr[0].o.code+' '+Math.max(0,c.infr[0].until-simTime).toFixed(0)+'s','ret']);
  if(!drsEnabled&&race)f.push(['DRS DISABLED','off']);
  if(race){for(const x of cars){if(x===c)continue;let a=c.s-x.s;if(a<-L/2)a+=L;else if(a>L/2)a-=L;if(a>0&&a<70&&x.progress>c.progress+L*0.5){f.push(['BLUE FLAG','bl']);break;}}}
  if(c.tl===3)f.push(['BLACK & WHITE','bw']);
  if(checkered)f.push(['CHEQUERED','ch']);
  elHtml(el('flags'),f.map(x=>`<span class="flag ${x[1]}"><i></i>${x[0]}</span>`).join(''));
  updateTower();renderMfd();
}
// sector times: shared by the race and qualifying panels
function infoTyres(c){
  ['s1','s2','s3'].forEach((id,i)=>{const e=el(id);elTxt(e,c.sec[i]!=null?c.sec[i].toFixed(3):'S'+(i+1));elCls(e,c.secCol[i]);});}

// qualifying HUD: no gaps to cars on track (there are none) — show the stage, the running lap and
// the time that would take pole
function updateQualiInfo(){
  const c=player,rivals=[...qTimes.entries()].filter(([k,v])=>k!==c&&v!=null).map(([,v])=>v),best=rivals.length?Math.min(...rivals):null;
  const stage=qStage==='flying'&&c.lapInvalid?'LAP DELETED':qStage==='done'?'QUALIFYING':'FLYING LAP';
  elTxt(el('lapNum'),stage);
  elSty(el('gapA').parentElement,'display','');elTxt(el('gapALbl'),'DELTA TO POLE');
  const ref=best!=null&&qStage==='flying'&&!c.lapInvalid?best*CUMT[c.idx]/CUMT[N]:null;
  const dl=ref==null?null:(simTime-c.lapStart)-ref;
  elTxt(el('gapA'),dl==null?'—':(dl>=0?'+':'')+dl.toFixed(3));
  elSty(el('gapA'),'color',dl==null?'':(dl<0?'#1be26b':'#ff5252'));
  const cur=qStage==='flying'?simTime-c.lapStart:null;
  elTxt(el('curLap'),cur==null?'—':fmt(cur));
  elTxt(el('lastLap'),fmt(c.lastLap));elTxt(el('bestLap'),fmt(c.bestLap));
  infoTyres(c);
  elHtml(el('flags'),c.lapInvalid?'<span class="flag ret">LAP DELETED</span>':'');renderMfd();
}

/* ================= MFD (multi-function display, bottom right) =================
   F opens it and steps through OVERVIEW (tyre, fuel, damage, track limits, penalties) → DAMAGE → TYRES & BRAKES →
   PIT STRATEGY → closed (pages change with F only). On the PIT page ↑/↓ choose a line and ←/→ change it. Pit strategy: next compound, front wing (AUTO = only if damaged), and the
   lap to pit on — a "BOX THIS LAP" call comes on that lap. */
let mfdPage=-1,mfdSel=0;
const WING_OPTS=['AUTO','CHANGE','NO'],WING_TXT={AUTO:'AUTO (IF DAMAGED)',CHANGE:'CHANGE',NO:'NO CHANGE'};
const dmgCol=v=>v<0.05?'#1be26b':v<0.25?'#c6e83a':v<0.5?'#ffd200':v<0.75?'#ff8a00':'#e10600';
const tyreCol=(t,o)=>t<o-12?'#2aa7ff':t>o+14?'#ff4a2a':t>o+8?'#ffb000':'#1be26b';
const brakeCol=t=>t<350?'#2aa7ff':t>1000?'#ff4a2a':t>850?'#ffb000':'#1be26b';
const MFD_PIT=3;
function mfdKey(code){
  if(code==='KeyF'){mfdPage=mfdPage<MFD_PIT?mfdPage+1:-1;mfdSel=0;$('mfd').hidden=mfdPage<0;renderMfd(true);return true;}
  if(mfdPage<0||!code.startsWith('Arrow'))return false;
  if(mfdPage<MFD_PIT)return false; // pages change with F only; the arrows choose items on the PIT page
  const c=player;if(!c)return true;
  if(code==='ArrowUp')mfdSel=(mfdSel+2)%3;else if(code==='ArrowDown')mfdSel=(mfdSel+1)%3;
  else{const dir=code==='ArrowRight'?1:-1;
    if(mfdSel===0){const o=['S','M','H'];c.nextComp=o[(o.indexOf(c.nextComp)+dir+3)%3];}
    else if(mfdSel===1){c.pitWing=WING_OPTS[(WING_OPTS.indexOf(c.pitWing||'AUTO')+dir+3)%3];}
    else{const cur=Math.max(1,c.lapCount+1),opts=[null];for(let l=cur;l<=Math.max(cur,targetLaps);l++)opts.push(l);
      let i=opts.indexOf(c.planLap);if(i<0)i=0;c.planLap=opts[(i+dir+opts.length)%opts.length];}}
  renderMfd(true);return true;}
function renderMfd(force){if(mfdPage<0||!player)return;const c=player,body=el('mfdBody');
  [...$('mfd').querySelectorAll('.mfd-tabs b')].forEach((b,i)=>b.classList.toggle('on',i===mfdPage));
  let h='';
  if(mfdPage===0){const kv=(k,v)=>'<div><span>'+k+'</span><b>'+v+'</b></div>',dot=k=>'<span style="color:'+COMP[k].col+'">●</span> ';
    h='<div class="lst ovw">'+kv('TYRE',dot(c.comp)+COMP[c.comp].name+' · '+Math.round(c.wear*100)+'% WORN')+kv('NEXT TYRE (1/2/3)',dot(c.nextComp)+COMP[c.nextComp].name)+
      kv('COMPOUNDS USED',session==='race'?[...c.used].join(' · ')+(c.used.size<2?' (1 more needed)':' ✓'):'QUALIFYING')+
      kv('FUEL',c.fuel.toFixed(1)+' kg')+kv('DAMAGE','<span style="color:'+dmgCol(c.damage)+'">'+Math.round(c.damage*100)+'%</span>')+
      kv('TRACK LIMITS',Math.min(c.tl,3)+' / 3')+kv('PENALTY',c.pen?'<span style="color:#ff5252">+'+c.pen+' s</span>':'—')+
      kv('PIT PLAN',c.planLap==null?'—':'LAP '+c.planLap)+'</div>';}
  else if(mfdPage===1){const d=c.dm||newDmg(),f=k=>dmgCol(d[k]);
    h='<div class="dmg"><svg viewBox="0 0 110 194">'+
      '<rect x="8" y="60" width="94" height="100" rx="8" fill="#2a2f3a" opacity=".55"/>'+
      '<rect x="0" y="30" width="14" height="30" rx="3" fill="#0d0f14"/><rect x="96" y="30" width="14" height="30" rx="3" fill="#0d0f14"/>'+
      '<rect x="0" y="140" width="16" height="34" rx="3" fill="#0d0f14"/><rect x="94" y="140" width="16" height="34" rx="3" fill="#0d0f14"/>'+
      '<rect data-k="fwL" x="8" y="4" width="45" height="14" rx="3" fill="'+f('fwL')+'"/><rect data-k="fwR" x="57" y="4" width="45" height="14" rx="3" fill="'+f('fwR')+'"/>'+
      '<rect x="47" y="16" width="16" height="64" rx="7" fill="#5a6274"/>'+
      '<rect x="16" y="78" width="26" height="56" rx="9" fill="#3a4150"/><rect x="68" y="78" width="26" height="56" rx="9" fill="#3a4150"/>'+
      '<rect x="42" y="90" width="26" height="40" rx="5" fill="#3a4150"/><rect x="46" y="132" width="18" height="26" rx="4" fill="#3a4150"/>'+
      '<rect x="28" y="160" width="54" height="12" rx="3" fill="#3a4150"/><rect data-k="rw" x="18" y="176" width="74" height="14" rx="3" fill="'+f('rw')+'"/></svg>'+
      '<div class="lst">'+DMG_PARTS.map(([k,n])=>'<div><span>'+n+'</span><b style="color:'+dmgCol(d[k])+'">'+Math.round(d[k]*100)+'%</b></div>').join('')+
      '<div style="margin-top:4px"><span>OVERALL</span><b style="color:'+dmgCol(c.damage)+'">'+Math.round(c.damage*100)+'%</b></div></div></div>';}
  else if(mfdPage===2){const t=c.tT||[80,80,80,80],b=c.bT||[300,300,300,300],o=T_OPT[c.comp],nm=['FL','FR','RL','RR'];
    const ty=w=>'<div class="tyr" style="border-color:'+tyreCol(t[w],o)+'"><small>'+nm[w]+'</small><b style="color:'+tyreCol(t[w],o)+'">'+Math.round(t[w])+'°</b>'+
      '<i style="color:'+brakeCol(b[w])+'">BRAKE '+Math.round(b[w])+'°</i></div>';
    h='<div class="tyres">'+ty(0)+'<div class="carmid" data-c="'+COMP[c.comp].name+'"></div>'+ty(1)+ty(2)+ty(3)+'</div>'+
      '<div class="note">Window '+(o-10)+'–'+(o+10)+' °C · wear '+Math.round(c.wear*100)+'% · fuel '+c.fuel.toFixed(1)+' kg</div>';}
  else{const wing=c.pitWing||'AUTO',fw=c.dm?Math.max(c.dm.fwL,c.dm.fwR):0,will=wing==='CHANGE'||(wing==='AUTO'&&fw>0.1);
    const row=(i,label,val)=>'<div class="opt'+(mfdSel===i?' sel':'')+'"><span>'+label+'</span><b>'+val+'</b></div>';
    h='<div class="rows">'+row(0,'NEXT TYRE','<span style="color:'+COMP[c.nextComp].col+'">●</span> '+COMP[c.nextComp].name)+
      row(1,'FRONT WING',WING_TXT[wing])+row(2,'PIT ON',c.planLap==null?'NOT PLANNED':'LAP '+c.planLap)+'</div>'+
      '<div class="note">Stop ≈ '+(will?'7.5–9.5':'2.2–2.9')+' s'+(will?' (new front wing)':'')+' · front wing damage '+Math.round(fw*100)+'%<br>'+
      'Compounds used: '+[...c.used].join(' · ')+(c.used.size<2&&session==='race'?' — a second compound is required':'')+'</div>';}
  if(force)body._h=null;elHtml(body,h);}

/* ================= AUDIO =================
   Naturally aspirated V6, built the way the engine actually makes its noise rather than from tones.
   One 720° cycle is six exhaust pulses. Each is a real pressure wave — a sharp positive blow-down lobe
   followed by a rarefaction — so its energy sits at the firing frequency and its harmonics, and the
   cylinders are never quite equal, which puts a growl at the half- and cycle-orders underneath: that is
   the deep, hard bass of the sound. A pipe resonance and a burst of combustion noise give each pulse its
   bark. The cycle loops and its playback rate follows rpm (~1500–10500), and the fixed filters after it act
   as exhaust and body: big low shelf, a raspy upper-mid, and an open top under throttle. No turbo — so no
   whistle and no blow-off; on a lift the note goes dull and the exhaust crackles. */
let au=null,muted=false,lastGear=0,lastThr=0;
const ENG_R0=3000; // rpm the cycle buffer is recorded at
function engineCycle(ac){
  const sr=ac.sampleRate,T=120/ENG_R0,cycles=8,n=Math.round(sr*T*cycles),buf=ac.createBuffer(1,n,sr),d=buf.getChannelData(0);
  const tau=T/6,amp=[1,.64,.9,.58,.86,.7]; // per-cylinder strength: the unevenness is the growl
  // the two banks breathe against each other once and twice per cycle: a deep rumble at the cycle- and
  // half-orders (50–90 Hz at racing revs) under the firing note
  for(let i=0;i<n;i++){const ph=2*Math.PI*(i/sr)/T;d[i]+=0.13*Math.sin(ph)+0.1*Math.sin(2*ph+0.8)+0.07*Math.sin(3*ph+2.1);}
  for(let c=0;c<cycles;c++)for(let p=0;p<6;p++){
    const t0=(c+(p+rand(-.05,.05))/6)*T,a=amp[p]*rand(.9,1.06),s0=Math.round(t0*sr),w1=tau*0.42,w2=tau*0.5;
    for(let i=0;i<sr*tau*1.6;i++){const t=i/sr,k=(s0+i)%n;let v=0;
      // blow-down: the valve cracks open and the pressure jumps almost instantly, then bleeds away — a near-vertical
      // front is what makes the note hard and raspy instead of a smooth hum
      if(t<w1)v=Math.min(1,t/(tau*0.03))*Math.exp(-t/(tau*0.2));
      else if(t<w1+w2)v=-0.3*Math.sin(Math.PI*(t-w1)/w2);          // rarefaction behind it
      v+=0.3*Math.exp(-t/0.003)*Math.sin(2*Math.PI*5.3/tau*t);      // header-pipe ring
      v+=(Math.random()*2-1)*0.55*Math.exp(-t/0.0022);             // combustion bark
      d[k]+=a*v;}}
  // remove DC and normalise
  let m=0;for(let i=0;i<n;i++)m+=d[i];m/=n;let mx=0;for(let i=0;i<n;i++){d[i]-=m;mx=Math.max(mx,Math.abs(d[i]));}for(let i=0;i<n;i++)d[i]*=0.9/mx;return buf;}
function engineVoice(ac,dest,buf,vol,cyc){
  const G=v=>{const g=ac.createGain();g.gain.value=v;return g;},F=(type,f,q,gain)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;if(gain!=null)b.gain.value=gain;return b;};
  const pre=G(0.5),s1=ac.createBufferSource(),s2=ac.createBufferSource();
  for(const s of [s1,s2]){s.buffer=cyc;s.loop=true;}
  s1.connect(G(.8)).connect(pre);s2.connect(G(.4)).connect(pre); // two exhaust banks, a hair apart = thickness
  // hard-ish clipping: the rasp of a race exhaust (and it fattens the low end)
  const sh=ac.createWaveShaper();const cv=new Float32Array(2048);for(let i=0;i<2048;i++){const x=i/1023.5-1;cv[i]=Math.tanh(2.6*x)*0.9+0.1*x;}sh.curve=cv;sh.oversample='4x';
  const lp=F('lowpass',2500,.6),out=G(vol);
  pre.connect(sh).connect(F('highpass',28,.7)).connect(F('lowshelf',150,.7,6)).connect(F('peaking',95,1.1,3)).connect(F('peaking',320,0.9,2))
    .connect(F('peaking',1150,1.3,4)).connect(F('peaking',3200,1,-5)).connect(lp).connect(out).connect(dest);
  // induction roar: the airbox gulping above the driver's head, only under load
  const ns=ac.createBufferSource();ns.buffer=buf;ns.loop=true;const ig=G(0),ibp=F('bandpass',500,1.4);ns.connect(ibp).connect(ig).connect(out);
  s1.start(0,Math.random()*0.3);s2.start(0,Math.random()*0.3);ns.start(0,Math.random()*1.5);
  let cutUntil=0,blipUntil=0;
  return{out,
    cut(t){cutUntil=t+0.05;},blip(t){blipUntil=t+0.1;},
    set(rpm,thr,t,v){const ar=1500+clamp((rpm-4000)/8200,0,1.05)*7800+(t<blipUntil?900:0),rate=ar/ENG_R0;
      s1.playbackRate.setTargetAtTime(rate,t,.015);s2.playbackRate.setTargetAtTime(rate*1.003,t,.015);
      const th=t<blipUntil?1:thr;
      // on throttle the top opens right up; off it the note goes dull and hollow
      lp.frequency.setTargetAtTime(th>0.05?1200+ar*0.55*(0.35+0.65*th):520+ar*0.06,t,.04);
      pre.gain.setTargetAtTime(t<cutUntil?0.12:0.4+0.6*th,t,t<cutUntil?.004:.03);
      ibp.frequency.setTargetAtTime(ar/20*2,t,.05);
      ig.gain.setTargetAtTime(th*clamp(ar/9000,0,1)*0.09,t,.05);
      if(v!=null)out.gain.setTargetAtTime(v,t,.05);}};
}
/* The engine as a real exhaust, not a looped recording. A looped cycle whose playback rate follows rpm drags every
   resonance up and down with the revs, which is exactly what sounds electronic; on a real car only the firing rate
   moves, while the pipes and the bodywork ring at fixed frequencies. So an AudioWorklet fires the six cylinders one
   by one in real time: each blow-down pulse has a near-vertical front, an exponential fall and a rarefaction behind
   it, every firing is a little different in strength and timing (cycle-to-cycle variation — the "life" in the
   note), and each carries a short burst of combustion noise. The pulse train then excites fixed-length exhaust
   pipe resonators (feedback delays: the two banks' pipes are different lengths) and fixed body/exhaust formants —
   the character heard in onboard recordings of F1 cars: hard and raspy under load, hollow and burbling on the
   overrun. Browsers without AudioWorklet keep the looped-cycle voice above. */
const ENGINE_WORKLET=`class HrcEngine extends AudioWorkletProcessor{
  static get parameterDescriptors(){return [{name:'rpm',defaultValue:3000,minValue:300,maxValue:20000,automationRate:'k-rate'},{name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}];}
  constructor(){super();this.t=0;this.next=0;this.cyl=0;this.amp=[1,.84,.96,.78,.93,.86];this.P=[];this.seed=(Math.random()*4294967295)>>>0;this.dc=0;}
  r(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
  process(_i,outs,par){const o=outs[0][0];if(!o)return true;const rpm=par.rpm[0],load=par.load[0],dt=1/sampleRate,fire=120/rpm/6;
    for(let i=0;i<o.length;i++){
      if(this.t>=this.next){const k=this.cyl;this.cyl=(k+1)%6;this.next=this.t+fire*(1+(this.r()-.5)*.035);
        this.P.push({t:0,a:this.amp[k]*(.86+this.r()*.28)*(.28+.72*load),n:(.45+.55*load)*(.75+this.r()*.5),tau:Math.min(fire*.33,.0042)+.0005});}
      let v=0;
      for(let j=this.P.length-1;j>=0;j--){const p=this.P[j],t=p.t;
        let s=Math.min(1,t/.00012)*Math.exp(-t/p.tau)-.38*Math.exp(-t/(p.tau*2.6))*(1-Math.exp(-t/(p.tau*.7)));
        s+=(this.r()*2-1)*p.n*.55*Math.exp(-t/.0011);
        v+=p.a*s;p.t=t+dt;if(p.t>.03)this.P.splice(j,1);}
      this.dc+=(v-this.dc)*.0007;o[i]=v-this.dc;this.t+=dt;}
    if(this.t>1000){this.next-=this.t;this.t=0;}
    return true;}}
registerProcessor('hrc-engine',HrcEngine);`;
function workletVoice(ac,dest,nbuf,vol){
  const G=v=>{const g=ac.createGain();g.gain.value=v;return g;},F=(type,f,q,gain)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;if(gain!=null)b.gain.value=gain;return b;};
  const node=new AudioWorkletNode(ac,'hrc-engine',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
  const pre=G(.2),sh=ac.createWaveShaper(),cv=new Float32Array(2048);for(let i=0;i<2048;i++){const x=i/1023.5-1;cv[i]=Math.tanh(2.2*x)*.85+.15*x;}sh.curve=cv;sh.oversample='4x';
  // exhaust pipes: two feedback delays (round trip of ~1.05 m and ~1.6 m of pipe; an open end reflects inverted)
  const sum=G(1),d1=ac.createDelay(.05),d2=ac.createDelay(.05),f1=G(-.42),f2=G(-.28);d1.delayTime.value=.0061;d2.delayTime.value=.0093;
  node.connect(pre).connect(sh).connect(sum);sum.connect(d1).connect(f1).connect(sum);sum.connect(d2).connect(f2).connect(sum);
  const lp=F('lowpass',1800,.7),out=G(vol);
  sum.connect(F('highpass',32,.7)).connect(F('lowshelf',130,.7,5)).connect(F('peaking',260,1,2)).connect(F('peaking',1500,1.1,4))
    .connect(F('peaking',3600,1,-6)).connect(lp).connect(out).connect(dest);
  // induction roar above the driver's head, only under load
  const ns=ac.createBufferSource();ns.buffer=nbuf;ns.loop=true;const ig=G(0),ibp=F('bandpass',500,1.4);ns.connect(ibp).connect(ig).connect(out);ns.start(0,Math.random()*1.5);
  const rpmP=node.parameters.get('rpm'),loadP=node.parameters.get('load');let cutUntil=0,blipUntil=0;
  return{out,node,cut(t){cutUntil=t+.05;},blip(t){blipUntil=t+.1;},
    set(rpm,thr,t,v){const ar=1500+clamp((rpm-4000)/8200,0,1.05)*7800+(t<blipUntil?900:0),th=t<blipUntil?1:thr;
      rpmP.setTargetAtTime(ar,t,.012);loadP.setTargetAtTime(t<cutUntil?.04:th,t,t<cutUntil?.004:.025);
      lp.frequency.setTargetAtTime(th>.05?1300+ar*.5*(.35+.65*th):600+ar*.05,t,.04);
      pre.gain.setTargetAtTime(.14+.1*th,t,.03);ibp.frequency.setTargetAtTime(ar/10,t,.05);ig.gain.setTargetAtTime(th*clamp(ar/9000,0,1)*.08,t,.05);
      if(v!=null)out.gain.setTargetAtTime(v,t,.05);}};}
function audioInit(){try{const ac=new (window.AudioContext||window.webkitAudioContext)();
  const master=ac.createGain();master.gain.value=.55;const comp=ac.createDynamicsCompressor();master.connect(comp).connect(ac.destination);
  const buf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const mk=(type,fr,q)=>{const n=ac.createBufferSource();n.buffer=buf;n.loop=true;const bf=ac.createBiquadFilter();bf.type=type;bf.frequency.value=fr;bf.Q.value=q;const g=ac.createGain();g.gain.value=0;n.connect(bf).connect(g).connect(master);n.start();return g;};
  const cyc=engineCycle(ac);
  au={ac,master,buf,me:engineVoice(ac,master,buf,.34,cyc),opp:engineVoice(ac,master,buf,0,cyc),sq:mk('bandpass',1250,4),wn:mk('lowpass',500,.7)};
  // swap in the real-time exhaust as soon as its worklet has loaded (the looped voice plays until then, or for good)
  if(ac.audioWorklet&&window.AudioWorkletNode){const url=URL.createObjectURL(new Blob([ENGINE_WORKLET],{type:'text/javascript'}));
    ac.audioWorklet.addModule(url).then(()=>{if(!au)return;const me=workletVoice(ac,master,buf,.36),opp=workletVoice(ac,master,buf,0);
      au.me.out.disconnect();au.opp.out.disconnect();au.me=me;au.opp=opp;}).catch(()=>{});}}catch(e){au=null;}}
function pop(t){const ac=au.ac,s=ac.createBufferSource();s.buffer=au.buf;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=rand(320,950);f.Q.value=1.1;
  const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(rand(.15,.38),t+.004);g.gain.exponentialRampToValueAtTime(.001,t+rand(.04,.11));
  s.connect(f).connect(g).connect(au.master);s.start(t,Math.random()*1.5,.12);}
// the string of pops down the exhaust after a lift: unburnt fuel lighting off in the pipes
function crackle(t,rpm){const n=2+Math.floor(Math.random()*4);
  for(let k=0;k<n;k++)pop(t+0.04+k*rand(0.03,0.11));}
// engine revs: road speed × gear. Pulling away in 1st the clutch slips and holds the revs at ~8 000 until the road
// speed catches up (~50 km/h), and wheelspin flares them a little — never up to the shift point, so the rev counter
// never sits high while the gearbox refuses to change
function rpmOf(c){const kmh=c.v*3.6,g=gearOf(c);let r=clamp(engRpm(kmh,g),RPM_IDLE,12200);
  if(g===0)r=Math.max(r,RPM_IDLE+c.throttle*4000);
  if(c.spin>0)r=Math.min(Math.max(r,RPM_UP-300),r+c.spin*1200);
  return r;}
function audioUpdate(rpm,g){if(!au)return;const t=au.ac.currentTime,c=player;
  au.master.gain.setTargetAtTime(paused||muted||replay?0:.55,t,.05);
  if(g>lastGear&&c.throttle>.3)au.me.cut(t);else if(g<lastGear){au.me.blip(t);crackle(t,rpm);}lastGear=g;
  // slamming the throttle shut at high revs: the exhaust crackles on the overrun
  if(lastThr>0.55&&c.throttle<0.12&&rpm>4200)crackle(t,rpm);lastThr=c.throttle;
  au.me.set(rpm,c.throttle,t);
  if(c.throttle<.05&&rpm>5200&&c.v>15&&Math.random()<.05)pop(t);
  // nearest rival: distance attenuation + doppler
  let o=null,bd=150;for(const x of cars){if(x===c||x.parked)continue;const d=Math.hypot(x.x-c.x,x.z-c.z);if(d<bd){bd=d;o=x;}}
  if(o){const dx=o.x-c.x,dz=o.z-c.z,d=Math.max(bd,1),vr=((Math.cos(o.yaw)*o.v-Math.cos(c.yaw)*c.v)*dx+(Math.sin(o.yaw)*o.v-Math.sin(c.yaw)*c.v)*dz)/d;
    au.opp.set(rpmOf(o)*clamp(343/(343+vr),0.7,1.4),o.throttle,t,clamp(9/d,0,1)*0.28);}else au.opp.set(4000,0,t,0);
  au.sq.gain.setTargetAtTime(Math.min(.25,(c.slip+(c.spin||0)*.5)*.6)*(c.v>3?1:0),t,.05);
  au.wn.gain.setTargetAtTime(Math.min(.3,(c.v/85)**2*.3),t,.1);}

/* ================= CAMERA / VISUALS ================= */
function updateVisuals(dt){
  const sdt=Math.min(dt,1/30),al=clamp(acc/H,0,1);
  // render between the last two physics states so motion is smooth at any refresh rate
  for(const c of cars){if(c.px===undefined){c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;}
    c.rx=c.px+(c.x-c.px)*al;c.rz=c.pz+(c.z-c.pz)*al;c.ryaw=c.pyaw+wrapA(c.yaw-c.pyaw)*al;}
  for(const c of cars){const m=c.mesh;m.root.position.set(c.rx,CAR_Y+(c.pitStop>0?.13:0),c.rz);if(m.contact)m.contact.visible=!(c.pitStop>0);
    c.visSlide=0; // real slip angle is simulated now (body yaw ≠ travel direction)
    // impact twist is applied to the whole car (body + wheels) so the body never shears off its wheels
    m.root.rotation.y=-c.ryaw+clamp(c.jy||0,-0.03,0.03);
    // suspension: damped springs toward load-transfer targets (nose dive, body roll)
    // stiff F1-like suspension: only a hint of roll/dive, critically damped so keyboard taps don't rock the car
    const tp=clamp(c.aLong*0.0003,-0.012,0.008),tr=clamp(-c.aLat*0.00012,-0.006,0.006);
    c.pitchV+=((tp-c.pitch)*160-c.pitchV*25)*sdt;c.pitch+=c.pitchV*sdt;
    c.rollV+=((tr-c.roll)*160-c.rollV*25)*sdt;c.roll+=c.rollV*sdt;
    // impact twist: critically damped, so it eases back once instead of wagging left-right before settling
    c.jyV=(c.jyV||0)+(-(c.jy||0)*220-c.jyV*30)*sdt;c.jy=(c.jy||0)+c.jyV*sdt;
    if(!isFinite(c.roll)||!isFinite(c.pitch)){c.roll=c.pitch=c.rollV=c.pitchV=0;}if(!isFinite(c.jy)){c.jy=c.jyV=0;}
    m.body.rotation.set(clamp(c.roll,-0.05,0.05),0,clamp(c.pitch,-0.04,0.04));
    for(const w of m.wheels)w.rotation.z-=c.v*dt/(0.36*WHEEL_S);for(const s of m.steer)s.rotation.y=-c.delta*1.4;
    setFar(m,c!==player&&Math.hypot(c.rx-camera.position.x,c.rz-camera.position.z)>FAR_D);
    m.flap.rotation.z=c.drsOpen?-.04:-.45;m.tail.color.setHex(c.brake>.1?0xff1010:0x4a0000);
    // the steering wheel: a keyboard flicks the steering on and off, so the wheel the driver holds is eased towards it
    // (critically damped) and limited to ±90° — it no longer snaps from lock to lock with every key tap
    if(m.sw&&c===player){const tgt=clamp(c.delta*6,-1.57,1.57);c.swV=(c.swV||0)+((tgt-(c.swA||0))*90-(c.swV||0)*19)*sdt;
      c.swV=clamp(c.swV,-6,6);c.swA=clamp((c.swA||0)+c.swV*sdt,-1.57,1.57);m.sw.rotation.x=c.swA;}}
  // pit crew: parked on every car currently stationary in its box, wheel guns running until the
  // last moment, lollipop turning green as the jacks drop
  {let ci=0;
   for(const c of cars){if(c.pitStop<=0)continue;
     if(ci>=crews.length)crews.push(makeCrew());
     const g=crews[ci++];g.visible=true;g.position.set(c.rx,0,c.rz);g.rotation.y=-c.ryaw;
     const t=c.pitStop,busy=t>0.75;
     g.userData.lolMat.color.setHex(busy?0xff2020:0x22dd44);
     for(const gn of g.userData.guns)if(busy)gn.rotation.x+=34*dt;
     for(const w of g.userData.wheels)w.visible=busy;}
   for(let k=ci;k<crews.length;k++)crews[k].visible=false;}
  drawSafetyCar(dt,al);updateMarshalPanels();animBoxMarker();
  updatePitHud();
  // the TV POD camera follows position and heading only —
  // it is NOT tied to body roll/pitch, so the horizon stays level whatever the chassis does.
  // Two things made this view sickening and both are fixed here:
  //  1. the heading was welded 1:1 to the chassis, so every steering tap and every degree of slip
  //     angle swung the whole world. It is now a damped follow that aims where the car is TRAVELLING.
  //  2. the field of view grew with speed. A FOV that breathes is a classic nausea trigger; it is fixed.
  const c=player;
  const tgt=c.ryaw-clamp(wrapA(c.ryaw-c.chi),-0.4,0.4)*0.6;
  if(camYaw===null)camYaw=tgt;else camYaw+=wrapA(tgt-camYaw)*(1-Math.exp(-dt/0.2));
  const hx=Math.cos(camYaw),hz=Math.sin(camYaw);
  // C toggles the view: the TV POD (default — the broadcast camera pod on top of the airbox: halo, mirrors and front
  // wheels in shot) and COCKPIT / 1st person (the driver's eye inside the helmet, rigid to the car, halo overhead,
  // nose and steering wheel below)
  if(camMode===0){const cx=Math.cos(c.ryaw),cz=Math.sin(c.ryaw),ey=0.02+0.84*CAR_SY,ex=-0.06*CAR_SX; // inside the helmet (its inside faces are not drawn)
    camera.position.set(c.rx+cx*ex,ey,c.rz+cz*ex);_v1.set(c.rx+cx*30,ey-2.5,c.rz+cz*30);}
  else{camera.position.set(c.rx-hx*0.39,1.25,c.rz-hz*0.39);_v1.set(c.rx+hx*40,0.75,c.rz+hz*40);}
  camera.up.set(0,1,0);
  camera.lookAt(_v1);camera.fov=camMode===0?70:66;camera.far=FAR_RACE;
  updateRacingLine();
  camera.updateProjectionMatrix();
  aimSun(c.rx,c.rz);
}
const _v1=new THREE.Vector3();
let camYaw=null; // damped camera heading; reset when a car is placed on the grid
let camMode=1;const CAM_MODES=["COCKPIT (1ST PERSON)","TV POD"]; // the TV POD is the default view

/* ---- pit banner: counts down the approach to the entry, then narrates the stop itself ---- */
const pitHud=document.createElement('div');
pitHud.style.cssText='position:fixed;left:50%;top:19%;transform:translateX(-50%);z-index:35;display:none;'+
 'text-align:center;font:800 15px/1.55 Titillium Web,sans-serif;color:#fff;letter-spacing:.07em;'+
 'background:rgba(8,11,16,.84);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:9px 20px;white-space:nowrap';
document.body.appendChild(pitHud);
function updatePitHud(){
  const c=player,show=h=>{elHtml(pitHud,h);elSty(pitHud,'display','block');};
  if(!c||phase!=='race'){elSty(pitHud,'display','none');return;}
  if(c.pitStop>0){
    const t=c.pitStop,stage=t>0.75?'TYRE CHANGE':'READY TO GO';
    show('<span style="color:'+(t>0.75?'#ff5252':'#3ddc6a')+'">● </span>'+stage+
      ' — <b>'+t.toFixed(1)+'s</b><br><span style="font-weight:400;opacity:.8;font-size:12px">'+
      COMP[c.nextComp].name+(c.damage>0.05?' · NEW FRONT WING':'')+'</span>');return;}
  const sp=spOf(c.s),d=PIT_A-sp,planned=c.planLap!=null&&c.planLap===c.lapCount+1&&!c.boxDone;
  if(!c.pitSide&&d>0&&(d<420||(planned&&d<1200))){
    show((planned?'<span style="color:#ffd200">BOX THIS LAP</span> · ':'')+'<span style="color:#4aa3ff">▸ PIT ENTRY</span> '+Math.round(d)+' m'+
      '<br><span style="font-weight:400;opacity:.8;font-size:12px">Follow the red lane · next tyre '+COMP[c.nextComp].name+
      (wingNeeded(c)?' · new front wing':'')+'</span>');return;}
  // in the lane: steer into the working lane and stop the car inside your painted box
  if(c.pitSide&&!c.boxDone&&!c.dnf){const along=BOX_S[c.team]-sp,lat=PIT_OFF+BOX_D-c.d;
    const inBox=Math.abs(along)<1.0&&Math.abs(lat)<0.8;
    const side=Math.abs(lat)<0.8?'<span style="color:#3ddc6a">LINED UP</span>':lat>0?'MOVE RIGHT '+lat.toFixed(1)+' m ▸':'◂ MOVE LEFT '+(-lat).toFixed(1)+' m';
    let head;
    if(inBox)head='<span style="color:#3ddc6a">■ IN THE BOX</span> — '+(c.v<0.4?'STOPPING':'BRAKE TO A STOP');
    else if(along<-1.0)head='<span style="color:#ff5252">OVERSHOT '+(-along).toFixed(1)+' m</span> — hold <b>S</b> to reverse';
    else if(along<160)head='<span style="display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-1px;background:'+hex(c.col)+'"></span> <span style="color:#ffd200">YOUR BOX</span> '+along.toFixed(along<20?1:0)+' m';
    else head='<span style="color:#ffd200">PIT LANE 60 km/h</span>';
    show(head+'<br><span style="font-weight:400;opacity:.85;font-size:12px">'+(along<160?side+' · stop inside the box':'Your box is on the right, past the 60 line')+'</span>');return;}
  if(c.limiter){show('<span style="color:#ffd200">PIT LANE 60 km/h</span><br>'+
    '<span style="font-weight:400;opacity:.8;font-size:12px">'+(c.boxDone?'Hold to the exit':'Stop in your box')+'</span>');return;}
  elSty(pitHud,'display','none');}

/* ---- rear-view mirror: a backward camera behind the rear wing, rendered to a texture and drawn
   horizontally flipped (as a real mirror) into the frame at the top of the screen ---- */
const mirrorRT=new THREE.WebGLRenderTarget(4,4);
const mirrorCam=new THREE.PerspectiveCamera(34,3.6,0.5,1500);
const ovScene=new THREE.Scene(),ovCam=new THREE.OrthographicCamera(-.5,.5,.5,-.5,0,2);
const ovQuad=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:mirrorRT.texture,side:THREE.DoubleSide,depthTest:false}));
ovQuad.scale.x=-1;ovQuad.position.z=-1;ovScene.add(ovQuad);
let mFrame=0,mRect=null,mRectT=0;
// The mirror used to see as far as the main view (1.5 km), so it re-drew most of the city a second time — ~130 draw
// calls and 6–8 ms of CPU per refresh on an integrated GPU. It now sees a few hundred metres (what a mirror shows
// anyway) behind its own short fog, so far tiles are culled and the cut-off is invisible.
const mirrorFog=new THREE.Fog(scene.fog.color.getHex(),100,400);
function renderMirror(){
  if(!player||Q.mirror===0||$("hud").hidden)return;
  // the frame's rectangle is read only occasionally: getBoundingClientRect() right after the HUD writes forced a
  // synchronous style/layout pass every frame
  if(!mRect||--mRectT<=0){mRect=$("mirror").getBoundingClientRect();mRectT=30;}
  const r=mRect;if(r.width<10)return;
  const x=r.left+4,y=r.top+4,w=r.width-8,h=r.height-8,dpr=renderer.getPixelRatio()*Q.mirrorScale,tw=Math.round(w*dpr),th=Math.round(h*dpr);
  if(mirrorRT.width!==tw||mirrorRT.height!==th)mirrorRT.setSize(tw,th);
  if((mFrame++%Q.mirror)===0){ // refresh the mirror image every Q.mirror-th frame (shadow map is reused, not re-rendered) (level, heading-only like the T-cam)
    const c=player,hx=Math.cos(c.ryaw),hz=Math.sin(c.ryaw);
    mirrorCam.position.set(c.rx-hx*3.0*CAR_SX,0.9*CAR_SY,c.rz-hz*3.0*CAR_SX);_v1.set(c.rx-hx*60,0.8,c.rz-hz*60);mirrorCam.lookAt(_v1);mirrorCam.aspect=w/h;
    mirrorCam.far=Q.mirrorFar;mirrorCam.updateProjectionMatrix();
    mirrorFog.near=Q.mirrorFar*0.3;mirrorFog.far=Q.mirrorFar*0.97;
    // in a mirror a few hundred pixels wide every rival is small: draw them all with the one-draw-call LOD
    const fog=scene.fog;scene.fog=mirrorFog;
    for(const o of cars)if(o!==player){o.mirrorWas=o.mesh.isFar;setFar(o.mesh,true);}
    renderer.setRenderTarget(mirrorRT);renderer.render(scene,mirrorCam);renderer.setRenderTarget(null);
    for(const o of cars)if(o!==player)setFar(o.mesh,o.mirrorWas);
    scene.fog=fog;
}
  renderer.autoClear=false;renderer.setScissorTest(true);
  renderer.setViewport(x,vh-y-h,w,h);renderer.setScissor(x,vh-y-h,w,h);renderer.render(ovScene,ovCam);
  renderer.setScissorTest(false);renderer.setViewport(0,0,vw,vh);renderer.autoClear=true;}

// F1-game style proximity arrows: amber = car closing on that side, red = car alongside
function updateProximity(){
  const c=player,fx=Math.cos(c.yaw),fz=Math.sin(c.yaw);let pl=0,pr=0,al=false,ar=false;
  for(const o of cars){if(o===c||o.parked||o.pitStop>0||o.pitSide!==c.pitSide)continue;const dx=o.x-c.x,dz=o.z-c.z;if(dx*dx+dz*dz>900)continue;
    const lg=dx*fx+dz*fz,lt=-dx*fz+dz*fx;if(lg>2*HX||lg<-24||Math.abs(lt)<0.8||Math.abs(lt)>8)continue;
    const k=clamp(1-Math.max(0,-lg-2*HX)/18,0,1)*clamp(1-(Math.abs(lt)-2.6)/5.4,0.4,1),side=Math.abs(lg)<2*HX;
    if(lt>0){pr=Math.max(pr,k);ar=ar||side;}else{pl=Math.max(pl,k);al=al||side;}}
  const ol=pl.toFixed(2),or=pr.toFixed(2),cl=al?'#ff2a1a':'#ffb000',cr=ar?'#ff2a1a':'#ffb000';
  if(_hc.pl!==ol){_hc.pl=ol;$('proxL').style.opacity=ol;}if(_hc.pr!==or){_hc.pr=or;$('proxR').style.opacity=or;}
  if(_hc.cl!==cl){_hc.cl=cl;$('proxL').style.color=cl;}if(_hc.cr!==cr){_hc.cr=cr;$('proxR').style.color=cr;}}
let orbit=0;const CX=X.reduce((a,b)=>a+b,0)/N,CZ=Z.reduce((a,b)=>a+b,0)/N;
const ORB=Math.max(...Array.from(X,(x,i)=>Math.hypot(x-CX,Z[i]-CZ)))*0.85+250;
function menuCamera(dt){orbit+=dt*0.05;camera.position.set(CX+Math.cos(orbit)*ORB,ORB*0.45,CZ+Math.sin(orbit)*ORB);camera.lookAt(CX,0,CZ);camera.fov=55;camera.far=FAR_MENU;camera.updateProjectionMatrix();
sun.position.set(CX+200,600,CZ+100);sun.target.position.set(CX,0,CZ);}

/* ================= DYNAMIC RACING LINE (assist) =================
   Colour of each point = your current speed vs the ideal speed there:
   green = keep accelerating, yellow = lift/ease off, red = you must be braking by here */
const RLN=150,RL_MODES=['OFF','FULL','CORNERS ONLY'];let rlMode=1;
const rlPos=new Float32Array(RLN*2*3),rlCol=new Float32Array(RLN*2*4);
const rlGeo=new THREE.BufferGeometry();
rlGeo.setAttribute('position',new THREE.BufferAttribute(rlPos,3).setUsage(THREE.DynamicDrawUsage));
rlGeo.setAttribute('color',new THREE.BufferAttribute(rlCol,4).setUsage(THREE.DynamicDrawUsage));
{const ix=[];for(let k=0;k<RLN-1;k++){const o=k*2;ix.push(o,o+1,o+2,o+1,o+3,o+2);}rlGeo.setIndex(ix);}
const rlMesh=new THREE.Mesh(rlGeo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8}));
rlMesh.frustumCulled=false;rlMesh.visible=false;scene.add(rlMesh);
const GRN=[.12,.95,.35],YEL=[1,.82,.1],RED=[1,.12,.08];
function updateRacingLine(){
  const c=player;rlMesh.visible=rlMode>0&&!c.pitSide&&c.pitStop<=0&&!c.finished;if(!rlMesh.visible)return;
  const sc=Math.sqrt(tyreGrip(c)/0.975)*(1-0.12*c.damage)*0.96;const i0=c.idx+3;
  for(let k=0;k<RLN;k++){const i=(i0+k)%N,rx=-TZ[i],rz=TX[i],o=RL[i];
    const q=k*6;rlPos[q]=X[i]+rx*(o-.42);rlPos[q+1]=.06;rlPos[q+2]=Z[i]+rz*(o-.42);rlPos[q+3]=X[i]+rx*(o+.42);rlPos[q+4]=.06;rlPos[q+5]=Z[i]+rz*(o+.42);
    const vt=VP[i]*sc,diff=c.v-vt;let col;
    if(diff<=-8)col=GRN;else if(diff<=0){const t=(diff+8)/8;col=GRN.map((g,j)=>g+(YEL[j]-g)*t);}else if(diff<4){const t=diff/4;col=YEL.map((y,j)=>y+(RED[j]-y)*t);}else col=RED;
    let a=0.78*Math.min(1,k/6)*Math.min(1,(RLN-k)/30);
    if(rlMode===2&&diff<-10&&VP[i]>72)a=0;
    const p=k*8;rlCol[p]=rlCol[p+4]=col[0];rlCol[p+1]=rlCol[p+5]=col[1];rlCol[p+2]=rlCol[p+6]=col[2];rlCol[p+3]=rlCol[p+7]=a;}
  rlGeo.attributes.position.needsUpdate=true;rlGeo.attributes.color.needsUpdate=true;}

/* ================= RESULTS ================= */
function showResults(){if(resultsShown)return;resultsShown=true;$('results').hidden=false;renderResults();const iv=setInterval(()=>{if($('results').hidden){clearInterval(iv);return;}renderResults();},1000);}
function renderResults(){
  const o=order();const lead=o[0];
  const fin=o.filter(c=>c.finished).map(c=>({c,total:c.finishT+c.pen}));
  const rest=o.filter(c=>!c.finished).map(c=>({c,total:null}));
  fin.sort((a,b)=>(Math.min(b.c.lapCount,targetLaps)-Math.min(a.c.lapCount,targetLaps))||(a.total-b.total));
  let cls=[...fin,...rest];const dsq=cls.filter(r=>r.c.used.size<2&&r.c.lapCount>=1&&!r.c.dnf);cls=cls.filter(r=>!dsq.includes(r));
  const leadT=fin.length?fin[0].total:null;const flCar=fastest?fastest.car:null;
  let rows='';cls.forEach((r,k)=>{const c=r.c;let pts=k<10&&!c.dnf?POINTS[k]:0;if(k<10&&flCar===c)pts+=1;
    const laps=Math.max(0,Math.min(c.lapCount,targetLaps));const ld=Math.min(lead.lapCount,targetLaps)-laps;
    const time=c.dnf?'<span style="color:var(--red)">DNF · '+(c.dnfWhy||'')+'</span>':r.total==null?'RUNNING':k===0?fmtRace(r.total):ld>0?'+'+ld+' LAP':'+'+(r.total-leadT).toFixed(3)+'s';
    rows+=`<tr class="${c.isPlayer?'me':''}"><td class="num">${k+1}</td><td><span class="sw" style="background:${hex(c.col)}"></span>${c.isPlayer?'<b>YOU</b>':c.name} <span style="color:var(--mute)">#${c.num}</span></td><td>${TEAMS[c.team].name}</td><td class="num">${laps}</td><td class="num">${time}</td><td class="num">${c.pen?'+'+c.pen+'s':''}</td><td class="num" style="${flCar===c?'color:var(--purple);font-weight:700':''}">${fmt(c.bestLap)}</td><td class="num pts">${pts||''}</td></tr>`;});
  dsq.forEach(r=>{const c=r.c;rows+=`<tr class="${c.isPlayer?'me':''}"><td>DSQ</td><td><span class="sw" style="background:${hex(c.col)}"></span>${c.isPlayer?'<b>YOU</b>':c.name}</td><td>${TEAMS[c.team].name}</td><td class="num">${Math.max(0,Math.min(c.lapCount,targetLaps))}</td><td colspan="4" style="color:var(--red)">DISQUALIFIED — two compounds not used</td></tr>`;});
  $('resBody').innerHTML=rows;
  $('resSub').textContent=`${targetLaps} laps · ${(targetLaps*L/1000).toFixed(3)} km · fastest lap ${fastest?fastest.car.code+' '+fmt(fastest.t):'—'}`;
}

/* ================= REPLAY (key 0) =================
   The last 20 s of every car are kept (30 snapshots a second). Pressing 0 freezes the race and plays
   that stretch back through trackside broadcast cameras: each camera stands just behind the fence,
   picks the car up as it approaches, zooms to keep it framed, and hands over to the next one once the
   car has gone past. 0 again (or the end of the clip) returns to the live race exactly where it was. */
// snapshots are taken on the physics clock (every 2nd 120 Hz step = exactly 60 Hz), NOT on the display
// clock: frame-timed snapshots were unevenly spaced, and playing them back as if evenly spaced made the cars stutter
const REC_HZ=60,REC_N=20*REC_HZ,REC_F=8;
let recBuf=null,recHead=0,recLen=0,recStep=0,replay=null;
function recReset(){recBuf=new Float32Array(REC_N*cars.length*REC_F);recHead=0;recLen=0;recStep=0;}
function recFrame(){if(!recBuf||recBuf.length!==REC_N*cars.length*REC_F)recReset();
  const o=recHead*cars.length*REC_F;
  cars.forEach((c,k)=>{const p=o+k*REC_F;recBuf[p]=c.x;recBuf[p+1]=c.z;recBuf[p+2]=c.yaw;recBuf[p+3]=c.v;
    recBuf[p+4]=c.delta||0;recBuf[p+5]=c.brake||0;recBuf[p+6]=c.drsOpen?1:0;recBuf[p+7]=c.pitStop>0?1:0;});
  recHead=(recHead+1)%REC_N;recLen=Math.min(REC_N,recLen+1);}
// broadcast camera positions: every ~200 m, on the outside of the bend, 2 m behind the fence, 8 m up
const TVC=[];{const step=Math.round(200/DS);
  for(let i=0;i<N;i+=step){const sp=spI(i);let side=K[i]>0?-1:1; // K>0 bends right-side-inside, so the outside is the leftif(Math.abs(K[i])<1/400)side=(i/step)%2?1:-1;
    if(sp>PIT_A-60&&sp<PIT_D+60)side=-1; // never stand in the pit lane
    const off=side>0?WR[i]+2.2:-(WL[i]+2.2);TVC.push({i,x:X[i]-TZ[i]*off,z:Z[i]+TX[i]*off,y:8});}}
const rpBadge=document.createElement('div');
rpBadge.style.cssText='position:fixed;left:18px;top:16px;z-index:40;display:none;font:800 15px/1.4 Titillium Web,sans-serif;color:#fff;'+
  'letter-spacing:.12em;background:rgba(8,11,16,.84);border-left:4px solid #e10600;border-radius:4px;padding:7px 14px';
document.body.appendChild(rpBadge);
function startReplay(){
  if(replay||phase==='menu'||resultsShown||!player)return;
  if(recLen<REC_HZ*2){msg('REPLAY NOT READY YET');return;}
  // copy the clip out in time order, oldest first
  const n=recLen,fs=cars.length*REC_F,clip=new Float32Array(n*fs);
  for(let k=0;k<n;k++){const src=((recHead-n+k)%REC_N+REC_N)%REC_N;clip.set(recBuf.subarray(src*fs,src*fs+fs),k*fs);}
  replay={clip,n,t:0,cam:null,look:null,wasPaused:paused};paused=true;
  rlMesh.visible=false;elSty(pitHud,'display','none');for(const g of crews)g.visible=false;
  $('mirror').style.visibility='hidden';rpBadge.style.display='block';
  if(au)au.master.gain.setTargetAtTime(0,au.ac.currentTime,.05);}
function endReplay(){if(!replay)return;paused=replay.wasPaused;replay=null;rpBadge.style.display='none';$('mirror').style.visibility='';
  for(const c of cars){c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;} // back to the live positions without a smear
  camYaw=null;}
function replayFrame(dt){
  const R=replay;R.t+=dt;const dur=(R.n-1)/REC_HZ;if(R.t>=dur){endReplay();return;}
  const f=R.t*REC_HZ,i0=Math.floor(f),a=f-i0,fs=cars.length*REC_F,A=i0*fs,B=Math.min(R.n-1,i0+1)*fs,cl=R.clip;
  const A0=Math.max(0,i0-1)*fs,B1=Math.min(R.n-1,i0+2)*fs,a2=a*a,a3=a2*a;
  const cr=(p0,p1,p2,p3)=>0.5*(2*p1+(p2-p0)*a+(2*p0-5*p1+4*p2-p3)*a2+(3*p1-p0-3*p2+p3)*a3);
  cars.forEach((c,k)=>{const p=k*REC_F,m=c.mesh;
    const x=cr(cl[A0+p],cl[A+p],cl[B+p],cl[B1+p]),z=cr(cl[A0+p+1],cl[A+p+1],cl[B+p+1],cl[B1+p+1]),yaw=cl[A+p+2]+wrapA(cl[B+p+2]-cl[A+p+2])*a,v=cl[A+p+3]+(cl[B+p+3]-cl[A+p+3])*a;
    m.root.position.set(x,CAR_Y+(cl[A+p+7]?.13:0),z);if(m.contact)m.contact.visible=!cl[A+p+7];m.root.rotation.y=-yaw;m.body.rotation.set(0,0,0);
    for(const w of m.wheels)w.rotation.z-=v*dt/(0.36*WHEEL_S);for(const s of m.steer)s.rotation.y=-cl[A+p+4]*1.4;
    m.flap.rotation.z=cl[A+p+6]?-.04:-.45;m.tail.color.setHex(cl[A+p+5]>.1?0xff1010:0x4a0000);
    if(c===player){R.fx=x;R.fz=z;R.fyaw=yaw;R.fv=v;}});
  // which broadcast camera: stay on one until the car is ~60 m past it, then cut to the next one ahead
  const pi=idxNear(R.fx,R.fz,R.pi);R.pi=pi;
  const ahead=c=>((c.i-pi)%N+N)%N;
  if(R.cam==null||ahead(TVC[R.cam])>N/2&&N-ahead(TVC[R.cam])>30){
    let best=0,bd=1e9;TVC.forEach((c,k)=>{const d=ahead(c);if(d>=25&&d<bd){bd=d;best=k;}});R.cam=best;R.look=null;}
  const C=TVC[R.cam];camera.position.set(C.x,C.y,C.z);
  const tx=R.fx+Math.cos(R.fyaw)*R.fv*0.08,tz=R.fz+Math.sin(R.fyaw)*R.fv*0.08;
  if(!R.look)R.look=new THREE.Vector3(tx,0.8,tz);else R.look.lerp(_v1.set(tx,0.8,tz),1-Math.exp(-dt/0.09));
  camera.up.set(0,1,0);camera.lookAt(R.look);
  const d=Math.hypot(R.look.x-C.x,R.look.z-C.z,C.y);camera.fov=clamp(2*Math.atan(11/d)*180/Math.PI,9,55);camera.far=FAR_RACE;camera.updateProjectionMatrix();
  aimSun(R.fx,R.fz);
  const left=Math.max(0,dur-R.t);
  rpBadge.innerHTML='● REPLAY <span style="font-weight:400;opacity:.75;letter-spacing:.04em">'+left.toFixed(1)+' s · press 0 for live</span>';}
function idxNear(x,z,hint){let best=0,bd=1e18;
  if(hint!=null){for(let k=-40;k<=40;k++){const i=(hint+k+N)%N,d=(X[i]-x)**2+(Z[i]-z)**2;if(d<bd){bd=d;best=i;}}if(bd<900)return best;}
  for(let i=0;i<N;i++){const d=(X[i]-x)**2+(Z[i]-z)**2;if(d<bd){bd=d;best=i;}}return best;}

/* ================= INPUT / BOOT ================= */
addEventListener('keydown',e=>{if(phase==='menu'||phase==='box'||phase==='qdone')return;if(['Space','KeyW','KeyA','KeyD','KeyS','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys[e.code]=true;
  if(!e.repeat&&!replay&&mfdKey(e.code))return;
  if(e.repeat)return;
  if(e.code==='KeyE'&&player){const c=player;if(drsEnabled&&c.zone>=0&&c.drsElig[c.zone]&&c.brake<0.05)c.drsOpen=true;else if(c.zone>=0&&drsEnabled&&!c.drsElig[c.zone])msg('DRS NOT AVAILABLE');}
  if(e.code==='KeyQ'){const i=MODES.indexOf(qState.mode);const m=MODES[(i+1)%MODES.length];setQualityMode(m);msg('GRAPHICS · '+(m==='auto'?'AUTO ('+PRESETS[qName].label+')':PRESETS[m].label));}
  if(e.code==='KeyL'){rlMode=(rlMode+1)%3;msg('RACING LINE · '+RL_MODES[rlMode]);}
  if(e.code==='KeyM')muted=!muted;
  if(e.code==='KeyC'){camMode=(camMode+1)%CAM_MODES.length;msg('CAMERA · '+CAM_MODES[camMode]);}
  if(e.code==='KeyH'){hudMode=(hudMode+1)%3;mRect=null;$('hud').className=['lite','','min'][hudMode];msg('HUD · '+['COMPACT','FULL','MINIMAL'][hudMode]);}
  if(e.code==='Digit0'||e.code==='Numpad0'){if(replay)endReplay();else startReplay();return;}
  if(e.code==='KeyP'||e.code==='Escape'){if(replay){endReplay();return;}togglePause();}
  if(['Digit1','Digit2','Digit3'].includes(e.code)&&player){const n={Digit1:'S',Digit2:'M',Digit3:'H'}[e.code];player.nextComp=n;msg('NEXT TYRE · '+COMP[n].name);}
  if(e.code==='KeyR'&&player&&(phase==='race'||session==='tt')&&player.pitStop<=0&&!player.dnf){if(session==='tt')ttInvalidate('RECOVERED');const c=player,i=c.idx;const d=c.pitSide?PIT_OFF+FAST_D:clamp(c.d,-HWa[i]+1.5,HWa[i]-1.5);c.x=X[i]-TZ[i]*d;c.z=Z[i]+TX[i]*d;c.yaw=c.chi=ANG[i];c.v=0;c.delta=0;c.r=0;c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;msg('BACK ON TRACK');}
});
addEventListener('keyup',e=>{keys[e.code]=false;});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
function togglePause(){if(phase==='menu'||phase==='box'||phase==='qdone'||resultsShown||replay)return;paused=!paused;$('pause').hidden=!paused;
  // restart choices that fit the session: the race (same grid) / the weekend from qualifying / the time trial
  for(const b of document.querySelectorAll('#pause .rs-race'))b.hidden=session!=='race';
  for(const b of document.querySelectorAll('#pause .rs-gp'))b.hidden=session==='tt';
  for(const b of document.querySelectorAll('#pause .rs-tt'))b.hidden=session!=='tt';}
$('resumeBtn').onclick=togglePause;
$('quitBtn').onclick=$('againBtn').onclick=()=>location.reload();
$('pRestartRace').onclick=$('rRestartRace').onclick=()=>{document.activeElement.blur();restartRace();};
$('pRestartQuali').onclick=$('rRestartQuali').onclick=()=>{document.activeElement.blur();restartQuali();};
$('pRestartTT').onclick=()=>{document.activeElement.blur();restartTT();};
$('pLeaderboard').onclick=()=>{document.activeElement.blur();openTTDialog(true);};

/* ---- time trial entry: the driver's real name (Korean or English), checked before the session starts; the dialog
   also shows the circuit's leaderboard. Opened from the pause menu it only shows the board (BACK returns to it). ---- */
let ttFromPause=false;
async function renderBoardTable(){$('ttLb').innerHTML='<tr><td colspan="5" style="color:var(--mute)">Loading…</td></tr>';
  const r=await lbLoad(TRACK_ID);tt.board=r.rows;tt.boardShared=r.shared;const lead=r.rows.length?r.rows[0].t:null;
  $('ttLbSrc').textContent=r.shared?'· ALL PLAYERS':lbShared?'· SERVER UNREACHABLE — THIS BROWSER ONLY':'· THIS BROWSER';
  $('ttLb').innerHTML=r.rows.length?r.rows.slice(0,50).map((x,k)=>'<tr class="'+(x.name===ttName?'me':'')+'"><td class="num">'+(k+1)+'</td><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.team||'')+'</td><td class="num">'+fmt(x.t)+'</td><td class="num">'+(k?'+'+(x.t-lead).toFixed(3):'—')+'</td></tr>').join('')
    :'<tr><td colspan="5" style="color:var(--mute)">No times yet on this circuit — be the first.</td></tr>';}
function openTTDialog(fromPause=false){ttFromPause=fromPause;$('ttTrk').textContent=TR.label;$('ttName').value=ttName;
  $('ttName').classList.remove('bad');$('ttNameMsg').classList.remove('bad');
  $('ttNameMsg').textContent='리더보드에 표시됩니다. 한국어 이름(2–5자) 또는 영어 이름(이름과 성)으로 입력하세요.';
  $('ttGo').textContent=fromPause?'RESTART TIME TRIAL':'START TIME TRIAL';
  if(fromPause)$('pause').hidden=true;else $('menu').hidden=true;
  $('ttDlg').hidden=false;renderBoardTable();if(!fromPause)setTimeout(()=>$('ttName').focus(),50);}
$('ttBtn').onclick=()=>{document.activeElement.blur();audioInit();openTTDialog(false);};
$('ttBack').onclick=()=>{$('ttDlg').hidden=true;if(ttFromPause)$('pause').hidden=false;else $('menu').hidden=false;};
$('ttName').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')$('ttGo').click();});
$('ttGo').onclick=()=>{const r=checkName($('ttName').value);
  if(!r.ok){$('ttName').classList.add('bad');$('ttNameMsg').classList.add('bad');
    $('ttNameMsg').textContent='본인의 실명을 입력하세요: 한국어 2–5자(예: 홍길동) 또는 영어 이름과 성(예: Gildong Hong). 숫자·기호·별명은 안 됩니다.';return;}
  ttName=r.name;try{localStorage.setItem('hrc-name',ttName);}catch(e){}
  $('ttDlg').hidden=true;document.activeElement.blur();
  $('menu').hidden=true;$('hud').hidden=false;if(!ttFromPause)$('hud').className='lite';setupSession('tt');};

/* ---- lobby: grand prix / laps / difficulty / team, all picked with buttons ---- */
const AI_LEVELS=[['Easy',0.975],['Medium',1.02],['Hard',1.06],['Simulation',1.10]];
const LAP_CHOICES=[3,5,10,20];
let optLaps=5,optAI=1.02,optTeam=3;
function loadOpts(){try{const o=JSON.parse(localStorage.getItem('hrc-opts')||'{}');
  if(o.laps)optLaps=+o.laps;if(o.ai)optAI=+o.ai;if(o.team!=null)optTeam=+o.team;if(o.tod)optTod=o.tod;}catch(e){}}
let optTod={}; // time of day per circuit (read by config.js at load, so a change reloads the page)
function saveOpts(){try{localStorage.setItem('hrc-opts',JSON.stringify({gp:TRACK_ID,laps:optLaps,ai:optAI,team:optTeam,tod:optTod}));}catch(e){}}
const TOD_LABEL={dusk:['DUSK','Blue hour'],night:['NIGHT','Floodlit'],day:['DAY','Afternoon']};
function chip(label,sub,on,fn){const b=document.createElement('button');b.className='chip'+(on?' on':'');
  b.innerHTML=label+(sub?'<small>'+sub+'</small>':'');b.onclick=fn;return b;}
/* ---- lobby circuit map: the sampled centre line drawn the way a TV circuit map is — the lap split
   into its three timed sectors, the DRS activation zones on top, and the detection points marked ---- */
// `hi` (0–2): the intro's sector card — that sector drawn bright, the rest dimmed
function drawTrackMap(cv=$('trkMap'),hi=-1){
  if(!cv)return;const g=cv.getContext('2d'),W=cv.width,H=cv.height,pad=34;
  g.clearRect(0,0,W,H);
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(let i=0;i<N;i++){x0=Math.min(x0,X[i]);x1=Math.max(x1,X[i]);z0=Math.min(z0,Z[i]);z1=Math.max(z1,Z[i]);}
  const sc=Math.min((W-2*pad)/(x1-x0),(H-2*pad)/(z1-z0));
  const ox=pad+((W-2*pad)-(x1-x0)*sc)/2,oz=pad+((H-2*pad)-(z1-z0)*sc)/2;
  const PX=i=>(X[i]-x0)*sc+ox,PZ=i=>(Z[i]-z0)*sc+oz;
  g.lineJoin=g.lineCap='round';
  const run=(a,b,col,w)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();
    for(let k=a;k<=b;k++){const i=((k%N)+N)%N;k===a?g.moveTo(PX(i),PZ(i)):g.lineTo(PX(i),PZ(i));}g.stroke();};
  const S=[0,Math.round(SEC[0]/DS),Math.round(SEC[1]/DS),N];
  const SCOL=['#8e9ab5','#5d6b8c','#8e9ab5'];
  g.strokeStyle='#05070d';g.lineWidth=13;g.beginPath();
  for(let k=0;k<=N;k++){const i=k%N;k?g.lineTo(PX(i),PZ(i)):g.moveTo(PX(i),PZ(i));}g.stroke();
  for(let k=0;k<3;k++)run(S[k],S[k+1],hi<0?SCOL[k]:k===hi?'#ffffff':'#2c3449',hi===k?11:9);
  for(const z of DRSZ){let a=Math.round(z.a/DS),b=Math.round(z.b/DS);if(b<a)b+=N;run(a,b,'#1be26b',hi<0||secOf((a%N)*DS)===hi?9:5);}
  // sector boundary lines across the circuit, then the sector number beside the middle of each sector
  const tick=(i,col,w,len)=>{const nx=-TZ[i],nz=TX[i],l=len*sc;g.strokeStyle=col;g.lineWidth=w;
    g.beginPath();g.moveTo(PX(i)+nx*l,PZ(i)+nz*l);g.lineTo(PX(i)-nx*l,PZ(i)-nz*l);g.stroke();};
  tick(S[1]%N,'#c9d3ea',3,17);tick(S[2]%N,'#c9d3ea',3,17);
  g.font='700 14px Titillium Web,sans-serif';g.textAlign='center';g.textBaseline='middle';
  for(let k=0;k<3;k++){const i=Math.round((S[k]+S[k+1])/2)%N,nx=-TZ[i],nz=TX[i];
    const lx=PX(i)+nx*34,lz=PZ(i)+nz*34;
    g.fillStyle='#0b1020';g.beginPath();g.arc(lx,lz,12,0,7);g.fill();
    g.strokeStyle='#c9d3ea';g.lineWidth=1.5;g.stroke();
    g.fillStyle='#c9d3ea';g.fillText('S'+(k+1),lx,lz+1);}
  // DRS detection points
  for(const z of DRSZ){const i=Math.round(z.det/DS)%N;
    g.fillStyle='#ffb000';g.beginPath();g.arc(PX(i),PZ(i),5.5,0,7);g.fill();
    g.strokeStyle='#0b1020';g.lineWidth=2;g.stroke();}
  // start / finish
  {const i=0,nx=-TZ[i],nz=TX[i],l=22*sc;g.strokeStyle='#fff';g.lineWidth=5;
   g.beginPath();g.moveTo(PX(i)+nx*l,PZ(i)+nz*l);g.lineTo(PX(i)-nx*l,PZ(i)-nz*l);g.stroke();}
}
/* ================= CIRCUIT INTRO =================
   A ~50 s fly-over when a session starts (and from the lobby): which city and region the circuit is in, the lap
   at a glance, one chase shot per sector from above the racing line, then the pit lane and grid. The camera paths
   come from the track model, so every circuit gets one; the words come from INTROS in tracks.js. */
const INTRO=INTROS[TRACK_ID];let intro=null;const FOG0=[scene.fog.near,scene.fog.far];
const SH=[{d:7.5,k:'place'},{d:9,k:'lap'},{d:10,k:'sec',n:0},{d:10,k:'sec',n:1},{d:10,k:'sec',n:2},{d:6.5,k:'pit'}];
const INTRO_T=SH.reduce((a,s)=>a+s.d,0);
const sAt=(s,arr)=>{const f=(((s%L)+L)%L)/DS,i=Math.floor(f)%N,j=(i+1)%N,u=f-Math.floor(f);return arr[i]+(arr[j]-arr[i])*u;};
const easeIO=u=>u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
function introFacts(){let vmax=0,vmin=1e9;for(let i=0;i<N;i++){vmax=Math.max(vmax,VP[i]);vmin=Math.min(vmin,VP[i]);}
  return [(L/1000).toFixed(3)+' km',TR.fullLaps+' LAPS · '+(TR.fullLaps*L/1000).toFixed(1)+' km',/anti-clockwise/.test(TR.sub)?'ANTI-CLOCKWISE':'CLOCKWISE',
    DRSZ.length+' DRS ZONES','TOP ~'+Math.round(vmax*3.6/5)*5+' km/h','SLOWEST CORNER ~'+Math.round(vmin*3.6/5)*5+' km/h'];}
// The aerial lap shot draws the three sectors onto the circuit as glowing 3D ribbons hovering over the road (broadcast
// sector colours: red, blue, yellow), each with a floating tag and a gate post at its end.
let introLines=null;
function buildIntroLines(){const g=new THREE.Group(),cols=[0xff2d48,0x2a9dff,0xffd200],parts=[];
  const bounds=[0,SEC[0],SEC[1],L];
  for(let k=0;k<3;k++){const i0=Math.round(bounds[k]/DS),n=Math.round((bounds[k+1]-bounds[k])/DS)+1,hw=5;
    const geo=strip(i0,n,()=>-hw,()=>hw,4,4,null,20,false,true),m=new THREE.MeshBasicMaterial({color:cols[k],transparent:true,opacity:.92,toneMapped:false,side:THREE.DoubleSide,depthWrite:false,depthTest:false,fog:false});
    const me=new THREE.Mesh(geo,m);me.renderOrder=50;g.add(me);
    // the tag over the middle of the sector
    const cv=document.createElement('canvas');cv.width=256;cv.height=128;const x=cv.getContext('2d');
    x.fillStyle='rgba(8,11,18,.82)';x.beginPath();x.roundRect(8,8,240,112,22);x.fill();x.fillStyle='#'+cols[k].toString(16).padStart(6,'0');x.fillRect(8,8,16,112);
    x.fillStyle='#fff';x.font='900 64px Titillium Web, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('S'+(k+1),136,66);
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,toneMapped:false,fog:false}));const im=Math.round((bounds[k]+bounds[k+1])/2/DS)%N;
    sp.position.set(X[im],ORB*0.09,Z[im]);sp.scale.set(ORB*0.16,ORB*0.08,1);sp.renderOrder=60;g.add(sp);
    // the gate at the end of the sector: a tall post of light
    const ie=Math.round(bounds[k+1]/DS)%N,post=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,ORB*0.07,10),m);post.position.set(X[ie],ORB*0.035,Z[ie]);g.add(post);
    parts.push({geo,count:geo.index.count,sp,post});}
  g.visible=false;scene.add(g);return {g,parts};}
function showIntroLines(u){ // u: 0…1 through the lap shot; the sectors draw in one after another
  if(!introLines)introLines=buildIntroLines();const {g,parts}=introLines;g.visible=u!=null;if(u==null)return;
  parts.forEach((p,k)=>{const f=clamp((u*1.6-k*0.3)/0.45,0,1),c=Math.floor(p.count*easeIO(f)/6)*6;p.geo.setDrawRange(0,c);p.sp.visible=f>0.6;p.post.visible=f>=1;});}
function playIntro(done){if(!INTRO){done();return;}
  intro={t:0,t0:performance.now(),done,cur:-1};
  // the film is shot from hundreds of metres up: thin the haze so the city is not washed out (restored after)
  scene.fog.near=FOG0[0]*2.5;scene.fog.far=FOG0[1]*2.5;$('menu').hidden=true;$('intro').hidden=false;
  $('iPlaceEn').textContent=INTRO.placeEn;$('iPlace').textContent=INTRO.place;}
function endIntro(){if(!intro)return;const d=intro.done;intro=null;showIntroLines(null);scene.fog.near=FOG0[0];scene.fog.far=FOG0[1];$('intro').hidden=true;$('iCap').classList.add('out');d();}
function introCard(sh,first){const c=$('iCap');c.classList.add('out');
  const m=$('iMap');drawTrackMap(m,sh.k==='sec'?sh.n:-1);m.classList.toggle('out',sh.k==='place');
  setTimeout(()=>{if(!intro)return;let eye,title,text,facts=[];
    if(sh.k==='place'){eye=INTRO.placeEn;title=TR.title;text=INTRO.about;}
    else if(sh.k==='lap'){eye='CIRCUIT · '+TR.label;title='Lap <em>'+(L/1000).toFixed(3)+' km</em>';text=INTRO.layout;facts=introFacts();}
    else if(sh.k==='sec'){const a=sh.n?SEC[sh.n-1]:0,b=sh.n<2?SEC[sh.n]:L;
      eye='SECTOR '+(sh.n+1)+' · '+(a/1000).toFixed(2)+' – '+(b/1000).toFixed(2)+' km';[title,text]=INTRO.sectors[sh.n];}
    else{eye='PIT LANE · GRID';title=INTRO.pitTitle;text=INTRO.pit;}
    $('iEye').textContent=eye;$('iTitle').innerHTML=title;$('iText').textContent=text;
    $('iFacts').innerHTML=facts.map(f=>'<span>'+f+'</span>').join('');c.classList.remove('out');},first?60:450);}
function introFrame(){intro.t=(performance.now()-intro.t0)/1000; // wall clock: a slow frame rate must not slow the film down
  let t=intro.t,k=0;while(k<SH.length&&t>=SH[k].d){t-=SH[k].d;k++;}
  if(k>=SH.length){endIntro();return;}
  const sh=SH[k],u=t/sh.d;if(k!==intro.cur){introCard(sh,intro.cur<0);intro.cur=k;}
  $('iProg').style.width=(intro.t/INTRO_T*100).toFixed(2)+'%';
  let px,py,pz,tx,ty,tz;
  if(sh.k==='place'){ // the city: a slow descending orbit round the whole circuit
    const a=0.7+u*0.9,r=ORB*(1.3-0.3*u);px=CX+Math.cos(a)*r;pz=CZ+Math.sin(a)*r;py=ORB*(0.62-0.2*u);tx=CX;ty=0;tz=CZ;}
  else if(sh.k==='lap'){ // the lap from high above, drifting round
    const a=1.6+u*0.3;px=CX+Math.cos(a)*ORB*0.4;pz=CZ+Math.sin(a)*ORB*0.4;py=ORB*(1.75-0.15*u);tx=CX;ty=0;tz=CZ;}
  else if(sh.k==='sec'){ // chase the lap through the sector from above and behind, looking well down the road
    // The camera rides a heavily smoothed copy of the circuit (±120 m average) instead of the road itself, so it
    // sweeps round corners instead of whipping; a long sector (Songdo's are ~2.5 km in 10 s) is filmed from higher
    // up and further back so the ground does not rush past.
    const a=sh.n?SEC[sh.n-1]:0,b=sh.n<2?SEC[sh.n]:L,s=a+(b-a)*easeIO(u),k=clamp((b-a)/1600,1,1.8);
    const [cx,cz]=smoothAt(s-60*k),[lx,lz]=smoothAt(s+170*k);px=cx;pz=cz;py=72*k;tx=lx;ty=0;tz=lz;}
  else{ // the pit lane and grid: a slow crane move above the far side of the straight, looking across the grid to the garages
    const gi=idxSp((BOX_S[0]+BOX_S[BOX_S.length-1])/2),off=-46,along=-60+110*u;
    px=X[gi]-TZ[gi]*off+TX[gi]*along;pz=Z[gi]+TX[gi]*off+TZ[gi]*along;py=46-8*u;tx=X[gi]-TZ[gi]*PIT_OFF*1.1+TX[gi]*along*0.6;ty=0;tz=Z[gi]+TX[gi]*PIT_OFF*1.1+TZ[gi]*along*0.6;}
  showIntroLines(sh.k==='lap'?u:null);
  // and on top of that a short time lag (~0.3 s) within a shot; cuts between shots stay cuts
  const now=performance.now(),dt=Math.min(0.1,(now-(intro.lastF||now))/1000);intro.lastF=now;
  if(intro.camK!==k||!intro.cp){intro.camK=k;intro.cp=[px,py,pz];intro.ct=[tx,ty,tz];}
  else{const f=1-Math.exp(-dt/0.3),P=intro.cp,T=intro.ct;
    P[0]+=(px-P[0])*f;P[1]+=(py-P[1])*f;P[2]+=(pz-P[2])*f;T[0]+=(tx-T[0])*f;T[1]+=(ty-T[1])*f;T[2]+=(tz-T[2])*f;[px,py,pz]=P;[tx,ty,tz]=T;}
  camera.position.set(px,py,pz);camera.lookAt(tx,ty,tz);camera.fov=50;camera.far=FAR_MENU;camera.updateProjectionMatrix();aimSun(tx,tz);}
// the circuit smoothed with a ±120 m moving average (for the intro's sector camera)
let SMX=null,SMZ=null;
function smoothAt(s){if(!SMX){SMX=new Float32Array(N);SMZ=new Float32Array(N);const w=Math.round(120/DS);
    for(let i=0;i<N;i++){let x=0,z=0;for(let j=-w;j<=w;j++){const q=(i+j+N)%N;x+=X[q];z+=Z[q];}SMX[i]=x/(2*w+1);SMZ[i]=z/(2*w+1);}}
  return [sAt(s,SMX),sAt(s,SMZ)];}
$('iSkip').onclick=()=>endIntro();
addEventListener('keydown',e=>{if(intro&&['Escape','Enter','Space'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();endIntro();}},true);
function buildLobby(){
  const gp=$('gpSel');gp.innerHTML='';
  for(const id in TRACKS){const T=TRACKS[id];
    gp.appendChild(chip(T.label,(T.len/1000).toFixed(3)+' km',id===TRACK_ID,()=>{
      if(id===TRACK_ID)return;saveOpts();location.hash=id;location.reload();}));}
  const lp=$('lapSel');lp.innerHTML='';
  for(const n of LAP_CHOICES.concat([TR.fullLaps]))
    lp.appendChild(chip(n+' LAPS',n===TR.fullLaps?'FULL':((n*L/1000).toFixed(0)+' km'),n===optLaps,()=>{optLaps=n;saveOpts();buildLobby();}));
  const td=$('todSel');td.innerHTML='';$('todSec').hidden=TIMES.length<2;
  for(const k of TIMES)td.appendChild(chip(TOD_LABEL[k][0],TOD_LABEL[k][1],k===TOD,()=>{if(k===TOD)return;optTod[TRACK_ID]=k;saveOpts();location.reload();}));
  const ai=$('aiSel');ai.innerHTML='';
  for(const [nm,v] of AI_LEVELS)ai.appendChild(chip(nm,'',Math.abs(v-optAI)<1e-9,()=>{optAI=v;saveOpts();buildLobby();}));
  const ts=$('teamSel');ts.innerHTML='';
  TEAMS.forEach((t,i)=>{const b=document.createElement('button');b.className='team'+(i===optTeam?' on':'');
    b.innerHTML='<div class="liv" style="background:'+hex(t.c)+'"><i style="background:'+hex(t.a)+'"></i><b></b></div>'+t.name;
    b.onclick=()=>{optTeam=i;saveOpts();buildLobby();};ts.appendChild(b);});
  const qs=$('qSel');qs.innerHTML='';
  for(const m of MODES)qs.appendChild(chip(m==='auto'?'AUTO':PRESETS[m].label,m==='auto'?'→ '+PRESETS[detectPreset(renderer.getContext())].label:'',m===qState.mode,()=>{
    setQualityMode(m);if(Q.texRes!==BUILT_TEX){location.reload();return;}buildLobby();}));
  $('qInfo').textContent='· '+(qState.mode==='auto'?'adapts resolution to keep 60 fps':'fixed preset')+' · Q in race';
  drawTrackMap();
}
$('trkSub').textContent=TR.label+' · '+(TR.len/1000).toFixed(3)+' km';
loadOpts();if(!LAP_CHOICES.includes(optLaps)&&optLaps!==TR.fullLaps)optLaps=5;buildLobby();

// every session opens with the circuit intro (skippable); the lobby can replay it on its own
$('startBtn').onclick=()=>{document.activeElement.blur();audioInit();
  playIntro(()=>{$('menu').hidden=true;$('hud').hidden=false;$('hud').className='lite';setupSession();});};
$('introBtn').onclick=()=>{document.activeElement.blur();playIntro(()=>{$('menu').hidden=false;});};
$('qresBtn').onclick=()=>{$('qres').hidden=true;openBox('race');};

/* ================= BOOT (async: the page stays responsive and shows progress while the world is built) ================= */
const loadEl=$('loading'),loadBar=$('loadBar'),loadTxt=$('loadTxt');
const stage=(t,p)=>{loadTxt.textContent=t;loadBar.style.width=Math.round(p*100)+'%';return new Promise(r=>{requestAnimationFrame(()=>setTimeout(r,0));setTimeout(r,60);});};
let last=performance.now(),acc=0,hudT=0,shadowTick=0;const H=1/120;
function frame(now){const ms=now-last,dt=Math.min(0.05,ms/1000);last=now;let n=0;
  if(scaler.tick(ms)){perf.scaler(scaler.scale,'tick');resizeAll();}
  if(intro)introFrame();else if(phase==='menu'){menuCamera(dt);}
  else if(replay){replayFrame(dt);if(!replay)updateVisuals(dt);drawMinimap(dt);}
  else{const f0=perf.on?performance.now():0;
    if(!paused){acc+=dt;while(acc>=H&&n<6){step(H);acc-=H;n++;if((++recStep&1)===0)recFrame();}if(n>=6)acc=0;}
    const f1=perf.on?performance.now():0;
    updateVisuals(dt);updateHud();drawMinimap(dt);hudT-=dt;if(hudT<=0){hudT=0.2;updateInfo();}
    if(perf.on){perf.acc('frame:steps',f1-f0);perf.acc('frame:visuals+hud',performance.now()-f1);}}
  if(!ctxLost&&fitViewport()){
    if(perf.on)renderer.info.reset();
    const r0=perf.on?performance.now():0;
    if((shadowTick++%Q.shadowEvery)===0)renderer.shadowMap.needsUpdate=true;
    if(stars){stars.position.copy(camera.position);stars.updateMatrix();}
    cullByDistance();
    gpuTimer.begin();
    if(usePost)composer.render();else{renderer.setRenderTarget(null);renderer.render(scene,camera);}
    if(phase!=='menu'&&!replay){renderMirror();updateProximity();}
    gpuTimer.end();const gms=gpuTimer.poll();scaler.gpu(gms);
    if(perf.on){perf.acc('frame:render',performance.now()-r0);perf.gpu(gms);perf.frame(ms,n,renderer.info.render.calls,renderer.info.render.triangles);}}
  requestAnimationFrame(frame);}
const gpuTimer=new GpuTimer(renderer.getContext());
// street clutter tiles past their draw distance are hidden (all shown in the lobby, whose camera orbits far away)
function cullByDistance(){const cx=camera.position.x,cz=camera.position.z,all=phase==='menu';
  for(const d of distTiles){const dx=d.x-cx,dz=d.z-cz;d.t.visible=all||dx*dx+dz*dz<d.r*d.r;}}
async function boot(){
  await stage('Building circuit…',.05);
  await buildWorld();
  await stage('Minimap…',.9);
  buildMinimap();
  // world geometry never moves: skip per-frame matrix recomputation for all of it (cars are added later and stay dynamic)
  scene.traverse(o=>{if(o.isMesh||o.isInstancedMesh||o.isPoints){o.matrixAutoUpdate=false;o.updateMatrix();}});
  scaler.enabled=scalerAllowed();
  applyQuality();
  await stage('Compiling shaders…',.95);
  {const w=carMesh(0xd90008,0xf6f6f6,7);w.root.position.set(X[0],0,Z[0]);w.far.visible=true;window.__warm=w;} // one throw-away car so its programs are compiled now, not on the first race frame
  // the first pit crew is built now too (it used to be built, and its shaders compiled, in the frame a car first stopped in its box)
  {const g=makeCrew();g.position.set(X[0],0,Z[0]);g.visible=true;crews.push(g);}
  try{await renderer.compileAsync(scene,camera);}catch(e){}
  {const w=window.__warm;if(w){w.far.visible=false;scene.remove(w.root);delete window.__warm;}crews[0].visible=false;}
  loadEl.classList.add('done');setTimeout(()=>loadEl.remove(),600);
  fitViewport();perf.boot(bootInfo());
  perf.mark('lobby');
  requestAnimationFrame(frame);
}
function bootInfo(){const gl=renderer.getContext();let gpu='';
  try{const e=gl.getExtension('WEBGL_debug_renderer_info');gpu=String(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));}catch(e){}
  return {gpu,detectPreset:detectPreset(gl),mode:qState.mode,preset:qName,devicePixelRatio:window.devicePixelRatio||1,pixelRatio:renderer.getPixelRatio(),
    canvas:[renderer.domElement.width,renderer.domElement.height],gpuTimer:gpuTimer.ok,scaler:scaler.enabled,track:TRACK_ID,tod:TOD};}
// render-target memory, estimated from the targets' actual sizes: colour (resolve texture + multisampled renderbuffer)
// and depth/stencil, per owner. Only targets that were actually drawn into count: three allocates GPU storage on first use,
// so a disabled pass's targets (SMAA on MEDIUM, the composer on LOW) cost nothing.
function rtBytes(rt){if(!rt||!rt.isWebGLRenderTarget||renderer.properties.get(rt).__webglFramebuffer===undefined)return 0;const px=rt.width*rt.height,s=rt.samples||0,t=rt.texture.type;
  const bpp=t===THREE.HalfFloatType?8:t===THREE.FloatType?16:4;
  return px*bpp*(s>0?1+s:1)+(rt.depthBuffer?px*4*(s>0?1+s:1):0);}
function ownRTs(o){let b=0;for(const v of Object.values(o||{})){if(v&&v.isWebGLRenderTarget)b+=rtBytes(v);else if(Array.isArray(v))for(const x of v)if(x&&x.isWebGLRenderTarget)b+=rtBytes(x);}return b;}
function rtEstimate(){const pr=renderer.getPixelRatio(),c=renderer.domElement;
  return {canvas:c.width*c.height*(4+4+4),composer:rtBytes(composer.renderTarget1)+rtBytes(composer.renderTarget2),
    bloom:ownRTs(bloom),smaa:ownRTs(smaa),fxaa:ownRTs(fxaa),gtao:gtao?ownRTs(gtao):0,shadow:rtBytes(sun.shadow.map),mirror:rtBytes(mirrorRT),
    get total(){return this.canvas+this.composer+this.bloom+this.smaa+this.fxaa+this.gtao+this.shadow+this.mirror;},pixelRatio:pr};}
perf.attach({renderer,rtBytes:()=>{const e=rtEstimate(),o={};for(const k of ['canvas','composer','bloom','smaa','fxaa','gtao','shadow','mirror','total'])o[k]=e[k];return o;},phase:()=>phase});
// measurement helpers (tools/perf-scenario.md): straight into a race from the lobby, and the determinism hash
function quickRace(){if(intro)endIntro();$('menu').hidden=true;$('hud').hidden=false;$('hud').className='lite';
  setupSession();finishQuali(null);$('qres').hidden=true;$('box').hidden=true;startRace();perf.mark('race start');}
function detHash(seed=1,n=6000){
  for(const c of cars)scene.remove(c.mesh.root);
  reseed(seed);optLaps=5;optAI=1.02;optTeam=3;lastHist=0;lastContact=-9;
  setupSession();player.auto=true;finishQuali(null);$('qres').hidden=true;startRace();
  for(let k=0;k<n;k++)step(H);
  const f=new Float64Array(1),u=new Uint32Array(f.buffer);let h=2166136261;
  for(const c of cars)for(const v of [c.x,c.z,c.v]){f[0]=v;h=Math.imul(h^u[0],16777619);h=Math.imul(h^u[1],16777619);}
  reseed(null);
  return {hash:(h>>>0).toString(16).padStart(8,'0'),seed,steps:n,simTime:+simTime.toFixed(4),laps:cars.map(c=>c.lapCount),best:cars.map(c=>c.bestLap&&+c.bestLap.toFixed(3))};}
boot();
window.hrc={updateHud,updateInfo,restartRace,restartQuali,restartTT,setupSession,incident,get tt(){return tt;},get session(){return session;},quickRace,detHash,deploySC,deployVSC,hazard,retire,get sc(){return sc;},get vsc(){return vsc;},get msFlag(){return msFlag;},reseed,rtEstimate,get player(){return player;},get simTime(){return simTime;},gpuTimer,cullByDistance,finishQuali,startRace,leaveBox,openBox,composer,step,updateVisuals,renderMirror,applyQuality,H,get cars(){return cars;},get phase(){return phase;},setQualityMode,renderer,scaler,get Q(){return Q;},get qName(){return qName;},THREE,scene};
