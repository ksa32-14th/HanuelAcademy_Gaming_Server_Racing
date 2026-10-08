param($osm,$out,$report,$gpx=(Join-Path $env:USERPROFILE 'Downloads\Seoul_GrandPrix.gpx'))
# OpenStreetMap (Overpass JSON, out geom) -> src/data/osm-seoul.js for the Seoul (Gwanghwamun) circuit.
# metres from 37.5740 N, 126.9780 E (x east, y north). See tools/README.md for the Overpass query and how to run it.
$ErrorActionPreference='Stop'
$lat0=37.5740;$lon0=126.9780;$ky=111132.0;$kx=111320*[math]::Cos($lat0*[math]::PI/180)
$inv=[Globalization.CultureInfo]::InvariantCulture
function Num($s){ $m=[regex]::Match([string]$s,'\d+(\.\d+)?'); if($m.Success){ return [double]::Parse($m.Value,$inv) }; return 0.0 }
$wallRx=[string][char]0xAD81+"|"+[char]0xB2F4+[char]0xC7A5+"|"+[char]0xB3CC+[char]0xB2F4
function P($g){ $a=New-Object 'System.Collections.Generic.List[double[]]'; foreach($q in $g){ $a.Add([double[]]@((($q.lon-$lon0)*$kx),(($q.lat-$lat0)*$ky))) }; return ,$a }
function F([double]$v,[int]$d=1){ return [math]::Round($v,$d).ToString($inv) }
function Flat($pts,[int]$d=1){ ($pts|%{ (F $_[0] $d)+','+(F $_[1] $d) }) -join ',' }
# drop the closing duplicate and points closer than tol to the previous kept one
function Clean($pts,[double]$tol=0.6){ $o=New-Object 'System.Collections.Generic.List[double[]]'
  foreach($p in $pts){ if($o.Count -eq 0 -or [math]::Abs($p[0]-$o[$o.Count-1][0])+[math]::Abs($p[1]-$o[$o.Count-1][1]) -gt $tol){$o.Add($p)} }
  if($o.Count -gt 2 -and [math]::Abs($o[0][0]-$o[$o.Count-1][0])+[math]::Abs($o[0][1]-$o[$o.Count-1][1]) -lt $tol){$o.RemoveAt($o.Count-1)}
  return ,$o }
function Area($p){ $s=0.0;for($i=0;$i -lt $p.Count;$i++){$j=($i+1)%$p.Count;$s+=$p[$i][0]*$p[$j][1]-$p[$j][0]*$p[$i][1]};return $s/2 }
function Ctr($p){ $x=0.0;$y=0.0;foreach($q in $p){$x+=$q[0];$y+=$q[1]};return @(($x/$p.Count),($y/$p.Count)) }
# outer ring of a multipolygon relation: join the outer member ways end to end
function Rings($e,$role='outer'){ $segs=New-Object System.Collections.ArrayList
  foreach($m in $e.members){ if($m.type -eq 'way' -and $m.role -eq $role -and $m.geometry){ [void]$segs.Add((P $m.geometry)) } }
  $rings=@()
  while($segs.Count){ $r=New-Object 'System.Collections.Generic.List[double[]]';$r.AddRange($segs[0]);$segs.RemoveAt(0)
    $grew=$true
    while($grew -and $segs.Count){ $grew=$false;$e1=$r[$r.Count-1]
      if([math]::Abs($r[0][0]-$e1[0])+[math]::Abs($r[0][1]-$e1[1]) -lt 0.05){break}
      for($k=0;$k -lt $segs.Count;$k++){ $s=$segs[$k]
        if([math]::Abs($s[0][0]-$e1[0])+[math]::Abs($s[0][1]-$e1[1]) -lt 0.05){ $r.AddRange($s);$segs.RemoveAt($k);$grew=$true;break }
        $sl=$s[$s.Count-1]
        if([math]::Abs($sl[0]-$e1[0])+[math]::Abs($sl[1]-$e1[1]) -lt 0.05){ $t=@($s);[array]::Reverse($t);$r.AddRange([double[][]]$t);$segs.RemoveAt($k);$grew=$true;break } } }
    $rings+=,(Clean $r) }
  return ,$rings }

