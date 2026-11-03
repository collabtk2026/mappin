# YouTube 백그라운드 재생 앱 연구 보고서 (Android / iOS)

작성일: 2026-11-03 · 분석 대상: `brave/brave-core` master `69f4ffb` (2026-11-03)

---

## 0. 요약

- **Brave도 특별한 비밀 기술은 없다.** 핵심은 YouTube 페이지에 **JS를 주입해 Page Visibility API를 속이는 것**이다. 페이지는 항상 "보이는 중"이라고 생각하고 스스로 멈추지 않는다. 여기에 OS 차원의 장치(Android는 미디어 알림과 포그라운드 서비스, iOS는 오디오 백그라운드 모드)를 더한다.
- 그래서 **브라우저를 포크하지 않고도** 앱으로 같은 구조를 만들 수 있다.
  - **Android**: 시스템 WebView 자체가 Chromium이다. 여기에 JS 주입, WebView 창 가시성 신호 차단, `mediaPlayback` 포그라운드 서비스와 MediaSession을 붙인다.
  - **iOS**: 모든 앱이 WebKit을 써야 하므로 **Chromium은 쓸 수 없다**(Brave iOS도 WKWebView). 대신 WKWebView에 JS를 주입하고 `UIBackgroundModes=audio`, `AVAudioSession(.playback)`, `MPRemoteCommandCenter`를 쓴다.
- ⚠️ **2026년 1월 말부터 YouTube가 비 Premium 계정의 모바일 브라우저 백그라운드 재생을 서버 쪽에서 막고 있다**(Google 공식 확인). Brave는 "간헐적으로 된다" 수준이다. 따라서 JS 위장 레이어의 효과는 **보장할 수 없다.** 반면 OS 레이어(서비스, 오디오 세션)는 **Premium 계정이라도 WebView 앱이면 반드시 필요**하다. 이 부분이 이 프로젝트에서 안정적으로 가치를 갖는 부분이다.
- 결과물: `bgplay/shared/js/bgplay.js`(공용 주입 스크립트, 테스트 11개 통과), `bgplay/android`(Kotlin), `bgplay/ios`(Swift, XcodeGen).

---

## 1. 왜 앱이 백그라운드로 가면 음악이 멈추나: 세 개의 층

| 층 | 무엇이 멈추게 하나 | 대응 |
|---|---|---|
| **① 페이지(JS)** | YouTube 플레이어가 `document.visibilityState`/`visibilitychange`로 숨겨짐을 감지하고 직접 `video.pause()`를 호출한다. 2026년부터는 계정 권한 확인도 더해졌다. | 가시성 위장(Brave 방식) |
| **② 엔진** | Chromium/WebKit이 숨겨진 페이지의 미디어를 최적화·정지한다. iOS WebKit은 백그라운드 진입 시 비디오 요소를 직접 멈춘다. | Android는 WebView에 "보이는 중" 신호 유지. iOS는 엔진이 멈춘 직후 자동 재개(Brave iOS 로직) |
| **③ OS** | Android는 백그라운드 프로세스를 얼리거나 종료한다. iOS는 오디오 세션이 없으면 앱을 일시 중단한다. | Android: `mediaPlayback` 포그라운드 서비스, WakeLock. iOS: `UIBackgroundModes=audio`, `.playback` 세션 |

세 층이 **모두** 뚫려야 백그라운드 재생이 된다. Brave는 브라우저라서 ②와 ③을 Chromium 기본 기능으로 해결하고, ①만 YouTube 전용으로 처리한다.

---

## 2. Brave 구현 분석 (소스 기준)

### 2.1 Brave Android: `browser/android/youtube_script_injector/`

- `youtube_script_injector_tab_helper.cc`의 `PrimaryMainDocumentElementAvailable()`가 메인 프레임의 문서 요소가 생기는 시점에 동작한다. YouTube 도메인(`SameDomainOrHost(url, "www.youtube.com")`)이고 설정 `kBackgroundVideoPlaybackEnabled`가 켜져 있으면 다음 스크립트를 `ExecuteJavaScript`로 주입한다.

