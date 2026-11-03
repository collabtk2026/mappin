# 작업 로그

> 최신 항목이 위. 각 항목: 요청 → 한 일 → 결정 → 검증 → 남은 일.

---

## 2026-11-03 #3 — 환경 제약으로 못 한 일 정리

**요청**: 환경 제약 때문에 하지 못한 것을 문서에 잘 기록해서, 다른 환경에서 실행할 때 해결할 수 있게 정리.

**한 일**
- [ENV_PENDING.md](ENV_PENDING.md)를 새로 만듦. 항목 E-01~E-09마다 막힌 이유, 필요한 환경, 실행 명령, 예상 오류와 대처, 완료 기준, 결과 기록 위치를 적음.
  - E-01 Android 실제 빌드
  - E-02 Android 실기기
  - E-03 iOS 빌드/실기기
  - E-04 실제 YouTube 대상 검증
  - E-05 Android WebView Media Session 지원 여부
  - E-06 Chromium 엔진 소스 확인
  - E-07 막힌 웹 출처 원문
  - E-08 기기 결과가 필요한 결정 4건
  - E-09 iOS 앱 아이콘, 실기기 스크린샷
- 다른 환경에서 바로 실행할 스크립트 추가:
  - `scripts/check-android.sh [--install]`: 공용 테스트 → assembleDebug → APK assets 확인 → lint → (기기) 설치, 서비스/미디어세션/프로세스 덤프, logcat
  - `scripts/check-ios.sh`: xcodegen → 시뮬레이터 빌드(서명 없음) → 번들 리소스/UIBackgroundModes 확인
  - `shared/test/live-youtube.mjs`: 실제 m.youtube.com을 Pixel 7 에뮬레이션으로 열어 확인. 확인 항목은 메타데이터·핸들러(A), Media Session 폴리필 경로(B), 실제 탭 숨김 BG 켬/끔(C/D, HEADED), music.youtube.com(E)
- `CLAUDE.md`에 "새 환경에서는 ENV_PENDING.md부터" 규칙 추가. README(DOCS), OVERVIEW, TEST_PLAN, ARCHITECTURE(Activity 종료 시 hidden 전환 빈틈), bgplay/README에 연결.
- `.gitignore`: `scripts/out/`, `shared/test/live-report.json`.

**검증**
- 스크립트 두 개는 `bash -n` 문법 검사만 함(SDK/Xcode 없음).
- `live-youtube.mjs`는 `node --check` 통과. 실행하면 이 환경에서는 YouTube 차단(`ERR_TUNNEL_CONNECTION_FAILED`)으로 4개 실행이 모두 실패하는데, 실패를 보고서에 정상적으로 남기는 것까지 확인함.
- 실제 결과는 없음.

**남은 일**: ENV_PENDING.md 권장 순서대로 다른 환경에서 실행.

**커밋**: `230d285`

---

## 2026-11-03 #2 — 문서 체계 + 사례 조사 + 빠른 저장/보관함 기능

**요청**
- 작업 내용을 항상 `DOCS/` 폴더에 MD로 기록하고, 로그 파일은 따로 유지하고, 전체 개요 파일과 주제별 파일을 각각 둘 것.
- 비슷한 앱 사례를 조사해서 어떻게 구현했는지 정리한 다음 설계할 것.
- 상단 버튼 2개: ① 지금 재생 중인 곡을 **임시 플레이리스트**에 한 번에 저장, ② **카테고리를 골라** 분류해서 저장. 임시 저장한 곡은 나중에 쉽게 분류하는 UI. 목적은 "일단 빨리 저장하고 나중에 분류".

**한 일**
1. 문서 체계
   - `bgplay/DOCS/` 생성: README(규칙·목록), LOG, OVERVIEW, DECISIONS, RESEARCH_BRAVE, CASE_STUDIES, FEATURE_PLAYLIST, ARCHITECTURE, TEST_PLAN, RISKS, images/.
   - 기존 `docs/RESEARCH.md`를 주제별로 나누고 `docs/`는 삭제.
   - `bgplay/CLAUDE.md`에 "항상 DOCS에 기록" 규칙을 적어 이후 세션에도 적용되게 함.
2. 사례 조사(→ [CASE_STUDIES.md](CASE_STUDIES.md)): 오픈소스 저장소를 clone해서 코드를 직접 확인함.
   - 앱: YTPro, NouTube, Firefox 확장 2종, ReVanced, YTLite/uYouEnhanced, Pear Desktop(구 th-ch/youtube-music), NewPipe, Metrolist 외 네이티브 클라이언트 10여 개.
   - 보도 기반: ProTube·Musi·Vanced 정책 이력.
   - UX 패턴: YouTube, YT Music, Spotify, NewPipe, Metrolist, NouTube, Todoist, GTD.
   - 핵심 발견:
     - BgPlay와 같은 구조인 YTPro/NouTube가 `onWindowVisibilityChanged` 오버라이드와 렌더러 우선순위 정책을 쓴다(우리와 동일).
     - Android WebView에는 `navigator.mediaSession`이 없다(폴리필 필요).
     - 원탭 저장 + 스낵바 "변경" 패턴이 업계 표준이다.
