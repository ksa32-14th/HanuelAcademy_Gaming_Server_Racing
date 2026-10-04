// HRC — Haneul Racing Championship: game runtime (physics, AI, scene, HUD, audio).
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {$,clamp,wrapA,smooth,rand,rnd,reseed,hex,fmt,fmtRace} from './util.js?v=20261006b';
import {perf} from './perf.js?v=20261006b';
import {TRACKS,INTROS} from './data/tracks.js?v=20261006b';
import {TRACK_ID,TR,TOD,TIMES,TRACK_LEN,W,HW,GRID_D,KERB_W,CAR_SX,CAR_SY,CAR_SZ,WHEEL_S,TL_EDGE,G,RHO,MASS,POWER,CDA,CLA,MU,CRR,WB,VMAX,BRK,gripV,PITWALL,PIT_HW,PIT_OFF,PIT_LIMIT,BOX_D,FAST_D,COMP,POINTS,DRS_GAP,DRS_FROM_LAP,GEARS,FUEL_PER_LAP,TEAMS,DRIVERS} from './config.js?v=20261006b';
import {PIT_A,PIT_B,PIT_L,PIT_C,PIT_D,curve,SC,N,L,DS,rw,X,Z,TX,TZ,ANG,K,idxOf,spOf,idxSp,spI,pitOffSp,HWa,HWmin,WL,WR,KB,DRSZ,SEC,BOX_S,BOX_GAP,drsZoneOf,RL,VP,rawV,sp0} from './track.js?v=20261006b';
import {createTextures,canvasTex,winTex} from './textures.js?v=20261006b';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {PRESETS,ORDER,MODES,loadMode,saveMode,detectPreset,ResolutionScaler,GpuTimer,pixelRatioFor} from './quality.js?v=20261006b';
// OpenStreetMap scenery: each OSM circuit has its own data module (osm-songdo.js, osm-busan.js), loaded only when chosen
const OSM=TR.osm?Object.values(await (TRACK_ID==='busan'?import('./data/osm-busan.js?v=20261006b'):import('./data/osm-songdo.js?v=20261006b')))[0]:null;
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
$('gl').addEventListener('webglcontextrestored',()=>{ctxLost=false;gpuTimer.reset();resizeAll();renderer.shadowMap.needsUpdate=true;
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
  scaler.enabled=!NOSCALER;scaler.reset();saveMode(mode);applyQuality();}

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
function batchAdd(g,m,shadow){if(g.index)g=g.toNonIndexed();for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);
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
  // the city street's own markings, left on the road as at any street circuit and worn by the race traffic: dashed white
  // lane lines (8 m paint, 12 m gap) splitting the carriageway into six lanes, and the yellow double centre line
  {const dash=canvasTex(64,4,(x)=>{x.clearRect(0,0,64,4);x.fillStyle='#fff';x.fillRect(0,0,26,4);},true);
   const mDash=mat({map:dash,color:0xe8e6dc,transparent:true,opacity:.5,roughness:.6,depthWrite:false,...po(-3)});
   const mYel=mat({color:0xd9b440,transparent:true,opacity:.3,roughness:.6,depthWrite:false,...po(-3)});
   for(const f of [-2/3,-1/3,1/3,2/3])strip(0,N+1,i=>hwI(i)*f-0.07,i=>hwI(i)*f+0.07,0.022,0.022,mDash,20,false);
   for(const o of [-0.22,0.1])strip(0,N+1,()=>o,()=>o+0.12,0.022,0.022,mYel,20,false);}
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
     let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
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

/* ================= CAR MODEL (Hypercar-style body, F1 dimensions) ================= */
function numTex(n,acc){return canvasTex(256,64,(x)=>{x.font='900 54px Titillium Web, sans-serif';x.fillStyle=acc;x.textAlign='center';x.textBaseline='middle';x.fillText(String(n),128,34);});}
// A car used to be ~65 separate meshes = ~65 draw calls, x20 cars, plus the same again for the shadow pass and the mirror.
// On ANGLE/D3D11 draw calls are the expensive part, so every static part of a group is baked into one mesh per material.
// `recolor` (optional Map: material → shared vertex-coloured material): parts whose materials differ only in colour
// (paint, accent, carbon; tyre, rim) have that colour baked into the vertices and are drawn together with ONE material
// that every car shares — a near car went from 20 draw calls (+8 in the shadow pass) to 12 (+6).
function bakeGroup(par,recolor){
  const buckets=new Map();
  for(const m of par.children.filter(c=>c.isMesh)){
    m.updateMatrix();let geo=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();geo.applyMatrix4(m.matrix);
    for(const k of Object.keys(geo.attributes))if(k!=='position'&&k!=='normal'&&k!=='uv')geo.deleteAttribute(k);
    if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    const target=recolor&&recolor.get(m.material)||m.material;
    if(target!==m.material){const n=geo.attributes.position.count,col=new Float32Array(n*3),c=m.material.color;
      for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}geo.setAttribute('color',new THREE.BufferAttribute(col,3));}
    let b=buckets.get(target);if(!b){b={geos:[],shadow:false};buckets.set(target,b);}
    b.geos.push(geo);if(m.castShadow)b.shadow=true;par.remove(m);m.geometry.dispose();}
  for(const [material,b] of buckets){const me=new THREE.Mesh(mergeGeometries(b.geos),material);me.castShadow=b.shadow;par.add(me);}}
// shared by every car (colours live in the vertices)
const carPaint=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.18,roughness:.48,envMap:envTex,envMapIntensity:.25});
const carWheel=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.35,roughness:.6,envMap:envTex,envMapIntensity:.35});
// Distant cars (> FAR_D from the camera) swap to ONE pre-merged, vertex-coloured mesh: a car costs 1 draw call instead of ~12.
// (the far mesh now also casts the car's shadow, so the switch can happen much closer without a car losing its shadow)
const FAR_D=60,farMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.15});
function makeFarLOD(car,root,g){
  root.updateMatrixWorld(true);const geos=[];
  root.traverse(o=>{if(!o.isMesh||o.material.map)return;
    const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);
    const vc=o.material.vertexColors&&geo.attributes.color?geo.attributes.color.array:null;
    for(const k of Object.keys(geo.attributes))if(k!=='position'&&k!=='normal')geo.deleteAttribute(k);
    const n=geo.attributes.position.count,col=new Float32Array(n*3),c=o.material.color||{r:1,g:1,b:1};
    for(let i=0;i<n;i++){col[i*3]=c.r*(vc?vc[i*3]:1);col[i*3+1]=c.g*(vc?vc[i*3+1]:1);col[i*3+2]=c.b*(vc?vc[i*3+2]:1);}
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));geos.push(geo);});
  const far=new THREE.Mesh(mergeGeometries(geos),farMat);far.visible=false;far.castShadow=true;root.add(far);
  car.far=far;car.isFar=false;car.nearObjs=[g,...car.pivs];}