```js
// brave-core: kYoutubeBackgroundPlayback (원문 요약)
if (document._addEventListener === undefined) {
  document._addEventListener = document.addEventListener;
  document.addEventListener = function (a, b, c) {
    if (a != 'visibilitychange') document._addEventListener(a, b, c);   // 리스너 등록 차단
  };
}
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
```

- 기능 플래그는 `features.cc`의 `kBraveBackgroundVideoPlayback`이며 기본값은 ENABLED다. 사용자 설정 위치는 *설정 → 사이트 설정 → 미디어 → 백그라운드 동영상 재생*이다.
- 같은 파일에 PiP용 스크립트(`kYoutubePictureInPictureSupport`)도 있다. `ytcfg`의 실험 플래그 `html5_picture_in_picture_blocking_*`를 `false`로 바꿔 YouTube의 PiP 차단을 푸는 방식이다. 이 프로젝트에는 **넣지 않았다**(4장 참고).
- ②와 ③ 층은 Brave 전용 코드가 아니다. Chromium(Chrome Android)의 미디어 알림과 재생용 포그라운드 서비스를 그대로 쓴다. 이번 분석에서 Brave의 `chromium_src`에 미디어 suspend 관련 패치는 발견되지 않았다.

### 2.2 Brave iOS: `ios/browser/web/media/`

- `media_backgrounding_javascript_feature.mm`가 **모든 프레임**에 **document-start**, **page content world**로 스크립트를 주입한다. 설정 `kMediaBackgroundingEnabled`는 플레이스홀더로 치환된다.
- `resources/media_backgrounding.ts`(구 `MediaBackgroundingScript.js`)의 로직은 다음과 같다.
  1. `Document.prototype.visibilityState` getter가 항상 `'visible'`을 돌려주게 바꾼다. 원래 getter는 내부용으로 보관한다.
  2. `HTMLVideoElement.prototype.pause/play`를 감싸서 JS가 호출한 정지에 `userHitPause` 표시를 남긴다.
  3. `pause` 이벤트가 왔을 때 `userHitPause`가 없으면 **엔진(WebKit)이 멈춘 것**으로 본다.
     - 아직 보이는 상태라면 2초 안에 실제 visibility가 hidden으로 바뀔 때 `play()`로 재개한다.
     - 이미 바뀌었다면 즉시 재개한다.
  4. `webkitpresentationmodechanged` 이벤트의 전파를 막아 PiP 전환을 사이트가 감지하지 못하게 한다.
- 이와 별도로 iOS에는 **Playlist** 기능이 있다(`ios/brave-ios/Sources/Playlist`). 미디어 소스를 뽑아 네이티브 AVPlayer로 재생하는 방식이다. 이 프로젝트는 **채택하지 않았다**(스트림 추출은 약관 위반 정도가 더 크고, 자주 깨진다).

### 2.3 시사점

| | Brave | 이 앱 |
|---|---|---|
| ① 페이지 | 위 JS 주입 | Android 방식과 iOS 방식을 합친 `bgplay.js`(양 플랫폼 공용) |
| ② 엔진 | 브라우저가 직접 제어 | Android: `BackgroundWebView.onWindowVisibilityChanged` 오버라이드. iOS: JS 자동 재개 |
| ③ OS | Chromium 미디어 알림 / iOS 오디오 세션 | 직접 구현(`PlaybackService` / `AudioSessionManager`) |

---

## 3. 2026년 YouTube 정책 변화 (중요)

- 2026년 1월 말부터 Brave, Vivaldi, Edge, Samsung Internet 등 서드파티 모바일 브라우저에서 비 Premium 계정의 백그라운드 재생이 **수 초 내에 끊긴다**는 보고가 이어졌다.
- Google은 이를 의도된 변경이라고 확인했다. 백그라운드 재생은 Premium 전용 기능이고, "일부 비 Premium 사용자가 모바일 브라우저에서 이용할 수 있던" 경로를 정리했다는 입장이다.
- 차단은 서버 측의 계정 권한 확인과 연결된 것으로 보도됐다. 브라우저가 바꿀 수 없는 영역이다. Brave에서는 업데이트 후 "간헐적으로 된다"는 보고가 있다. Brave master에는 지금도 2.1절의 스크립트가 그대로 있다.

