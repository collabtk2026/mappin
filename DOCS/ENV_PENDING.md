# 환경 제약으로 못 한 일 — 다른 환경에서 해결하기

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)
>
> **새 환경에서 작업을 시작하면 이 문서부터 본다.** 항목을 끝낼 때마다 표의 "상태"를 바꾸고(☐ → ✅/❌, 날짜, 한 줄 메모) [LOG.md](LOG.md)에 기록한다.

작성일: 2026-11-03 · 작성 환경: Claude Code 클라우드 세션(Linux 컨테이너, 네트워크 허용 목록 제한, Android SDK/Xcode/기기 없음)

---

## 0. 한눈에 보기

| ID | 못 한 일 | 막힌 이유 | 필요한 환경 | 우선순위 | 상태 |
|---|---|---|---|---|---|
| E-01 | Android 실제 빌드(AGP, 리소스, 매니페스트, APK, lint) | `dl.google.com` 차단 → Android SDK와 Google Maven(AGP, androidx) 다운로드 불가 | Android Studio 또는 SDK 35 + JDK 17 | **최우선** | ☐ |
| E-02 | Android 실기기 검증(백그라운드 재생, 알림, 보관함, 큐) | 기기/에뮬레이터 없음 | Android 13+ 실기기 권장(14+ 이상적) | **최우선** | ☐ |
| E-03 | iOS 빌드와 실기기 검증 | macOS/Xcode 없음. Swift 코드는 **한 번도 컴파일 안 됨** | Mac + Xcode 15+ + iPhone(iOS 16+) | **최우선** | ☐ |
| E-04 | 실제 YouTube 페이지 대상 스크립트 검증 | `m.youtube.com` 등 YouTube 도메인 차단(403) | YouTube 접속되는 PC + Node 22 + Playwright | 높음 | ☐ |
| E-05 | Android WebView에 `navigator.mediaSession`이 정말 없는지 | 기기 없음. 사례 코드에서 추론만 함 | E-02와 같음 | 높음 | ☐ |
| E-06 | Chromium 엔진의 "숨겨진 비디오 일시정지" 규칙을 소스로 확인 | `chromium.googlesource.com` 차단 | 인터넷 되는 PC | 중간 | ☐ |
| E-07 | 막힌 웹 출처 원문 확인(정책, 보도, UX 문서) | 9to5google, androidauthority, thurrott, developers.google.com, **support.google.com**, culturedcode.com, mjtsai.com 차단. ReVanced GitHub은 로그인 요구 | 인터넷 되는 PC | 낮음 | ☐ |
| E-08 | 기기 결과가 있어야 정할 수 있는 결정 4건 | E-02, E-03 결과 필요 | — | 높음 | ☐ |
| E-09 | iOS 앱 아이콘, 실제 앱 스크린샷 | Xcode/기기 없음 | Mac, 기기 | 낮음 | ☐ |

**권장 순서**: E-04(PC만 있으면 됨, 30분) → E-01 → E-02 + E-05 → E-03 → E-08 → E-06/E-07/E-09

