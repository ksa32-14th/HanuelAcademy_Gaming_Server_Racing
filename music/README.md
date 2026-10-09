# 게임 음악 파일

게임 내 음악(`src/music.js`의 `PLAYLIST`)은 이 폴더의 오디오 파일을 재생합니다. 저작권이 있는 곡이라 **파일은 저장소에 포함되어 있지 않습니다.** 정식으로 구매·보유한 파일을 아래 이름으로 넣으세요.

| 곡 | 파일 이름 |
|---|---|
| F1 — Hans Zimmer | `f1-hans-zimmer.mp3` |
| Lose My Mind — Don Toliver feat. Doja Cat | `lose-my-mind.mp3` |

- 파일이 없으면 그 곡은 조용히 건너뛰고, 둘 다 없으면 로비의 MUSIC 줄에 안내가 뜹니다.
- 곡을 추가하려면 `src/music.js`의 `PLAYLIST`에 `{title, artist, src}`를 한 줄 더 넣으면 됩니다.
- 재생: `PLAYLIST`에 넣은 순서대로 재생하고, 마지막 곡이 끝나면 첫 곡으로 돌아갑니다.
- 조작: 로비의 **MUSIC** 칩(OFF / ON), 주행 중 **B** 켜기/끄기. 엔진 소리 음소거(**N**)와는 따로 동작합니다.
- 주의: GitHub Pages는 공개 사이트라, 여기에 곡 파일을 커밋해 배포하면 저작권 문제가 생길 수 있습니다. 공개 배포에 쓰려면 사용 허가를 받은 음원을 쓰세요.
