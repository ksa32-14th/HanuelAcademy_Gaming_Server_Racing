// Team radio, as the broadcast's radio graphic: on the right, SURNAME (team colour) / RADIO, the car number over a waveform
// band that moves while the channel is open and the team badge, then the transcript — the driver's words right-aligned in
// the team colour, the team's left-aligned in white.
// The lines come from sounds/radio/lines.json (id -> [who, text]; who: e = race engineer, d = driver) and are spoken from
// voice files, sounds/radio/<id>.mp3 (tools/radio-voices.ps1 makes them; voices.json lists the ones that exist): the
// engineer and the driver are different voices, and each goes through its own radio — the pit wall's clearer, the car's
// muffled, with a low engine rumble under it. A line without a file is text only.
// Sound of the channel: the radio sound (RADIO_SFX, config.js) as it opens, then the static of a real team radio under
// the words — band-limited hiss that flutters, crackles and clicks, now and then breaking up — and a squelch as it closes.
// One call shows at a time: the next waits (urgent ones jump the queue; a low-priority one is dropped if the channel is
// busy), and a call that waited too long is dropped.
import {$,clamp} from './util.js?v=20261011e';
import {RADIO_SFX} from './config.js?v=20261011e';

const VOICE_DIR='sounds/radio/';
// the lines (id -> [who, text]): loaded before the game starts
export const LINES=await fetch(VOICE_DIR+'lines.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
let audio=()=>null,isMuted=()=>false,sfx=null,hiss=null;
let queue=[],cur=null,timers=[],waveT=0,gen=0;
const MAX_WAIT=12000; // ms a waiting call stays relevant
const WAVE_N=46;      // bars in the waveform band

// get: () => {ac, dest} | null — the game's audio context and its master bus (muted / paused with the game)
export function radioAudio(get){audio=get;}
// fn: () => true while the game's sound is off (N) or paused — no voice then (the text only)
export function radioMuted(fn){isMuted=fn;}

/* ---- the voices: recorded files ---- */
const clips=new Map(); // id -> Promise<AudioBuffer | null>
// sounds/radio/voices.json: the ids that have a file — no request for a line without one
let have=new Set();const haveP=fetch(VOICE_DIR+'voices.json').then(r=>r.ok?r.json():[]).then(a=>{have=new Set(a);}).catch(()=>{});
function clip(ac,id){if(!have.has(id))return Promise.resolve(null);
  if(!clips.has(id))clips.set(id,fetch(VOICE_DIR+id+'.mp3').then(r=>r.ok?r.arrayBuffer():null)
    .then(b=>b?ac.decodeAudioData(b):null).catch(()=>null));return clips.get(id);}
// all the lines, fetched in the background the first time the radio opens (so later calls start without a delay)
let preloaded=false;
function preload(ac){if(preloaded)return;preloaded=true;haveP.then(()=>{for(const id of have)clip(ac,id);});}
const F=(ac,type,f,q,gain)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;if(gain!=null)b.gain.value=gain;return b;};
const shaper=(ac,k)=>{const sh=ac.createWaveShaper(),cv=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;cv[i]=Math.tanh(k*x)/Math.tanh(k);}sh.curve=cv;return sh;};
// a radio: the voice squeezed into a narrow band, driven into the grit and compressed hard, as team radio sounds on TV.
// The pit wall's (engineer) is the clearer one. The car's (driver) is muffled — the helmet mic's dull, boxy band, the top
// rolled off — with the low rumble of the engine running under it (engineBed)
function voiceChain(ac,dest,who){const drv=who==='driver';
  const hp=F(ac,'highpass',drv?260:320,0.7),lp=F(ac,'lowpass',drv?1900:3400,drv?0.6:0.9),pk=F(ac,'peaking',drv?700:1800,drv?0.8:1,drv?4:5),sh=shaper(ac,drv?2.4:2.0);
  const cp=ac.createDynamicsCompressor();cp.threshold.value=-28;cp.ratio.value=8;cp.attack.value=0.002;cp.release.value=0.12;
  const g=ac.createGain();g.gain.value=drv?1.0:1.1;hp.connect(lp).connect(pk).connect(sh).connect(cp).connect(g).connect(dest);return hp;}
