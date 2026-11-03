# 사례 조사: YouTube 백그라운드 재생 앱의 구현 방식과 "나중에 분류" 저장 UX

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)
>
> 이 조사를 바탕으로 한 설계와 적용 여부는 [FEATURE_PLAYLIST.md](FEATURE_PLAYLIST.md), [DECISIONS.md](DECISIONS.md)에 정리했다.

작성일: 2026-11-03 · 조사 범위: 오픈소스 코드 직접 확인(각 저장소를 clone해서 읽음) + 공식 문서 + 보도
근거 표기: **[소스 확인]** 코드를 직접 읽음 · **[공식]** 공식 문서/발표 · **[보도]** 뉴스/포럼/검색 요약 · **확인 못 함** 근거 없음

> 접근 실패: developers.google.com, culturedcode.com, mjtsai.com은 이 세션에서 DNS가 차단됨(ENOTFOUND). 해당 출처는 검색 요약만 사용함. 원문을 확인하려면 세션 네트워크 설정에서 이 도메인들을 허용해야 함.

---

## 1. 요약

1. **BgPlay와 같은 구조인 오픈소스 앱이 이미 2개 있음. 둘 다 2026년 10월까지 커밋이 있음.** YTPro(Android 전용)와 **NouTube**(Android+iOS+데스크톱, Expo/React Native)는 m.youtube.com / music.youtube.com을 WebView로 감싸고 백그라운드 재생을 유지함. 특히 NouTube는 차단 이후(2026)의 YouTube 동작을 코드 주석으로 상세히 기록해 두었음. **NouTube의 `content/background-guard.ts`는 BgPlay 설계에 가장 직접 참고할 코드임.** [소스 확인]
2. **Android는 JS 위장만으로 부족함. 네이티브 쪽에서 `WebView.onWindowVisibilityChanged()`를 덮어써 항상 VISIBLE을 넘기는 방식이 공통 패턴임**(YTPro, NouTube). NouTube는 여기에 `setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)`를 더해, 백그라운드에서 렌더러 프로세스가 cached 우선순위로 떨어져 죽는 문제(#309)를 막음. [소스 확인]
3. **Visibility 위장만으로는 2026년 이후 YouTube를 막을 수 없음. "YouTube가 건 pause인지, 사용자가 건 pause인지"를 구분해 YouTube 쪽 pause만 되돌리는 guard가 필요함.** NouTube는 5초마다 polling해 `movie_player.getPlayerState()`를 확인하고, 사용자가 요청하지 않은 pause면 `playVideo()`를 최대 3회 다시 시도함. 이때 "계속 시청하시겠습니까?" 대화상자는 버튼이 1개일 때만 자동으로 누르고, 통화나 다른 앱이 오디오를 가져간 상태(AudioManager)에서는 재개하지 않음. FixYTBackground(2026-02)는 같은 목적을 `HTMLMediaElement.prototype.pause` 가로채기, 무작위 키/포인터 입력, 곡 종료 4초 전 다음 곡 미리 클릭으로 해결함. [소스 확인]
4. **iOS(WKWebView) 쪽 함정**: 앱이 백그라운드로 가는 순간 WebKit이 페이지를 hidden으로 바꿈. 또 잠금화면/이어폰 버튼 입력은 앱이 아니라 **페이지의 Media Session 핸들러로 직접 전달됨.** 그래서 `navigator.mediaSession.setActionHandler`를 document-start에서 감싸야 사용자의 pause를 식별할 수 있음. 이 패치는 WebKit이 `navigator.mediaSession` JS wrapper를 GC하면 함께 사라지므로 참조를 붙잡아 두어야 함(NouTube 주석). [소스 확인]
5. **Android System WebView에는 `navigator.mediaSession`이 없는 것으로 보임.** YTPro는 `if (!('mediaSession' in navigator))`일 때 polyfill을 정의해 YouTube가 넣는 metadata와 action handler를 가로채고, 이를 네이티브 MediaSession과 MediaStyle 알림으로 넘김. NouTube는 플레이어의 `videoDetails`를 직접 읽어 `NouTubeI.notify()`로 보냄. WebView에 API가 없다는 점은 코드에서 추론한 것이고 공식 문서로는 확인 못 함. [소스 확인/추론]
6. **정책 이력상 App Store 배포 위험이 매우 높음.** ProTube는 2017년 YouTube 요청으로 내려감. Musi는 2024년 YouTube 법무팀 불만 접수 후 삭제됐고, 2026-03 법원은 Apple이 "with or without cause" 삭제할 수 있다고 판결함. Vanced는 2022년 Google의 cease-and-desist(로고·YouTube 언급 제거 요구) 후 중단함. th-ch/youtube-music은 **Pear Desktop**으로 이름을 바꾸고 package.json의 이름 문자열까지 유니코드 escape로 숨김. YouTube API 정책은 "background play 허용"을 명시적으로 금지함. NouTube도 iOS는 TestFlight로만 배포 중임. [공식/보도/소스 확인]
7. **네이티브 추출형 클라이언트는 2025–2026년 SABR, PoToken, BotGuard 대응에 시간을 크게 쓰고 있음.** 그 사이 Tubular·OuterTune은 중단을 선언했고 ViMusic은 2023년 이후 정지, 공개 Piped 인스턴스는 사실상 소멸함. 반면 실제 웹사이트를 그대로 띄우는 WebView 방식은 추출과 서명 해독 부담이 없음. 대신 YouTube 페이지의 DOM과 JS가 바뀌는 데 취약함. [소스 확인/보도]
8. **Part B 시사점**: YouTube/YT Music/Spotify 모두 "**원탭 저장 → 저장 위치를 알려주는 스낵바 → '변경' 버튼**"으로 바뀌었음(마지막 사용 목록 기억). 오픈소스 쪽에는 이미 담긴 목록 회색 처리와 중복 대화상자(NewPipe/Metrolist), 5초 undo 토스트(NouTube), 최근 수정순 정렬(Metrolist)이 구현돼 있음. BgPlay의 "임시함" 설계에는 이 패턴들에 GTD/Todoist의 "수집과 정리 분리, 주기적 처리"를 합치는 것을 권장함(4장).

---

## 2. Part A: 앱별 정리

### 2.1 브라우저 계열

| 앱 | 방식 | 현황 |
|---|---|---|
| Brave | (기분석) 페이지 스크립트 주입으로 Visibility 위장 | 2026-01 차단 이후 콘텐츠 필터와 스크립트 갱신으로 복구. iOS 수정판은 2026-02-01 공지. Android 1.87.19x에서 일부 실패 보고와 "YT Music 백그라운드에서 다음 곡으로 안 넘어감" 버그 보고 있음 [보도] |
| Samsung Internet / Vivaldi / Edge | 브라우저 자체 "백그라운드 재생" 옵션 또는 Chromium 동작에 의존 | 2026-01-28경부터 차단 보고가 가장 많음. "화면이 꺼지고 몇 초 뒤 재생 종료" [보도] |
| Kiwi | 확장 지원 Chromium | 2025-01 개발 종료, Play Store에서 내려감. 확장 기능 코드는 Edge Canary(Android)로 이관 [보도] |
| Opera | — | 2026-02 시점 "여전히 동작"한다는 보도가 있음. 지속 여부는 확인 못 함 [보도] |
| Firefox Android + 확장 | 아래 참조 | 확장은 계속 갱신 중 |

**Google 입장** [보도: Android Authority 인용]: "Background playback is a feature intended to be exclusive for YouTube Premium members… we've made changes to YouTube to ensure consistency." 1차 출처(YouTube 공식 게시물)는 확인 못 함.

#### Firefox "Video Background Play Fix" (mozilla/video-bg-play) [소스 확인]
- 파일: `video-bg-play/video-bg-play-content.js`. manifest에서 `all_frames: true`로 youtube.com, vimeo.com에 content script를 주입함.
- Firefox content script는 isolated world에서 실행되므로 `document.wrappedJSObject`(Xray 우회)로 페이지 쪽 document 속성을 덮어씀.

```js
Object.defineProperties(document.wrappedJSObject,
  { 'hidden': {value: false}, 'visibilityState': {value: 'visible'} });
window.addEventListener('visibilitychange', evt => evt.stopImmediatePropagation(), true);
// User activity tracking
if (IS_YOUTUBE) { loop(pressKey, 60 * 1000, 10 * 1000); } // 약 1분마다 Alt(18) keydown/keyup
```
- 핵심은 두 가지임. (1) Visibility API 위장과 이벤트 차단. (2) **약 1분마다 Alt 키 이벤트를 보내 "동영상이 일시중지되었습니다. 계속 시청하시겠습니까?"를 방지**함. 마지막 갱신은 v1.7.0(2023-05)이고, 저장소 push 기록은 2024-11 [보도]. 2026 차단 이후에도 동작하는지는 확인 못 함.

#### Firefox "Backstage Play / Youtube Background Play Fix" (Rigmunssel/FixYTBackground, 2026-02 커밋) [소스 확인]
- 파일: `FixYTBackground/scripts/content.js`. manifest는 `"run_at": "document_start", "world": "MAIN"`. **2026 차단 이후에 만들어진 대응 코드**라서 참고 가치가 큼.
```js
const BLOCKED = new Set(["visibilitychange", "blur", "pagehide", "freeze"]);
Object.defineProperty(Document.prototype, "hidden", { configurable: true, enumerable: true, get: () => false });
EventTarget.prototype.addEventListener = function (type, fn, opt) {
  if (BLOCKED.has(type)) return;            // 리스너 등록 자체를 무시
  return origAddEvent.call(this, type, fn, opt);
};
HTMLMediaElement.prototype.pause = function () {
  if (Date.now() - lastUserAction < USER_ACTION_WINDOW) {   // 2초 내 사용자 입력이 있을 때만 pause 허용
    userPaused = true; return origPause.call(this);
  }
};
```
- 추가 장치는 다음과 같음.
  - `mediaSession.setActionHandler`를 감싸 알림/잠금화면에서 온 pause/play를 사용자 행위로 기록함.
  - 30–60초 간격으로, 실제로 hidden일 때만 Shift/Ctrl/Alt keydown 또는 pointermove를 보냄(keep-alive). 숨겨지는 순간(visibilitychange)에도 3회 연속 ping을 보냄.
  - 3초마다 `v.paused && !userPaused`이면 `play()`를 호출함.
  - **곡 종료 4초 전에 다음 곡을 미리 클릭함(pre-advance)**. `ytm-playlist-panel-video-renderer[aria-selected]`의 다음 형제나 `player-middle-controls-prev-next-button`을 누르고, 7초 안에 videoId가 바뀌지 않으면 최대 3회 재시도함. 주석상 이유는 "background 탭에서 `ended`가 늦게 발생"하기 때문임.
- **BgPlay 시사점**: 백그라운드에서 다음 곡으로 넘어가지 않는 문제(Brave 버그 보고와 같은 증상)에 대비해 pre-advance와 재시도 로직이 필요함.

### 2.2 Android WebView 래퍼

#### YTPro (prateek-chaubey/YTPro, 최신 커밋 2026-10-17, v3.9.2) [소스 확인]
구조: `MainActivity` + `YTProWebView`(WebView 상속) + `ForegroundService`(mediaPlaybackType) + JS(`scripts/script.js`, `bgplay.js`, `innertube.js`).

1. **Visibility: 네이티브에서 차단** (`app/src/main/java/com/google/android/youtube/pro/webview/YTProWebView.java`)
```java
@Override
protected void onWindowVisibilityChanged(int visibility) {
  boolean bgPlay = prefs.getBoolean("bgplay", false);
  if (visibility != View.GONE && visibility != View.INVISIBLE || !bgPlay){
    super.onWindowVisibilityChanged(visibility);   // GONE/INVISIBLE 통지는 삼켜버림
  }
}
```
   JS로 `document.hidden`을 덮어쓰는 코드는 없음(`grep visibility` 결과 0건). Chromium에 "창이 숨겨졌다"는 신호 자체가 가지 않으므로 페이지는 계속 visible로 인식함.
2. **Media Session polyfill** (`scripts/bgplay.js`): WebView에 `navigator.mediaSession`이 없을 때 직접 정의함. YouTube가 `metadata`를 설정하면 setter가 썸네일을 canvas로 160x90 PNG base64로 바꾸고 `Android.bgStart/bgUpdate(icon,title,artist,duration)`를 호출함(JavascriptInterface). `playbackState` setter는 `Android.bgPlay/bgPause/bgStop(currentTime)`을 부르고, `setActionHandler`는 `handlers[action]`에 저장함.
```js
if (!('mediaSession' in navigator)) {
  Object.defineProperty(navigator, 'mediaSession', { value: {}, configurable: true });
  Object.defineProperty(navigator.mediaSession, 'metadata', {
    get() { return _metadata; },
    set(value) { bgPlay(value); _metadata = value; }, configurable: true });
  navigator.mediaSession.setActionHandler = (action, handler) => { handlers[action] = handler; };
```
3. **알림과 컨트롤** (`ForegroundService.java`): `android.media.session.MediaSession`, `Notification.MediaStyle().setMediaSession(token)`, `PlaybackState`를 사용함. 콜백 `onPlay/onPause/onSkipToNext/onSeekTo`는 broadcast를 거쳐 `MediaCommandReceiver`로 가고, 여기서 `web.evaluateJavascript("playVideo();")` 등을 실행함. JS 쪽은 저장해 둔 YouTube 핸들러(`handlers.play()`, `handlers.nexttrack()`, `handlers.seekto({seekTime})`)를 호출함.
4. **pause 차단**: PiP 중에는 `HTMLMediaElement.prototype.pause`를 덮어써 `pauseAllowed`가 false면 pause하지 않고 다시 play함.
5. **스크립트 로딩 방식(주의)**: `YTProWebViewClient.onPageFinished()`에서 `<script src="https://youtube.com/ytpro_cdn/npm/ytpro@latest/bgplay.js">`를 삽입함. `shouldInterceptRequest`가 이 요청을 `cdn.jsdelivr.net`으로 프록시하고 CORS 헤더를 붙임. 즉 **원격 `@latest` 코드를 런타임에 받아 실행**하고(빠른 수정에는 유리), 주입 시점은 document-start가 아니라 onPageFinished임. Trusted Types 정책도 직접 만들어 우회함.
6. 매니페스트: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `foregroundServiceType="mediaPlayback"`. PiP는 `onUserLeaveHint`에서 가짜 터치 이벤트를 보내 fullscreen 제스처 요건을 충족시킨 뒤 진입함.

#### NouTube (nonbili/NouTube, 최신 커밋 2026-10-24, v0.7.4, AGPL-3.0) [소스 확인]
README의 "How it works"는 "Wrap m.youtube.com and music.youtube.com in Android webview / Inject code to block ads / Hook playback controls and support playing in background"임. **Android, iOS, 데스크톱, 브라우저 확장을 모두 같은 content script(`content/*.ts`)로 구동함.** F-Droid와 GitHub Releases로 배포하고, iOS는 TestFlight 베타임(App Store Connect에 0.6.13 스크린샷 업로드 기록이 있으나 공개 출시 여부는 확인 못 함).

1. **Android Visibility** (`modules/nou-tube-view/android/.../NouTubeView.kt`)
```kotlin
class NouWebView ... : WebView(...) {
  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(VISIBLE)          // 항상 VISIBLE
  }
  init {
    // The default policy waives the renderer priority when the WebView is not visible,
    // leaving the renderer at cached importance ... the system may kill it (#309).
    setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)
  }
}
```
   부모 뷰(NouTubeView)에서는 `windowVisibility`(실제 창 상태)를 읽어 `window.NouTubeBackground = true/false`를 페이지에 알림. 주석에 따르면 `onWindowVisibilityChanged` 인자는 조상 뷰 visibility와 합쳐진 값이라 화면 전환과 백그라운드 전환을 구분하지 못함. 그래서 raw `windowVisibility`를 써야 함.
2. **iOS Visibility** (`ios/NouTubeView.swift`, `WKUserScript(... injectionTime: .atDocumentStart)`)
```js
// WKWebView flips the page to hidden the moment the app leaves the foreground,
// and YouTube pauses mobile web as soon as it sees that.
Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return false } })
Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'visible' } })
// Only the visibility events: pagehide and blur also fire on real navigations
;['visibilitychange', 'webkitvisibilitychange'].forEach(function (type) {
  document.addEventListener(type, function (e) { e.stopImmediatePropagation() }, true) })
```
   `UIApplication.didEnterBackgroundNotification`과 `willEnterForegroundNotification`으로 실제 상태를 `window.NouTubeBackground`에 반영함. 구성은 `allowsInlineMediaPlayback = true`, `mediaTypesRequiringUserActionForPlayback = []`, `allowsPictureInPictureMediaPlayback = true`. **FixYTBackground와 달리 `blur`/`pagehide`는 막지 않음**(YouTube 자체 정리 로직에 필요하다는 이유).
3. **Background guard** (`content/background-guard.ts`): **BgPlay에 가장 직접 참고할 코드**
   - 맨 위 주석: "mobile web pauses for non-premium users when it believes the page is hidden, and inactivity prompts ('Video paused. Continue watching?', ytmusic-you-there-renderer) pause after a few hours."
   - `guardMediaSessionHandlers()`: document-start에서 `navigator.mediaSession.setActionHandler`를 감싸 play/pause가 들어올 때 `appPaused`를 갱신함. `window.__nouMediaSession = session`으로 참조를 유지하는 이유는 주석대로 "WebKit can collect the JS wrapper for navigator.mediaSession… the patch goes with it"임.
   - 네이티브 `NouTube.pause()/play()`도 감싸 알림, 블루투스, 슬립 타이머로 온 pause를 기록함. 포그라운드에서 YouTube UI로 누른 pause는 capture 단계의 `pause` 이벤트로 기록함.
   - 5초 polling 조건은 `isBackground() && state===PAUSED && wasPlaying && !appPaused && !pausedByInterruption`임. 이 조건이면 `confirmYouThereDialogs()`(버튼이 정확히 1개일 때만 click)를 실행한 뒤 `player.playVideo()`를 부름. 최대 3회 시도함.
   - 재개 전에는 `NouTubeI.canAutoResume()`을 확인함. Android 구현은 `audioManager.mode == MODE_NORMAL && !audioManager.isMusicActive`이고, 6틱(30초) 연속 막히면 "인터럽션"으로 보고 포기함.
4. **알림과 메타데이터**: Android `NouService`는 `MediaSessionCompat` + `androidx.media.app.NotificationCompat.MediaStyle` + `startForeground(..., FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)` 구성임. "startForegroundService 5초 deadline" 처리 주석도 있음. 메타데이터는 `content/player.ts`가 플레이어 `videoDetails`(title, author, lengthSeconds, thumbnail)를 읽어 `window.NouTubeI.notify(...)`로 보내고, 진행 상황은 `timeupdate`를 throttle해 `notifyProgress`로 보냄. iOS `NouNowPlaying.swift`는 `AVAudioSession.setCategory(.playback, mode: .moviePlayback)`로 설정하고, interruption `.ended` 때 `setActive(true)`로 세션을 다시 잡음. `MPNowPlayingInfoCenter`와 `MPRemoteCommandCenter`의 명령은 JS 실행으로 연결함.
5. JS 브리지에는 `NouTubeToken`(bridge token) 검증이 있음. 페이지 안의 임의 스크립트가 네이티브 API를 호출하지 못하게 하려는 장치이며, BgPlay도 도입할 가치가 있음.

#### 기타
- `pierfrancescosoffritti/android-youtube-player`: IFrame Player API를 WebView에 띄우는 라이브러리이고 앱이 아님. IFrame API를 쓰면 API 약관(백그라운드 재생 금지)이 바로 적용됨 [보도].
- 검색에서는 YouPlay(네이티브 오디오 추출), BackDrop(2023 이후 정지)도 나왔으나 WebView 방식이 아님 [보도].

### 2.3 데스크톱: th-ch/youtube-music → **Pear Desktop** (pear-devs/pear-desktop, 최신 커밋 2026-11-01) [소스 확인]
- Electron `BrowserWindow`에 music.youtube.com을 로드함(`src/index.ts`, `contextIsolation: true`, preload 사용). **데스크톱 웹은 hidden이어도 pause하지 않으므로 visibility 위장 코드가 없음**(`backgroundThrottling` 같은 설정도 찾지 못함). 미디어 키 처리는 플러그인(`shortcuts`, `taskbar-mediacontrol`, `notifications`)이 맡고, Linux에서는 Chromium 자체 MPRIS를 `disable-features=MediaSessionService`로 끔.
- 큐: `src/plugins/api-server/backend/scheme/queue.ts`에 `insertPosition: 'INSERT_AT_END' | 'INSERT_AFTER_CURRENT_VIDEO'`, `MoveSongInQueue {toIndex}`, `SetQueueIndex`가 있음. YT Music 페이지의 큐 API를 그대로 감싼 것임. 플레이리스트는 자체 저장소 없이 YT Music 계정의 것을 사용함.
- **상표 회피**: README 제목은 "Pear Desktop"이고 비제휴 disclaimer가 있음. `package.json`의 `"name": "youtube-music"`처럼 "youtube-music" 문자열을 유니코드 escape로 숨김(상표 관련 대응으로 추정되며 이유는 공식 확인 못 함).

### 2.4 iOS App Store 앱 (IFrame/WKWebView 계열)
- **ProTube** [보도]: 2017-09-01 App Store에서 삭제됨. 개발자 Jonas Gessner에 따르면 YouTube가 "여러 차례 요청과 위협"을 했고, 유료 판매 중단과 백그라운드 재생·오디오 전용 같은 핵심 기능 제거를 요구했음. 기존 설치본은 iOS 11에서 백그라운드 재생 일부가 깨짐.
- **Musi** [보도]: 2016년부터 서비스한 무료 "YouTube 래퍼" 음악 앱. 2024-09 App Store에서 삭제됨. Musi 소장에 따르면 2024-07-29자 "YouTube Legal" 명의 불만 접수가 근거였음. Apple은 NMPA와 IFPI의 불만도 받았다고 주장함. YouTube 쪽 쟁점(보도)은 비공개 인터페이스 사용, 광고 모델(Musi 자체 광고, $5.99 일회성 제거), YouTube 콘텐츠로 수익을 낸 점임. **2026-03-16 N.D. Cal.(Eumi Lee 판사)는 Apple이 개발자 계약상 "with or without cause"로 삭제할 수 있다며 소송을 with prejudice로 기각했고, Musi 측 변호인에게 제재를 부과함.** 저작권 침해 여부 자체는 판단하지 않음. Musi의 정확한 재생 구현(IFrame embed 여부, 백그라운드 방식)은 1차 근거로 **확인 못 함**.
- **Demus**: 관련 근거를 찾지 못함(**확인 못 함**).
- **NouTube iOS**: WKWebView + 위장 + AVAudioSession 구성(2.2 참조). TestFlight로만 배포 중 [소스 확인: README].
- **YouTube API 정책** [공식, 검색 요약]: Developer Policies 가이드의 금지 사례에 "Allow for background play of the YouTube video player… even when your API service window is closed or minimized"와 "separate or isolate video or audio components"가 명시돼 있음. 과거 Google Play가 "enables background playing of YouTube videos, which is a violation of the YouTube API Terms of Service"라는 사유로 거절한 사례도 보고됨(Apache Cordova 이슈).

### 2.5 패치된 공식 앱
- **YouTube Vanced** [보도]: 2022-03-13 개발 중단 발표. Google의 cease-and-desist 서한이 로고 변경과 YouTube 관련 언급·링크 제거를 요구했고, 팀은 이를 계기로 개발과 배포를 모두 중단함(The Verge 원 보도).
- **ReVanced** [소스 확인: GitLab `ReVanced/revanced-patches` 미러, 2026-05 커밋. GitHub 원본은 이 세션에서 인증 요구로 접근 불가]. **원리는 공식 앱의 Premium/정책 판정 메서드 반환값을 바이트코드 패치로 true로 바꾸는 것**임.
  - `patches/.../youtube/misc/backgroundplayback/BackgroundPlaybackPatch.kt`: opcode 패턴(fingerprint)으로 `backgroundPlaybackManagerMethod`(public static, `(L)Z`)를 찾음. 모든 `RETURN` 직전에 확장 메서드를 끼움.
```kotlin
invoke-static { v$register }, Lapp/revanced/extension/youtube/patches/BackgroundPlaybackPatch;->isBackgroundPlaybackAllowed(Z)Z
move-result v$register
```
  - 확장 코드(`extensions/youtube/.../BackgroundPlaybackPatch.java`): `if (original) return true; if (ShortsPlayerState.isOpen()) return false; return !current.isNoneOrHidden() && current != PlayerType.INLINE_MINIMAL;`
  - 그 밖에 설정 화면의 "백그라운드 재생" 항목 강제 노출(`returnEarly(true)`), Shorts feature flag `45415425L` 강제 true, 어린이용 영상 정책 컨트롤러 `returnEarly()`, 20.29+ 플래그 `45698813L` false(백그라운드 재생 방해)를 적용함. YT Music 패치는 `backgroundPlaybackDisableMethod.returnEarly(true)` 한 줄임. 지원 버전은 YouTube 20.14~20.40.x, YT Music 7.29~8.40.x. 로그인하려면 GmsCore(microG) 계열이 별도로 필요함([보도] 수준이며 이번에 소스로 확인하지 않음).
- **iOS 트윅** [소스 확인]
  - YTLite(dayanch96/YTLite, 2026-11-03 커밋) `YTLite.x`: PoomSmart의 YouTube-X 방식을 그대로 가져옴.
```objc
%hook YTIPlayabilityStatus
- (BOOL)isPlayableInBackground { return ytlBool(@"backgroundPlayback") ? YES : NO; }
%end
%hook MLVideo
- (BOOL)playableInBackground { return ytlBool(@"backgroundPlayback") ? YES : NO; }
%end
```
    즉 서버가 내려준 playability 응답 객체의 "백그라운드 재생 가능" 판정을 Logos 훅으로 YES로 바꿈. 같은 파일에 `isMonetized` → NO로 광고를 제거하는 훅도 있음.
  - uYouEnhanced(arichornlover, 2026-10 커밋): uYou(비공개 dylib) 위에 YouPiP, YTUHD, iSponsorBlock 등 PoomSmart 트윅을 서브모듈로 묶은 구조. `Sources/SettingsKeys.h`에 `backgroundPlayback`, `NonBackgroundableKey`가 있음. 백그라운드 재생 자체는 uYou(비공개) 또는 YouTube-X 계열 훅이 담당하는 것으로 보임(정확한 경로는 **확인 못 함**). 모두 탈옥이나 사이드로딩(IPA 재서명)으로 배포함.

### 2.6 네이티브 커스텀 클라이언트 (스트림 추출 + ExoPlayer/AVPlayer)
최신 커밋은 2026-11-03 기준 직접 clone해서 확인함 [소스 확인]. 상태 설명은 README 또는 [보도].

| 앱 | 접근 방식 | 최신 커밋 | 현황 |
|---|---|---|---|
| NewPipe | 자체 NewPipeExtractor(InnerTube 파싱, 서명/n-param 해독) + ExoPlayer, 무로그인 | 2026-11-03 (Extractor 2026-11-02) | 2025-05 SABR 대응 협업 이슈 개설, v0.26.3 extractor에 SABR 우회(어린이용 제외) [보도]. 활발히 유지 |
| PipePipe | NewPipe 하드 포크, 5.6.0부터 플러그인 시스템 | 2026-10-27 | 2026-08 PR "SABR이 page-native BotGuard 컨텍스트 없는 PO token을 status 2/3으로 거부" 수정 [보도]. 활발 |
| Tubular | NewPipe 포크 + SponsorBlock/RYD | 2026-07-06 | **README: "This repo is discontinued."** |
| LibreTube | Piped API 또는 로컬 추출(NewPipeExtractor) + ExoPlayer | 2026-11-02 | 공개 Piped 인스턴스가 모두 죽어 v31.2에서 지원 제거, "Sign in to confirm you're not a bot"에는 로컬 추출을 권장 [보도] |
| SmartTube (Android TV) | 자체 추출(MediaServiceCore) + ExoPlayer | 2026-11-03 (커밋 메시지 "refactor(SABR)…") | 2025-12 서명키 탈취로 악성 업데이트 30.43–30.47 배포, 새 키와 새 appId로 재배포 [보도]. SABR 구현 진행 중 |
| ViMusic | InnerTube(YT Music) 직접 호출 + Media3 | 2023-09-23 | 2024-10 아카이브 [보도]. 포크 RiMusic도 아카이브 보도 |
| InnerTune | YT Music InnerTube + Media3, 로그인 선택 | 2025-11-13 | 업데이트 정체(번역 커밋만 있음) |
| OuterTune | InnerTune 포크 + 로컬 미디어 | 2026-10-12 | **README: "no longer in active development"** (ArchiveTune 등 추천) |
| Metrolist | InnerTune 계열 포크 | 2026-11-03 | 활발. Android Auto 검색 등 지원 |
| SimpMusic | YT Music InnerTube + Media3 (KMP) | 2026-11-03 | 활발. F-Droid 1.6.0(2026-07) [보도] |
| Harmony Music | Flutter, YT Music 추출 | 2025-12-08 | 번역 커밋 위주로 정체 |
| Yattee (iOS/tvOS/macOS) | Invidious/Piped API + AVPlayer, 2.0은 yt-dlp 기반 Yattee Server | 2026-10-31 ("AltStore source for 2.0.0") | 2.0 출시 진행 중, TestFlight/AltStore 배포 [보도] |

공통점: 백그라운드 재생은 ExoPlayer/AVPlayer를 직접 쓰므로 OS 측면에서는 간단함(mediaPlayback 서비스, AVAudioSession). **문제는 스트림 URL을 받는 단계임.** PoToken/BotGuard 증명, SABR 프로토콜(서버 주도 적응형 스트리밍), IP 단위 봇 차단 때문에 깨짐과 수정이 반복됨.

---

## 3. 비교표

| 접근 범주 | 예시 | 재생을 유지하는 방법 | 로그인/Premium | 깨짐 위험 | 스토어 배포 | 법·정책 이력 |
|---|---|---|---|---|---|---|
| 브라우저 내장/스크립트 | Brave, Samsung Internet, Vivaldi, Edge, (Opera) | 브라우저 레벨 visibility 위장, 스크립틀릿 | 사용자 계정 그대로, Premium이면 공식 지원 | **높음**: 2026-01 서버 측 차단 이후 업데이트 경쟁 | 브라우저 자체는 가능 | 2026-01 YouTube "Premium 전용" 일관화 |
| 브라우저 확장 | video-bg-play, Backstage Play, NouTube 확장 | content script(document_start, MAIN world)로 Visibility 위장, 이벤트 차단, pause 가로채기, 입력 ping, pre-advance | 계정 그대로 | 중~높음: DOM 셀렉터와 YouTube 로직 변경 | AMO 배포 중 | 직접 조치 사례 없음(확인 못 함) |
| **WebView 래퍼 (BgPlay 해당)** | YTPro, NouTube | 네이티브 `onWindowVisibilityChanged` 차단(Android), WKUserScript 위장(iOS), FGS + MediaSession, background guard(자동 재개), 렌더러 우선순위 | 실제 사이트 로그인, Premium이면 정당한 백그라운드 재생 | 중~높음: 페이지 JS/DOM 변경, 서버 측 판정 강화 | Play/App Store 위험 큼. 현재 F-Droid/GitHub/TestFlight로 배포 | 래퍼 자체에 대한 공개 조치 보도는 찾지 못함. 유사 사례 ProTube·Musi 삭제 |
| IFrame Player API 앱 | (과거) 각종 "백그라운드 플레이어", android-youtube-player 이용 앱 | IFrame + 오디오 세션 | 대개 무로그인 | 중 | **API 정책상 백그라운드 재생 금지** 명시 | Play 거절 사례 [보도] |
| iOS 스토어 래퍼/클라이언트 | ProTube(2017), Musi(2016–2024) | (확인 못 함: 자체 플레이어/embed) | 무로그인 위주 | — | 삭제됨 | YouTube 요청 → Apple 삭제. 2026-03 Apple 승소 |
| Electron 데스크톱 | Pear Desktop(구 th-ch/youtube-music) | 데스크톱 웹은 hidden에도 재생되므로 위장 불필요 | 계정 그대로 | 낮음~중 | GitHub, 패키지 매니저 | 상표 회피로 개명 |
| 공식 앱 패치 (Android) | Vanced(중단), ReVanced | 판정 메서드(`isBackgroundPlaybackAllowed`)와 feature flag를 바이트코드 패치 | microG로 로그인 | 중: 앱 버전마다 fingerprint 갱신 | 불가(사용자가 직접 패치) | Vanced 2022 C&D |
| 공식 앱 트윅 (iOS) | YTLite, uYou(Enhanced), YouTube Plus | Logos 훅 `isPlayableInBackground` → YES | 공식 앱 로그인 | 중 | 불가(탈옥/사이드로딩) | 공개 법적 조치 확인 못 함 |
| 네이티브 추출 클라이언트 | NewPipe, PipePipe, LibreTube, SmartTube, Metrolist, SimpMusic, Yattee | 자체 ExoPlayer/AVPlayer, FGS | 대부분 무로그인(일부 YT Music 로그인) | **높음**: PoToken, SABR, 봇 차단 | Play 불가, F-Droid 위주(iOS는 AltStore/TestFlight) | YouTube ToS 위반 소지. SmartTube 공급망 사고 |

---

## 4. Part B: 저장/정리 UX 패턴과 BgPlay 권고

### 4.1 앱별 관찰

| 앱 | 패턴 | 근거 |
|---|---|---|
| YouTube (모바일) | 저장 버튼 탭 시 **마지막으로 쓴 재생목록(없으면 나중에 볼 동영상)**에 바로 저장하고 스낵바에 **"변경(CHANGE)"** 버튼 표시 | [공식] Google 도움말 "tap Save, then tap CHANGE", [보도] 마지막 목록 기억 |
| YouTube Music | 2023: 탭 한 번으로 **가장 최근 사용한 재생목록**에 추가하고 스낵바 "Change" 표시. 설정 "Remember most recently used playlist" 토글 제공. 2022 "재생목록에 추가" 시트는 **상단에 최근 5개 캐러셀**, 오프라인 저장 목록 표시, 좋아요도 대상으로 선택 가능, "Recent / All" 탭. 큐 전체를 재생목록으로 저장하는 버튼도 있음 | [보도] 9to5Google 2022·2023 |
| Spotify | 2023-02: 하트와 "재생목록에 추가"를 **+ 버튼 하나**로 통합. 탭하면 Liked Songs에 저장되고 체크 아이콘으로 바뀜. 체크를 다시 누르면 저장 위치를 수정하는 시트가 열리고 **여러 재생목록에 동시 추가** 가능. 사용자 불만: "+가 마지막에 쓴 재생목록에 넣는다", "버튼 라벨이 재생목록 이름으로 바뀐다" | [공식] Spotify Community Blog/Newsroom, [보도] 커뮤니티 |
| NewPipe | "재생목록에 추가" 대화상자에서 **이미 그 항목이 있는 목록을 회색 처리**하고 "회색 목록은 이미 포함" 안내를 보여줌. 그래도 추가는 허용하며 토스트 "Duplicate added %d time(s)"를 띄움. 목록 메뉴에 "Remove duplicates", DB 전체 import/export 있음 | [소스 확인] `PlaylistAppendDialog.java`, `PlaylistDuplicatesEntry.kt`, `LocalPlaylistFragment.java`, `strings.xml` |
| Metrolist (InnerTune 계열) | 추가 대화상자 정렬을 **CREATE_DATE / NAME / SONG_COUNT / LAST_UPDATED** 중에서 고르고 설정을 기억함. 중복이면 **"Skip duplicates / Add anyway / Cancel"** 대화상자(단건/다건 문구 구분). 앞에 추가(prepend) 옵션 있음. `PlaylistEntity`에 `browseId`(YT 원격 목록 연결), `isLocal`, `isAutoSync`, `lastUpdateTime`이 있음. 곡의 `liked + likedDate`, `inLibrary` 타임스탬프. Backup & Restore 화면 있음 | [소스 확인] `AddToPlaylistDialog.kt`, `PlaylistEntity.kt`, `SongEntity.kt` |
| NouTube | 로그인 없이 북마크 라이브러리 제공. Bookmark마다 **단일 `folder`** 필드(폴더형). URL이 아니라 `getBookmarkKey()`(host와 videoId로 정규화: youtu.be, shorts, music 통합)로 중복 판정. 삭제는 `deleted` 플래그(soft delete)라 `restoreByIds`로 되살릴 수 있음. **Undo 토스트는 5초, 최대 3개 누적** | [소스 확인] `states/bookmarks.ts`, `folders.ts`, `undo-toast.ts`, `lib/url.ts` |
| Pear Desktop | 큐에 넣을 때 "끝에 추가"와 "다음 곡으로" 두 위치를 구분 | [소스 확인] `queue.ts` |
| Pocket | 대표적인 read-it-later "인박스". **2025-07-08 서비스 종료, 2025-10-08 데이터 영구 삭제, API도 종료** | [공식] Mozilla 지원 문서, [보도] |
| GTD | Capture(수집) → Clarify(처리) → Organize(정리) → Reflect(검토) → Engage. 인박스는 "일단 다 넣는 곳"이고, 주간 리뷰 때 비움 | [보도] 2차 요약. 원서로는 확인 못 함 |
| Todoist | 프로젝트를 지정하지 않은 작업은 기본으로 Inbox에 들어감. "매일 또는 매주 몇 분씩 Inbox를 처리"해 프로젝트로 옮기고 날짜를 붙이며, 불필요하면 삭제. Quick Add로 어디서나 수집. **프로젝트(1개 소속) + 라벨(여러 개, 프로젝트를 가로지름)** 이중 구조 | [공식] Todoist Help |
| Things 3 | Inbox 처리(When 지정, 프로젝트 이동)는 커뮤니티 사례만 확인함. 공식 문서(culturedcode.com)는 접근 차단으로 **확인 못 함** | [보도] |

### 4.2 추출한 패턴
1. **원탭 저장 + 위치를 밝히는 스낵바 + "변경"** (YouTube, YT Music, Spotify). 저장 동작에는 결정을 요구하지 않고, 수정 기회는 그 뒤에 줌.
2. **MRU(최근 사용) 우선 정렬**: 시트 상단에 최근 5개(YT Music), 정렬 옵션 기억(Metrolist LAST_UPDATED).
3. **"기본 저장소가 바뀌는" 동작은 혼란을 줌**: Spotify +가 마지막 목록으로 들어간다는 불만이 있었음. 기본값이 무엇인지 항상 라벨로 보여줘야 함.
4. **중복 처리 3단계**: 미리 표시(NewPipe 회색 처리) → 확인(Metrolist Skip/Add anyway) → 사후 정리(NewPipe Remove duplicates). 판정 키는 URL 정규화 결과(NouTube)를 씀.
5. **Undo는 soft delete와 짧은 토스트로**(NouTube 5초/최대 3개). 확인 대화상자보다 마찰이 적음.
6. **폴더(단일 소속) vs 태그/라벨(다중)**: NouTube와 YouTube 재생목록은 사실상 "한 곡이 여러 목록에 있을 수 있는 컬렉션"이고, NouTube 북마크는 단일 폴더임. Todoist는 프로젝트 1개 + 라벨 여러 개.
7. **수집과 정리의 분리, 주기적 처리**(GTD, Todoist): 인박스는 비우는 것이 목표인 임시 공간임.
8. **내보내기/백업은 필수**(NewPipe DB export, Metrolist Backup). Pocket 종료 사례가 보여주듯 사용자 데이터를 빼낼 수단이 있어야 함.

### 4.3 BgPlay "임시 저장 → 나중에 분류" 구체 권고

> **편집 주**: 이 권고를 어떻게 적용했는지(적용/보류/변경)는 [FEATURE_PLAYLIST.md §2](FEATURE_PLAYLIST.md)의 표에 정리했다.

**A. 저장(수집): 결정 없이 0.5초 안에**
- 저장 진입점 4곳을 둠.
  - 앱 내 플로팅 "임시함에 저장" 버튼
  - **Android MediaStyle 알림의 custom action**(예: 북마크 아이콘, compact view의 3번째 슬롯)
  - **iOS `MPRemoteCommandCenter.bookmarkCommand` 또는 `likeCommand`**(잠금화면/제어센터. 플랫폼이 노출하는 명령 중 하나이며 실제 노출 위치는 기기 테스트 필요)
  - Android 공유 인텐트, iOS Share Extension("YouTube 앱에서 공유 → BgPlay 임시함")
- 저장 즉시 스낵바 **"임시함에 저장됨 · [분류] · [실행취소]"**를 5초간 보여줌. [분류]는 카테고리 시트를 엶. 백그라운드에서 저장했다면 알림 액션 아이콘을 체크 상태로 바꾸는 것으로 피드백함(Spotify 체크 패턴).
- **길게 누르면** 바로 분류 시트를 엶. 상단은 MRU 5개 카테고리, 그다음 태그 칩, 검색, "새 카테고리"로 구성함.
- 함께 저장할 맥락은 `videoId`(정규화 키), title, artist/channel, thumbnail URL, duration, **저장 시점의 재생 위치(currentTime)**, 출처(music/m, 재생 중이던 재생목록 ID), savedAt, 저장 경로(notification/in-app/share)임. 메타데이터는 이미 MediaSession 갱신용으로 수집하고 있으므로(NouTube `videoDetails` 방식) 그대로 재사용함.

**B. 데이터 모델(로컬 우선, 동기화 대비)**
- `Item { key(host+videoId), status: inbox|filed|archived, categoryId?(0..1), tagIds[](0..n), savedAt, updatedAt, deleted(soft), saveCount, positionSec, source }`
- "카테고리 1개 + 태그 여러 개"의 이중 구조(Todoist 프로젝트+라벨)를 권장함. 카테고리는 재생할 때 단위(=재생목록)로 쓰고, 태그는 분위기·상황 같은 교차 필터로 씀. 같은 곡을 여러 재생목록에 넣고 싶다면 카테고리를 0..n으로 확장하는 방안을 검토할 수 있음(YouTube/Spotify 모델). 다만 "분류 완료" 판정이 모호해지므로 MVP에는 1개를 권장함.
- 모든 레코드에 `updatedAt`과 soft delete를 둠(NouTube). undo, 동기화 충돌 해결, 휴지통에 필요함.

**C. 중복 처리**
- 임시함에 같은 키가 이미 있으면 새로 만들지 않고 `saveCount++`, `savedAt` 갱신(맨 위로 이동) 후 스낵바 "이미 임시함에 있음(2번째 저장)"을 띄움. 이렇게 하면 "여러 번 저장한 곡 = 관심도 높음" 신호도 생김.
- 분류할 때는 카테고리 시트에서 이미 그 곡이 있는 카테고리를 회색 처리하고 체크 표시함(NewPipe). 일괄 이동 중 중복이 생기면 "중복 건너뛰기 / 그래도 추가 / 취소" 대화상자(Metrolist)를 띄움.

**D. 정리(처리) UX**
- **임시함 배지와 주기적 넛지**: 하단 탭에 미분류 개수 배지를 표시하고, 주 1회(사용자 설정) "임시함 12곡 정리하기" 알림을 보냄(GTD 주간 리뷰, Todoist "매일/매주 처리").
- **트리아지 카드 모드**: 한 곡씩 카드를 보여주며 30초 미리듣기를 자동 재생함(저장 위치 `positionSec`부터 재생해 "왜 저장했는지" 떠올리게 함). 하단에 MRU 카테고리 칩 4–6개를 두어 한 탭으로 분류하고 다음 카드로 넘어감. 스와이프는 좌=보관/삭제, 우=마지막 카테고리, 위=건너뛰기(나중에). 모든 동작에 5초 undo를 둠.
- **목록 모드 일괄 처리**: 길게 눌러 다중 선택 → "카테고리로 이동 / 태그 추가 / 삭제". 기간이나 출처별 "모두 선택" 필터를 제공함.
- 정렬 기본값은 임시함 최신순, 카테고리 시트 MRU순으로 하고, Metrolist처럼 정렬 선택을 기억함.
- "나중에 결정" 옵션(스누즈): 트리아지에서 건너뛴 항목은 다음 리뷰까지 숨김. 단 무한 적체를 막기 위해 30일 이상 미분류 항목은 "오래된 항목" 섹션으로 모아 보여줌.

**E. 재생 연결**
- 카테고리와 임시함을 **바로 재생 가능한 큐**로 다룸. 현재 곡 다음에 넣기와 끝에 넣기를 구분함(Pear Desktop `INSERT_AFTER_CURRENT_VIDEO`/`INSERT_AT_END`). WebView 래퍼에서는 큐 진행을 YouTube 페이지가 담당하므로, 자체 큐를 재생할 때는 `watch?v=` 내비게이션을 앱이 직접 구동해야 함. 백그라운드 자동 넘김은 FixYTBackground의 pre-advance(종료 4초 전, 재시도 3회) 방식을 참고함.

**F. 내보내기/백업/동기화**
- JSON 내보내기·가져오기(전체 DB), 카테고리별 URL 목록(텍스트) 공유, 자동 로컬 백업을 제공함. 서버가 없어도 데이터를 잃지 않게 하는 것이 Pocket 종료가 남긴 교훈임.
- (선택) 로그인 사용자를 위한 YouTube 재생목록 동기화: Metrolist처럼 카테고리에 `browseId`를 매핑하고 `isAutoSync`를 두는 방식. WebView 래퍼라면 페이지 세션으로 InnerTube 호출을 해야 하므로 깨짐 위험과 약관 문제가 있음. MVP에서는 로컬 우선을 권장함.

**G. 백그라운드 재생 구현 체크리스트(Part A 결론)**

> **편집 주 (적용 결과)**: 아래 3번 중 "YouTube가 건 pause 자동 재개(guard)"와 "keep-alive 입력 ping"은 Premium 차단을 우회하는 것이라 적용하지 않았다([DECISIONS D-03](DECISIONS.md)). 1·2·4번은 적용했고(4번은 폴리필 방식, D-05), 5번(브리지 토큰)은 출처 검증으로 대신했다(D-11).
1. Android: `WebView` 서브클래스에서 `onWindowVisibilityChanged` → `super(VISIBLE)`, `setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)`, document-start 주입(`WebViewCompat.addDocumentStartJavaScript`. YTPro의 onPageFinished 주입은 너무 늦음). 원격 `@latest` 스크립트 로딩은 피함(보안과 스토어 정책 문제).
2. iOS: `WKUserScript(.atDocumentStart)`로 hidden/visibilityState 위장 및 visibilitychange 차단(blur/pagehide는 유지), `AVAudioSession(.playback)`, interruption 종료 시 재활성화, `navigator.mediaSession.setActionHandler`를 document-start에서 감싸고 참조 유지.
3. 공통 guard: 실제 백그라운드 여부를 네이티브가 주입(`window.__bgplayBackground`), 사용자 pause와 시스템 pause 출처를 기록, 5초 polling 후 재개(최대 3회), 버튼 1개짜리 "계속 시청" 대화상자 자동 확인, 통화나 타 앱 오디오 사용 중엔 재개 금지, 장시간 재생 시 keep-alive 입력 ping 검토.
4. Android 메타데이터: `navigator.mediaSession`이 없으면 polyfill(YTPro) 또는 플레이어 `videoDetails` 직접 조회(NouTube)로 MediaSessionCompat과 MediaStyle 알림 구성.
5. JS 브리지 토큰 검증(NouTube `NouTubeToken`).
6. 배포와 브랜딩: 이름·아이콘에 YouTube 상표를 쓰지 않음(Vanced C&D, Pear 개명). App Store 심사와 사후 삭제 위험(ProTube, Musi)을 전제로 TestFlight/사이드로딩/F-Droid 같은 대안 경로를 확보함. "Premium 사용자의 정당한 백그라운드 재생과 사용자 개인 라이브러리 관리"로 포지셔닝하는 쪽이 정책상 덜 위험함(정책 판단은 법률 검토 필요).

---

## 5. 출처 목록

**소스 코드(직접 확인)**
- [prateek-chaubey/YTPro](https://github.com/prateek-chaubey/YTPro): `YTProWebView.java`, `YTProWebViewClient.java`, `ForegroundService.java`, `MainActivity.java`, `scripts/bgplay.js`, `scripts/script.js`
- [nonbili/NouTube](https://github.com/nonbili/NouTube): `content/background-guard.ts`, `content/player.ts`, `modules/nou-tube-view/android/.../NouTubeView.kt`, `NouService.kt`, `NouJsInterface.kt`, `ios/NouTubeView.swift`, `ios/NouNowPlaying.swift`, `states/bookmarks.ts`, `states/folders.ts`, `states/undo-toast.ts`, `lib/url.ts`
- [mozilla/video-bg-play](https://github.com/mozilla/video-bg-play): `video-bg-play-content.js`
- [Rigmunssel/FixYTBackground](https://github.com/Rigmunssel/FixYTBackground): `scripts/content.js`, `manifest.json`
- [ReVanced/revanced-patches (GitLab)](https://gitlab.com/ReVanced/revanced-patches): `patches/.../youtube/misc/backgroundplayback/*`, `patches/.../music/misc/backgroundplayback/*`, `extensions/youtube/.../BackgroundPlaybackPatch.java`
- [th-ch/youtube-music → pear-devs/pear-desktop](https://github.com/th-ch/youtube-music): `src/index.ts`, `src/plugins/api-server/backend/scheme/queue.ts`, `README.md`, `package.json`
- [dayanch96/YTLite](https://github.com/dayanch96/YTLite): `YTLite.x` · [arichornlover/uYouEnhanced](https://github.com/arichornlover/uYouEnhanced): `Sources/SettingsKeys.h`
- [TeamNewPipe/NewPipe](https://github.com/TeamNewPipe/NewPipe): `PlaylistAppendDialog.java`, `PlaylistDuplicatesEntry.kt`, `LocalPlaylistFragment.java`, `strings.xml`
- [MetrolistGroup/Metrolist](https://github.com/MetrolistGroup/Metrolist): `AddToPlaylistDialog.kt`, `PlaylistEntity.kt`, `SongEntity.kt`
- 상태 확인(최신 커밋, README): [OuterTune](https://github.com/OuterTune/OuterTune), [Tubular](https://github.com/polymorphicshade/Tubular), [PipePipe](https://github.com/InfinityLoop1308/PipePipe), [InnerTune](https://github.com/z-huang/InnerTune), [SimpMusic](https://github.com/maxrave-dev/SimpMusic), [Harmony-Music](https://github.com/anandnet/Harmony-Music), [LibreTube](https://github.com/libre-tube/LibreTube), [SmartTube](https://github.com/yuliskov/SmartTube), [Yattee](https://github.com/yattee/yattee), [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), [ViMusic](https://github.com/vfsfitvnm/ViMusic)

**공식 문서/발표**
- [YouTube API Services: Complying with Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide) (이 세션에서 접근 실패, 검색 요약으로 인용)
- [YouTube Help: 나중에 볼 동영상/재생목록 저장](https://support.google.com/youtube/answer/56101?hl=en-GB)
- [Spotify Community Blog: The Heart button is being replaced with a Plus button](https://community.spotify.com/t5/Community-Blog/The-Heart-button-is-being-replaced-with-a-Plus-button/bc-p/5513403/highlight/true) · [Spotify Newsroom tag: plus](https://newsroom.spotify.com/tag/plus/)
- [Mozilla: Pocket has shut down](https://support.mozilla.org/en-US/kb/future-of-pocket)
- [Todoist Help: Use the Inbox](https://todoist.com/help/articles/how-to-best-use-the-inbox-HwHvYErS) · [Todoist glossary](https://www.todoist.com/ko/help/todoist/get-started/todoist-glossary-cA60laWMH)
- [Brave: YouTube improvements on Android](https://brave.com/whats-new/android-youtube-improvements/)
- [AMO: Video Background Play Fix](https://addons.mozilla.org/en-US/firefox/addon/video-background-play-fix/versions) · [AMO: Backstage Play](https://addons.mozilla.org/en-GB/firefox/addon/backstage-play/)

**보도/포럼**
- [9to5Google: background playback workarounds not working (2026-01-28)](https://9to5google.com/2026/01/28/youtube-background-playback-workarounds-not-working-third-party-browsers) · [후속 (2026-02-02)](https://9to5google.com/2026/02/02/youtube-background-playback-workarounds-not-working-third-party-browsers/)
- [Android Authority: YouTube background playback browsers](https://www.androidauthority.com/youtube-background-playback-browsers-fix-3636806/) · [Android Headlines](https://www.androidheadlines.com/2026/01/youtube-blocking-mobile-browser-background-play-free-users.html) · [Windows Central](https://www.windowscentral.com/software-apps/youtube-blocks-background-play-on-third-party-mobile-browsers)
- [Brave Community: background play not working (Android)](https://community.brave.app/t/background-play-not-working-after-latest-brave-update-for-android-phones/649737) · [YT Music won't play next song](https://community.brave.app/t/my-youtube-music-wont-play-another-song/650156)
- [AppleInsider: Apple pulls ProTube (2017)](https://appleinsider.com/articles/17/09/04/apple-pulls-protube-from-app-store-following-complaints-by-googles-youtube) · [MacRumors](https://macrumors.com/2017/09/04/youtube-app-protube-pulled-from-app-store)
- [Music Business Worldwide: Musi sues Apple](https://www.musicbusinessworldwide.com/free-streaming-app-musi-sues-apple-over-removal-from-app-store/) · [MBW: backchannel allegations](https://www.musicbusinessworldwide.com/musi-was-kicked-off-the-app-store-over-copyright-infringement-allegations-now-its-accusing-apple-of-a-backchannel-scheme-to-remove-it/) · [CMU: labels told Apple six times](https://completemusicupdate.com/labels-told-apple-six-times-to-kick-musi-out-of-app-store-new-legal-filing-reveals/) · [MacRumors: Apple wins (2026-03-18)](https://www.macrumors.com/2026/03/18/apple-wins-victory-musi-app-store-lawsuit/) · [CMU: Apple wins](https://completemusicupdate.com/apple-wins-legal-battle-with-musi-after-judge-rules-music-apps-lawsuit-was-not-the-paradigm-of-candor/)
- [TechSpot: Vanced shutting down after C&D](https://www.techspot.com/news/93760-youtube-vanced-shutting-down-after-owners-receive-cease.html) · [Android Authority: Vanced discontinued](https://www.androidauthority.com/youtube-vanced-discontinued-3132147/)
- [Android Authority: Kiwi Browser shutting down](https://androidauthority.com/kiwi-browser-shutting-down-3519510) · [Neowin](https://www.neowin.net/news/kiwi-browser-takes-final-breath-but-at-least-some-of-it-will-live-on-in-microsoft-edge/)
- [BleepingComputer: SmartTube breached](https://bleepingcomputer.com/news/security/smarttube-youtube-app-for-android-tv-breached-to-push-malicious-update) · [heise](https://www.heise.de/en/news/Android-TV-YouTube-client-SmartTube-was-infected-with-malware-11099419.html?view=print)
- [PipePipe PR #86: SABR BotGuard context](https://github.com/InfinityLoop1308/PipePipeClient/pull/86) · [NewPipe issue #12248 (SABR 협업)](https://www.goodfirstissue.org/TeamNewPipe/NewPipe/issues/12248) · [Flathub NewPipe](https://flathub.org/zh-Hant/apps/net.newpipe.NewPipe)
- [F-Droid: LibreTube](https://f-droid.org/is/packages/com.github.libretube/) · [IzzyOnDroid: SimpMusic](https://apt.izzysoft.de/fdroid/index/apk/com.maxrave.simpmusic?repo=archive)
- [9to5Google: YouTube Music add to playlist (2023)](https://9to5google.com/2023/06/28/youtube-music-add-playlist/) · [9to5Google: new add-to-playlist UI (2022)](https://9to5google.com/2022/01/28/youtube-music-add-to-playlist-new-ui/) · [9to5Google: save queue as playlist](https://9to5google.com/2021/12/04/youtube-music-save-queue-playlist/)
- [Spotify Community: plus button adds to playlist instead of Liked Songs](https://community.spotify.com/t5/Your-Library/plus-button-adds-song-to-a-playlist-instead-of-liked-songs/td-p/5651352/page/3)
- [Apache Cordova CB-11935 (Play 거절 사례 인용)](https://issues.apache.org/jira/browse/CB-11935)
- [Thomas Frank: 5-Minute Guide to GTD](https://thomasjfrank.com/productivity/the-5-minute-guide-to-gtd-getting-things-done/) · [Medium: The Allen Algorithm](https://medium.com/@DanSanchezV/the-allen-algorithm-gtd-in-a-nutshell-3fdd343a5779)
