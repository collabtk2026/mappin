# 작업 로그

> 최신 항목이 위. 각 항목: 요청 → 한 일 → 결정 → 검증 → 남은 일.

---

## 2026-11-04 #6 — 보관 위치 확정: `bgplay-main` 브랜치

**요청(선택)**: 사용자가 독립 저장소의 보관 위치로 "mappin 저장소의 별도 브랜치"를 선택함. Mappin 쪽 `bgplay/` 정리는 "선호 없음" → 권장안(제거 후 안내만 남김)을 적용.

**한 일**
- 독립 저장소(`main`, BgPlay만 담은 이력)를 `collabtk2026/mappin`의 **`bgplay-main`** 브랜치로 push함.
- README, HANDOFF, ENV_PENDING, OVERVIEW에 보관 위치와 받는 방법을 적음. 백로그: T-18 완료, T-19(별도 저장소 이전, 선택) 추가.
- Mappin 작업 브랜치(`ccr-94ee0a85-9h95lk`)에서 `bgplay/` 디렉터리를 제거하고, 루트 README에 이전 안내만 남김.

**받기**: `git clone -b bgplay-main --single-branch https://github.com/collabtk2026/mappin bgplay`

---

## 2026-11-03 #5 — Mappin 저장소에서 BgPlay 분리

**요청**: 저장소를 "Mappin"이라는 다른 앱과 같이 쓰고 있어 헷갈리므로, BgPlay 관련 내용만 따로 저장할 것.

**한 일**
- `git subtree split --prefix=bgplay`로 **BgPlay 커밋 이력만 뽑은 독립 저장소**를 만들고, `bgplay/` 내용을 저장소 루트로 올림.
- 독립 저장소에서 경로 표기를 정리함(`shared/...` → `shared/...` 등. 문서, 스크립트, 테스트 주석, AGENTS/CLAUDE 규칙). 이 정리는 독립 저장소에만 있는 커밋.
- 결과물:
  - git bundle 파일 `bgplay.bundle`: 이력 포함, `git clone bgplay.bundle bgplay`로 복원
  - 소스 압축 `bgplay-src.tar.gz`
- Mappin 쪽: 루트 README와 `README.md` 상단에 "Mappin과 무관한 별개 프로젝트"라는 안내를 추가함.
- 영구 저장 위치(새 GitHub 저장소 또는 별도 브랜치)는 사용자에게 확인을 받는 중. 이 세션은 새 저장소를 만들 수 없음.

**검증**: 독립 저장소에서 공용 테스트를 다시 실행함(결과는 독립 저장소 LOG의 이 항목 아래 "독립 저장소 검증"에 기록).

**독립 저장소 검증 (이 저장소에서 실행)**
- 경로 정리 후 `node shared/test/bgplay.test.mjs` 12/12, `node shared/test/library.test.mjs` 18/18
- `scripts/*.sh`는 `bash -n`, `live-youtube.mjs`는 `node --check` 통과. 문서 내부 링크 검사 통과
- 커밋 해시 대응표(Mappin ↔ 독립 저장소)는 [HANDOFF.md §2](HANDOFF.md)에 있음

---

## 2026-11-03 #4 — 스토어 출시 검토 + 인수인계 문서

**요청**
1. App Store/Google Play 출시 시 문제가 될 수 있는 경우를 체크하고, 피할 방법이나 대안을 사례와 함께 연구해 문서로.
2. 지금까지 한 일, 앞으로 할 일, 점검할 것을 다른 AI/모델이 읽고 작업할 수 있게 정리.

**한 일**
- [STORE_RELEASE.md](STORE_RELEASE.md)
  - Apple 조항(2.3.1, 2.5.2, 2.5.4, 2.5.6, 2.5.19, 4.1, 4.2, 4.2.2, 5.1.1, 5.2.1, 5.2.2, 5.2.3)은 **원문을 직접 확인**하고 우리 앱의 해당 부분과 위험도, 대응을 표로 정리.
  - Google Play(Device and Network Abuse, WebView 스팸, 상표, FGS 신고, **target API 36(2026-08-31)**, Data safety)와 YouTube 약관·API 정책도 같은 방식으로 정리.
  - 사례: ProTube, Musi, Kiwi(복귀 조건이 YouTube 백그라운드 재생 비활성화), Brave iOS 2026-06(오프라인 재생 제거 요구), Play 거절 포럼 사례, Vanced, NewPipe/YTPro/NouTube, Facebook Enterprise.
  - 전략 S1~S4 비교. **권장은 이중 트랙**: 풀 기능은 스토어 밖, 스토어에는 "보관함 우선" `store` 빌드(재생은 공식 앱에 위임).
  - 스토어 밖 배포 경로: Android 개발자 인증(2026-09 4개국, 2027 전 세계), TestFlight 내부, EU·일본 대체 마켓.
  - "하면 안 되는 회피 방법"과 이유(계정 해지), 빌드 변형 설계, 출시 전 체크리스트.
- [DECISIONS D-12](DECISIONS.md): 심사 회피 기법 금지, 이중 트랙.
- [HANDOFF.md](HANDOFF.md): 다른 AI/개발자용 인수인계. 내용은 시작 순서, 사용자와의 약속, 현재 상태와 커밋, 코드 지도, 브리지 프로토콜, 데이터 모델, 하지 말 것, 실행 명령, **백로그 T-01~T-25**(완료 기준 포함), 점검 목록, 문서 갱신 규칙, 용어.
- `AGENTS.md`(AI 공통 진입점) 추가. CLAUDE.md, DOCS/README, OVERVIEW, RISKS, ENV_PENDING(E-07에 support.google.com 추가)에 연결.

**검증**: 문서 작업만 함(코드 변경 없음). 문서 내부 링크 검사 통과.

**확인 못 한 것**
- `support.google.com`이 막혀 Play 정책 원문을 못 읽음. G1은 [보도], G2는 [추정]으로 표기 → ENV_PENDING E-07.
- YouTube 약관과 API 정책 원문, 공증 범위도 미확인.

**남은 일**: HANDOFF §6 백로그.

**커밋**: `821e150`

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
   - `DOCS/` 생성: README(규칙·목록), LOG, OVERVIEW, DECISIONS, RESEARCH_BRAVE, CASE_STUDIES, FEATURE_PLAYLIST, ARCHITECTURE, TEST_PLAN, RISKS, images/.
   - 기존 `docs/RESEARCH.md`를 주제별로 나누고 `docs/`는 삭제.
   - `CLAUDE.md`에 "항상 DOCS에 기록" 규칙을 적어 이후 세션에도 적용되게 함.
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
