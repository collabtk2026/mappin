# 아키텍처

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)

## 1. 아키텍처

```
┌──────────────────────── 앱 프로세스 ────────────────────────┐
│                                                              │
│  UI(Activity / ViewController) ── 붙였다 뗐다 ──┐            │
│                                                  ▼            │
│  ┌──────── WebView (Android: Chromium / iOS: WebKit) ──────┐ │
│  │  m.youtube.com · music.youtube.com                       │ │
│  │  ┌─ bgplay.js (document-start 주입) ─────────────────┐  │ │
│  │  │ ① visibility 위장   ② 엔진 정지 자동 재개          │  │ │
│  │  │ ③ 상태 보고 ─────────────┐   ◀── 명령 실행         │  │ │
│  │  └──────────────────────────┼──────────▲─────────────┘  │ │
│  └─────────────────────────────┼──────────┼────────────────┘ │
│        BgPlayNative / webkit.messageHandlers  evaluateJavascript │
│                                ▼          │                  │
│  PlayerController / PlayerViewController ─┘                  │
│        │                                                     │
│        ▼                                                     │
│  Android: PlaybackService (FGS mediaPlayback + MediaSession  │
│           + 알림 + WakeLock/WifiLock + 이어폰 분리 감지)     │
│  iOS:     AudioSessionManager (.playback, 인터럽션, 경로)    │
│           NowPlayingController (잠금화면, MPRemoteCommand)   │
│                                                              │
│  ┌──── 보관함 오버레이 WebView (투명, 닫히면 숨김) ─────────┐ │
│  │  shared/web/library: core.js(데이터) + ui.js(화면)       │ │
│  │  임시함 · 분류 시트 · 하나씩 분류 · 카테고리 · 전체      │ │
│  └───────▲───────────────────────────────┬──────────────────┘ │
│   __bglib.quickSave/openSave/…    persist/stats/play/playQueue │
│          │                               ▼                    │
│  상단 바(＋ 임시 / 분류 / 보관함 N) ── LibraryStore(JSON 파일) │
│  재생 큐: 네이티브가 ended 를 보고 다음 곡 로드                │
└──────────────────────────────────────────────────────────────┘
```

### 공용 스크립트 `shared/js/bgplay.js`

| 기능 | 내용 |
|---|---|
| 가시성 위장 | `Document.prototype`의 `visibilityState`, `hidden`, `webkit*` getter를 바꾼다. `document`와 `window`의 `visibilitychange` 리스너 등록과 `onvisibilitychange`를 무시한다. |
| 엔진 정지 자동 재개 | Brave iOS 로직. **가시성 전환 전후 2초 안**의 엔진 주도 정지만 재개한다. 그래서 통화처럼 나중에 오는 정지는 재개하지 않는다. 10초에 3회를 넘으면 포기하고(루프 방지), 네이티브가 `holdAutoResume`으로 막을 수 있다. |
| 상태 보고 | 미디어 이벤트를 document 캡처 단계에서 수집해 재생 여부, 위치, 길이, 메타데이터(`navigator.mediaSession.metadata` 우선, 가장 큰 아트워크)를 보낸다. 위치 보정은 5초마다 한다. |
| 명령 | `play`, `pause`, `toggle`, `next`, `prev`, `seekto`, `seekby`, `pip`, `holdAutoResume`. `next`와 `prev`는 **사이트가 등록한 Media Session 핸들러를 가로채 그대로 호출**한다(DOM 셀렉터는 폴백). |
| Media Session 폴리필 | `navigator.mediaSession`이 없으면(Android WebView) 최소 구현을 넣어 YouTube가 등록하는 메타데이터와 핸들러를 받는다([DECISIONS D-05](DECISIONS.md)). |
| 범위 | Android는 `addDocumentStartJavaScript`의 origin 규칙으로, iOS는 `allowedHostSuffixes`로 `youtube.com`에만 적용한다. 브리지는 최상위 프레임에서만 동작한다. |

### 공용 보관함 모듈 `shared/web/library/`

빠른 저장 → 나중에 분류 기능의 UI와 데이터 로직이다. 자세한 내용은 [FEATURE_PLAYLIST.md](FEATURE_PLAYLIST.md)에 있다.

| 파일 | 역할 |
|---|---|
| `core.js` | 데이터 모델과 순수 함수: URL→영상 ID, 임시 저장(중복 판정), 분류(추가/이동), 태그, 카테고리 CRUD, MRU, 임시함 계산, 큐/셔플, 내보내기와 가져오기, 깨진 데이터 복구. Node에서 단위 테스트한다. |
| `ui.js` | 화면과 상태: 분류 시트, 임시함(빠른 이동 칩), 하나씩 분류, 카테고리 상세, 전체 검색과 태그 필터, 다중 선택, 토스트와 되돌리기, 네이티브 브리지(`window.__bglib`). |
| `style.css`, `index.html` | 모바일 다크 테마, `env(safe-area-inset-*)` |

