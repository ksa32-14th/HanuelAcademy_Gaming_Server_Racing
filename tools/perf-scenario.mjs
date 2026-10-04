// Runs the fixed measurement scenario (tools/README.md) in Chromium and prints the result JSON.
//   npm i -D playwright && npx playwright install chromium
//   powershell -ExecutionPolicy Bypass -File serve.ps1      (another terminal)
//   node tools/perf-scenario.mjs [baseUrl] > result.json
import {chromium} from 'playwright';
const base=process.argv[2]||'http://localhost:8080/';
const browser=await chromium.launch({headless:false,args:['--enable-precise-memory-info','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2});
page.on('console',m=>{const t=m.text();if(/\[HRC (boot|webgl|scaler)\]/.test(t))console.error(t);});
await page.goto(base);
await page.evaluate(()=>localStorage.setItem('hrc-quality','medium'));
await page.goto(base+'?perf&noscaler&autopilot&scenario=120&leak=300#busan');
await page.waitForFunction(()=>window.__scenario&&window.__scenario.done,null,{timeout:12*60*1000,polling:2000});
const r=await page.evaluate(()=>({run:__scenario.report.run,calls:__scenario.report.calls,tris:__scenario.report.tris,
  scaler:__scenario.report.scaler,ctx:__scenario.report.ctx,marks:__scenario.marks,boot:__scenario.report.boot}));
// determinism hash on a fresh page (it overwrites the session)
await page.goto(base+'?perf#busan');
await page.waitForFunction(()=>window.hrc&&window.__perf&&__perf.report().marks.length,null,{timeout:120000});
r.det=await page.evaluate(()=>[hrc.detHash(1,6000).hash,hrc.detHash(7,14400).hash]);
console.log(JSON.stringify(r,null,2));
await browser.close();
