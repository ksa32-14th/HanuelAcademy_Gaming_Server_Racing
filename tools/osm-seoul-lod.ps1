param($in='src/data/osm-seoul.js',$tracks='src/data/tracks.js',$out=$null)
# Distance LOD for the Seoul scenery: run after osm-seoul.ps1 (or on its own, on the committed file). The further a
# building, lawn or street is from the circuit, the less of its outline is kept — nobody sees the corners of a block
# 500 m away, but every vertex is in the download:
#   buildings  ≤ 300 m: as mapped · 300–500 m: outline simplified to 1.5 m, whole metres · beyond 500 m: the oriented
#              bounding box (4 corners) when the footprint fills most of it, else simplified to 3 m
#              (landmarks and Joseon halls are never touched)
#   lawns / parks, car parks, paved squares beyond 300 m: simplified to 2 m (4 m beyond 700 m), whole metres
#   streets beyond 500 m: centre-lines simplified to 2.5 m, whole metres
# Distances are to the circuit's centre-line (Seoul's `raw` in tracks.js). Usage (repo root):
#   powershell -ExecutionPolicy Bypass -File tools/osm-seoul-lod.ps1 [src/data/osm-seoul.js] [src/data/tracks.js] [out.js]
$ErrorActionPreference='Stop'
if(-not $out){$out=$in}
$inv=[Globalization.CultureInfo]::InvariantCulture
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic;
public static class SeoulLod {
  static double Seg(double px,double py,double ax,double ay,double bx,double by){
    double dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy,t=l2<1e-9?0:Math.Max(0,Math.Min(1,((px-ax)*dx+(py-ay)*dy)/l2));
    double qx=ax+t*dx-px,qy=ay+t*dy-py;return Math.Sqrt(qx*qx+qy*qy);}
  // shortest distance from (x,y) to the closed polyline t = [x0,y0,x1,y1,...]
  public static double Dist(double[] t,double x,double y){double m=1e18;int n=t.Length/2;
    for(int i=0;i<n;i++){int j=(i+1)%n;double d=Seg(x,y,t[2*i],t[2*i+1],t[2*j],t[2*j+1]);if(d<m)m=d;}return m;}
  public static double MinDist(double[] t,double[] p,int off){double m=1e18;for(int k=off;k+1<p.Length;k+=2){double d=Dist(t,p[k],p[k+1]);if(d<m)m=d;}return m;}
  static void Dp(List<double[]> p,int a,int b,double tol,bool[] keep){if(b<=a+1)return;double md=-1;int mi=-1;
    for(int i=a+1;i<b;i++){double d=Seg(p[i][0],p[i][1],p[a][0],p[a][1],p[b][0],p[b][1]);if(d>md){md=d;mi=i;}}
    if(md>tol){keep[mi]=true;Dp(p,a,mi,tol,keep);Dp(p,mi,b,tol,keep);}}
  static List<double[]> Pts(double[] f,int off){var p=new List<double[]>();for(int k=off;k+1<f.Length;k+=2)p.Add(new double[]{f[k],f[k+1]});return p;}
  // Douglas–Peucker on an open polyline (flat, from `off`)
  public static double[] DpOpen(double[] f,int off,double tol){var p=Pts(f,off);if(p.Count<3)return Flat(p);var keep=new bool[p.Count];keep[0]=keep[p.Count-1]=true;
    Dp(p,0,p.Count-1,tol,keep);var o=new List<double[]>();for(int i=0;i<p.Count;i++)if(keep[i])o.Add(p[i]);return Flat(o);}
  // …on a closed ring: split at the vertex farthest from the first one; never fewer than 3 corners
  public static double[] DpRing(double[] f,int off,double tol){var p=Pts(f,off);int n=p.Count;if(n<=4)return Flat(p);int far=0;double fd=-1;
    for(int i=1;i<n;i++){double d=Math.Pow(p[i][0]-p[0][0],2)+Math.Pow(p[i][1]-p[0][1],2);if(d>fd){fd=d;far=i;}}
    var q=new List<double[]>(p);q.Add(p[0]);var keep=new bool[q.Count];keep[0]=keep[far]=keep[q.Count-1]=true;Dp(q,0,far,tol,keep);Dp(q,far,q.Count-1,tol,keep);
    var o=new List<double[]>();for(int i=0;i<n;i++)if(keep[i])o.Add(q[i]);if(o.Count<3)return Flat(p);return Flat(o);}
  public static double Area(double[] f,int off){var p=Pts(f,off);double s=0;for(int i=0;i<p.Count;i++){int j=(i+1)%p.Count;s+=p[i][0]*p[j][1]-p[j][0]*p[i][1];}return Math.Abs(s/2);}
  // the smallest rectangle round the ring, over every edge direction; fill = footprint area / rectangle area
  public static double[] Obb(double[] f,int off,out double fill){var p=Pts(f,off);double best=1e18;double[] r=null;
    for(int i=0;i<p.Count;i++){int j=(i+1)%p.Count;double ex=p[j][0]-p[i][0],ey=p[j][1]-p[i][1],l=Math.Sqrt(ex*ex+ey*ey);if(l<1e-6)continue;ex/=l;ey/=l;
      double a0=1e18,a1=-1e18,b0=1e18,b1=-1e18;foreach(var q in p){double a=q[0]*ex+q[1]*ey,b=-q[0]*ey+q[1]*ex;a0=Math.Min(a0,a);a1=Math.Max(a1,a);b0=Math.Min(b0,b);b1=Math.Max(b1,b);}
      double ar=(a1-a0)*(b1-b0);if(ar<best){best=ar;r=new double[]{a0*ex-b0*ey,a0*ey+b0*ex, a1*ex-b0*ey,a1*ey+b0*ex, a1*ex-b1*ey,a1*ey+b1*ex, a0*ex-b1*ey,a0*ey+b1*ex};}}
    fill=r==null?0:Area(f,off)/Math.Max(best,1e-6);return r;}
  static double[] Flat(List<double[]> p){var o=new double[p.Count*2];for(int i=0;i<p.Count;i++){o[2*i]=p[i][0];o[2*i+1]=p[i][1];}return o;}
}
'@
# the circuit: Seoul's raw centre-line from tracks.js
$ts=[IO.File]::ReadAllText($tracks)
$blk=$ts.Substring($ts.IndexOf(' seoul:{'));$blk=$blk.Substring($blk.IndexOf('raw:['));$blk=$blk.Substring(0,$blk.IndexOf(']],')+2)
$trk=[Collections.Generic.List[double]]::new()
foreach($m in [regex]::Matches($blk,'\[(-?[\d.]+),(-?[\d.]+)\]')){$trk.Add([double]::Parse($m.Groups[1].Value,$inv));$trk.Add([double]::Parse($m.Groups[2].Value,$inv))}
$T=$trk.ToArray();"circuit: $($T.Length/2) points"

