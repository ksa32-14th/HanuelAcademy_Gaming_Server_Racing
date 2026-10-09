// Entry point: let the loading screen paint first, then pull in the (large) game module.
// (rAF alone is not enough: background tabs never fire it, which would stall loading forever.)
const txt = document.getElementById('loadTxt');
await new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 80); });
try {
  await import('./game.js?v=20261009r');
} catch (e) {
  console.error(e);
  if (txt) { txt.textContent = 'Failed to start: ' + (e && e.message || e); txt.style.color = '#ff6a5a'; }
}
