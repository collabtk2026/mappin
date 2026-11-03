# BgPlay — 백그라운드 재생 YouTube / YouTube Music 플레이어 (Android · iOS)

Brave 브라우저의 "백그라운드 동영상 재생" 구현을 분석해서, 같은 구조를 **브라우저 포크 없이 앱으로** 만든 프로젝트입니다.

- **Android**: 시스템 WebView(Chromium)를 씁니다.
- **iOS**: WKWebView(WebKit)를 씁니다. iOS는 Chromium 엔진을 쓸 수 없습니다.

> 연구 내용, 2026년 YouTube 정책 변화, 리스크, 실기기 테스트 계획은 **[docs/RESEARCH.md](docs/RESEARCH.md)**에 있습니다.
>
> ⚠️ 2026년 1월부터 YouTube가 비 Premium 계정의 모바일 브라우저 백그라운드 재생을 막고 있습니다. 개인 사이드로드 용도이며, 스토어 배포는 권장하지 않습니다.

```
bgplay/
├─ shared/js/bgplay.js        # 양 플랫폼 공용 주입 스크립트 (가시성 위장 · 자동 재개 · 네이티브 브리지)
├─ shared/test/               # Playwright(Chromium) 테스트
├─ android/                   # Kotlin, Gradle (minSdk 26, targetSdk 35)
├─ ios/                       # Swift/UIKit, XcodeGen (iOS 16+)
└─ docs/RESEARCH.md
```

## 공용 스크립트 테스트

```bash
node bgplay/shared/test/bgplay.test.mjs     # Playwright 필요 (require('playwright'))
```

11개 시나리오를 확인합니다: 가시성 위장, 리스너 차단, 엔진 정지 자동 재개(2초 창), 사용자/통화 정지는 재개하지 않음, 메타데이터·명령 브리지, BG를 껐을 때의 대조군.

## Android 빌드

필요: Android Studio(또는 Android SDK 35 + JDK 17 이상).

```bash
cd bgplay/android
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- 첫 실행 시 알림 권한을 허용하세요. 미디어 알림과 잠금화면 컨트롤에 필요합니다.
- YouTube 앱의 **공유 → BgPlay**로 영상이나 재생목록을 바로 열 수 있습니다.
- 상단 **BG 켬/끔**은 Brave의 백그라운드 재생 토글과 같습니다. 끄면 일반 브라우저처럼 멈춥니다.
- 디버깅: 디버그 빌드에서 PC Chrome의 `chrome://inspect`로 WebView를 확인할 수 있습니다.

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
3. 툴바 버튼: 뒤로, 앞으로, YouTube, Music, **PiP**, **BG 켬/끔**, 새로고침.
4. 단축어 등에서 열기: `bgplay://open?url=https%3A%2F%2Fyoutu.be%2F<id>`

## 동작 원리 (요약)

| 층 | Android | iOS |
|---|---|---|
| 페이지(JS) | `bgplay.js`: visibility 위장, 엔진 정지 자동 재개, 상태 보고와 명령 | 같은 파일 |
| 엔진 | `BackgroundWebView.onWindowVisibilityChanged` → 항상 VISIBLE, 렌더러 우선순위 유지 | `allowsInlineMediaPlayback`, 자동재생, PiP |
| OS | `mediaPlayback` 포그라운드 서비스, MediaSession, 알림, WakeLock/WifiLock | `UIBackgroundModes=audio`, `AVAudioSession(.playback)`, `MPRemoteCommandCenter` |

## 검증 상태

- ✅ `bgplay.js`: Chromium에서 테스트 11/11 통과
- ✅ Android Kotlin 소스: Android 15 프레임워크 API로 컴파일 확인(androidx.webkit은 시그니처 스텁 사용). 아직 실제 Gradle/AGP 빌드와 실기기 실행은 하지 않았습니다.
- ⏳ iOS: 이 환경에 Xcode가 없어 빌드하지 않았습니다.
- ⏳ 실기기 시나리오: [docs/RESEARCH.md §7](docs/RESEARCH.md) 체크리스트를 참고하세요.
