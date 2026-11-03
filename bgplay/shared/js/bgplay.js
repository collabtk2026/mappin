/*
 * bgplay.js — Android(WebView) / iOS(WKWebView) 공용 주입 스크립트.
 *
 * 문서 시작 시점(document-start)에, 페이지 스크립트보다 먼저 실행되어야 한다.
 * 네이티브 쪽에서 이 파일 앞에 설정 한 줄을 붙여서 주입한다:
 *
 *   window.__BGPLAY_CONFIG = { backgroundPlay: true, platform: "android" };
 *
 * 하는 일 (3개 레이어):
 *   1) Page Visibility 위장 — Brave Android(youtube_script_injector_tab_helper.cc)와
 *      Brave iOS(media_backgrounding.ts)의 방식을 합친 것. 페이지는 항상 'visible'로 보고,
 *      페이지가 등록한 visibilitychange 리스너는 호출되지 않는다.
 *   2) 엔진이 백그라운드 전환 때문에 멈춘 미디어 자동 재개 — Brave iOS 로직.
 *      JS의 pause()를 거친 정지(사용자/사이트가 의도한 정지)는 재개하지 않는다.
 *   3) 네이티브 브리지 — 재생 상태/메타데이터를 네이티브로 보내고(알림, 잠금화면),
 *      네이티브의 명령(play/pause/next/prev/seek)을 받아 실행한다.
 *
 * 네이티브 채널:
 *   Android: window.BgPlayNative.postMessage(string)  (WebViewCompat.addWebMessageListener)
 *   iOS:     window.webkit.messageHandlers.bgplay.postMessage(string)
 * 네이티브 -> 페이지: window.__bgplay.command(name, arg)
 */
