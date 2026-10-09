// Seoul Grand Prix (Gwanghwamun): the scenery the OpenStreetMap footprints alone cannot give — Joseon architecture
// (Gwanghwamun and its Woldae, Dongsipjagak, Daehanmun, the palace halls and walls), the landmark buildings of
// Sejong-daero with their LED boards and the Kyobo poem board, the sunken Cheonggyecheon with its bridges, the
// statues of the square, and N Seoul Tower on Namsan. Shapes and colours from the Kakao skyview photos, the OSM
// footprints/heights and the published dimensions of each structure. Called from game.js (buildOSM / buildCity) with
// a context object of the helpers those functions already have.
import * as THREE from 'three';

let C=null;
const leds=[]; // animated LED boards: {tex, frames, t0}
const matCache=new Map();
// one material per colour/finish (the decoration merger in buildOSM folds colours into vertex colours anyway)
const M=(color,rough=.8,metal=0,extra={})=>{const k=color+'|'+rough+'|'+metal+'|'+Object.entries(extra).map(([a,v])=>a+':'+(v&&v.uuid||v)).join(',');let m=matCache.get(k);
  if(!m){m=C.mat({color,roughness:rough,metalness:metal,...extra});matCache.set(k,m);}return m;};
const add=(o)=>{C.extra.push(o);return o;};
const box=(w,h,d,m,x,y,z,ry=0)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,y,z);b.rotation.y=ry;return b;};
// a group placed on an oriented footprint box (o from oba(): centre mx/mz, long axis angle ang)
const placed=(x,z,ang)=>{const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ang;return g;};

/* ---------------- colours ---------------- */
const GRANITE=0xcfc8b8,GRANITE_D=0xa9a294,TILE=0x45484d,TILE_RIDGE=0x5a5d62,COLUMN=0x8c2f24,DANCHEONG=0x2f6e5b,
  DANCHEONG_R=0xa6372c,PLASTER=0xece5d4,LATTICE=0x9a4a2e,BRONZE=0x6b5636,GOLDBRONZE=0x9c7a3a;

/* ---------------- Joseon roofs ----------------
   A hip-and-gable roof (paljak) over an L × W plan: eaves overhang `ov`, the eave line sweeps up toward the corners
   (`lift`), a ridge of length L - 0.7 W at height H. Built as one flat-shaded surface plus the white-mortared ridge. */
function roofGeo(L,W,H,ov,lift){const n=10,pos=[],idx=[];const hx=L/2+ov,hz=W/2+ov,R=Math.max(0.6,L/2-W*0.35);
  const ey=t=>lift*Math.pow(Math.abs(2*t-1),2.4); // eave height along an edge (t 0…1): up at both corners
  const v=(x,y,z)=>{pos.push(x,y,z);return pos.length/3-1;};
  // long sides: eave row and ridge row
  for(const s of [-1,1]){const e=[],r=[];
    for(let k=0;k<=n;k++){const t=k/n,x=-hx+2*hx*t;e.push(v(x,ey(t),s*hz));r.push(v(Math.max(-R,Math.min(R,x*(R/hx)*1.25)),H,0));}
    for(let k=0;k<n;k++){if(s>0)idx.push(e[k],e[k+1],r[k+1],e[k],r[k+1],r[k]);else idx.push(e[k],r[k+1],e[k+1],e[k],r[k],r[k+1]);}}
  // hipped ends
  for(const s of [-1,1]){const e=[];for(let k=0;k<=n;k++){const t=k/n,z=-hz+2*hz*t;e.push(v(s*hx,ey(t)*0.9+lift*0.1,z));}
    const top=v(s*R,H,0);for(let k=0;k<n;k++){if(s>0)idx.push(e[k],top,e[k+1]);else idx.push(e[k],e[k+1],top);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;}
// one storey of a hanok: columns, panelled walls, the dancheong-painted bracket band, and its roof
function hanokStorey(g,L,W,y0,wallH,roofH,{ov=2.2,lift=0.9,walls=true,cols=true}={}){
  if(walls){g.add(box(L-0.6,wallH,W-0.6,M(PLASTER,.9),0,y0+wallH/2,0));
    // lattice doors on the long sides
    for(const s of [-1,1]){const nb=Math.max(1,Math.round(L/3.4));for(let k=0;k<nb;k++){const x=-L/2+L*(k+0.5)/nb;
      g.add(box(L/nb*0.78,wallH*0.72,0.12,M(LATTICE,.85),x,y0+wallH*0.42,s*(W/2-0.25)));}}}
  if(cols){const nx=Math.max(2,Math.round(L/3.4)+1),nz=Math.max(2,Math.round(W/3.4)+1);
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){if(i>0&&i<nx-1&&j>0&&j<nz-1)continue;
      const c=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.3,wallH,8),M(COLUMN,.75));c.position.set(-L/2+L*i/(nx-1),y0+wallH/2,-W/2+W*j/(nz-1));g.add(c);}}
  // bracket band (gongpo) in green and red dancheong
  g.add(box(L+0.6,0.7,W+0.6,M(DANCHEONG,.7),0,y0+wallH+0.35,0));
  g.add(box(L+0.9,0.22,W+0.9,M(DANCHEONG_R,.7),0,y0+wallH+0.8,0));
  const r=new THREE.Mesh(roofGeo(L+0.6,W+0.6,roofH,ov,lift),M(TILE,.82,0,{flatShading:true,side:THREE.DoubleSide}));r.position.y=y0+wallH+0.9;g.add(r);
  const R=Math.max(0.6,(L+0.6)/2-(W+0.6)*0.35);
  g.add(box(2*R+0.6,0.55,0.7,M(TILE_RIDGE,.8),0,y0+wallH+0.9+roofH+0.2,0));
  for(const s of [-1,1])g.add(box(0.7,0.9,0.7,M(0xe8e4da,.8),s*(R+0.3),y0+wallH+0.9+roofH+0.35,0));}
// a stone platform with a granite edge
function platform(g,L,W,h){g.add(box(L,h,W,M(GRANITE,.9),0,h/2,0));g.add(box(L+0.3,0.15,W+0.3,M(GRANITE_D,.9),0,h-0.07,0));}
// any traditional building from its footprint: halls, gates, pavilions inside Gyeongbokgung and Deoksugung
function hanok(pts,h,ar,big){const o=C.oba(pts),L=o.l1-o.l0,W=o.w1-o.w0;if(L<2||W<2)return;
  const g=placed(o.mx,o.mz,o.ang);const base=big?1.4:0.6,wallH=Math.min(h>0?h*0.45:99,ar>500?6.5:ar>150?4.6:3.4),roofH=Math.min(7.5,Math.max(1.6,W*0.36));
  platform(g,L+1.2,W+1.2,base);
  if(ar>900||big){hanokStorey(g,L*0.92,W*0.88,base,wallH,roofH*0.45,{ov:2.6,lift:1.0});hanokStorey(g,L*0.7,W*0.6,base+wallH+0.9+roofH*0.45,wallH*0.55,roofH*0.8,{ov:2.3,lift:1.1});}
  else hanokStorey(g,L,W,base,wallH,roofH,{ov:Math.min(2.2,W*0.3),lift:Math.min(0.9,W*0.12)});
  add(g);}

/* ---------------- canvas pictures ---------------- */
// the LED boards: four frames stacked in one texture, swapped every few seconds (seoulTick)
function ledTexture(kind){const t=C.canvasTex(512,1024,(x)=>{
    const F=(i,draw)=>{x.save();x.translate(0,i*256);x.beginPath();x.rect(0,0,512,256);x.clip();draw();x.restore();};
    const font=(s,w=900)=>`${w} ${s}px "HRC F1", "Noto Sans KR", Titillium Web, Arial, sans-serif`;
    F(0,()=>{const g=x.createLinearGradient(0,0,512,256);g.addColorStop(0,'#e10600');g.addColorStop(1,'#14080c');x.fillStyle=g;x.fillRect(0,0,512,256);
      x.fillStyle='#fff';x.font=font(64);x.textAlign='center';x.fillText('SEOUL',256,105);x.font=font(40,700);x.fillText('GRAND PRIX',256,160);
      x.fillStyle='#ffd200';x.fillRect(96,190,320,8);});
    F(1,()=>{const g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,'#0b3d91');g.addColorStop(1,'#1e88e5');x.fillStyle=g;x.fillRect(0,0,512,256);
      x.fillStyle='#fff';x.font=font(54);x.textAlign='center';x.fillText(kind===1?'광화문':'서울',256,118);x.font=font(30,700);x.fillText(kind===1?'GWANGHWAMUN':'SEOUL · KOREA',256,170);});
    F(2,()=>{x.fillStyle='#101418';x.fillRect(0,0,512,256);
      for(let k=0;k<6;k++){x.fillStyle=['#ff2d48','#2a9dff','#ffd200','#3ddc6a','#ff7a00','#c46bff'][k];x.fillRect(30+k*76,60,60,140*(0.35+0.65*Math.abs(Math.sin(k*1.7+kind))));}
      x.fillStyle='#fff';x.font=font(26,700);x.textAlign='left';x.fillText('LAP RECORD',30,40);});
    F(3,()=>{const g=x.createRadialGradient(256,128,10,256,128,300);g.addColorStop(0,'#ffe9a8');g.addColorStop(1,'#d9480f');x.fillStyle=g;x.fillRect(0,0,512,256);
      x.fillStyle='#14080c';x.font=font(46);x.textAlign='center';x.fillText(kind===2?'코리아 그랑프리':'HRC 2026',256,120);x.font=font(28,700);x.fillText('하늘 레이싱 챔피언십',256,172);});
  },false);
  t.repeat.set(1,0.25);t.offset.set(0,0.75);leds.push({tex:t,frame:0,phase:kind*1.3});return t;}
