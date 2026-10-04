// Procedural textures (asphalt, kerbs, concrete, ads, crowd, windows). Generated on the CPU into canvases,
// then uploaded once. `res` scales the size of the noise-based maps with the quality preset.
import * as THREE from 'three';
import {smooth} from './util.js?v=20261005b';
import {TRACK_ID} from './config.js?v=20261005b';

let MAXANI=1;
export const setAniso=n=>{MAXANI=n;};
export function canvasTex(w,h,draw,rep,srgb=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;}t.anisotropy=MAXANI;return t;}
// tileable fractal value noise (0..1)
function fbm(n,oct=6,base=4){const out=new Float32Array(n*n);let amp=1,tot=0;
  for(let o=0;o<oct;o++){const c=base<<o,g=new Float32Array(c*c).map(()=>Math.random());
    for(let y=0;y<n;y++){const gy=y/n*c,y0=Math.floor(gy),fy=smooth(gy-y0),y1=(y0+1)%c;
      for(let x=0;x<n;x++){const gx=x/n*c,x0=Math.floor(gx),fx=smooth(gx-x0),x1=(x0+1)%c;
        const a=g[y0*c+x0]+(g[y0*c+x1]-g[y0*c+x0])*fx,b=g[y1*c+x0]+(g[y1*c+x1]-g[y1*c+x0])*fx;out[y*n+x]+=amp*(a+(b-a)*fy);}}
    tot+=amp;amp*=0.55;}
  for(let i=0;i<n*n;i++)out[i]/=tot;return out;}
function fieldTex(n,h,fn,rep=true,srgb=true){return canvasTex(n,n,(x)=>{const id=x.createImageData(n,n);for(let i=0;i<n*n;i++){const [r,g,b,a]=fn(h,i,n);id.data[i*4]=r;id.data[i*4+1]=g;id.data[i*4+2]=b;id.data[i*4+3]=a??255;}x.putImageData(id,0,0);},rep,srgb);}
function normalTex(n,h,str){return fieldTex(n,h,(h,i,n)=>{const x=i%n,y=(i/n)|0,hx=h[y*n+(x+1)%n]-h[y*n+(x-1+n)%n],hy=h[((y+1)%n)*n+x]-h[((y-1+n)%n)*n+x];
  let nx=-hx*str,ny=-hy*str,nz=1;const l=Math.hypot(nx,ny,nz);return [(nx/l*.5+.5)*255,(ny/l*.5+.5)*255,(nz/l*.5+.5)*255];},true,false);}
