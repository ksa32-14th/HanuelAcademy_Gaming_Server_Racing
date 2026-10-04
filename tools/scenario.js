// Fixed measurement scenario, loaded by src/perf.js when the page is opened with ?perf&scenario.
// Recommended URL (see tools/README.md):  /?perf&noscaler&autopilot&scenario=120&leak=300#busan  with quality = MEDIUM
//   lobby (5 s) → straight into a race (AI drives your car too) → frame stats over `scenario` seconds →
//   memory snapshots at lobby, race start, end of the timed run and `leak` seconds after the start.
// Results: window.__scenario ({done, report, marks}); also logged as one '[HRC scenario]' JSON line.
const q=new URLSearchParams(location.search);
const RUN=+(q.get('scenario')||120),LEAK=+(q.get('leak')||0);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out=window.__scenario={done:false,run:RUN,leak:LEAK};
(async()=>{
  while(!window.hrc||!window.__perf||!__perf.report().marks.length)await wait(250);
  await wait(5000);__perf.mark('lobby +5 s');
  hrc.quickRace();__perf.reset();const s0=hrc.simTime,w0=performance.now();
  await wait(RUN*1000);
  out.report=__perf.report();__perf.mark('race +'+RUN+' s');
  // < 1 means the race ran slower than real time (frames too long for the substep cap)
  out.report.run.simRate=+((hrc.simTime-s0)/((performance.now()-w0)/1000)).toFixed(3);
  if(LEAK>RUN){await wait((LEAK-RUN)*1000);__perf.mark('race +'+LEAK+' s');}
  out.marks=__perf.report().marks;out.final=__perf.report();out.done=true;
  document.title='HRC scenario done';
  console.log('[HRC scenario]',JSON.stringify({run:out.report.run,calls:out.report.calls,tris:out.report.tris,scaler:out.report.scaler,ctx:out.report.ctx,marks:out.marks,boot:out.report.boot}));
})();