// the same for a tall screen (Dong-A Media Center's corner): four 1 × 2 portrait frames
function ledTextureTall(){const t=C.canvasTex(256,2048,(x)=>{
    const F=(i,draw)=>{x.save();x.translate(0,i*512);x.beginPath();x.rect(0,0,256,512);x.clip();draw();x.restore();};
    const font=(s,w=900)=>`${w} ${s}px "HRC F1", "Noto Sans KR", Titillium Web, Arial, sans-serif`;
    F(0,()=>{const g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#14080c');g.addColorStop(1,'#e10600');x.fillStyle=g;x.fillRect(0,0,256,512);
      x.fillStyle='#fff';x.textAlign='center';x.font=font(54);x.fillText('SEOUL',128,200);x.font=font(30,700);x.fillText('GRAND',128,250);x.fillText('PRIX',128,286);
      x.fillStyle='#ffd200';x.fillRect(48,320,160,8);});
    F(1,()=>{const g=x.createLinearGradient(0,0,256,512);g.addColorStop(0,'#bde3ff');g.addColorStop(1,'#1e88e5');x.fillStyle=g;x.fillRect(0,0,256,512);
      x.fillStyle='rgba(255,255,255,.85)';for(let k=0;k<5;k++){x.beginPath();x.ellipse(60+k*40,90+k*70,50,18,0,0,7);x.fill();}
      x.fillStyle='#0b2a5a';x.textAlign='center';x.font=font(44);x.fillText('광화문',128,400);x.font=font(22,700);x.fillText('GWANGHWAMUN',128,440);});
    F(2,()=>{x.fillStyle='#0d1014';x.fillRect(0,0,256,512);
      for(let k=0;k<5;k++){x.fillStyle=['#ff2d48','#2a9dff','#ffd200','#3ddc6a','#ff7a00'][k];x.fillRect(24,70+k*80,208*(0.35+0.65*Math.abs(Math.sin(k*1.9))),50);}
      x.fillStyle='#fff';x.textAlign='left';x.font=font(24,700);x.fillText('LAP RECORD',24,44);});
    F(3,()=>{const g=x.createRadialGradient(128,256,10,128,256,320);g.addColorStop(0,'#ffe9a8');g.addColorStop(1,'#d9480f');x.fillStyle=g;x.fillRect(0,0,256,512);
      x.fillStyle='#14080c';x.textAlign='center';x.font=font(40);x.fillText('HRC',128,230);x.fillText('2026',128,280);x.font=font(18,700);x.fillText('하늘 레이싱 챔피언십',128,330);});
  },false);
  t.repeat.set(1,0.25);t.offset.set(0,0.75);leds.push({tex:t,frame:0,phase:2.1});return t;}
// the Kyobo poem board (Gwanghwamun geulpan): a big white banner with a short verse and a painted sky.
// (Our own lines, not a quoted poem.)
function poemTexture(){return C.canvasTex(1024,512,(x)=>{const g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#eaf4fb');g.addColorStop(1,'#fdfbf3');x.fillStyle=g;x.fillRect(0,0,1024,512);
  x.fillStyle='rgba(120,170,210,.35)';for(let k=0;k<7;k++){x.beginPath();x.ellipse(120+k*140,120+Math.sin(k)*30,90,26,0,0,Math.PI*2);x.fill();}
  x.fillStyle='#2c6e49';for(let k=0;k<26;k++){x.beginPath();x.ellipse(40+k*38,470-Math.abs(Math.sin(k*0.7))*40,14,30,0.4,0,Math.PI*2);x.fill();}
  x.fillStyle='#1d2a36';x.font='700 64px "Noto Sans KR", sans-serif';x.textAlign='center';
  x.fillText('바람이 지나간 자리마다',512,230);x.fillText('새 길이 하나씩 열린다',512,320);
  x.font='400 30px "Noto Sans KR", sans-serif';x.fillStyle='#55606b';x.fillText('— 광화문에서',760,400);},false);}
// a plain banner (Seoul Library's "dream board")
function bannerTexture(lines,bg='#ffffff',fg='#1b1b1b'){return C.canvasTex(1024,384,(x)=>{x.fillStyle=bg;x.fillRect(0,0,1024,384);
  x.fillStyle=fg;x.textAlign='center';x.font='800 92px "Noto Sans KR", sans-serif';lines.forEach((l,k)=>x.fillText(l,512,150+k*120));},false);}
// granite blocks for the Cheonggyecheon walls and the Gwanghwamun base
function stoneTexture(rx=1,ry=1){const t=C.canvasTex(256,256,(x)=>{x.fillStyle='#b9b3a5';x.fillRect(0,0,256,256);
  for(let r=0;r<8;r++)for(let c=0;c<4;c++){const t=180+Math.random()*30|0;x.fillStyle=`rgb(${t},${t-5},${t-16})`;x.fillRect(c*64+((r%2)*32)%64+2,r*32+2,60,28);}
  x.fillStyle="rgba(0,0,0,.18)";for(let r=0;r<8;r++)x.fillRect(0,r*32,256,2);},true);t.repeat.set(rx,ry);return t;}

/* ---------------- Seoul facades ----------------
   The office blocks round Gwanghwamun are not Songdo's teal glass and precast flats. From the Kakao roadview: blue-grey
   curtain walls with a plain mullion grid, pale granite towers with punched windows, 1970s–80s concrete slabs with
   ribbon windows and fins (the US Embassy), Kyobo's bronze-and-blue bands, the Plaza Hotel's maroon, the Press
   Center's stone piers. Each is a 512 × 1024 canvas (16 floors of 64 px), appended to buildOSM's facade styles as
   6, 7, … (SEOUL_ST[k] is style 6 + k). `draw` paints the day texture, `lit` the windows that glow at night (256 × 512,
   half scale), `tint` the per-building colour variations. */
const grainOn=(x,n,a)=>{for(let i=0;i<n;i++){const v=Math.random()>0.5?255:0;x.fillStyle=`rgba(${v},${v},${v},${Math.random()*a})`;x.fillRect(Math.random()*512,Math.random()*1024,3,3);}};
// lit windows on a regular grid (half-scale canvas): cols × 16 floors, about `frac` of the floors lit, cells inset by `pad`
const litGrid=(x,cols,frac,pad,hue=40)=>{const cw=256/cols;
  for(let f=0;f<16;f++){if(Math.random()>frac)continue;
    for(let c=0;c<cols;c++)if(Math.random()<.55){x.globalAlpha=.4+Math.random()*.6;x.fillStyle=`hsl(${hue+Math.random()*14},${30+Math.random()*30}%,${58+Math.random()*20}%)`;x.fillRect(c*cw+pad,f*32+pad,cw-2*pad,32-2*pad);}}
  x.globalAlpha=1;};