3. 설계(→ [FEATURE_PLAYLIST.md](FEATURE_PLAYLIST.md), [DECISIONS.md](DECISIONS.md) D-05~D-11)
   - 보관함 UI·로직을 공용 웹 모듈로 만들어 양 플랫폼이 투명 오버레이 WebView로 띄우기로 함(D-06).
   - 카테고리는 여러 개 소속 + 태그, 임시함은 "어느 카테고리에도 없는 곡"으로 계산(D-07, D-08).
4. 구현
   - `shared/web/library/` core.js·ui.js·style.css·index.html
     - 분류 시트(MRU 칩, 태그, 지난번처럼, 즉석 새 카테고리)
     - 임시함(빠른 이동 칩, 배지), 하나씩 분류(탭 한 번에 분류하고 다음, 여러 개 선택, 건너뛰기, 삭제, 되돌리기)
     - 카테고리 상세(전체 재생, 셔플, 태그 필터, 편집), 전체 검색, 다중 선택, 4초 되돌리기 토스트, 내보내기와 가져오기
   - `shared/js/bgplay.js`: Media Session 폴리필(Android WebView용) 추가.
   - Android
     - `LibraryController`(WebViewAssetLoader 오버레이), `LibraryStore`(AtomicFile + 대기열)
     - 상단 바 재구성(＋ 임시 / 분류 / 보관함 N / ⋮), 스낵바
     - 재생 큐(ended 시 다음 곡, 다른 영상으로 가면 종료)
     - 알림 액션과 MediaSession custom action "임시 저장"(앱 Activity가 없으면 대기열에 저장)
   - iOS
     - `LibraryOverlay`, `LibraryStore`, `SnackBar`
     - 상단 바(＋ 임시[길게 누르면 분류] / 분류 / 보관함 N), 재생 큐, 잠금화면 다음/이전 → 큐
     - XcodeGen에 `library/` 폴더 리소스 추가

**결정**: D-03 재확인 — 사례에 있던 "YouTube가 건 pause를 주기적으로 되돌리는 guard"와 가짜 입력 keep-alive는 Premium 차단 우회라서 넣지 않음.

**검증**
- `bgplay.test.mjs` 12/12(폴리필 테스트 추가. API를 지운 Chromium에서 폴리필 경로를 타는 것도 확인함).
- `library.test.mjs` 18/18.
- Android Kotlin 컴파일 성공(Android 15 프레임워크 jar + androidx.webkit 스텁).
- iOS 미빌드. 실기기 미검증.

**고친 버그(테스트로 발견)**
- 길게 눌러 선택한 직후 0.6초 안의 다른 줄 탭이 무시되던 문제 → 같은 줄에서 손을 뗄 때의 클릭 1회만 무시하도록 변경.
- 시트 안에서 칩을 누를 때마다 등장 애니메이션이 다시 재생되던 문제 → 새로 열릴 때만 재생.
- 하단 바가 있을 때 숨겨진 토스트가 빈 막대로 보이던 문제.

**남은 일**: 실기기 검증([TEST_PLAN.md](TEST_PLAN.md) §1·§2), 백그라운드 큐 진행 보강, iOS 잠금화면 저장, Android PiP.

**커밋**: `e839e38` (브랜치 `ccr-94ee0a85-9h95lk`)

---

## 2026-11-03 #1 — Brave 연구 + Android/iOS 앱 1차 구현

**요청**: Chromium 기반으로 YouTube(주로 음악)를 재생하고, 앱이 백그라운드로 가도 계속 재생되게. Brave 방식을 연구해서 Android/iOS 두 플랫폼 준비.

**한 일**
- `brave/brave-core` master `69f4ffb` 소스 분석: Android `youtube_script_injector_tab_helper.cc`(visibility 위장 JS 주입), iOS `media_backgrounding.ts`(위장 + 엔진 정지 2초 내 자동 재개).
- 2026년 1월 YouTube가 비 Premium 계정의 모바일 브라우저 백그라운드 재생을 서버 측에서 차단한 사실 확인(Google 확인, 보도).
- 공용 주입 스크립트 `shared/js/bgplay.js` + Playwright 테스트 11개.
- Android 앱(Kotlin, System WebView): `BackgroundWebView`(창 가시성 신호 차단), `PlaybackService`(mediaPlayback FGS + MediaSession + 알림 + WakeLock), `PlayerController`(WebView 싱글턴, document-start 주입, origin 제한 브리지).
- iOS 앱(Swift, WKWebView): 사용자 스크립트, `AudioSessionManager`, `NowPlayingController`, PiP 버튼, XcodeGen `project.yml`.

**결정**: Android는 Chromium 포크 대신 System WebView. iOS는 WebKit 강제라 WKWebView. UA 위장·스트림 추출 같은 Premium 확인 우회는 하지 않음.

**검증**: bgplay.js 테스트 11/11. Android Kotlin 컴파일 확인(Android 15 프레임워크 jar + androidx.webkit 스텁). iOS는 빌드 환경 없음. 실기기 미검증.

**커밋**: `b89133e` (브랜치 `ccr-94ee0a85-9h95lk`)