function setFar(car,far){if(car.isFar===far)return;car.isFar=far;car.far.visible=far;for(const o of car.nearObjs)o.visible=!far;}
function carMesh(col,acc,num){
  const root=new THREE.Group(),g=new THREE.Group();root.add(g);g.scale.set(CAR_SX,CAR_SY,CAR_SZ);const car={root,body:g};
  // matte race finish: the paint used to act like chrome and threw hard highlights around at speed
  const env={envMap:envTex,envMapIntensity:.25};
  const mB=mat({color:col,metalness:.2,roughness:.45,...env}),mA=mat({color:acc,metalness:.15,roughness:.5,...env}),mC=mat({color:0x121316,roughness:.6,metalness:.15,...env});
  const mGl=mat({color:0x0a1120,metalness:.8,roughness:.12,envMap:envTex,envMapIntensity:.45}),mHead=new THREE.MeshBasicMaterial({color:0xe6f3ff}),mTail=new THREE.MeshBasicMaterial({color:0x4a0000});
  const add=(geo,m,x,y,z,par=g,sh=true)=>{const me=new THREE.Mesh(geo,m);me.position.set(x,y,z);me.castShadow=sh;par.add(me);return me;};
  const ext=(s,d)=>new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:2,curveSegments:12}).translate(0,0,-d/2);
  add(new THREE.BoxGeometry(5.3,.06,1.86),mC,0,.08,0);
  add(new THREE.BoxGeometry(.55,.035,1.9),mC,2.55,.07,0);
  const tub=new THREE.Shape();tub.moveTo(2.8,.11);tub.lineTo(2.8,.22);tub.quadraticCurveTo(1.9,.40,1.05,.55);tub.lineTo(-.9,.66);tub.lineTo(-2.2,.64);tub.quadraticCurveTo(-2.7,.6,-2.78,.46);tub.lineTo(-2.78,.11);tub.lineTo(2.8,.11);
  add(ext(tub,1.0),mB,0,0,0);
  const ff=new THREE.Shape();ff.moveTo(2.78,.14);ff.lineTo(2.27,.14);ff.lineTo(2.27,.36);ff.absarc(1.8,.36,.47,0,Math.PI,false);ff.lineTo(1.33,.14);ff.lineTo(.95,.14);ff.lineTo(.95,.52);ff.quadraticCurveTo(1.25,.86,1.8,.88);ff.quadraticCurveTo(2.45,.86,2.78,.34);ff.lineTo(2.78,.14);
  const ffg=ext(ff,.42);for(const s of [-1,1])add(ffg,mB,0,0,s*.77);
  const rf=new THREE.Shape();rf.moveTo(-.55,.14);rf.lineTo(-1.33,.14);rf.lineTo(-1.33,.36);rf.absarc(-1.8,.36,.47,0,Math.PI,false);rf.lineTo(-2.27,.14);rf.lineTo(-2.8,.14);rf.lineTo(-2.8,.6);rf.lineTo(-2.35,.9);rf.quadraticCurveTo(-1.5,.94,-.95,.8);rf.quadraticCurveTo(-.6,.62,-.55,.14);
  const rfg=ext(rf,.5);for(const s of [-1,1])add(rfg,mB,0,0,s*.74);
  for(const s of [-1,1]){add(new THREE.BoxGeometry(1.5,.42,.5),mB,.2,.35,s*.72);add(new THREE.BoxGeometry(1.5,.03,.5),mA,.2,.575,s*.72);add(new THREE.BoxGeometry(.1,.06,.18),mB,.95,.64,s*.6);}
  const can=add(new THREE.SphereGeometry(1,24,14),mB,.3,.6,0);can.scale.set(1.3,.34,.5);
  const scr=add(new THREE.SphereGeometry(1.02,24,12,Math.PI-.95,1.9,.18,1.05),mGl,.3,.6,0,g,false);scr.scale.set(1.3,.34,.5);
  const fin=new THREE.Shape();fin.moveTo(-.4,.85);fin.lineTo(-2.5,.62);fin.lineTo(-2.5,.94);fin.lineTo(-.9,.93);fin.quadraticCurveTo(-.55,.92,-.4,.85);
  add(new THREE.ExtrudeGeometry(fin,{depth:.03,bevelEnabled:false}).translate(0,0,-.015),mA,0,0,0);
  const nt=numTex(num,hex(col));const nm=new THREE.MeshBasicMaterial({map:nt,transparent:true});
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(.9,.22),nm);p.position.set(-1.75,.82,s*.018);if(s<0)p.rotation.y=Math.PI;g.add(p);}
  add(new THREE.BoxGeometry(.34,.04,1.92),mA,-2.62,.84,0);
  const flap=new THREE.Group();flap.position.set(-2.46,.9,0);g.add(flap);add(new THREE.BoxGeometry(.24,.03,1.9),mB,-.12,0,0,flap);flap.rotation.z=-.45;car.flap=flap;
  for(const s of [-1,1]){add(new THREE.BoxGeometry(.6,.36,.03),mC,-2.6,.76,s*.96);add(new THREE.BoxGeometry(.3,.26,.04),mC,-2.45,.73,s*.2);
    const hl=add(new THREE.BoxGeometry(.1,.06,.34),mHead,2.64,.47,s*.77,g,false);hl.rotation.z=.5;}
  add(new THREE.BoxGeometry(.3,.22,1.6),mC,-2.72,.2,0);
  add(new THREE.BoxGeometry(.03,.05,1.7),mTail,-2.82,.56,0,g,false);
  const mT=mat({color:0x161616,roughness:.85}),mR=mat({color:0x9aa0aa,metalness:.8,roughness:.3});const mBand=new THREE.MeshBasicMaterial({color:0xffd200});
  car.wheels=[];car.steer=[];car.pivs=[];
  for(const [x,z,w,front] of [[1.8,.8,.305,1],[1.8,-.8,.305,1],[-1.8,.77,.405,0],[-1.8,-.77,.405,0]]){
    const piv=new THREE.Group();piv.position.set(x*CAR_SX,.36*WHEEL_S,z*CAR_SZ);piv.scale.setScalar(WHEEL_S);root.add(piv);const spin=new THREE.Group();piv.add(spin);
    add(new THREE.CylinderGeometry(.36,.36,w,22).rotateX(Math.PI/2),mT,0,0,0,spin,false); // no own shadow: the bodywork over it already casts one (4 fewer shadow draws per car)
    add(new THREE.CylinderGeometry(.23,.23,w+.012,6).rotateX(Math.PI/2),mR,0,0,0,spin,false);
    add(new THREE.TorusGeometry(.3,.014,6,28),mBand,0,0,Math.sign(z)*(w/2+.004),spin,false);
    car.wheels.push(spin);car.pivs.push(piv);if(front)car.steer.push(piv);}
  const paint=new Map([[mB,carPaint],[mA,carPaint],[mC,carPaint]]),wheel=new Map([[mT,carWheel],[mR,carWheel]]);
  for(const w of car.wheels)bakeGroup(w,wheel);bakeGroup(flap,paint);bakeGroup(g,paint);
  for(const m of [mB,mA,mC,mT,mR])m.dispose();
  makeFarLOD(car,root,g);
  car.tail=mTail;car.band=mBand;root.position.y=0.02;scene.add(root);return car;}

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
  c.mesh=carMesh(t.c,t.a,num);c.mesh.band.color.setHex(COMP[comp].hex);return c;}

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

function setupSession(){
  totalLaps=targetLaps=optLaps;wearMult=1;
  const pt=optTeam,diff=optAI;
  const nums=[...Array(98).keys()].map(n=>n+2).sort(()=>rnd()-.5);
  const ai=[];let di=0;
  for(let t=0;t<10;t++)for(let s=0;s<2;s++){if(t===pt&&s===0)continue;const perf=1-t*0.0035+rand(-0.006,0.004);ai.push({team:t,drv:DRIVERS[di++],skill:diff*perf});}
  ai.sort((a,b)=>b.skill-a.skill);
  cars=[];player=makeCar(0,pt,['YOU','You'],true,1,'S',7);player.auto=AUTOPILOT;cars.push(player);
  ai.forEach((a,k)=>cars.push(makeCar(k+1,a.team,a.drv,false,a.skill,'S',nums[k])));
  qTimes=new Map();
  for(const c of cars)if(!c.isPlayer){qTimes.set(c,IDEAL_LAP*QUALI_K/c.skill*(1+rand(-0.003,0.010)));parkInGarage(c);}
  simTime=0;raceStart=null;lightsOn=-1;drsEnabled=true;checkered=false;timeLimitHit=false;fastest=null;
  bestSecAll.fill(null);resultsShown=false;qGrid=null;session='quali';
  $('tower').hidden=true;$('lights').hidden=true;
  openBox('quali');
}

