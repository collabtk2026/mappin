# BgPlay 전체 개요

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · 마지막 갱신: 2026-11-03

## 한 줄 요약

m.youtube.com / music.youtube.com을 앱 안에서 띄워 **백그라운드에서도 음악을 계속 재생**하고, 재생 중인 곡을 **버튼 한 번으로 임시함에 저장했다가 나중에 카테고리·태그로 분류**하는 Android/iOS 앱.

## 목표

1. 화면을 끄거나 다른 앱으로 가도 음악이 계속 나온다(Brave 방식 연구 → 앱으로 구현).
2. 듣다가 마음에 드는 곡은 **아무 결정 없이 즉시 저장**하고, 정리는 나중에 몰아서 한다.
3. Android와 iOS 두 플랫폼.

## 현재 기능

| 영역 | 기능 | Android | iOS |
|---|---|---|---|
| 재생 | YouTube / YouTube Music 웹을 앱 안에서 재생 | ✅ | ✅ |
| 백그라운드 | 페이지 가시성 위장 + 엔진 정지 자동 재개 (Brave 방식) | ✅ | ✅ |
| 백그라운드 | OS 레이어: Android 포그라운드 서비스·MediaSession·알림, iOS 오디오 세션·잠금화면 | ✅ | ✅ |
| 백그라운드 | BG 켬/끔 토글 | ✅ (⋮ 메뉴) | ✅ (하단 툴바) |
| 저장 | 상단 **＋ 임시**: 탭 한 번에 임시함 저장, 스낵바 [분류] | ✅ | ✅ |
| 저장 | 상단 **분류**(또는 ＋ 길게 누르기): 카테고리·태그 시트 | ✅ | ✅ |
| 저장 | 알림/잠금화면의 "임시 저장" | ✅ | ⏳ |
| 정리 | 보관함: 임시함(빠른 이동 칩), 하나씩 분류, 카테고리, 전체 검색·태그 필터, 다중 선택, 되돌리기 | ✅ | ✅ |
| 재생 | 카테고리 전체 재생/셔플(앱 큐), 잠금화면 다음/이전 → 큐 | ✅ | ✅ |
| 데이터 | JSON 내보내기·가져오기 | ✅ | ✅ |
| 기타 | 공유/링크로 열기 | ✅ (공유 인텐트) | ✅ (`bgplay://` 스킴) |
| 기타 | PiP | ⏳ | ✅ (버튼) |

✅ 구현됨(실기기 미검증) · ⏳ 다음 단계

## 구조

```
bgplay/  (저장소 루트)
├─ CLAUDE.md                   작업 규칙 (항상 DOCS에 기록)
├─ DOCS/                       모든 문서 (이 폴더)
├─ shared/
│  ├─ js/bgplay.js             YouTube 페이지 주입 스크립트 (양 플랫폼 공용)
│  ├─ web/library/             보관함 UI + 데이터 로직 (양 플랫폼 공용)
│  └─ test/                    Playwright/Chromium 테스트 (12 + 18)
├─ android/                    Kotlin, System WebView, minSdk 26 / targetSdk 35
└─ ios/                        Swift/UIKit, WKWebView, iOS 16+, XcodeGen
```

자세한 내용은 [ARCHITECTURE.md](ARCHITECTURE.md)에 있다.

## 상태

| 항목 | 상태 |
|---|---|
| 공용 스크립트 테스트 | 12/12 통과 |
| 보관함 테스트 | 18/18 통과 |
| Android | Kotlin 컴파일 확인. AGP 빌드와 실기기 실행은 아직 안 함(이 환경에 SDK 없음) |
| iOS | 코드 작성만 함. 빌드는 아직 안 함(Xcode 없음) |
| 실기기 시나리오 | [TEST_PLAN.md](TEST_PLAN.md) 체크리스트 0/28 |
| 실제 YouTube 대상 검증 | 스크립트(`shared/test/live-youtube.mjs`)만 준비됨. 이 환경에선 YouTube 차단으로 미실행 |
| 환경 제약 항목 | [ENV_PENDING.md](ENV_PENDING.md) E-01 ~ E-09, 모두 미해결 |

## 중요한 제약 (꼭 알아둘 것)

- **스토어 출시**: 지금 형태로는 거의 불가능하다. 권장은 이중 트랙이다. 풀 기능은 스토어 밖, 스토어에는 재생을 공식 앱에 맡기는 "보관함 우선" 빌드([STORE_RELEASE.md](STORE_RELEASE.md), [DECISIONS D-12](DECISIONS.md)).

- **2026년 1월부터 YouTube가 비 Premium 계정의 모바일 브라우저 백그라운드 재생을 서버 쪽에서 막는다.** 위장 레이어는 보장되지 않는다. Premium 계정의 백그라운드 재생을 OS 레이어로 받쳐 주는 것이 확실한 가치다([RESEARCH_BRAVE.md §3](RESEARCH_BRAVE.md)).
- Premium 확인을 우회하는 기법(UA 위장, 스트림 추출, YouTube가 건 pause를 되돌리는 guard)은 넣지 않는다([DECISIONS D-03](DECISIONS.md)).
- 스토어 배포는 위험하다(ProTube·Musi 삭제, Vanced C&D). 개인 사이드로드나 TestFlight를 전제로 한다([RISKS.md](RISKS.md)).
- WebView 안에서 Google 로그인이 막힐 수 있다. 실기기에서 1순위로 확인해야 한다.

## 다음 단계

> 전체 백로그(T-xx)와 점검 목록은 **[HANDOFF.md](HANDOFF.md)** §6–§7에 있다.

> 환경 때문에 못 한 일(빌드, 실기기, 실제 YouTube 검증 등)과 실행 절차는 **[ENV_PENDING.md](ENV_PENDING.md)**에 정리돼 있다.

1. 실기기 검증: 로그인, 백그라운드 재생(Premium/비 Premium), 보관함 오버레이, **백그라운드 큐 진행**.
2. 결과에 따라 백그라운드 다음 곡 진행을 보강한다(끝나기 전에 미리 넘기기, 재시도).
3. iOS 잠금화면 저장(`bookmarkCommand`), Share Extension.
4. Android PiP.
5. 자동 로컬 백업, 휴지통.
6. ~~독립 저장소로 분리~~ → 완료. `collabtk2026/mappin`의 `bgplay-main` 브랜치에 보관(LOG #5·#6). 별도 GitHub 저장소 이전은 선택(HANDOFF T-19).
