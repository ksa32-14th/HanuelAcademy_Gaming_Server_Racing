// Graphics quality presets + adaptive resolution.
//
// Every preset is a plain object; game.js reads the active one when it builds the renderer and
// again whenever the player changes it. `AUTO` picks a starting preset from the GPU and then
// keeps frame time near the display's budget by scaling the render resolution (dynamic
// resolution) instead of letting the frame rate collapse.

const dpr = () => window.devicePixelRatio || 1;

export const PRESETS = {
  low:    {label:'LOW',    maxPR:1,   msaa:0, smaa:false, shadow:1024, shadowSpan:60, shadowEvery:2, bloom:0,    bloomRes:0.5, ao:false, aniso:2,  texRes:256,  mirror:0,   mirrorScale:0.5,  stars:false},
  medium: {label:'MEDIUM', maxPR:1.25,msaa:0, smaa:false, shadow:2048, shadowSpan:80, shadowEvery:1, bloom:0.20, bloomRes:0.5, ao:false, aniso:4,  texRes:512,  mirror:3,   mirrorScale:0.6,  stars:true},
  high:   {label:'HIGH',   maxPR:1.5, msaa:0, smaa:true, shadow:2048, shadowSpan:90, shadowEvery:1, bloom:0.26, bloomRes:0.75,ao:false, aniso:8,  texRes:512,  mirror:2,   mirrorScale:0.85, stars:true},
  ultra:  {label:'ULTRA',  maxPR:2,   msaa:4, smaa:false, shadow:4096, shadowSpan:90, shadowEvery:1, bloom:0.28, bloomRes:1,   ao:true,  aniso:16, texRes:1024, mirror:1,   mirrorScale:1,    stars:true},
};
export const ORDER = ['low', 'medium', 'high', 'ultra'];
export const MODES = ['auto', ...ORDER];

const KEY = 'hrc-quality';
export function loadMode() {
  try { const m = localStorage.getItem(KEY); if (MODES.includes(m)) return m; } catch (e) {}
  return 'auto';
}
export function saveMode(m) { try { localStorage.setItem(KEY, m); } catch (e) {} }

// Rough GPU classification for AUTO. Integrated / mobile GPUs start on MEDIUM, everything else on HIGH.
// The dynamic-resolution scaler below takes care of the rest, so a wrong guess is cheap.
export function detectPreset(gl) {
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch (e) {}
  const n = name.toLowerCase();
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /mac/i.test(navigator.platform));
  if (mobile) return 'low';
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'low';
  if (/rtx|rx 6[6-9]|rx 7|radeon pro|apple m[2-9]|arc a[5-9]|gtx 1[0-9]|gtx 16|rx 5[6-9]|rx 6/.test(n)) return 'high';
  if (/intel|uhd|iris|apple m1|mali|adreno|vega|radeon\(tm\)|microsoft/.test(n)) return 'medium';
  return 'high';
}

// Dynamic resolution: keeps a moving average of the frame interval; if the GPU cannot hold the
// budget the render scale drops in small steps, and it creeps back up when there is headroom.
export class ResolutionScaler {
  constructor() {
    this.scale = 1; this.min = 0.5; this.max = 1;
    this.avg = 16.7; this.budget = 1000 / 60;
    this.slow = 0; this.fast = 0; this.enabled = true; this.warm = 0;
    this.deltas = [];
  }
  // returns true when the scale changed (caller then re-applies the pixel ratio)
  tick(ms) {
    if (!this.enabled || ms > 250 || ms <= 0) return false; // tab switch / hitch: ignore
    if (this.deltas.length < 90) {                          // learn the display refresh rate once
      this.deltas.push(ms);
      if (this.deltas.length === 90) {
        const s = this.deltas.slice().sort((a, b) => a - b), med = s[45];
        // 30 Hz / 45 Hz panels get a proportionally larger budget; 60 Hz and above target 60 fps
        this.budget = Math.max(1000 / 60, med) * 1.02;
      }
      return false;
    }
    this.avg += (ms - this.avg) * 0.08;
    if (this.avg > this.budget * 1.22) { this.slow++; this.fast = 0; }
    else if (this.avg < this.budget * 0.8) { this.fast++; this.slow = 0; }
    else { this.slow = this.fast = 0; }
    if (this.slow > 20 && this.scale > this.min) { // pixel cost is ~linear in area: jump straight toward the scale that meets the budget
      const want = this.scale * Math.sqrt(this.budget / this.avg) * 0.95;
      this.scale = Math.max(this.min, +Math.max(this.scale - 0.3, want).toFixed(2)); this.slow = 0; this.avg = this.budget; return true; }
    if (this.fast > 240 && this.scale < this.max) { this.scale = Math.min(this.max, +(this.scale + 0.05).toFixed(2)); this.fast = 0; return true; }
    return false;
  }
  reset() { this.scale = 1; this.slow = this.fast = 0; }
}

export function pixelRatioFor(q, scale) {
  return Math.max(0.5, Math.min(dpr(), q.maxPR) * scale);
}
