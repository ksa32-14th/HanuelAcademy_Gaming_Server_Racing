// In-game music, streamed from the official YouTube uploads through the YouTube IFrame Player API (nothing is hosted
// here): the playlist plays in order and starts again from the first track after the last. It is separate from the
// engine/tyre sound (N mutes those, B turns the music on/off). YouTube's terms want the player visible while it plays,
// so it sits in a small "now playing" card in the bottom-right corner; it is hidden while the music is off.
// Browsers only let it start after a user gesture, so the first click or key press starts it (see game.js).
export const PLAYLIST=[
  {title:'F1',artist:'Hans Zimmer',yt:'YhX_Woa3kVA'},                             // Hans Zimmer - Topic (F1 The Album)
  {title:'Lose My Mind',artist:'Don Toliver feat. Doja Cat',yt:'VJxppgsHjF8'},   // F1 The Album (official audio)
];
const KEY='hrc-music',VOL=35;
let player=null,ready=false,cur=0,on=true,failed=new Set(),card=null,onChange=()=>{};
try{const o=JSON.parse(localStorage.getItem(KEY)||'{}');if(o.on===false)on=false;}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({on}));}catch(e){}};
const changed=()=>{if(card){card.hidden=!on||failed.size>=PLAYLIST.length;card.querySelector('b').textContent='♪ '+PLAYLIST[cur].title+' · '+PLAYLIST[cur].artist;}onChange();};

function makeCard(){if(card)return;card=document.createElement('div');card.id='musicCard';card.hidden=true;
  card.innerHTML='<div id="musicYT"></div><b></b>';
  card.style.cssText='position:fixed;right:16px;bottom:16px;z-index:60;width:200px;background:rgba(9,13,24,.9);border:1px solid rgba(255,255,255,.12);'+
    'border-radius:8px;overflow:hidden;font:700 10px/1.3 var(--f-disp,system-ui);letter-spacing:.04em;color:#cfd6e6';
  card.querySelector('b').style.cssText='display:block;padding:5px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  document.body.appendChild(card);}
// load the IFrame API once; resolves with the YT namespace
let apiP=null;
function api(){if(apiP)return apiP;apiP=new Promise(res=>{if(window.YT&&window.YT.Player){res(window.YT);return;}
    const prev=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{if(prev)prev();res(window.YT);};
    const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;document.head.appendChild(s);});
  return apiP;}
function create(){if(player)return;makeCard();
  api().then(YT=>{player=new YT.Player('musicYT',{width:200,height:113,videoId:PLAYLIST[cur].yt,
    playerVars:{autoplay:on?1:0,controls:1,rel:0,playsinline:1,modestbranding:1},
    events:{
      onReady:()=>{ready=true;player.setVolume(VOL);if(on)player.playVideo();changed();},
      onStateChange:e=>{if(e.data===YT.PlayerState.ENDED)advance();},
      // the video can't be played here (removed, region-locked, embedding turned off): skip it
      onError:()=>{failed.add(cur);if(failed.size>=PLAYLIST.length){changed();return;}advance();}}});});
  changed();}
// the next track in playlist order that has not failed
function advance(){let i=cur;for(let k=0;k<PLAYLIST.length;k++){i=(i+1)%PLAYLIST.length;if(!failed.has(i))break;}
  cur=i;if(ready){on?player.loadVideoById(PLAYLIST[cur].yt):player.cueVideoById(PLAYLIST[cur].yt);}changed();}
// start (or resume) the music — call from a click / key handler
export function musicStart(){if(!on)return;if(!player){create();return;}if(ready)player.playVideo();}
export function musicSet(v){on=v;save();if(on){failed.clear();if(!player)create();else if(ready)player.playVideo();}else if(ready)player.pauseVideo();changed();return on;}
export const musicToggle=()=>musicSet(!on);
// the circuit intro film plays to the F1 theme (the first track) from its start; the playlist carries on from there
export function musicIntro(){if(!on)return;cur=0;failed.delete(0);if(!player){create();return;}if(ready)player.loadVideoById(PLAYLIST[0].yt,0);changed();}
// (yt: the YouTube player state, 1 = playing; t: seconds into the track)
export const musicState=()=>({on,track:PLAYLIST[cur],allFailed:failed.size>=PLAYLIST.length,failed:[...failed],yt:ready?player.getPlayerState():-2,t:ready?player.getCurrentTime():0});
export function onMusicChange(fn){onChange=fn;}
