// Circuit selection, regulation / vehicle constants, teams and drivers.
import {TRACKS} from './data/tracks.js?v=20261011d';
import {clamp} from './util.js?v=20261011d';
export let TRACK_ID='singapore';
try{const h=location.hash.slice(1);const o=JSON.parse(localStorage.getItem('hrc-opts')||'{}');if(TRACKS[h])TRACK_ID=h;else if(TRACKS[o.optTrack])TRACK_ID=o.optTrack;}catch(e){}
export const TR=TRACKS[TRACK_ID];
// time of day: a circuit may offer several (`times`, the first is its default); the choice is read once at load
export const TIMES=TR.times||[TR.day?'day':'night'];
export let TOD=TIMES[0];
try{const o=JSON.parse(localStorage.getItem('hrc-opts')||'{}');if(o.tod&&o.tod[TRACK_ID]&&TIMES.includes(o.tod[TRACK_ID]))TOD=o.tod[TRACK_ID];}catch(e){}

/* ================= REGULATION / VEHICLE CONSTANTS ================= */
// track width 15 m (was 20 m — far wider than a real F1 street circuit's 12–15 m); the grid columns sit ±3.9 m apart
export const TRACK_LEN=TR.len, W=15, HW=W/2, GRID_D=3.9, KERB_W=1.6;
// car body scale (length, height, width) and wheel scale. The model is built to the real 2022 F1 dimensions (5.6 × 2.0 m)
// and drawn a little larger, so it reads as big on screen as before (collision box and track limits scale with it)
export const CAR_SX=1.05, CAR_SY=1.18, CAR_SZ=1.2, WHEEL_S=1.18;
// track limits: a violation only when the whole car is beyond the kerb (lenient street-circuit limit)
export const TL_EDGE=HW+KERB_W+1.2*CAR_SZ;
// CdA tuned for ~330 km/h flat out, more with DRS/tow. There is NO artificial speed cap: top speed is
// wherever power runs out against drag. VMAX is only the planning ceiling for the AI speed profile
// TRACTION: the share of the tyre grip the driven rear wheels can put down as drive before they spin. Traction control
// is only light (TC_SLACK): the driver may ask for up to 1.25× that before it intervenes; beyond, the wheels spin —
// less drive, less cornering grip, revs flaring (see physics()).
export const G=9.81, RHO=1.2, MASS=798, POWER=700000, CDA=1.514, CLA=5.0, MU=1.55, CRR=0.012, WB=3.6, VMAX=420/3.6, TRACTION=0.62, TC_SLACK=1.25;
// brake grip as a fraction of the tyre's cornering grip. Below 1 the brakes cannot stand the car on
// its nose, so the braking zone is long enough that you have to place the car for the corner in it —
// which is what makes out-in-out necessary instead of optional.
export const BRK=0.90;
// brake grip at low speed: below BRK_V (200 km/h) the brakes get better in a straight line as the speed falls, up to
// 1 + BRK_LOW (+30 %) at a standstill — without downforce the tyres alone used to stop the car feebly in slow corners.
// Multiplies the braking force and the tyres' longitudinal grip budget for braking (the friction ellipse's long axis).
const BRK_V=200/3.6,BRK_LOW=0.30;
export const brakeK=v=>v>=BRK_V?1:1+BRK_LOW*(1-Math.max(0,v)/BRK_V);
// Player car only (see slideStep()): front and rear tyres are separate, and the rears share their grip between drive
// and cornering. TC_P: the share of the rear grip the (lighter) traction control lets the throttle use — what is left
// is all the rears have for cornering, so a big throttle in a slow corner steps the tail out. SLIDE: how far a rear
// tyre past its peak drops off (0 = the old planted model, 1 = a slide keeps going until it is countersteered).
export const TC_P=0.72, SLIDE=0.5;
// mechanical grip is lower at low speed (no downforce to lean on, tyres slide more easily)
export const gripV=v=>0.84+0.16*Math.min(1,v/55);
// steering lock (rad): falls in a straight line with speed, from LOCK0 standing still to LOCK1 at LOCK_V (300 km/h) and
// stays there above. 0.30 rad is a ~11.6 m minimum turning radius at a crawl (the original 0.26 / (1 + v/70) gave
// ~13.5 m); above ~50 km/h the tyres' grip (dGrip) is the tighter limit anyway, so fast corners are unchanged
const LOCK0=0.30,LOCK1=0.12,LOCK_V=300/3.6;
export const steerLock=v=>LOCK0-(LOCK0-LOCK1)*Math.min(1,Math.max(0,v)/LOCK_V);
// `pitWallGap`: track edge to pit wall (3.5 m; Seoul squeezes the lane onto Sejong-daero's other carriageway)
export const PITWALL=HW+(TR.pitWallGap??3.5), PIT_HW=6, PIT_OFF=PITWALL+1+PIT_HW+1, PIT_LIMIT=60/3.6;
// the 12 m lane is split in two: the fast lane by the pit wall and the working lane in front of the garages, where
// each team's box is painted (BOX_D = lateral offset of the box centre from the lane centre)
export const BOX_D=3.0, FAST_D=-2.6;
// pit lane (signed metres from start line): A = where it peels off the circuit, B = fully alongside
// behind the pit wall, L = 60 km/h limiter line, C/D = merge back. A track may move the entry
// (`pitEntry`) — then A/B are worked out from the geometry once the circuit exists.
export const COMP={S:{name:'SOFT',grip:1.0,rate:1/(18*5.063),col:'#ff2d2d',hex:0xff2d2d},
            M:{name:'MEDIUM',grip:0.975,rate:1/(28*5.063),col:'#ffd200',hex:0xffd200},
            H:{name:'HARD',grip:0.95,rate:1/(40*5.063),col:'#f2f2f2',hex:0xf2f2f2}};