export const SEOUL_ST=[
 // 6: blue-grey curtain wall — 1.5 m mullions, a dark spandrel at every 4 m floor, the sky caught panel by panel
 {tw:24,th:64,rough:.16,metal:.7,env:1.0,tint:[0xffffff,0xdfe8ef,0xc9d4dc,0xeef0f2,0xb4c3cd,0xd6dde3],
  draw(x){const g=x.createLinearGradient(0,0,300,1024);g.addColorStop(0,'#9fb4c3');g.addColorStop(.45,'#6f879a');g.addColorStop(1,'#4a5f70');x.fillStyle=g;x.fillRect(0,0,512,1024);
   for(let r=0;r<1024;r+=64)for(let c=0;c<512;c+=32){x.fillStyle=`rgba(${200+Math.random()*40|0},${215+Math.random()*30|0},235,${Math.random()*.16})`;x.fillRect(c+2,r+2,28,46);}
   for(let r=0;r<1024;r+=64){x.fillStyle='rgba(30,40,50,.72)';x.fillRect(0,r+48,512,16);x.fillStyle='rgba(255,255,255,.12)';x.fillRect(0,r+48,512,2);}
   x.fillStyle='#b9c3ca';for(let c=0;c<512;c+=32)x.fillRect(c,0,2,1024);grainOn(x,1500,.04);},
  lit(x){litGrid(x,16,.7,2,205);}},
 // 7: pale granite tower with punched windows — 3.5 m bays, deep reveals
 {tw:28,th:60,rough:.78,metal:.03,env:.2,tint:[0xffffff,0xf1ebe0,0xe4e4e2,0xdcd3c4,0xf6f3ee],
  draw(x){x.fillStyle='#d9d4ca';x.fillRect(0,0,512,1024);
   for(let r=0;r<1024;r+=32)for(let c=0;c<512;c+=64){const t=206+Math.random()*22|0;x.fillStyle=`rgb(${t},${t-4},${t-12})`;x.fillRect(c,r,64,32);}
   for(let r=0;r<1024;r+=64)for(let c=0;c<512;c+=64){x.fillStyle='rgba(0,0,0,.28)';x.fillRect(c+12,r+12,40,40);x.fillStyle='#34424f';x.fillRect(c+15,r+15,34,35);
     x.fillStyle='rgba(190,210,225,.22)';x.fillRect(c+15,r+15,34,9);x.fillStyle='#8c949b';x.fillRect(c+31,r+15,2,35);x.fillStyle='rgba(255,255,255,.35)';x.fillRect(c+12,r+52,40,3);}
   grainOn(x,4000,.06);},
  lit(x){litGrid(x,8,.55,5,38);}},
 // 8: concrete slab of the 1970s–80s — ribbon windows between beige spandrels, slim fins every 1.5 m (the US Embassy)
 {tw:24,th:56,rough:.72,metal:.04,env:.2,tint:[0xffffff,0xf3ead6,0xe8e6e0,0xddd3c2,0xf0e6da],
  draw(x){x.fillStyle='#ddd3c2';x.fillRect(0,0,512,1024);
   for(let r=0;r<1024;r+=64){x.fillStyle='#3e4b56';x.fillRect(0,r+8,512,34);x.fillStyle='rgba(180,200,215,.25)';x.fillRect(0,r+8,512,8);
     x.fillStyle='rgba(0,0,0,.25)';x.fillRect(0,r+42,512,4);x.fillStyle='#e9e2d4';for(let c=0;c<512;c+=32)x.fillRect(c,r+4,6,42);}
   grainOn(x,3000,.06);},
  lit(x){litGrid(x,16,.6,4,40);}},
 // 9: Kyobo — bands of bronze-brown spandrel and blue glass, thin dark mullions
 {tw:20,th:64,rough:.42,metal:.3,env:.6,tint:[0xffffff],
  draw(x){for(let r=0;r<1024;r+=64){x.fillStyle='#8a5f45';x.fillRect(0,r,512,26);x.fillStyle='rgba(0,0,0,.18)';x.fillRect(0,r+22,512,4);
     const g=x.createLinearGradient(0,r+26,0,r+64);g.addColorStop(0,'#7895b0');g.addColorStop(1,'#4f6d8a');x.fillStyle=g;x.fillRect(0,r+26,512,38);}
   x.fillStyle='rgba(30,30,35,.55)';for(let c=0;c<512;c+=16)x.fillRect(c,0,2,1024);grainOn(x,1800,.05);},
  lit(x){litGrid(x,32,.6,3,45);}},
 // 10: maroon slab with narrow vertical windows (the Plaza Hotel)
 {tw:22,th:56,rough:.7,metal:.05,env:.25,tint:[0xffffff],
  draw(x){x.fillStyle='#74413a';x.fillRect(0,0,512,1024);
   for(let c=0;c<512;c+=32){x.fillStyle='#2c2a2e';x.fillRect(c+11,0,10,1024);x.fillStyle='rgba(255,255,255,.08)';x.fillRect(c+9,0,2,1024);}
   for(let r=0;r<1024;r+=64){x.fillStyle='rgba(0,0,0,.18)';x.fillRect(0,r,512,3);}grainOn(x,2500,.06);},
  lit(x){for(let f=0;f<16;f++)for(let c=0;c<16;c++)if(Math.random()<.4){x.globalAlpha=.5+Math.random()*.5;x.fillStyle=`hsl(${36+Math.random()*10},60%,${60+Math.random()*15}%)`;x.fillRect(c*16+5,f*32+4,6,24);}x.globalAlpha=1;}},
 // 11: pale stone piers with dark recessed glass between (the Press Center, the newer granite towers)
 {tw:24,th:60,rough:.7,metal:.05,env:.3,tint:[0xffffff,0xece8e0,0xdedede],
  draw(x){x.fillStyle='#2f3b46';x.fillRect(0,0,512,1024);
   for(let r=0;r<1024;r+=64){x.fillStyle='#b8b6b0';x.fillRect(0,r+50,512,14);x.fillStyle='rgba(170,195,215,.18)';x.fillRect(0,r+2,512,14);}
   for(let c=0;c<512;c+=64){x.fillStyle='#d2cec6';x.fillRect(c,0,18,1024);x.fillStyle='rgba(0,0,0,.25)';x.fillRect(c+18,0,4,1024);x.fillStyle='rgba(255,255,255,.3)';x.fillRect(c,0,2,1024);}
   x.fillStyle='#8a939a';for(let c=40;c<512;c+=64)x.fillRect(c,0,2,1024);grainOn(x,2500,.05);},
  lit(x){litGrid(x,8,.6,5,42);}},
];
// the facade a plain (non-landmark) Seoul building wears: offices mostly glass or granite, older and lower blocks the
// ribbon-window concrete; retail keeps the stone-panel shopfront style (2) now and then
export function seoulStyle(kind,h,bi){const r=(bi*2654435761>>>0)%100;
  if(kind===2)return h>45?(r<55?6:r<80?7:11):(r<35?7:r<70?8:6);
  if(kind===3)return r<40?2:r<75?8:7;
  if(kind===4)return r<45?8:r<75?7:3;
  return null;}

/* an LED board facing (tx,tz) on a building footprint: a dark frame and the lit screen */
function ledBoard(pts,tx,tz,w,hgt,y,kind){const fe=C.edgeFacing(pts,tx,tz);if(!fe)return;const ww=Math.min(w,fe.len*0.85);
  const ry=Math.atan2(fe.nx,fe.nz);
  add(box(ww+1.2,hgt+1.2,0.6,M(0x1a1c20,.6,.3),fe.mx+fe.nx*0.4,y,fe.mz+fe.nz*0.4,ry));
  const m=new THREE.Mesh(new THREE.PlaneGeometry(ww,hgt),new THREE.MeshBasicMaterial({map:kind==='tall'?ledTextureTall():ledTexture(kind),toneMapped:false}));
  m.position.set(fe.mx+fe.nx*0.75,y,fe.mz+fe.nz*0.75);m.rotation.y=ry;C.scene.add(m);}
// a flat picture (banner) on a facade
function facadePicture(pts,tx,tz,tex,w,hgt,y,lit){const fe=C.edgeFacing(pts,tx,tz);if(!fe)return null;const ww=Math.min(w,fe.len*0.9);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(ww,hgt),lit?new THREE.MeshBasicMaterial({map:tex,toneMapped:false}):C.mat({map:tex,roughness:.8}));
  m.position.set(fe.mx+fe.nx*0.7,y,fe.mz+fe.nz*0.7);m.rotation.y=Math.atan2(fe.nx,fe.nz);C.scene.add(m);return fe;}

