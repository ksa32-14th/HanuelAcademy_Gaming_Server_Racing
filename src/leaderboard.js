// Time Trial leaderboard: EVERY valid lap per circuit, fastest first (a driver can hold several places).
// · Without a server (LB_URL empty in config.js) the board lives in this browser only (localStorage).
// · With LB_URL set to a Firebase Realtime Database URL the laps of EVERY player are shared through its REST API
//   (one record per lap under /laps/<circuit>/<push id>), so everybody sees the same board. See README → Time Trial.
// Records: {name, t (s), team, date (ms)}.
import {LB_URL} from './config.js?v=20261007a';

export const lbShared=!!LB_URL;
const base=LB_URL.replace(/\/+$/,'');
const LKEY='hrc-laps-',LMAX=200;

function localAll(track){try{const a=JSON.parse(localStorage.getItem(LKEY+track)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function localPut(track,rec){const all=sorted(localAll(track).concat([rec])).slice(0,LMAX);
  try{localStorage.setItem(LKEY+track,JSON.stringify(all));}catch(e){}}
const sorted=list=>(Array.isArray(list)?list:Object.values(list||{})).filter(r=>r&&typeof r.t==='number'&&r.name).sort((a,b)=>a.t-b.t||a.date-b.date);

// the board for a circuit, fastest lap first. Falls back to this browser's laps if the server can't be reached.
export async function lbLoad(track){
  if(!lbShared)return {rows:sorted(localAll(track)),shared:false};
  try{const r=await fetch(`${base}/laps/${encodeURIComponent(track)}.json`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);
    return {rows:sorted(await r.json()),shared:true};}
  catch(e){return {rows:sorted(localAll(track)),shared:false,error:String(e.message||e)};}}

// record a valid lap (every one is kept). Resolves to {improved (the driver's new best), rank (this lap's place), shared}.
export async function lbSubmit(track,rec){
  localPut(track,rec);
  let shared=false,error;
  if(lbShared){try{const r=await fetch(`${base}/laps/${encodeURIComponent(track)}.json`,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)});
    if(!r.ok)throw new Error(r.status);shared=true;}catch(e){error=String(e.message||e);}}
  const {rows}=await lbLoad(track);
  const rank=rows.findIndex(x=>x.name===rec.name&&x.t===rec.t&&x.date===rec.date)+1;
  const best=rows.find(x=>x.name===rec.name);
  return {improved:!!best&&best.date===rec.date,rank,shared,error};}

// the driver's real name, Korean (2–5 Hangul syllables, e.g. 홍길동) or English (first and last name, Latin letters)
export function checkName(raw){const n=(raw||'').trim().replace(/\s+/g,' ');
  if(/^[가-힣]{2,5}$/.test(n))return {ok:true,name:n};
  if(n.length<=30&&/^[A-Za-z][A-Za-z'\-]*( [A-Za-z][A-Za-z'\-]*){1,3}$/.test(n))
    return {ok:true,name:n.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')};
  return {ok:false,name:n};}