# the circuit (GPX) - for distance filters
$gs=Get-Content $gpx -Raw
$trk=@();foreach($x in [regex]::Matches($gs,'lat="([\d.]+)" lon="([\d.]+)"')){$trk+=,@(((([double]$x.Groups[2].Value)-$lon0)*$kx),((([double]$x.Groups[1].Value)-$lat0)*$ky))}
function TrackDist([double]$x,[double]$y){ $b=1e9;for($i=0;$i -lt $trk.Count-1;$i++){$a=$trk[$i];$c=$trk[$i+1];$dx=$c[0]-$a[0];$dy=$c[1]-$a[1];$l2=$dx*$dx+$dy*$dy;if($l2 -lt 1e-6){continue}
  $t=[math]::Max(0,[math]::Min(1,(($x-$a[0])*$dx+($y-$a[1])*$dy)/$l2));$d=[math]::Sqrt([math]::Pow($a[0]+$t*$dx-$x,2)+[math]::Pow($a[1]+$t*$dy-$y,2));if($d -lt $b){$b=$d}};return $b }

$J=[IO.File]::ReadAllText($osm,[Text.Encoding]::UTF8)|ConvertFrom-Json
# landmarks by OSM id (see buildSeoulLandmark in game.js)
$LandMk=@{
 '223158436'=41;'223158439'=41;'543729862'=41;                # Sejong Center: grand theatre, chamber hall, gallery
 '141957172'=42;                                             # Kyobo Life Building (the Gwanghwamun poem board)
 '141957176'=43;'525629947'=44;                              # KT Gwanghwamun West / East
 '196079106'=45;                                             # US Embassy
 '141957171'=46;                                             # National Museum of Korean Contemporary History
 '223166193'=47;'141779172'=48;                              # Dong-A Media Center (LED board), Ilmin Museum (1926 Dong-A building)
 '332565592'=49;'377289798'=50;'233593617'=51;               # Seoul Finance Center, Koreana Hotel, Korea Press Center
 '198561926'=52;                                             # Seoul City Hall (2012 glass wave)
 '233593619'=54;'142096705'=55;'537163288'=56;               # Plaza Hotel, Gwanghwamun Building (Donghwa duty free LED), Four Seasons
 '446597148'=57;'446597149'=57;'506252766'=58;'554305337'=59;# Twin Tree Towers, D Tower, Gran Seoul
 '196076051'=60;'196076050'=60;                              # Government Complex Seoul (+ annex)
 '170199440'=61;'236942291'=62;'377289797'=63;'1203377868'=64; # Gwanghwamun gate, Dongsipjagak, Daehanmun, Gijeonbijeon
 '1206228046'=65;'141957167'=66;'223165015'=67;'358297322'=68;# Jongno Tower, Youngpoong, Hana Bank HQ, Shinhan Bank
 '332565595'=69;'10757525'=53;'141957173'=72;'141957147'=70;'233593644'=71                 # City Hall Cheonggye office, Gwanghwamun post office, President Hotel
}
$Bld=New-Object System.Collections.ArrayList;$Rd=New-Object System.Collections.ArrayList;$Wt=New-Object System.Collections.ArrayList
$Grn=New-Object System.Collections.ArrayList;$Pk=New-Object System.Collections.ArrayList;$Sq=New-Object System.Collections.ArrayList
$Wl=New-Object System.Collections.ArrayList;$Dy=@{};$Fb=New-Object System.Collections.ArrayList;$Ford=New-Object System.Collections.ArrayList
$Low=New-Object System.Collections.ArrayList;$Art=New-Object System.Collections.ArrayList;$rep=New-Object System.Collections.ArrayList
$seen=@{}
foreach($e in $J.elements){
  $t=$e.tags;if(-not $t){continue}
  $id=[string]$e.id;if($seen[$e.type+$id]){continue};$seen[$e.type+$id]=1
  if($e.type -eq 'node'){ if($t.tourism -eq 'artwork' -or $t.historic){ [void]$Art.Add(@((($e.lon-$lon0)*$kx),(($e.lat-$lat0)*$ky),$t.name)) };continue }
  $rings=@();if($e.type -eq 'way'){ if($e.geometry){$rings=,(Clean (P $e.geometry))} }elseif($e.type -eq 'relation'){ $rings=Rings $e }
  if(-not $rings.Count){continue}
  $closed=$e.type -eq 'relation' -or ($e.geometry.Count -gt 3 -and $e.geometry[0].lat -eq $e.geometry[$e.geometry.Count-1].lat -and $e.geometry[0].lon -eq $e.geometry[$e.geometry.Count-1].lon)
  $hw=$t.highway
  # ---------------- buildings
  if($t.building -and $t.building -ne 'no' -and $t.building -ne 'construction' -and $closed -and -not $t.'building:part'){
    foreach($r in $rings){ if($r.Count -lt 3){continue}
      $c=Ctr $r;$d=TrackDist $c[0] $c[1];if($d -gt 1250){continue}
      $h=0.0;if($t.height){$h=Num $t.height}elseif($t.'building:levels'){$h=(Num $t.'building:levels')*3.7;if($t.'roof:levels'){$h+=(Num $t.'roof:levels')*2.5}}
      $bt=$t.building;$kind=4
      if($t.'building:architecture' -eq 'joseon' -or $t.historic -or $bt -in 'temple','shrine','gatehouse','gate','pavilion' -or $t.'historic:period' -eq 'joseon'){$kind=5}
      elseif($bt -in 'apartments','residential','house','detached','dormitory'){$kind=1}
      elseif($bt -in 'retail','commercial','supermarket','department_store' -or $t.shop){$kind=3;if($h -gt 40 -or (Num $t.'building:levels') -gt 10){$kind=2}}
      elseif($bt -in 'office','hotel','public','government','bank' -or $t.office -or $t.tourism -eq 'hotel' -or $h -gt 30 -or (Num $t.'building:levels') -gt 8){$kind=2}
      $lm=0;if($LandMk.ContainsKey($id)){$lm=$LandMk[$id]}
      # beyond the first rows of buildings only the bigger ones count, and their outlines need less detail
      $ar=[math]::Abs((Area $r))
      if($lm -eq 0){ if($kind -ne 5 -and $d -gt 720){continue}; if($d -gt 100 -and $ar -lt 30){continue}; if($d -gt 400 -and $ar -lt 90 -and $kind -ne 5){continue} }
      $dg=1;if($lm -eq 0 -and $d -gt 160){$dg=0;$r=Clean $r 1.6;if($r.Count -lt 3){continue}}
      [void]$Bld.Add('['+(F $h 0)+','+$kind+','+$lm+','+(Flat $r $dg)+']')
      if($t.name -and $d -lt 260){[void]$rep.Add(("{0,6:N0} m  id={1} h={2} lv={3} kind={4} lm={5} {6} / {7}" -f $d,$id,$t.height,$t.'building:levels',$kind,$lm,$t.name,$t.'name:en'))} }
    continue }
  # ---------------- Cheonggyecheon: the retaining walls of the sunken channel
  if($t.barrier -eq 'retaining_wall' -and $t.man_made -eq 'dyke'){ $Dy[$id]=$rings[0];continue }
  # ---------------- historic walls (palace walls, Deoksugung's stone wall)
  if($t.barrier -eq 'wall' -and ($t.historic -or $t.castle_type -or $t.'historic:period' -or $t.name -match $wallRx)){
    foreach($r in $rings){ $h=4.0;if($t.height){$h=Num $t.height}; [void]$Wl.Add('['+(F $h 1)+','+(Flat $r 1)+(','+(F $r[0][0] 1)+','+(F $r[0][1] 1))*[int]$closed+']') };continue }
  # ---------------- roads
  if($hw){
    $ly=[int]($t.layer -replace '[^\d-]','');if(-not $t.layer){$ly=0}
    if($t.tunnel -eq 'yes' -or $t.tunnel -eq 'building_passage' -or $ly -lt 0){ if($hw -in 'footway','path' -and $ly -lt 0){ [void]$Low.Add('['+(Flat $rings[0] 1)+']') };continue }
    if($t.ford -eq 'stepping_stones'){[void]$Ford.Add('['+(Flat $rings[0] 1)+']');continue}
    if($t.bridge -eq 'yes' -and $hw -in 'footway','path','pedestrian','steps' ){ $w=4.0;if($t.width){$w=Num $t.width}
      [void]$Fb.Add('['+(F $w 1)+','+(Flat $rings[0] 1)+']');continue }
    if($hw -eq 'pedestrian' -and ($t.area -eq 'yes' -or $closed)){ foreach($r in $rings){[void]$Sq.Add('['+(Flat $r 1)+']')};continue }
    $cls=0;$w=0.0
    switch -regex ($hw){ '^(motorway|trunk|primary)(_link)?$'{$cls=2;$w=12} '^secondary(_link)?$'{$cls=2;$w=10} '^tertiary(_link)?$'{$cls=3;$w=8}
      '^(residential|unclassified|living_street)$'{$cls=4;$w=6} '^service$'{$cls=4;$w=4;if($t.service -in 'parking_aisle','drive-through'){$cls=0}} '^busway$'{$cls=3;$w=7} }
    if(-not $cls){continue}
    if($t.lanes){$n=Num $t.lanes;if($n -gt 0){$w=[math]::Max($w*0.6,$n*3.25+1.0)}}
    if($t.width){$w=Num $t.width}
    if($t.oneway -ne 'yes' -and $t.lanes -and $cls -eq 2){} # lanes on two-way roads are the total already
    if($rings[0].Count -lt 2){continue}
    $flag=0;if($t.bridge -eq 'yes'){$flag=1}
    [void]$Rd.Add('['+(F $w 1)+','+$cls+','+(Flat $rings[0] 1)+']');continue }
  # pavements and paved plazas mapped as areas (Gwanghwamun Square, Cheonggye Plaza, the wide Sejong-daero footways)
  if($t.'area:highway' -in 'footway','pedestrian' -and $closed){ foreach($r in $rings){ $c=Ctr $r;if((TrackDist $c[0] $c[1]) -gt 700){continue};[void]$Sq.Add('['+(Flat $r 1)+']') };continue }
  if($t.'area:highway' -and $closed){ continue }
  # ---------------- water, green, parking
  if($t.natural -eq 'water' -or $t.water){ foreach($r in $rings){[void]$Wt.Add('['+(Flat $r 1)+']')};continue }
  if($closed -and ($t.leisure -in 'park','garden','pitch' -or $t.landuse -in 'grass','forest','meadow','village_green','recreation_ground' -or $t.natural -in 'wood','scrub','grassland')){
    foreach($r in $rings){ $c=Ctr $r;if((TrackDist $c[0] $c[1]) -gt 1500){continue};[void]$Grn.Add('['+(Flat $r 1)+']') };continue }
  if($closed -and $t.amenity -eq 'parking' -and $t.parking -ne 'underground'){ foreach($r in $rings){[void]$Pk.Add('['+(Flat $r 1)+']')};continue }
}
# the channel: north wall, then the south wall walked backwards - one closed outline
$ch=@();$dk=@($Dy.Values)
# (each wall is first turned to run west to east, whichever way it was mapped)
$dk=$dk|%{ $w=@($_); if($w[0][0] -gt $w[$w.Count-1][0]){[array]::Reverse($w)}; ,$w }
if($dk.Count -ge 2){ $n=$dk|sort {($_|%{$_[1]}|measure -Average).Average} -Descending
  $s=@($n[1]);[array]::Reverse($s);$ch=@($n[0])+$s }
