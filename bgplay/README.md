# BgPlay — 백그라운드 재생 + 빠른 저장 YouTube / YouTube Music 플레이어 (Android · iOS)

Brave 브라우저의 "백그라운드 동영상 재생" 구현과 비슷한 앱들(YTPro, NouTube 등)을 분석해서, 같은 구조를 **브라우저 포크 없이 앱으로** 만든 프로젝트입니다.

- **Android**: 시스템 WebView(Chromium)를 씁니다.
- **iOS**: WKWebView(WebKit)를 씁니다. iOS는 Chromium 엔진을 쓸 수 없습니다.
- 재생 중인 곡을 **상단 버튼 한 번으로 임시함에 저장**하고, 나중에 **카테고리·태그로 분류**할 수 있습니다.

> **모든 조사·설계·작업 기록은 [DOCS/](DOCS/README.md)에 있습니다.** 처음이라면 [DOCS/OVERVIEW.md](DOCS/OVERVIEW.md)부터 보세요.
> 이어서 작업하는 AI/개발자는 [DOCS/HANDOFF.md](DOCS/HANDOFF.md)(상태·코드 지도·백로그·점검 목록)를, 스토어 출시를 검토한다면 [DOCS/STORE_RELEASE.md](DOCS/STORE_RELEASE.md)를 보세요.
>
> ⚠️ 2026년 1월부터 YouTube가 비 Premium 계정의 모바일 브라우저 백그라운드 재생을 막고 있습니다. 개인 사이드로드 용도이며, 스토어 배포는 권장하지 않습니다([DOCS/RISKS.md](DOCS/RISKS.md)).

```
bgplay/
├─ AGENTS.md / CLAUDE.md      # AI 작업 규칙: HANDOFF부터 읽기, 작업할 때마다 DOCS에 기록
├─ DOCS/                      # 문서: LOG(작업 로그), OVERVIEW(전체 개요), 주제별 문서
├─ shared/js/bgplay.js        # YouTube 페이지 주입 스크립트 (가시성 위장 · 자동 재개 · 브리지 · MediaSession 폴리필)
├─ shared/web/library/        # 보관함 UI + 데이터 로직 (임시함 · 분류 시트 · 하나씩 분류 · 카테고리)
├─ shared/test/               # Playwright(Chromium) 테스트
├─ android/                   # Kotlin, Gradle (minSdk 26, targetSdk 35)
└─ ios/                       # Swift/UIKit, XcodeGen (iOS 16+)
```

## 사용법 요약

| 버튼 | 동작 |
|---|---|
| **＋ 임시** (상단) | 지금 곡을 바로 임시함에 저장. 스낵바의 [분류]를 누르면 분류 시트가 열림 |
| **＋ 임시** 길게 / **분류** (상단) | 카테고리(여러 개)와 태그를 골라 저장 |
| **보관함 N** (상단) | 임시함(N = 분류 대기 곡 수), 하나씩 분류, 카테고리 재생, 검색 |
| 알림 / 잠금화면 "임시 저장" (Android) | 앱을 열지 않고 저장 |

## 테스트

```bash
node bgplay/shared/test/bgplay.test.mjs      # 주입 스크립트 12개
node bgplay/shared/test/library.test.mjs     # 보관함 18개 (SHOTS=<dir> 지정 시 스크린샷 저장)
node bgplay/shared/test/live-youtube.mjs     # 실제 YouTube 대상 (YouTube 접속 가능한 PC에서, HEADED=1 권장)
bgplay/scripts/check-android.sh [--install]  # Android 빌드·lint·기기 점검
bgplay/scripts/check-ios.sh                  # iOS 프로젝트 생성·시뮬레이터 빌드
```

> 개발 환경의 제약(SDK·Xcode·기기 없음, YouTube 차단) 때문에 마지막 세 개는 아직 실행해 보지 못했습니다. 절차와 판정 기준은 [DOCS/ENV_PENDING.md](DOCS/ENV_PENDING.md)에 있습니다.

## Android 빌드

필요: Android Studio(또는 Android SDK 35 + JDK 17 이상).

```bash
cd bgplay/android
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- 첫 실행 시 알림 권한을 허용하세요. 미디어 알림과 잠금화면 컨트롤에 필요합니다.
- YouTube 앱의 **공유 → BgPlay**로 영상이나 재생목록을 바로 열 수 있습니다.
- 백그라운드 재생 켬/끔과 새로고침은 상단 **⋮** 메뉴에 있습니다.
- 디버깅: 디버그 빌드에서 PC Chrome의 `chrome://inspect`로 WebView 두 개(YouTube, 보관함)를 모두 확인할 수 있습니다.

## iOS 빌드

필요: macOS, Xcode 15 이상, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
brew install xcodegen
cd bgplay/ios
xcodegen generate
open BgPlay.xcodeproj
```

1. *Signing & Capabilities*에서 Team을 지정합니다. 무료 Personal Team이면 7일마다 다시 설치해야 합니다.
2. 실제 기기를 선택하고 실행합니다. 시뮬레이터는 백그라운드 오디오와 잠금화면 동작이 실제 기기와 다릅니다.
3. 상단: ＋ 임시 / 분류 / 보관함. 하단: 뒤로, 앞으로, YouTube, Music, PiP, BG 켬/끔, 새로고침.
4. 단축어 등에서 열기: `bgplay://open?url=https%3A%2F%2Fyoutu.be%2F<id>`

## 검증 상태

- ✅ `bgplay.js` 12/12, 보관함 18/18 (Chromium)
- ✅ Android Kotlin 소스: Android 15 프레임워크 API로 컴파일 확인(androidx.webkit은 시그니처 스텁). 아직 실제 Gradle/AGP 빌드와 실기기 실행은 하지 않았습니다.
- ⏳ iOS: 이 환경에 Xcode가 없어 빌드하지 않았습니다.
- ⏳ 실기기 시나리오: [DOCS/TEST_PLAN.md](DOCS/TEST_PLAN.md)
