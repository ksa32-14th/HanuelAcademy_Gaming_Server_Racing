// Time Trial leaderboard: the TOP 5 laps per circuit (all players together; a driver can hold several places).
// · Without a server (LB_URL empty in config.js) the board lives in this browser only (localStorage).
// · With LB_URL set to a Firebase Realtime Database URL the board is shared through its REST API: one list of up to 5
//   laps per circuit under /top5/<circuit>, fastest first. A lap is written only when it makes the top 5 (pushing the
//   5th out); the write is conditional on the list not having changed since it was read (ETag), so two drivers
//   finishing at once never overwrite each other. See README → Time Trial.
// Records: {name, time ('m:ss:mmm', e.g. '1:32:456'), team, date (ms)}. Rows handed to the game also carry t (s).
import {LB_URL} from './config.js?v=20261007b';

export const lbShared=!!LB_URL;
const base=LB_URL.replace(/\/+$/,'');
const LKEY='hrc-top5-',TOP=5;

// lap time ⇄ 'm:ss:mmm' (0 min 00 s 000 ms)
export function lbFmt(t){const ms=Math.max(0,Math.round(t*1000)),m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;
  return m+':'+String(s).padStart(2,'0')+':'+String(ms%1000).padStart(3,'0');}
function lbParse(str){const m=/^(\d+):(\d{2}):(\d{3})$/.exec(String(str||''));return m?+m[1]*60+ +m[2]+ +m[3]/1000:NaN;}

// clean, fastest-first rows with t added (a record without a readable time is dropped)
const rowsOf=list=>(Array.isArray(list)?list:Object.values(list||{})).filter(r=>r&&r.name&&typeof r.time==='string')
  .map(r=>({name:r.name,time:r.time,team:r.team||'',date:r.date||0,t:lbParse(r.time)})).filter(r=>isFinite(r.t))
  .sort((a,b)=>a.t-b.t||a.date-b.date);
const recOf=r=>({name:r.name,time:r.time,team:r.team,date:r.date});
// the board with this lap merged in, cut to the top 5
const merged=(rows,rec)=>rowsOf(rows.map(recOf).concat([rec])).slice(0,TOP);

function localAll(track){try{return rowsOf(JSON.parse(localStorage.getItem(LKEY+track)||'[]'));}catch(e){return [];}}
function localSave(track,rows){try{localStorage.setItem(LKEY+track,JSON.stringify(rows.map(recOf)));}catch(e){}}

const url=track=>`${base}/top5/${encodeURIComponent(track)}.json`;
async function serverGet(track){const r=await fetch(url(track),{cache:'no-store',headers:{'X-Firebase-ETag':'true'}});
  if(!r.ok)throw new Error(r.status);return {rows:rowsOf(await r.json()),etag:r.headers.get('ETag')};}

// the board for a circuit, fastest lap first. Falls back to this browser's board if the server can't be reached.
export async function lbLoad(track){
  if(!lbShared)return {rows:localAll(track),shared:false};
  try{return {rows:(await serverGet(track)).rows,shared:true};}
  catch(e){return {rows:localAll(track),shared:false,error:String(e.message||e)};}}

// a valid lap: kept if it makes the top 5. Resolves to {rank (its place, 0 = outside the top 5), improved (it is now
// the driver's best on the board), shared}.
export async function lbSubmit(track,lap){
  const rec={name:lap.name,time:lbFmt(lap.t),team:lap.team||'',date:lap.date||Date.now()};
  const result=rows=>{const rank=rows.findIndex(x=>x.date===rec.date&&x.name===rec.name)+1;
    return {rank,improved:rank>0&&rows.findIndex(x=>x.name===rec.name)+1===rank};};
  localSave(track,merged(localAll(track),rec));
  if(!lbShared)return {...result(localAll(track)),shared:false};
  try{for(let k=0;k<4;k++){const {rows,etag}=await serverGet(track),next=merged(rows,rec),res=result(next);
      if(!res.rank)return {...res,shared:true};
      const w=await fetch(url(track),{method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(next.map(recOf))});
      if(w.ok)return {...res,shared:true};
      if(w.status!==412)throw new Error(w.status);} // 412: someone else's lap got in first — read again and merge
    throw new Error('busy');}
  catch(e){return {...result(localAll(track)),shared:false,error:String(e.message||e)};}}

// the driver's real name, Korean (2–5 Hangul syllables, e.g. 홍길동) or English (first and last name, Latin letters)
export function checkName(raw){const n=(raw||'').trim().replace(/\s+/g,' ');
  if(/^[가-힣]{2,5}$/.test(n))return {ok:true,name:n};
  if(n.length<=30&&/^[A-Za-z][A-Za-z'\-]*( [A-Za-z][A-Za-z'\-]*){1,3}$/.test(n))
    return {ok:true,name:n.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')};
  return {ok:false,name:n};}
