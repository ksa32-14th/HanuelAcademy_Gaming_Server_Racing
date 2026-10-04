// Graphics quality presets + adaptive resolution.
//
// Every preset is a plain object; game.js reads the active one when it builds the renderer and
// again whenever the player changes it. `AUTO` picks a starting preset from the GPU and then
// keeps frame time near the display's budget by scaling the render resolution (dynamic
// resolution) instead of letting the frame rate collapse.

const dpr = () => window.devicePixelRatio || 1;

// Measured on an Iris Xe laptop: drawing the scene itself is cheap on the GPU (~5 ms @720p); the costs were draw-call
// submission on the CPU (~12 ms, plus the same again for the rear-view mirror) and the post-processing chain (~8 ms).
//   mirror: re-render the rear-view image every N-th frame · mirrorScale: its resolution · mirrorFar: its view distance
//   AA: fxaa (1 pass, ~1.5 ms on Iris Xe @720p) · smaa (3 passes, ~6 ms there) · msaa (hardware, dedicated GPUs only)
//   bloomScale: resolution of bloom's blur chain · LOW has no post effect at all, so it skips the composer entirely
export const PRESETS = {
  low:    {label:'LOW',    maxPR:1,   msaa:0, fxaa:false, smaa:false, shadow:1024, shadowSpan:60, shadowEvery:2, bloom:0,    bloomScale:0.5,  ao:false, aniso:4,  texRes:512,  mirror:3, mirrorScale:0.75, mirrorFar:260, stars:false},
  medium: {label:'MEDIUM', maxPR:1.5, msaa:0, fxaa:true,  smaa:false, shadow:2048, shadowSpan:80, shadowEvery:1, bloom:0.20, bloomScale:0.5,  ao:false, aniso:8,  texRes:1024, mirror:2, mirrorScale:0.85, mirrorFar:380, stars:true},
  high:   {label:'HIGH',   maxPR:2,   msaa:0, fxaa:false, smaa:true,  shadow:2048, shadowSpan:90, shadowEvery:1, bloom:0.26, bloomScale:0.75, ao:false, aniso:16, texRes:1024, mirror:2, mirrorScale:1,    mirrorFar:520, stars:true},
  ultra:  {label:'ULTRA',  maxPR:2,   msaa:4, fxaa:false, smaa:false, shadow:4096, shadowSpan:90, shadowEvery:1, bloom:0.28, bloomScale:1,    ao:true,  aniso:16, texRes:2048, mirror:1, mirrorScale:1,    mirrorFar:900, stars:true},
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
  // Discrete levels on purpose: every change re-allocates the render targets (a visible hitch), so the scaler must not
  // hunt. It steps down fast when frames are late, and only steps back up after ~10 s of headroom AND not into a level
  // that failed in the last minute.
  constructor() {
    this.levels = [1, 0.85, 0.72, 0.6, 0.5]; this.idx = 0;
    this.avg = 16.7; this.budget = 1000 / 60;
    this.slow = 0; this.fast = 0; this.enabled = true;
    this.failedAt = this.levels.map(() => -1e9);
    this.deltas = [];
    this.lastChange = -1e9;
  }
  get scale() { return this.levels[this.idx]; }
  set scale(v) { let b = 0; this.levels.forEach((l, i) => { if (Math.abs(l - v) < Math.abs(this.levels[b] - v)) b = i; }); this.idx = b; }
  get min() { return this.levels[this.levels.length - 1]; }
  // returns true when the scale changed (caller then re-applies the pixel ratio)
  tick(ms) {
    if (!this.enabled || ms > 250 || ms <= 0) return false; // tab switch / hitch: ignore
    if (this.deltas.length < 90) {                          // learn the display refresh rate once
      this.deltas.push(ms);
      if (this.deltas.length === 90) {
        const s = this.deltas.slice().sort((a, b) => a - b), med = s[45];
        this.budget = Math.max(1000 / 60, med) * 1.02;      // 30/45 Hz panels get a proportionally larger budget
      }
      return false;
    }
    // With GPU timings available, judge the GPU alone: a CPU-bound frame (slow JS / draw submission) gains nothing
    // from a lower resolution — it only gets blurrier — so frame interval is used only as a fallback.
    // (the learned frame budget is not used here: on a CPU-bound machine it is itself slow, and would let the GPU
    // load grow until the GPU became the bottleneck too — the GPU gets a fixed 60 fps budget instead)
    const g = this.gpuAvg, gb = 1000 / 60;
    if (g != null) {
      const up = this.idx > 0 ? g * (this.levels[this.idx - 1] / this.levels[this.idx]) ** 2 : Infinity;
      if (g > gb * 0.92) { this.slow++; this.fast = 0; }
      else if (up < gb * 0.72) { this.fast++; this.slow = 0; }
      else { this.slow = this.fast = 0; }
      this.avg = g;
    } else {
      this.avg += (ms - this.avg) * 0.1;
      if (this.avg > this.budget * 1.2) { this.slow++; this.fast = 0; }
      else if (this.avg < this.budget * 0.78) { this.fast++; this.slow = 0; }
      else { this.slow = this.fast = 0; }
    }
    const now = performance.now();
    // every change re-allocates the composer targets: at most one change per COOLDOWN, whichever direction
    if (now - this.lastChange < ResolutionScaler.COOLDOWN) return false;
    if (this.slow > 25 && this.idx < this.levels.length - 1) {
      this.failedAt[this.idx] = now;
      this.idx = Math.min(this.levels.length - 1, this.idx + (this.avg > this.budget * 1.8 ? 2 : 1));
      this.slow = 0; this.avg = this.budget; this.gpuAvg = null; this.lastChange = now; return true;
    }
    // GPU-measured headroom is reliable, so it may climb back after ~3 s instead of ~10 s
    if (this.fast > (g != null ? 180 : 600) && this.idx > 0 && now - this.failedAt[this.idx - 1] > 60000) {
      this.idx--; this.fast = 0; this.avg = this.budget; this.gpuAvg = null; this.lastChange = now; return true;
    }
    return false;
  }
  static COOLDOWN = 10000;
  // feed one frame's measured GPU time (ms)
  gpu(ms) { if (!(ms > 0 && ms < 250)) return; this.gpuAvg = this.gpuAvg == null ? ms : this.gpuAvg + (ms - this.gpuAvg) * 0.1; }
  reset() { this.idx = 0; this.slow = this.fast = 0; this.gpuAvg = null; this.failedAt = this.levels.map(() => -1e9); }
}

// GPU frame timer (EXT_disjoint_timer_query_webgl2). begin()/end() bracket everything drawn in a frame; results
// arrive a few frames later and are handed out by poll(). Returns nothing when the extension is unavailable.
export class GpuTimer {
  constructor(gl) {
    this.gl = gl; this.ext = null; this.pending = []; this.open = null;
    try { this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) {}
  }
  get ok() { return !!this.ext; }
  // after a context restore: the old queries are gone and the extension object belongs to the lost context
  reset() { this.pending = []; this.open = null; try { this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { this.ext = null; } }
  begin() {
    if (!this.ext || this.open || this.pending.length > 4) return;
    const q = this.gl.createQuery(); this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.open = q;
  }
  end() { if (!this.open) return; this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.open); this.open = null; }
  poll() {
    const gl = this.gl; let out = null;
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) out = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
    }
    return out;
  }
}

export function pixelRatioFor(q, scale) {
  return Math.max(0.5, Math.min(dpr(), q.maxPR) * scale);
}