**이 프로젝트에 미치는 영향**

1. JS 위장 레이어는 **비 Premium 계정에서는 언제든 무력화될 수 있다**(YouTube가 JS로 `pause()`를 부르면 `bgplay.js`는 사용자 정지로 보고 재개하지 않는다. 이것은 의도된 동작이다).
2. **Premium 계정이라도** 일반 WebView 앱은 OS가 프로세스를 멈춘다(③ 층). 따라서 이 앱의 서비스와 오디오 세션 레이어는 Premium 사용자의 백그라운드 재생을 위해서도 필요하다.
3. 다만 **Google 로그인이 WebView에서 막힐 수 있다**("안전하지 않은 브라우저" 정책). 실제 기기에서 확인해야 할 1순위 항목이다(7장).
4. **하지 않은 것**: 보도된 우회책(User-Agent를 다른 클라이언트로 위장해 권한 확인을 피하는 방식, 스트림 URL 추출)은 YouTube가 명시적으로 막은 Premium 권한 확인을 피해 가는 것이다. 그래서 구현하지 않았다.

---

## 4. 플랫폼 제약과 엔진 선택

### Android: "Chromium으로" 하는 세 가지 방법

| 방법 | 내용 | 장점 | 단점 | 판단 |
|---|---|---|---|---|
| **A. 시스템 WebView** | Android System WebView(=Chromium)에 앱 코드를 붙인다 | 빌드가 가볍고 APK가 수 MB. 엔진은 Play 스토어가 자동 업데이트 | 엔진 내부 수정 불가 | ✅ **채택** |
| B. Chromium 포크(Brave식) | Chromium 소스에 패치 | 엔진 레벨 제어 | 체크아웃 100GB 이상, 빌드 수 시간, 보안 패치를 직접 따라가야 함 | ❌ 개인 프로젝트에 과함 |
| C. Custom Tabs / TWA | 사용자의 Chrome으로 띄운다 | 매우 간단 | JS 주입 불가 → 불가능 | ❌ |

A안에서 엔진(②) 문제는 `onWindowVisibilityChanged`를 오버라이드해 해결한다. WebView가 창이 숨겨졌다는 신호를 받지 못하게 하면 Chromium 렌더러는 계속 포그라운드로 동작한다. 또 `setRendererPriorityPolicy(IMPORTANT, false)`로 앱이 안 보일 때도 렌더러 프로세스 우선순위를 유지한다.

### iOS: Chromium은 불가

- App Store 심사 지침 2.5.6에 따라 웹을 탐색하는 앱은 WebKit을 써야 한다. Chrome iOS와 Brave iOS도 WKWebView다.
- EU에서만 iOS 17.4+ BrowserEngineKit으로 대체 엔진을 쓸 수 있다. 하지만 EU 배포, 별도 entitlement, 기본 브라우저 앱 요건이 필요해 이 용도에는 맞지 않는다.
- → **WKWebView + Brave iOS 방식**으로 간다. 추가 선택지로 **PiP**(iOS가 공식 지원하는 백그라운드 영상 경로)를 툴바 버튼으로 넣었다.

---