/* ---------------- landmark buildings (OSM landmark codes 41–72) ---------------- */
// returns true when the building is fully drawn here
export function seoulBuilding(ctx,pts,h,ar,kind,lm,bi){C=ctx;const {ringWalls,roofCap,W2}=C;
  const T=(rx,ry)=>W2(rx,ry); // raw metres → world
  if(kind===5&&!(lm>=61&&lm<=64)){if(ar>2600)return false;hanok(pts,h,ar,false);return true;} // (a huge "historic" outline is a museum or a compound, not one hall)
  switch(lm){
  case 61:{ // Gwanghwamun: a granite base pierced by three arched gateways (the middle one the king's), a crenellated
    // parapet, and the two-storey pavilion with its double roof — the Woldae terrace in front (see seoulScenery)
    const o=C.oba(pts),L=o.l1-o.l0,W=o.w1-o.w0,g=placed(o.mx,o.mz,o.ang),bh=6.2;
    const stone=C.mat({map:stoneTexture(7,1.5),roughness:.92,color:0xf2ede2});
    const base=new THREE.Mesh(new THREE.BoxGeometry(L,bh,W),stone);base.position.y=bh/2;g.add(base);
    for(const s of [-1,1])for(const [x,w,hh] of [[-L*0.27,3.6,4.4],[0,4.4,5.2],[L*0.27,3.6,4.4]]){
      const a=box(w,hh,0.2,M(0x14110e,.95),x,hh/2,s*(W/2+0.02));g.add(a);
      const arch=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2,0.2,16,1,false,0,Math.PI),M(0x14110e,.95));arch.rotation.x=Math.PI/2;arch.rotation.z=Math.PI/2;arch.position.set(x,hh,s*(W/2+0.02));g.add(arch);}
    // parapet: dark brick with tile coping, around the top of the base
    for(const s of [-1,1]){g.add(box(L,1.1,0.6,M(0x6b6a66,.9),0,bh+0.55,s*(W/2-0.3)));g.add(box(0.6,1.1,W,M(0x6b6a66,.9),s*(L/2-0.3),bh+0.55,0));}
    for(let k=0;k<14;k++){const x=-L/2+L*(k+0.5)/14;for(const s of [-1,1])g.add(box(1.2,0.5,0.8,M(TILE,.8),x,bh+1.35,s*(W/2-0.3)));}
    hanokStorey(g,L*0.62,W*0.64,bh,5.0,3.0,{ov:3.6,lift:1.5});
    hanokStorey(g,L*0.54,W*0.52,bh+5.0+0.9+3.0-0.6,3.4,5.2,{ov:3.6,lift:1.8});
    add(g);
    // night: the gate is floodlit warm
    if(!C.DAY){const l=new THREE.PointLight(0xffc98a,2.2,60,1.4);l.position.set(o.mx,10,o.mz+12);C.scene.add(l);}
    return true;}
  case 62:{ // Dongsipjagak: the palace's south-east corner watchtower, now alone on a traffic island — a tall granite
    // platform with a crenellated parapet and a square two-roofed pavilion
    const o=C.oba(pts),L=o.l1-o.l0,W=o.w1-o.w0,g=placed(o.mx,o.mz,o.ang);
    const stone=C.mat({map:stoneTexture(3,1.2),roughness:.92,color:0xf2ede2});const b=new THREE.Mesh(new THREE.BoxGeometry(L,4.8,W),stone);b.position.y=2.4;g.add(b);
    for(let k=0;k<8;k++){const t=-L/2+L*(k+0.5)/8;for(const s of [-1,1]){g.add(box(1,0.9,0.5,M(0x6b6a66,.9),t,5.25,s*(W/2-0.25)));g.add(box(0.5,0.9,1,M(0x6b6a66,.9),s*(L/2-0.25),5.25,t));}}
    hanokStorey(g,L*0.55,W*0.55,4.8,3.0,2.2,{ov:1.8,lift:0.8});hanokStorey(g,L*0.42,W*0.42,4.8+3+0.9+1.6,1.6,2.6,{ov:1.6,lift:0.9,walls:false});
    // the island of the rotary round it: a low hexagon of granite setts with a kerb (the circuit's inner barrier
    // stands ~1 m outside it)
    const isl=new THREE.Mesh(new THREE.CylinderGeometry(8.6,8.8,0.22,6),M(0xbdb6a6,.95));isl.position.y=0.11;isl.rotation.y=Math.PI/6;g.add(isl);
    g.userData.island=true;add(g);return true;}
  case 63:{ // Daehanmun, the main gate of Deoksugung: three bays on a granite step, hipped roof, red doors
    const o=C.oba(pts),L=o.l1-o.l0,W=o.w1-o.w0,g=placed(o.mx,o.mz,o.ang);platform(g,L+1,W+1,1.0);
    hanokStorey(g,L*0.86,W*0.6,1.0,5.4,3.6,{ov:2.6,lift:1.0,walls:false});
    for(let k=0;k<3;k++)g.add(box(L*0.86/3*0.8,4.6,0.25,M(0x8a2a20,.8),-L*0.86/3+k*L*0.86/3,1+2.3,0));
    add(g);return true;}
  case 64:{hanok(pts,7.5,ar,false);return true;} // Gijeonbijeon: the small monument pavilion at the Gwanghwamun junction
  case 41:{ // Sejong Center for the Performing Arts (1978): pale granite, and onto the square a colonnade of tall square
    // white piers in front of dark glazing, under a heavy flat cornice slab that juts out far over them (roadview);
    // the whole block wears a thick overhanging roof slab, and so do the lower wings either side
    const hh=h||(ar>4000?31:16),r=ringWalls(pts,[[0,1],[hh,1]],5,0xeee9de);
    const rim=ringWalls(pts.map(p=>[r.cx+(p[0]-r.cx)*1.035,r.cz+(p[1]-r.cz)*1.035]),[[hh-0.4,1],[hh+2.2,1]],3,0xe4e0d8);roofCap(rim.top,hh+2.2,0xc2beb6);
    const fe=C.edgeFacing(pts,...T(-104,-160));
    if(fe&&ar>4000){const ry=Math.atan2(fe.nx,fe.nz),ux=fe.nz,uz=-fe.nx,n=Math.floor(fe.len*0.8/7),ch=hh*0.8;
      add(box(fe.len*0.82,ch,0.4,M(0x262c33,.35,.4),fe.mx+fe.nx*0.6,ch/2,fe.mz+fe.nz*0.6,ry)); // the glazing behind the piers
      for(let k=0;k<n;k++){const t=(k-(n-1)/2)*7;add(box(2.0,ch,2.0,M(0xf1ede6,.8),fe.mx+ux*t+fe.nx*5.2,ch/2,fe.mz+uz*t+fe.nz*5.2,ry));}
      // the cornice slab over the colonnade: thick, flat, pale, its soffit a shade darker
      add(box(fe.len*0.9,2.8,10.5,M(0xe2ded6,.85),fe.mx+fe.nx*4.6,ch+1.4,fe.mz+fe.nz*4.6,ry));
      add(box(fe.len*0.88,0.3,10,M(0xbdb8ae,.9),fe.mx+fe.nx*4.6,ch-0.1,fe.mz+fe.nz*4.6,ry));
      sign(fe,'세종문화회관',hh*0.92,Math.min(30,fe.len*0.32),4,'#5a4a36',null,1);}
    return true;}
  case 42:{ // Kyobo Life Building (1980): bands of bronze-brown spandrel and blue glass all the way up (roadview), and the
    // Gwanghwamun poem board (geulpan) facing the junction
    const hh=h||87;const r=ringWalls(pts,[[0,1],[hh,1]],9,0xffffff);roofCap(r.top,hh,0x4a3e36);
    ringWalls(pts.map(p=>[r.cx+(p[0]-r.cx)*1.01,r.cz+(p[1]-r.cz)*1.01]),[[hh,1],[hh+1.6,1]],3,0x4d3f36);
    facadePicture(pts,...T(-70,-420),poemTexture(),24,12,13,!C.DAY); // floodlit after dark
    sign(C.edgeFacing(pts,...T(-70,-330)),'KYOBO',hh-5,22,5,'#ffffff',null,1);
    return true;}
  case 47:{ // Dong-A Media Center (2000): pale stone piers and glass, the round drum on the roof, and on the face to the
    // Gwanghwamun junction a giant portrait LED screen from the 3rd floor to near the top (roadview)
    const hh=h||103,r=ringWalls(pts,[[0,1],[hh,1]],11,0xf2f2f0);roofCap(r.top,hh,0x76808a);
    const cyl=new THREE.Mesh(new THREE.CylinderGeometry(9,9,6,28),M(0xd9dcdf,.5,.3));cyl.position.set(r.cx,hh+3,r.cz);add(cyl);
    add(box(4,0.2,4,M(0x3a8f4a,.8),r.cx,hh+6.15,r.cz));
    ledBoard(pts,...T(-95,-490),26,hh*0.62,10+hh*0.31,'tall'); // (on the west face, beside the rounded corner)sign(C.edgeFacing(pts,...T(-66,-430)),'동아일보',hh-6,20,5,'#ffffff',null,1);
    return true;}
  case 48:{ // Ilmin Museum of Art: the 1926 Dong-A Ilbo building — five storeys of cream stone, arched windows, cornice
    const hh=h||19,r=ringWalls(pts,[[0,1],[hh,1]],2,0xf1e3c4);roofCap(r.top,hh,0x8a8070);
    ringWalls(pts.map(p=>[r.cx+(p[0]-r.cx)*1.03,r.cz+(p[1]-r.cz)*1.03]),[[hh-1.4,1],[hh-0.4,1]],3,0xe2d6bb);return true;}
  case 50:{ // the Koreana Hotel corner: re-clad all in blue curtain-wall glass, its crest bowed up in a shallow curve along
    // the face to Sejong-daero, the name small on the crown (2026 roadview — the old LED board is gone)
    const hh=h||84,r=ringWalls(pts,[[0,1],[hh,1]],6,0xd6e4ee);roofCap(r.top,hh,0x5f6a72);
    const fe=C.edgeFacing(pts,...T(-30,-640));
    if(fe){const ry=Math.atan2(fe.nx,fe.nz),L=fe.len*0.96,sh=new THREE.Shape();sh.moveTo(-L/2,0);
      for(let k=0;k<=12;k++){const t=k/12;sh.lineTo(-L/2+L*t,3.2*Math.sin(Math.PI*t));}sh.lineTo(L/2,0);sh.closePath();
      const crest=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.6,bevelEnabled:false}).translate(0,0,-0.3),M(0x9fb6c8,.2,.6));
      crest.position.set(fe.mx-fe.nx*0.3,hh,fe.mz-fe.nz*0.3);crest.rotation.y=ry;add(crest);
      sign(fe,'KOREANA',hh-3,12,2.4,'#ffffff',null,1);}
    return true;}
  case 55:{ // Gwanghwamun Building: a white stone tower with a glass bay, the duty-free store's LED wall on the corner
    // facing the junction
    const hh=h||85,r=ringWalls(pts,[[0,1],[hh,1]],7,0xf6f3ee);roofCap(r.top,hh,0x6d747c);
    ledBoard(pts,...T(-64,-420),20,26,22,1);return true;}
  case 51:{ // Korea Press Center (1985): pale grey stone piers running the full height with dark glass recessed between
    // them (roadview), the newspaper's name on the crown
    const hh=h||86,r=ringWalls(pts,[[0,1],[hh,1]],11,0xffffff);roofCap(r.top,hh,0x8a8a86);
    sign(C.edgeFacing(pts,...T(-68,-720)),'서울신문',hh-5,20,5,'#2a3640',null,1);return true;}
  case 52:{ // Seoul City Hall (2012): the glass "wave" — the whole block leans out over the plaza as it rises and its
    // crest overhangs the old hall, solar glazing on the sloping back
    const hh=h||48,fe=C.edgeFacing(pts,...T(-30,-905));const nx=fe?fe.nx:0,nz=fe?fe.nz:1;
    const rings=[];for(let k=0;k<=8;k++){const t=k/8,lean=Math.pow(t,2.2)*11;rings.push([hh*t,1,0,nx*lean,nz*lean]);}
    const r=ringWalls(pts,rings,6,0xd2e2ea);roofCap(r.top,hh,0x5d7484);
    return true;}
  case 54:{ // The Plaza hotel (1976): a maroon slab of narrow vertical windows over Seoul Plaza, its name on the crown
    const hh=h||87,r=ringWalls(pts,[[0,1],[hh,1]],10,0xffffff);roofCap(r.top,hh,0x4b3a36);
    ringWalls(pts.map(p=>[r.cx+(p[0]-r.cx)*1.01,r.cz+(p[1]-r.cz)*1.01]),[[hh-0.2,1],[hh+1.4,1]],3,0x5a3631);
    sign(C.edgeFacing(pts,...T(-10,-960)),'THE PLAZA',hh-5,20,4,'#f2e6c8',null,1);return true;}
  case 53:{ // Seoul Metropolitan Library — the 1926 City Hall: grey granite, rows of tall windows, the central clock
    // tower, the big banner
    const hh=h||18,o=C.oba(pts),r=ringWalls(pts,[[0,1],[hh,1]],7,0xe2ddd2);roofCap(r.top,hh,0x6f6a62);
    const tw=box(9,12,9,M(0xd2c9b6,.9),r.cx,hh+6,r.cz);add(tw);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(3,6.4,4,4),M(0x4f5a5c,.6,.3));cap.position.set(r.cx,hh+14,r.cz);cap.rotation.y=Math.PI/4+o.ang;add(cap);
    const fe=C.edgeFacing(pts,...T(-30,-905));
    if(fe){const ry=Math.atan2(fe.nx,fe.nz),ux=fe.nz,uz=-fe.nx;
      const clock=new THREE.Mesh(new THREE.CircleGeometry(1.6,24),new THREE.MeshBasicMaterial({color:0xf4f0e2}));
      const d=Math.hypot(fe.mx-r.cx,fe.mz-r.cz);clock.position.set(r.cx+fe.nx*4.6,hh+8,r.cz+fe.nz*4.6);clock.rotation.y=ry;C.scene.add(clock);
      facadePicture(pts,...T(-30,-905),bannerTexture(['함께 달리는 서울','SEOUL GRAND PRIX']),18,6.5,hh*0.55,false);}
    return true;}
  case 57:{ // Twin Tree Towers (2010): two trunks of dark blue-grey glass ringed by thin pale floor edges, every floor's
    // outline swaying a little off the one below like growth rings (roadview from the Dongsipjagak rotary)
    const hh=h||62,nf=Math.round(hh/3.7);let y=0;
    for(let f=0;f<nf;f++){const s=1+0.045*Math.sin(f*0.55+bi),t=0.03*Math.sin(f*0.37+bi*2);
      ringWalls(pts,[[y,s,t],[y+3.1,s,t]],6,0xa9b9c6);ringWalls(pts,[[y+3.1,s*1.015,t],[y+3.7,s*1.015,t]],5,0xd4d8dc);y+=3.7;}
    const r=ringWalls(pts,[[y,1],[y+0.5,1]],5,0xffffff);roofCap(r.top,y+0.5,0xe9e9e9);return true;}
  case 65:{ // Jongno Tower (1999): a glass body on three cores, a gap, and the square "Top Cloud" crown ring held above it
    const hh=h||133,o=C.oba(pts),bodyH=hh*0.7,S=Math.min(o.l1-o.l0,o.w1-o.w0)*0.8;
    const r=ringWalls(pts,[[0,1],[bodyH,1]],6,0xaebdc8);roofCap(r.top,bodyH,0x6a737a);
    for(let k=0;k<3;k++){const a=k/3*Math.PI*2+o.ang,c=new THREE.Mesh(new THREE.CylinderGeometry(3,3,hh-bodyH,14),M(0xcfd5da,.4,.5));
      c.position.set(r.cx+Math.cos(a)*S*0.3,bodyH+(hh-bodyH)/2,r.cz+Math.sin(a)*S*0.3);add(c);}
    const g=placed(r.cx,r.cz,o.ang);const yy=hh-9;
    for(const s of [-1,1]){g.add(box(S,9,4,M(0x8fa6b6,.15,.7),0,yy,s*(S/2-2)));g.add(box(4,9,S,M(0x8fa6b6,.15,.7),s*(S/2-2),yy,0));}
    g.add(box(S+1,0.8,S+1,M(0xd5dbe0,.5,.4),0,yy+4.8,0));add(g);return true;}
  case 45:{ // US Embassy (1961): eight storeys of beige concrete, ribbon windows between slim vertical fins, plant rooms
    // on the roof and the flag; at its foot the white security wall and the police buses' steel canopy (roadview)
    const hh=h||27,r=ringWalls(pts,[[0,1],[hh,1]],8,0xffffff);roofCap(r.top,hh,0x8a8274);
    const pr=ringWalls(pts.map(p=>[r.cx+(p[0]-r.cx)*0.45,r.cz+(p[1]-r.cz)*0.45]),[[hh,1],[hh+3.6,1]],8,0xf0ebe2);roofCap(pr.top,hh+3.6,0x9a9488);
    add(box(0.25,8,0.25,M(0xdddddd,.5,.5),r.cx,hh+4,r.cz));
    const fe=C.edgeFacing(pts,...T(-64,-89));
    if(fe){const ry=Math.atan2(fe.nx,fe.nz),ux=fe.nz,uz=-fe.nx,L=Math.min(30,fe.len*0.55),cx=fe.mx+fe.nx*7,cz=fe.mz+fe.nz*7;
      add(box(L,0.5,8,M(0xe9ecee,.5,.4),cx,5.6,cz,ry));add(box(L,0.9,0.25,M(0xd5d9dc,.5,.5),cx+fe.nx*4,5.2,cz+fe.nz*4,ry));
      for(let q=-L/2+1;q<=L/2-1;q+=L/4)for(const s of [-3.5,3.5])add(box(0.3,5.4,0.3,M(0xe9ecee,.5,.4),cx+ux*q+fe.nx*s,2.7,cz+uz*q+fe.nz*s,ry));
      add(box(fe.len*0.9,2.6,0.4,M(0xf3f3f1,.8),fe.mx+fe.nx*11.5,1.3,fe.mz+fe.nz*11.5,ry));} // the security wall
    return true;}
  case 46:{ // National Museum of Korean Contemporary History: white horizontal louvres over the old ministry block
    const hh=h||32,r=ringWalls(pts,[[0,1],[hh,1]],3,0xf6f6f4);roofCap(r.top,hh,0xbfc2c4);return true;}
  case 43:case 44:case 49:case 58:case 59:case 67:case 72:{ // glass offices of the CBD (KT, SFC, D Tower, Gran Seoul, Hana, SK)
    const hh=h||90,tint={43:0xd4e2ec,44:0xe2eaee,49:0xc4d4d0,58:0xd0dde4,59:0xc6d0d8,67:0xd8e2e8,72:0xaebccb}[lm];
    const r=ringWalls(pts,[[0,1],[hh*0.94,1],[hh,0.96]],6,tint);roofCap(r.top,hh,0x5c646b);
    if(lm===43||lm===44)sign(C.edgeFacing(pts,...T(lm===43?-64:20,lm===43?-200:-150)),'kt',hh-6,9,5,'#e4002b',null,1);
    // KT Gwanghwamun West: two big white billboards on its face to Sejong-daero (roadview)
    if(lm===43){const tex=bannerTexture(['SEOUL GRAND PRIX','광화문 · 2026'],'#f6f8fa','#1b4fa0');
      facadePicture(pts,...T(-64,-215),tex,Math.min(30,hh*0.55),hh*0.24,hh*0.5,true);} // (back-lit, bright by day too)
    if(hh>100)C.beacons.push([r.cx,hh+1,r.cz]);
    return true;}
  }
  return false;}

