// Team radio, as on the broadcast: the panel on the right with the driver's name in the team colour, an animated level
// meter and the transcript — the team's words in white, the driver's in yellow. Each call opens with the radio beep and
// a burst of static, a faint hiss runs under it while the channel is open, and it closes with a shorter beep.
// The beep is synthesised (Web Audio); RADIO_SFX (config.js) can name an audio file of your own to play instead.
// One call shows at a time: the next waits (urgent ones jump the queue), and a call that waited too long is dropped.
import {$,clamp} from './util.js?v=20261010x';
import {RADIO_SFX} from './config.js?v=20261010x';

let audio=()=>null,sfx=null,sfxLoading=false,hiss=null;
let queue=[],cur=null,timers=[];
const MAX_WAIT=12000; // ms a waiting call stays relevant

// get: () => {ac, dest} | null — the game's audio context and its master bus (muted / paused with the game)
export function radioAudio(get){audio=get;}

// lines: [['team' | 'driver', text], …]; opt: {name, color, team, prio} (prio 2 = urgent: jumps the queue)
export function radioSay(lines,opt={}){
  if(!lines||!lines.length)return;
  const item={lines,name:opt.name||'',color:opt.color||'#fff',team:opt.team||'',prio:opt.prio||1,at:performance.now()};
  if(cur){if(item.prio>=2){const i=queue.findIndex(q=>q.prio<2);queue.splice(i<0?queue.length:i,0,item);}else queue.push(item);
    if(queue.length>3)queue.splice(3);return;}
  play(item);}

// session over / back to the menu: close the channel and forget what was waiting
export function radioClear(){queue=[];timers.forEach(clearTimeout);timers=[];cur=null;stopHiss();
  const r=$('radio');if(r)r.className='';}

// how long a line stays up before the next one: reading time, at least ~2.4 s
const lineMs=s=>clamp(1400+s.length*75,2400,6500);

function play(item){cur=item;timers.forEach(clearTimeout);timers=[];
  const r=$('radio'),body=$('rdBody');
  $('rdName').textContent=item.name;$('rdTeam').textContent=item.team;r.style.setProperty('--tc',item.color);
  body.innerHTML='';r.className='on';beepOpen();startHiss();
  let t=450; // the beep first, then the words
  item.lines.forEach(([who,txt],k)=>{
    timers.push(setTimeout(()=>{const p=document.createElement('p');p.className=who==='driver'?'rd-d':'rd-t';p.textContent=txt;body.appendChild(p);
      r.classList.toggle('drv',who==='driver'); // the level meter takes the speaker's colour
      if(k>0)crackle();},t));
    t+=lineMs(txt);});
  timers.push(setTimeout(()=>{beepClose();stopHiss();r.classList.add('off');},t));
  timers.push(setTimeout(()=>{r.className='';cur=null;next();},t+380));}

function next(){const now=performance.now();queue=queue.filter(q=>now-q.at<MAX_WAIT);const q=queue.shift();if(q)play(q);}

/* ---- sound ---- */
function ctx(){try{return audio();}catch(e){return null;}}
// the user's own radio sound (RADIO_SFX), decoded once
function loadSfx(ac){if(!RADIO_SFX||sfx||sfxLoading)return;sfxLoading=true;
  fetch(RADIO_SFX).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(b=>ac.decodeAudioData(b)).then(buf=>{sfx=buf;}).catch(()=>{});}
// the radio's narrow band: everything goes through a telephone-like band-pass and a little grit
function band(ac,dest,gain){const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=380;
  const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3200;
  const sh=ac.createWaveShaper(),cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/255.5-1;cv[i]=Math.tanh(3*x);}sh.curve=cv;
  const g=ac.createGain();g.gain.value=gain;hp.connect(lp).connect(sh).connect(g).connect(dest);return hp;}
function noise(ac,sec){const b=ac.createBuffer(1,Math.round(ac.sampleRate*sec),ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b;}
function tone(ac,inp,f,t0,dur,vol){const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.value=f;
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+0.004);g.gain.setValueAtTime(vol,t0+dur-0.01);g.gain.linearRampToValueAtTime(0,t0+dur);
  o.connect(g).connect(inp);o.start(t0);o.stop(t0+dur+0.02);}
function burst(ac,inp,t0,dur,vol){const s=ac.createBufferSource();s.buffer=noise(ac,dur+0.05);const g=ac.createGain();
  g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.001,t0+dur);s.connect(g).connect(inp);s.start(t0);}
// opening: a squelch of static, then the two-note digital beep
function beepOpen(){const a=ctx();if(!a)return;const {ac,dest}=a;loadSfx(ac);const t=ac.currentTime+0.01;
  if(sfx){const s=ac.createBufferSource(),g=ac.createGain();g.gain.value=0.6;s.buffer=sfx;s.connect(g).connect(dest);s.start(t);return;}
  const inp=band(ac,dest,0.16);burst(ac,inp,t,0.09,0.9);tone(ac,inp,1180,t+0.05,0.07,0.5);tone(ac,inp,1580,t+0.13,0.11,0.5);burst(ac,inp,t+0.24,0.12,0.35);}
// closing: the beep the other way round, shorter
function beepClose(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01;
  if(sfx)return; // a recorded effect already carries its own open / close
  const inp=band(ac,dest,0.12);tone(ac,inp,1580,t,0.05,0.45);tone(ac,inp,1180,t+0.06,0.07,0.45);burst(ac,inp,t+0.12,0.1,0.4);}
// a click of static between two speakers
function crackle(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01;burst(ac,band(ac,dest,0.12),t,0.07,0.8);}
// the open channel: a faint band-limited hiss
function startHiss(){const a=ctx();if(!a||hiss)return;const {ac,dest}=a;
  const s=ac.createBufferSource();s.buffer=noise(ac,2);s.loop=true;const g=ac.createGain();g.gain.value=0;
  s.connect(g).connect(band(ac,dest,0.05));s.start();g.gain.setTargetAtTime(0.5,ac.currentTime,0.05);hiss={s,g,ac};}
function stopHiss(){if(!hiss)return;const {s,g,ac}=hiss;hiss=null;try{g.gain.setTargetAtTime(0,ac.currentTime,0.03);s.stop(ac.currentTime+0.2);}catch(e){}}
