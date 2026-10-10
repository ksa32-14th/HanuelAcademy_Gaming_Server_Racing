// Team radio, as the broadcast's radio graphic: on the right, SURNAME (team colour) / RADIO, the car number over a waveform
// band that moves while the channel is open and the team badge, then the transcript — the driver's words right-aligned in
// the team colour, the team's left-aligned in white. Each call opens with the radio sound: RADIO_SFX (config.js), an
// audio file, when it is there — otherwise a beep and a burst of static synthesised here; a faint hiss runs under the
// call and it closes with a shorter beep (the synthesised one only).
// The team's lines are spoken from recorded voice files, sounds/radio/<id>.mp3 (made by tools/radio-voices.ps1 from
// sounds/radio/lines.json), played through a radio filter: narrow band, a little grit, hard compression. A line can be
// several files in a row (e.g. "P5." + "Good job! Keep pushing."). The driver's lines are text only, and so is a team line
// whose file isn't there yet. The next line comes once the voice has finished and the text has been up long enough to read.
// One call shows at a time: the next waits (urgent ones jump the queue), and a call that waited too long is dropped.
import {$,clamp} from './util.js?v=20261011b';
import {RADIO_SFX} from './config.js?v=20261011b';

let audio=()=>null,isMuted=()=>false,sfx=null,hiss=null;
let queue=[],cur=null,timers=[],waveT=0,gen=0;
const MAX_WAIT=12000; // ms a waiting call stays relevant
const WAVE_N=46;      // bars in the waveform band
const VOICE_DIR='sounds/radio/';

// get: () => {ac, dest} | null — the game's audio context and its master bus (muted / paused with the game)
export function radioAudio(get){audio=get;}
// fn: () => true while the game's sound is off (N) or paused — no voice then (the text only)
export function radioMuted(fn){isMuted=fn;}

/* ---- the team's voice: recorded files ---- */
const clips=new Map(); // id -> Promise<AudioBuffer | null>
// sounds/radio/voices.json: the ids that have a file (tools/radio-voices.ps1 writes it) — no request for a line without one
let have=new Set();const haveP=fetch(VOICE_DIR+'voices.json').then(r=>r.ok?r.json():[]).then(a=>{have=new Set(a);}).catch(()=>{});
function clip(ac,id){if(!have.has(id))return Promise.resolve(null);
  if(!clips.has(id))clips.set(id,fetch(VOICE_DIR+id+'.mp3').then(r=>r.ok?r.arrayBuffer():null)
    .then(b=>b?ac.decodeAudioData(b):null).catch(()=>null));return clips.get(id);}
// all the lines, fetched in the background the first time the radio opens (so later calls start without a delay)
let preloaded=false;
function preload(ac){if(preloaded)return;preloaded=true;haveP.then(()=>{for(const id of have)clip(ac,id);});}
// the radio: the voice squeezed into a narrow band with a bit of grit and heavy compression, as team radio sounds on TV
function voiceChain(ac,dest){const F=(type,f,q,gain)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;if(gain!=null)b.gain.value=gain;return b;};
  const hp=F('highpass',330,0.8),lp=F('lowpass',3300,0.8),pk=F('peaking',1700,1,5),sh=ac.createWaveShaper(),cv=new Float32Array(1024);
  for(let i=0;i<1024;i++){const x=i/511.5-1;cv[i]=Math.tanh(2.2*x)/Math.tanh(2.2);}sh.curve=cv;
  const cp=ac.createDynamicsCompressor();cp.threshold.value=-26;cp.ratio.value=6;cp.attack.value=0.003;cp.release.value=0.15;
  const g=ac.createGain();g.gain.value=1.1;hp.connect(lp).connect(pk).connect(sh).connect(cp).connect(g).connect(dest);return hp;}