/* ---------------- the street-level scenery ---------------- */
export function seoulScenery(ctx){C=ctx;const {D,W2,SC}=C;const T=(x,y)=>W2(x,y);
  const inCg=cgTest(D);
  /* ---- Cheonggyecheon: a channel ~5 m below the street between granite retaining walls, a walkway along each
     bank at the bottom, reeds and planting, the stream in the middle with stepping stones and footbridges ---- */
  if(D.cg&&D.cg.length){const P=[];for(let k=0;k<D.cg.length;k+=2)P.push(T(D.cg[k],D.cg[k+1]));
    const DEPTH=5.2,floorY=-DEPTH;
    const sub=m=>{m.renderOrder=-300;return m;}; // drawn before the street layers, which then cover all but the opening
    // floor (planted banks)
    const sh=new THREE.Shape(P.map(([x,z])=>new THREE.Vector2(x,-z)));
    const fl=new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI/2),C.mat({color:C.DAY?0x5f6f48:0x2a3426,roughness:1}));fl.position.y=floorY;C.scene.add(sub(fl));
    // walls
    {const pos=[],uv=[];let u=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        pos.push(a[0],0,a[1],b[0],0,b[1],b[0],floorY,b[1],a[0],0,a[1],b[0],floorY,b[1],a[0],floorY,a[1]);
        uv.push(u/8,1,(u+l)/8,1,(u+l)/8,1-DEPTH/8,u/8,1,(u+l)/8,1-DEPTH/8,u/8,1-DEPTH/8);u+=l;}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
      const tex=stoneTexture();const w=new THREE.Mesh(g,C.mat({map:tex,roughness:.95,side:THREE.DoubleSide,color:C.DAY?0xffffff:0x8a8a8a}));C.scene.add(sub(w));}
    // walkways along the bottom (granite slabs), from the OSM footpaths below street level
    {const geos=[];for(const l of D.lw){const pts=[];for(let k=0;k<l.length;k+=2)pts.push(T(l[k],l[k+1]));if(pts.length<2)continue;
        if(!inCg(...pts[0])&&!inCg(...pts[pts.length-1]))continue;geos.push(ribbon(pts,3.4));}
      if(geos.length){const m=new THREE.Mesh(C.mergeGeometries(geos),C.mat({color:C.DAY?0xc8c2b4:0x5d5a54,roughness:.95,side:THREE.DoubleSide}));m.position.y=floorY+0.06;C.scene.add(sub(m));}}
    // the stream itself
    {const wm=C.DAY?C.mat({color:0x3d6a72,metalness:.3,roughness:.12,envMap:C.skyEnv,envMapIntensity:.9}):C.mat({color:0x102a3a,metalness:.6,roughness:.12,envMap:C.envTex,envMapIntensity:.6});
      for(const p of D.w){const pts=[];for(let k=0;k<p.length;k+=2)pts.push(T(p[k],p[k+1]));if(!inCg(...pts[0])&&!inCg(...pts[Math.floor(pts.length/2)]))continue;
        const m=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x,z])=>new THREE.Vector2(x,-z)))).rotateX(-Math.PI/2),wm);m.position.y=floorY+0.25;C.scene.add(sub(m));}}
    // stepping stones
    {const geos=[];for(const f of D.ford){const pts=[];for(let k=0;k<f.length;k+=2)pts.push(T(f[k],f[k+1]));
        for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let s=0;s<l;s+=1.3){const t=s/l;
          geos.push(new THREE.BoxGeometry(0.9,0.55,0.8).translate(a[0]+(b[0]-a[0])*t,floorY+0.3,a[1]+(b[1]-a[1])*t));}}}
      if(geos.length)C.scene.add(sub(new THREE.Mesh(C.mergeGeometries(geos),C.mat({color:0xbab4a6,roughness:.9}))));}
    // reeds along the water's edge (instanced blades)
    {const pos=[];for(const p of D.w){const pts=[];for(let k=0;k<p.length;k+=2)pts.push(T(p[k],p[k+1]));if(!inCg(...pts[0]))continue;
        for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let s=0;s<l;s+=0.7)if(Math.random()<0.7)pos.push([a[0]+(b[0]-a[0])*s/l,a[1]+(b[1]-a[1])*s/l]);}}
      const im=new THREE.InstancedMesh(new THREE.ConeGeometry(0.22,1.1,4).translate(0,0.55,0),C.mat({color:C.DAY?0x7d8f4a:0x2c3a22,roughness:1}),pos.length);
      const m4=new THREE.Matrix4();pos.forEach(([x,z],k)=>{const s=0.7+Math.random()*0.7;m4.makeScale(s,s*(0.8+Math.random()*0.8),s);m4.setPosition(x,floorY+0.1,z);im.setMatrixAt(k,m4);});C.scene.add(sub(im));}
    // the head of the stream at Cheonggye Plaza: a two-step waterfall into the pool
    {const head=P.reduce((a,b)=>a[0]<b[0]?a:b);const fall=new THREE.Mesh(new THREE.PlaneGeometry(10,DEPTH*0.9),C.DAY?C.mat({color:0xe8f2f4,roughness:.2,metalness:.1,transparent:true,opacity:.8}):new THREE.MeshBasicMaterial({color:0x7fb8d8,transparent:true,opacity:.8}));
      fall.position.set(head[0]+1.2,floorY+DEPTH*0.5,head[1]+0.5);fall.rotation.y=Math.PI/2;C.scene.add(sub(fall));}
    // the railing at street level round the opening (the circuit's own barrier where the track runs alongside)
    {const posts=[],rails=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        for(let s=0;s<l;s+=2.4){const x=a[0]+(b[0]-a[0])*s/l,z=a[1]+(b[1]-a[1])*s/l;if(C.blocked(x,z,-2)||nearRoadCrossing(D,x,z))continue;posts.push([x,z]);}
        if(l>0.5&&!C.blocked((a[0]+b[0])/2,(a[1]+b[1])/2,-2)&&!nearRoadCrossing(D,(a[0]+b[0])/2,(a[1]+b[1])/2))rails.push(new THREE.BoxGeometry(l,0.08,0.08).rotateY(-Math.atan2(b[1]-a[1],b[0]-a[0])).translate((a[0]+b[0])/2,1.1,(a[1]+b[1])/2));}
      const pm=C.mat({color:0x5d646b,roughness:.5,metalness:.5});
      if(posts.length){const im=new THREE.InstancedMesh(new THREE.BoxGeometry(0.1,1.1,0.1).translate(0,0.55,0),pm,posts.length);const m4=new THREE.Matrix4();posts.forEach(([x,z],k)=>{m4.makeTranslation(x,0,z);im.setMatrixAt(k,m4);});C.scene.add(im);}
      if(rails.length)C.scene.add(new THREE.Mesh(C.mergeGeometries(rails),pm));}
    /* ---- the bridges ---- */
    // road bridges (Gwanggyo on Namdaemun-ro and the others downstream): a deck slab under the road with a granite
    // fascia, a low arch on each face and stone parapets with lamp posts
    for(const r of D.r){if(r[1]>3)continue;const pts=[];for(let k=2;k<r.length;k+=2)pts.push(T(r[k],r[k+1]));
      const dense=densify(pts,2);let run=[];
      const flush=()=>{if(run.length>=3){const a=run[0],b=run[run.length-1];if(!C.blocked((a[0]+b[0])/2,(a[1]+b[1])/2,-1))roadBridge(a,b,r[0]+3,floorY);}run=[];};
      for(const p of dense){if(inCg(p[0],p[1]))run.push(p);else flush();}flush();}
    // footbridges: Gwangtonggyo (the restored granite bridge of 1410) and the light steel-and-timber crossings
    for(const f of D.sfb){const pts=[];for(let k=1;k<f.length;k+=2)pts.push(T(f[k],f[k+1]));const a=pts[0],b=pts[pts.length-1];
      if(!inCg((a[0]+b[0])/2,(a[1]+b[1])/2))continue;const raw=f[1];
      if(raw>260&&raw<275)stoneBridge(a,b,f[0]+6,floorY);else footBridge(a,b,f[0],floorY);}
    // Mojeongyo: the circuit's own crossing — the deck under the track between its barriers, granite fascia and an arch
    {const {X,Z,TX,TZ,WL,WR,N}=C;let run=[];
      const flush=()=>{if(run.length>=3){const i0=run[0],i1=run[run.length-1];const a=[X[i0],Z[i0]],b=[X[i1],Z[i1]];
          const w=Math.max(...run.map(i=>WL[i]+WR[i]))+2.4;roadBridge(a,b,w,floorY,true);}run=[];};
      for(let i=0;i<N;i++){if(inCg(X[i],Z[i]))run.push(i);else flush();}flush();}
  }
  /* ---- Gwanghwamun Square ---- */
  // the paving: pale granite setts
  {const tex=C.canvasTex(256,256,(x)=>{x.fillStyle='#d7d2c6';x.fillRect(0,0,256,256);
      for(let r=0;r<16;r++)for(let c=0;c<8;c++){const t=200+Math.random()*30|0;x.fillStyle=`rgb(${t},${t-3},${t-10})`;x.fillRect(c*32+(r%2)*16+1,r*16+1,30,14);}},true);
    // (the square itself is mapped as a pedestrian street, not an area: its outline from the skyview — between the
    // Sejong Center pavement and the southbound carriageway, from the Gwanghwamun junction to the Woldae)
    const geos=[];for(const p of [...D.sq,[-127,-401,-82,-401,-82,98,-127,98]]){const pts=[];for(let k=0;k<p.length;k+=2)pts.push(new THREE.Vector2(p[k]*SC,p[k+1]*SC));if(pts.length<3)continue;
      const g=new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI/2),pa=g.attributes.position,uv=g.attributes.uv;for(let k=0;k<pa.count;k++)uv.setXY(k,pa.getX(k)/8,pa.getZ(k)/8);geos.push(g);}
    if(geos.length){const m=new THREE.Mesh(C.mergeGeometries(geos),C.mat({map:tex,roughness:.9,color:C.DAY?0xffffff:0x8a8a8a,...C.po(0.12)}));m.position.y=-0.13;m.receiveShadow=true;C.groundLayer(m);C.scene.add(m);}}
  // King Sejong (2009): the gilded bronze king seated on his throne, 6.2 m, on a 4.2 m granite base, facing south; in
  // front of him the armillary sphere (honcheonui), the rain gauge (cheugugi) and the sundial (angbuilgu)
  {const [x,z]=T(-96,-124),g=placed(x,z,0);const gm=M(GOLDBRONZE,.35,.75,{envMap:C.DAY?C.skyEnv:C.envTex,envMapIntensity:1});
    g.add(box(10,1.2,8,M(GRANITE,.9),0,0.6,0));g.add(box(8,3.4,6,M(0xb7b0a2,.85),0,2.9,0));
    g.add(box(5.4,1.8,4,gm,0,5.5,-0.3)); // throne seat
    g.add(box(5,3.6,0.8,gm,0,7.6,-2)); // throne back
    const robe=new THREE.Mesh(new THREE.CylinderGeometry(1.5,2.4,3.6,12),gm);robe.position.set(0,7.8,0.2);g.add(robe);
    const knees=box(3.6,1.2,2.2,gm,0,6.9,1.4);g.add(knees);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.75,14,10),gm);head.position.set(0,10.2,0.2);g.add(head);
    g.add(box(1.4,0.8,1.4,gm,0,10.9,0.1)); // ikseongwan crown
    const book=box(1.3,0.15,0.9,gm,0.5,8.0,1.8);book.rotation.x=-0.6;g.add(book);
    // the three instruments (south of the statue)
    const [ax,az]=T(-96,-151),arm=new THREE.Group();arm.position.set(ax-x,0,az-z);
    arm.add(box(2,1,2,M(GRANITE,.9),0,0.5,0));for(let k=0;k<3;k++){const t=new THREE.Mesh(new THREE.TorusGeometry(1.1,0.06,6,28),M(BRONZE,.4,.7));t.position.y=2.3;t.rotation.set(k*1.05,k*0.6,0);arm.add(t);}g.add(arm);
    const [cx2,cz2]=T(-96,-147);const cg=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.9,12),M(BRONZE,.4,.7));cg.position.set(cx2-x,1.55,cz2-z);g.add(cg);g.add(box(1,1.1,1,M(GRANITE,.9),cx2-x,0.55,cz2-z));
    const [sx,sz]=T(-96,-143);const bowl=new THREE.Mesh(new THREE.SphereGeometry(0.8,16,8,0,Math.PI*2,Math.PI/2,Math.PI/2),M(BRONZE,.4,.7,{side:THREE.DoubleSide}));bowl.position.set(sx-x,1.9,sz-z);g.add(bowl);g.add(box(1.2,1.1,1.2,M(GRANITE,.9),sx-x,0.55,sz-z));
    add(g);}
  // Admiral Yi Sun-sin (1968): the 6.5 m bronze admiral with his sword on a 10.5 m pedestal, the turtle ship in front
  // and the Myeongnyang fountain round it
  {const [x,z]=T(-93,-337),g=placed(x,z,0);const bm=M(0x3e3a30,.45,.6,{envMap:C.DAY?C.skyEnv:C.envTex,envMapIntensity:.7});
    g.add(box(9,1,9,M(GRANITE,.9),0,0.5,0));g.add(box(6.5,2.5,6.5,M(0xbdb5a5,.85),0,2.25,0));
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(1.9,2.6,8,4),M(0xc9c1b1,.85));ped.rotation.y=Math.PI/4;ped.position.y=7.5;g.add(ped);
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.3,4.6,10),bm);body.position.y=13.8;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.55,12,8),bm);head.position.y=16.6;g.add(head);
    g.add(box(1.0,0.5,1.0,bm,0,17.2,0)); // helmet
    const sword=box(0.12,4.4,0.12,bm,0.5,14,0.9);g.add(sword);
    // the turtle ship (geobukseon) model in front
    const ship=new THREE.Group();ship.position.set(0,0,9);ship.add(box(3.6,0.8,1.6,M(0x5a3a26,.8),0,0.6,0));
    const shell=new THREE.Mesh(new THREE.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI/2),M(0x3d4a3f,.7,.2));shell.scale.set(1.8,0.6,0.8);shell.position.y=1;ship.add(shell);
    const dh=new THREE.Mesh(new THREE.SphereGeometry(0.35,8,6),M(0x8a3c22,.7));dh.position.set(1.9,1.2,0);ship.add(dh);g.add(ship);
    // fountain basin: a dark granite floor and rows of jets
    g.add(box(30,0.06,14,M(0x6d6a64,.4),0,0.03,0));
    const jets=[];for(let k=0;k<24;k++)jets.push(new THREE.CylinderGeometry(0.06,0.12,1.2+Math.random()*1.2,5).translate(-14+k*1.2,0.8,k%2?6:-6));
    g.add(new THREE.Mesh(C.mergeGeometries(jets),C.mat({color:0xe8f4f8,roughness:.2,transparent:true,opacity:.7})));
    add(g);}
  // the Woldae: the restored royal terrace (2023) in front of Gwanghwamun — granite, a stone balustrade round it and
  // the raised royal path (eodo) up the middle; the Haechi guardians at its front corners
  {const [x0,z0]=T(-118,207),[x1,z1]=T(-88,158),w=Math.abs(x1-x0),d=Math.abs(z1-z0),cx=(x0+x1)/2,cz=(z0+z1)/2,g=placed(cx,cz,0);
    const stone=C.mat({map:stoneTexture(8,0.4),roughness:.92,color:0xf4efe4});const t=new THREE.Mesh(new THREE.BoxGeometry(w,1.0,d),stone);t.position.y=0.5;g.add(t);
    g.add(box(4.2,0.25,d,M(0xd8d1c2,.9),0,1.12,0)); // eodo
    for(const s of [-1,1]){g.add(box(0.25,0.7,d,M(0xe1dbcf,.9),s*(w/2-0.2),1.35,0));
      for(let q=-d/2;q<=d/2;q+=2.4)g.add(box(0.35,1.0,0.35,M(0xe1dbcf,.9),s*(w/2-0.2),1.5,q));}
    for(const s of [-1,1])g.add(box(w/2-3,0.7,0.25,M(0xe1dbcf,.9),s*(w/4+1.5),1.35,d/2-0.2));
    add(g);
    for(const [hx,hy] of [[-126,159],[-86,157]]){const [x,z]=T(hx,hy),h=placed(x,z,0);h.add(box(2.4,1.6,3.2,M(GRANITE,.9),0,0.8,0));
      const b=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),M(0xd8d2c4,.9));b.scale.set(0.9,1.1,1.4);b.position.set(0,2.6,0.2);h.add(b);
      const hd=new THREE.Mesh(new THREE.SphereGeometry(0.75,12,8),M(0xd8d2c4,.9));hd.position.set(0,3.7,1.1);h.add(hd);add(h);}}
  // Gyeongbokgung's south wall either side of Gwanghwamun (granite footing, plastered wall, tiled coping), returning
  // north along Samcheong-ro and Hyoja-ro; the other palace walls (Deoksugung's stone wall) come from OpenStreetMap.
  // East of the gate it no longer reaches Dongsipjagak: it cuts the corner north-east along the road west of the
  // rotary and only then turns north up Samcheong-ro (Kakao skyview)
  const walls=[[[-120,213],[-306,219],[-306,900]],[[-89,214],[85,224.5],[120.5,274],[121,900]]].map(l=>({h:5.2,pts:l.map(p=>T(...p))}));
  for(const w of D.wl||[]){const pts=[];for(let k=1;k<w.length;k+=2)pts.push(T(w[k],w[k+1]));walls.push({h:Math.min(w[0],4.2),pts});}
  {const geos={f:[],w:[],c:[]};for(const {h,pts} of walls)for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];const l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<0.5)continue;
      const ry=-Math.atan2(b[1]-a[1],b[0]-a[0]),mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
      if(C.blocked(mx,mz,-1))continue;
      geos.f.push(new THREE.BoxGeometry(l,1.4,1.3).rotateY(ry).translate(mx,0.7,mz));
      geos.w.push(new THREE.BoxGeometry(l,h-1.4,1.0).rotateY(ry).translate(mx,1.4+(h-1.4)/2,mz));
      geos.c.push(new THREE.BoxGeometry(l+0.2,0.6,1.8).rotateY(ry).translate(mx,h+0.2,mz));}
    if(geos.f.length){C.scene.add(new THREE.Mesh(C.mergeGeometries(geos.f),M(GRANITE,.9)));C.scene.add(new THREE.Mesh(C.mergeGeometries(geos.w),M(0xc9a98a,.95)));
      C.scene.add(new THREE.Mesh(C.mergeGeometries(geos.c),M(TILE,.8)));}}
  // "Spring" (Claes Oldenburg & Coosje van Bruggen, 2006): the 20 m spiral shell in Cheonggye Plaza, red and blue
  {const [x,z]=T(-20,-532),g=placed(x,z,0);const pts=[];for(let k=0;k<=160;k++){const t=k/160,a=t*Math.PI*9,r=4.2*(1-t)+0.4;pts.push(new THREE.Vector3(Math.cos(a)*r,1+t*19,Math.sin(a)*r));}
    const crv=new THREE.CatmullRomCurve3(pts);
    const red=new THREE.Mesh(new THREE.TubeGeometry(crv,240,0.55,8,false),M(0xc8202a,.45,.2));g.add(red);
    const pts2=pts.map(p=>p.clone().multiplyScalar(0.92).setY(p.y-0.5));const blue=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2),240,0.42,8,false),M(0x1f4fa8,.45,.2));g.add(blue);
    g.add(box(9,0.4,9,M(0x7a756c,.6),0,0.2,0));add(g);}
}

