// Circuit definitions (raw coordinates: x east, y north, metres). Extracted from the original single-file build.
/* ================= CIRCUITS =================
   raw coords: x east, y north. `len` is the official lap length the layout is scaled to.
   `fillet` (m) rounds every polyline corner with an arc — used for GPS-traced street routes. */
export const TRACKS={
 singapore:{title:'Marina Bay <em>Night</em> GP',label:'Singapore · Marina Bay',
  sub:'Marina Bay Street Circuit · 5.063 km · 23 corners · anti-clockwise · 3 DRS zones',len:5063,fullLaps:61,start:[0,250],fillet:0,
  raw:[[0,-40],[0,100],[0,250],[0,400],[-2,500],[-15,545],[-40,570],[-60,585],[-72,605],[-80,640],[-88,655],[-103,664],[-120,662],[-132,650],[-140,632],
   [-158,607],[-185,592],[-215,588],[-245,600],[-265,620],[-330,690],[-420,790],[-510,890],[-560,940],[-600,975],[-625,975],[-645,955],[-690,910],
   [-710,895],[-735,900],[-755,915],[-790,950],[-810,965],[-835,960],[-850,945],[-900,880],[-960,790],[-1010,710],[-1025,670],[-1022,640],[-1010,610],
   [-1015,585],[-1010,560],[-990,540],[-962,492],[-935,448],[-918,424],[-897,414],[-878,422],[-866,442],[-790,520],[-700,605],[-660,640],[-635,655],
   [-605,655],[-520,632],[-440,600],[-400,585],[-370,570],[-350,545],[-330,535],[-300,500],[-280,440],[-270,400],[-250,380],[-225,370],[-215,345],
   [-210,250],[-200,150],[-190,90],[-170,60],[-150,45],[-140,20],[-135,-20],[-120,-60],[-90,-80],[-60,-85],[-30,-85],[-10,-70]],
  drs:[[[-135,-20],[0,-15],[0,470]],[[-158,607],[-290,645],[-560,940]],[[-962,492],[-830,480],[-680,622]]],
  stands:[[-205,200,1,180],[-760,505,-1,140]],
  water:[[-800,400],[-700,470],[-560,450],[-340,420],[-310,300],[-300,100],[-310,-120],[-420,-250],[-850,-250],[-980,300]],
  tall:(x,y)=>x<-880&&y<500},
 songdo:{title:'Songdo <em>Street</em> GP',label:'Incheon · Songdo',
  sub:'Songdo Street Circuit · 7.450 km · anti-clockwise · 3 DRS zones · GPS-traced',len:7450,fullLaps:41,start:[911,120],simp:12,fillet:140,minR:62,
  // traced from the gmap-pedometer route "Songdo Grand-Prix" (metres from 37.3854 N, 126.6435 E)
  raw:[[13.1,506.4],[-151.6,312.4],[-222.6,367.5],[-305.1,431.6],[-355.5,372.5],[-435.4,279],[-476.1,354.4],[-493.6,386.6],[-531.7,457.2],[-495.3,502.7],
   [-457.5,550],[-463.8,554.7],[-469.3,559.5],[-534.2,609.6],[-564.4,632.9],[-608.5,667.2],[-621.8,677.6],[-644.1,682.6],[-658.7,688.6],[-596,573.8],
   // (the GPS route's ~5 m-radius loop-back ramp here is omitted: too tight for a 20 m wide track)
   [-588.8,446.5],[-576.3,423.4],[-569.3,410.2],[-526.7,331.5],[-436.5,164.4],[-376.3,52.9],[-363.7,32],[-327.3,74.9],[-205.9,-128.5],
   [-202.4,-134.5],[-112.1,-27.9],[-78.5,11.7],[-2.1,-45],[25.6,-65.7],[76.3,-103.7],[145.6,-17.6],
   // Michuhol Park straight. The GPS route dived ~190 m into the block here and came back out — a
   // deep V that was slow and disorienting to drive. The whole notch is gone: the exit of the left
   // at 76 now runs 550 m straight to the right-hander at 674, which carries the second DRS zone.
   [674.1,152.6],[685.4,150.9],[695.9,147],
   [706.5,141],[742.6,113.4],[781.6,83.8],[766.1,63.5],[728.6,14.2],[707.2,-13.8],[696.9,-27.2],[685.4,-42.2],[627.6,-115.1],[643.6,-127.5],[832.4,-273.6],
   [881.8,-311.7],[836.8,-370.3],[806,-410.7],[881.9,-470.3],[1006.8,-568.4],[1021.5,-581],[1037.3,-594.3],[1046.9,-598.2],[1056.7,-602.1],[1168.9,-687.5],
   [1238.3,-603.3],[1251.4,-587.4],[1333.1,-652.2],[1389.6,-696.9],[1414.3,-716.6],[1459.4,-657.8],[1477.6,-634],[1534,-560.5],[1546.8,-543.9],
   [1603.3,-470.2],[1527.9,-415.1],[1519.4,-408.9],[1611.3,-284.2],[1521.8,-231.8],[1449.5,-192.7],[1362.5,-139],[1345.5,-129],[840.7,161.5],
   [481.5,378.1],[472.2,385],[434.1,413.8],[382.5,452.8],[149,628.7],[129.1,644.8]],
  // DRS zones placed by hand [detection, activation start, activation end]: the automatic version
  // only keeps the three longest runs on the lap, and the new Michuhol Park straight came sixth.
  drs:[[[1521.8,-231.8],[1400,-165],[175,610]],     // start/finish straight - the longest zone on the lap
       [[25.6,-65.7],[160,-12],[505,98]],          // Michuhol Park straight
       [[-596,573.8],[-585,437],[-424,146]]],      // west section
  stands:[[1570,-515,1,150]],
  // the right-hander at the end of the Michuhol Park straight opened out from ~64 m to ~100 m along its
  // whole arc (a single centre only pushes the tight part to the edge of the zone)
  wide:[[630,137,95,45],[690,135,95,55],[745,80,95,55],[720,5,95,50]],
  // the Michuhol Park straight runs through a narrower street than the rest of the lap
  narrow:[[[130,-30],[690,158],18]],
  // pit entry on the main straight, just past the final corner: the lane peels away to the right over
  // a long, gentle taper, so you drift into it at racing speed; the only braking is at the 60 km/h
  // line in the lane itself
  pitEntry:[1525,-234],pitRamp:320,
  osm:true, // real buildings, water, parks and roads from OpenStreetMap
  tall:()=>true}
};