function openBox(mode){
  boxMode=mode;phase='box';paused=false;
  const c=player;placeInBox(c);c.held=true;c.wear=0;c.damage=0;c.tl=0;c.tlOut=false;c.pen=0;c.drsOpen=false;
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
    c.tow=0;c.slip=0;c.v=0;c.delta=0;c.r=0;c.laneOff=0;c.laneOffT=0;c.laneHold=0;c.sep=0;c.held=true;
    c.dnf=false;c.dnfWhy=null;c.maxLap=-1;c.defUntil=null;c.mArm=false;c.mT=0;c.passCar=null;c.scRel=null;
    placeOnGrid(c,slot);c.lapCount=-1;c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;});
  sc=null;scRestart=false;yZones=[];if(scMesh)scMesh.visible=false;
  simTime=0;raceStart=null;gridT0=0.8;lightsOutAt=gridT0+5+rand(0.3,2.6);lightsOn=-1;
  drsEnabled=false;checkered=false;timeLimitHit=false;fastest=null;bestSecAll.fill(null);resultsShown=false;
  camYaw=null;recReset();
  $('tower').hidden=false;buildTower();$('lights').hidden=false;setLights(0);
  msg('FORMATION COMPLETE · LIGHTS OUT WHEN ALL FIVE GO OUT');
}

/* ================= PHYSICS ================= */
function tyreGrip(c){return COMP[c.comp].grip*(1-0.10*Math.min(c.wear,1.3)-0.35*Math.max(0,c.wear-0.75));}
function locate(c){let best=c.idx,bd=1e18;for(let k=-25;k<=25;k++){const i=(c.idx+k+N)%N,dx=c.x-X[i],dz=c.z-Z[i],d=dx*dx+dz*dz;if(d<bd){bd=d;best=i;}}
  c.idx=best;const dx=c.x-X[best],dz=c.z-Z[best];c.s=((best*DS+dx*TX[best]+dz*TZ[best])%L+L)%L;c.d=-dx*TZ[best]+dz*TX[best];}

function physics(c,dt){
  if(c.pitStop>0){c.v=0;c.pitStop-=dt;if(c.pitStop<=0)finishPit(c);return;}
  if(c.held){c.v=0;c.aLong=0;c.aLat=0;return;}
  // reverse (S): only a crawl, only in the pit lane — to back into the box after overshooting it
  if(c.isPlayer&&c.revIn&&c.pitSide&&c.v<0.3&&c.throttle<0.05){const vr=2.2;c.v=0;c.aLong=0;c.aLat=0;c.r=0;
    c.delta+=clamp(c.steerIn*0.26-c.delta,-4*dt,4*dt);c.yaw-=vr*Math.tan(c.delta)/WB*dt;c.chi=c.yaw;
    c.x-=Math.cos(c.yaw)*vr*dt;c.z-=Math.sin(c.yaw)*vr*dt;return;}
  if(c.dnf){c.throttle=0;c.brake=1;c.deltaCmd=0;c.steerIn=0;}
  const v=c.v,m=MASS+c.fuel,tg=tyreGrip(c)*c.surf*(1-0.12*c.damage),mu=MU*tg*gripV(v);
  const cla=CLA*(c.drsOpen?0.9:1)*(1-0.3*c.damage),cda=CDA*(c.drsOpen?0.85:1)*(1-0.22*c.tow);
  const Nn=m*G+0.5*RHO*cla*v*v,aMax=mu*Nn/m;
  const thr=c.fuel>0?c.throttle:0;
  const Fp=thr>0?Math.min(POWER*thr/Math.max(v,4),mu*0.62*Nn):0;
  const Fdrag=0.5*RHO*cda*v*v+(v>0.1?CRR*m*G:0),Fb=c.brake*mu*BRK*Nn;
  // steering lock shrinks with speed (heavy steering / small angles at 300 km/h); the player may ask
  // for ~30 % more than the grip limit, which now makes the car slide instead of tracking on rails
  const dGrip=Math.atan(aMax*WB/Math.max(v*v,1)),dPhys=0.26/(1+v/70); // ~13.5 m minimum turning radius, and still limited at speed
  const dmax=Math.max(0.03,Math.min(dPhys,dGrip*(c.isPlayer?1.2:1.1)));
  const want=c.isPlayer&&!c.auto?c.steerIn*dmax:clamp(c.deltaCmd,-dmax,dmax);
  c.delta+=clamp(want-c.delta,-8*dt,8*dt);
  let axT=(Fp-Fb)/m;if(v<0.05&&axT<0)axT=0;
  // heading (yaw) and travel direction (chi) are separate: the body can rotate faster than the
  // tyres can bend the path → slip angle beta = yaw − chi (slides, understeer, snap oversteer)
  if(c.chi===undefined)c.chi=c.yaw;
  const beta=wrapA(c.yaw-c.chi),rReq=v*Math.tan(c.delta)/WB;
  const rT=rReq-beta*1.6; // self-aligning torque straightens the car when you ease off
  c.r+=(rT-c.r)*(1-Math.exp(-dt/(0.07+v*0.002))); // yaw inertia (heavier at speed, never instant)
  // friction ellipse: drive/brake and the lateral force bending the path share one grip budget
  const ayNeed=v*(c.r+beta*4.5),n=Math.hypot(axT/(aMax*1.05),ayNeed/aMax);
  let ay=ayNeed;c.slip=0;if(n>1){c.slip=n-1;axT/=n;ay/=n;}
  if(c.slip>0&&c.throttle>0.5&&v<60)c.r+=Math.sign(rReq)*Math.min(c.slip,1)*c.throttle*2.0*dt; // power oversteer
  const ax=axT-Fdrag/m-Math.min(c.slip,1)*2.5-(c.slip>0?Math.min(Math.abs(beta),0.5)*v*0.45:0); // only a real slide scrubs speed
  c.v=Math.max(0,v+ax*dt);c.yaw+=c.r*dt;
  c.chi=v>0.5?c.chi+ay/v*dt:c.yaw;
  if(Math.abs(wrapA(c.yaw-c.chi))>1.0)c.chi=c.yaw-Math.sign(wrapA(c.yaw-c.chi))*1.0;
  c.aLong=ax;c.aLat=ay;
  c.x+=Math.cos(c.chi)*c.v*dt;c.z+=Math.sin(c.chi)*c.v*dt;
  const dist=c.v*dt;
  c.fuel=Math.max(0,c.fuel-FUEL_PER_LAP/L*dist*(0.35+0.65*thr)*1.12);
  c.wear+=dist/1000*COMP[c.comp].rate*wearMult*(1+1.5*Math.min(c.slip,2)+0.4*c.brake);
}

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
    if(pen>0&&(!w||pen>w.pen))w={pen,nx:rx*s,nz:rz*s};}
  if(!w){c.onWall=false;c.wallT=0;return;}
  c.x+=w.nx*w.pen;c.z+=w.nz*w.pen;
  const cd=c.chi??c.yaw,fx=Math.cos(cd),fz=Math.sin(cd),into=Math.max(0,-(fx*w.nx+fz*w.nz)); // travel direction vs wall
  if(!c.onWall){const vn=c.v*into;if(vn>1)jolt(c,w.nx,w.nz,c.x+fx*HX*0.8-w.nx*HZ,c.z+fz*HX*0.8-w.nz*HZ,vn);
    // the barrier does not forgive: damage grows with the speed INTO the wall; a hard hit (~70 km/h square on, i.e.
    // 200 km/h at 20°) or the last straw on a battered car breaks the suspension and ends the race
    if(vn>7&&phase==='race'&&!c.dnf){c.damage=Math.min(1,c.damage+(vn-7)*0.03);yellowZone(c.s,vn>14?14:8);
      if(vn>=19||c.damage>=1)retire(c,'HEAVY IMPACT',vn);
      else if(c.isPlayer&&simTime-lastContact>1.5){lastContact=simTime;msg('CONTACT · DAMAGE '+Math.round(c.damage*100)+'%');}}
    else if(vn>12&&!c.dnf)c.damage=Math.min(0.9,c.damage+(vn-12)*0.02);}
  c.onWall=true;
  // scraping the barrier costs speed: a brush barely hurts, but the longer the car stays against it
  // the harder it drags (bodywork, then tyre, biting into the wall)
  c.wallT=Math.min(2.5,(c.wallT||0)+dt);
  c.v=Math.max(0,c.v-(1.2+3.6*c.wallT+26*into)*dt);
  if(into>0){const ta=Math.atan2(fz+w.nz*into,fx+w.nx*into);c.chi=cd+clamp(wrapA(ta-cd),-3*dt,3*dt);c.yaw+=clamp(wrapA(ta-c.yaw),-1.0*dt,1.0*dt);}
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
    if(hitter&&closing>13)hitter.damage=Math.min(1,hitter.damage+(closing-13)*0.012); // front wing
    if(phase==='race'&&closing>10&&!A.pitSide&&!B.pitSide){yellowZone(A.s,8);
      if(closing>24&&!hitter.dnf)retire(hitter,'COLLISION',closing);
      const vic=hitter===A?B:A;if(closing>30&&!vic.dnf)retire(vic,'COLLISION',closing);}
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
  if(Math.abs(d)>0.3){C.v=Math.max(0,vx*Math.cos(ch)+vz*Math.sin(ch));return;}
  C.chi=nc;C.yaw+=d;C.v=nv;}