## 5. 아키텍처

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
└──────────────────────────────────────────────────────────────┘
```

### 공용 스크립트 `shared/js/bgplay.js`

| 기능 | 내용 |
|---|---|
| 가시성 위장 | `Document.prototype`의 `visibilityState`, `hidden`, `webkit*` getter를 바꾼다. `document`와 `window`의 `visibilitychange` 리스너 등록과 `onvisibilitychange`를 무시한다. |
| 엔진 정지 자동 재개 | Brave iOS 로직. **가시성 전환 전후 2초 안**의 엔진 주도 정지만 재개한다. 그래서 통화처럼 나중에 오는 정지는 재개하지 않는다. 10초에 3회를 넘으면 포기하고(루프 방지), 네이티브가 `holdAutoResume`으로 막을 수 있다. |
| 상태 보고 | 미디어 이벤트를 document 캡처 단계에서 수집해 재생 여부, 위치, 길이, 메타데이터(`navigator.mediaSession.metadata` 우선, 가장 큰 아트워크)를 보낸다. 위치 보정은 5초마다 한다. |
| 명령 | `play`, `pause`, `toggle`, `next`, `prev`, `seekto`, `seekby`, `pip`, `holdAutoResume`. `next`와 `prev`는 **사이트가 등록한 Media Session 핸들러를 가로채 그대로 호출**한다(DOM 셀렉터는 폴백). |
| 범위 | Android는 `addDocumentStartJavaScript`의 origin 규칙으로, iOS는 `allowedHostSuffixes`로 `youtube.com`에만 적용한다. 브리지는 최상위 프레임에서만 동작한다. |

---

## 6. 플랫폼별 구현 상세

### Android (`bgplay/android`, Kotlin, minSdk 26 / targetSdk 35, 의존성은 `androidx.webkit` 하나)

| 파일 | 역할 |
|---|---|
| `PlayerController.kt` | WebView 1개를 **프로세스 싱글턴**으로 소유한다(`MutableContextWrapper`로 Activity를 바꿔 끼움). document-start 주입, origin 제한 메시지 채널(`addWebMessageListener`), 렌더러 크래시 시 재생성을 맡는다. 재생이 시작되면 서비스를 시작한다. |
| `BackgroundWebView.kt` | `onWindowVisibilityChanged`에서 보이지 않음 신호를 VISIBLE로 바꾼다(② 층). |
| `PlaybackService.kt` | `foregroundServiceType="mediaPlayback"` 서비스. `MediaSession`(잠금화면, 블루투스, 이어폰 버튼), `MediaStyle` 알림, WakeLock/WifiLock, `ACTION_AUDIO_BECOMING_NOISY`(이어폰 분리 시 정지)를 처리한다. 30분 동안 멈춰 있으면 종료한다. |
| `MainActivity.kt` | 상단 바(YouTube / Music / 새로고침 / BG 토글), 전체화면 동영상, edge-to-edge 인셋을 처리한다. 재생 중 뒤로 가기는 `moveTaskToBack`. 공유와 링크 열기도 받는다. |

- BG를 끄면 일반 브라우저처럼 동작한다. `onStop`에서 정지하고 `webView.onPause()`를 부른 뒤 서비스를 종료한다.
- Android 12 이상은 백그라운드 상태에서 포그라운드 서비스를 시작할 수 없다. 그래서 앱이 보일 때 재생이 시작되는 순간 서비스를 띄우고, 정지 중에도 유지한다(유휴 30분 후 종료).

### iOS (`bgplay/ios`, Swift/UIKit, iOS 16+, XcodeGen)

| 파일 | 역할 |
|---|---|
| `PlayerViewController.swift` | WKWebView를 설정한다(`allowsInlineMediaPlayback`, 자동재생 허용, PiP, AirPlay). `.page` 월드에 document-start 사용자 스크립트를 넣고, 메시지 핸들러는 메인 프레임이면서 출처가 YouTube인지 검증한다. 내비게이션 정책, WebContent 프로세스 종료 복구도 여기서 한다. |
| `AudioSessionManager.swift` | 카테고리 `.playback`/`.moviePlayback`은 시작할 때 설정하고, 활성화는 첫 재생 때 한다. 인터럽션이 시작되면 `holdAutoResume`, 끝나고 `shouldResume`이면 재생한다. 이어폰이 분리되면 정지한다. |
| `NowPlayingController.swift` | `MPNowPlayingInfoCenter`, `MPRemoteCommandCenter`(재생, 정지, 다음, 이전, 탐색). |
| `Info.plist` | `UIBackgroundModes: [audio]`, URL 스킴 `bgplay://open?url=…`(단축어 등에서 사용). |

---

## 7. 실기기 검증 계획 (아직 안 한 것)

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

---

## 8. 배포와 정책 리스크

