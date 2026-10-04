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
src/data/osm-busan.js   부산 OSM 데이터(153KB, 부산 선택 시에만 로드)
vendor/three/         three r160 (min) + 사용 addon — CDN 의존 제거
```

## 서킷
| 서킷 | 길이 | 시간대 | 비고 |
|---|---|---|---|
| Singapore · Marina Bay | 5.063 km | 밤 | |
| Incheon · Songdo | 7.450 km | 해 질 녘 | OSM 실제 건물·도로 |
| Busan · Centum City | 5.790 km | 낮 | GPX 경로 기반, OSM 실제 건물·도로·해안선, 피트 = 벡스코 야외주차장 |

### 부산 그랑프리 (Busan · Centum City)
- 레이아웃: `Busan_GP.gpx` 경로 그대로(반시계). APEC로를 따라 벡스코를 지나는 직선이 스타트/피니시, 센텀시티 → 수영강 하구 → 마린시티 해안 → 해운대 헤어핀 → 해운대로로 돌아옵니다. 좌표는 35.1650 N, 129.1400 E 기준 미터이고 실측 축척(SC ≈ 1.009)입니다.
- 피트: 벡스코 제1·제2전시장 사이 야외주차장. 주차장 길이가 ~240 m라 박스 간격을 17 m로 줄였습니다(`boxStart`/`boxGap`). 피트 출구도 트랙별로 지정 가능(`pitExit`/`pitExitLen`).
- 배경 데이터: OpenStreetMap(건물 1,132동 중 902동 실제 높이, 도로, 수영강·수영만 해안선, 해수욕장, 주차장, 광안대로 고가). 광안대교 현수교 구간·엘시티·주변 산(장산·금련산·황령산·배산·달맞이 언덕)은 위치 기준으로 직접 모델링.
- vworld 3D 데이터는 API 키가 필요해 이번 빌드에는 쓰지 않았습니다. 키가 생기면 건물 높이·지형(DEM)을 vworld 값으로 교체할 수 있습니다.
- 낮 모드(`day:true`): 하늘·헤이즈·조명·창문 발광을 낮용으로 전환. 밝은 지면 위에서 바다/도로 레이어가 깜빡이지 않도록 평면 레이어는 깊이 기록 없이 고정 순서로 그립니다(`groundLayer`).

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
GitHub Pages는 파일을 10분간 캐시(`max-age=600`)하므로, 새 `game.js`가 캐시된 옛 모듈과 섞여 실행 오류가 날 수 있습니다. 로컬 모듈 import와 `index.html`의 `main.js`/CSS 주소에 `?v=20261004a` 버전 태그가 붙어 있으니, **배포할 때마다 이 값을 전부 한꺼번에 올려 주세요** (한 모듈이 여러 주소로 불리면 두 번 로드됩니다):
`grep -rl "?v=20261004a" index.html src | xargs sed -i "s/?v=20261004a/?v=새값/g"`
