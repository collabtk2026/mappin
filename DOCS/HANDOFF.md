# 작업 인수인계 (AI/개발자용)

> 이 문서는 **다른 AI 모델이나 개발자가 이 문서만 읽고 이어서 작업할 수 있도록** 쓴 것이다. 지금까지 한 일, 앞으로 할 일, 점검할 것을 담는다.
> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)
>
> 마지막 갱신: 2026-11-04 · **저장소: [`collabtk2026/youplay`](https://github.com/collabtk2026/youplay), 기본 브랜치 `main`**. 받기: `git clone https://github.com/collabtk2026/youplay`.
> 앱 이름은 **Youplay**(구 BgPlay). 내부 식별자(`io.github.bgplay`, `bgplay.js`, `BgPlayNative`, Xcode 타깃 `BgPlay`, `bgplay://`)는 아직 옛 이름이다(D-13, T-26).
>
> 이력: `collabtk2026/mappin`의 `bgplay/` 디렉터리 → 2026-11-03 `git subtree split`으로 분리(`bgplay-main` 브랜치) → 2026-11-04 이 저장소로 이전. Mappin과는 무관하다.

---

## 0. 시작 순서

1. 이 문서 §1–§4(무엇을, 어디에, 하지 말 것)
2. [OVERVIEW.md](OVERVIEW.md): 기능 상태 한 장
3. 작업 환경에 맞는 문서
   - 빌드/기기/네트워크가 되는 환경 → [ENV_PENDING.md](ENV_PENDING.md)
   - 스토어 출시 관련 → [STORE_RELEASE.md](STORE_RELEASE.md)
   - 기능 작업 → [FEATURE_PLAYLIST.md](FEATURE_PLAYLIST.md), [ARCHITECTURE.md](ARCHITECTURE.md)
4. §6 백로그에서 작업을 고른다 → §7 점검 → §8 문서 갱신

**사용자와의 약속(반드시 지킬 것)**

- 사용자는 **한국어**로 소통한다. 문서도 한국어로 쓴다.
- 작업할 때마다 `DOCS/LOG.md`에 기록한다(최신이 위). 상태가 바뀌면 `OVERVIEW.md`, 결정은 `DECISIONS.md`, 환경 때문에 못 한 일은 `ENV_PENDING.md`에 남긴다(규칙: [README.md](README.md)).
- 커밋과 푸시는 지정 브랜치에만 한다. PR은 사용자가 요청할 때만 만든다.

---

## 1. 프로젝트 한눈에

- **목표**: YouTube와 YouTube Music을 앱 안에서 재생하면서 ① 앱이 백그라운드로 가도 음악이 계속 나오게 하고, ② 재생 중인 곡을 버튼 한 번으로 "임시함"에 저장했다가 나중에 카테고리·태그로 분류한다.
- **플랫폼**:
  - Android: Kotlin, 시스템 WebView(Chromium), minSdk 26, targetSdk 35, 의존성은 `androidx.webkit` 하나
  - iOS: Swift/UIKit, WKWebView, iOS 16+, XcodeGen
- **핵심 아이디어**:
  - 백그라운드 재생 = Brave 방식 페이지 스크립트(가시성 위장) + 엔진 신호 차단(Android `onWindowVisibilityChanged`) + OS 레이어(Android FGS·MediaSession, iOS AVAudioSession·UIBackgroundModes).
  - 보관함 = 공용 웹 모듈(`shared/web/library`)을 양 플랫폼이 투명 오버레이 WebView로 띄움.
- **외부 상황**: 2026-01부터 YouTube가 비 Premium 계정의 모바일 웹 백그라운드 재생을 서버 측에서 차단한다. 스토어 출시는 정책상 매우 어렵다([STORE_RELEASE.md](STORE_RELEASE.md)).

---

## 2. 현재 상태 (2026-11-03)

| 영역 | 상태 | 검증 수준 |
|---|---|---|
| 공용 주입 스크립트 `bgplay.js` | 완료 | Chromium 테스트 12/12 (모의 페이지) |
| 공용 보관함 `shared/web/library` | 완료 | Node + Chromium 테스트 18/18, 스크린샷 |
| Android 앱 | 1차 완료 | **Kotlin 컴파일만** 확인(프레임워크 jar + androidx.webkit 스텁). AGP 빌드와 실기기 **미검증** |
| iOS 앱 | 1차 완료 | **한 번도 컴파일 안 됨**(Xcode 없음) |
| 실제 YouTube 대상 검증 | 스크립트만 준비 | 미실행(YouTube 차단 환경) |
| 스토어 출시 | 조사 완료, 미착수 | [STORE_RELEASE.md](STORE_RELEASE.md) |

커밋 이력(최신이 위):

> 아래 커밋 해시는 **분리 전 Mappin 저장소 기준**이다. 이 독립 저장소의 해시는 오른쪽 열에 있다(subtree split으로 해시가 바뀜).

| Mappin 커밋 | 독립 저장소 커밋 | 내용 |
|---|---|---|
| `41a4906`, `e31efb6` | `54ede72`, `43c3b20` | LOG #4 해시 기록, Mappin 쪽 분리 안내 |
| `821e150` | `701c039` | 스토어 출시 검토(STORE_RELEASE), 인수인계(HANDOFF), AGENTS.md, D-12 |
| `d8cfe72`, `230d285` | `42b41eb`, `e044ff4` | 환경 제약 정리(ENV_PENDING), 점검 스크립트 3개 |
| `fed8802`, `e839e38` | `7ce57f4`, `504a584` | DOCS 체계, 사례 조사, 빠른 저장·보관함, Media Session 폴리필 |
| `b89133e` | `5b55530` | Brave 연구, Android/iOS 1차 앱, `bgplay.js` |



---

## 3. 코드 지도

```
bgplay/  (저장소 루트)
├─ AGENTS.md / CLAUDE.md           AI 작업 규칙 (짧음, 이 문서로 안내)
├─ DOCS/                           모든 문서
├─ shared/
│  ├─ js/bgplay.js                 YouTube 페이지에 document-start로 주입 (양 플랫폼 공용)
│  ├─ web/library/                 보관함 UI + 데이터 (양 플랫폼 공용)
│  │   core.js  index.html  style.css  ui.js
│  └─ test/                        bgplay.test.mjs(12) library.test.mjs(18) live-youtube.mjs(미실행)
├─ android/app/src/main/java/io/github/bgplay/
│  ├─ BgPlayApp.kt                 Application: player(PlayerController), library(LibraryStore) 싱글턴
│  ├─ PlayerController.kt          재생 WebView 소유(프로세스 수명), 스크립트 주입, 브리지, 큐, currentTrack, 알림에서 저장
│  ├─ BackgroundWebView.kt         onWindowVisibilityChanged → 항상 VISIBLE
│  ├─ PlaybackService.kt           mediaPlayback FGS, MediaSession, 알림(이전/재생/다음/임시 저장/닫기), Wake/WifiLock
│  ├─ MainActivity.kt              상단 바(YouTube|Music|＋ 임시|분류|보관함 N|⋮), 스낵바, 전체화면, 뒤로 가기
│  ├─ LibraryController.kt         보관함 오버레이 WebView(WebViewAssetLoader), 브리지, boot와 대기열 반영
│  ├─ LibraryStore.kt              library.json / library_pending.json(AtomicFile)
│  ├─ PlaybackInfo.kt  Settings.kt  UrlPolicy.kt  ArtworkLoader.kt
│  └─ (res/, AndroidManifest.xml, app/build.gradle.kts: assets에 shared/js, shared/web 포함)
├─ ios/BgPlay/
│  ├─ AppDelegate.swift            @main + SceneDelegate(bgplay:// URL 열기)
│  ├─ PlayerViewController.swift   WKWebView, 사용자 스크립트, 브리지, 상단 바, 하단 툴바, 큐, 잠금화면 명령 연결
│  ├─ LibraryOverlay.swift         보관함 오버레이 WKWebView(file://, 번들 library/)
│  ├─ AudioSessionManager.swift    .playback, 인터럽션 → holdAutoResume, 이어폰 분리 → pause
│  ├─ NowPlayingController.swift   MPNowPlayingInfoCenter, MPRemoteCommandCenter
│  ├─ LibraryStore.swift  SnackBar.swift  Settings.swift  URLPolicy.swift  PlaybackInfo.swift  Info.plist
│  └─ ../project.yml               XcodeGen (bgplay.js, library 폴더를 리소스로)
└─ scripts/                        check-android.sh, check-ios.sh (미실행)
```

### 3.1 브리지 프로토콜 (바꿀 때는 양 플랫폼 + 테스트를 같이 고칠 것)

**재생 WebView ↔ 네이티브** (`bgplay.js`)

| 방향 | 형식 |
|---|---|
| 설정 | 주입 전에 붙임: `window.__BGPLAY_CONFIG={backgroundPlay, platform, allowedHostSuffixes?}` |
| 페이지 → 네이티브 | Android `BgPlayNative.postMessage(json)`, iOS `webkit.messageHandlers.bgplay.postMessage(json)`. 메시지 종류: `{type:'state', playing, ended, position, duration, rate, title, artist, album, artwork, url, canNext, canPrev, hasMedia}`, `{type:'autoResume'}`, `{type:'visibility', state}` |
| 네이티브 → 페이지 | `window.__bgplay.command(name, arg)`. name: `play`, `pause`, `toggle`, `next`, `prev`, `seekto(sec)`, `seekby(sec)`, `pip`, `holdAutoResume(ms)`, `state` |

**보관함 WebView ↔ 네이티브** (`shared/web/library/ui.js`)

| 방향 | 형식 |
|---|---|
| 네이티브 → 페이지 | `__bglib.boot(jsonString\|null)`, `quickSave(track)` → JSON 문자열 `{status:'added'\|'duplicate'\|'invalid', title, where[], inbox}`, `openSave(track)`, `openLibrary(tab?)`, `nowPlaying(track)`, `back()` → bool, `isReady()` |
| 페이지 → 네이티브 | Android `BgLibNative`, iOS `messageHandlers.bglib`. 메시지 종류: `ready`, `persist{data}`, `stats{inbox,total}`, `close`, `play{url,keepOpen}`, `playQueue{name,items[{videoId,url,title}],index}`, `toast{text}`, `export{json,filename}` |
| `track` | `{url, title, artist, artwork, duration}` (url은 YouTube 영상 URL) |

### 3.2 데이터 모델

`{v:1, items:{[videoId]:{videoId, source, title, artist, thumb, duration, addedAt, tags[]}}, categories:[{id, name, emoji, createdAt, lastUsedAt, items:[videoId]}], prefs:{lastSelection}}`. 임시함은 따로 저장하지 않고 "어느 카테고리에도 없는 곡"으로 계산한다(D-08). 자세한 내용은 [FEATURE_PLAYLIST §4](FEATURE_PLAYLIST.md).

---

## 4. 하지 말 것 / 지켜야 할 불변 조건

| 규칙 | 근거 |
|---|---|
| Premium 확인 우회(UA 위장, 스트림 추출, YouTube가 건 pause를 주기적으로 되돌리기, 가짜 입력 keep-alive)를 구현하지 않는다 | [DECISIONS D-03](DECISIONS.md) |
| 스토어 심사 회피(숨긴 기능, 원격 플래그, 원격 스크립트, 정체 위장, Enterprise 배포)를 하지 않는다 | [DECISIONS D-12](DECISIONS.md), [STORE_RELEASE §4](STORE_RELEASE.md) |
| 주입 스크립트는 앱 번들에 넣고 document-start에 주입한다. 원격 로딩 금지 | D-04 |
| 다운로드, 오프라인 저장, 오디오 추출 기능을 넣지 않는다 | Apple 5.2.3, Brave 2026-06 사례 |
| 앱 이름과 아이콘에 YouTube 상표를 쓰지 않는다 | STORE_RELEASE A4/G3 |
| `shared/` 를 고치면 `node shared/test/bgplay.test.mjs`, `library.test.mjs`가 모두 통과해야 한다 | [TEST_PLAN §0](TEST_PLAN.md) |
| 엔진(브라우저)이 건 정지만 자동 재개한다. JS `pause()`(사용자나 사이트)는 재개하지 않는다 | `bgplay.js` §2, 테스트 |
| 브리지 메시지는 출처를 검증한다(재생 WebView: YouTube 메인 프레임, 보관함: 앱 자산 origin/`file:`) | D-11 |
| 검증하지 못한 것을 "동작함"이라고 쓰지 않는다. 미검증은 미검증으로 기록한다 | 사용자 신뢰 |

---

## 5. 실행과 검증 명령

```bash
# 공용 (Node 22+, require('playwright') 가능해야 함)
node shared/test/bgplay.test.mjs              # 기대 12/12
node shared/test/library.test.mjs             # 기대 18/18 (SHOTS=<dir>로 스크린샷)
HEADED=1 node shared/test/live-youtube.mjs    # 실제 YouTube (판정 기준: ENV_PENDING E-04)

# Android (SDK 필요)
scripts/check-android.sh [--install]

# iOS (macOS + Xcode + xcodegen)
scripts/check-ios.sh
```

SDK 없이 Kotlin 문법·타입만 검사하는 방법(이번 환경에서 쓴 우회)은 [ENV_PENDING E-01](ENV_PENDING.md)에 있다. Robolectric `android-all` jar와 androidx.webkit 스텁으로 `kotlin("jvm")` 프로젝트를 만들어 `compileKotlin`한다.

---

## 6. 백로그 (우선순위순)

상태: ☐ 미착수 · ◐ 진행 중 · ✅ 완료 · ❌ 보류. 완료하면 상태와 LOG 항목 번호를 적는다.

### 6.1 검증 (환경이 필요함 — 세부 절차는 ENV_PENDING)

| ID | 작업 | 필요 환경 | 완료 기준 | 상태 |
|---|---|---|---|---|
| T-01 | 실제 YouTube에서 `live-youtube.mjs` 실행, 셀렉터·메타데이터·폴리필 확인 | YouTube 접속 PC | 판정표(E-04) 기입. 셀렉터가 다르면 `bgplay.js` 수정 + 테스트 | ☐ |
| T-02 | Android AGP 빌드, lint | Android SDK | APK 생성, assets 포함, lint 오류 0 | ☐ |
| T-03 | Android 실기기 TEST_PLAN §1·§2. Media Session 존재 여부(E-05) | Android 13+ 기기 | 체크리스트 기입. 로그인, 백그라운드, P9 결과를 LOG에 기록 | ☐ |
| T-04 | iOS 컴파일 오류 수정 | Mac + Xcode | `check-ios.sh` BUILD SUCCEEDED | ☐ |
| T-05 | iOS 실기기 TEST_PLAN §1·§2 | iPhone | 체크리스트 기입 | ☐ |
| T-06 | E-08 결정 4건(pre-advance, "계속 시청" 대화상자, iOS Now Playing, PiP 제스처) | T-03/T-05 결과 | DECISIONS 갱신 | ☐ |

### 6.2 기능·버그 (풀 버전 `full`)

| ID | 작업 | 위치 | 완료 기준 | 상태 |
|---|---|---|---|---|
| T-07 | 백그라운드 큐 진행 보강: 끝나기 3–4초 전에 다음 곡 로드, 재시도 3회(필요하다고 판단될 때만, T-06) | `PlayerController.advanceQueue`, `PlayerViewController.advanceQueue`(필요하면 `bgplay.js`에 근접 종료 이벤트 추가) | 화면 끈 상태에서 카테고리 5곡 연속 재생 | ☐ |
| T-08 | Activity 종료 시 WebView가 hidden으로 바뀌는 문제(E-06) 확인과 대책 | `BackgroundWebView`, `PlayerController.detach` | 최근 앱에서 스와이프 종료 후에도 재생 유지 또는 의도한 정지 | ☐ |
| T-09 | iOS 잠금화면 "임시 저장"(`MPRemoteCommandCenter.bookmarkCommand`) | `NowPlayingController`, `LibraryOverlay.quickSave` | 잠금화면에서 저장, 임시함 반영 | ☐ |
| T-10 | iOS Share Extension(YouTube 앱 → 공유 → 임시함) | 새 extension target + App Group 공유 저장소 | 공유 후 앱에 반영 | ☐ |
| T-11 | Android PiP | `MainActivity`(onUserLeaveHint, PictureInPictureParams) | 영상 PiP 진입·복귀 | ☐ |
| T-12 | **targetSdk 36 + predictive back 대응**(`onBackPressed` → `OnBackInvokedCallback`, API 33+) | `app/build.gradle.kts`, `MainActivity` | API 36 기기에서 뒤로 가기 순서(전체화면 → 보관함 → 웹 뒤로 → 백그라운드) 유지 | ☐ |
| T-13 | 의존성 최신화(AGP, Kotlin, androidx.webkit, Gradle) | `android/*.gradle.kts`, wrapper | T-02 통과 | ☐ |
| T-14 | 자동 로컬 백업, 휴지통(soft delete) | `core.js`, `ui.js`, 양 Store | 삭제 후 복구 가능, 테스트 추가 | ☐ |
| T-15 | 중복 저장 시 `saveCount`/저장 시각 갱신, 저장 시점 재생 위치 기억 | `core.js`(`quickSave`), `trackToItem` | 테스트 추가 | ☐ |
| T-16 | 주간 "임시함 정리" 알림 | Android WorkManager 또는 AlarmManager, iOS UNUserNotification | 설정에서 켜고 끄기 | ☐ |
| T-17 | iOS AppIcon, 실기기 스크린샷(E-09) | `ios/BgPlay/Assets.xcassets`, `project.yml`, `DOCS/images` | 빌드 경고 없음 | ☐ |
| T-18 | 독립 저장소 분리와 보관 | — | `bgplay-main` 브랜치에 push, Mappin 작업 브랜치에서 `bgplay/` 제거 후 안내만 남김 | ✅ LOG #6 |
| T-19 | 별도 GitHub 저장소로 이전 | — | `collabtk2026/youplay` `main`에 push | ✅ LOG #7 |
| T-26 | **정식 앱 ID와 내부 이름 확정**(Android `applicationId`/`namespace`, iOS 번들 ID, Xcode 타깃/폴더, `bgplay.js`·`BgPlayNative`·`__bgplay`·`bgplay://` 이름 변경 여부) | 스토어에 한 번 올린 ID는 바꿀 수 없음. 이름 상표 검토(D-13) 뒤 | ID 결정 → 일괄 변경 + 테스트 + 양 플랫폼 빌드 | ☐ |

### 6.3 스토어 트랙 (`store` 빌드 — 근거: STORE_RELEASE §3·§5·§6)

| ID | 작업 | 완료 기준 | 상태 |
|---|---|---|---|
| T-20 | 빌드 변형 분리. Android `productFlavors { full; store }`, iOS 별도 scheme/target + `SWIFT_ACTIVE_COMPILATION_CONDITIONS=STORE`. store에서는 `bgplay.js` 위장, `BackgroundWebView` 차단, `PlaybackService`, `UIBackgroundModes`, FGS 권한을 **빌드에서 제외** | store APK/IPA에 해당 코드·권한이 없음(apkanalyzer, 바이너리 grep) | ☐ |
| T-21 | store: 재생을 공식 앱으로 넘기기(YT Music → YouTube → 브라우저 순), Android `<queries>`, iOS Universal Link | 보관함에서 곡이나 카테고리 재생 시 공식 앱이 열림 | ☐ |
| T-22 | store: 공유 진입점 강화(Android 구현됨, iOS는 T-10) | 공유로 저장 → 분류 흐름 | ☐ |
| T-23 | (선택) YouTube Data API 재생목록 동기화(OAuth, 할당량) | 카테고리 ↔ YouTube 재생목록 단방향 동기화 | ☐ |
| T-24 | 개인정보처리방침 페이지, iOS `PrivacyInfo.xcprivacy`, Play Data safety, 스토어 문구(상표 미사용) | STORE_RELEASE §6 체크리스트 전부 체크 | ☐ |
| T-25 | 베타 심사로 반응 확인(TestFlight 외부, Play 비공개 테스트) | 결과를 STORE_RELEASE에 사례로 추가 | ☐ |

---

## 7. 점검 목록 (작업할 때마다)

**코드를 바꿨다면**
- [ ] `shared/`를 바꿨으면 테스트 두 개가 통과하는지(+ 새 동작이면 테스트 추가)
- [ ] 브리지 프로토콜을 바꿨으면 **Android, iOS, ui.js/bgplay.js, 테스트, 이 문서 §3.1**을 모두 고쳤는지
- [ ] Android: `getSystemService` 널 가능성, `RECEIVER_NOT_EXPORTED`(API 33+), FGS 시작 제약(Android 12+ 백그라운드 시작 금지)
- [ ] iOS: 메인 스레드(UI는 main), `[weak self]`, `evaluateJavaScript` 결과 타입
- [ ] 백그라운드 관련 변경이면 §4 불변 조건(D-03)에 어긋나지 않는지
- [ ] store 트랙이면 STORE_RELEASE §6 체크리스트에 영향이 있는지

**검증을 했다면**
- [ ] TEST_PLAN 체크박스, ENV_PENDING 상태 칸, 이 문서 §6 상태를 바꿨는지
- [ ] 실패나 미검증은 그대로 기록했는지(성공으로 포장하지 않음)

**알려진 위험(늘 의식할 것)**
- YouTube 페이지 DOM이나 JS가 바뀌면 `bgplay.js` 셀렉터와 메타데이터가 깨진다 → T-01을 주기적으로 실행
- 2026 YouTube 서버 측 차단: 비 Premium 계정은 언제든 끊길 수 있음(앱 결함이 아님)
- iOS 백그라운드에서 새 페이지 재생 시작이 막히면 큐 진행이 실패한다(T-07)
- WebView 안 Google 로그인이 막힐 수 있다 → Premium 경로 전체에 영향

---

## 8. 작업 후 문서 갱신 규칙

1. `LOG.md`: 새 항목을 맨 위에 추가한다. 제목 `## YYYY-MM-DD #N — 제목`, 내용은 요청 → 한 일 → 결정 → 검증 → 남은 일 → 커밋.
2. 이 문서 §2(상태, 커밋), §6(백로그 상태)
3. 바뀐 주제 문서(FEATURE, ARCHITECTURE, TEST_PLAN, ENV_PENDING, STORE_RELEASE, DECISIONS)
4. `OVERVIEW.md` 기능표와 상태표
5. 새 문서를 만들었으면 `DOCS/README.md` 목록에 추가

---

## 9. 용어

| 용어 | 뜻 |
|---|---|
| 임시함(inbox) | 어느 카테고리에도 속하지 않은 저장 곡 |
| 하나씩 분류(triage) | 임시함 곡을 카드로 하나씩 보여주며 탭 한 번에 분류하는 화면 |
| 가시성 위장 | `document.visibilityState`를 항상 'visible'로, `visibilitychange` 리스너 차단 |
| 엔진 주도 정지 | 브라우저 엔진이 JS `pause()` 없이 미디어를 멈춘 것(iOS 백그라운드 진입 등). 2초 창 안이면 자동 재개 |
| full / store | 개인용 풀 기능 빌드 / 스토어 정책 준수 빌드(T-20, 미구현) |
| E-xx | ENV_PENDING의 환경 제약 항목 |
| D-xx | DECISIONS의 결정 |
| T-xx | 이 문서의 백로그 작업 |
