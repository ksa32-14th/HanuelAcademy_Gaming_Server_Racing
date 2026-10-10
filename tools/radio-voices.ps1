# Team radio voice lines: makes sounds/radio/<id>.mp3 for every line in sounds/radio/lines.json with ElevenLabs
# text-to-speech (the game plays them through a radio filter, see src/radio.js).
#
#   powershell -ExecutionPolicy Bypass -File tools/radio-voices.ps1            # only the lines that have no file yet
#   powershell -ExecutionPolicy Bypass -File tools/radio-voices.ps1 -Force     # all of them again
#   ... -Only box,go                                                            # just these ids
#   ... -Voice <voice id>                                                       # another ElevenLabs voice
#
# The API key comes from the ELEVENLABS_API_KEY environment variable or from tools/.elevenlabs-key (one line, the key
# only). That file is in .gitignore — never commit the key.
param([switch]$Force,[string[]]$Only,[string]$Voice='JBFqnCBsd6RMkjVDRZzb',[string]$Model='eleven_multilingual_v2')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$key=$env:ELEVENLABS_API_KEY
$kf=Join-Path $PSScriptRoot '.elevenlabs-key'
if(-not $key -and (Test-Path $kf)){$key=(Get-Content $kf -Raw).Trim()}
if(-not $key){Write-Error "No ElevenLabs API key: set ELEVENLABS_API_KEY or put the key in tools/.elevenlabs-key";exit 1}
$dir=Join-Path $root 'sounds\radio'
$lines=Get-Content (Join-Path $dir 'lines.json') -Raw -Encoding UTF8|ConvertFrom-Json
# a calm race engineer: steady but not flat, close to the voice's own character
$settings=@{stability=0.45;similarity_boost=0.8;style=0.25;use_speaker_boost=$true}
$url="https://api.elevenlabs.io/v1/text-to-speech/$Voice`?output_format=mp3_44100_128"
$n=0;$skip=0
foreach($p in $lines.PSObject.Properties){
  $id=$p.Name;$text=$p.Value
  if($Only -and ($Only -notcontains $id)){continue}
  $out=Join-Path $dir "$id.mp3"
  if((Test-Path $out) -and -not $Force){$skip++;continue}
  $body=@{text=$text;model_id=$Model;voice_settings=$settings}|ConvertTo-Json -Compress
  Invoke-WebRequest -Uri $url -Method Post -Headers @{'xi-api-key'=$key;'Accept'='audio/mpeg'} -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -OutFile $out -UseBasicParsing
  $n++;Write-Host "$id  ($((Get-Item $out).Length) bytes)  $text"}
Write-Host "made $n, kept $skip already there"
# the list of lines that have a file: the game only asks for these (sounds/radio/voices.json)
$ids=@($lines.PSObject.Properties|Where-Object{Test-Path (Join-Path $dir "$($_.Name).mp3")}|ForEach-Object{$_.Name})
[IO.File]::WriteAllText((Join-Path $dir 'voices.json'),(ConvertTo-Json -InputObject $ids -Compress),(New-Object Text.UTF8Encoding $false))
Write-Host "voices.json: $($ids.Count) lines"