// visual-only impact motion: a damped twist/shake of the car body (the camera is not affected)
function jolt(c,dx,dz,px,pz,sp){const k=Math.min(sp,25),fx=Math.cos(c.yaw),fz=Math.sin(c.yaw);
  const tq=(px-c.x)*dz-(pz-c.z)*dx;c.jyV=clamp((c.jyV||0)-tq*k*0.02,-1.2,1.2);
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
  c.pitStop=2.2+rand(0,.7)+(c.damage>0.05?5:0);c.v=0;c.boxDone=true;c.pitCount++;c.drsOpen=false;
  if(c.isPlayer)msg('PIT STOP · '+COMP[c.nextComp].name+(c.damage>0.05?' · NEW FRONT WING':''));}
function finishPit(c){c.pitStop=0;c.comp=c.nextComp;c.wear=0;c.used.add(c.comp);c.damage=0;c.mesh.band.color.setHex(COMP[c.comp].hex);
  if(!c.isPlayer){c.pitLap=Infinity;c.nextComp=c.comp==='H'?'M':'H';}else{c.nextComp=c.comp==='H'?'M':'H';msg('GO GO GO');}}
function trackLimit(c){
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
    // the player has to stop the car INSIDE the painted box (±1.0 m along, ±0.8 m across); the AI drives to it
    if(c.isPlayer){if(c.v<0.4&&Math.abs(sp-box)<1.0&&Math.abs(c.d-(PIT_OFF+BOX_D))<0.8&&!c.revIn)startPit(c);}
    else if(c.pitPlan&&psp<box&&sp>=box)startPit(c);}
  if(sp>PIT_D&&sp<PIT_D+120&&c.boxDone){c.boxDone=false;c.pitPlan=false;}
  if(phase==='race'||phase==='quali'){const off=ad>hw+KERB_W+1.2*CAR_SZ&&!inPit&&!c.pitSide;if(off&&!c.tlOut){c.tlOut=true;trackLimit(c);}else if(ad<hw)c.tlOut=false;}
  if(ps>L-80&&s<80)lapCross(c);else if(ps<80&&s>L-80)c.lapCount--;
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
  // near-instant response: full input in ~60–100 ms (just enough smoothing to avoid a digital twitch)
  // centring stays quick; winding on lock slows with speed so taps give partial steering at 300 km/h
  const rate=(tg===0||Math.sign(tg)!==Math.sign(c.steerIn))?16:6/(1+c.v/25);c.steerIn+=clamp(tg-c.steerIn,-rate*dt,rate*dt);
  c.throttle+=clamp((keys.KeyW?1:0)-c.throttle,-25*dt,16*dt);c.brake+=clamp((keys.Space?1:0)-c.brake,-25*dt,20*dt);
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
    // no overtaking under yellow or the safety car — except past a wreck or a car crawling back to the pits
    const slowAhead=ahead&&(ahead.dnf||ahead.v<6);
    if(!c.pitPlan&&((!yellowAt(c.s)&&!scActive())||slowAhead)){
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
        c.besideSide=side;passT=clamp(beside.d+side*3.6,-edge,edge)-RL[c.idx];}}}
  // rejoining from the pit exit at low speed: keep to the right-hand edge until up to speed, never swing across the
  // racing line in front of cars arriving at full speed
  if(c.exitUntil!=null&&(fwd(c.s,c.exitUntil)<0||c.pitSide))c.exitUntil=null;
  if(c.exitUntil!=null&&!yielding)passT=(hwc-2.0)-RL[c.idx];
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
  if(session==='race'&&yellowAt(c.s)){vt*=0.72;c.drsOpen=false;}
  if(sc)vt=Math.min(vt,scCap(c));
  // now and then a driver overcooks a braking zone (≈ once per 300 car-laps): too fast into the corner for ~1.5 s
  if(session==='race'&&!sc&&c.lapCount>=0){if(c.mLap!==c.lapCount){c.mLap=c.lapCount;c.mAt=rnd()<0.0035?rnd()*L:null;}
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

/* ---- local yellow flags: a car that hits the barrier, stops, or is stranded off the road waves yellow on the stretch
   of track around it (the marshal posts from ~350 m before the incident to 80 m after it), not over a whole sector.
   Nobody overtakes there, everyone lifts, and DRS is cut until the stretch is clear again. ---- */
const secOf=s=>s<SEC[0]?0:s<SEC[1]?1:2;
let yZones=[],yShown=false;
const fwd=(a,b)=>{let d=b-a;if(d<-L/2)d+=L;else if(d>L/2)d-=L;return d;}; // signed distance from s=a forward to s=b
function yellowZone(s,dur){if(phase!=='race')return;for(const z of yZones)if(Math.abs(fwd(z.s,s))<120){z.until=Math.max(z.until,simTime+dur);return;}
  yZones.push({s,until:simTime+dur});}
const yellowAt=s=>yZones.some(z=>{const d=fwd(s,z.s);return d>-80&&d<350;});
const yellowAhead=s=>yZones.some(z=>{const d=fwd(s,z.s);return d>=350&&d<1500;});
function updateFlags(dt){
  yZones=yZones.filter(z=>simTime<z.until);
  if(phase!=='race'||raceStart==null||simTime-raceStart<3)return;
  for(const c of cars){
    if(c.parked||c.pitSide||c.pitStop>0||c.finished||c.held)continue;
    const off=Math.abs(c.d)>HWa[c.idx]+KERB_W+1.5;
    if(c.v<4||(off&&c.v<22)||c.dnf)yellowZone(c.s,c.dnf?3:4);}
  const on=player&&yZones.length>0;
  if(on&&!yShown&&!yellowAt(player.s))msg('YELLOW FLAG AHEAD');
  yShown=on;
  updateSafetyCar(dt);}

/* ---- retirements: a heavy hit ends the race. The wreck coasts to a halt where it is; marshals clear it after
   ~25–40 s (a car stopped on the racing surface takes longer). If it stops in the road, or the shunt was big,
   or two cars are out at once, the race goes behind the safety car. ---- */
function retire(c,why,sp){
  if(c.dnf||phase!=='race')return;c.dnf=true;c.dnfWhy=why;c.dnfLap=c.lapCount;c.drsOpen=false;c.throttle=0;c.brake=1;c.damage=1;
  const onRoad=Math.abs(c.d)<HWa[c.idx]+1&&!c.pitSide;
  c.clearAt=simTime+(onRoad?40:25)+rand(0,10);
  yellowZone(c.s,c.clearAt-simTime+4);
  const wrecks=cars.filter(o=>o.dnf&&!o.parked).length;
  if(c.isPlayer){msg('RETIRED · '+why,'Your race is over');setTimeout(showResults,3500);}
  else msg(c.code+' OUT · '+why);
  if(!checkered&&(onRoad||sp>26||wrecks>=2))deploySC(c);}
function clearWrecks(){for(const c of cars)if(c.dnf&&!c.parked&&simTime>=c.clearAt){
  if(c.isPlayer){c.v=0;c.held=true;continue;} // the camera stays on your car
  c.parked=true;c.mesh.root.visible=false;c.held=true;c.v=0;}}

/* ---- safety car: a silver road car with a yellow light bar joins in front of the leader. The field lines up behind
   it — no overtaking, no DRS — until the wreck is cleared and it has led for at least ~45 s. "SAFETY CAR IN THIS
   LAP": it peels into the pit lane, and racing resumes when the leader crosses the control line. ---- */
let sc=null,scMesh=null,scRestart=false;
function buildSCMesh(){const g=new THREE.Group();
  const body=mat({color:0xc9ced6,metalness:.75,roughness:.28}),dark=mat({color:0x15181e,metalness:.4,roughness:.3});
  const add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o;};
  add(new THREE.BoxGeometry(4.7,0.62,1.95),body,0,0.62,0);
  add(new THREE.BoxGeometry(2.3,0.52,1.7),dark,-0.35,1.18,0); // glasshouse
  add(new THREE.BoxGeometry(2.0,0.08,1.62),body,-0.4,1.46,0);
  const lb=add(new THREE.BoxGeometry(0.34,0.14,1.3),new THREE.MeshBasicMaterial({color:0x553a00}),-0.3,1.57,0);
  const lamps=[-0.42,0.42].map(z=>{const m=new THREE.MeshBasicMaterial({color:0x553a00});const o=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.16,0.42),m);o.position.set(-0.3,1.58,z);g.add(o);return m;});
  const tyre=mat({color:0x111111,roughness:.9});
  for(const [x,z] of [[1.45,.88],[1.45,-.88],[-1.45,.88],[-1.45,-.88]]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.28,16).rotateX(Math.PI/2),tyre);w.position.set(x,.36,z);g.add(w);}
  g.userData={lamps,bar:lb.material};g.visible=false;scene.add(g);return g;}