let voiceNow=[];
// sound off / paused mid-sentence: stop the voice now (the line's text stays up)
export function radioHush(){for(const s of voiceNow){try{s.stop();}catch(e){}}voiceNow=[];}
// play a line's files one after another; resolves when they have been said (at once with no sound, or a file missing)
async function sayClips(ids,maxMs){ids=ids.filter(Boolean);const a=ctx();if(!a||isMuted()||!ids.length)return;const {ac,dest}=a;
  const bufs=await Promise.all(ids.map(id=>clip(ac,id)));if(bufs.some(b=>!b)||isMuted())return;
  const inp=voiceChain(ac,dest);let t=ac.currentTime+0.03;voiceNow=[];
  for(const b of bufs){const s=ac.createBufferSource();s.buffer=b;s.connect(inp);s.start(t);voiceNow.push(s);t+=b.duration+0.05;}
  await wait(Math.min(maxMs,(t-ac.currentTime)*1000));}

// lines: [['team' | 'driver', text, voice], …] — voice: a file id or a list of them (team lines); opt: {name, num, color,
// team, prio} (prio 2 = urgent: jumps the queue)
export function radioSay(lines,opt={}){
  if(!lines||!lines.length)return;
  const item={lines,name:opt.name||'',num:opt.num??'',color:opt.color||'#fff',team:opt.team||'',prio:opt.prio||1,at:performance.now()};
  if(cur){if(item.prio>=2){const i=queue.findIndex(q=>q.prio<2);queue.splice(i<0?queue.length:i,0,item);}else queue.push(item);
    if(queue.length>3)queue.splice(3);return;}
  play(item);}

// session over / back to the menu: close the channel and forget what was waiting
export function radioClear(){gen++;queue=[];timers.forEach(clearTimeout);timers=[];cur=null;radioHush();stopHiss();wave(false);
  const r=$('radio');if(r)r.className='';}

// how long a line stays up before the next one: reading time, at least ~2.4 s
const lineMs=s=>clamp(1400+s.length*75,2400,6500);
const wait=ms=>new Promise(r=>timers.push(setTimeout(r,ms)));

async function play(item){const g=++gen;cur=item;timers.forEach(clearTimeout);timers=[];
  const r=$('radio'),body=$('rdBody'),a=ctx();if(a)preload(a.ac);
  $('rdName').textContent=item.name;$('rdNum').textContent=item.num;r.style.setProperty('--tc',item.color);
  // the team badge: its initial (no logos of real teams)
  const lg=$('rdLogo');lg.textContent=(item.team.trim()[0]||'').toUpperCase();lg.title=item.team;
  body.innerHTML='';r.className='on';beepOpen();startHiss();wave(true);
  await wait(sfx?Math.min(900,sfx.duration*1000):450); // the radio sound first, then the words
  for(let k=0;k<item.lines.length;k++){if(g!==gen)return;const [who,txt,vo]=item.lines[k];
    const p=document.createElement('p');p.className=who==='driver'?'rd-d':'rd-t';p.textContent=txt;body.appendChild(p);
    if(k>0)crackle();
    const t0=performance.now();if(who!=='driver'&&vo)await sayClips(Array.isArray(vo)?vo:[vo],lineMs(txt)+4000);if(g!==gen)return;
    // after the voice: what is left of the reading time (a short pause at least)
    await wait(Math.max(who!=='driver'?350:0,lineMs(txt)-(performance.now()-t0)));}
  if(g!==gen)return;
  beepClose();stopHiss();wave(false);r.classList.add('off');
  await wait(380);if(g!==gen)return;
  r.className='';cur=null;next();}

// the waveform band: bars of random height ~12 times a second while the channel is open, flat when it closes
function wave(on){const w=$('rdWave');if(!w)return;
  if(!w.children.length)for(let i=0;i<WAVE_N;i++)w.appendChild(document.createElement('i'));
  clearInterval(waveT);waveT=0;const bars=[...w.children];
  if(!on){bars.forEach(b=>{b.style.height='18%';});return;}
  const step=()=>bars.forEach((b,i)=>{const env=0.55+0.45*Math.sin(i/WAVE_N*Math.PI);b.style.height=Math.round((12+Math.random()*88)*env)+'%';});
  step();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)waveT=setInterval(step,85);}