// the car behind the driver's words: a low, dull engine rumble — no whine, no wobble — that sits just over the bottom of
// the voice: deep noise rolled off below ~260 Hz plus a soft low hum, a touch saturated, straight to the output (the
// voice's high-pass would strip it)
function engineBed(ac,dest,t0,t1){const out=ac.createGain(),L=0.22;
  out.gain.setValueAtTime(0,t0);out.gain.linearRampToValueAtTime(L,t0+0.12);out.gain.setValueAtTime(L,Math.max(t0+0.13,t1-0.15));out.gain.linearRampToValueAtTime(0,t1+0.05);
  const sh=shaper(ac,1.6),lp=F(ac,'lowpass',260,0.5);lp.connect(sh).connect(out).connect(dest);
  const n=ac.createBufferSource();n.buffer=noiseBuf(ac);n.loop=true;n.playbackRate.value=0.5;const ng=ac.createGain();ng.gain.value=0.9;
  n.connect(F(ac,'lowpass',180,0.5)).connect(ng).connect(lp);n.start(t0,Math.random()*2);n.stop(t1+0.1);
  for(const [f,v] of [[62,0.35],[124,0.22]]){const o=ac.createOscillator(),gv=ac.createGain();o.type='triangle';o.frequency.value=f*(0.98+Math.random()*0.04);
    gv.gain.value=v;o.connect(gv).connect(lp);o.start(t0);o.stop(t1+0.1);}}
let voiceNow=[];
// sound off / paused mid-sentence: stop the voice now (the line's text stays up)
export function radioHush(){for(const s of voiceNow){try{s.stop();}catch(e){}}voiceNow=[];}
// play a line's files one after another; resolves when they have been said (at once with no sound, or a file missing)
async function sayClips(ids,who,maxMs){ids=ids.filter(Boolean);const a=ctx();if(!a||isMuted()||!ids.length)return;const {ac,dest}=a;
  const bufs=await Promise.all(ids.map(id=>clip(ac,id)));if(bufs.some(b=>!b)||isMuted())return;
  const inp=voiceChain(ac,dest,who),t0=ac.currentTime+0.03;let t=t0;voiceNow=[];
  for(const b of bufs){const s=ac.createBufferSource();s.buffer=b;s.connect(inp);s.start(t);voiceNow.push(s);t+=b.duration+0.05;}
  if(who==='driver')engineBed(ac,dest,t0,t);
  await wait(Math.min(maxMs,(t-ac.currentTime)*1000));}

/* ---- the calls ---- */
// a value read out: a lap time "1:32.456" → one, thirty-two, point, four, five, six ("1:05.2": one, oh five, point, two);
// seconds "28.4"; a whole number up to 59 (a position, "P5" too). Each word its own file (n0 … n59, oh, point)
function sayValue(v){v=String(v).trim().replace(/^P/i,'');let m;const dig=s=>[...s].map(d=>'n'+d);
  if((m=v.match(/^(\d+):(\d{2})\.(\d+)$/))){const s=+m[2];return ['n'+(+m[1]),...(s<10?['oh','n'+s]:['n'+s]),'point',...dig(m[3])];}
  if((m=v.match(/^(\d+)\.(\d+)$/))&&+m[1]<60)return ['n'+(+m[1]),'point',...dig(m[2])];
  if(/^\d+$/.test(v)&&+v<60)return ['n'+(+v)];
  return null;}
// a line: an id from lines.json; [id, {placeholder: value}] for one with {placeholders} — its words are the files id_a,
// id_b … (the text between the placeholders) with the values read out between them; or ['team' | 'driver', text, voice]
function resolve(x){
  if(typeof x==='string'||(Array.isArray(x)&&x.length===2&&typeof x[1]==='object'&&x[1]&&!Array.isArray(x[1]))){
    const id=Array.isArray(x)?x[0]:x,vars=Array.isArray(x)?x[1]:{},l=LINES[id];if(!l)return null;
    if(!/\{/.test(l[1]))return [l[0]==='d'?'driver':'team',l[1],id];
    const text=l[1].replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m),parts=l[1].split(/\{(\w+)\}/);let voice=[],n=0;
    for(let i=0;i<parts.length;i++){
      if(i%2){const w=sayValue(vars[parts[i]]);if(!w){voice=null;break;}voice.push(...w);}
      else if(/[a-z]/i.test(parts[i]))voice.push(id+'_'+'abcdefgh'[n++]);else n++;}
    return [l[0]==='d'?'driver':'team',text,voice];}
  return x;}
