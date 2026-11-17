/* =========================================================================
 * 포케모아 — 실제 지도 엔진 (Leaflet + OpenStreetMap 타일 + Overpass API)
 *
 * · 지도 타일: OpenStreetMap 표준 타일 (실제 도로·건물)
 * · 주변 매장: Overpass API 실시간 조회 (편의점 4사 + 문구·완구·선물)
 * · 실시간 조회가 8초 안에 끝나지 않거나 응답 제한(429/502)이면
 *   내장된 실제 좌표 스냅샷으로 부드럽게 대체하고 배지에 상태를 표기한다.
 * · 재고 상태는 편의점 앱 API 미연동 → 제보·샘플 기반임을 화면에서 밝힌다.
 * ========================================================================= */
window.PokeMoaMap = (function () {
  "use strict";

  var D = window.POKEMOA_DATA;
  var TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자';
  var OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  var LEAFLET_CDN = [
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  ];
  var OVERPASS_TIMEOUT = 8000;   /* 8초 안에 안 오면 내장 좌표로 먼저 표시 */
  var LIVE_WINDOW = 45000;       /* 늦게라도 실시간 응답이 오면 교체 */
  var MAX_MARKERS = 90;
  var MAX_MARKERS_20 = 100;
  var METRO_IDS = ["seoul-gangnam", "seoul-hongdae", "seoul-nowon", "busan-seomyeon"];
  var METRO_RADIUS_M = 12000;   /* 내 위치가 대도시 도심 반경 12km 안이면 도심으로 본다 */

  var st = {
    map: null,
    tiles: null,
    layer: null,
    ring: null,
    meMarker: null,
    markers: {},
    all: [],          /* 현재 중심 기준 조회 결과(반경 밖 포함) */
    visible: [],
    brand: "all",
    radius: 3000,
    regionId: "pohang-north",
    origin: "region",  /* region | geo */
    center: null,
    source: "snapshot",/* live | snapshot */
    fetchedAt: null,
    loading: { tiles: true, data: true },
    selectedId: null,
    seq: 0,
    geoBusy: false,
    lastError: null,
    fetchedRadius: 0,
    snapshotLabel: "",
    pendingLive: false,
    currentReq: null,
    badgeWasSnapshot: false,
    metro: false
  };

  var el = {};

  /* ------------------------------------------------------------- 유틸 */
  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function region(id) {
    for (var i = 0; i < D.regions.length; i++) if (D.regions[i].id === id) return D.regions[i];
    return D.regions[0];
  }

  function meters(a, b) {
    var R = 6371008.8;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180;
    var la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  /* 매장 재고 상태: 편의점 앱 API 미연동 → 결정적(항상 같은) 샘플 제보값 */
  var STATUS = ["in", "check", "check", "none", "in", "check"];
  function sampleStatus(id) {
    return STATUS[hash(id) % STATUS.length];
  }
  function sampleObserved(id) {
    var h = hash(id + "t");
    var hh = String(9 + (h % 3)).padStart(2, "0");
    var mm = String((h >>> 3) % 60).padStart(2, "0");
    return "11-17 " + hh + ":" + mm;
  }

  /* ------------------------------------------------------- 브랜드 분류 */
  var NAME_RULES = [
    ["gs25", /gs\s*25|지에스\s*25/],
    ["seven", /세븐일레븐|7\s*-?\s*eleven|seven\s*eleven/],
    ["emart24", /emart\s*24|이마트\s*24/],
    ["artbox", /artbox|아트박스/]
  ];
  function classify(tags) {
    tags = tags || {};
    var n = [tags.name, tags["name:ko"], tags.brand, tags["brand:ko"], tags.operator]
      .filter(Boolean).join(" ").toLowerCase();
    /* CU는 짧아서 부분 일치하면 오탐이 나므로 토큰 단위로 확인 */
    var tokens = n.split(/[^a-z0-9가-힣]+/);
    if (tokens.indexOf("cu") !== -1) return "cu";
    for (var i = 0; i < NAME_RULES.length; i++) {
      if (NAME_RULES[i][1].test(n)) return NAME_RULES[i][0];
    }
    var shop = tags.shop;
    var hasName = !!(tags.name || tags["name:ko"] || tags.brand || tags["brand:ko"] || tags.operator);
    if (shop === "stationery" || shop === "toys" || shop === "gift") return "stationery";
    /* 이름·브랜드가 없는 매장은 편의점으로 오태그된 경우가 많아 제외 */
    if (shop === "convenience" && hasName) return "other";
    return null;
  }

  function displayName(name, brand) {
    var meta = D.brandMeta[brand] || { label: brand };
    var nm = (name || "").trim();
    if (!nm) return meta.label + " (명칭 미등록)";
    var norm = nm.replace(/\s+/g, "").toLowerCase();
    var base = meta.label.replace(/\s+/g, "").toLowerCase();
    if (norm === base) return meta.label;
    return nm;
  }

  /* --------------------------------------------------- Overpass → 매장 */
  function toStore(o) {
    var id = o.type + "-" + o.id;
    return {
      id: id,
      name: displayName(o.name, o.brand),
      brand: o.brand,
      brandLabel: (D.brandMeta[o.brand] || {}).label || o.brand,
      shop: o.shop,
      lat: o.lat,
      lng: o.lng,
      street: o.street || "",
      distance: 0,
      status: sampleStatus(id),
      observed: sampleObserved(id),
      unit: "낱팩",
      note: "",
      source: o.source
    };
  }

  function prepare(list, center, source) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = toStore(list[i]);
      s.source = source;
      s.distance = meters(center, s);
      s.lat = s.lat;
      out.push(s);
    }
    return out;
  }

  /* ---------------------------------------------------------- 지도 생성 */
  function ensureLeaflet(cb) {
    if (window.L) { cb(true); return; }
    var i = 0;
    (function next() {
      if (i >= LEAFLET_CDN.length) { cb(false); return; }
      var s = document.createElement("script");
      s.src = LEAFLET_CDN[i++];
      s.onload = function () { cb(!!window.L); };
      s.onerror = next;
      document.head.appendChild(s);
    })();
  }

  function buildMap() {
    if (st.map) return;
    var r = region(st.regionId);
    st.map = L.map(el.container, {
      center: [r.lat, r.lng],
      zoom: r.zoom || 15,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false
    });

    st.tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      minZoom: 9,
      attribution: TILE_ATTRIB,
      crossOrigin: true
    });
    st.tiles.on("load", function () {
      st.loading.tiles = false;
      emit("pokemoa:loading", loadingState());
    });
    st.tiles.on("tileerror", function () {
      st.loading.tiles = false;
      emit("pokemoa:loading", loadingState());
    });
    st.tiles.addTo(st.map);

    L.control.zoom({ position: "topright" }).addTo(st.map);
    L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 90 }).addTo(st.map);

    st.layer = L.layerGroup().addTo(st.map);
    st.ring = L.circle([r.lat, r.lng], {
      radius: st.radius,
      color: "#2f6df6",
      weight: 1.5,
      opacity: 0.55,
      dashArray: "6 6",
      fillColor: "#2f6df6",
      fillOpacity: 0.05,
      interactive: false
    }).addTo(st.map);

    st.map.on("moveend", positionCard);
  }

  /* ------------------------------------------------------------- 마커 */
  function pinIcon(s) {
    var b = D.brandMeta[s.brand] || { short: "?", color: "#1b2a4a" };
    var html =
      '<span class="pm-pin status-' + s.status + '" style="--brand:' + b.color + '">' +
      '<span class="pm-pin-dot">' + b.short + "</span>" +
      "</span>";
    return L.divIcon({
      className: "pm-marker status-" + s.status,
      html: html,
      iconSize: [30, 38],
      iconAnchor: [15, 36],
      popupAnchor: [0, -34]
    });
  }

  function brandOrder(b) {
    return ({ gs25: 0, cu: 1, seven: 2, emart24: 3, artbox: 4, stationery: 5, other: 6 })[b] || 9;
  }

  function renderMarkers() {
    st.layer.clearLayers();
    st.markers = {};
    var cap = st.radius >= 20000 ? MAX_MARKERS_20 : MAX_MARKERS;
    var list = st.all.filter(match).slice().sort(function (a, b) {
      return a.distance - b.distance;
    });
    /* 가까운 순으로 상한 적용 (20km는 최대 100곳) */
    if (list.length > cap) list = list.slice(0, cap);
    /* 마커는 브랜드가 고르게 보이도록 브랜드 → 거리 순으로 그린다 */
    list.sort(function (a, b) {
      var d = brandOrder(a.brand) - brandOrder(b.brand);
      return d !== 0 ? d : a.distance - b.distance;
    });
    st.visible = list.map(function (s) { return s; });
    st.visible.sort(function (a, b) { return a.distance - b.distance; });

    st.visible.forEach(function (s) {
      var m = L.marker([s.lat, s.lng], {
        icon: pinIcon(s),
        title: s.name,
        keyboard: true,
        riseOnHover: true
      });
      m.on("click", function () { select(s.id, true); });
      m.addTo(st.layer);
      st.markers[s.id] = m;
    });
    if (st.selectedId && !st.markers[st.selectedId]) closeCard();
    emit("pokemoa:visible", { stores: st.visible });
  }

  function match(s) {
    if (st.brand !== "all" && s.brand !== st.brand) return false;
    if (s.distance > st.radius) return false;
    return true;
  }

  /* --------------------------------------------------------- 정보 카드 */
  function select(id, fromMap) {
    var s = null;
    for (var i = 0; i < st.visible.length; i++) if (st.visible[i].id === id) s = st.visible[i];
    if (!s) return;
    st.selectedId = id;
    Object.keys(st.markers).forEach(function (k) {
      var node = st.markers[k].getElement();
      if (node) node.classList.toggle("is-selected", k === id);
    });
    renderCard(s);
    emit("pokemoa:store-selected", { id: id });
    if (fromMap && window.innerWidth < 980) {
      /* 모바일: 카드가 지도 하단에 고정되므로 지도만 보이도록 스크롤 유지 */
      el.container.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function closeCard() {
    st.selectedId = null;
    if (el.card) el.card.hidden = true;
    emit("pokemoa:store-cleared");
  }

  function statusLabel(s) {
    return s === "in" ? "재고 있음" : s === "check" ? "매장 확인 필요" : "재고 없음";
  }

  function renderCard(s) {
    if (!el.card) return;
    var meta = D.brandMeta[s.brand] || { label: s.brand, color: "#1b2a4a", short: "?" };
    var dist = s.distance < 1000 ? Math.round(s.distance) + "m" : (s.distance / 1000).toFixed(1) + "km";
    var navLink = "https://map.naver.com/p/search/" + encodeURIComponent(s.name);
    el.card.hidden = false;
    el.card.innerHTML =
      '<div class="pm-card-head">' +
      '<span class="pm-card-brand" style="background:' + meta.color + '">' + meta.short + "</span>" +
      '<div class="pm-card-title"><strong>' + s.name + "</strong>" +
      "<span>" + meta.label + (s.street ? " · " + s.street : "") + " · " + dist + "</span></div>" +
      '<button type="button" class="pm-card-close" aria-label="닫기">×</button>' +
      "</div>" +
      '<div class="pm-card-meta">' +
      '<span class="status-badge ' + s.status + '">' + statusLabel(s.status) + "</span>" +
      '<span class="chip chip-sample">샘플 재고</span>' +
      '<span class="chip">' + s.observed + "</span>" +
      "</div>" +
      '<p class="pm-card-note">매장 위치는 OpenStreetMap 실제 데이터입니다. 재고 상태는 편의점 앱 API 미연동으로 <b>제보·샘플 기반</b> 표시이니, 방문 전 공식 앱이나 매장 전화로 확인하세요.</p>' +
      '<a class="btn btn-sm btn-dark pm-card-link" target="_blank" rel="noopener" href="' + navLink + '">네이버 지도에서 보기</a>';
    el.card.querySelector(".pm-card-close").addEventListener("click", function (e) {
      e.stopPropagation();
      closeCard();
    });
    positionCard();
  }

  function positionCard() { /* 카드형 팝업은 CSS로 위치 고정 */ }

  /* ------------------------------------------------------- 상태 표기 */
  function loadingState() {
    var msg, phase, progress;
    if (st.loading.tiles) {
      phase = "tiles";
      msg = "실제 지도 타일을 불러오는 중...";
      progress = 34;
    } else if (st.loading.data) {
      phase = "data";
      msg = "주변 매장 위치를 조회하는 중... (Overpass API)";
      progress = 72;
    } else {
      phase = "done";
      msg = "불러오기 완료";
      progress = 100;
    }
    return {
      active: st.loading.tiles || st.loading.data,
      phase: phase,
      message: msg,
      progress: progress
    };
  }

  function pushLoading() {
    emit("pokemoa:loading", loadingState());
  }

  function badge() {
    if (st.geoBusy) {
      return { kind: "busy", text: "내 위치 확인 중 · 브라우저 위치 권한을 허용해 주세요", action: false };
    }
    if (st.loading.data) {
      return { kind: "busy", text: "OpenStreetMap에 주변 매장을 조회하는 중입니다 (최대 8초, 지연 시 내장 좌표로 표시)", action: false };
    }
    if (st.source === "live") {
      var cap = st.radius >= 20000 ? MAX_MARKERS_20 : MAX_MARKERS;
      var txt = st.all.length > cap
        ? "실시간 조회 · 주변 매장 " + st.all.length + "곳 중 가까운 " + cap + "곳 표시 (Overpass API)"
        : "실시간 조회 · OpenStreetMap 주변 매장 " + st.all.length + "곳 (Overpass API)";
      return { kind: "live", text: txt, action: false };
    }
    return {
      kind: "snapshot",
      text: (st.pendingLive
        ? "실시간 조회가 느려 내장 실제 좌표로 먼저 표시 (조금 더 기다리는 중 · " + st.snapshotLabel + ")"
        : "실시간 조회 지연/제한 → 내장 실제 좌표 스냅샷 사용 (" + st.snapshotLabel + ")"),
      action: true
    };
  }

  function pushData() {
    st.snapshotLabel = (D.osmSnapshot && D.osmSnapshot.fetchedAt) || "";
    emit("pokemoa:data", {
      stores: st.visible,
      loading: st.loading.data || st.loading.tiles,
      source: st.source,
      badge: badge(),
      regionId: st.regionId,
      origin: st.origin,
      center: st.center,
      radius: st.radius,
      total: st.all.length,
      allow20: allow20(),
      markerCap: st.radius >= 20000 ? MAX_MARKERS_20 : MAX_MARKERS,
      snapshotAt: (D.osmSnapshot || {}).fetchedAt || "",
      error: st.lastError
    });
  }

  /* --------------------------------------------------- 데이터 조회 */
  function snapshotList() {
    var snap = (D.osmSnapshot && D.osmSnapshot.items) || [];
    if (st.origin === "geo") return snap.slice();
    return snap.filter(function (s) { return s.regionId === st.regionId; });
  }

  function overpassQuery(center, radius) {
    var lat = center.lat.toFixed(5);
    var lng = center.lng.toFixed(5);
    var r = Math.round(radius);
    /* 넓은 반경(20km)은 결과가 수천 건이 될 수 있어 100건 상한을 건다 */
    var out = radius >= 20000 ? "out center 100;" : "out center;";
    return "[out:json][timeout:8];(" +
      'nwr(around:' + r + "," + lat + "," + lng + ')[shop=convenience];' +
      'nwr(around:' + r + "," + lat + "," + lng + ')[shop=stationery];' +
      'nwr(around:' + r + "," + lat + "," + lng + ')[shop=toys];' +
      'nwr(around:' + r + "," + lat + "," + lng + ')[shop=gift];' +
      ");" + out;
  }

  function fetchOverpass(center, radius) {
    var q = overpassQuery(center, radius);
    var controllers = [];
    var hardTimer = null;
    var pending = OVERPASS_ENDPOINTS.length;

    var promise = new Promise(function (resolve, reject) {
      var settled = false;
      function cleanup() {
        clearTimeout(hardTimer);
        controllers.forEach(function (c) { try { c.abort(); } catch (e) {} });
      }
      function done(payload) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      }
      function fail(err) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      }
      OVERPASS_ENDPOINTS.forEach(function (ep) {
        var ctrl = new AbortController();
        controllers.push(ctrl);
        fetch(ep + "?data=" + encodeURIComponent(q), {
          signal: ctrl.signal,
          mode: "cors",
          cache: "no-store"
        }).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        }).then(done, function (err) {
          pending -= 1;
          if (pending === 0) fail(err || new Error("network"));
        });
      });
      /* 8초(OVERPASS_TIMEOUT)는 화면 표시용 소프트 한도이고,
         요청 자체는 LIVE_WINDOW 동안 살려 두어 늦게라도 도착하면 실시간 값으로 바꾼다. */
      hardTimer = setTimeout(function () { fail(new Error("timeout")); }, LIVE_WINDOW);
    });

    return {
      promise: promise,
      abort: function () {
        controllers.forEach(function (c) { try { c.abort(); } catch (e) {} });
      }
    };
  }

  function parseOverpass(payload) {
    var els = (payload && payload.elements) || [];
    var out = [];
    var seen = {};
    els.forEach(function (e) {
      var t = e.tags || {};
      var lat = e.lat != null ? e.lat : (e.center && e.center.lat);
      var lng = e.lon != null ? e.lon : (e.center && e.center.lon);
      if (lat == null || lng == null) return;
      var b = classify(t);
      if (!b) return;
      var id = e.type + "-" + e.id;
      if (seen[id]) return;
      seen[id] = 1;
      out.push({
        id: id,
        type: e.type,
        osmId: e.id,
        name: t.name || t["name:ko"] || "",
        brand: b,
        shop: t.shop,
        lat: lat,
        lng: lng,
        street: t["addr:street"] || ""
      });
    });
    return out;
  }

  function load() {
    var seq = ++st.seq;
    st.loading.data = true;
    st.lastError = null;
    st.pendingLive = false;
    if (st.currentReq) {
      try { st.currentReq.abort(); } catch (e) {}
      st.currentReq = null;
    }
    pushLoading();
    pushData();

    var center = st.center;
    var radius = st.radius;
    st.fetchedRadius = radius;
    var req = fetchOverpass(center, radius);
    st.currentReq = req;

    var softTimer = setTimeout(function () {
      if (seq !== st.seq) return;
      if (st.source === "live") return;
      st.pendingLive = true;
      applySnapshot(seq, "timeout");
    }, OVERPASS_TIMEOUT);

    req.promise.then(function (payload) {
      clearTimeout(softTimer);
      if (seq !== st.seq) return;
      st.currentReq = null;
      var rows = parseOverpass(payload);
      st.all = prepare(rows, center, "live");
      st.source = "live";
      st.lastError = null;
      st.pendingLive = false;
      st.loading.data = false;
      finishLoad(seq, true);
    }).catch(function (err) {
      clearTimeout(softTimer);
      if (seq !== st.seq) return;
      st.currentReq = null;
      if (st.source === "live") return;
      applySnapshot(seq, String((err && err.message) || err));
    });
  }

  function applySnapshot(seq, reason) {
    var center = st.center;
    var rows = snapshotList();
    st.all = prepare(rows, center, "snapshot");
    st.source = "snapshot";
    st.lastError = reason;
    st.loading.data = false;
    finishLoad(seq, false);
  }

  function finishLoad(seq, liveNow) {
    if (seq !== st.seq) return;
    renderMarkers();
    pushLoading();
    pushData();
    emit("pokemoa:loaded", {
      source: st.source,
      total: st.all.length,
      allow20: allow20(),
      markerCap: st.radius >= 20000 ? MAX_MARKERS_20 : MAX_MARKERS,
      error: st.lastError,
      late: !!liveNow && st.badgeWasSnapshot
    });
    st.badgeWasSnapshot = st.source === "snapshot";
  }

  /* ---------------------------------------------------------- 공개 API */
  function setView(center, zoom) {
    if (!st.map) return;
    st.map.setView([center.lat, center.lng], zoom || st.map.getZoom(), { animate: true });
    if (st.ring) {
      st.ring.setLatLng([center.lat, center.lng]);
      st.ring.setRadius(st.radius);
    }
  }

  function allow20() { return !st.metro; }

  function setRadius(radius) {
    if (radius > 5000 && !allow20()) radius = 5000;
    var before = st.radius;
    st.radius = radius;
    if (st.ring) st.ring.setRadius(radius);
    /* 20km는 반경 전체가 보이도록 지도를 맞춘다 */
    if (radius >= 20000 && st.map && st.ring) {
      st.map.fitBounds(st.ring.getBounds(), { padding: [18, 18] });
    }
    renderMarkers();
    pushData();
    /* 조회 범위보다 넓어졌으면(스냅샷 포함) 그 반경으로 다시 조회한다 */
    if (radius > st.fetchedRadius && radius !== before) {
      renderMarkers();
      load();
    }
  }

  function setBrand(brand) {
    st.brand = brand;
    renderMarkers();
    pushData();
  }

  function setRegion(id) {
    var r = region(id);
    st.regionId = r.id;
    st.origin = "region";
    st.metro = METRO_IDS.indexOf(r.id) !== -1;
    if (st.metro && st.radius > 5000) st.radius = 5000;
    st.center = { lat: r.lat, lng: r.lng };
    st.fetchedRadius = st.radius;
    st.source = "snapshot";
    st.all = [];
    st.visible = [];
    closeCard();
    if (st.map) {
      st.loading.tiles = false;
      setView(st.center, r.zoom || 15);
      if (st.ring) st.ring.setRadius(st.radius);
    }
    renderMarkers();
    load();
  }

  function locate() {
    if (!navigator.geolocation) {
      emit("pokemoa:geo-error", { message: "이 브라우저는 위치 정보를 지원하지 않습니다. 지역을 선택해 주세요." });
      return;
    }
    st.geoBusy = true;
    pushData();
    emit("pokemoa:geo-start", {});
    navigator.geolocation.getCurrentPosition(function (pos) {
      st.geoBusy = false;
      st.origin = "geo";
      st.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      st.metro = METRO_IDS.some(function (id) {
        var m = region(id);
        return meters(st.center, { lat: m.lat, lng: m.lng }) < METRO_RADIUS_M;
      });
      if (st.metro && st.radius > 5000) st.radius = 5000;
      st.fetchedRadius = st.radius;
      st.regionId = "";
      if (st.map) {
        st.loading.tiles = false;
        setView(st.center, 15);
        if (st.meMarker) st.map.removeLayer(st.meMarker);
        st.meMarker = L.circleMarker([st.center.lat, st.center.lng], {
          radius: 7, color: "#ffffff", weight: 3, fillColor: "#2f6df6", fillOpacity: 1
        }).addTo(st.map).bindTooltip("내 위치");
      }
      emit("pokemoa:geo-done", { lat: st.center.lat, lng: st.center.lng });
      load();
    }, function (err) {
      st.geoBusy = false;
      var msg = "위치를 가져오지 못했습니다.";
      if (err && err.code === 1) msg = "브라우저 위치 권한이 차단되어 있습니다. 주소창의 위치 권한을 허용하거나 아래 지역을 선택해 주세요.";
      else if (err && err.code === 2) msg = "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도하거나 지역을 선택해 주세요.";
      else if (err && err.code === 3) msg = "위치 확인 시간이 초과되었습니다. 다시 시도하거나 지역을 선택해 주세요.";
      pushData();
      emit("pokemoa:geo-error", { message: msg });
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  function retry() {
    load();
  }

  function focusStore(id) {
    var s = null;
    for (var i = 0; i < st.visible.length; i++) if (st.visible[i].id === id) s = st.visible[i];
    if (!s || !st.map) return;
    st.map.flyTo([s.lat, s.lng], Math.max(st.map.getZoom(), 16), { duration: 0.5 });
    select(id, false);
  }

  function init(opts) {
    el.container = opts.container;
    el.card = opts.card;

    ensureLeaflet(function (ok) {
      if (!ok) {
        emit("pokemoa:error", { message: "지도 라이브러리(Leaflet)를 불러오지 못했습니다. 네트워크 확인 후 '다시 조회'를 눌러 주세요." });
        emit("pokemoa:loading", { active: false, phase: "error", message: "지도 라이브러리 로드 실패", progress: 0 });
        return;
      }
      buildMap();
      setRegion(st.regionId);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && st.selectedId) closeCard();
    });

    return API;
  }

  var API = {
    init: init,
    setRegion: setRegion,
    setBrand: setBrand,
    setRadius: setRadius,
    locate: locate,
    retry: retry,
    focusStore: focusStore,
    closeCard: closeCard,
    getState: function () { return st; },
    getVisible: function () { return st.visible.slice(); },
    invalidate: function () { if (st.map) st.map.invalidateSize(); }
  };
  return API;
})();
