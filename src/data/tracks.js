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
  sub:'Songdo Street Circuit · 7.450 km · anti-clockwise · 3 DRS zones · GPS-traced',len:7450,fullLaps:41,start:[911,120],
  times:['dusk','night','day'], // selectable in the lobby; blue-hour dusk is the default
 simp:12,fillet:140,minR:62,
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
  narrow:[[[130,-30],[690,158],13]],
  // pit entry on the main straight, just past the final corner: the lane peels away to the right over
  // a long, gentle taper, so you drift into it at racing speed; the only braking is at the 60 km/h
  // line in the lane itself
  pitEntry:[1525,-234],pitRamp:320,
  osm:true, // real buildings, water, parks and roads from OpenStreetMap
  tall:()=>true},
 busan:{title:'Busan <em>Grand</em> Prix',label:'Busan · Centum City',
  sub:'Busan Street Circuit · 5.790 km · anti-clockwise · BEXCO pit lane · GPS-traced',len:5790,fullLaps:53,start:[-606,335],simp:6,fillet:90,minR:34,
  day:true, // a clear autumn afternoon on the Suyeong Bay
  // traced from the "Busan_GP" GPX route (metres from 35.1650 N, 129.1400 E): Centum-jungang-ro past BEXCO (start/finish and
  // pits), round Centum City, down to the Suyeong river mouth, east along the Marine City shore to the Haeundae hairpin
  // and back up Haeundae-ro to BEXCO
  raw:[[441.8,-601.1],[525.6,-630.8],[679.3,-685.2],[849.2,-743.2],[902.8,-762.6],[976.5,-789.3],[1000.8,-797.3],[1022.4,-799.8],
   [1052.6,-790.4],[1068.5,-776.2],[1077.2,-768.4],[1081.8,-761.4],[1083.4,-755],[1083.5,-747.4],[1080.5,-724.7],[1038.7,-672],
   [1016.8,-652.9],[921.9,-582.7],[856.3,-536.6],[846.4,-529.8],[839.2,-514.8],[834,-489.7],[820.5,-460.3],[789.9,-438.9],[740,-403.7],
   [714.3,-379.7],[636.8,-329.5],[531.6,-266.3],[418.3,-193.7],[378.6,-168.7],[341.4,-144.3],[303,-118.9],[266.8,-87.2],[242.3,-60.3],
   [200.6,4.2],[131.6,126.4],[74.4,223.6],[64.3,239.5],[46.9,278.4],[33.2,302.8],[15.7,324.6],[-2.3,344.3],[-23.7,365.6],[-46.8,390],
   [-100.6,433.2],[-122.4,451.4],
   // BEXCO: APEC-ro down the side of exhibition hall 1 (under the hall link bridge), then the right-hander onto Centum-jungang-ro
   [-144.8,428.3],[-168.4,403.3],[-192,381],[-239.2,349.6],[-288.2,317.3],[-377.2,259.3],[-407.2,238.7],[-476.6,189.5],[-495.9,168],
   // start/finish straight along Centum-jungang-ro, the BEXCO outdoor car park (the paddock) on the right
   [-524,211.7],[-578.6,296.8],[-631.7,376.6],[-688.7,464.9],[-787.5,612.2],[-800.3,631.2],
   [-816.9,620.2],[-951.4,531.9],[-986.8,509.1],[-1093.2,440.5],[-1108.2,430.2],
   [-1100.8,420.3],[-1047.5,342.1],[-1008.7,285.2],[-991.6,260.1],[-929.8,166.9],[-880.9,93],[-841.3,36.6],[-794.5,-24.9],[-763.9,-68.2],
   [-741.9,-98.5],[-720.3,-116.7],[-693.6,-125.9],[-667.1,-139.7],
   // (the trace jinks ~10 m sideways here where it crosses a junction; the jog is dropped)
   [-625.7,-201.4],[-595.1,-220.3],[-565.3,-229.3],[-529.9,-239],[-498,-242],[-479.5,-240.1],[-442.5,-232.3],[-328,-192.7],[-269.2,-181.1],
   [-226.3,-178.5],[-182.3,-184],[-127.7,-196.9],[-62.6,-226.7],[-26.3,-252.3],[18.8,-293.4],[50,-325.4],[121.3,-400.6],[178.5,-461],
   [243,-529.8],[282.6,-543.9]],
  // DRS [detection, activation start, activation end]. The first two are where the automatic placement put them;
  // the sector-3 zone used to cover only 350 m of Haeundae-ro, which is flat out from the hairpin exit all the way
  // to the braking zone for APEC-ro — it now runs that whole 1.1 km
  drs:[[[184,-467],[303,-551],[921,-765]],     // Marine City shore to the Haeundae hairpin (sector 2)
       [[-1057,454],[-1031,319],[-805,-8]],    // Suyeonggangbyeon-daero along the river (sector 1)
       [[855,-534],[766,-419],[-10,350]]],     // Haeundae-ro (sector 3)
  stands:[[700,-690,1,180],[-1000,230,-1,140]],
  // pit lane in the BEXCO outdoor car park: the lane leaves APEC-ro before the BEXCO corner and takes the corner on the
  // inside, across the corner of the car park (60 km/h from just after the entry); back on the track before the BEXCO
  // auditorium, which stands right at the roadside at the north end of the car park. The car park is
  // ~240 m long, so the boxes are packed tighter than the usual 40 m. The lane peels off over 110 m so it is clear of
  // the track — and the pit wall stands — before the BEXCO corner. Boxes and exit sit 150 m up the straight, level
  // with the grid, which forms up behind a start line 150 m past the timing line (gridAhead)
  pitEntry:[-376,258],pitRamp:110,pitLimit:30,pitExit:[-708.6,495.5],pitExitLen:70,boxStart:30,boxGap:17,gridAhead:150,tightPaddock:true,
  // the BEXCO corner opened from ~35 m to 55 m so the pit lane can take it on the inside at 60 km/h
  wide:[[-495,182,55,70]],
  osm:true,
  // landmarks beyond the OpenStreetMap download, drawn by hand (raw metres)
  lct:[2639,-487], // Haeundae LCT: 411 m landmark tower with two 339 m residential towers
  gwangan:[[-777,-1770],[-1340,-2483]], // the suspension span of Gwangan Bridge (between its two towers)
  // the mountains that ring the city: [x, y, height m, radius m] — Jangsan, Geumnyeonsan, Hwangnyeongsan, Baesan, Dalmaji hill
  hills:[[3695,2974,634,1700],[-3276,-995,415,1300],[-5170,-1040,427,1400],[-3040,1725,256,1000],[3367,-830,140,520]],
  tall:()=>true},
 seoul:{title:'Seoul <em>Gwanghwamun</em> GP',label:'Seoul · Gwanghwamun',
  sub:'Gwanghwamun Street Circuit · clockwise · Gwanghwamun Square pit lane · GPS-traced',len:3601,fullLaps:74,start:[-63.5,-110],
  simp:2.5,fillet:42,minR:24,
  // the Dongsipjagak rotary (T2) is driven at ~20 m round the island (opened out from the real ~16 m so it flows and
  // the watchtower fits inside the inner barrier); the left turn into it off Yulgok-ro is an ordinary ~25 m corner;
  // the Sambong-ro roundabout (T3) is driven at ~16.5 m
  tight:[[125.5,233.5,17,32],[43.9,-146.1,13.5,30]],
  // a fresh Time Trial board each time the lap changes; the earlier layouts' laps stay under 'seoul' (the hairpin),
  // 'seoul-r2' (T2 rotary only) and 'seoul-r3' (T2 and T3 both rotaries, the narrow ones). r4 (2026-10-09): the T2 ring
  // is wider, and T3 has a wider road and walls set further back
  board:'seoul-r4',
  times:['day','night'], // a clear autumn afternoon under Bugaksan; at night the LED boards of the Gwanghwamun junction light up
  // traced from the "Seoul_GrandPrix" GPX route (metres from 37.5740 N, 126.9780 E), clockwise: north up Sejong-daero
  // past Gwanghwamun Square, right along Sajik-ro / Yulgok-ro, round the Dongsipjagak rotary, back down Jong-ro 1-gil,
  // Sambong-ro and Jong-ro 5-gil to Jongno, across the Cheonggyecheon on Mojeongyo, east along Cheonggyecheon-ro to
  // Gwanggyo, down Namdaemun-ro, west along Eulji-ro, round Seoul Plaza onto Sogong-ro and north up Sejong-daero past
  // City Hall and Deoksugung. (The trace's other little loops round traffic islands — Draw My Loop routing — are dropped.)
  raw:[[-63.7,-152.5],[-65.5,-97.2],[-69,13.4],[-70.1,52.7],[-70.9,76.1],[-71.9,103.8],[-72.3,118.2],[-72.6,132.2],
   // T1: right onto Sajik-ro in front of the Gwanghwamun Woldae, along Yulgok-ro past the Twin Tree Towers
   [-65.6,135],[-62.4,136.8],[-42.9,149.9],[-30.8,159.7],[-22.3,165.6],[-14.4,169.4],[-4.2,173.4],[4.3,175.7],[31.4,180.9],
   [49.4,183.7],
   // T2: the Dongsipjagak rotary (checked against the Kakao skyview): left off Yulgok-ro up the lanes west of the
   // watchtower's island, clockwise round its north side (~200°, the island on the right), down the east lanes and
   // straight across the junction into Jong-ro 1-gil past the Museum of Korean Contemporary History. The ring's corners
   // sit on a 21.5 m circle round the island (125.5, 233.5), 40° apart; the fillet turns them into a ~20 m radius path
   // (the corner at 200° is left out: it falls on the straight up the west lanes)
   [105.5,191],[105.3,240.85],[114.75,252.1],[129.2,254.7],[142,247.3],[147,233.5],[142,219.7],
   [130,183.7],[122.5,172.8],[108.1,158.7],[102,150.8],[88.2,133],[74.8,115.1],[60,92.2],[46.1,56.3],[44.4,25.2],[48.5,-41],[50.4,-114.4],
   // T3: the little roundabout where Jong-ro 1-gil meets Sambong-ro (Kakao skyview) — in on its west side and round the
   // south of the island the way the traffic goes (anticlockwise, ~160°), out east along Sambong-ro. The real ring is only
   // ~10 m in radius, tighter than the car can steer (~16 m), so the corners sit on a 17.5 m circle round the island
   // (43.9, -146.1) and the path runs ~16.5 m out, over the ring's outer lanes and the mouth of the west arm. The road
   // through it is 15 m wide rather than the 11 m of the streets either side, and its walls stand further back (`roomy`)
   [35.2,-130.9],[27.5,-140.1],[27.5,-152.1],[35.1,-161.3],[46.9,-163.3],
   // Sambong-ro, then Jong-ro 5-gil through Cheongjin-dong (KT East, D Tower, Gran Seoul)
   [80.6,-166.6],[110,-171.3],[131,-169.4],[171.3,-165.8],[180.4,-173.1],[192.6,-183.8],[217.9,-238.7],[225.2,-256],
   [235.6,-278.2],[250.1,-308.4],[258.9,-335.6],[264.3,-355],[264.9,-372],[264.7,-395.4],[264.8,-411.1],
   // Jongno, then left down Mugyo-ro and over the Cheonggyecheon on Mojeongyo
   [209.5,-415.1],[136.3,-415.5],[118,-415.3],[118,-428.9],[116.3,-474.1],[115,-522.9],[113.6,-552],[113.1,-558.5],
   // Cheonggyecheon-ro along the south bank of the stream to Gwanggyo (3 m south of the trace, which follows the
   // two-lane carriageway hard against the channel railing — the circuit takes the kerbside lane and the pavement too)
   [123.9,-562],[160,-566.2],[181.7,-567.9],[274.3,-576.7],[310,-579],[357.3,-582.1],[391.1,-585],[416,-587],
   // Namdaemun-ro, Eulji-ro, round Seoul Plaza onto Sogong-ro (the Plaza Hotel)
   [415.1,-602.4],[414.3,-665.6],[412.9,-722],[410.3,-787.7],[408.7,-808.2],[407.7,-832.8],[386.3,-859.8],[362.9,-880.6],
   [312.9,-881.2],[231.4,-882.6],[136,-882.6],[99.9,-882.8],[92.3,-884.3],[86.3,-887.9],[79.8,-901.3],[74.7,-914.7],[49.1,-981.9],
   [44.6,-991.5],[39.3,-998.5],[32.3,-1004],[24,-1007.6],[15.7,-1009.3],[-31.9,-1008.6],[-69.4,-1008.2],
   // Sejong-daero north: Deoksugung's Daehanmun, City Hall, the Press Center, Cheonggye Plaza, the Gwanghwamun junction
   [-68.7,-988.7],[-68.2,-955.4],[-67.9,-822.8],[-67,-777.6],[-67.8,-678],[-68.8,-568.6],[-69.2,-510.5],[-69.7,-464.8],
   [-69.9,-439.1],[-69,-422.3],[-68.2,-413.4],[-66.3,-398.7],[-65.8,-389.7],[-60.9,-284.6],[-60.2,-264.7],[-62.4,-193.3]],
  // DRS [detection, activation start, activation end]: the whole of Sejong-daero from Daehanmun to the Woldae (the
  // gentle kink at the Gwanghwamun junction is flat out), and Eulji-ro from Namdaemun-ro to Seoul Plaza
  drs:[[[-68.5,-990],[-68,-930],[-70,40]],
       [[409,-790],[350,-881],[110,-883]]],
  stands:[[-68,-935,1,70]], // on the south half of Seoul Plaza, facing Sejong-daero (City Hall stays in view)
  mainStand:false, // the main straight is lined with buildings on the right
  // the rotary lanes, the back streets between Yulgok-ro and Jongno, Mugyo-ro and Cheonggyecheon-ro are far narrower
  // than Sejong-daero — except the Sambong-ro roundabout (T3), which opens back out to the full 15 m (a later entry
  // overrides an earlier one)
  narrow:[[[105.5,197],[262,-395],11],[[118,-436],[398,-585],11],[[49.5,-105],[95,-168],15]],
  // and its walls stand 3 m further back ([x, y, reach, m]: full within reach - 15 m, easing out to nothing at reach;
  // through the bends only the outside wall moves, so the island keeps its size)
  roomy:[[40,-148,40,3]],
  wallGap:1.2,clear:1.0,pitWallGap:2.0,
  // corners get more room than the straights: the inside wall of each kerbed corner 2.2 m further back, the outside wall
  // 2.5 m further back for 60 m past each corner where cars run out wide; only the right-angle (and tighter) corners get
  // a slightly wider kerb, 2.2 m instead of 1.6
  kerbWide:2.2,innerGap:2.2,exitGap:2.5,exitLen:60,
  // pits: the southbound carriageway of Sejong-daero is the pit lane, Gwanghwamun Square the paddock — the garages
  // stand between the statue of Admiral Yi Sun-sin and the statue of King Sejong. Entry after Cheonggye Plaza, exit
  // before the Woldae.
  pitLeft:true,pitEntry:[-69.2,-520],pitRamp:150,pitExit:[-65,-40],pitExitLen:75,boxStart:-202,boxGap:16,tightPaddock:true,
  osm:true,
  bare:[[-175,135,-30,212]], // the open lawns either side of the Woldae in front of Gwanghwamun (roadview): no park trees
  // the mountains round the old city: Bugaksan behind Gyeongbokgung, Inwangsan to the west, Namsan (N Seoul Tower)
  // to the south, Naksan's low ridge to the east, and the saddle between Bugaksan and Inwangsan (Changuimun)
  // [x, y, height above the square, radius] — summits from the survey heights (Bugaksan 342 m, Inwangsan 338 m,
  // Namsan 262 m, Naksan 125 m; the square is ~35 m above sea level)
  hills:[[-467,2089,307,1050],[-1799,1256,303,950],[-1250,1900,190,700],[900,-2534,227,1150],[2593,733,90,650]],
  namsanTower:[900,-2534],
  tall:()=>true}
};

