# Brave 분석과 플랫폼 연구

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)

작성일: 2026-11-03 · 분석 대상: `brave/brave-core` master `69f4ffb` (2026-11-03)

## 1. 왜 앱이 백그라운드로 가면 음악이 멈추나: 세 개의 층

| 층 | 무엇이 멈추게 하나 | 대응 |
|---|---|---|
| **① 페이지(JS)** | YouTube 플레이어가 `document.visibilityState`/`visibilitychange`로 숨겨짐을 감지하고 직접 `video.pause()`를 호출한다. 2026년부터는 계정 권한 확인도 더해졌다. | 가시성 위장(Brave 방식) |
| **② 엔진** | Chromium/WebKit이 숨겨진 페이지의 미디어를 최적화·정지한다. iOS WebKit은 백그라운드 진입 시 비디오 요소를 직접 멈춘다. | Android는 WebView에 "보이는 중" 신호 유지. iOS는 엔진이 멈춘 직후 자동 재개(Brave iOS 로직) |
| **③ OS** | Android는 백그라운드 프로세스를 얼리거나 종료한다. iOS는 오디오 세션이 없으면 앱을 일시 중단한다. | Android: `mediaPlayback` 포그라운드 서비스, WakeLock. iOS: `UIBackgroundModes=audio`, `.playback` 세션 |

세 층이 **모두** 뚫려야 백그라운드 재생이 된다. Brave는 브라우저라서 ②와 ③을 Chromium 기본 기능으로 해결하고, ①만 YouTube 전용으로 처리한다.

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
- 같은 파일에 PiP용 스크립트(`kYoutubePictureInPictureSupport`)도 있다. `ytcfg`의 실험 플래그 `html5_picture_in_picture_blocking_*`를 `false`로 바꿔 YouTube의 PiP 차단을 푸는 방식이다. 이 프로젝트에는 **넣지 않았다**([RISKS.md](RISKS.md) 참고).
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

## 3. 2026년 YouTube 정책 변화 (중요)

- 2026년 1월 말부터 Brave, Vivaldi, Edge, Samsung Internet 등 서드파티 모바일 브라우저에서 비 Premium 계정의 백그라운드 재생이 **수 초 내에 끊긴다**는 보고가 이어졌다.
- Google은 이를 의도된 변경이라고 확인했다. 백그라운드 재생은 Premium 전용 기능이고, "일부 비 Premium 사용자가 모바일 브라우저에서 이용할 수 있던" 경로를 정리했다는 입장이다.
- 차단은 서버 측의 계정 권한 확인과 연결된 것으로 보도됐다. 브라우저가 바꿀 수 없는 영역이다. Brave에서는 업데이트 후 "간헐적으로 된다"는 보고가 있다. Brave master에는 지금도 2.1절의 스크립트가 그대로 있다.

**이 프로젝트에 미치는 영향**

1. JS 위장 레이어는 **비 Premium 계정에서는 언제든 무력화될 수 있다**(YouTube가 JS로 `pause()`를 부르면 `bgplay.js`는 사용자 정지로 보고 재개하지 않는다. 이것은 의도된 동작이다).
2. **Premium 계정이라도** 일반 WebView 앱은 OS가 프로세스를 멈춘다(③ 층). 따라서 이 앱의 서비스와 오디오 세션 레이어는 Premium 사용자의 백그라운드 재생을 위해서도 필요하다.
3. 다만 **Google 로그인이 WebView에서 막힐 수 있다**("안전하지 않은 브라우저" 정책). 실제 기기에서 확인해야 할 1순위 항목이다([TEST_PLAN.md](TEST_PLAN.md)).
4. **하지 않은 것**: 보도된 우회책(User-Agent를 다른 클라이언트로 위장해 권한 확인을 피하는 방식, 스트림 URL 추출)은 YouTube가 명시적으로 막은 Premium 권한 확인을 피해 가는 것이다. 그래서 구현하지 않았다.

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