/* ---------------- far scenery: N Seoul Tower on Namsan ---------------- */
export function seoulSky(ctx){C=ctx;const {TR}=C;
  if(TR.namsanTower){const [x,z]=C.rw(...TR.namsanTower),hill=(TR.hills||[]).find(h=>Math.hypot(h[0]-TR.namsanTower[0],h[1]-TR.namsanTower[1])<200),base=hill?hill[2]-4:220;
    const g=new THREE.Group();g.position.set(x,base,z);const wm=M(0xeceeef,.6),lit=!C.DAY;
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(3.4,6.5,125,16),wm);shaft.position.y=62.5;g.add(shaft);
    for(const [y,r,hh] of [[126,12,4],[131,13.5,6],[137,12.5,5],[142,9,3]]){const d=new THREE.Mesh(new THREE.CylinderGeometry(r,r,hh,24),lit&&y===131?new THREE.MeshBasicMaterial({color:0xfff1c8}):M(0xd9dde0,.4,.3));d.position.y=y;g.add(d);}
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(1.0,2.2,90,10),M(0xe6e6e6,.6));mast.position.y=188;g.add(mast);
    for(let k=0;k<6;k++){const b=new THREE.Mesh(new THREE.CylinderGeometry(1.4-k*0.12,1.6-k*0.12,6,10),lit?new THREE.MeshBasicMaterial({color:[0xff4060,0x40a0ff,0xffd040][k%3]}):M(0xc8202a,.6));b.position.y=150+k*13;g.add(b);}
    C.scene.add(g);}}

