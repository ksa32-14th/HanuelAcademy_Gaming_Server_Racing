// Circuit selection, regulation / vehicle constants, teams and drivers.
import {TRACKS} from './data/tracks.js?v=20261007r';
import {clamp} from './util.js?v=20261007r';
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
// Player car only (see slideStep()): front and rear tyres are separate, and the rears share their grip between drive
// and cornering. TC_P: the share of the rear grip the (lighter) traction control lets the throttle use — what is left
// is all the rears have for cornering, so a big throttle in a slow corner steps the tail out. SLIDE: how far a rear
// tyre past its peak drops off (0 = the old planted model, 1 = a slide keeps going until it is countersteered).
export const TC_P=0.72, SLIDE=0.5;
// mechanical grip is lower at low speed (no downforce to lean on, tyres slide more easily)
export const gripV=v=>0.84+0.16*Math.min(1,v/55);
export const PITWALL=HW+3.5, PIT_HW=6, PIT_OFF=PITWALL+1+PIT_HW+1, PIT_LIMIT=60/3.6;
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
// speed of each gear at 12 000 rpm (km/h). The gearbox shifts on the engine revs (see updateGear in game.js): up at
// 11 500 rpm, down when the revs fall below ~7 600. 1st and 2nd are short so the car is out of them quickly
export const GEARS=[75,115,155,195,235,270,305,360];
export const FUEL_PER_LAP=1.72*TRACK_LEN/5063;

export const TEAMS=[
 {name:'Spica Motors Racing Team',c:0xd90008,a:0xf6f6f6},{name:'Felis Racing Team',c:0x12379e,a:0xffd400},
 {name:'Marfic Racing Team',c:0xb9c0c9,a:0x35e0be},{name:'Papaya Motors Racing Team',c:0xff7a00,a:0x1e88ff},
 {name:'Emeralian Racing Team',c:0x0b7a4b,a:0xc3ed3a},{name:'Alphecca Motors Racing Team',c:0x8c0f22,a:0xffd400},
 {name:'Capella Racing Team',c:0xff4fa3,a:0x0e2456},{name:'Obsidman Racing Team',c:0x1b1d21,a:0xe8322a},
 {name:'Forza Motors Racing Team',c:0x7b3fe4,a:0xffd23f},{name:'Vega Racing Team',c:0xffcf00,a:0x141414}];
export const DRIVERS=[['ARN','A. Arnaud'],['BEL','B. Bellamy'],['CRS','C. Carsten'],['DMN','D. Damon'],['EVR','E. Everly'],['FAL','F. Falk'],
 ['GRT','G. Grant'],['HOL','H. Holm'],['IVN','I. Ivanov'],['JNS','J. Jansen'],['KOV','K. Kovac'],['LRS','L. Lars'],['MRT','M. Moretti'],
 ['NKS','N. Nakasone'],['OKA','O. Okafor'],['PRZ','P. Perez-Ruiz'],['QIN','Q. Qin'],['RYD','R. Ryder'],['STN','S. Stone'],['TAV','T. Tavares']];