## 2. 플랫폼별 구현 상세

### Android (`bgplay/android`, Kotlin, minSdk 26 / targetSdk 35, 의존성은 `androidx.webkit` 하나)

| 파일 | 역할 |
|---|---|
| `PlayerController.kt` | WebView 1개를 **프로세스 싱글턴**으로 소유한다(`MutableContextWrapper`로 Activity를 바꿔 끼움). document-start 주입, origin 제한 메시지 채널(`addWebMessageListener`), 렌더러 크래시 시 재생성을 맡는다. 재생이 시작되면 서비스를 시작한다. |
| `BackgroundWebView.kt` | `onWindowVisibilityChanged`에서 보이지 않음 신호를 VISIBLE로 바꾼다(② 층). |
| `PlaybackService.kt` | `foregroundServiceType="mediaPlayback"` 서비스. `MediaSession`(잠금화면, 블루투스, 이어폰 버튼), `MediaStyle` 알림, WakeLock/WifiLock, `ACTION_AUDIO_BECOMING_NOISY`(이어폰 분리 시 정지)를 처리한다. 30분 동안 멈춰 있으면 종료한다. |
| `MainActivity.kt` | 상단 바(YouTube / Music / **＋ 임시** / **분류** / **보관함 N** / ⋮ 메뉴[새로고침, 백그라운드 재생]), 스낵바, 전체화면 동영상, edge-to-edge 인셋. 뒤로 가기 순서: 전체화면 → 보관함 → 웹 뒤로 → 재생 중이면 `moveTaskToBack`. 공유와 링크 열기도 받는다. |
| `LibraryController.kt` | 보관함 오버레이 WebView. `WebViewAssetLoader`(`https://appassets.androidplatform.net/assets/library/`), origin 제한 `BgLibNative`, boot 시 대기 중인 저장을 반영한다. |
| `LibraryStore.kt` | `library.json`(AtomicFile, 단일 스레드 기록), `library_pending.json`(보관함이 없을 때 알림에서 저장한 곡). |
| `PlayerController.kt` (추가분) | `currentTrack()`, 재생 큐(`playQueue`, `skipNext`/`skipPrev`, `advanceQueue`), `quickSaveFromBackground()`. |
| `PlaybackService.kt` (추가분) | 알림 액션과 MediaSession custom action "임시 저장". 다음/이전은 큐를 우선한다. |

- BG를 끄면 일반 브라우저처럼 동작한다. `onStop`에서 정지하고 `webView.onPause()`를 부른 뒤 서비스를 종료한다.
- Android 12 이상은 백그라운드 상태에서 포그라운드 서비스를 시작할 수 없다. 그래서 앱이 보일 때 재생이 시작되는 순간 서비스를 띄우고, 정지 중에도 유지한다(유휴 30분 후 종료).

### iOS (`bgplay/ios`, Swift/UIKit, iOS 16+, XcodeGen)

| 파일 | 역할 |
|---|---|
| `PlayerViewController.swift` | WKWebView를 설정한다(`allowsInlineMediaPlayback`, 자동재생 허용, PiP, AirPlay). `.page` 월드에 document-start 사용자 스크립트를 넣고, 메시지 핸들러는 메인 프레임이면서 출처가 YouTube인지 검증한다. 내비게이션 정책, WebContent 프로세스 종료 복구도 여기서 한다. |
| `AudioSessionManager.swift` | 카테고리 `.playback`/`.moviePlayback`은 시작할 때 설정하고, 활성화는 첫 재생 때 한다. 인터럽션이 시작되면 `holdAutoResume`, 끝나고 `shouldResume`이면 재생한다. 이어폰이 분리되면 정지한다. |
| `NowPlayingController.swift` | `MPNowPlayingInfoCenter`, `MPRemoteCommandCenter`(재생, 정지, 다음, 이전, 탐색). |
| `Info.plist` | `UIBackgroundModes: [audio]`, URL 스킴 `bgplay://open?url=…`(단축어 등에서 사용). |
| `LibraryOverlay.swift` | 보관함 오버레이 WKWebView(번들 `library/index.html`, `file:` 출처만 허용). |
| `LibraryStore.swift`, `SnackBar.swift` | JSON 원자 저장, 스낵바. |
| `PlayerViewController.swift` (추가분) | 상단 바(＋ 임시[길게 누르면 분류] / 분류 / 보관함 N), `currentTrack()`, 재생 큐, 잠금화면 다음/이전 → 큐, 내보내기(공유 시트). |
