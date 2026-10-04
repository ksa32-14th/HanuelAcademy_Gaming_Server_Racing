# 성능 측정 도구

게임 코드에는 영향이 없고 URL 플래그를 붙였을 때만 동작합니다.

| 플래그 | 동작 |
|---|---|
| `?perf` | 프레임 시간 p50/p95/p99, 33/50 ms 초과 프레임 수, 프레임당 물리 서브스텝, GPU ms, draw call, `renderer.info.memory`, `performance.memory`, 렌더 타깃 메모리 추정치를 기록합니다. `window.__perf`에 보관하고 10초마다 콘솔에 `[HRC perf]` JSON을 찍습니다. |
| `&noscaler` | 동적 해상도를 끕니다(같은 해상도로 비교할 때). |
| `&autopilot` | 플레이어 차도 AI가 운전합니다(사람 입력 없이 실제 주행 카메라로 측정). |
| `&scenario=120&leak=300` | 아래 고정 시나리오를 자동으로 실행합니다. |
| `?seed=N` | 난수를 mulberry32(N)로 고정합니다(기본값은 `Math.random` 그대로). |

WebGL 컨텍스트 손실/복구(`[HRC webgl]`)와 부팅 요약(`[HRC boot]`: GPU 이름, `detectPreset` 결과, 적용 프리셋, devicePixelRatio, 최종 pixel ratio)은 플래그 없이도 항상 콘솔에 남습니다.

## 고정 시나리오
부산, MEDIUM 고정, 동적 해상도 꺼짐, 1280×720 뷰포트:

1. 로비에서 그래픽 품질을 **MEDIUM**으로 고르거나 콘솔에서 `localStorage.setItem('hrc-quality','medium')`
2. `http://localhost:8080/?perf&noscaler&autopilot&scenario=120&leak=300#busan` 열기
3. 로비 5초 → 바로 레이스(퀄리 생략) → 120초 동안 프레임 통계 → 레이스 시작 후 300초에 메모리 스냅샷
4. 끝나면 `window.__scenario.done === true`이고 콘솔에 `[HRC scenario]` JSON 한 줄이 찍힙니다.

탭은 화면에 보이는 상태여야 합니다(숨겨진 탭은 `requestAnimationFrame`이 멈춤).
Chrome 작업 관리자(Shift+Esc)의 탭 메모리와 GPU 프로세스 메모리도 같은 시점에 기록해 두세요.

Playwright가 있으면 `node tools/perf-scenario.mjs` (먼저 `serve.ps1`로 8080 포트 서버 실행).

## 결정성 검사
콘솔에서:

```js
hrc.detHash(1, 6000)   // seed 1, 120 Hz 물리 6000스텝(50초): { hash, laps, best, ... }
```

플레이어 차는 AI가 운전하고, 모든 차의 x/z/v 값을 FNV 해시로 묶습니다. 물리·AI 코드를 바꾼 뒤 해시가 같으면 시뮬레이션 결과가 비트 단위로 같다는 뜻입니다. 실행 후에는 페이지를 새로고침하세요(세션 상태를 덮어씁니다).

기준값(P0, 이 브랜치의 첫 커밋): `detHash(1,6000)` = `6a6a15d0`, `detHash(7,14400)` = `42a49d49`.
