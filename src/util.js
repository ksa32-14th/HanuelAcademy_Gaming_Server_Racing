// Small shared helpers.
export const $=id=>document.getElementById(id);
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const wrapA=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
// Seedable random source: Math.random unless the page is opened with ?seed=N (or reseed(N) is called), then a
// mulberry32 stream — used by the determinism check, which must replay the exact same race.
const mulberry32=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
let rng=Math.random;
export function reseed(n){rng=n==null?Math.random:mulberry32(n>>>0);}
try{const s=new URLSearchParams(location.search).get('seed');if(s!=null&&s!=='')reseed(+s);}catch(e){}
export const rnd=()=>rng();
export const rand=(a,b)=>a+rng()*(b-a);
export const hex=c=>'#'+c.toString(16).padStart(6,'0');
export function fmt(t){if(t==null||!isFinite(t))return '—';const m=Math.floor(t/60),s=t-m*60;return m+':'+s.toFixed(3).padStart(6,'0');}
export function fmtRace(t){if(t==null)return '0:00.000';const h=Math.floor(t/3600);const r=t-h*3600;return (h?h+':':'')+(h?String(Math.floor(r/60)).padStart(2,'0'):Math.floor(r/60))+':'+(r%60).toFixed(3).padStart(6,'0');}