function deploySC(cause){
  if(sc||phase!=='race'||raceStart==null)return;
  let lead=null;for(const c of cars)if(!c.dnf&&!c.parked&&(!lead||c.progress>lead.progress))lead=c;if(!lead)return;
  if(!scMesh)scMesh=buildSCMesh();
  sc={s:(lead.s+180)%L,v:lead.v*0.8,t0:simTime,phase:'out',lap:0,cause};
  scRestart=false;for(const c of cars){c.scPos=null;c.drsOpen=false;}
  scMesh.visible=true;msg('SAFETY CAR DEPLOYED',cause?cause.code+' · '+cause.dnfWhy:'');}
function updateSafetyCar(dt){
  if(!sc){return;}
  const i=Math.floor(sc.s/DS)%N,lead=scLeader();
  // the pace: well under racing speed through the corners and ~170 km/h on the straights; it waits for the
  // leader if the field is still strung out behind it
  let vt=Math.min(VP[i]*0.62,47);const gap=lead?fwd(lead.s,sc.s):1e9;
  if(gap>260)vt*=0.75;
  sc.v+=clamp(vt-sc.v,-12*dt,6*dt);const ps=sc.s;sc.s=(sc.s+sc.v*dt)%L;
  const wrecksLeft=cars.some(c=>c.dnf&&!c.parked&&!c.isPlayer);
  if(sc.phase==='out'&&!wrecksLeft&&simTime-sc.t0>45&&!checkered){sc.phase='in';msg('SAFETY CAR IN THIS LAP');}
  // off into the pit lane when it reaches the entry on its last lap
  const spp=spOf(ps),sps=spOf(sc.s);
  if(sc.phase==='in'&&spp<PIT_A&&sps>=PIT_A){sc=null;scMesh.visible=false;scRestart=true;return;}
  const off=RL[i]*0.4,sx=X[i]-TZ[i]*off,sz=Z[i]+TX[i]*off;
  scMesh.position.set(sx,0.02,sz);scMesh.rotation.y=-ANG[i];
  const on=Math.floor(simTime*3)%2===0;scMesh.userData.lamps[0].color.setHex(on?0xffb000:0x553a00);scMesh.userData.lamps[1].color.setHex(on?0x553a00:0xffb000);}
// the first running car behind the safety car on the road
function scLeader(){if(!sc)return null;let best=null,bd=1e9;for(const c of cars){if(c.dnf||c.parked||c.pitSide||c.finished)continue;
  const d=fwd(c.s,sc.s);const dd=d<0?d+L:d;if(dd<bd){bd=dd;best=c;}}return best;}
const scActive=()=>!!sc||scRestart;
function scLeaderAny(){let ld=null;for(const c of cars)if(!c.dnf&&!c.parked&&!c.finished&&(!ld||c.progress>ld.progress))ld=c;return ld;}
// under the safety car the speed a car may run: the first car behind it holds ~25 m, everyone else closes up to the
// car ahead (the normal gap-keeping does the queueing) but no faster than ~75 % of racing speed
function scCap(c){if(!sc||c.pitSide||c.dnf)return 1e9;const i=c.idx;let cap=VP[i]*0.75;
  const g=fwd(c.s,sc.s),gg=g<0?g+L:g;if(scLeader()===c||gg<60)cap=Math.min(cap,sc.v+clamp((gg-25)*0.4,-sc.v,15));return Math.max(cap,0);}

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
    if(!drsEnabled&&!scActive()&&lead.lapCount>=DRS_FROM_LAP-1){drsEnabled=true;msg('DRS ENABLED');}
    if(sc&&drsEnabled){drsEnabled=false;for(const c of cars)c.drsOpen=false;}
    // restart: green once the leader crosses the control line after the safety car has gone in
    if(scRestart&&!sc){const ld=scLeaderAny();if(ld&&ld.s<60&&(ld.prevSc??ld.s)>L-60){scRestart=false;msg('GREEN FLAG','RACING RESUMES');}if(ld)ld.prevSc=ld.s;}
    clearWrecks();
    // the player under the safety car: it cannot be passed (you close up to it and no further), and passing a running
    // car before the restart line costs 5 s
    if(scActive()&&player&&!player.dnf){const p=player;
      if(sc&&!p.pitSide){const g=fwd(p.s,sc.s);if(g>0&&g<14&&p.v>sc.v)p.v=sc.v;}
      for(const o of cars){if(o===p||o.dnf||o.parked||o.pitSide||p.pitSide||o.finished)continue;const ah=p.progress>o.progress;
        if(o.scRel===false&&ah&&p.progress-o.progress<60){p.pen+=5;msg('OVERTAKING UNDER SAFETY CAR','5 SECOND PENALTY');}
        o.scRel=ah;}}
    else for(const o of cars)o.scRel=null;
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
function updateTower(){const o=order();$('twLap').textContent=Math.max(1,Math.min(totalLaps,(o[0].lapCount+1)))+'/'+targetLaps;
  const me=o.findIndex(c=>c.isPlayer);
  o.forEach((c,k)=>{const d=rowEls[k];const ch=d.children;
    // compact mode: keep the podium battle and your own fight, hide the rest
    // compact mode: five rows — you plus the two cars ahead and the two behind
    const lo=clamp(me-2,0,Math.max(0,o.length-5));d.style.display=(hudMode===0&&(k<lo||k>lo+4))?'none':'';ch[0].textContent=k+1;ch[1].style.background=hex(c.col);ch[2].textContent=c.code;
    ch[3].textContent=c.dnf?'OUT':c.pitStop>0||c.limiter?'PIT':c.finished?(k===0?'FINISH':'+'+(c.finishT-o[0].finishT).toFixed(3)):k===0?'Interval':gapStr(o[k-1],c);
    ch[4].style.borderColor=COMP[c.comp].col;d.className='row'+(c.isPlayer?' me':'')+(c.limiter||c.pitStop>0?' pit':'')+(fastest&&fastest.car===c?' fl':'');});}