$src=[IO.File]::ReadAllText($in,[Text.Encoding]::UTF8)
$i0=$src.IndexOf('export const OSM_SEOUL=');$head=$src.Substring(0,$i0)
$json=$src.Substring($i0+'export const OSM_SEOUL='.Length).TrimEnd().TrimEnd(';')
Add-Type -AssemblyName System.Web.Extensions
$ser=New-Object Web.Script.Serialization.JavaScriptSerializer;$ser.MaxJsonLength=[int]::MaxValue
$Data=$ser.DeserializeObject($json)
function Arr($a){ ,[double[]]@($a|%{[double]$_}) }
function R0($v){ [math]::Round($v).ToString($inv) }
function Num($v){ ([double]$v).ToString('R',$inv) }
function Flat0($f){ ($f|%{ R0 $_ }) -join ',' }
$st=@{b0=0;b1=0;b2=0;b3=0}
$Bo=New-Object Collections.Generic.List[string]
foreach($b in $Data['b']){ $f=Arr $b;$h=$f[0];$kind=[int]$f[1];$lm=[int]$f[2]
  $n=($f.Length-3)/2;$cx=0.0;$cy=0.0;for($k=3;$k -lt $f.Length;$k+=2){$cx+=$f[$k];$cy+=$f[$k+1]};$cx/=$n;$cy/=$n
  $dd=[SeoulLod]::Dist($T,$cx,$cy)
  if($lm -gt 0 -or $kind -eq 5 -or $dd -le 300){ $Bo.Add('['+((@($b)|%{Num $_}) -join ',')+']');$st.b0++;continue }
  $pre=(R0 $h)+','+$kind+','+$lm+','
  if($dd -le 500){ $s=[SeoulLod]::DpRing($f,3,1.5);$Bo.Add('['+$pre+(Flat0 $s)+']');$st.b1++;continue }
  $fill=0.0;$o=[SeoulLod]::Obb($f,3,[ref]$fill)
  if($o -and $fill -ge 0.78){ $Bo.Add('['+$pre+(Flat0 $o)+']');$st.b2++ } else { $s=[SeoulLod]::DpRing($f,3,3.0);$Bo.Add('['+$pre+(Flat0 $s)+']');$st.b3++ } }
function Rings($list,$near,$tolMid,$tolFar){ $o=New-Object Collections.Generic.List[string]
  foreach($p in $list){ $f=Arr $p;$d=[SeoulLod]::MinDist($T,$f,0)
    if($d -le $near){ $o.Add('['+((@($p)|%{Num $_}) -join ',')+']');continue }
    $tol=$tolMid;if($d -gt 700){$tol=$tolFar};$o.Add('['+(Flat0 ([SeoulLod]::DpRing($f,0,$tol)))+']') }
  return ,$o }
$G=Rings $Data['g'] 300 2 4;$P=Rings $Data['p'] 300 2 4;$Sq=Rings $Data['sq'] 300 2 4
$Rd=New-Object Collections.Generic.List[string]
foreach($r in $Data['r']){ $f=Arr $r;$d=[SeoulLod]::MinDist($T,$f,2)
  if($d -le 500){ $Rd.Add('['+((@($r)|%{Num $_}) -join ',')+']');continue }
  $s=[SeoulLod]::DpOpen($f,2,2.5);$Rd.Add('['+(Num $f[0])+','+[int]$f[1]+','+(Flat0 $s)+']') }
function Same($k){ '"'+$k+'":['+((@($Data[$k])|%{ if($_ -is [array] -or $_ -is [Collections.IList]){'['+((@($_)|%{Num $_}) -join ',')+']'}else{Num $_} }) -join ',')+']' }
$sb=New-Object Text.StringBuilder
[void]$sb.Append($head).Append('export const OSM_SEOUL={"b":['+($Bo -join ',')+'],"r":['+($Rd -join ',')+'],'+(Same 'w')+',"g":['+($G -join ',')+'],"p":['+($P -join ',')+'],"sq":['+($Sq -join ',')+'],')
[void]$sb.Append((Same 'cg')+','+(Same 'lw')+','+(Same 'ford')+','+(Same 'sfb')+','+(Same 'wl')+'};')
[IO.File]::WriteAllText($out,$sb.ToString(),(New-Object Text.UTF8Encoding $false))
"buildings: $($st.b0) as mapped, $($st.b1) simplified, $($st.b2) boxes, $($st.b3) simplified to 3 m; bytes $($src.Length) -> $((Get-Item $out).Length)"