/* ---------------- animation: LED boards change frame every 6 s ---------------- */
export function seoulTick(t){for(const l of leds){const f=Math.floor((t+l.phase)/6)%4;if(f!==l.frame){l.frame=f;l.tex.offset.y=0.75-f*0.25;}}}

/* ---------------- helpers ---------------- */
function cgTest(D){if(!D.cg||!D.cg.length)return ()=>false;const P=[];for(let k=0;k<D.cg.length;k+=2)P.push(C.W2(D.cg[k],D.cg[k+1]));
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [x,z] of P){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  return (x,z)=>{if(x<x0||x>x1||z<z0||z>z1)return false;let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const [xi,zi]=P[i],[xj,zj]=P[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}return c;};}
let _cross=null;
// is (x,z) where a road or footbridge spans the channel (no railing there)
function nearRoadCrossing(D,x,z){if(!_cross){_cross=[];const inCg=cgTest(D);
    for(const r of D.r){if(r[1]>3)continue;const pts=[];for(let k=2;k<r.length;k+=2)pts.push(C.W2(r[k],r[k+1]));for(const p of densify(pts,2))if(inCg(p[0],p[1]))_cross.push([p[0],p[1],r[0]/2+2]);}
    for(const f of D.sfb){const pts=[];for(let k=1;k<f.length;k+=2)pts.push(C.W2(f[k],f[k+1]));for(const p of densify(pts,1))_cross.push([p[0],p[1],f[0]/2+1.5]);}}
  for(const [cx,cz,r] of _cross)if(Math.hypot(cx-x,cz-z)<r+1.5)return true;return false;}