// minimap canvas at the screen's pixel density (it was drawn at 1× and scaled up, i.e. blurry on HiDPI displays)
const mm=$('minimap'),mctx=mm.getContext('2d'),MMR=Math.min(2,Math.max(1,window.devicePixelRatio||1));
mm.width=mm.height=Math.round(230*MMR);mm.style.width=mm.style.height='230px';mctx.setTransform(MMR,0,0,MMR,0,0);let mmBase=null,mmT=null;
function buildMinimap(){let a=1e9,b=-1e9,c=1e9,d=-1e9;for(let i=0;i<N;i++){a=Math.min(a,X[i]);b=Math.max(b,X[i]);c=Math.min(c,Z[i]);d=Math.max(d,Z[i]);}
  const s=200/Math.max(b-a,d-c);mmT=(x,z)=>[15+(x-a)*s+(200-(b-a)*s)/2,15+(z-c)*s+(200-(d-c)*s)/2];
  const off=document.createElement('canvas');off.width=off.height=Math.round(230*MMR);const x=off.getContext('2d');x.setTransform(MMR,0,0,MMR,0,0);x.lineJoin='round';
  x.beginPath();for(let i=0;i<=N;i+=3){const [px,pz]=mmT(X[i%N],Z[i%N]);i?x.lineTo(px,pz):x.moveTo(px,pz);}x.closePath();x.strokeStyle='#55607a';x.lineWidth=5;x.stroke();
  for(const z of DRSZ){x.beginPath();let st=Math.round(z.a/DS),en=Math.round(z.b/DS);if(en<st)en+=N;for(let i=st;i<=en;i+=2){const [px,pz]=mmT(X[i%N],Z[i%N]);i===st?x.moveTo(px,pz):x.lineTo(px,pz);}x.strokeStyle='rgba(27,226,107,.75)';x.lineWidth=5;x.stroke();}
  const [sx,sz]=mmT(X[0],Z[0]);x.fillStyle='#fff';x.fillRect(sx-4,sz-1.5,8,3);mmBase=off;}
function drawMinimap(){mctx.clearRect(0,0,230,230);mctx.drawImage(mmBase,0,0,230,230);
  for(const c of cars){if(c===player||c.parked)continue;const [x,z]=mmT(c.x,c.z);mctx.fillStyle=hex(c.col);mctx.beginPath();mctx.arc(x,z,3.4,0,7);mctx.fill();}
  const [x,z]=mmT(player.x,player.z);mctx.fillStyle='#fff';mctx.beginPath();mctx.arc(x,z,5.5,0,7);mctx.fill();mctx.fillStyle='#e10600';mctx.beginPath();mctx.arc(x,z,3.4,0,7);mctx.fill();}

function gearOf(v){const k=v*3.6;let g=0;while(g<7&&k>GEARS[g])g++;return g;}
// HUD writes are guarded: touching the DOM every frame with an unchanged value still dirties style/layout next to a WebGL canvas
const _hc={};
function setTxt(id,v){if(_hc[id]!==v){_hc[id]=v;$(id).textContent=v;}}
function setW(id,p){const v=Math.round(p);if(_hc['w'+id]!==v){_hc['w'+id]=v;$(id).style.width=v+'%';}}
function updateHud(){
  const c=player,kmh=c.v*3.6,g=gearOf(c.v);
  const rpm=c.held?4000+c.throttle*7500:rpmOf(c);
  setTxt('spd',Math.round(kmh));setTxt('gear',c.v<0.3&&c.held?'N':(g+1));
  setW('rpmFill',(rpm-4000)/8200*100);setW('thr',c.throttle*100);setW('brk',c.brake*100);
  const dc=c.drsOpen?'open':(drsEnabled&&c.zone>=0&&c.drsElig[c.zone])?'av':drsEnabled?'en':'';
  if(_hc.drs!==dc){_hc.drs=dc;$('drs').className=dc;}
  const lc=c.limiter?'on':'';if(_hc.lim!==lc){_hc.lim=lc;$('lim').className=lc;}
  audioUpdate(rpm,c.held?0:g);
}
function updateInfo(){
  const c=player;
  if(session==='quali'){updateQualiInfo();return;}
  const o=order(),k=o.indexOf(c);
  $('gapALbl').textContent='GAP AHEAD';$('gapA').style.color='';$('gapB').parentElement.style.display='';
  $('pos').textContent='P'+(k+1);$('gapA').textContent=k>0?gapStr(o[k-1],c).replace('+','-'):'LEADER';$('gapB').textContent=k<o.length-1?gapStr(c,o[k+1]):'—';
  const lap=Math.max(1,Math.min(totalLaps,c.lapCount+1));$('lapNum').textContent=lap+' / '+targetLaps;
  $('curLap').textContent=c.lapCount>=0&&phase==='race'&&!c.finished?fmt(simTime-c.lapStart):'—';$('lastLap').textContent=fmt(c.lastLap);$('bestLap').textContent=fmt(c.bestLap);
  ['s1','s2','s3'].forEach((id,i)=>{const e=$(id);e.textContent=c.sec[i]!=null?c.sec[i].toFixed(3):'S'+(i+1);e.className=c.secCol[i];});
  const tc=$('tyreC');tc.textContent=c.comp;tc.style.borderColor=COMP[c.comp].col;$('wear').textContent=Math.round(c.wear*100)+'%';
  const nc=$('nextC');nc.textContent=c.nextComp;nc.style.borderColor=COMP[c.nextComp].col;
  $('used').textContent=[...c.used].join(' · ')+(c.used.size<2?'  (1 more needed)':' ✓');
  $('fuel').textContent=c.fuel.toFixed(1);$('dmg').textContent=Math.round(c.damage*100)+'%';$('tl').textContent=Math.min(c.tl,3);$('pen').textContent=c.pen;
  const f=[];
  if(phase==='race'&&yellowAt(c.s))f.push(['YELLOW FLAG','#ffd200','#151515']);
  else if(phase==='race'&&yellowAhead(c.s))f.push(['YELLOW AHEAD','#6b5a00','#ffd200']);
  if(phase==='race'&&sc)f.unshift([sc.phase==='in'?'SC IN THIS LAP':'SAFETY CAR','#ffd200','#151515']);
  else if(phase==='race'&&scRestart)f.unshift(['RESTART · NO OVERTAKING','#6b5a00','#ffd200']);
  if(c.dnf)f.unshift(['RETIRED','#e10600','#fff']);
  if(!drsEnabled&&phase==='race')f.push(['DRS DISABLED','#333','#aaa']);
  if(phase==='race'){for(const x of cars){if(x===c)continue;let a=c.s-x.s;if(a<-L/2)a+=L;else if(a>L/2)a-=L;if(a>0&&a<70&&x.progress>c.progress+L*0.5){f.push(['BLUE FLAG','#1560ff','#fff']);break;}}}
  if(c.tl===3)f.push(['BLACK & WHITE','linear-gradient(135deg,#000 50%,#fff 50%)','#e10600']);
  if(checkered)f.push(['CHEQUERED','repeating-conic-gradient(#fff 0 25%,#111 0 50%) 0 0/12px 12px','#e10600']);
  $('flags').innerHTML=f.map(x=>`<span class="flag" style="background:${x[1]};color:${x[2]}">${x[0]}</span>`).join('');
  updateTower();
}

