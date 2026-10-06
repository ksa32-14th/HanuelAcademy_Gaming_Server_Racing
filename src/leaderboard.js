// Time Trial leaderboard: each driver's best valid lap per circuit.
// · Without a server (LB_URL empty in config.js) the board lives in this browser only (localStorage).
// · With LB_URL set to a Firebase Realtime Database URL the best laps of EVERY player are shared through its REST API
//   (one record per driver name under /tt/<circuit>/), so everybody sees the same board. See README → Time Trial.
// Records: {name, t (s), team, date (ms)}.
import {LB_URL} from './config.js?v=20261006h';

export const lbShared=!!LB_URL;
const base=LB_URL.replace(/\/+$/,'');
const LKEY='hrc-tt-';
// a Firebase key may not contain . $ # [ ] / — the name is percent-encoded (Hangul included) and '.' escaped too
const keyOf=name=>encodeURIComponent(name.trim().toLowerCase()).replace(/\./g,'%2E');

function localAll(track){try{return JSON.parse(localStorage.getItem(LKEY+track)||'{}');}catch(e){return {};}}
function localPut(track,rec){const all=localAll(track),k=keyOf(rec.name);
  if(!all[k]||rec.t<all[k].t){all[k]=rec;try{localStorage.setItem(LKEY+track,JSON.stringify(all));}catch(e){}return true;}return false;}
const sorted=obj=>Object.values(obj||{}).filter(r=>r&&typeof r.t==='number'&&r.name).sort((a,b)=>a.t-b.t);

// the board for a circuit, fastest first. Falls back to this browser's records if the server can't be reached.
export async function lbLoad(track){
  if(!lbShared)return {rows:sorted(localAll(track)),shared:false};
  try{const r=await fetch(`${base}/tt/${encodeURIComponent(track)}.json`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);
    return {rows:sorted(await r.json()),shared:true};}
  catch(e){return {rows:sorted(localAll(track)),shared:false,error:String(e.message||e)};}}

// record a valid lap: kept only if it beats that driver's best. Resolves to {improved, shared}.
export async function lbSubmit(track,rec){
  const improved=localPut(track,rec);
  if(!lbShared)return {improved,shared:false};
  try{const url=`${base}/tt/${encodeURIComponent(track)}/${keyOf(rec.name)}.json`;
    const old=await (await fetch(url,{cache:'no-store'})).json();
    if(old&&typeof old.t==='number'&&old.t<=rec.t)return {improved:false,shared:true};
    const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)});
    if(!r.ok)throw new Error(r.status);return {improved:true,shared:true};}
  catch(e){return {improved,shared:false,error:String(e.message||e)};}}

// the driver's real name, Korean (2–5 Hangul syllables, e.g. 홍길동) or English (first and last name, Latin letters)
export function checkName(raw){const n=(raw||'').trim().replace(/\s+/g,' ');
  if(/^[가-힣]{2,5}$/.test(n))return {ok:true,name:n};
  if(n.length<=30&&/^[A-Za-z][A-Za-z'\-]*( [A-Za-z][A-Za-z'\-]*){1,3}$/.test(n))
    return {ok:true,name:n.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')};
  return {ok:false,name:n};}
