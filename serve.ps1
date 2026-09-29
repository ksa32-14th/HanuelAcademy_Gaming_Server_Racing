param([int]$Port=8080)
Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue
$root=$PSScriptRoot
$l=New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
$mime=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.png'='image/png';'.svg'='image/svg+xml'}
while($l.IsListening){ $c=$l.GetContext(); $p=$c.Request.Url.LocalPath; if($p -eq '/'){$p='/index.html'}
  $fp=Join-Path $root ($p.TrimStart('/').Replace('/','\'))
  if(Test-Path $fp -PathType Leaf){ $b=[IO.File]::ReadAllBytes($fp); $e=[IO.Path]::GetExtension($fp).ToLower(); $c.Response.ContentType=$(if($mime[$e]){$mime[$e]}else{'application/octet-stream'}); $c.Response.Headers.Add('Cache-Control','no-store'); $c.Response.OutputStream.Write($b,0,$b.Length) } else { $c.Response.StatusCode=404 }
  $c.Response.Close() }
