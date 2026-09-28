#!/usr/bin/env bash
# Wraps the game source (an Artifact-style fragment: no doctype/html/head/body) into the
# standalone page index.html that GitHub Pages serves.
set -euo pipefail
cd "$(dirname "$0")/.."
{
  echo '<!doctype html>'
  echo '<html lang="ko">'
  echo '<head>'
  echo '<meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<meta name="description" content="HRC — Haneul Racing Championship: 브라우저에서 돌아가는 F1 스타일 레이싱 게임. 마리나 베이와 송도 스트리트 서킷.">'
  echo '</head>'
  echo '<body>'
  cat src/hrc-game.html
  echo '</body>'
  echo '</html>'
} > index.html
echo "index.html written ($(wc -c < index.html) bytes)"