function densify(pts,step){const o=[pts[0]];for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));for(let j=1;j<=n;j++)o.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}return o;}
function ribbon(pts,w){const pos=[],ix=[];for(let k=0;k<pts.length;k++){const a=pts[Math.max(0,k-1)],b=pts[Math.min(pts.length-1,k+1)];let dx=b[0]-a[0],dz=b[1]-a[1];const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
    pos.push(pts[k][0]+dz*w/2,0,pts[k][1]-dx*w/2,pts[k][0]-dz*w/2,0,pts[k][1]+dx*w/2);if(k<pts.length-1){const o=k*2;ix.push(o,o+2,o+1,o+1,o+2,o+3);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();return g;}
// a road bridge across the channel from a to b (world), deck width w: the slab, the granite fascia with a shallow arch
// on each face, and (unless the circuit's barriers already line it) stone parapets and lamps
function roadBridge(a,b,w,floorY,circuit=false){const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)+2,ry=-Math.atan2(dz,dx),mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
  const g=placed(mx,mz,ry);const stone=C.mat({map:stoneTexture(),roughness:.9,color:0xf0ebe0});
  // the body: deck and abutments in one piece, its underside a shallow segmental arch (extruded across the deck)
  {const sh=new THREE.Shape(),ab=1.4,crown=-1.3,spring=floorY+1.6;sh.moveTo(-l/2,-0.04);sh.lineTo(l/2,-0.04);sh.lineTo(l/2,floorY);sh.lineTo(l/2-ab,floorY);
    for(let k=0;k<=16;k++){const t=k/16,x=(l/2-ab)*(1-2*t),y=spring+(crown-spring)*Math.sin(Math.PI*t);sh.lineTo(x,y);}
    sh.lineTo(-l/2,floorY);sh.closePath();
    const eg=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false}).translate(0,0,-w/2),uv=eg.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)/4,uv.getY(k)/4);
    g.add(new THREE.Mesh(eg,stone));}
  for(const s of [-1,1]){
    if(!circuit){g.add(box(l,1.0,0.5,stone,0,0.5,s*(w/2-0.25)));for(const e of [-1,1]){g.add(box(0.7,1.4,0.7,M(GRANITE_D,.9),e*(l/2-0.4),0.7,s*(w/2-0.25)));
        const lamp=box(0.12,4,0.12,M(0x2f3338,.5,.5),e*(l/2-0.4),3,s*(w/2-0.25));g.add(lamp);
        const head=new THREE.Mesh(new THREE.SphereGeometry(0.35,10,8),C.DAY?M(0xf4f1e8,.4):new THREE.MeshBasicMaterial({color:0xffe2b0}));head.position.set(e*(l/2-0.4),5.1,s*(w/2-0.25));g.add(head);}}
    else g.add(box(l,0.5,0.4,stone,0,-0.1,s*(w/2+0.2)));}
  if(circuit){g.userData.overhead=true;C.overhead.push(g);}else add(g);}
// Gwangtonggyo: wide granite slabs on stone piers, a low carved balustrade
function stoneBridge(a,b,w,floorY){const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)+2,ry=-Math.atan2(dz,dx),g=placed((a[0]+b[0])/2,(a[1]+b[1])/2,ry);
  const st=M(0xc2baa8,.95);g.add(box(l,0.8,w,st,0,-0.4,0));
  for(let k=-2;k<=2;k++)g.add(box(1.0,-floorY,w*0.8,M(0xb3ab99,.95),k*l/5,floorY/2,0));
  for(const s of [-1,1]){g.add(box(l,0.35,0.35,st,0,0.75,s*(w/2-0.2)));for(let q=-l/2;q<=l/2;q+=1.6)g.add(box(0.4,0.75,0.4,st,q,0.37,s*(w/2-0.2)));}
  add(g);}
function footBridge(a,b,w,floorY){const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)+1,ry=-Math.atan2(dz,dx),g=placed((a[0]+b[0])/2,(a[1]+b[1])/2,ry);
  g.add(box(l,0.4,w,M(0x8b6a4a,.85),0,-0.2,0));g.add(box(l,0.5,w*0.9,M(0x6a7076,.5,.4),0,-0.7,0));
  for(const s of [-1,1]){g.add(box(l,0.06,0.06,M(0x50565c,.4,.6),0,1.05,s*(w/2-0.1)));for(let q=-l/2;q<=l/2;q+=1.5)g.add(box(0.06,1.05,0.06,M(0x50565c,.4,.6),q,0.52,s*(w/2-0.1)));}
  add(g);}
// a lettered sign (see signAt in game.js), only where a facade actually faces the point
function sign(fe,...a){if(fe)C.extra.push(C.signAt(fe,...a));}