> **클라우드 세션에서 일부를 풀려면**: 환경 설정의 Network access에서 아래 호스트를 Allowed domains에 추가한다. 세션 상단의 클라우드 환경 메뉴 → Edit이며, Allow package managers는 체크한 채로 둔다([안내](https://code.claude.com/docs/en/cloud-environments#network-access)).
> - `dl.google.com`: E-01 빌드만 가능하고 기기 검증은 여전히 불가
> - `youtube.com`, `m.youtube.com`, `music.youtube.com`, `www.youtube.com`, `i.ytimg.com`, `googlevideo.com` 계열: E-04 헤드리스 부분
> - `chromium.googlesource.com`: E-06
> - 위 보도·문서 도메인: E-07
>
> E-02, E-03(실기기)과 iOS 빌드는 클라우드에서는 불가능하다.

---

## 1. 환경 준비 체크리스트

- [ ] 저장소 받기: BgPlay 독립 저장소를 clone한다(원격이 아직 없으면 `git clone bgplay.bundle bgplay`). 이하 모든 경로는 저장소 루트 기준이다.
- [ ] Node 22+, `npm i -g playwright` 또는 저장소 밖에서 `npx playwright install chromium`
  - 공용 테스트는 `require('playwright')`를 쓴다. 전역 설치나 `NODE_PATH`를 맞춘다.
- [ ] **Android**: Android Studio(최신), SDK Platform 35, Build-Tools, JDK 17+, USB 디버깅을 켠 기기
- [ ] **iOS**: Mac, Xcode 15 이상, `brew install xcodegen`, Apple ID(무료 Personal Team 가능), iPhone, Safari 웹 인스펙터 사용 설정(iPhone 설정 → Safari → 고급 → 웹 인스펙터)
- [ ] 테스트용 YouTube 계정 2개 권장: **Premium 1개, 비 Premium 1개**(2026 차단 비교용)

먼저 이 환경에서 통과한 테스트가 새 환경에서도 통과하는지 확인한다.

```bash
node shared/test/bgplay.test.mjs      # 기대: 12/12
node shared/test/library.test.mjs     # 기대: 18/18
```

---

## E-01 Android 실제 빌드

**이번에 확인한 것**: `app/src/main/java`의 Kotlin 전체가 컴파일된다. 다만 진짜 SDK가 아니라 Robolectric의 Android 15 프레임워크 jar(`org.robolectric:android-all:15-robolectric-12650502`)와 **androidx.webkit 시그니처를 손으로 쓴 스텁**을 썼다.
**확인 못 한 것**: AGP/Gradle 해석, 리소스(aapt2), 매니페스트 병합, 실제 androidx.webkit API, APK 패키징(assets에 `bgplay.js`, `library/*` 포함 여부), lint.

**실행**

```bash
scripts/check-android.sh          # 공용 테스트 → assembleDebug → APK assets 확인 → lintDebug
# 로그: scripts/out/android-*.log
```

또는 Android Studio에서 `android`를 열고 Sync → Run.

**예상 오류와 대처**

| 증상 | 원인 | 대처 |
|---|---|---|
| Plugin `com.android.application` 8.11.1을 찾을 수 없음, 또는 Gradle 버전 불일치 | 버전은 2025년 기준으로 적었고 확인 못 함 | Android Studio의 AGP Upgrade Assistant 사용. `android/build.gradle.kts`의 AGP/Kotlin 버전과 `gradle/wrapper/gradle-wrapper.properties`(현재 8.14.3)를 맞춘다 |
| AGP 9.x에서 `org.jetbrains.kotlin.android` 관련 오류 | AGP 9부터 Kotlin 지원이 내장됨 | 안내 메시지에 따라 Kotlin 플러그인을 빼거나 `android.builtInKotlin` 설정 |
| `kotlinOptions` deprecated 경고/오류 | Kotlin 2.x | `kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }`로 교체 |
| `addDocumentStartJavaScript`가 restricted/experimental API라는 오류 | androidx.webkit 버전에 따라 공개 여부가 다를 수 있음 | `androidx.webkit` 최신 버전으로 올리고 릴리스 노트 확인. 그래도 막히면 `onPageStarted` 폴백만으로 동작하는지 E-02에서 확인 |
| `compileSdk 35` 없음 | SDK 미설치 | SDK Manager에서 설치하거나 compileSdk를 설치된 최신으로 |
| lint: 하드코딩 문자열("⋮", "⟳"), `addJavascriptInterface`, `SetJavaScriptEnabled` | 의도된 부분 있음 | 오류 수준만 고치고 경고는 LOG에 기록 |

**스텁으로만 확인한 API**: 실제 빌드에서 시그니처가 같은지 본다.

- `WebViewCompat.addDocumentStartJavaScript(WebView, String, Set<String>): ScriptHandler` 그리고 `ScriptHandler.remove()`
- `WebViewCompat.addWebMessageListener(WebView, String, Set<String>, WebMessageListener)`. 리스너 인자는 `(view, message: WebMessageCompat, sourceOrigin: Uri, isMainFrame, replyProxy)`
- `WebMessageCompat.getData()`
- `WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context)).build()`와 `shouldInterceptRequest(Uri)`
- `WebViewFeature.DOCUMENT_START_SCRIPT`, `WebViewFeature.WEB_MESSAGE_LISTENER`

**완료 기준**: APK 생성, APK 안에 `assets/bgplay.js`와 `assets/library/{index.html,core.js,ui.js,style.css}`가 있음, lint 오류 0.

---

## E-02 Android 실기기 검증

```bash
scripts/check-android.sh --install   # 설치·실행 → (재생 중) 서비스/미디어세션 덤프 → (화면 끔 60초) 프로세스 상태 → logcat
```

**체크리스트**: [TEST_PLAN.md](TEST_PLAN.md) §1(백그라운드 1–13)과 §2(보관함 P1–P15). 특히 다음을 본다.

1. **Google 로그인이 WebView에서 되는지**(§1-4). 막히면 Premium 경로 전체가 막힌다. 우회하지 말고 결과만 기록한다([DECISIONS D-03](DECISIONS.md)).
2. 비 Premium과 Premium 계정 각각으로 화면을 끈 뒤 5분 재생(§1-2, §1-5). 2026 차단이 앱에서도 일어나는지 본다.
3. 보관함 카테고리 전체 재생을 **화면 끈 상태로**(P9). 다음 곡으로 넘어가지 않으면 E-08의 pre-advance를 결정한다.
4. 알림과 잠금화면의 "임시 저장"(P11). Activity를 종료한 뒤 누르고, 다시 앱을 열었을 때 임시함에 들어오는지 본다(pending 대기열 반영).

**디버깅**

- PC Chrome에서 `chrome://inspect`를 열면 WebView 두 개가 보인다.
  - YouTube WebView: `__bgplay.getState()`
  - 보관함 WebView(`appassets.androidplatform.net`): `__bglib._state()`
- `adb logcat -s BgPlay` 로그:
  - `engine pause detected; resumed`: 엔진이 멈춘 재생을 자동 재개함
  - `cannot start playback service`: 백그라운드에서 포그라운드 서비스 시작이 거부됨
  - `renderer gone`: 렌더러 프로세스가 죽어 WebView를 다시 만듦
- 서비스 확인: `adb shell dumpsys activity services io.github.bgplay`에 `isForeground=true`와 `foregroundServiceType=0x00000002`(mediaPlayback)가 나와야 한다.

---

## E-03 iOS 빌드와 실기기 검증

**이번에 확인한 것**: `Info.plist` 형식만 확인했다(plistlib). **Swift 파일 9개는 컴파일러에 한 번도 넣어 보지 않았다.**

```bash
scripts/check-ios.sh     # xcodegen → 시뮬레이터용 빌드(서명 없이) → 번들 리소스와 UIBackgroundModes 확인
```

**컴파일할 때 먼저 의심할 곳**

| 파일 | 의심 지점 |
|---|---|
| `PlayerViewController.swift` | `WKNavigationDelegate`/`WKUIDelegate` 메서드 시그니처(Xcode 16의 `@MainActor`/Sendable 경고), `WeakScriptMessageHandler`, 상단 바 `UIStackView` 구성, `if let x` 단축 문법(Swift 5.7+) |
| `LibraryOverlay.swift` | `NSObject` 상속 + `WKScriptMessageHandler` 확장, `Bundle.main.url(forResource:"index", withExtension:"html", subdirectory:"library")` 경로, `static func json` |
| `NowPlayingController.swift` | `MPRemoteCommandCenter.addTarget` 클로저 반환 타입, `MPMediaItemArtwork` |
| `AudioSessionManager.swift` | `NSObject` 상속 + `#selector` 옵저버 |
| `project.yml` | `../shared/web/library`를 `type: folder`로 → 번들 안 `library/` 폴더가 되는지. `../shared/js/bgplay.js` 리소스 |
| `Info.plist` | `$(PRODUCT_MODULE_NAME).SceneDelegate` 매핑, `UILaunchScreen` |

**실기기**

1. Xcode에서 Team을 지정하고 실제 기기에서 Run(시뮬레이터는 백그라운드 오디오가 다르다).
2. [TEST_PLAN.md](TEST_PLAN.md) §1과 §2를 실행한다. iOS에서 특히 볼 것:
   - 잠금 후 재생이 유지되는지
   - 잠금화면 컨트롤이 WebKit 자체 Now Playing과 충돌하는지(§1-11). 충돌하면 `Settings.nativeNowPlaying`을 false로 바꿔 비교한다.
   - PiP 버튼(§1-12)
   - **백그라운드에서 큐 다음 곡 자동 진행**(P9, 위험이 가장 높음)
3. 디버깅: Mac Safari → 개발 → 기기 → WebView 두 개(YouTube, `file://…/library/index.html`). Xcode 콘솔의 `[BgPlay]` 로그.

**완료 기준**: 경고는 있어도 되지만 오류 없이 빌드됨, 번들에 리소스가 있음, 기기에서 재생·잠금·보관함이 동작함.

---

## E-04 실제 YouTube 페이지 대상 스크립트 검증 (PC만 있으면 됨)

이 환경에서는 YouTube 접속이 막혀 **실제 YouTube에서 `bgplay.js`를 한 번도 돌려보지 못했다.** 테스트는 모두 YouTube를 흉내 낸 테스트 페이지로 했다.

```bash
node shared/test/live-youtube.mjs                  # 헤드리스: A(메타데이터), B(폴리필 경로)
HEADED=1 node shared/test/live-youtube.mjs         # + C/D: 실제 탭 숨김 20초 (BG 켬/끔 비교)
VIDEO=<ID> MUSIC=1 HEADED=1 node shared/test/live-youtube.mjs   # + E: music.youtube.com
# 보고서: shared/test/live-report.json (gitignore)
```

**판정 가이드**

| 실행 | 확인할 값 | 기대 | 다르면 |
|---|---|---|---|
| A | `state.title/artist/artwork` | YouTube Media Session 메타데이터 | `readMetadata()` 폴백(document.title) 개선 |
| A | `state.canNext`, `selectors` | 핸들러나 버튼 중 하나로 true | `NEXT_SELECTORS`/`PREV_SELECTORS`(bgplay.js) 갱신 |
| B | A와 같은 메타데이터 | 폴리필로 같은 값이 나옴 | 폴리필에서 YouTube가 쓰는 속성/메서드 추가 |
| C | `playingAfterHidden` | true(BG 켬) | 위장 범위 확인(`hidden`/`visibilityState`/리스너 차단) |
| D | `playingAfterHidden` | false(YouTube가 스스로 멈춤) | true면 데스크톱 에뮬레이션에서는 YouTube가 멈추지 않는다는 뜻 → C 결과는 의미가 약함, 실기기(E-02)로 판단 |
| C | `visibilityAfterHide.real` | `['hidden']` | 숨김이 안 됨 → HEADED로 다시 실행 |
| E | music 메타데이터 | 정사각 아트워크, 아티스트 | YT Music 셀렉터 보강 |

추가로 수동 확인할 것:

- `https://m.youtube.com/watch_videos?video_ids=<ID1>,<ID2>`가 재생목록으로 열리는지("YouTube 재생목록으로" 버튼, TEST_PLAN P14)
- 비 Premium 계정으로 로그인한 상태에서 C를 다시 실행해 2026 차단이 데스크톱 에뮬레이션에서도 나타나는지

---

## E-05 Android WebView의 Media Session 지원 여부

사례 조사에서 YTPro가 `!('mediaSession' in navigator)`일 때만 폴리필하는 것을 보고 "없다"고 추론했다. 공식 문서로는 확인하지 못했다.

- 기기에서 `chrome://inspect`로 YouTube WebView의 콘솔을 열고 `window.MediaSession`을 입력한다.
  - `undefined`: 폴리필 경로. 이 경우 `navigator.mediaSession.setActionHandler.toString()`에 bgplay 코드가 보여야 한다.
  - 함수: 네이티브 경로. 폴리필은 동작하지 않으며, 이 경우에도 문제는 없다.
- 결과를 [DECISIONS D-05](DECISIONS.md)에 덧붙인다.

---

## E-06 Chromium 엔진 동작 소스 확인

`BackgroundWebView.onWindowVisibilityChanged` 오버라이드가 왜 필요한지 엔진 소스로 뒷받침하려 했지만 `chromium.googlesource.com`이 막혀 있었다.

- `third_party/blink/renderer/platform/media/web_media_player_impl.cc`의 `ShouldPausePlaybackWhenHidden()`: Android에서 숨겨진 페이지의 소리 있는 비디오를 멈추는 조건
- `android_webview/java/src/org/chromium/android_webview/AwContents.java`의 `onWindowVisibilityChanged`, `onDetachedFromWindow`: WebView 가시성이 렌더러로 전달되는 경로
- **특히 확인할 것**: Activity가 종료돼 WebView가 창에서 떨어졌을 때(`onDetachedFromWindow`) 페이지가 hidden이 되며 미디어가 멈추는지. 현재 코드는 이 경우를 막지 못한다([ARCHITECTURE.md](ARCHITECTURE.md)). 멈춘다면 E-02의 "최근 앱에서 스와이프 종료"(§1-9) 결과와 함께 대책을 정한다.
- 결과는 [RESEARCH_BRAVE.md §4](RESEARCH_BRAVE.md)에 추가한다.

---

## E-07 막힌 웹 출처 원문 확인

검색 요약으로만 인용한 출처다. 원문을 읽고 [CASE_STUDIES.md](CASE_STUDIES.md)와 [RESEARCH_BRAVE.md](RESEARCH_BRAVE.md)의 표기를 [보도]에서 [공식]으로 바꾸거나 내용을 고친다.

| 출처 | 확인할 내용 |
|---|---|
| [YouTube API Developer Policies 가이드](https://developers.google.com/youtube/terms/developer-policies-guide) | "background play" 금지 문구 원문 |
| [Android Authority](https://www.androidauthority.com/youtube-background-play-broken-3636179/), [9to5Google](https://9to5google.com/2026/02/02/youtube-background-playback-workarounds-not-working-third-party-browsers/) | Google 공식 입장 원문, 차단 증상 |
| [Thurrott: Brave is resisting](https://www.thurrott.com/cloud/332298/youtube-blocks-background-play-on-mobile-web-browsers-but-brave-is-resisting) | 2026 차단 이후 Brave의 대응 방식 |
| [Brave: YouTube improvements on Android](https://brave.com/whats-new/android-youtube-improvements/), brave-core PR 27849 | Brave의 변경 내용(우리 스크립트에 반영할 게 있는지) |
| [ReVanced revanced-patches (GitHub)](https://github.com/ReVanced/revanced-patches) | GitLab 미러로 읽은 내용과 같은지(참고용) |
| culturedcode.com(Things 3 Inbox), mjtsai.com | UX 참고(우선순위 낮음) |
| **support.google.com**: Google Play 정책 원문(Device and Network Abuse, Spam/WebView, Intellectual Property, Deceptive Behavior), Play Console 도움말 | [STORE_RELEASE.md](STORE_RELEASE.md) G1·G2가 원문 미확인([보도]/[추정]) → 원문으로 확인해 표기를 고친다 |
| YouTube 서비스 약관 원문, YouTube API 개발자 정책과 Data API 할당량 | STORE_RELEASE Y1·Y2, §5 |
| Musi, Demus 구현 방식 | 조사에서 "확인 못 함". 근거가 있으면 추가 |

---

## E-08 기기 결과가 있어야 정할 수 있는 결정

| 결정 | 판단 근거 | 선택지 | 기록할 곳 |
|---|---|---|---|
| 백그라운드 큐 다음 곡 미리 넘기기(pre-advance) | E-02/E-03의 P9 | 실패하면 끝나기 3–4초 전에 다음 곡 로드 + 재시도(FixYTBackground 방식) 구현. 성공하면 현행 유지 | DECISIONS D-10 |
| "계속 시청하시겠습니까?" 대화상자 자동 확인 | 장시간(2–3시간) 재생 테스트 | Premium 사용자에게도 뜨는 비활성 확인이다. 자동 확인을 할지는 별도로 판단 | DECISIONS D-03 열린 질문 |
| iOS Now Playing을 앱이 직접 채울지 | §1-11 충돌 여부 | `nativeNowPlaying` 기본값 true/false | DECISIONS 새 항목 |
| iOS PiP 버튼 | §1-12 | `evaluateJavaScript`가 사용자 제스처로 인정되는지. 안 되면 PiP는 페이지 안 버튼으로만 | FEATURE/ARCHITECTURE |

---

## E-09 iOS 앱 아이콘, 실제 스크린샷

- iOS에는 `Assets.xcassets/AppIcon`이 없다(빌드 경고). 1024×1024 PNG를 만들어 추가하고 `project.yml`에 반영한다. Android 아이콘(`ic_launcher_foreground.xml`)과 같은 디자인으로 한다.
- 실제 기기 스크린샷(상단 바, 스낵바, 보관함 오버레이)을 `DOCS/images/`에 넣고 [FEATURE_PLAYLIST.md](FEATURE_PLAYLIST.md)의 테스트 스크린샷을 교체한다.

---

## 결과 기록 방법

1. 이 문서 §0 표의 "상태" 칸: `✅ 2026-xx-xx 메모` 또는 `❌ 2026-xx-xx 원인`
2. [LOG.md](LOG.md)에 새 항목: 환경(기기, OS 버전, 계정 종류), 실행 명령, 결과, 수정한 내용
3. [TEST_PLAN.md](TEST_PLAN.md) 체크박스
4. 결정이 생기면 [DECISIONS.md](DECISIONS.md), 상태가 바뀌면 [OVERVIEW.md](OVERVIEW.md)
5. 스크립트 로그(`scripts/out/`)와 `live-report.json`은 커밋하지 않는다. 필요한 내용은 LOG에 요약한다.