$sb=New-Object Text.StringBuilder
[void]$sb.AppendLine('// Seoul (Gwanghwamun / Jongno / City Hall) scenery from OpenStreetMap ((c) OpenStreetMap contributors, ODbL). Lazy-loaded only for the Seoul circuit.')
[void]$sb.AppendLine('// metres from 37.5740 N, 126.9780 E. b: [height m (0 = unknown), kind (1 residential, 2 office/hotel, 3 retail, 4 other, 5 traditional Joseon), landmark (see buildSeoulLandmark), x,y, ...];')
[void]$sb.AppendLine('// r: [width, class (2 major, 3 secondary, 4 local), x,y, ...] centre-lines; w: water; g: parks/lawns; p: surface car parks; sq: paved squares (Gwanghwamun Square);')
[void]$sb.AppendLine('// cg: the Cheonggyecheon channel (outline of its retaining walls); lw: the walkways along the stream bed; ford: stepping stones; sfb: footbridges over the stream [width, x,y, ...]; wl: palace walls [height, x,y, ...]')
[void]$sb.Append('export const OSM_SEOUL={"b":['+($Bld -join ',')+'],"r":['+($Rd -join ',')+'],"w":['+($Wt -join ',')+'],"g":['+($Grn -join ',')+'],"p":['+($Pk -join ',')+'],"sq":['+($Sq -join ',')+']')
[void]$sb.Append(',"cg":['+(Flat $ch 1)+'],"lw":['+($Low -join ',')+'],"ford":['+($Ford -join ',')+'],"sfb":['+($Fb -join ',')+'],"wl":['+($Wl -join ',')+']};')
[IO.File]::WriteAllText($out,$sb.ToString(),(New-Object Text.UTF8Encoding $false))
"buildings $($Bld.Count) roads $($Rd.Count) water $($Wt.Count) green $($Grn.Count) parking $($Pk.Count) squares $($Sq.Count) channel $($ch.Count) low $($Low.Count) ford $($Ford.Count) fb $($Fb.Count) walls $($Wl.Count) art $($Art.Count) bytes $((Get-Item $out).Length)"
$rep|sort|Out-File $report -Encoding utf8
$Art|%{ "{0:N0},{1:N0} {2}" -f $_[0],$_[1],$_[2] }|Out-File ($report+'.art.txt') -Encoding utf8
