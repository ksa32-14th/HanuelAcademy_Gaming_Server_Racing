# HRC — Haneul Racing Championship (모듈화 + 성능/그래픽 개선판)

빌드 도구 없이 GitHub Pages에 그대로 올라가는 정적 ES 모듈 구조입니다. (폴더 전체를 저장소 루트에 커밋 → Pages)

로컬 실행: `python -m http.server` 또는 `npx serve` 등 아무 정적 서버 (file:// 은 ES 모듈이 막힘). Windows: `powershell -ExecutionPolicy Bypass -File serve.ps1`

```
index.html            HUD/메뉴 마크업 + 로딩 화면
css/style.css
src/main.js           로딩 화면을 먼저 그린 뒤 game.js 로드
src/game.js           물리·AI·씬·HUD·오디오 (렌더러/품질 적용 포함)
src/quality.js        LOW/MEDIUM/HIGH/ULTRA 프리셋, AUTO 감지, 동적 해상도
src/config.js         차량/규정 상수, 팀, 드라이버, 서킷 선택
src/track.js          트랙 지오메트리, 레이싱 라인(최소곡률), AI 속도 프로파일
src/textures.js       절차적 텍스처 생성
src/data/tracks.js    서킷 정의
src/data/osm-songdo.js  송도 OSM 데이터(148KB, 송도 선택 시에만 로드)
vendor/three/         three r160 (min) + 사용 addon — CDN 의존 제거
```

## 조작
게임 내 `Q`: 그래픽 품질 순환 (AUTO→LOW→MEDIUM→HIGH→ULTRA). 로비에서도 선택 가능. 텍스처 해상도가 바뀌는 전환은 자동 새로고침됩니다.
