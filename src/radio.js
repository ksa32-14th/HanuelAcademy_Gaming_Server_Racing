// Team radio, as the broadcast's radio graphic: on the right, SURNAME (team colour) / RADIO, the car number over a waveform
// band that moves while the channel is open and the team badge, then the transcript — the driver's words right-aligned in
// the team colour, the team's left-aligned in white. Each call opens with the radio sound: RADIO_SFX (config.js), an
// audio file, when it is there — otherwise a beep and a burst of static synthesised here; a faint hiss runs under the
// call and it closes with a shorter beep (the synthesised one only).
// The team's lines are spoken (the browser's speech synthesis, an English voice — a British male one where the system
// has it); the driver's are text only. The next line comes once the voice has finished and the text has been up long
// enough to read.
// One call shows at a time: the next waits (urgent ones jump the queue), and a call that waited too long is dropped.
import {$,clamp} from './util.js?v=20261010z';
import {RADIO_SFX} from './config.js?v=20261010z';

let audio=()=>null,isMuted=()=>false,sfx=null,hiss=null;
let queue=[],cur=null,timers=[],waveT=0,gen=0;
const MAX_WAIT=12000; // ms a waiting call stays relevant
const WAVE_N=46;      // bars in the waveform band

// get: () => {ac, dest} | null — the game's audio context and its master bus (muted / paused with the game)
export function radioAudio(get){audio=get;}
// fn: () => true while the game's sound is off (N) or paused — the voice stays quiet then
export function radioMuted(fn){isMuted=fn;}

/* ---- the team's voice ---- */
const TTS=typeof window!=='undefined'&&window.speechSynthesis&&window.SpeechSynthesisUtterance?window.speechSynthesis:null;
let voice=null;
// the most human voice on offer: the neural ("Natural" / "Online") voices first — Edge has them, e.g. Ryan / Thomas (UK)
// or Guy / Andrew / Brian / Christopher (US) — then the older system voices; a man's voice, British before American
function pickVoice(){const en=TTS.getVoices().filter(v=>/^en[-_]/i.test(v.lang));
  const male=v=>/\bmale\b|ryan|thomas|george|daniel|arthur|oliver|guy|andrew|brian|christopher|eric|roger|steffan|david|mark/i.test(v.name)&&!/female/i.test(v.name);
  const neural=v=>/natural|online|neural/i.test(v.name),gb=v=>/en[-_]GB/i.test(v.lang);
  voice=en.find(v=>neural(v)&&male(v)&&gb(v))||en.find(v=>neural(v)&&male(v))||en.find(v=>male(v)&&gb(v))||en.find(male)||en.find(gb)||en[0]||null;}
if(TTS){pickVoice();TTS.addEventListener?TTS.addEventListener('voiceschanged',pickVoice):(TTS.onvoiceschanged=pickVoice);}
// sound off / paused mid-sentence: stop the voice now (the line's text stays up)
export function radioHush(){if(TTS)TTS.cancel();}
// speak a line; resolves when it has been said (or at once with no voice / sound off; at the latest after maxMs)
function speak(txt,maxMs){if(!TTS||isMuted())return Promise.resolve();
  if(!voice)pickVoice();if(!voice)return Promise.resolve(); // no English voice on this system: text only
  return new Promise(res=>{let done=false;const fin=()=>{if(!done){done=true;res();}};
    const u=new SpeechSynthesisUtterance(txt);u.voice=voice;u.lang=voice.lang;u.rate=1.08;u.pitch=1;u.volume=1; // (a shifted pitch makes a neural voice sound more synthetic, not less)
    u.onend=fin;u.onerror=fin;timers.push(setTimeout(fin,maxMs));TTS.speak(u);});}

// lines: [['team' | 'driver', text], …]; opt: {name, num, color, team, prio} (prio 2 = urgent: jumps the queue)
export function radioSay(lines,opt={}){
  if(!lines||!lines.length)return;
  const item={lines,name:opt.name||'',num:opt.num??'',color:opt.color||'#fff',team:opt.team||'',prio:opt.prio||1,at:performance.now()};
  if(cur){if(item.prio>=2){const i=queue.findIndex(q=>q.prio<2);queue.splice(i<0?queue.length:i,0,item);}else queue.push(item);
    if(queue.length>3)queue.splice(3);return;}
  play(item);}

// session over / back to the menu: close the channel and forget what was waiting
export function radioClear(){gen++;queue=[];timers.forEach(clearTimeout);timers=[];cur=null;if(TTS)TTS.cancel();stopHiss();wave(false);
  const r=$('radio');if(r)r.className='';}

// how long a line stays up before the next one: reading time, at least ~2.4 s
const lineMs=s=>clamp(1400+s.length*75,2400,6500);
const wait=ms=>new Promise(r=>timers.push(setTimeout(r,ms)));

async function play(item){const g=++gen;cur=item;timers.forEach(clearTimeout);timers=[];
  const r=$('radio'),body=$('rdBody');
  $('rdName').textContent=item.name;$('rdNum').textContent=item.num;r.style.setProperty('--tc',item.color);
  // the team badge: its initial (no logos of real teams)
  const lg=$('rdLogo');lg.textContent=(item.team.trim()[0]||'').toUpperCase();lg.title=item.team;
  body.innerHTML='';r.className='on';beepOpen();startHiss();wave(true);
  await wait(sfx?Math.min(900,sfx.duration*1000):450); // the radio sound first, then the words
  for(let k=0;k<item.lines.length;k++){if(g!==gen)return;const [who,txt]=item.lines[k];
    const p=document.createElement('p');p.className=who==='driver'?'rd-d':'rd-t';p.textContent=txt;body.appendChild(p);
    if(k>0)crackle();
    const t0=performance.now();if(who!=='driver')await speak(txt,lineMs(txt)+3000);if(g!==gen)return;
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
  if(!sfxDec)sfxDec=ac.decodeAudioData(sfxBytes.slice(0)).then(b=>(sfx=b)).catch(()=>{sfxBytes=null;return null;});return sfxDec;}
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
  if(f){f.then(b=>{if(!b)return;const s=ac.createBufferSource(),g=ac.createGain();g.gain.value=0.7;s.buffer=b;s.connect(g).connect(dest);s.start();});return;}
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