// qualifying HUD: no gaps to cars on track (there are none) — show the stage, the running lap and
// the time that would take pole
function updateQualiInfo(){
  const c=player,rivals=[...qTimes.entries()].filter(([k,v])=>k!==c&&v!=null).map(([,v])=>v),best=rivals.length?Math.min(...rivals):null;
  const stage=qStage==='flying'&&c.lapInvalid?'LAP DELETED':qStage==='done'?'QUALIFYING':'FLYING LAP';
  $('lapNum').textContent=stage;
  $('pos').textContent=qStage==='done'&&qGrid?'P'+(qGrid.indexOf(c)+1):'—';
  $('gapALbl').textContent='DELTA TO POLE';
  const ref=best!=null&&qStage==='flying'&&!c.lapInvalid?best*CUMT[c.idx]/CUMT[N]:null;
  const dl=ref==null?null:(simTime-c.lapStart)-ref;
  $('gapA').textContent=dl==null?'—':(dl>=0?'+':'')+dl.toFixed(3);
  $('gapA').style.color=dl==null?'':(dl<0?'#1be26b':'#ff5252');
  $('gapB').parentElement.style.display='none';
  const cur=qStage==='flying'?simTime-c.lapStart:null;
  $('curLap').textContent=cur==null?'—':fmt(cur);
  $('lastLap').textContent=fmt(c.lastLap);$('bestLap').textContent=fmt(c.bestLap);
  ['s1','s2','s3'].forEach((id,i)=>{const e=$(id);e.textContent=c.sec[i]!=null?c.sec[i].toFixed(3):'S'+(i+1);e.className=c.secCol[i];});
  const tc=$('tyreC');tc.textContent=c.comp;tc.style.borderColor=COMP[c.comp].col;$('wear').textContent=Math.round(c.wear*100)+'%';
  const nc=$('nextC');nc.textContent=c.nextComp;nc.style.borderColor=COMP[c.nextComp].col;
  $('used').textContent='QUALIFYING';
  $('fuel').textContent=c.fuel.toFixed(1);$('dmg').textContent=Math.round(c.damage*100)+'%';
  $('tl').textContent=Math.min(c.tl,3);$('pen').textContent=c.pen;
  $('flags').innerHTML=c.lapInvalid?'<span class="flag" style="background:#333;color:#fff">LAP DELETED</span>':'';
}

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
function audioInit(){try{const ac=new (window.AudioContext||window.webkitAudioContext)();
  const master=ac.createGain();master.gain.value=.55;const comp=ac.createDynamicsCompressor();master.connect(comp).connect(ac.destination);
  const buf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const mk=(type,fr,q)=>{const n=ac.createBufferSource();n.buffer=buf;n.loop=true;const bf=ac.createBiquadFilter();bf.type=type;bf.frequency.value=fr;bf.Q.value=q;const g=ac.createGain();g.gain.value=0;n.connect(bf).connect(g).connect(master);n.start();return g;};
  const cyc=engineCycle(ac);
  au={ac,master,buf,me:engineVoice(ac,master,buf,.34,cyc),opp:engineVoice(ac,master,buf,0,cyc),sq:mk('bandpass',1250,4),wn:mk('lowpass',500,.7)};}catch(e){au=null;}}
function pop(t){const ac=au.ac,s=ac.createBufferSource();s.buffer=au.buf;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=rand(320,950);f.Q.value=1.1;
  const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(rand(.15,.38),t+.004);g.gain.exponentialRampToValueAtTime(.001,t+rand(.04,.11));
  s.connect(f).connect(g).connect(au.master);s.start(t,Math.random()*1.5,.12);}
// the string of pops down the exhaust after a lift: unburnt fuel lighting off in the pipes
function crackle(t,rpm){const n=2+Math.floor(Math.random()*4);
  for(let k=0;k<n;k++)pop(t+0.04+k*rand(0.03,0.11));}
function rpmOf(c){const kmh=c.v*3.6,g=gearOf(c.v);let r=clamp(12000*kmh/GEARS[g],4000,12200);if(g===0)r=Math.max(r,4000+c.throttle*7000*(1-kmh/GEARS[0]));return r;}
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
  au.sq.gain.setTargetAtTime(Math.min(.25,c.slip*.6)*(c.v>6?1:0),t,.05);
  au.wn.gain.setTargetAtTime(Math.min(.3,(c.v/85)**2*.3),t,.1);}

/* ================= CAMERA / VISUALS ================= */
function updateVisuals(dt){
  const sdt=Math.min(dt,1/30),al=clamp(acc/H,0,1);
  // render between the last two physics states so motion is smooth at any refresh rate
  for(const c of cars){if(c.px===undefined){c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;}
    c.rx=c.px+(c.x-c.px)*al;c.rz=c.pz+(c.z-c.pz)*al;c.ryaw=c.pyaw+wrapA(c.yaw-c.pyaw)*al;}
  for(const c of cars){const m=c.mesh;m.root.position.set(c.rx,.02+(c.pitStop>0?.13:0),c.rz);
    c.visSlide=0; // real slip angle is simulated now (body yaw ≠ travel direction)
    // impact twist is applied to the whole car (body + wheels) so the body never shears off its wheels
    m.root.rotation.y=-c.ryaw+clamp(c.jy||0,-0.08,0.08);
    // suspension: damped springs toward load-transfer targets (nose dive, body roll)
    // stiff F1-like suspension: only a hint of roll/dive, critically damped so keyboard taps don't rock the car
    const tp=clamp(c.aLong*0.0003,-0.012,0.008),tr=clamp(-c.aLat*0.00012,-0.006,0.006);
    c.pitchV+=((tp-c.pitch)*160-c.pitchV*25)*sdt;c.pitch+=c.pitchV*sdt;
    c.rollV+=((tr-c.roll)*160-c.rollV*25)*sdt;c.roll+=c.rollV*sdt;
    c.jyV=(c.jyV||0)+(-(c.jy||0)*220-c.jyV*12)*sdt;c.jy=(c.jy||0)+c.jyV*sdt;
    if(!isFinite(c.roll)||!isFinite(c.pitch)){c.roll=c.pitch=c.rollV=c.pitchV=0;}if(!isFinite(c.jy)){c.jy=c.jyV=0;}
    m.body.rotation.set(clamp(c.roll,-0.05,0.05),0,clamp(c.pitch,-0.04,0.04));
    for(const w of m.wheels)w.rotation.z-=c.v*dt/(0.36*WHEEL_S);for(const s of m.steer)s.rotation.y=-c.delta*1.4;
    setFar(m,c!==player&&Math.hypot(c.rx-camera.position.x,c.rz-camera.position.z)>FAR_D);
    m.flap.rotation.z=c.drsOpen?-.04:-.45;m.tail.color.setHex(c.brake>.1?0xff1010:0x4a0000);}
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
  updatePitHud();
  // F1 broadcast T-cam just above the driver's head. It follows position and heading only —
  // it is NOT tied to body roll/pitch, so the horizon stays level whatever the chassis does.
  // Two things made this view sickening and both are fixed here:
  //  1. the heading was welded 1:1 to the chassis, so every steering tap and every degree of slip
  //     angle swung the whole world. It is now a damped follow that aims where the car is TRAVELLING.
  //  2. the field of view grew with speed. A FOV that breathes is a classic nausea trigger; it is fixed.
  const c=player;
  const tgt=c.ryaw-clamp(wrapA(c.ryaw-c.chi),-0.4,0.4)*0.6;
  if(camYaw===null)camYaw=tgt;else camYaw+=wrapA(tgt-camYaw)*(1-Math.exp(-dt/0.14));
  const hx=Math.cos(camYaw),hz=Math.sin(camYaw);
  camera.position.set(c.rx-hx*0.16,0.02+1.4*CAR_SY,c.rz-hz*0.16);_v1.set(c.rx+hx*40,0.65,c.rz+hz*40);
  camera.up.set(0,1,0);
  camera.lookAt(_v1);camera.fov=62;camera.far=FAR_RACE;
  updateRacingLine();
  camera.updateProjectionMatrix();
  aimSun(c.rx,c.rz);
}
const _v1=new THREE.Vector3();
let camYaw=null; // damped camera heading; reset when a car is placed on the grid