// asphalt: coarse aggregate + fine grain, with matching normal & roughness maps
export function createTextures(res=512,maxAni=1){
  MAXANI=maxAni;
const aH=fbm(res,7,8);{const s=new Float32Array(res*res).map(()=>Math.random());for(let i=0;i<aH.length;i++)aH[i]=aH[i]*0.7+(s[i]>0.93?0.35:s[i]*0.12);}
const texAsphalt=fieldTex(res,aH,(h,i)=>{const v=46+h[i]*34;return [v,v+1,v+5];});
const texAsphaltN=normalTex(res,aH,6);
const texAsphaltR=fieldTex(res,aH,(h,i)=>{const r=200+h[i]*55;return [r,r,r];},true,false);
const texKerb=canvasTex(128,32,(x)=>{for(let k=0;k<2;k++){x.fillStyle=k?'#eeeeea':'#c8101a';x.fillRect(k*64,0,64,32);}
  const g=x.createLinearGradient(0,0,0,32);g.addColorStop(0,'rgba(0,0,0,.25)');g.addColorStop(.35,'rgba(255,255,255,.08)');g.addColorStop(1,'rgba(0,0,0,.35)');x.fillStyle=g;x.fillRect(0,0,128,32);
  for(let i=0;i<500;i++){x.fillStyle=`rgba(0,0,0,${Math.random()*.18})`;x.fillRect(Math.random()*128,Math.random()*32,1+Math.random()*2,1);}},true);
const texCheck=canvasTex(64,64,(x)=>{for(let i=0;i<8;i++)for(let j=0;j<8;j++){x.fillStyle=(i+j)%2?'#111':'#f4f4f4';x.fillRect(i*8,j*8,8,8);}},true);
const texRubber=canvasTex(8,64,(x)=>{const g=x.createLinearGradient(0,0,0,64);g.addColorStop(0,'#000');g.addColorStop(.3,'#8a8a8a');g.addColorStop(.5,'#fff');g.addColorStop(.7,'#8a8a8a');g.addColorStop(1,'#000');x.fillStyle=g;x.fillRect(0,0,8,64);},true,false);
const cH=fbm(256,6,4);
const texConcrete=fieldTex(256,cH,(h,i)=>{const v=150+h[i]*60;return [v,v+2,v+6];});
const texConcreteN=normalTex(256,cH,3);
const texFence=canvasTex(128,128,(x)=>{x.clearRect(0,0,128,128);x.strokeStyle='rgba(205,212,224,.95)';x.lineWidth=1.4;
  for(let k=-128;k<256;k+=16){x.beginPath();x.moveTo(k,0);x.lineTo(k+128,128);x.stroke();x.beginPath();x.moveTo(k,128);x.lineTo(k+128,0);x.stroke();}},true);
// sponsor boards: 16 panels × 4 m, glossy vinyl look
const texAds=canvasTex(2048,128,(x)=>{const ads=[['#0d1f4a','#16307a','MARINA BAY','#ffd200'],['#b8000a','#e0101c','NIGHT RACE','#fff'],['#f4f4f4','#d9dde3','LION CITY','#b8000a'],['#0e0e10','#23252b','GRAND PRIX','#1be26b'],
  ['#0b6e5a','#10957a','SINGAPORE','#fff'],['#2a1a5e','#4a2d9a','1500 LUX','#ffcf00'],['#e36b00','#ff8c1a','BAYFRONT','#111'],['#1c2230','#2d3650','STREET CIRCUIT','#fff']];
  if(TRACK_ID==='songdo')['SONGDO','NIGHT RACE','INCHEON','GRAND PRIX','KOREA','1500 LUX','CENTRAL PARK','STREET CIRCUIT'].forEach((t,i)=>ads[i][2]=t);
  for(let p=0;p<16;p++){const a=ads[(p*3)%ads.length],X0=p*128;const g=x.createLinearGradient(0,0,0,128);g.addColorStop(0,a[1]);g.addColorStop(1,a[0]);x.fillStyle=g;x.fillRect(X0,0,128,128);
    x.fillStyle=a[3];x.font='900 22px Titillium Web, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(a[2],X0+64,62);
    x.fillStyle='rgba(255,255,255,.18)';x.fillRect(X0,0,128,40);x.fillStyle='rgba(0,0,0,.35)';x.fillRect(X0,122,128,6);x.fillStyle='rgba(0,0,0,.5)';x.fillRect(X0+127,0,1,128);}},true);
const texCrowd=canvasTex(256,128,(x,w,h)=>{x.fillStyle='#15161c';x.fillRect(0,0,w,h);for(let r=0;r<16;r++){x.fillStyle='#262833';x.fillRect(0,r*8+6,w,2);for(let i=0;i<64;i++){x.fillStyle=`hsl(${Math.random()*360},${40+Math.random()*40}%,${35+Math.random()*40}%)`;x.fillRect(i*4+Math.random(),r*8+1,3,4);}}},true);
  return {texAsphalt,texAsphaltN,texAsphaltR,texKerb,texCheck,texRubber,texConcrete,texConcreteN,texFence,texAds,texCrowd};
}
export function winTex(warm){return canvasTex(64,128,(x)=>{x.fillStyle='#000';x.fillRect(0,0,64,128);for(let j=0;j<32;j++)for(let i=0;i<8;i++){if(Math.random()<.42){x.fillStyle=warm?`hsl(${32+Math.random()*16},85%,${50+Math.random()*28}%)`:`hsl(${195+Math.random()*30},55%,${58+Math.random()*25}%)`;x.fillRect(i*8+2,j*4+1,5,2);}}});}