/* ================= CIRCUIT INTROS =================
   The fly-over shown when a session starts (and from the lobby): where the circuit is, what the lap is like,
   one card per sector (the sectors are the game's thirds of the lap), and the pit lane / grid. */
export const INTROS={
 singapore:{place:'Downtown Core · Marina Bay · Singapore',placeEn:'SINGAPORE · REPUBLIC OF SINGAPORE',
  about:'A city-state just north of the equator. The race runs at night on the city streets wrapped around Marina Bay, in the heart of downtown, lit end to end by floodlights.',
  layout:'An anti-clockwise street circuit of 23 mostly square corners. The walls sit right at the track edge, so one small mistake usually ends the race.',
  sectors:[['Start · Singapore Flyer','Down the pit straight into the first corner complex, then past the Singapore Flyer observation wheel and out onto the first DRS zone.'],
           ['City blocks','Ninety-degree corners and short straights between the office towers. The second DRS zone is the only real overtaking chance in this sector.'],
           ['Esplanade · Marina Bay Sands','Around the twin domes of the Esplanade theatres and along the bay, with Marina Bay Sands across the water, then the main-straight DRS zone to the line.']],
  pitTitle:'Pit lane · Grid',pit:'The pit lane runs to the right of the main straight with a 60 km/h limit. Twenty cars line up on the grid, and the race starts when the five red lights go out.'},
 songdo:{place:'Songdo International City · Yeonsu-gu · Incheon',placeEn:'INCHEON · REPUBLIC OF KOREA',
  about:'Songdo is an international business district built on land reclaimed from the Yellow Sea tidal flats. The race runs on the boulevards between the towers around Central Park and its seawater lake.',
  layout:'A 7.450 km anti-clockwise street circuit, GPS-traced from the real roads. Wide boulevards and long-radius corners give it a high average speed.',
  sectors:[['Convensia · POSCO Tower','Straight after the start, past the silver roofs of Songdo Convensia and the 305 m POSCO Tower-Songdo, heading for the west side of Central Park.'],
           ['West section · Michuhol Park straight','Out of the zig-zag blocks on the west side and down the 550 m Michuhol Park straight. Overtakes are made at the right-hander at the end of its DRS zone.'],
           ['Triple Street · main straight','Between the Hyundai Premium Outlet and the Triple Street mall, then through the final corner onto the longest DRS straight and the finish line.']],
  pitTitle:'Pit lane · Grid',pit:'Pit entry is on the right of the main straight, just past the final corner. A long taper lets you keep your speed into the lane; you only brake at the 60 km/h line.'},
 busan:{place:'Centum City · Haeundae-gu · Busan',placeEn:'BUSAN · REPUBLIC OF KOREA',
  about:'Busan is Korea\'s second city and its biggest port. This daytime race starts in Centum City, home of BEXCO and Shinsegae Centum City, and links the Suyeong River, Suyeong Bay (with Gwangan Bridge in view) and Marine City on real streets.',
  layout:'5.790 km, anti-clockwise, entirely at street level: it passes under expressway viaducts and building link bridges. The keys to the lap are the 1.1 km Haeundae-ro DRS run and the Dongbaek-ro hairpin.',
  sectors:[['Centum City · Suyeong River','Off the line down Centum-jungang-ro into the first left-hander. Under the Shinsegae Centum City sky bridge, then along the riverside DRS zone on Suyeonggangbyeon-daero, under the Gwangan-daero viaduct to the river mouth.'],
           ['Marine City · Haeundae hairpin','Along Haeundae-haebyeon-ro and the shoreline DRS straight beneath the We\'ve the Zenith and I\'Park Marina towers, then hard on the brakes, down to about 100 km/h, for the Dongbaek-ro hairpin near Dongbaek Island.'],
           ['Haeundae-ro · BEXCO','Out of the hairpin and flat out for 1.1 km up Haeundae-ro with DRS open. Under the Jangsan-ro viaduct, left onto APEC-ro beneath the BEXCO hall link bridge, and through the BEXCO corner to the line.']],
  pitTitle:'Pits · BEXCO car park',pit:'The paddock is the BEXCO outdoor car park between exhibition halls 1 and 2. The pit lane leaves APEC-ro before the BEXCO corner and takes the corner itself inside the lane, across the corner of the car park, then runs past the ten team garages and rejoins the start straight in front of the auditorium.'}
,
 seoul:{place:'Gwanghwamun · Jongno-gu · Seoul',placeEn:'SEOUL · REPUBLIC OF KOREA',
  about:'Seoul has been Korea\'s capital for more than six hundred years. The race runs through its oldest heart: from Gwanghwamun, the main gate of Gyeongbokgung Palace with Bugaksan behind it, through the office towers of Jongno and across the Cheonggyecheon stream to City Hall and Deoksugung.',
  layout:'A 3.60 km clockwise street circuit on the real roads, GPS-traced. The broad Sejong-daero straight is the fastest part of the lap; the back streets of Jongno and the Cheonggyecheon bank are narrow, walled and unforgiving.',
  sectors:[['Gwanghwamun · Dongsipjagak','Up Sejong-daero past King Sejong, right in front of the Woldae terrace of Gwanghwamun and along Yulgok-ro to the tightest corner of the lap: left into the rotary and right round the island of the Dongsipjagak watchtower. Then back down Jong-ro 1-gil, round the little Sambong-ro roundabout and through the narrow streets of Cheongjin-dong.'],
           ['Jongno · Cheonggyecheon','Right onto Jongno, left down Mugyo-ro and over the Cheonggyecheon on Mojeongyo, then east along the stream between the railing and the office towers to Gwanggyo, and down Namdaemun-ro.'],
           ['Eulji-ro · City Hall · Sejong-daero','West along Eulji-ro with DRS, round Seoul Plaza past the Plaza Hotel, and right at Daehanmun onto Sejong-daero: past City Hall, Cheonggye Plaza and the LED boards of the Gwanghwamun junction, flat out with DRS to the line.']],
  pitTitle:'Pits · Gwanghwamun Square',pit:'Gwanghwamun Square is the paddock. The pit lane leaves the circuit after Cheonggye Plaza and runs up the southbound carriageway of Sejong-daero; the ten garages stand in the square between the statue of Admiral Yi Sun-sin and the statue of King Sejong, and the lane rejoins before the Woldae.'}
};