export const POINTS=[25,18,15,12,10,8,6,4,2,1];
// Time Trial leaderboard server: a Firebase Realtime Database URL (e.g. 'https://<project>-default-rtdb.<region>.
// firebasedatabase.app'). Empty = the board is kept in each browser only. Setup: README → Time Trial.
export const LB_URL='https://hrc-racing-leader-board-default-rtdb.asia-southeast1.firebasedatabase.app';
export const DRS_GAP=3.0, DRS_FROM_LAP=1; // house rule: DRS within 3 s, available from lap 1
// team radio sound: the audio file played each time the radio opens (one you have the rights to use). While the file
// isn't there (or RADIO_SFX is ''), radio.js plays a synthesised beep instead
export const RADIO_SFX='sounds/team-radio.mp3';
// speed of each gear at 18 000 rpm, the engine's maximum (km/h). The gearbox shifts on the engine revs (see updateGear
// in game.js): up at 17 250 rpm, down when the revs fall below ~11 400. 1st and 2nd are short so the car is out of them quickly
export const GEARS=[75,115,155,195,235,270,305,360];
export const FUEL_PER_LAP=1.72*TRACK_LEN/5063;

// the 2026 Formula 1 grid without Audi: ten teams, twenty cars. In 2025 constructors' order (Cadillac, new, last) — the
// AI's pace follows this order (setupSession). c: the car's main livery colour, a: its second colour; ui: the team colour
// of the TV graphics (timing tower, minimap, radio, results) — readable on a dark panel where the livery is navy or black.
// d: the two race drivers [code, name, car number]; the player takes the first seat of the chosen team (and its number).
export const TEAMS=[
 {name:'McLaren F1 Team',c:0xff8000,a:0x1c1c20,ui:0xff8000,d:[['NOR','L. Norris',1],['PIA','O. Piastri',81]]},
 {name:'Mercedes-AMG F1 Team',c:0xc4c9cf,a:0x00d2be,ui:0x27f4d2,d:[['RUS','G. Russell',63],['ANT','K. Antonelli',12]]},
 {name:'Red Bull Racing',c:0x1e2a58,a:0xffc906,ui:0x3671c6,d:[['VER','M. Verstappen',3],['HAD','I. Hadjar',6]]},
 {name:'Scuderia Ferrari',c:0xdc0000,a:0xf5f5f5,ui:0xe8002d,d:[['LEC','C. Leclerc',16],['HAM','L. Hamilton',44]]},
 {name:'Williams Racing',c:0x0b2a6f,a:0x64c4ff,ui:0x64c4ff,d:[['ALB','A. Albon',23],['SAI','C. Sainz',55]]},
 {name:'Racing Bulls',c:0xf2f4f8,a:0x1d3fcf,ui:0x6692ff,d:[['LAW','L. Lawson',30],['LIN','A. Lindblad',41]]},
 {name:'Aston Martin F1 Team',c:0x00594f,a:0xcedc00,ui:0x229971,d:[['ALO','F. Alonso',14],['STR','L. Stroll',18]]},
 {name:'Haas F1 Team',c:0xe9e9e9,a:0xd0021b,ui:0xb6babd,d:[['OCO','E. Ocon',31],['BEA','O. Bearman',87]]},
 {name:'Alpine F1 Team',c:0x0067b9,a:0xff87bc,ui:0x0093cc,d:[['GAS','P. Gasly',10],['COL','F. Colapinto',43]]},
 {name:'Cadillac F1 Team',c:0x161616,a:0xf2f2f2,ui:0xd4d4d4,d:[['PER','S. Perez',11],['BOT','V. Bottas',77]]}];

