/*
 * BgPlay 보관함 데이터 로직 (UI·플랫폼 무관, 순수 함수 위주).
 * Android/iOS 의 보관함 WebView 에서 쓰고, Node 에서 단위 테스트한다.
 *
 * 모델
 *   items      : { [videoId]: Item }               — 저장된 곡 (영상 ID로 중복 제거)
 *   categories : Category[]                        — 플레이리스트 = 카테고리. 순서 있는 videoId 목록을 가진다
 *   임시함     : 어떤 카테고리에도 속하지 않은 곡 (따로 저장하지 않고 계산)
 *
 *   Item     = { videoId, source:'youtube'|'music', title, artist, thumb, duration, addedAt, tags:[] }
 *   Category = { id, name, emoji, createdAt, lastUsedAt, items:[videoId] }
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BgLibCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var DEFAULT_CATEGORIES = [
    { name: '즐겨찾기', emoji: '⭐' },
    { name: '운동', emoji: '🏃' },
    { name: '집중', emoji: '📚' },
    { name: '드라이브', emoji: '🚗' }
  ];

  // ------------------------------------------------------------------ 생성 / 검증

  function empty(now) {
    now = now || Date.now();
    return {
      v: VERSION,
      items: {},
      categories: DEFAULT_CATEGORIES.map(function (c, i) {
        return { id: 'c_default_' + i, name: c.name, emoji: c.emoji, createdAt: now, lastUsedAt: 0, items: [] };
      }),
      prefs: { lastSelection: { categoryIds: [], tags: [] } }
    };
  }

  /** 저장된 JSON(문자열/객체)을 읽어 형식을 맞춘다. 깨졌으면 빈 보관함. */
  function load(input, now) {
    var d = input;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (e) { d = null; }
    }
    if (!d || typeof d !== 'object' || typeof d.items !== 'object' || !Array.isArray(d.categories)) return empty(now);
    var out = { v: VERSION, items: {}, categories: [], prefs: { lastSelection: { categoryIds: [], tags: [] } } };
    Object.keys(d.items).forEach(function (k) {
      var it = d.items[k];
      if (!it || !isVideoId(it.videoId)) return;
      out.items[it.videoId] = {
        videoId: it.videoId,
        source: it.source === 'music' ? 'music' : 'youtube',
        title: str(it.title) || it.videoId,
        artist: str(it.artist),
        thumb: str(it.thumb) || thumbUrl(it.videoId),
        duration: typeof it.duration === 'number' && isFinite(it.duration) ? it.duration : null,
        addedAt: typeof it.addedAt === 'number' ? it.addedAt : 0,
        tags: normTags(it.tags)
      };
    });
    var seen = {};
    d.categories.forEach(function (c) {
      if (!c || typeof c.id !== 'string' || seen[c.id] || !str(c.name)) return;
      seen[c.id] = true;
      var ids = [];
      (Array.isArray(c.items) ? c.items : []).forEach(function (id) {
        if (out.items[id] && ids.indexOf(id) < 0) ids.push(id);
      });
      out.categories.push({
        id: c.id, name: str(c.name), emoji: str(c.emoji) || '🎵',
        createdAt: c.createdAt || 0, lastUsedAt: c.lastUsedAt || 0, items: ids
      });
    });
    var ls = d.prefs && d.prefs.lastSelection;
    if (ls) {
      out.prefs.lastSelection = {
        categoryIds: (ls.categoryIds || []).filter(function (id) { return !!seen[id]; }),
        tags: normTags(ls.tags)
      };
    }
    return out;
  }

  // ------------------------------------------------------------------ URL

  var ID_RE = /^[A-Za-z0-9_-]{11}$/;
  function isVideoId(s) { return typeof s === 'string' && ID_RE.test(s); }

  /** YouTube / YouTube Music URL 에서 영상 ID 와 출처를 뽑는다. */
  function parseVideo(url) {
    if (typeof url !== 'string') return null;
    var m = /^https?:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(url.trim());
    if (!m) return null;
    var host = m[1].toLowerCase().replace(/:\d+$/, '');
    var path = m[2] || '/';
    var query = m[3] || '';
    var id = null;
    if (host === 'youtu.be') {
      id = path.split('/')[1];
    } else if (host === 'youtube.com' || /\.youtube\.com$/.test(host) || host === 'youtube-nocookie.com' || /\.youtube-nocookie\.com$/.test(host)) {
      var v = /[?&]v=([^&]+)/.exec(query);
      if (v) id = decodeURIComponent(v[1]);
      else {
        var p = /^\/(?:shorts|live|embed|v)\/([^/]+)/.exec(path);
        if (p) id = p[1];
      }
    } else {
      return null;
    }
    if (!isVideoId(id)) return null;
    return { videoId: id, source: host === 'music.youtube.com' ? 'music' : 'youtube' };
  }

  function canonicalUrl(videoId, source) {
    return (source === 'music' ? 'https://music.youtube.com/watch?v=' : 'https://m.youtube.com/watch?v=') + videoId;
  }

  function thumbUrl(videoId) { return 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'; }

  // ------------------------------------------------------------------ 저장

  /** 네이티브가 넘긴 재생 정보 {url,title,artist,artwork,duration} -> Item (없으면 null). */
  function trackToItem(track, now) {
    if (!track) return null;
    var p = parseVideo(track.url) || (isVideoId(track.videoId) ? { videoId: track.videoId, source: track.source === 'music' ? 'music' : 'youtube' } : null);
    if (!p) return null;
    var art = str(track.artwork);
    return {
      videoId: p.videoId,
      source: p.source,
      title: cleanTitle(str(track.title)) || p.videoId,
      artist: str(track.artist),
      thumb: art && /^https:\/\//.test(art) ? art : thumbUrl(p.videoId),
      duration: typeof track.duration === 'number' && isFinite(track.duration) && track.duration > 0 ? Math.round(track.duration) : null,
      addedAt: now || Date.now(),
      tags: []
    };
  }

  function cleanTitle(t) { return t ? t.replace(/\s*-\s*YouTube( Music)?\s*$/, '').trim() : t; }

  /**
   * 상단 "임시 저장" 버튼: 결정 없이 한 번에 저장.
   * 이미 있으면 아무것도 바꾸지 않고 어디에 있는지 알려준다.
   * @returns {{status:'added'|'duplicate'|'invalid', item?, where?:string[]}}
   */
  function quickSave(d, track, now) {
    var item = trackToItem(track, now);
    if (!item) return { status: 'invalid' };
    var existing = d.items[item.videoId];
    if (existing) {
      refreshMeta(existing, item);
      return { status: 'duplicate', item: existing, where: categoryNamesOf(d, existing.videoId) };
    }
    d.items[item.videoId] = item;
    return { status: 'added', item: item, where: [] };
  }

  /**
   * "분류 저장": 고른 카테고리에 넣고 태그를 붙인다. 없던 곡이면 새로 저장.
   * 카테고리를 하나도 고르지 않으면 임시함에 남는다.
   */
  function saveClassified(d, track, sel, now) {
    now = now || Date.now();
    var item = trackToItem(track, now);
    if (!item) return { status: 'invalid' };
    var existing = d.items[item.videoId];
    if (existing) refreshMeta(existing, item);
    else d.items[item.videoId] = item;
    var target = existing || item;
    classify(d, [target.videoId], sel, now);
    return { status: existing ? 'updated' : 'added', item: target, where: categoryNamesOf(d, target.videoId) };
  }

  /** 제목이 videoId 같은 임시값이었다면 더 좋은 메타데이터로 갱신. */
  function refreshMeta(existing, fresh) {
    if ((!existing.title || existing.title === existing.videoId) && fresh.title !== fresh.videoId) existing.title = fresh.title;
    if (!existing.artist && fresh.artist) existing.artist = fresh.artist;
    if (!existing.duration && fresh.duration) existing.duration = fresh.duration;
  }

  // ------------------------------------------------------------------ 분류

  /**
   * 여러 곡을 카테고리에 넣고(추가 방식 — 기존 소속은 유지) 태그를 더한다.
   * sel = { categoryIds:[], tags:[], replaceTags?:bool, move?:bool (true면 다른 카테고리에서는 뺌) }
   */
  function classify(d, ids, sel, now) {
    now = now || Date.now();
    sel = sel || {};
    var catIds = (sel.categoryIds || []).filter(function (id) { return !!findCategory(d, id); });
    var tags = normTags(sel.tags);
    ids.forEach(function (vid) {
      var it = d.items[vid];
      if (!it) return;
      if (sel.move) {
        d.categories.forEach(function (c) {
          if (catIds.indexOf(c.id) < 0) removeId(c.items, vid);
        });
      }
      catIds.forEach(function (cid) {
        var c = findCategory(d, cid);
        if (c.items.indexOf(vid) < 0) c.items.push(vid);
      });
      it.tags = sel.replaceTags ? tags : mergeTags(it.tags, tags);
    });
    catIds.forEach(function (cid) { findCategory(d, cid).lastUsedAt = now; });
    if (catIds.length || tags.length) d.prefs.lastSelection = { categoryIds: catIds.slice(), tags: tags.slice() };
    return d;
  }

  function removeFromCategory(d, catId, ids) {
    var c = findCategory(d, catId);
    if (!c) return d;
    ids.forEach(function (vid) { removeId(c.items, vid); });
    return d;
  }

  function deleteItems(d, ids) {
    ids.forEach(function (vid) {
      delete d.items[vid];
      d.categories.forEach(function (c) { removeId(c.items, vid); });
    });
    return d;
  }

  function setTags(d, vid, tags) {
    if (d.items[vid]) d.items[vid].tags = normTags(tags);
    return d;
  }

  /** 카테고리 안에서 순서 이동. */
  function moveInCategory(d, catId, vid, toIndex) {
    var c = findCategory(d, catId);
    if (!c) return d;
    var i = c.items.indexOf(vid);
    if (i < 0) return d;
    c.items.splice(i, 1);
    toIndex = Math.max(0, Math.min(c.items.length, toIndex));
    c.items.splice(toIndex, 0, vid);
    return d;
  }

  // ------------------------------------------------------------------ 카테고리

  /** 같은 이름(대소문자·공백 무시)이 있으면 그걸 돌려준다. */
  function createCategory(d, name, emoji, now) {
    name = str(name);
    if (!name) return null;
    var key = name.replace(/\s+/g, ' ').toLowerCase();
    for (var i = 0; i < d.categories.length; i++) {
      if (d.categories[i].name.replace(/\s+/g, ' ').toLowerCase() === key) return d.categories[i];
    }
    now = now || Date.now();
    var c = { id: 'c_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6), name: name, emoji: str(emoji) || '🎵', createdAt: now, lastUsedAt: now, items: [] };
    d.categories.push(c);
    return c;
  }

  function updateCategory(d, id, patch) {
    var c = findCategory(d, id);
    if (!c) return d;
    if (str(patch.name)) c.name = str(patch.name);
    if (str(patch.emoji)) c.emoji = str(patch.emoji);
    return d;
  }

  /** 카테고리를 지워도 곡은 남는다(다른 데 없으면 임시함으로 돌아감). */
  function deleteCategory(d, id) {
    d.categories = d.categories.filter(function (c) { return c.id !== id; });
    d.prefs.lastSelection.categoryIds = d.prefs.lastSelection.categoryIds.filter(function (x) { return x !== id; });
    return d;
  }

  function findCategory(d, id) {
    for (var i = 0; i < d.categories.length; i++) if (d.categories[i].id === id) return d.categories[i];
    return null;
  }

  /** 최근에 쓴 카테고리 먼저 (MRU), 같으면 만든 순서. */
  function categoriesByRecent(d) {
    return d.categories.map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) { return (b.c.lastUsedAt || 0) - (a.c.lastUsedAt || 0) || a.i - b.i; })
      .map(function (x) { return x.c; });
  }

  // ------------------------------------------------------------------ 조회

  function categoryIdsOf(d, vid) {
    return d.categories.filter(function (c) { return c.items.indexOf(vid) >= 0; }).map(function (c) { return c.id; });
  }

  function categoryNamesOf(d, vid) {
    return d.categories.filter(function (c) { return c.items.indexOf(vid) >= 0; }).map(function (c) { return c.name; });
  }

  /** 임시함: 어느 카테고리에도 없는 곡, 최근 저장 순. */
  function inbox(d) {
    var classified = {};
    d.categories.forEach(function (c) { c.items.forEach(function (id) { classified[id] = true; }); });
    return values(d.items).filter(function (it) { return !classified[it.videoId]; })
      .sort(function (a, b) { return b.addedAt - a.addedAt; });
  }

  function itemsOf(d, catId) {
    var c = findCategory(d, catId);
    return c ? c.items.map(function (id) { return d.items[id]; }).filter(Boolean) : [];
  }

  function allItems(d) {
    return values(d.items).sort(function (a, b) { return b.addedAt - a.addedAt; });
  }

  /** 태그별 개수, 많은 순. */
  function allTags(d) {
    var count = {};
    values(d.items).forEach(function (it) { it.tags.forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
    return Object.keys(count).map(function (t) { return { tag: t, count: count[t] }; })
      .sort(function (a, b) { return b.count - a.count || (a.tag < b.tag ? -1 : 1); });
  }

  /** 목록 필터: 검색어(제목/아티스트/태그) + 태그 */
  function filter(list, q, tag) {
    q = (q || '').trim().toLowerCase();
    return list.filter(function (it) {
      if (tag && it.tags.indexOf(tag) < 0) return false;
      if (!q) return true;
      return (it.title + ' ' + (it.artist || '') + ' ' + it.tags.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function stats(d) {
    return { inbox: inbox(d).length, total: Object.keys(d.items).length, categories: d.categories.length };
  }

  // ------------------------------------------------------------------ 재생 큐

  /** 네이티브에 넘길 재생 큐. shuffle 이면 섞는다(rand 주입 가능 — 테스트용). */
  function queueOf(list, startIndex, shuffle, rand) {
    var items = list.map(function (it) {
      return { videoId: it.videoId, url: canonicalUrl(it.videoId, it.source), title: it.title };
    });
    var start = Math.max(0, Math.min(items.length - 1, startIndex || 0));
    if (shuffle && items.length > 1) {
      rand = rand || Math.random;
      var first = items.splice(start, 1)[0];
      for (var i = items.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = items[i]; items[i] = items[j]; items[j] = t;
      }
      items.unshift(first);
      start = 0;
    }
    return { items: items, index: start };
  }

  /** YouTube 자체 임시 재생목록 URL (최대 50곡). 비공식 URL — 동작 여부 실기기 확인 필요. */
  function youtubePlaylistUrl(list) {
    var ids = list.slice(0, 50).map(function (it) { return it.videoId; });
    return ids.length ? 'https://m.youtube.com/watch_videos?video_ids=' + ids.join(',') : null;
  }

  // ------------------------------------------------------------------ 백업

  function exportJson(d) {
    return JSON.stringify({ app: 'bgplay', exportedAt: new Date().toISOString(), library: d }, null, 2);
  }

  /** 가져오기: 기본은 합치기(같은 곡은 태그/카테고리 소속을 합침). */
  function importJson(d, text, replace, now) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON 형식이 아닙니다' }; }
    var src = load(parsed && parsed.library ? parsed.library : parsed, now);
    if (!Object.keys(src.items).length && !(parsed && (parsed.library || parsed.items))) return { ok: false, error: 'BgPlay 보관함 파일이 아닙니다' };
    if (replace) return { ok: true, data: src, added: Object.keys(src.items).length };
    var added = 0;
    Object.keys(src.items).forEach(function (id) {
      var it = src.items[id];
      if (!d.items[id]) { d.items[id] = it; added++; } else d.items[id].tags = mergeTags(d.items[id].tags, it.tags);
    });
    src.categories.forEach(function (sc) {
      var c = createCategory(d, sc.name, sc.emoji, now);
      sc.items.forEach(function (id) { if (c.items.indexOf(id) < 0) c.items.push(id); });
    });
    return { ok: true, data: d, added: added };
  }

  // ------------------------------------------------------------------ 유틸

  function str(s) { return typeof s === 'string' ? s.trim() : ''; }
  function values(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  function removeId(arr, id) { var i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); }

  function normTags(tags) {
    var out = [];
    (Array.isArray(tags) ? tags : []).forEach(function (t) {
      t = str(t).replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
      if (t && t.length <= 30 && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  function mergeTags(a, b) { return normTags((a || []).concat(b || [])); }

  return {
    VERSION: VERSION,
    empty: empty, load: load,
    parseVideo: parseVideo, canonicalUrl: canonicalUrl, thumbUrl: thumbUrl, isVideoId: isVideoId,
    trackToItem: trackToItem, quickSave: quickSave, saveClassified: saveClassified,
    classify: classify, removeFromCategory: removeFromCategory, deleteItems: deleteItems,
    setTags: setTags, moveInCategory: moveInCategory,
    createCategory: createCategory, updateCategory: updateCategory, deleteCategory: deleteCategory,
    findCategory: findCategory, categoriesByRecent: categoriesByRecent,
    categoryIdsOf: categoryIdsOf, categoryNamesOf: categoryNamesOf,
    inbox: inbox, itemsOf: itemsOf, allItems: allItems, allTags: allTags, filter: filter, stats: stats,
    queueOf: queueOf, youtubePlaylistUrl: youtubePlaylistUrl,
    exportJson: exportJson, importJson: importJson, normTags: normTags
  };
});