(function () {
  'use strict';

  if (window.__bgplay) return;

  var cfg = window.__BGPLAY_CONFIG || {};
  var BG = cfg.backgroundPlay !== false;
  var PLATFORM = cfg.platform || 'unknown';
  var HOSTS = cfg.allowedHostSuffixes || null; // 예: ["youtube.com"] — iOS는 origin 필터가 없어 JS에서 거른다.
  var VERSION = '0.1.0';

  if (HOSTS && !hostAllowed(location.hostname, HOSTS)) return;

  var isTop = window.top === window;
  var origAdd = EventTarget.prototype.addEventListener;
  var origPlay = HTMLMediaElement.prototype.play;
  var origPause = HTMLMediaElement.prototype.pause;
  var USER_PAUSE = typeof Symbol === 'function' ? Symbol('bgplayUserPause') : '__bgplayUserPause';

  // ---------------------------------------------------------------------------
  // 1) Page Visibility 위장
  // ---------------------------------------------------------------------------
  var docProto = Document.prototype;
  var visDesc = Object.getOwnPropertyDescriptor(docProto, 'visibilityState');

  // 엔진이 알려주는 "진짜" 가시성. 위장 후에도 내부적으로는 이걸 쓴다.
  function realVisibility() {
    try {
      return visDesc && visDesc.get ? visDesc.get.call(document) : 'visible';
    } catch (e) {
      return 'visible';
    }
  }

  var BLOCKED_EVENTS = { visibilitychange: true, webkitvisibilitychange: true };

  if (BG) {
    defineGetter(docProto, 'visibilityState', function () { return 'visible'; });
    defineGetter(docProto, 'hidden', function () { return false; });
    if ('webkitVisibilityState' in docProto) defineGetter(docProto, 'webkitVisibilityState', function () { return 'visible'; });
    if ('webkitHidden' in docProto) defineGetter(docProto, 'webkitHidden', function () { return false; });

    // visibilitychange는 document에서 발생해 window까지 버블링된다. 둘 다 막는다.
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if ((this === document || this === window) && BLOCKED_EVENTS[type] === true) return undefined;
      return origAdd.call(this, type, listener, options);
    };
    // document.onvisibilitychange = fn 형태도 무시.
    try {
      Object.defineProperty(docProto, 'onvisibilitychange', {
        configurable: true,
        get: function () { return null; },
        set: function () {}
      });
    } catch (e) {}

    // Brave iOS: PiP 진입/해제를 사이트가 감지해 멈추지 않도록 전파 차단.
    origAdd.call(document, 'webkitpresentationmodechanged', function (e) { e.stopPropagation(); }, true);
  }

  // ---------------------------------------------------------------------------
  // 2) 엔진 주도 정지 자동 재개 (Brave iOS media_backgrounding.ts 로직)
  // ---------------------------------------------------------------------------
  // JS로 호출된 pause()/play()를 표시해 둔다. 엔진(WebKit/Chromium)이 직접 멈춘 경우는
  // 이 경로를 타지 않으므로 USER_PAUSE가 false로 남는다.
  HTMLMediaElement.prototype.pause = function () {
    this[USER_PAUSE] = true;
    return origPause.apply(this, arguments);
  };
  HTMLMediaElement.prototype.play = function () {
    this[USER_PAUSE] = false;
    return origPlay.apply(this, arguments);
  };

  var RESUME_WINDOW_MS = 2000; // 가시성 전환 전후 이 시간 안의 정지만 "백그라운드 때문"으로 본다.
  var lastHiddenAt = realVisibility() === 'visible' ? 0 : now();
  var holdResumeUntil = 0;     // 네이티브가 오디오 인터럽션(전화 등) 중엔 재개를 막는다.
  var pendingResume = [];      // 보이는 상태에서 멈춘 미디어: 곧 hidden 전환이 오면 재개
  var resumeLog = [];          // 재개 루프 방지

  function canAutoResume(el) {
    return BG && !el[USER_PAUSE] && !el.ended && now() >= holdResumeUntil;
  }

  function resume(el) {
    var t = now();
    resumeLog = resumeLog.filter(function (x) { return t - x < 10000; });
    if (resumeLog.length >= 3) return; // 10초에 3회 이상이면 포기(사이트가 의도적으로 멈추는 중)
    resumeLog.push(t);
    setTimeout(function () {
      if (el.paused && canAutoResume(el)) {
        var p = origPlay.call(el);
        if (p && p.catch) p.catch(function () {});
        post({ type: 'autoResume' });
      }
    }, 0);
  }

  origAdd.call(document, 'visibilitychange', function () {
    var v = realVisibility();
    if (v !== 'visible') {
      lastHiddenAt = now();
      var list = pendingResume;
      pendingResume = [];
      list.forEach(function (item) {
        if (now() - item.at <= RESUME_WINDOW_MS && item.el.paused && canAutoResume(item.el)) resume(item.el);
      });
    }
    post({ type: 'visibility', state: v });
  }, true);

  // 미디어 이벤트는 버블링되지 않지만 document 캡처 단계에서는 모두 잡힌다.
  origAdd.call(document, 'pause', function (e) {
    var el = e.target;
    if (!(el instanceof HTMLMediaElement) || !canAutoResume(el)) return;
    if (realVisibility() !== 'visible') {
      if (now() - lastHiddenAt <= RESUME_WINDOW_MS) resume(el);
    } else {
      pendingResume.push({ el: el, at: now() });
    }
  }, true);

  // ---------------------------------------------------------------------------
  // 3) 네이티브 브리지 (최상위 프레임만)
  // ---------------------------------------------------------------------------
  var handlers = {};
  var current = null;
  var lastSent = '';
  var lastPositionSentAt = 0;

  if (isTop) {
    // 사이트가 등록한 Media Session 액션 핸들러를 기억해 두면 next/prev를
    // DOM 셀렉터에 의존하지 않고 사이트 자신의 로직으로 실행할 수 있다.
    if (window.MediaSession && MediaSession.prototype.setActionHandler) {
      var origSetAction = MediaSession.prototype.setActionHandler;
      MediaSession.prototype.setActionHandler = function (action, handler) {
        handlers[action] = handler || null;
        schedule();
        return origSetAction.apply(this, arguments);
      };
      var metaDesc = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');
      if (metaDesc && metaDesc.set && metaDesc.configurable) {
        Object.defineProperty(MediaSession.prototype, 'metadata', {
          configurable: true,
          enumerable: metaDesc.enumerable,
          get: metaDesc.get,
          set: function (v) { metaDesc.set.call(this, v); schedule(); }
        });
      }
    }

    ['play', 'playing', 'pause', 'ended', 'durationchange', 'loadedmetadata', 'ratechange', 'seeked', 'emptied']
      .forEach(function (type) {
        origAdd.call(document, type, function (e) {
          if (!(e.target instanceof HTMLMediaElement)) return;
          if (type === 'play' || type === 'playing') current = e.target;
          schedule(true);
        }, true);
      });
    origAdd.call(document, 'timeupdate', function (e) {
      if (!(e.target instanceof HTMLMediaElement)) return;
      if (now() - lastPositionSentAt > 5000) schedule(true); // 위치 보정용. 평소엔 네이티브가 외삽.
    }, true);

    // 제목이 SPA 내비게이션으로만 바뀌는 경우 대비.
    setInterval(function () { if (primaryMedia()) schedule(); }, 2000);
  }

  var scheduled = false;
  var forceNext = false;
  function schedule(force) {
    if (!isTop) return;
    if (force) forceNext = true;
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      var f = forceNext;
      forceNext = false;
      sendState(f);
    }, 50);
  }

  function primaryMedia() {
    if (current && current.isConnected) return current;
    return document.querySelector('video.html5-main-video') || document.querySelector('video') || document.querySelector('audio');
  }

  function readMetadata() {
    var out = { title: null, artist: null, album: null, artwork: null };
    try {
      var md = navigator.mediaSession && navigator.mediaSession.metadata;
      if (md) {
        out.title = md.title || null;
        out.artist = md.artist || null;
        out.album = md.album || null;
        out.artwork = pickArtwork(md.artwork);
      }
    } catch (e) {}
    if (!out.title) {
      var t = (document.title || '').replace(/\s*-\s*YouTube( Music)?\s*$/, '').trim();
      out.title = t || null;
    }
    return out;
  }

  function pickArtwork(list) {
    if (!list || !list.length) return null;
    var best = null;
    var bestArea = -1;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var m = /(\d+)x(\d+)/.exec(a.sizes || '');
      var area = m ? parseInt(m[1], 10) * parseInt(m[2], 10) : 0;
      if (area > bestArea) { best = a.src; bestArea = area; }
    }
    return best;
  }

  function buildState() {
    var m = primaryMedia();
    var md = readMetadata();
    return {
      type: 'state',
      v: VERSION,
      platform: PLATFORM,
      hasMedia: !!m,
      playing: !!(m && !m.paused && !m.ended),
      ended: !!(m && m.ended),
      position: m ? finite(m.currentTime) : null,
      duration: m ? finite(m.duration) : null,
      rate: m ? finite(m.playbackRate) : null,
      title: md.title,
      artist: md.artist,
      album: md.album,
      artwork: md.artwork,
      url: location.href,
      canNext: !!handlers.nexttrack || !!findButton(NEXT_SELECTORS),
      canPrev: !!handlers.previoustrack || !!findButton(PREV_SELECTORS),
      backgroundPlay: BG
    };
  }

  function sendState(force) {
    var s = buildState();
    var key = JSON.stringify([s.hasMedia, s.playing, s.ended, s.duration, s.rate, s.title, s.artist, s.album, s.artwork, s.url, s.canNext, s.canPrev]);
    if (!force && key === lastSent) return;
    lastSent = key;
    lastPositionSentAt = now();
    post(s);
  }

  function post(msg) {
    if (!isTop) return;
    var s;
    try { s = JSON.stringify(msg); } catch (e) { return; }
    try {
      if (window.BgPlayNative && typeof window.BgPlayNative.postMessage === 'function') {
        window.BgPlayNative.postMessage(s);
      } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bgplay) {
        window.webkit.messageHandlers.bgplay.postMessage(s);
      }
    } catch (e) {}
  }

  // YouTube(m.), YouTube Music, 데스크톱 레이아웃의 다음/이전 버튼 — 핸들러가 없을 때만 쓰는 폴백.
  var NEXT_SELECTORS = ['.ytp-next-button', 'ytmusic-player-bar .next-button', 'button.player-control-next', '.player-controls-middle button[aria-label*="Next"]'];
  var PREV_SELECTORS = ['.ytp-prev-button', 'ytmusic-player-bar .previous-button', 'button.player-control-previous', '.player-controls-middle button[aria-label*="Previous"]'];

  function findButton(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var b = document.querySelector(selectors[i]);
      if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') return b;
    }
    return null;
  }

  function callHandler(action, details) {
    var h = handlers[action];
    if (typeof h !== 'function') return false;
    try { h(Object.assign({ action: action }, details || {})); return true; } catch (e) { return false; }
  }

  function command(name, arg) {
    var m = primaryMedia();
    var p;
    switch (name) {
      case 'play':
        if (m) { p = m.play(); if (p && p.catch) p.catch(function () {}); } else callHandler('play');
        break;
      case 'pause':
        if (m) m.pause(); else callHandler('pause');
        break;
      case 'toggle':
        return command(m && !m.paused ? 'pause' : 'play');
      case 'next':
        if (!callHandler('nexttrack')) { var nb = findButton(NEXT_SELECTORS); if (nb) nb.click(); }
        break;
      case 'prev':
        if (!callHandler('previoustrack')) {
          var pb = findButton(PREV_SELECTORS);
          if (pb) pb.click(); else if (m) m.currentTime = 0;
        }
        break;
      case 'seekto':
        if (typeof arg === 'number' && isFinite(arg)) {
          if (!callHandler('seekto', { seekTime: arg })) { if (m) m.currentTime = arg; }
        }
        break;
      case 'seekby':
        if (m && typeof arg === 'number' && isFinite(arg)) m.currentTime = Math.max(0, m.currentTime + arg);
        break;
      case 'holdAutoResume': // 오디오 인터럽션(전화/알람) 동안 자동 재개 금지. arg = ms
        holdResumeUntil = now() + (typeof arg === 'number' ? arg : 0);
        break;
      case 'pip':
        togglePip(m);
        break;
      case 'state':
        sendState(true);
        break;
      default:
        return false;
    }
    schedule(true);
    return true;
  }

  function togglePip(m) {
    if (!m || m.tagName !== 'VIDEO') return;
    try {
      if (typeof m.webkitSupportsPresentationMode === 'function' && m.webkitSupportsPresentationMode('picture-in-picture')) {
        m.webkitSetPresentationMode(m.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      } else if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
      } else if (typeof m.requestPictureInPicture === 'function') {
        m.disablePictureInPicture = false;
        var p = m.requestPictureInPicture();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // 유틸
  // ---------------------------------------------------------------------------
  function now() { return Date.now(); }
  function finite(n) { return typeof n === 'number' && isFinite(n) ? n : null; }

  function hostAllowed(host, suffixes) {
    host = String(host || '').toLowerCase();
    for (var i = 0; i < suffixes.length; i++) {
      var s = String(suffixes[i]).toLowerCase();
      if (host === s || host.slice(-(s.length + 1)) === '.' + s) return true;
    }
    return false;
  }

  function defineGetter(obj, prop, getter) {
    var d = Object.getOwnPropertyDescriptor(obj, prop);
    try {
      Object.defineProperty(obj, prop, {
        configurable: true,
        enumerable: d ? d.enumerable : true,
        get: getter
      });
    } catch (e) {}
  }

  Object.defineProperty(window, '__bgplay', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      version: VERSION,
      backgroundPlay: BG,
      command: command,
      getState: buildState
    })
  });
})();
