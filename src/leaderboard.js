// Time Trial leaderboard: the TOP 5 laps per circuit (all players together; a driver can hold several places).
// · Without a server (LB_URL empty in config.js) the board lives in this browser only (localStorage).
// · With LB_URL set to a Firebase Realtime Database URL the board is shared through its REST API: one list of up to 5
//   laps per circuit under /top5/<circuit>, fastest first. A lap is written only when it makes the top 5 (pushing the
//   5th out); the write is conditional on the list not having changed since it was read (ETag), so two drivers
//   finishing at once never overwrite each other. See README → Time Trial.
// Records: {name, time, s1, s2, s3 (lap and sector times as 'm:ss:mmm', e.g. '1:32:456'), team,
//           date ('YYYY-MM-DD', the day it was set), at (ms, when it was set)}. Rows handed to the game also carry
//           t (the lap, s) and st ([s1, s2, s3] in s, NaN where missing).
import {LB_URL} from './config.js?v=20261007t';

export const lbShared=!!LB_URL;
const base=LB_URL.replace(/\/+$/,'');
const LKEY='hrc-top5-',TOP=5;

// lap time ⇄ 'm:ss:mmm' (0 min 00 s 000 ms)
export function lbFmt(t){const ms=Math.max(0,Math.round(t*1000)),m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;
  return m+':'+String(s).padStart(2,'0')+':'+String(ms%1000).padStart(3,'0');}
function lbParse(str){const m=/^(\d+):(\d{2}):(\d{3})$/.exec(String(str||''));return m?+m[1]*60+ +m[2]+ +m[3]/1000:NaN;}
const dayOf=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const secStr=s=>typeof s==='number'&&isFinite(s)&&s>0?lbFmt(s):'';

// clean, fastest-first rows with t added (a record without a readable time is dropped)
const rowsOf=list=>(Array.isArray(list)?list:Object.values(list||{})).filter(r=>r&&r.name&&typeof r.time==='string')
  .map(r=>{const at=typeof r.at==='number'?r.at:typeof r.date==='number'?r.date:0;
    return {name:r.name,time:r.time,s1:r.s1||'',s2:r.s2||'',s3:r.s3||'',team:r.team||'',
      date:typeof r.date==='string'?r.date:at?dayOf(at):'',at,t:lbParse(r.time),st:[lbParse(r.s1),lbParse(r.s2),lbParse(r.s3)]};})
  .filter(r=>isFinite(r.t)).sort((a,b)=>a.t-b.t||a.at-b.at);
const recOf=r=>({name:r.name,time:r.time,s1:r.s1,s2:r.s2,s3:r.s3,team:r.team,date:r.date,at:r.at});
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

// ghosts: the driving line of each top-5 lap, kept beside the board (/ghost/<circuit>/<at>, or this browser) as
// {at, name, time, hz (samples per second), p (the path, see encodePath in game.js)} — removed when its lap drops out
const gUrl=(track,at)=>`${base}/ghost/${encodeURIComponent(track)}/${at}.json`,GKEY=(track,at)=>'hrc-ghost-'+track+'-'+at;
function localGhostPut(track,g){try{localStorage.setItem(GKEY(track,g.at),JSON.stringify(g));}catch(e){}}
function localGhostDrop(track,keep){try{const pre='hrc-ghost-'+track+'-';
  for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith(pre)&&!keep.has(+k.slice(pre.length)))localStorage.removeItem(k);}}catch(e){}}
// the ghost of a board lap (its `at`), or null
export async function lbGhost(track,at){
  if(lbShared){try{const r=await fetch(gUrl(track,at),{cache:'no-store'});if(r.ok){const g=await r.json();if(g&&g.p)return g;}}catch(e){}}
  try{const g=JSON.parse(localStorage.getItem(GKEY(track,at))||'null');return g&&g.p?g:null;}catch(e){return null;}}

// a valid lap {name, t (s), sec ([s1,s2,s3] in s), team, path (encoded driving line), hz}: kept if it makes the top 5,
// with its ghost. Resolves to {rank (its place, 0 = outside the top 5), improved (it is now the driver's best on the
// board), shared}.
export async function lbSubmit(track,lap){
  const at=Date.now(),sec=lap.sec||[];
  const rec={name:lap.name,time:lbFmt(lap.t),s1:secStr(sec[0]),s2:secStr(sec[1]),s3:secStr(sec[2]),team:lap.team||'',date:dayOf(at),at};
  const ghost=lap.path?{at,name:rec.name,time:rec.time,hz:lap.hz||10,p:lap.path}:null;
  const result=rows=>{const rank=rows.findIndex(x=>x.at===rec.at&&x.name===rec.name)+1;
    return {rank,improved:rank>0&&rows.findIndex(x=>x.name===rec.name)+1===rank};};
  const loc=merged(localAll(track),rec);localSave(track,loc);
  if(ghost&&result(loc).rank)localGhostPut(track,ghost);localGhostDrop(track,new Set(loc.map(x=>x.at)));
  if(!lbShared)return {...result(loc),shared:false};
  try{for(let k=0;k<4;k++){const {rows,etag}=await serverGet(track),next=merged(rows,rec),res=result(next);
      if(!res.rank)return {...res,shared:true};
      const w=await fetch(url(track),{method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(next.map(recOf))});
      if(w.ok){const keep=new Set(next.map(x=>x.at));
        if(ghost)await fetch(gUrl(track,at),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(ghost)}).catch(()=>{});
        for(const x of rows)if(!keep.has(x.at)&&x.at)fetch(gUrl(track,x.at),{method:'DELETE'}).catch(()=>{}); // its lap left the top 5
        return {...res,shared:true};}
      if(w.status!==412)throw new Error(w.status);} // 412: someone else's lap got in first — read again and merge
    throw new Error('busy');}
  catch(e){return {...result(loc),shared:false,error:String(e.message||e)};}}

// the driver's real name in English capitals: first and last name, Latin letters (e.g. GILDONG HONG)
export function checkName(raw){const n=(raw||'').trim().replace(/\s+/g,' ');
  if(n.length<=30&&/^[A-Za-z][A-Za-z'\-]*( [A-Za-z][A-Za-z'\-]*){1,3}$/.test(n))
    return {ok:true,name:n.toUpperCase()};
  return {ok:false,name:n};}
