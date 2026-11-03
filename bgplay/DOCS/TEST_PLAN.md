# 테스트 계획

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)

## 0. 자동 테스트 (이 환경에서 실행)

| 명령 | 대상 | 결과 (2026-11-03) |
|---|---|---|
| `node bgplay/shared/test/bgplay.test.mjs` | 주입 스크립트: 가시성 위장, 리스너 차단, 엔진 정지 자동 재개(2초 창), 사용자/통화 정지 비재개, holdAutoResume, 메타데이터·명령 브리지, BG 끔 대조군, **Media Session 폴리필** | **12/12** |
| `node bgplay/shared/test/library.test.mjs` | 보관함 core 7 + UI 11 ([FEATURE_PLAYLIST.md §6](FEATURE_PLAYLIST.md)) | **18/18** |
| Kotlin 컴파일 확인 | Android 15 프레임워크 jar(Robolectric android-all) + androidx.webkit 시그니처 스텁으로 `app/src/main/java` 전체 컴파일 | 성공 (리소스/매니페스트/AGP 빌드는 미실행) |
| iOS | 빌드 환경 없음 | 미실행 |

> 이 환경에서 dl.google.com이 막혀 있어 Android SDK/AGP 빌드를 할 수 없다. Mac이나 Android Studio에서 첫 빌드할 때 나오는 오류는 LOG에 기록한다.

## 1. 실기기 검증 계획 — 백그라운드 재생 (아직 안 함)

> 이 환경에는 Android SDK와 Xcode가 없다. Android Kotlin은 Android 15 프레임워크 API로 컴파일까지만 확인했고, iOS는 빌드하지 않았다. **아래 시나리오는 모두 실제 기기에서 확인해야 한다.**

| # | 시나리오 | Android | iOS |
|---|---|---|---|
| 1 | 비로그인, m.youtube.com 영상 → 홈 버튼 | ☐ | ☐ |
| 2 | 비로그인 → 화면 끄기(잠금) 5분 | ☐ | ☐ |
| 3 | music.youtube.com 재생목록 → 백그라운드에서 다음 곡 자동 진행 | ☐ | ☐ |
| 4 | **Google 로그인이 WebView에서 되는지** | ☐ | ☐ |
| 5 | Premium 계정 로그인 → 1–3 반복 | ☐ | ☐ |
| 6 | 잠금화면/알림의 재생·정지·다음·이전·탐색 | ☐ | ☐ |
| 7 | 블루투스 이어폰 버튼, 이어폰 분리 시 정지 | ☐ | ☐ |
| 8 | 통화 수신 → 통화 중 재개 안 함 → 종료 후 재개 | ☐ | ☐ |
| 9 | 최근 앱에서 스와이프 종료 시 동작 | ☐ | — |
| 10 | BG 끔 → 일반 브라우저처럼 멈추는지 | ☐ | ☐ |
| 11 | iOS: WebKit 자체 Now Playing과 앱 Now Playing이 충돌하는지(`Settings.nativeNowPlaying`) | — | ☐ |
| 12 | iOS: PiP 버튼 → PiP 상태로 백그라운드 | — | ☐ |
| 13 | 배터리/발열(1시간 재생) | ☐ | ☐ |

디버깅 도구: Android는 `chrome://inspect`(디버그 빌드에서 WebView 디버깅이 켜짐), iOS는 Safari 웹 인스펙터(디버그 빌드에서 `isInspectable`). `__bgplay.getState()`로 현재 상태를 볼 수 있다. 엔진 정지를 재개했을 때는 로그에 `autoResume`이 남는다.

## 2. 실기기 검증 계획 — 빠른 저장 / 보관함 (아직 안 함)

| # | 시나리오 | Android | iOS |
|---|---|---|---|
| P1 | 재생 중 "＋ 임시" → 스낵바 → "분류" → 시트에서 저장 | ☐ | ☐ |
| P2 | "＋ 임시" 길게 누르기 → 분류 시트 | ☐ | ☐ |
| P3 | 같은 곡을 다시 "＋ 임시" → "이미 저장됨 · …" | ☐ | ☐ |
| P4 | music.youtube.com에서 저장 → 제목/아티스트/정사각 아트워크가 맞는지 | ☐ | ☐ |
| P5 | 보관함 오버레이: 투명 배경 뒤로 YouTube가 보이고, 닫으면 아래 화면 터치가 되는지 | ☐ | ☐ |
| P6 | 분류 시트 태그 입력 시 키보드가 시트를 가리지 않는지(Android edge-to-edge, iOS) | ☐ | ☐ |
| P7 | 하나씩 분류 20곡 연속 — 속도와 되돌리기 | ☐ | ☐ |
| P8 | 카테고리 ▶ 전체 재생 → 앞 화면에서 곡이 끝나면 다음 곡 | ☐ | ☐ |
| P9 | **P8을 화면 끈 상태(백그라운드)에서** — 다음 곡 자동 진행 | ☐ | ☐ (위험 높음) |
| P10 | 큐 재생 중 잠금화면 다음/이전 → 큐를 따라가는지 | ☐ | ☐ |
| P11 | 알림 / 잠금화면의 "임시 저장"(앱 실행 중 / 앱 Activity 종료 후) | ☐ | — |
| P12 | 내보내기 → 다른 기기에서 가져오기(합치기) | ☐ | ☐ |
| P13 | 앱 강제 종료 후 재실행 시 보관함 유지 | ☐ | ☐ |
| P14 | "YouTube 재생목록으로"(watch_videos) 동작 여부 | ☐ | ☐ |
| P15 | 뒤로 가기(Android): 시트 → 상세 → 보관함 닫기 순서 | ☐ | — |
