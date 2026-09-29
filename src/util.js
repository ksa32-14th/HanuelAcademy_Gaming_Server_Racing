// Small shared helpers.
export const $=id=>document.getElementById(id);
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const wrapA=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const rand=(a,b)=>a+Math.random()*(b-a);
export const hex=c=>'#'+c.toString(16).padStart(6,'0');
export function fmt(t){if(t==null||!isFinite(t))return '—';const m=Math.floor(t/60),s=t-m*60;return m+':'+s.toFixed(3).padStart(6,'0');}
export function fmtRace(t){if(t==null)return '0:00.000';const h=Math.floor(t/3600);const r=t-h*3600;return (h?h+':':'')+(h?String(Math.floor(r/60)).padStart(2,'0'):Math.floor(r/60))+':'+(r%60).toFixed(3).padStart(6,'0');}