// lines: a list of lines (see resolve); opt: {name, num, color, team, prio} — prio 2 urgent (jumps the queue), 1 normal,
// 0 low (only when the channel is free)
export function radioSay(lines,opt={}){
  lines=(lines||[]).map(resolve).filter(Boolean);if(!lines.length)return;
  const item={lines,name:opt.name||'',num:opt.num??'',color:opt.color||'#fff',team:opt.team||'',prio:opt.prio??1,at:performance.now()};
  if(cur){if(item.prio===0)return;
    if(item.prio>=2){const i=queue.findIndex(q=>q.prio<2);queue.splice(i<0?queue.length:i,0,item);}else queue.push(item);
    if(queue.length>3)queue.splice(3);return;}
  play(item);}
// is anything on the radio now (or waiting)?
export const radioBusy=()=>!!cur||queue.length>0;

// session over / back to the menu: close the channel and forget what was waiting
export function radioClear(){gen++;queue=[];timers.forEach(clearTimeout);timers=[];cur=null;radioHush();stopHiss();wave(false);
  const r=$('radio');if(r)r.className='';}

// how long a line stays up before the next one: reading time, at least ~2 s
const lineMs=s=>clamp(1300+s.length*70,2000,6500);
const wait=ms=>new Promise(r=>timers.push(setTimeout(r,ms)));

async function play(item){const g=++gen;cur=item;timers.forEach(clearTimeout);timers=[];
  const r=$('radio'),body=$('rdBody'),a=ctx();if(a)preload(a.ac);
  $('rdName').textContent=item.name;$('rdNum').textContent=item.num;r.style.setProperty('--tc',item.color);
  // the team badge: its initial (no logos of real teams)
  const lg=$('rdLogo');lg.textContent=(item.team.trim()[0]||'').toUpperCase();lg.title=item.team;
  body.innerHTML='';r.className='on';beepOpen();startHiss();wave(true);
  await wait(sfx?Math.min(900,sfx.duration*1000)+60:450); // the radio sound first, then the words
  for(let k=0;k<item.lines.length;k++){if(g!==gen)return;const [who,txt,vo]=item.lines[k];
    const p=document.createElement('p');p.className=who==='driver'?'rd-d':'rd-t';p.textContent=txt;body.appendChild(p);
    if(k>0)crackle();
    const t0=performance.now();if(vo)await sayClips(Array.isArray(vo)?vo:[vo],who,lineMs(txt)+4000);if(g!==gen)return;
    // after the voice: what is left of the reading time (a short pause at least)
    await wait(Math.max(vo?300:0,lineMs(txt)-(performance.now()-t0)));}
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

/* ---- sound of the channel ---- */
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
// the radio's band for the static and the clicks: telephone-narrow and driven into grit
function band(ac,dest,gain){const hp=F(ac,'highpass',450,0.7),lp=F(ac,'lowpass',3000,0.7),pk=F(ac,'peaking',2200,1.2,4),sh=shaper(ac,3);
  const g=ac.createGain();g.gain.value=gain;hp.connect(lp).connect(pk).connect(sh).connect(g).connect(dest);return hp;}
let _noise=null;
function noiseBuf(ac){if(_noise&&_noise.sampleRate===ac.sampleRate)return _noise;
  const b=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return (_noise=b);}
// the static of an open team-radio channel, 4 s that loop: hiss whose level flutters (a slow random wobble and a fast
// one), sharp clicks and crackles scattered through it, short bursts where the signal frays, and the odd dropout
let _static=null;
function staticBuf(ac){if(_static&&_static.sampleRate===ac.sampleRate)return _static;
  const sr=ac.sampleRate,n=sr*4,b=ac.createBuffer(1,n,sr),d=b.getChannelData(0);
  let slow=0.7,fast=1,ts=0.7,tf=1;
  for(let i=0;i<n;i++){if(i%Math.round(sr*0.09)===0)ts=0.45+Math.random()*0.5;if(i%Math.round(sr*0.012)===0)tf=0.6+Math.random()*0.8;
    slow+=(ts-slow)*0.0006;fast+=(tf-fast)*0.02;d[i]=(Math.random()*2-1)*0.35*slow*fast;}
  const ev=(rate,f)=>{let t=Math.random()/rate;while(t<4){f(Math.floor(t*sr));t+=-Math.log(1-Math.random())/rate;}};
  // clicks: single sharp spikes with a short ring
  ev(14,i=>{const a=(Math.random()<0.5?-1:1)*(0.8+Math.random()*1.2),L=Math.round(sr*(0.0008+Math.random()*0.002));
    for(let j=0;j<L&&i+j<n;j++)d[i+j]+=a*Math.exp(-j/(L*0.25))*(j%2?-1:1);});
  // crackle: little clusters of pops
  ev(5,i=>{const L=Math.round(sr*(0.01+Math.random()*0.03));for(let j=0;j<L&&i+j<n;j++)if(Math.random()<0.06)d[i+j]+=(Math.random()*2-1)*1.4;});
  // fraying: a louder, rougher burst
  ev(1.6,i=>{const L=Math.round(sr*(0.02+Math.random()*0.07)),g=1.5+Math.random()*1.5;for(let j=0;j<L&&i+j<n;j++)d[i+j]*=g*Math.sin(Math.PI*j/L)+1;});
  // dropouts: the signal all but gone for a moment
  ev(0.7,i=>{const L=Math.round(sr*(0.015+Math.random()*0.04));for(let j=0;j<L&&i+j<n;j++)d[i+j]*=0.12;});
  for(let i=0;i<n;i++)d[i]=Math.max(-1,Math.min(1,d[i]));
  return (_static=b);}
function burst(ac,inp,t0,dur,vol,f0,f1){const s=ac.createBufferSource();s.buffer=noiseBuf(ac);const bp=F(ac,'bandpass',f0||2000,0.9),g=ac.createGain();
  if(f1)bp.frequency.exponentialRampToValueAtTime(f1,t0+dur);
  g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.001,t0+dur);s.connect(bp).connect(g).connect(inp);s.start(t0,Math.random());s.stop(t0+dur+0.05);}