- **YouTube 약관**: 백그라운드 재생은 Premium 기능이다. 약관은 서비스의 기능 제한을 우회하거나 수정하는 것을 금지한다. 비 Premium 계정에서 위장 레이어를 쓰는 것은 약관과 충돌한다.
- **Google Play**: 제3자 서비스 약관 위반을 돕는 앱은 정책 위반이다. 실제로 YouTube 백그라운드 재생 앱이 다수 삭제됐다. → **스토어 배포 비권장, 개인 사이드로드(APK)용**이다.
- **App Store**: 지침 5.2.3(제3자 미디어)과 5.2.2 위반 소지가 있다. → Xcode 개인 서명(무료 계정은 7일마다 재설치)이나 TestFlight 내부 테스트 정도로 쓴다.
- Brave가 버티는 이유는 "범용 브라우저의 기능"이라는 포지셔닝 덕분이다. 스토어 배포를 원하면 Brave처럼 **범용 브라우저**로 만들고 Premium 사용자를 대상으로 해야 정책 리스크가 줄어든다(단, 그래도 보장은 없다).
- 광고 차단, 다운로드, 스트림 추출은 넣지 않았다.

---

## 9. 다음 단계 제안

1. 7장 시나리오를 실제 기기에서 확인한다(특히 4번 로그인, 1–2번 2026년 차단 여부).
2. 결과에 따라 갈래가 나뉜다.
   - 로그인이 되고 Premium에서 안정적이면 → 이 구조를 유지하고 UI를 다듬는다(재생 큐, 미니 플레이어).
   - 로그인이 막히면 → 범용 브라우저 UX로 전환을 검토한다. 우회 대신 Google 정책 안에서 가능한 방법을 조사한다.
3. Android PiP(`enterPictureInPictureMode`)를 추가한다(Brave Android에도 있는 기능).
4. 이 디렉터리를 독립 저장소로 분리한다(현재는 mappin 저장소 안의 독립 하위 프로젝트).

---

## 출처

- Brave 소스 (master `69f4ffb`)
  - [youtube_script_injector_tab_helper.cc](https://github.com/brave/brave-core/blob/master/browser/android/youtube_script_injector/youtube_script_injector_tab_helper.cc)
  - [youtube_script_injector/features.cc](https://github.com/brave/brave-core/blob/master/browser/android/youtube_script_injector/features.cc)
  - [ios/browser/web/media/resources/media_backgrounding.ts](https://github.com/brave/brave-core/blob/master/ios/browser/web/media/resources/media_backgrounding.ts)
  - [media_backgrounding_javascript_feature.mm](https://github.com/brave/brave-core/blob/master/ios/browser/web/media/media_backgrounding_javascript_feature.mm)
  - [MediaBackgroundingScript.js (구 brave-ios)](https://github.com/brave/brave-core/blob/master/ios/brave-ios/Sources/Brave/Frontend/UserContent/UserScripts/Scripts_Dynamic/Scripts/Paged/MediaBackgroundingScript.js)
- 2026년 YouTube 정책 변화 보도
  - [9to5Google — YouTube is killing free background play workarounds in third-party browsers](https://9to5google.com/2026/02/02/youtube-background-playback-workarounds-not-working-third-party-browsers/)
  - [Android Authority — YouTube may be blocking background play on third-party browsers (Google confirms)](https://www.androidauthority.com/youtube-background-play-broken-3636179/)
  - [Android Central — Google confirms it's closing free YouTube background playback loophole](https://www.androidcentral.com/apps-software/youtube/google-confirms-its-closing-free-youtube-background-playback-loophole)
  - [Thurrott — YouTube Blocks Background Play on Mobile Web Browsers, But Brave is Resisting](https://www.thurrott.com/cloud/332298/youtube-blocks-background-play-on-mobile-web-browsers-but-brave-is-resisting)
  - [Digital Music News — YouTube Blocks Background Play for Non-Premium Subscribers](https://www.digitalmusicnews.com/2026/01/30/youtube-blocks-background-play/)
  - [Brave Community — Playing media in the background](https://community.brave.com/t/playing-media-in-the-background/197518/2)
- iOS WKWebView 백그라운드 오디오
  - [Apple Developer Forums — WKwebview not allowing background audio playback](https://developer.apple.com/forums/thread/781787)
  - [Apple Developer Forums — Is UIBackgroundModes audio required for WKWebView…](https://developer.apple.com/forums/thread/713084)
