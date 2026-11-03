/*
 * BgPlay 보관함 UI — Android/iOS 공용 (투명 오버레이 WebView 안에서 동작).
 *
 * 네이티브 -> 페이지 (window.__bglib)
 *   boot(json|null)        저장된 보관함 데이터로 시작
 *   quickSave(track)       상단 "임시 저장" 버튼. 결과 JSON 문자열을 돌려줌 (네이티브가 토스트 표시)
 *   openSave(track)        상단 "분류 저장" 버튼 → 분류 시트
 *   openLibrary(tab?)      보관함 화면 ('inbox' | 'categories' | 'all')
 *   nowPlaying(track)      현재 재생 정보 (보관함 상단 카드용)
 *   back()                 뒤로 가기. 처리했으면 true
 *
 * 페이지 -> 네이티브 (BgLibNative.postMessage / webkit.messageHandlers.bglib)
 *   {type:'ready'} {type:'persist', data} {type:'stats', inbox, total} {type:'close'}
 *   {type:'play', url, title, keepOpen} {type:'playQueue', name, items, index} {type:'export', json, filename}
 *   {type:'toast', text}
 */
(function () {
  'use strict';
  var C = window.BgLibCore;
  var EMOJIS = ['🎵', '⭐', '🏃', '📚', '🚗', '☕', '🌙', '🔥', '💤', '🎉', '💔', '🎸', '🎹', '🎧', '🌧️', '🌿', '🏖️', '🙏'];

  var S = {
    data: C.empty(),
    booted: false,
    mode: 'hidden',          // hidden | save | library
    // 분류 시트 (save 모드 또는 보관함 위의 시트)
    sheet: null,             // {kind:'save'|'menu'|'confirm'|'newcat'|'editcat'|'import'|'tags', ...}
    // 보관함
    tab: 'inbox',
    cat: null,               // 카테고리 상세
    q: '', tag: null,
    selecting: false, selected: {},
    triage: null,            // {ids, pos, multi, picked:{}, tags:[], done}
    nowPlaying: null,
    undo: null               // {snapshot, triagePos}
  };

  var $app = document.getElementById('app');
  var $toast = document.getElementById('toast');

  // ================================================================== 네이티브 브리지

  function post(msg) {
    var s = JSON.stringify(msg);
    try {
      if (window.BgLibNative && typeof window.BgLibNative.postMessage === 'function') return window.BgLibNative.postMessage(s);
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bglib) return window.webkit.messageHandlers.bglib.postMessage(s);
    } catch (e) {}
    devFallback(msg);
  }

  /** 브라우저에서 직접 열었을 때(개발용): localStorage 에 저장. */
  function devFallback(msg) {
    if (msg.type === 'persist') { try { localStorage.setItem('bglib', msg.data); } catch (e) {} }
    if (msg.type === 'play' || msg.type === 'playQueue') console.log('[bglib]', msg);
  }

  function persist() {
    post({ type: 'persist', data: JSON.stringify(S.data) });
    var st = C.stats(S.data);
    post({ type: 'stats', inbox: st.inbox, total: st.total });
  }

  /** 되돌리기 가능한 변경. fn 안에서 S.data 를 바꾼다. */
  function mutate(fn, undoable) {
    var snap = undoable ? JSON.stringify(S.data) : null;
    var r = fn();
    // 되돌릴 수 없는 변경 뒤에 예전 스냅샷으로 되돌리면 그 변경이 사라지므로 비운다.
    S.undo = undoable ? { snapshot: snap, triagePos: S.triage ? S.triage.pos : null } : null;
    persist();
    return r;
  }

  function undo() {
    if (!S.undo) return;
    S.data = C.load(S.undo.snapshot);
    if (S.triage && S.undo.triagePos != null) { S.triage.pos = S.undo.triagePos; S.triage.done = false; }
    S.undo = null;
    persist();
    render();
    toast('되돌렸어요');
  }

  // ================================================================== 공개 API

  var api = {
    isReady: function () { return S.booted; },
    boot: function (json) {
      S.data = C.load(json);
      S.booted = true;
      var st = C.stats(S.data);
      post({ type: 'stats', inbox: st.inbox, total: st.total });
      render();
      return true;
    },
    quickSave: function (track) {
      var r = mutate(function () { return C.quickSave(S.data, track); }, false);
      if (S.mode !== 'hidden') render();
      return JSON.stringify({
        status: r.status,
        title: r.item ? r.item.title : null,
        where: r.where || [],
        inbox: C.stats(S.data).inbox
      });
    },
    openSave: function (track) {
      var item = C.trackToItem(track);
      if (!item) { post({ type: 'toast', text: '저장할 영상이 없어요' }); post({ type: 'close' }); return false; }
      openSaveSheet([item], track, true);
      S.mode = S.mode === 'library' ? 'library' : 'save';
      render();
      return true;
    },
    openLibrary: function (tab) {
      S.mode = 'library';
      S.sheet = null;
      S.triage = null;
      S.cat = null;
      clearSelection();
      if (tab) S.tab = tab;
      else S.tab = C.stats(S.data).inbox ? 'inbox' : S.tab;
      render();
      return true;
    },
    nowPlaying: function (track) {
      S.nowPlaying = track && C.parseVideo(track.url) ? track : null;
      if (S.mode === 'library' && S.tab === 'inbox' && !S.sheet && !S.triage) render();
    },
    back: function () {
      if (S.mode === 'hidden') return false;
      if (S.sheet) { closeSheet(); return true; }
      if (S.triage) { S.triage = null; render(); return true; }
      if (S.selecting) { clearSelection(); render(); return true; }
      if (S.cat) { S.cat = null; render(); return true; }
      close();
      return true;
    },
    // 테스트/디버그용
    _state: function () { return S; }
  };
  Object.defineProperty(window, '__bglib', { value: api });

  function close() {
    S.mode = 'hidden';
    S.sheet = null;
    S.triage = null;
    clearSelection();
    render();
    post({ type: 'close' });
  }

  // ================================================================== 분류 시트

  /**
   * items: 대상 곡들. track: 아직 저장 안 된 곡이면 네이티브 재생 정보.
   * 한 곡이면 현재 소속/태그를 미리 선택(= 소속 편집). 여러 곡이면 추가만.
   */
  function openSaveSheet(items, track, fromTopBar) {
    var single = items.length === 1;
    var existing = single ? S.data.items[items[0].videoId] : null;
    var picked = {};
    var tags = [];
    if (existing) {
      C.categoryIdsOf(S.data, existing.videoId).forEach(function (id) { picked[id] = true; });
      tags = existing.tags.slice();
    }
    S.sheet = {
      kind: 'save', items: items, track: track || null, single: single, existing: !!existing,
      fromTopBar: !!fromTopBar, picked: picked, tags: tags, newCat: false, newEmoji: '🎵'
    };
  }

  function sheetSave() {
    var sh = S.sheet;
    var catIds = Object.keys(sh.picked).filter(function (k) { return sh.picked[k]; });
    var names = catIds.map(function (id) { var c = C.findCategory(S.data, id); return c ? c.emoji + ' ' + c.name : ''; });
    mutate(function () {
      if (sh.track && !S.data.items[sh.items[0].videoId]) C.saveClassified(S.data, sh.track, { categoryIds: [], tags: [] });
      var ids = sh.items.map(function (it) { return it.videoId; });
      if (sh.single) C.classify(S.data, ids, { categoryIds: catIds, tags: sh.tags, move: true, replaceTags: true });
      else C.classify(S.data, ids, { categoryIds: catIds, tags: sh.tags });
    }, true);
    var msg = catIds.length ? names.join(', ') + '에 저장했어요' : '임시함에 저장했어요';
    var fromTop = S.mode === 'save';
    S.sheet = null;
    if (!sh.single) clearSelection();
    if (fromTop) {
      post({ type: 'toast', text: msg });
      close();
    } else {
      render();
      toast(msg, '되돌리기', undo);
    }
  }

  function closeSheet() {
    var wasSave = S.sheet && S.sheet.kind === 'save';
    S.sheet = null;
    if (S.mode === 'save' && wasSave) close(); else render();
  }

  // ================================================================== 렌더링

  var lastSheet = null;
  function render() {
    lift(false);
    if (S.mode === 'hidden') { $app.innerHTML = ''; return; }
    var html = '';
    if (S.mode === 'library') html += S.triage ? renderTriage() : renderLibrary();
    // 시트가 새로 열릴 때만 애니메이션 (칩을 누를 때마다 다시 그려도 깜빡이지 않게)
    var anim = S.sheet && S.sheet !== lastSheet ? ' anim' : '';
    lastSheet = S.sheet;
    if (S.sheet) html += '<div class="scrim' + anim + '" data-act="sheet-close"></div><div class="sheet' + anim + '" role="dialog">' + renderSheet() + '</div>';
    $app.innerHTML = html;
    var focus = $app.querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }

  function renderSheet() {
    var sh = S.sheet;
    if (sh.kind === 'save') return renderSaveSheet(sh);
    if (sh.kind === 'menu') {
      return '<div class="grab"></div>' + (sh.title ? '<div class="sub" style="margin-bottom:6px">' + esc(sh.title) + '</div>' : '') +
        sh.items.map(function (m, i) {
          return '<button class="menu-item' + (m.danger ? ' danger' : '') + '" data-act="menu" data-i="' + i + '">' + esc(m.label) + '</button>';
        }).join('');
    }
    if (sh.kind === 'confirm') {
      return '<div class="grab"></div><div class="title" style="margin:8px 0">' + esc(sh.text) + '</div>' +
        (sh.note ? '<div class="note">' + esc(sh.note) + '</div>' : '') +
        '<div class="sheet-actions"><button class="btn" data-act="sheet-close">취소</button>' +
        '<button class="btn primary" data-act="confirm-ok">' + esc(sh.ok || '확인') + '</button></div>';
    }
    if (sh.kind === 'catform') {
      return '<div class="grab"></div><h3>' + (sh.id ? '카테고리 편집' : '새 카테고리') + '</h3>' +
        emojiRow(sh.emoji) +
        '<div class="field"><input id="catname" placeholder="이름 (예: 새벽 감성)" maxlength="30" value="' + esc(sh.name || '') + '" data-autofocus></div>' +
        '<div class="sheet-actions"><button class="btn" data-act="sheet-close">취소</button>' +
        '<button class="btn primary" data-act="catform-ok">' + (sh.id ? '저장' : '만들기') + '</button></div>';
    }
    if (sh.kind === 'import') {
      return '<div class="grab"></div><h3>가져오기</h3><textarea class="import" id="importtext" placeholder="내보낸 JSON 붙여넣기"></textarea>' +
        '<div class="sheet-actions"><button class="btn" data-act="import" data-replace="0">합치기</button>' +
        '<button class="btn" data-act="import" data-replace="1">덮어쓰기</button></div>';
    }
    return '';
  }

  function renderSaveSheet(sh) {
    var head;
    if (sh.single) {
      var it = S.data.items[sh.items[0].videoId] || sh.items[0];
      var where = C.categoryNamesOf(S.data, it.videoId);
      var status = !S.data.items[it.videoId] ? '새 곡' : where.length ? where.join(' · ') + '에 있음' : '임시함에 있음';
      head = '<div class="track"><img class="thumb" src="' + esc(it.thumb) + '" alt=""><div class="meta"><div class="title">' + esc(it.title) +
        '</div><div class="sub">' + esc(it.artist || '') + (it.artist ? ' · ' : '') + status + '</div></div></div>';
    } else {
      head = '<div class="title">' + sh.items.length + '곡을 분류</div><div class="sub">선택한 카테고리에 추가돼요</div>';
    }
    var last = S.data.prefs.lastSelection;
    var hasLast = last.categoryIds.length || last.tags.length;
    var cats = C.categoriesByRecent(S.data).map(function (c) {
      return '<button class="chip' + (sh.picked[c.id] ? ' on' : '') + '" data-act="pick" data-id="' + c.id + '">' + esc(c.emoji) + ' ' + esc(c.name) + '</button>';
    }).join('') + '<button class="chip ghost" data-act="newcat-inline">＋ 새 카테고리</button>';
    var newCat = sh.newCat ? emojiRow(sh.newEmoji) +
      '<div class="field"><input id="newcat" placeholder="새 카테고리 이름" maxlength="30" data-autofocus><button class="btn small primary" data-act="newcat-add">추가</button></div>' : '';
    var tagSet = {};
    sh.tags.forEach(function (t) { tagSet[t] = true; });
    var suggestions = C.allTags(S.data).slice(0, 12).map(function (x) { return x.tag; });
    sh.tags.forEach(function (t) { if (suggestions.indexOf(t) < 0) suggestions.unshift(t); });
    var tagChips = suggestions.map(function (t) {
      return '<button class="chip mini' + (tagSet[t] ? ' on' : '') + '" data-act="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</button>';
    }).join('');
    var n = Object.keys(sh.picked).filter(function (k) { return sh.picked[k]; }).length;
    var label = n ? n + '개 카테고리에 저장' : (sh.single ? '임시함에 저장' : '태그만 저장');
    return '<div class="grab"></div>' + head +
      '<h3><span>카테고리</span>' + (hasLast ? '<button data-act="use-last">지난번처럼</button>' : '') + '</h3>' +
      '<div class="chips">' + cats + '</div>' + newCat +
      '<h3><span>태그</span></h3><div class="chips">' + tagChips + '</div>' +
      '<div class="field"><input id="taginput" placeholder="태그 입력 후 Enter (예: 신남, 밤)" maxlength="30"></div>' +
      '<div class="sheet-actions"><button class="btn" data-act="sheet-close">취소</button>' +
      '<button class="btn primary" data-act="save">' + label + '</button></div>';
  }

  function emojiRow(sel) {
    return '<div class="emoji-row">' + EMOJIS.map(function (e) {
      return '<button class="' + (e === sel ? 'on' : '') + '" data-act="emoji" data-e="' + e + '">' + e + '</button>';
    }).join('') + '</div>';
  }

  // ---------------------------------------------------------------- 보관함

  function renderLibrary() {
    if (S.cat) return renderCategoryDetail();
    var st = C.stats(S.data);
    var top = '<div class="topbar"><button class="icon-btn" data-act="close" aria-label="닫기">✕</button><h2>보관함</h2>' +
      (S.tab !== 'categories' ? '<button class="icon-btn" data-act="select-toggle" aria-label="선택">' + (S.selecting ? '✓' : '☑︎') + '</button>' : '') +
      '<button class="icon-btn" data-act="more" aria-label="더보기">⋯</button></div>' +
      '<div class="tabs">' +
      tabBtn('inbox', '임시함' + (st.inbox ? '<span class="badge">' + st.inbox + '</span>' : '')) +
      tabBtn('categories', '카테고리') +
      tabBtn('all', '전체 ' + st.total) + '</div>';
    var body = S.tab === 'inbox' ? renderInbox() : S.tab === 'categories' ? renderCategories() : renderAll();
    return '<div class="screen">' + top + '<div class="body" id="body">' + body + '</div>' + selectionBar() + '</div>';
  }

  function tabBtn(id, label) {
    return '<button class="' + (S.tab === id ? 'on' : '') + '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
  }

  function renderInbox() {
    var list = C.inbox(S.data);
    var html = '';
    var np = S.nowPlaying && C.parseVideo(S.nowPlaying.url);
    if (np && !S.data.items[np.videoId]) {
      html += '<div class="card banner"><div class="meta"><div class="sub">지금 재생 중</div><div class="title">' + esc(S.nowPlaying.title || np.videoId) +
        '</div></div><button class="btn small" data-act="np-quick">＋ 임시</button><button class="btn small primary" data-act="np-save">분류</button></div>';
    }
    if (!list.length) {
      return html + '<div class="empty"><div class="big">📥</div>임시함이 비었어요<br><span class="note">재생 중에 상단 <b>＋</b> 버튼을 누르면 여기로 바로 저장돼요.<br>나중에 여기서 한 번에 분류하세요.</span></div>';
    }
    html += '<div class="card banner"><div class="meta"><div class="title">분류할 곡 ' + list.length + '개</div><div class="sub">한 곡씩 보면서 탭 한 번으로 분류</div></div>' +
      '<button class="btn small primary" data-act="triage">하나씩 분류</button></div>';
    var quick = C.categoriesByRecent(S.data).slice(0, 4);
    html += list.map(function (it) {
      var chips = S.selecting ? '' : '<div class="quick">' + quick.map(function (c) {
        return '<button class="chip mini" data-act="quick-move" data-id="' + it.videoId + '" data-cat="' + c.id + '">' + esc(c.emoji) + ' ' + esc(c.name) + '</button>';
      }).join('') + '<button class="chip mini ghost" data-act="classify-one" data-id="' + it.videoId + '">분류…</button></div>';
      return itemRow(it, ago(it.addedAt), chips);
    }).join('');
    return html;
  }

  function renderCategories() {
    var html = C.categoriesByRecent(S.data).map(function (c) {
      return '<div class="cat-row"><div class="emoji">' + esc(c.emoji) + '</div><div class="meta" data-act="open-cat" data-cat="' + c.id + '"><div class="title">' + esc(c.name) +
        '</div><div class="sub">' + c.items.length + '곡</div></div>' +
        (c.items.length ? '<button class="icon-btn" data-act="play-cat" data-cat="' + c.id + '" aria-label="전체 재생">▶</button>' : '') + '</div>';
    }).join('');
    return html + '<div class="cat-row"><div class="emoji">＋</div><div class="meta" data-act="newcat"><div class="title">새 카테고리</div><div class="sub">운동, 집중, 드라이브처럼 상황별로 나눠 보세요</div></div></div>';
  }

  function renderAll() {
    var html = '<input class="search" id="search" type="search" placeholder="제목 · 아티스트 · 태그 검색" value="' + esc(S.q) + '">' + tagFilter(C.allTags(S.data));
    return html + '<div id="list">' + allList() + '</div>';
  }

  function allList() {
    var list = C.filter(C.allItems(S.data), S.q, S.tag);
    if (!list.length) return '<div class="empty">' + (S.q || S.tag ? '찾는 곡이 없어요' : '아직 저장한 곡이 없어요') + '</div>';
    return list.map(function (it) {
      var where = C.categoryNamesOf(S.data, it.videoId);
      return itemRow(it, where.length ? where.join(' · ') : '임시함', '');
    }).join('');
  }

  function tagFilter(tags) {
    if (!tags.length) return '';
    return '<div class="chips filter">' + tags.slice(0, 30).map(function (x) {
      return '<button class="chip mini' + (S.tag === x.tag ? ' on' : '') + '" data-act="tag-filter" data-tag="' + esc(x.tag) + '">#' + esc(x.tag) + ' <span class="count">' + x.count + '</span></button>';
    }).join('') + '</div>';
  }

  function renderCategoryDetail() {
    var c = C.findCategory(S.data, S.cat);
    if (!c) { S.cat = null; return renderLibrary(); }
    var all = C.itemsOf(S.data, c.id);
    var tagCount = {};
    all.forEach(function (it) { it.tags.forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
    var tags = Object.keys(tagCount).map(function (t) { return { tag: t, count: tagCount[t] }; }).sort(function (a, b) { return b.count - a.count; });
    var list = C.filter(all, '', S.tag);
    var top = '<div class="topbar"><button class="icon-btn" data-act="cat-back" aria-label="뒤로">←</button><h2>' + esc(c.emoji) + ' ' + esc(c.name) +
      ' <span class="sub">' + all.length + '곡</span></h2><button class="icon-btn" data-act="select-toggle" aria-label="선택">' + (S.selecting ? '✓' : '☑︎') + '</button>' +
      '<button class="icon-btn" data-act="cat-menu" aria-label="편집">⋯</button></div>';
    var body = all.length ? '<div class="actions-row"><button class="btn small primary" data-act="play-list">▶ 전체 재생</button>' +
      '<button class="btn small" data-act="play-list" data-shuffle="1">🔀 셔플</button>' +
      '<button class="btn small" data-act="yt-playlist">YouTube 재생목록으로</button></div>' + tagFilter(tags) +
      list.map(function (it, i) { return itemRow(it, (it.artist || ''), '', i); }).join('')
      : '<div class="empty"><div class="big">' + esc(c.emoji) + '</div>아직 곡이 없어요<br><span class="note">임시함에서 이 카테고리로 옮기거나, 재생 중에 상단 분류 버튼으로 바로 넣으세요.</span></div>';
    return '<div class="screen">' + top + '<div class="body">' + body + '</div>' + selectionBar() + '</div>';
  }

  function itemRow(it, sub, extra, index) {
    var sel = !!S.selected[it.videoId];
    return '<div class="row' + (sel ? ' sel' : '') + '" data-row="' + it.videoId + '"' + (index != null ? ' data-index="' + index + '"' : '') + '>' +
      '<div class="track">' + (S.selecting ? '<div class="check"></div>' : '') +
      '<img class="thumb" src="' + esc(it.thumb) + '" alt="" loading="lazy" data-act="row-tap" data-id="' + it.videoId + '">' +
      '<div class="meta" data-act="row-tap" data-id="' + it.videoId + '"><div class="title">' + esc(it.title) + '</div><div class="sub">' +
      esc((it.artist && sub !== it.artist ? it.artist + ' · ' : '') + sub) + '</div>' +
      (it.tags.length ? '<div class="tags">' + it.tags.map(function (t) { return '#' + esc(t); }).join(' ') + '</div>' : '') + '</div>' +
      (S.selecting ? '' : '<button class="icon-btn" data-act="item-menu" data-id="' + it.videoId + '" aria-label="메뉴">⋯</button>') +
      '</div>' + (extra || '') + '</div>';
  }

  function selectionBar() {
    if (!S.selecting) return '';
    var n = Object.keys(S.selected).length;
    lift(true);
    return '<div class="bottombar"><span class="grow">' + n + '개 선택</span>' +
      '<button class="btn small primary" data-act="sel-classify"' + (n ? '' : ' disabled') + '>분류</button>' +
      (S.cat ? '<button class="btn small" data-act="sel-remove"' + (n ? '' : ' disabled') + '>빼기</button>' : '') +
      '<button class="btn small" data-act="sel-delete"' + (n ? '' : ' disabled') + '>삭제</button></div>';
  }

  // ---------------------------------------------------------------- 하나씩 분류

  function startTriage() {
    var ids = C.inbox(S.data).map(function (it) { return it.videoId; });
    if (!ids.length) return;
    S.triage = { ids: ids, pos: 0, multi: false, picked: {}, tags: [], done: false };
    render();
  }

  function triageCurrent() {
    var t = S.triage;
    while (t.pos < t.ids.length) {
      var it = S.data.items[t.ids[t.pos]];
      if (it && C.categoryIdsOf(S.data, it.videoId).length === 0) return it;
      t.pos++; // 이미 지워졌거나 다른 경로로 분류된 곡은 건너뜀
    }
    return null;
  }

  function renderTriage() {
    var t = S.triage;
    var it = triageCurrent();
    var total = t.ids.length;
    var head = '<div class="topbar"><button class="icon-btn" data-act="triage-exit" aria-label="닫기">✕</button><h2>분류하기 ' +
      Math.min(t.pos + 1, total) + ' / ' + total + '</h2>' + (S.undo ? '<button class="btn small" data-act="undo">↶ 되돌리기</button>' : '') + '</div>' +
      '<div class="progress"><div style="width:' + Math.round(100 * Math.min(t.pos, total) / total) + '%"></div></div>';
    if (!it) {
      return '<div class="screen">' + head + '<div class="empty"><div class="big">🎉</div>모두 분류했어요<br><br>' +
        '<button class="btn primary" data-act="triage-exit">보관함으로</button></div></div>';
    }
    var tagSet = {};
    t.tags.forEach(function (x) { tagSet[x] = true; });
    var tagChips = C.allTags(S.data).slice(0, 10).map(function (x) {
      return '<button class="chip mini' + (tagSet[x.tag] ? ' on' : '') + '" data-act="t-tag" data-tag="' + esc(x.tag) + '">#' + esc(x.tag) + '</button>';
    }).join('');
    var cats = C.categoriesByRecent(S.data).map(function (c) {
      return '<button class="cat-btn' + (t.picked[c.id] ? ' on' : '') + '" data-act="t-cat" data-cat="' + c.id + '"><span class="e">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>';
    }).join('') + '<button class="cat-btn ghost" data-act="newcat" data-triage="1"><span class="e">＋</span>새 카테고리</button>';
    var nPicked = Object.keys(t.picked).length;
    lift(true);
    return '<div class="screen">' + head + '<div class="triage">' +
      '<img class="hero" src="' + esc(it.thumb) + '" alt="">' +
      '<div class="t-title">' + esc(it.title) + '</div><div class="sub">' + esc(it.artist || '') + (it.artist ? ' · ' : '') + ago(it.addedAt) + ' 저장</div>' +
      '<div class="actions-row" style="margin-top:10px"><button class="btn small" data-act="t-play">▶ 들어보기</button>' +
      '<button class="btn small" data-act="t-multi">' + (t.multi ? '✓ 여러 개 선택 중' : '여러 개 선택') + '</button></div>' +
      (tagChips ? '<h3 class="note">태그 (함께 붙임)</h3><div class="chips" style="margin-bottom:10px">' + tagChips + '</div>' : '') +
      '<div class="note" style="margin:10px 0 8px">' + (t.multi ? '카테고리를 고르고 확인을 누르세요' : '카테고리를 탭하면 바로 다음 곡으로 넘어가요') + '</div>' +
      '<div class="cat-grid">' + cats + '</div></div>' +
      '<div class="bottombar"><button class="btn small" data-act="t-skip">건너뛰기</button><button class="btn small" data-act="t-delete">삭제</button><span class="grow"></span>' +
      (t.multi ? '<button class="btn small primary" data-act="t-confirm"' + (nPicked ? '' : ' disabled') + '>확인 → 다음</button>' : '') + '</div></div>';
  }

  function triageAssign(catIds) {
    var it = triageCurrent();
    if (!it || !catIds.length) return;
    var t = S.triage;
    var names = catIds.map(function (id) { return C.findCategory(S.data, id).name; });
    mutate(function () { C.classify(S.data, [it.videoId], { categoryIds: catIds, tags: t.tags }); }, true);
    t.pos++;
    t.picked = {};
    render();
    toast('“' + trunc(it.title, 18) + '” → ' + names.join(', '), '되돌리기', undo);
  }

  // ================================================================== 이벤트

  $app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    // 길게 누른 직후 손을 뗄 때 같은 줄에 생기는 클릭 1번만 무시 (선택이 바로 풀리지 않게)
    if (suppress) {
      var row = el.closest('[data-row]');
      var same = row && row.getAttribute('data-row') === suppress.row && Date.now() <= suppress.until;
      suppress = null;
      if (same) return;
    }
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    var cat = el.getAttribute('data-cat');
    var h = handlers[act];
    if (h) h(el, id, cat);
  });

  var handlers = {
    'close': function () { close(); },
    'sheet-close': function () { closeSheet(); },
    'tab': function (el) { S.tab = el.getAttribute('data-tab'); S.tag = null; clearSelection(); render(); },
    'more': function () {
      menu(null, [
        { label: '새 카테고리', run: function () { catForm(null); } },
        { label: '내보내기 (백업)', run: function () {
          post({ type: 'export', json: C.exportJson(S.data), filename: 'bgplay-library-' + new Date().toISOString().slice(0, 10) + '.json' });
        } },
        { label: '가져오기', run: function () { S.sheet = { kind: 'import' }; render(); } }
      ]);
    },
    // ----- 분류 시트
    'pick': function (el, id) { S.sheet.picked[id] = !S.sheet.picked[id]; if (!S.sheet.picked[id]) delete S.sheet.picked[id]; render(); },
    'tag': function (el) { toggleTag(S.sheet.tags, el.getAttribute('data-tag')); render(); },
    'use-last': function () {
      var last = S.data.prefs.lastSelection;
      S.sheet.picked = {};
      last.categoryIds.forEach(function (id) { S.sheet.picked[id] = true; });
      S.sheet.tags = C.normTags(S.sheet.tags.concat(last.tags));
      render();
    },
    'newcat-inline': function () { S.sheet.newCat = !S.sheet.newCat; render(); },
    'emoji': function (el) {
      var e = el.getAttribute('data-e');
      if (S.sheet.kind === 'save') S.sheet.newEmoji = e; else S.sheet.emoji = e;
      var name = document.getElementById(S.sheet.kind === 'save' ? 'newcat' : 'catname');
      var keep = name ? name.value : '';
      render();
      name = document.getElementById(S.sheet.kind === 'save' ? 'newcat' : 'catname');
      if (name) name.value = keep;
    },
    'newcat-add': function () { addInlineCategory(); },
    'save': function () { sheetSave(); },
    'menu': function (el) { var m = S.sheet.items[+el.getAttribute('data-i')]; S.sheet = null; m.run(); if (!S.sheet) render(); },
    'confirm-ok': function () { var fn = S.sheet.run; S.sheet = null; fn(); },
    'catform-ok': function () { submitCatForm(); },
    'import': function (el) {
      var text = document.getElementById('importtext').value;
      var r = C.importJson(JSON.parse(JSON.stringify(S.data)), text, el.getAttribute('data-replace') === '1');
      if (!r.ok) { toast(r.error); return; }
      mutate(function () { S.data = r.data; }, true);
      S.sheet = null;
      render();
      toast(r.added + '곡을 가져왔어요', '되돌리기', undo);
    },
    // ----- 보관함
    'np-quick': function () {
      mutate(function () { C.quickSave(S.data, S.nowPlaying); }, true);
      render();
      toast('임시함에 저장했어요', '되돌리기', undo);
    },
    'np-save': function () { openSaveSheet([C.trackToItem(S.nowPlaying)], S.nowPlaying, false); render(); },
    'triage': function () { startTriage(); },
    'quick-move': function (el, id, cat) {
      var it = S.data.items[id];
      var c = C.findCategory(S.data, cat);
      mutate(function () { C.classify(S.data, [id], { categoryIds: [cat] }); }, true);
      render();
      toast('“' + trunc(it.title, 18) + '” → ' + c.emoji + ' ' + c.name, '되돌리기', undo);
    },
    'classify-one': function (el, id) { openSaveSheet([S.data.items[id]], null, false); render(); },
    'row-tap': function (el, id) {
      if (S.selecting) { toggleSelect(id); return; }
      var row = el.closest('[data-row]');
      if (S.cat && row && row.hasAttribute('data-index')) playList(+row.getAttribute('data-index'), false);
      else playOne(S.data.items[id]);
    },
    'item-menu': function (el, id) { itemMenu(id); },
    'select-toggle': function () { if (S.selecting) clearSelection(); else S.selecting = true; render(); },
    'sel-classify': function () {
      var items = Object.keys(S.selected).map(function (id) { return S.data.items[id]; }).filter(Boolean);
      openSaveSheet(items, null, false);
      render();
    },
    'sel-remove': function () {
      var ids = Object.keys(S.selected);
      mutate(function () { C.removeFromCategory(S.data, S.cat, ids); }, true);
      clearSelection(); render();
      toast(ids.length + '곡을 이 카테고리에서 뺐어요', '되돌리기', undo);
    },
    'sel-delete': function () {
      var ids = Object.keys(S.selected);
      confirmSheet(ids.length + '곡을 보관함에서 삭제할까요?', '모든 카테고리에서 빠집니다.', '삭제', function () {
        mutate(function () { C.deleteItems(S.data, ids); }, true);
        clearSelection(); render();
        toast(ids.length + '곡 삭제', '되돌리기', undo);
      });
    },
    'tag-filter': function (el) { var t = el.getAttribute('data-tag'); S.tag = S.tag === t ? null : t; render(); },
    'open-cat': function (el, id, cat) { S.cat = cat; S.tag = null; clearSelection(); render(); },
    'cat-back': function () { S.cat = null; S.tag = null; clearSelection(); render(); },
    'play-cat': function (el, id, cat) { S.cat = cat; playList(0, false); S.cat = null; },
    'play-list': function (el) { playList(0, el.getAttribute('data-shuffle') === '1'); },
    'yt-playlist': function () {
      var url = C.youtubePlaylistUrl(C.filter(C.itemsOf(S.data, S.cat), '', S.tag));
      if (url) { post({ type: 'play', url: url, title: 'YouTube 재생목록' }); close(); }
    },
    'cat-menu': function () {
      var c = C.findCategory(S.data, S.cat);
      menu(c.emoji + ' ' + c.name, [
        { label: '이름 · 아이콘 바꾸기', run: function () { catForm(c); } },
        { label: '카테고리 삭제', danger: true, run: function () {
          confirmSheet('“' + c.name + '” 카테고리를 삭제할까요?', '곡은 지워지지 않아요. 다른 카테고리에 없는 곡은 임시함으로 돌아갑니다.', '삭제', function () {
            mutate(function () { C.deleteCategory(S.data, c.id); }, true);
            S.cat = null; render();
            toast('카테고리를 삭제했어요', '되돌리기', undo);
          });
        } }
      ]);
    },
    'newcat': function (el) { catForm(null, el.hasAttribute('data-triage')); },
    'undo': function () { undo(); },
    // ----- 하나씩 분류
    'triage-exit': function () { S.triage = null; render(); },
    't-cat': function (el, id, cat) {
      var t = S.triage;
      if (t.multi) { if (t.picked[cat]) delete t.picked[cat]; else t.picked[cat] = true; render(); }
      else triageAssign([cat]);
    },
    't-confirm': function () { triageAssign(Object.keys(S.triage.picked)); },
    't-multi': function () { S.triage.multi = !S.triage.multi; S.triage.picked = {}; render(); },
    't-tag': function (el) { toggleTag(S.triage.tags, el.getAttribute('data-tag')); render(); },
    't-skip': function () { S.triage.pos++; S.triage.picked = {}; render(); },
    't-delete': function () {
      var it = triageCurrent();
      mutate(function () { C.deleteItems(S.data, [it.videoId]); }, true);
      S.triage.pos++;
      render();
      toast('삭제했어요', '되돌리기', undo);
    },
    't-play': function () { var it = triageCurrent(); if (it) post({ type: 'play', url: C.canonicalUrl(it.videoId, it.source), title: it.title, keepOpen: true }); }
  };

  $app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.id === 'taginput') {
      e.preventDefault();
      var tags = e.target.value.split(/[,\s]+/);
      S.sheet.tags = C.normTags(S.sheet.tags.concat(tags));
      render();
      var inp = document.getElementById('taginput');
      if (inp) inp.focus();
    } else if (e.target.id === 'newcat') {
      e.preventDefault(); addInlineCategory();
    } else if (e.target.id === 'catname') {
      e.preventDefault(); submitCatForm();
    }
  });

  $app.addEventListener('input', function (e) {
    if (e.target.id === 'search') {
      S.q = e.target.value;
      var list = document.getElementById('list');
      if (list) list.innerHTML = allList();
    }
  });

  // 길게 눌러 선택 모드
  var pressTimer = null;
  var suppress = null; // {row, until}
  $app.addEventListener('pointerdown', function (e) {
    var row = e.target.closest('[data-row]');
    if (!row || S.selecting || S.sheet || e.target.closest('button')) return;
    pressTimer = setTimeout(function () {
      pressTimer = null;
      S.selecting = true;
      S.selected = {};
      S.selected[row.getAttribute('data-row')] = true;
      suppress = { row: row.getAttribute('data-row'), until: Infinity };
      render();
    }, 450);
  });
  ['pointerup', 'pointercancel', 'pointermove'].forEach(function (t) {
    $app.addEventListener(t, function (e) {
      if (t === 'pointerup' && suppress && suppress.until === Infinity) suppress.until = Date.now() + 400;
      if (t === 'pointermove' && Math.abs(e.movementY || 0) + Math.abs(e.movementX || 0) < 3) return;
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
  });

  // ================================================================== 동작

  function playOne(it) {
    if (!it) return;
    post({ type: 'play', url: C.canonicalUrl(it.videoId, it.source), title: it.title });
    close();
  }

  function playList(index, shuffle) {
    var c = C.findCategory(S.data, S.cat);
    if (!c) return;
    var list = C.filter(C.itemsOf(S.data, c.id), '', S.tag);
    if (!list.length) return;
    var q = C.queueOf(list, index, shuffle);
    post({ type: 'playQueue', name: c.emoji + ' ' + c.name, items: q.items, index: q.index });
    close();
  }

  function itemMenu(id) {
    var it = S.data.items[id];
    var items = [
      { label: '▶ 재생', run: function () { playOne(it); } },
      { label: '분류 · 태그 편집', run: function () { openSaveSheet([it], null, false); render(); } }
    ];
    if (S.cat) {
      var catId = S.cat;
      items.push({ label: '맨 위로', run: function () { mutate(function () { C.moveInCategory(S.data, catId, id, 0); }, true); render(); } });
      items.push({ label: '이 카테고리에서 빼기', run: function () {
        mutate(function () { C.removeFromCategory(S.data, catId, [id]); }, true); render();
        toast('뺐어요', '되돌리기', undo);
      } });
    }
    items.push({ label: '삭제', danger: true, run: function () {
      mutate(function () { C.deleteItems(S.data, [id]); }, true); render();
      toast('삭제했어요', '되돌리기', undo);
    } });
    menu(it.title, items);
  }

  function menu(title, items) { S.sheet = { kind: 'menu', title: title, items: items }; render(); }
  function confirmSheet(text, note, ok, run) { S.sheet = { kind: 'confirm', text: text, note: note, ok: ok, run: run }; render(); }

  function catForm(c, fromTriage) {
    S.sheet = { kind: 'catform', id: c ? c.id : null, name: c ? c.name : '', emoji: c ? c.emoji : '🎵', fromTriage: !!fromTriage };
    render();
  }

  function submitCatForm() {
    var sh = S.sheet;
    var name = (document.getElementById('catname') || {}).value || '';
    if (!name.trim()) { toast('이름을 입력하세요'); return; }
    if (sh.id) {
      mutate(function () { C.updateCategory(S.data, sh.id, { name: name, emoji: sh.emoji }); }, true);
      S.sheet = null; render();
      return;
    }
    var created = mutate(function () { return C.createCategory(S.data, name, sh.emoji); }, true);
    S.sheet = null;
    if (sh.fromTriage && S.triage && created) {
      if (S.triage.multi) { S.triage.picked[created.id] = true; render(); } else triageAssign([created.id]);
      return;
    }
    render();
    toast(created.emoji + ' ' + created.name + ' 만들었어요');
  }

  function addInlineCategory() {
    var inp = document.getElementById('newcat');
    var name = inp ? inp.value : '';
    if (!name.trim()) return;
    var sh = S.sheet;
    var c = mutate(function () { return C.createCategory(S.data, name, sh.newEmoji); }, false);
    sh.picked[c.id] = true;
    sh.newCat = false;
    render();
  }

  function toggleTag(list, t) {
    var i = list.indexOf(t);
    if (i >= 0) list.splice(i, 1); else list.push(t);
  }

  function toggleSelect(id) {
    if (S.selected[id]) delete S.selected[id]; else S.selected[id] = true;
    render();
  }

  function clearSelection() { S.selecting = false; S.selected = {}; }

  // ================================================================== 토스트

  var toastTimer = null;
  function toast(text, actionLabel, action) {
    $toast.innerHTML = '<span>' + esc(text) + '</span>' + (actionLabel ? '<button>' + esc(actionLabel) + '</button>' : '');
    $toast.classList.add('show');
    var b = $toast.querySelector('button');
    if (b) b.onclick = function () { hideToast(); action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  }
  function hideToast() { $toast.classList.remove('show'); }
  function lift(on) { $toast.style.bottom = on ? 'calc(76px + env(safe-area-inset-bottom, 0px))' : ''; }

  // ================================================================== 유틸

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
    var d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  // ================================================================== 시작

  post({ type: 'ready' });
  // 네이티브 없이 브라우저에서 열면(개발용) localStorage 로 시작
  setTimeout(function () {
    if (S.booted) return;
    var saved = null;
    try { saved = localStorage.getItem('bglib'); } catch (e) {}
    if (!window.BgLibNative && !(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bglib)) {
      api.boot(saved);
      if (/[?&]dev=1/.test(location.search)) api.openLibrary();
    }
  }, 300);
})();