function tone(ac,inp,f,t0,dur,vol){const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.value=f;
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+0.004);g.gain.setValueAtTime(vol,t0+dur-0.01);g.gain.linearRampToValueAtTime(0,t0+dur);
  o.connect(g).connect(inp);o.start(t0);o.stop(t0+dur+0.02);}
// opening: the radio sound (file), or a squelch and the two-note digital beep
function beepOpen(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01;
  const f=getSfx(ac);
  if(f){f.then(x=>{if(!x)return;const s=ac.createBufferSource(),g=ac.createGain();g.gain.value=x.gain*0.8;s.buffer=x.buf;s.connect(g).connect(dest);
    s.start(ac.currentTime+0.005,x.start,x.duration);});return;}
  const inp=band(ac,dest,0.16);burst(ac,inp,t,0.09,0.9);tone(ac,inp,1180,t+0.05,0.07,0.5);tone(ac,inp,1580,t+0.13,0.11,0.5);burst(ac,inp,t+0.24,0.12,0.35);}
// closing: the key let go — a short rush of static that drops away ("kssht"), plus the reverse beep without a sound file
function beepClose(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01,inp=band(ac,dest,0.14);
  burst(ac,inp,t,0.16,1.0,3200,900);
  if(!(sfx||sfxBytes)){tone(ac,inp,1580,t+0.04,0.05,0.4);tone(ac,inp,1180,t+0.1,0.07,0.4);}}
// a click of static between two speakers (the other side keying the radio)
function crackle(){const a=ctx();if(!a)return;const {ac,dest}=a;const t=ac.currentTime+0.01,inp=band(ac,dest,0.13);
  burst(ac,inp,t,0.05,1.0,2600);burst(ac,inp,t+0.06,0.08,0.6,1800,1100);}
// the open channel: the static under everything
function startHiss(){const a=ctx();if(!a||hiss)return;const {ac,dest}=a;
  const s=ac.createBufferSource();s.buffer=staticBuf(ac);s.loop=true;const g=ac.createGain();g.gain.value=0;
  s.connect(g).connect(band(ac,dest,0.07));s.start(0,Math.random()*4);g.gain.setTargetAtTime(1,ac.currentTime,0.03);hiss={s,g,ac};}
function stopHiss(){if(!hiss)return;const {s,g,ac}=hiss;hiss=null;try{g.gain.setTargetAtTime(0,ac.currentTime,0.025);s.stop(ac.currentTime+0.2);}catch(e){}}
