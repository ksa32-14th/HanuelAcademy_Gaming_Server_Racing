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

## 성능 메모 (Iris Xe 노트북 실측 기준)
- 병목은 GPU 픽셀 처리가 아니라 **CPU의 draw call 제출**과 **후처리 체인**이었습니다. 씬 자체는 GPU에서 720p 기준 ~5 ms.
- 백미러: 시야 거리 제한(자체 안개) + 상대 차량은 항상 1-draw LOD → 리프레시당 draw call 367 → ~60 (싱가포르), 794 → ~110 (송도).
- 정적 트랙 장식(노면/연석/방벽 스트립, 페인트 마킹, 개러지, 관중석)은 재질별로 병합, 송도 건물 장식은 색을 버텍스 컬러로 넣어 타일별로 병합(재질 1363 → 171).
- 가로등·가로수·펜스 기둥 타일은 가시 거리 밖이면 제출하지 않음. 카메라 far plane = 안개 끝.
- 차량: 도색/카본/타이어/림을 공용 버텍스 컬러 재질로 병합(근거리 차 20 → 12 draw), 원거리 LOD 전환 110 m → 60 m(그림자 유지).
- 후처리: LOW는 composer를 건너뛰고 직접 렌더, MEDIUM은 SMAA 대신 FXAA(~6 ms → ~1.5 ms), bloom은 축소 해상도.
- 동적 해상도(AUTO)는 GPU 타이머(EXT_disjoint_timer_query_webgl2)로 **GPU가 실제로 느릴 때만** 해상도를 내립니다. CPU가 병목인 프레임에서는 해상도를 낮춰도 빨라지지 않고 흐려지기만 하기 때문입니다.

## 배포 시 캐시
GitHub Pages는 파일을 10분간 캐시(`max-age=600`)하므로, 새 `game.js`가 캐시된 옛 모듈과 섞여 실행 오류가 날 수 있습니다. 로컬 모듈 import와 `index.html`의 `main.js`/CSS 주소에 `?v=20260930b` 버전 태그가 붙어 있으니, **배포할 때마다 이 값을 전부 한꺼번에 올려 주세요** (한 모듈이 여러 주소로 불리면 두 번 로드됩니다):
`grep -rl "?v=20260930b" index.html src | xargs sed -i "s/?v=20260930b/?v=새값/g"`