function next(){const now=performance.now();queue=queue.filter(q=>now-q.at<MAX_WAIT);const q=queue.shift();if(q)play(q);}

/* ---- sound ---- */
function ctx(){try{return audio();}catch(e){return null;}}
// the radio sound file (RADIO_SFX): fetched as the page loads, decoded once the game's audio has started. No file there
// (or one the browser can't decode): the synthesised beep below
let sfxBytes=null,sfxDec=null;
if(RADIO_SFX)fetch(RADIO_SFX).then(r=>r.ok?r.arrayBuffer():null).then(b=>{sfxBytes=b;}).catch(()=>{});
function getSfx(ac){if(sfx)return Promise.resolve(sfx);if(!sfxBytes)return null;
  if(!sfxDec)sfxDec=ac.decodeAudioData(sfxBytes.slice(0)).then(b=>(sfx=trimSfx(b))).catch(()=>{sfxBytes=null;return null;});return sfxDec;}
// a sound effect cut from a video has silence either side (the one in sounds/ sits at 1.28–1.68 s of 3 s) and comes in
// quiet: find where it really starts and ends (above 4 % of its peak) and level it to a 0.8 peak
function trimSfx(b){let pk=0;const chs=[];for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);chs.push(d);for(let i=0;i<d.length;i++)pk=Math.max(pk,Math.abs(d[i]));}
  if(pk<1e-4)return null;const th=pk*0.04,loud=i=>chs.some(d=>Math.abs(d[i])>th);
  let a=0,e=b.length-1;while(a<e&&!loud(a))a++;while(e>a&&!loud(e))e--;
  const sr=b.sampleRate,pad=Math.round(sr*0.01);a=Math.max(0,a-pad);e=Math.min(b.length-1,e+pad);
  return {buf:b,start:a/sr,duration:(e-a+1)/sr,gain:Math.min(4,0.8/pk)};}
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
function beepOpen(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01;
  const f=getSfx(ac);
  if(f){f.then(x=>{if(!x)return;const s=ac.createBufferSource(),g=ac.createGain();g.gain.value=x.gain*0.8;s.buffer=x.buf;s.connect(g).connect(dest);
    s.start(ac.currentTime+0.005,x.start,x.duration);});return;}
  const inp=band(ac,dest,0.16);burst(ac,inp,t,0.09,0.9);tone(ac,inp,1180,t+0.05,0.07,0.5);tone(ac,inp,1580,t+0.13,0.11,0.5);burst(ac,inp,t+0.24,0.12,0.35);}
// closing: the beep the other way round, shorter
function beepClose(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01;
  if(sfx||sfxBytes)return; // the radio sound file plays at the start only
  const inp=band(ac,dest,0.12);tone(ac,inp,1580,t,0.05,0.45);tone(ac,inp,1180,t+0.06,0.07,0.45);burst(ac,inp,t+0.12,0.1,0.4);}
// a click of static between two speakers
function crackle(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01;burst(ac,band(ac,dest,0.12),t,0.07,0.8);}
// the open channel: a faint band-limited hiss
function startHiss(){const a=ctx();if(!a||hiss)return;const {ac,dest}=a;
  const s=ac.createBufferSource();s.buffer=noise(ac,2);s.loop=true;const g=ac.createGain();g.gain.value=0;
  s.connect(g).connect(band(ac,dest,0.05));s.start();g.gain.setTargetAtTime(0.5,ac.currentTime,0.05);hiss={s,g,ac};}
function stopHiss(){if(!hiss)return;const {s,g,ac}=hiss;hiss=null;try{g.gain.setTargetAtTime(0,ac.currentTime,0.03);s.stop(ac.currentTime+0.2);}catch(e){}}
