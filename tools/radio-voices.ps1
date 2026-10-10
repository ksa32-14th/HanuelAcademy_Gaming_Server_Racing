# Team radio voice lines: makes sounds/radio/<id>.mp3 for every line in sounds/radio/lines.json with ElevenLabs
# text-to-speech — the race engineer in one voice, the driver (the player) in another — and writes sounds/radio/voices.json,
# the list of lines that have a file (the game asks only for those). The game plays them through a radio filter
# (src/radio.js). A line with a {placeholder} gets one file per piece of words around it (<id>_a, <id>_b …).
#
#   powershell -ExecutionPolicy Bypass -File tools/radio-voices.ps1            # only the lines that have no file yet
#   powershell -ExecutionPolicy Bypass -File tools/radio-voices.ps1 -Force     # all of them again
#   ... -Only 001,002                                                           # just these ids
#   ... -Engineer <voice id> -Driver <voice id>                                 # other ElevenLabs voices
#
# The API key comes from the ELEVENLABS_API_KEY environment variable or from tools/.elevenlabs-key (one line, the key
# only). That file is in .gitignore — never commit the key.
param([switch]$Force,[string[]]$Only,
  [string]$Engineer='onwK4e9ZLuTAKqWW03F9',  # Daniel: British, steady — the calm voice on the pit wall
  [string]$Driver='IKne3meq5aSn9XLyUdCD',    # Charlie: young, energetic — the driver in the car
  [string]$Model='eleven_multilingual_v2')
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root=Split-Path $PSScriptRoot -Parent
$key=$env:ELEVENLABS_API_KEY
$kf=Join-Path $PSScriptRoot '.elevenlabs-key'
if(-not $key -and (Test-Path $kf)){$key=[IO.File]::ReadAllText($kf)}
$key=($key -replace '[^\x21-\x7E]','')
if(-not $key){Write-Error "No ElevenLabs API key: set ELEVENLABS_API_KEY or put the key in tools/.elevenlabs-key";exit 1}
$dir=Join-Path $root 'sounds\radio'
$lines=[IO.File]::ReadAllText((Join-Path $dir 'lines.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
# the engineer steady and even; the driver livelier (more variation, more style)
$set=@{e=@{stability=0.55;similarity_boost=0.8;style=0.15;use_speaker_boost=$true};
       d=@{stability=0.35;similarity_boost=0.8;style=0.45;use_speaker_boost=$true}}
$n=0;$skip=0;$fail=0
# what gets a file: every line; a line with {placeholders} is cut at them and each piece of words is its own file
# (<id>_a, <id>_b … — the game reads the values out in between with n0-n59 / oh / point)
$jobs=foreach($p in $lines.PSObject.Properties){
  if($p.Name -eq '_'){continue}
  if($p.Value[1] -notmatch '\{'){[pscustomobject]@{id=$p.Name;who=$p.Value[0];text=$p.Value[1]};continue}
  $parts=[regex]::Split($p.Value[1],'\{\w+\}')
  for($k=0;$k -lt $parts.Length;$k++){$w=$parts[$k].Trim() -replace '^[\s\.:,]+','' -replace '[\s:,]+$',''
    if($w -match '[A-Za-z]'){[pscustomobject]@{id="$($p.Name)_$('abcdefgh'[$k])";who=$p.Value[0];text=$w}}}}
foreach($j in $jobs){
  $id=$j.id;$who=$j.who;$text=$j.text
  if($Only -and ($Only -notcontains $id)){continue}
  $out=Join-Path $dir "$id.mp3"
  if((Test-Path $out) -and -not $Force){$skip++;continue}
  $voice=if($who -eq 'd'){$Driver}else{$Engineer}
  $body=@{text=$text;model_id=$Model;voice_settings=$set[$who]}|ConvertTo-Json -Compress
  try{Invoke-WebRequest -Uri "https://api.elevenlabs.io/v1/text-to-speech/$voice`?output_format=mp3_44100_128" -Method Post `
      -Headers @{'xi-api-key'=$key;'Accept'='audio/mpeg'} -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($body)) -OutFile $out -UseBasicParsing
    $n++;Write-Host "$id [$who]  $((Get-Item $out).Length) bytes  $text"}
  catch{$fail++;$msg=$_.Exception.Message;$r=$_.Exception.Response
    if($r){try{$msg+=' '+(New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd()}catch{}}
    if(Test-Path $out){Remove-Item $out}
    Write-Host "FAILED $id : $msg";if($fail -ge 3){Write-Host 'stopping after 3 failures';break}}}
Write-Host "made $n, kept $skip already there, failed $fail"
# the list of lines that have a file: the game only asks for these (sounds/radio/voices.json)
$ids=@($jobs|Where-Object{Test-Path (Join-Path $dir "$($_.id).mp3")}|ForEach-Object{$_.id})
[IO.File]::WriteAllText((Join-Path $dir 'voices.json'),(ConvertTo-Json -InputObject $ids -Compress),(New-Object Text.UTF8Encoding $false))
Write-Host "voices.json: $($ids.Count) lines"
