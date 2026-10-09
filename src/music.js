// In-game music: the playlist played in order (back to the first track after the last) through one <audio> element,
// separate from the engine/tyre sound (N mutes those, B turns the music on/off). The audio files are NOT part of the
// repository: put your own copies in /music under the names below (see music/README.md). A track whose file is missing
// is skipped quietly. Playback can only start after a user gesture (browser autoplay rules).
export const PLAYLIST=[
  {title:'F1',artist:'Hans Zimmer',src:'music/f1-hans-zimmer.mp3'},
  {title:'Lose My Mind',artist:'Don Toliver feat. Doja Cat',src:'music/lose-my-mind.mp3'},
];
const KEY='hrc-music',VOL=0.35;
let el=null,cur=0,on=true,missing=new Set(),onChange=()=>{};
try{const o=JSON.parse(localStorage.getItem(KEY)||'{}');if(o.on===false)on=false;}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({on}));}catch(e){}};
function audio(){if(el)return el;el=new Audio();el.preload='auto';el.volume=VOL;
  el.addEventListener('ended',()=>advance());
  // a missing / unreadable file: remember it and move on (stop once every track has failed)
  el.addEventListener('error',()=>{missing.add(cur);if(missing.size>=PLAYLIST.length){onChange();return;}advance();});
  return el;}
function load(i){cur=i%PLAYLIST.length;const a=audio();a.src=PLAYLIST[cur].src;onChange();if(on)a.play().catch(()=>{});}
// the next track in playlist order that has not failed
function advance(){let i=cur;for(let k=0;k<PLAYLIST.length;k++){i=(i+1)%PLAYLIST.length;if(!missing.has(i))break;}load(i);}
// start (or resume) the music — call from a click / key handler
export function musicStart(){if(!on||missing.size>=PLAYLIST.length)return;const a=audio();
  if(!a.src)load(0);else if(a.paused)a.play().catch(()=>{});}
export function musicSet(v){on=v;save();if(on){missing.clear();const a=audio();if(!a.src)load(0);else a.play().catch(()=>{});}else if(el)el.pause();onChange();return on;}
export const musicToggle=()=>musicSet(!on);
export const musicState=()=>({on,track:PLAYLIST[cur],allMissing:missing.size>=PLAYLIST.length});
export function onMusicChange(fn){onChange=fn;}