/* ---- pit banner: counts down the approach to the entry, then narrates the stop itself ---- */
const pitHud=document.createElement('div');
pitHud.style.cssText='position:fixed;left:50%;top:19%;transform:translateX(-50%);z-index:35;display:none;'+
 'text-align:center;font:800 15px/1.55 Titillium Web,sans-serif;color:#fff;letter-spacing:.07em;'+
 'background:rgba(8,11,16,.84);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:9px 20px;white-space:nowrap';
document.body.appendChild(pitHud);
function updatePitHud(){
  const c=player;if(!c||phase!=='race'){pitHud.style.display='none';return;}
  if(c.pitStop>0){
    const t=c.pitStop,stage=t>0.75?'TYRE CHANGE':'READY TO GO';
    pitHud.innerHTML='<span style="color:'+(t>0.75?'#ff5252':'#3ddc6a')+'">● </span>'+stage+
      ' — <b>'+t.toFixed(1)+'s</b><br><span style="font-weight:400;opacity:.8;font-size:12px">'+
      COMP[c.nextComp].name+(c.damage>0.05?' · NEW FRONT WING':'')+'</span>';
    pitHud.style.display='block';return;}
  const sp=spOf(c.s),d=PIT_A-sp;
  if(!c.pitSide&&d>0&&d<420){
    pitHud.innerHTML='<span style="color:#4aa3ff">▸ PIT ENTRY</span> '+Math.round(d)+' m'+
      '<br><span style="font-weight:400;opacity:.8;font-size:12px">Follow the red lane · next tyre '+COMP[c.nextComp].name+'</span>';
    pitHud.style.display='block';return;}
  // in the lane: steer into the working lane and stop the car inside your painted box
  if(c.pitSide&&!c.boxDone&&!c.dnf){const along=BOX_S[c.team]-sp,lat=PIT_OFF+BOX_D-c.d;
    const inBox=Math.abs(along)<1.0&&Math.abs(lat)<0.8;
    const side=Math.abs(lat)<0.8?'<span style="color:#3ddc6a">LINED UP</span>':lat>0?'MOVE RIGHT '+lat.toFixed(1)+' m ▸':'◂ MOVE LEFT '+(-lat).toFixed(1)+' m';
    let head;
    if(inBox)head='<span style="color:#3ddc6a">■ IN THE BOX</span> — '+(c.v<0.4?'STOPPING':'BRAKE TO A STOP');
    else if(along<-1.0)head='<span style="color:#ff5252">OVERSHOT '+(-along).toFixed(1)+' m</span> — hold <b>S</b> to reverse';
    else if(along<160)head='<span style="color:#ffd200">BOX</span> '+along.toFixed(along<20?1:0)+' m';
    else head='<span style="color:#ffd200">PIT LANE 60 km/h</span>';
    pitHud.innerHTML=head+'<br><span style="font-weight:400;opacity:.85;font-size:12px">'+(along<160?side+' · stop inside the box':'Your box is on the right, past the 60 line')+'</span>';
    pitHud.style.display='block';return;}
  if(c.limiter){pitHud.innerHTML='<span style="color:#ffd200">PIT LANE 60 km/h</span><br>'+
    '<span style="font-weight:400;opacity:.8;font-size:12px">'+(c.boxDone?'Hold to the exit':'Stop in your box')+'</span>';
    pitHud.style.display='block';return;}
  pitHud.style.display='none';}

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
  rlMesh.visible=false;pitHud.style.display='none';for(const g of crews)g.visible=false;
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
    m.root.position.set(x,.02+(cl[A+p+7]?.13:0),z);m.root.rotation.y=-yaw;m.body.rotation.set(0,0,0);
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
addEventListener('keydown',e=>{if(phase==='menu'||phase==='box'||phase==='qdone')return;if(['Space','KeyW','KeyA','KeyD','KeyS'].includes(e.code))e.preventDefault();keys[e.code]=true;
  if(e.repeat)return;
  if(e.code==='KeyE'&&player){const c=player;if(drsEnabled&&c.zone>=0&&c.drsElig[c.zone]&&c.brake<0.05)c.drsOpen=true;else if(c.zone>=0&&drsEnabled&&!c.drsElig[c.zone])msg('DRS NOT AVAILABLE');}
  if(e.code==='KeyQ'){const i=MODES.indexOf(qState.mode);const m=MODES[(i+1)%MODES.length];setQualityMode(m);msg('GRAPHICS · '+(m==='auto'?'AUTO ('+PRESETS[qName].label+')':PRESETS[m].label));}
  if(e.code==='KeyL'){rlMode=(rlMode+1)%3;msg('RACING LINE · '+RL_MODES[rlMode]);}
  if(e.code==='KeyM')muted=!muted;
  if(e.code==='KeyH'){hudMode=(hudMode+1)%3;mRect=null;$('hud').className=['lite','','min'][hudMode];msg('HUD · '+['COMPACT','FULL','MINIMAL'][hudMode]);}
  if(e.code==='Digit0'||e.code==='Numpad0'){if(replay)endReplay();else startReplay();return;}
  if(e.code==='KeyP'||e.code==='Escape'){if(replay){endReplay();return;}togglePause();}
  if(['Digit1','Digit2','Digit3'].includes(e.code)&&player){const n={Digit1:'S',Digit2:'M',Digit3:'H'}[e.code];player.nextComp=n;msg('NEXT TYRE · '+COMP[n].name);}
  if(e.code==='KeyR'&&player&&phase==='race'&&player.pitStop<=0&&!player.dnf){const c=player,i=c.idx;const d=c.pitSide?PIT_OFF+FAST_D:clamp(c.d,-HWa[i]+1.5,HWa[i]-1.5);c.x=X[i]-TZ[i]*d;c.z=Z[i]+TX[i]*d;c.yaw=c.chi=ANG[i];c.v=0;c.delta=0;c.r=0;c.px=c.x;c.pz=c.z;c.pyaw=c.yaw;msg('BACK ON TRACK');}
});
addEventListener('keyup',e=>{keys[e.code]=false;});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
function togglePause(){if(phase==='menu'||phase==='box'||phase==='qdone'||resultsShown||replay)return;paused=!paused;$('pause').hidden=!paused;}
$('resumeBtn').onclick=togglePause;
$('quitBtn').onclick=$('againBtn').onclick=()=>location.reload();

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
  else if(replay){replayFrame(dt);if(!replay)updateVisuals(dt);drawMinimap();}
  else{const f0=perf.on?performance.now():0;
    if(!paused){acc+=dt;while(acc>=H&&n<6){step(H);acc-=H;n++;if((++recStep&1)===0)recFrame();}if(n>=6)acc=0;}
    const f1=perf.on?performance.now():0;
    updateVisuals(dt);updateHud();drawMinimap();hudT-=dt;if(hudT<=0){hudT=0.2;updateInfo();}
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
  applyQuality();
  await stage('Compiling shaders…',.95);
  {const w=carMesh(0xd90008,0xf6f6f6,7);w.root.position.set(X[0],0,Z[0]);w.far.visible=true;window.__warm=w;} // one throw-away car so its programs are compiled now, not on the first race frame
  try{await renderer.compileAsync(scene,camera);}catch(e){}
  {const w=window.__warm;if(w){w.far.visible=false;scene.remove(w.root);delete window.__warm;}}
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
// and depth/stencil, per owner
function rtBytes(rt){if(!rt||!rt.isWebGLRenderTarget)return 0;const px=rt.width*rt.height,s=rt.samples||0,t=rt.texture.type;
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
window.hrc={quickRace,detHash,reseed,rtEstimate,get player(){return player;},get simTime(){return simTime;},gpuTimer,cullByDistance,finishQuali,startRace,leaveBox,openBox,composer,step,updateVisuals,renderMirror,applyQuality,H,get cars(){return cars;},get phase(){return phase;},setQualityMode,renderer,scaler,get Q(){return Q;},get qName(){return qName;},THREE,scene};
