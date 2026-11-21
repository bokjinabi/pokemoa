/* =========================================================================
   GS25 팜사이즈 원더 피규어 (2026-11-20 출시 · 총 20종 랜덤 · 개당 5,800원)

   · 첫 방문 안내 팝업 — GS25 공식 판매 이미지 + 출시 정보 + ‘바로 재고 찾기’
     (오늘 하루 보지 않기 / 닫기, 닫은 뒤에는 오른쪽 아래 ‘다시 보기’ 버튼)
   · 「동네에서 찾기」 탭의 상품 전환 — 포켓몬 카드 ↔ 팜사이즈 원더 피규어
   · 피규어를 고르면 중계 서버(GS25 상품 지정 조회 /api/gs25?item=)로
     주변 GS25 의 1·2·3탄 실재고를 받아 지도·매장 목록에 그대로 얹습니다.
   · 도감·시세 탭의 세트 검색에서도 이름·키워드로 찾히도록 결과를 덧붙입니다.

   중계 v2.1 의 /api/nearby 는 GS25 상품을 카드 상품만 골라 내므로(피규어는 빠짐)
   피규어는 상품코드로 바로 묻는 /api/gs25 를 씁니다. 그 경로는 조회 반경이
   1km(GS25_RADIUS)이고 17지점 격자가 아니라 지도 중심 한 곳만 봅니다.
   ========================================================================= */
(function () {
  "use strict";

  var D = window.PokeMoaData || {};
  var F = D.figure;
  if (!F) return;

  var POPUP_KEY = "moa:figure:palm-size-until";   /* ‘오늘 하루 보지 않기’ 만료 시각(ms) */
  var RELAY_KEY = "pokemoa.relayUrl";             /* app.js 와 같은 저장 키 */
  var QUERY_TTL = 120000;                         /* 같은 자리 재조회는 2분에 한 번 */

  var state = {
    mode: "card",
    requested: false,     /* ?figure=1 로 열렸는지 */
    popupEl: null,
    reopenEl: null,
    lastFocus: null,
    busy: false,
    lastAt: 0,
    lastKey: "",
    brandBefore: "all",
    sideTitle: ""
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function won(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n || "");
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
  }
  function hhmm(date) {
    var d = date || new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function track(name, params) {
    try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {}
  }

  /* ---------------------------------------------------------- 저장 값 */
  function dismissedUntil() {
    try { return Number(localStorage.getItem(POPUP_KEY)) || 0; } catch (e) { return 0; }
  }
  function dismissToday() {
    var d = new Date();
    d.setHours(24, 0, 0, 0);   /* 오늘 하루 = 자정까지 */
    try { localStorage.setItem(POPUP_KEY, String(d.getTime())); } catch (e) {}
  }
  function relayUrl() {
    var saved = "";
    try { saved = localStorage.getItem(RELAY_KEY) || ""; } catch (e) {}
    var preset = (D.relayPreset && D.relayPreset.url) || "";
    return String(saved || preset || "").replace(/\/+$/, "");
  }

  /* ------------------------------------------------------ 시리즈 목록 채우기 */
  function seriesListHtml(kind) {
    return (F.series || []).map(function (s) {
      var lineup = (s.lineup || []).join(" · ");
      if (kind === "promo") {
        return '<li>' +
          '<img src="' + esc(s.image) + '" alt="팜사이즈 원더 ' + s.no + '탄 상품 이미지" width="40" height="40" loading="lazy">' +
          '<span class="fp-s-no">' + s.no + '탄</span>' +
          '<span class="fp-s-lineup"><b>' + s.count + '종</b> — ' + esc(lineup) + '</span>' +
          '</li>';
      }
      if (kind === "modal") {
        return '<li><img src="' + esc(s.image) + '" alt="" width="30" height="30" loading="lazy">' +
          '<b>' + s.no + '탄</b><span>' + s.count + '종 · ' + esc(lineup) + '</span></li>';
      }
      return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener" title="우리동네GS ' + s.no + '탄 상품 페이지">' +
        '<img src="' + esc(s.image) + '" alt="" width="38" height="38" loading="lazy">' +
        '<span><b>팜사이즈 ' + s.no + '탄 <span class="fs-count">' + s.count + '종</span></b>' +
        '<span>' + esc(lineup) + '</span></span></a></li>';
    }).join("");
  }

  function fillSeries() {
    var strip = $("#figureSeries");
    if (strip) strip.innerHTML = seriesListHtml("strip");
    var promo = $("#figurePromoSeries");
    if (promo) promo.innerHTML = seriesListHtml("promo");
  }

  /* ================================================================ 팝업 */
  function popupHtml() {
    return '' +
      '<div class="fg-modal" role="document">' +
        '<div class="fg-hero">' +
          '<button type="button" class="fg-close" data-fg-close aria-label="안내 팝업 닫기">✕</button>' +
          '<img src="' + esc(F.image) + '" alt="' + esc(F.imageAlt) + '" width="' + (F.imageWidth || 600) + '" height="' + (F.imageHeight || 736) + '">' +
          '<span class="fg-flag">GS25 NEW · 2026.11.20</span>' +
        '</div>' +
        '<div class="fg-body">' +
          '<p class="fg-eyebrow">GS25 신상 · 총 ' + F.totalCount + '종 랜덤</p>' +
          '<h2 id="fgPopupTitle">포켓몬스터 팜사이즈 원더 피규어</h2>' +
          '<p class="fg-desc">' + esc(F.summary) + '</p>' +
          '<ul class="fg-facts">' +
            '<li><span>가격</span><b>' + esc(F.priceLabel) + '</b></li>' +
            '<li><span>출시</span><b>' + esc(F.releaseLabel) + '</b></li>' +
            '<li><span>판매</span><b>전국 GS25</b></li>' +
          '</ul>' +
          '<ul class="fg-series">' + seriesListHtml("modal") + '</ul>' +
          '<div class="fg-actions">' +
            '<button type="button" class="fg-btn-primary" data-fg-stock>바로 재고 찾기</button>' +
            '<a class="fg-btn-ghost" href="' + esc(F.productUrl) + '" target="_blank" rel="noopener">우리동네GS 공식 상품 보기 ↗</a>' +
          '</div>' +
          '<p class="fg-note">' + esc(F.periodNote) + ' 재고는 우리동네GS 앱·매장에서 확인하세요.<br>' + esc(F.sourceNote) + '</p>' +
          '<div class="fg-foot">' +
            '<label><input type="checkbox" data-fg-today> 오늘 하루 보지 않기</label>' +
            '<button type="button" data-fg-close>닫기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openPopup() {
    if (state.popupEl) return;
    var backdrop = document.createElement("div");
    backdrop.className = "fg-backdrop";
    backdrop.id = "fgPopup";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "fgPopupTitle");
    backdrop.innerHTML = popupHtml();
    document.body.appendChild(backdrop);
    document.body.classList.add("no-scroll");
    state.popupEl = backdrop;
    state.lastFocus = document.activeElement;

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) { closePopup(false); return; }
      if (e.target.closest("[data-fg-close]")) {
        var today = $("[data-fg-today]", backdrop);
        closePopup(!!(today && today.checked));
        return;
      }
      if (e.target.closest("[data-fg-stock]")) {
        closePopup(false);
        goStock();
      }
    });
    document.addEventListener("keydown", onKeydown);
    var closeBtn = $(".fg-close", backdrop);
    if (closeBtn) closeBtn.focus();
    track("figure_popup_open", { product: F.id });
    hideReopen();
  }

  function onKeydown(e) {
    if (!state.popupEl) return;
    if (e.key === "Escape") { e.preventDefault(); closePopup(false); return; }
    if (e.key !== "Tab") return;
    var focusables = $$("button, a[href], input", state.popupEl).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closePopup(todayOff) {
    if (!state.popupEl) return;
    if (todayOff) dismissToday();
    state.popupEl.parentNode.removeChild(state.popupEl);
    state.popupEl = null;
    document.removeEventListener("keydown", onKeydown);
    document.body.classList.remove("no-scroll");
    if (state.lastFocus && state.lastFocus.focus) { try { state.lastFocus.focus(); } catch (e) {} }
    state.lastFocus = null;
    showReopen();
    track("figure_popup_close", { today_off: todayOff ? 1 : 0 });
  }

  function showReopen() {
    if (state.reopenEl) { state.reopenEl.hidden = false; return; }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fg-reopen";
    btn.setAttribute("aria-label", "GS25 팜사이즈 원더 피규어 안내 다시 보기");
    btn.innerHTML = '<img src="' + esc(F.series[0].image) + '" alt="" width="30" height="30">' +
      '<span>팜사이즈 원더 안내</span>';
    btn.addEventListener("click", function () { openPopup(); });
    document.body.appendChild(btn);
    state.reopenEl = btn;
  }
  function hideReopen() {
    if (state.reopenEl) state.reopenEl.hidden = true;
  }

  /* ====================================================== 상품 전환 · 재고 */
  function isActive() { return state.mode === "figure"; }

  function setMode(mode, opts) {
    opts = opts || {};
    var next = mode === "figure" ? "figure" : "card";
    if (next === state.mode && !opts.force) {
      if (next === "figure" && opts.scroll) scrollToStrip();
      return;
    }
    if (next === "figure" && state.mode !== "figure") {
      var st0 = mapState();
      state.brandBefore = (st0 && st0.brand) || "all";
    }
    state.mode = next;
    syncButtons();
    var strip = $("#figureStrip");
    if (strip) strip.hidden = next !== "figure";
    setSideTitle(next === "figure");

    if (window.PokeMoaMap) {
      window.PokeMoaMap.clearRelay();
      window.PokeMoaMap.setBrand(next === "figure" ? "gs25" : (state.brandBefore || "all"));
    }
    if (next === "figure") {
      setStatus("주변 GS25 재고를 조회하는 중…", "busy");
      queryStock(true);
      if (opts.scroll) scrollToStrip();
    } else {
      setStatus("");
      var brief = $("#figureStockNote");
      if (brief) { brief.textContent = "주변 GS25 재고를 조회하려면 ‘재고 조회’를 눌러 주세요."; brief.className = "fs-status"; }
      /* 카드 재고를 다시 받는다 — app.js 가 이 이벤트에서 relayRefresh 를 예약한다 */
      document.dispatchEvent(new CustomEvent("pokemoa:loaded", { detail: { source: "figure-exit" } }));
    }
    track("figure_mode", { mode: next });
  }

  function syncButtons() {
    $$("#productPicker [data-product]").forEach(function (b) {
      var on = b.getAttribute("data-product") === state.mode;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function scrollToStrip() {
    var el = $("#figureStrip");
    if (!el || el.hidden) return;
    setTimeout(function () {
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { el.scrollIntoView(); }
    }, 80);
  }

  function setSideTitle(figure) {
    var el = $('[data-copy="mapSideTitle"]') || $(".map-side-head strong");
    if (!el) return;
    if (!state.sideTitle) state.sideTitle = el.textContent;
    el.textContent = figure ? "매장별 피규어 재고" : state.sideTitle;
  }

  function setStatus(html, kind) {
    var el = $("#figureStockNote");
    if (!el) return;
    /* 조회 결과는 <b> 강조를 섞어 쓰고, 바뀌는 값은 호출하는 쪽에서 escape 합니다 */
    el.innerHTML = html || "";
    el.className = "fs-status" + (kind ? " is-" + kind : "");
  }

  function mapState() {
    return (window.PokeMoaMap && window.PokeMoaMap.getState) ? window.PokeMoaMap.getState() : null;
  }

  /* 점포명 비교 — 앱 응답의 매장코드 접두(VNC93 …)와 브랜드 접두를 떼고 비교한다 */
  function normName(name) {
    return String(name || "")
      .trim()
      .replace(/^(gs25|지에스25|이마트24|emart24|세븐일레븐|cu)\s+/i, "")
      .replace(/^[a-z0-9]{4,6}\s+/i, "")
      .replace(/[\s\-_.,()\[\]{}·'"`]/g, "")
      .replace(/(지점|점)$/, "");
  }
  function normAddr(addr) {
    return String(addr || "").split(",")[0].replace(/[\s()]/g, "");
  }

  function findStore(all, name, address) {
    var target = normName(name);
    var addrKey = normAddr(address);
    var byName = null;
    var byAddr = null;
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      if (s.relay || s.brand !== "gs25" || s.offline) continue;
      var n = normName(s.name);
      if (target && n && n === target) return s;
      if (!byName && target && n && (n.indexOf(target) >= 0 || target.indexOf(n) >= 0)) byName = s;
      if (!byAddr && addrKey.length >= 10) {
        var a = normAddr(s.street);
        if (a && (a === addrKey || a.indexOf(addrKey) === 0 || addrKey.indexOf(a) === 0)) byAddr = s;
      }
    }
    return byName || byAddr;
  }

  function queryStock(manual) {
    if (!isActive()) return;
    if (state.busy) return;
    var st = mapState();
    var url = relayUrl();
    if (!st || !st.center) {
      setStatus("지도 매장 정보를 아직 불러오지 못했습니다. 지역을 고른 뒤 ‘재고 조회’를 눌러 주세요.", "error");
      return;
    }
    if (!url) {
      setStatus("실시간 재고 조회 서버에 연결되어 있지 않습니다. 잠시 뒤 다시 시도해 주세요.", "error");
      return;
    }
    var lat = Number(st.center.lat).toFixed(4);
    var lng = Number(st.center.lng).toFixed(4);
    var key = lat + "," + lng;
    if (!manual && state.lastKey === key && Date.now() - state.lastAt < QUERY_TTL) return;

    state.busy = true;
    state.lastKey = key;
    setStatus("주변 GS25 재고를 조회하는 중…", "busy");

    var radius = Math.min(1500, Math.max(300, Math.round(st.radius || 3000)));
    var jobs = (F.series || []).map(function (s) {
      var q = url + "/api/gs25?lat=" + lat + "&lng=" + lng +
        "&item=" + encodeURIComponent(s.code) + "&radius=" + radius;
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 25000);
      return fetch(q, { signal: ctrl.signal, mode: "cors", cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (body) { return { series: s, body: body }; })
        .catch(function (err) { return { series: s, error: err }; })
        .finally(function () { clearTimeout(timer); });
    });

    Promise.all(jobs).then(function (results) {
      var byStore = {};
      var errors = [];
      var notes = [];
      var sessionNeeded = false;
      var anyOk = false;
      results.forEach(function (r) {
        if (r.error) { errors.push((r.error && r.error.message) || String(r.error)); return; }
        var body = r.body || {};
        if (!body.ok) { errors.push("조회 서버 응답 오류"); return; }
        if (body.session && body.session.configured === false) sessionNeeded = true;
        if (body.note && /세션|오류/.test(String(body.note))) notes.push(String(body.note));
        if (Array.isArray(body.stores) && body.stores.length) anyOk = true;
        (body.stores || []).forEach(function (row) {
          if (!row || !row.id) return;
          var rec = byStore[row.id] || (byStore[row.id] = {
            id: row.id, name: row.name || "", address: row.address || "",
            distanceM: Number(row.distanceM) || 0, items: []
          });
          (row.items || []).forEach(function (it) {
            var qty = Number(it && it.qty);
            if (!isFinite(qty)) return;
            rec.items.push({ name: "팜사이즈 " + r.series.no + "탄", code: String(it.code || r.series.code), qty: qty });
          });
        });
      });

      /* 앱 응답 점포 → 지도(카카오) 점포 좌표에 붙인다 */
      var all = (mapState() && mapState().all) || [];
      var payloadStores = [];
      var matched = 0;
      var unmatched = 0;
      var inStock = 0;
      var totalQty = 0;
      Object.keys(byStore).forEach(function (id) {
        var rec = byStore[id];
        var twin = findStore(all, rec.name, rec.address);
        if (!twin) { unmatched += 1; return; }
        matched += 1;
        var sum = rec.items.reduce(function (a, b) { return a + (b.qty || 0); }, 0);
        if (sum > 0) inStock += 1;
        totalQty += sum;
        payloadStores.push({
          brand: "gs25",
          id: rec.id,
          name: twin.name,
          address: twin.street || rec.address,
          lat: twin.lat,
          lng: twin.lng,
          status: sum > 0 ? "in_stock" : "out_of_stock",
          items: rec.items,
          updatedAt: new Date().toISOString()
        });
      });

      var total = payloadStores.length;
      if (window.PokeMoaMap && isActive()) {
        window.PokeMoaMap.applyRelay({
          ok: true,
          generatedAt: new Date().toISOString(),
          keyword: F.short,
          radius: radius,
          sources: {
            gs25: {
              ok: !errors.length,
              count: total,
              products: (F.series || []).length,
              note: "GS25 팜사이즈 원더 " + total + "곳 확인"
            }
          },
          stores: payloadStores
        });
      }

      var now = hhmm();
      var bits = [];
      if (total) {
        bits.push("주변 GS25 <b>" + total + "곳</b> 확인");
        bits.push(inStock ? "<b>" + inStock + "곳</b>에 재고(합계 " + totalQty + "개)" : "재고 있는 곳 없음");
        bits.push(now + " 조회 · 반경 1km");
      } else if (matched === 0 && unmatched > 0) {
        bits.push("조회된 GS25 " + unmatched + "곳을 지도 매장과 연결하지 못했습니다. 장소를 다시 조회해 주세요.");
      } else if (sessionNeeded) {
        bits.push("GS25 로그인 세션이 없어 재고를 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      } else if (errors.length) {
        bits.push("GS25 재고 조회가 지연되고 있습니다. 잠시 뒤 다시 시도해 주세요.");
      } else {
        bits.push("반경 1km 안에 GS25 점포가 없습니다. 반경을 넓히거나 지도를 옮겨 보세요.");
      }
      if (notes.length && !total) bits.push(esc(notes[0]).slice(0, 80));
      setStatus(bits.join(" · "), total ? "" : (errors.length ? "error" : ""));
      state.lastAt = Date.now();
      track("figure_stock", { stores: total, in_stock: inStock, qty: totalQty, errors: errors.length });
    }).finally(function () {
      state.busy = false;
    });
  }

  function goStock() {
    var nav = $('.main-nav [data-tab="map"]') || $('[data-tab="map"]');
    if (nav) nav.click();
    setMode("figure", { scroll: true, force: false });
    scrollToStrip();
    queryStock(true);
  }

  /* ================================================== 도감·시세 세트 검색 */
  function figureSearchCardHtml() {
    return '<article class="set-search-card figure-search-card">' +
      '<div class="fsc-head">' +
        '<img src="' + esc(F.series[0].image) + '" alt="" width="64" height="64" loading="lazy">' +
        '<div><span class="ssc-code">GS25 · ' + esc(F.releaseLabel) + ' · 총 ' + F.totalCount + '종 랜덤</span>' +
        '<h3>' + esc(F.name) + '</h3></div>' +
      '</div>' +
      '<dl class="ssc-grid">' +
        '<div><dt>가격</dt><dd>' + esc(F.priceLabel) + '</dd></div>' +
        '<div><dt>구성</dt><dd>1탄 6종 · 2탄 8종 · 3탄 6종 (총 ' + F.totalCount + '종 랜덤)</dd></div>' +
        '<div><dt>판매</dt><dd>전국 GS25 · 재고 소진 시까지</dd></div>' +
      '</dl>' +
      '<div class="ssc-actions">' +
        '<button type="button" class="btn btn-dark btn-sm" data-figure-stock>지도에서 GS25 재고 찾기</button>' +
        '<a class="btn btn-ghost btn-sm" href="' + esc(F.productUrl) + '" target="_blank" rel="noopener">우리동네GS 공식 상품 ↗</a>' +
      '</div>' +
    '</article>';
  }

  function matchesFigure(raw) {
    var q = String(raw || "").toLowerCase().replace(/\s+/g, "");
    if (q.length < 2) return false;
    var pool = [F.name, F.short, F.english].concat(F.keywords || []);
    for (var i = 0; i < pool.length; i++) {
      var k = String(pool[i] || "").toLowerCase().replace(/\s+/g, "");
      if (!k) continue;
      if (k.indexOf(q) >= 0 || q.indexOf(k) >= 0) return true;
    }
    return false;
  }

  function appendFigureSearch(query) {
    var box = $("#setSearchResult");
    if (!box || !matchesFigure(query)) return;
    if ($(".figure-search-card", box)) return;
    var empty = $(".set-search-empty", box);
    if (empty) box.innerHTML = "";
    box.insertAdjacentHTML("afterbegin", figureSearchCardHtml());
    var btn = $("[data-figure-stock]", box);
    if (btn) btn.addEventListener("click", goStock);
    track("set_search", { figure: 1 });
  }

  /* ============================================================ 초기화 */
  function init() {
    fillSeries();

    var picker = $("#productPicker");
    if (picker) {
      picker.addEventListener("click", function (e) {
        var b = e.target.closest("[data-product]");
        if (!b) return;
        if (b.getAttribute("data-product") === "figure") {
          setMode("figure", { scroll: true, force: true });
        } else {
          setMode("card");
        }
      });
    }
    var qBtn = $("#figureQuery");
    if (qBtn) qBtn.addEventListener("click", function () { queryStock(true); });

    $$("[data-figure-stock]").forEach(function (b) {
      b.addEventListener("click", goStock);
    });
    $$("[data-figure-info]").forEach(function (b) {
      b.addEventListener("click", openPopup);
    });

    /* 지도가 새로 그려질 때마다(지역 변경·내 위치·지도 이동) 피규어 재고도 다시 받는다 */
    document.addEventListener("pokemoa:loaded", function () {
      if (!isActive()) return;
      var st = mapState();
      if (st && st.brand !== "gs25" && window.PokeMoaMap) window.PokeMoaMap.setBrand("gs25");
      setSideTitle(true);
      queryStock(false);
    });
    document.addEventListener("pokemoa:geo-done", function () {
      if (isActive()) queryStock(false);
    });
    document.addEventListener("pokemoa:search-start", function () {
      if (isActive() && window.PokeMoaMap) window.PokeMoaMap.clearRelay();
    });

    /* 세트 검색 — app.js 가 먼저 결과를 그린 뒤 우리 카드를 덧붙인다 */
    var form = $("#setSearchForm");
    if (form) {
      form.addEventListener("submit", function () {
        var el = $("#setSearch");
        appendFigureSearch(el ? el.value : "");
      });
    }

    /* ?figure=1 로 들어오면 지도가 준비된 뒤 피규어 모드로 */
    try {
      var params = new URLSearchParams(location.search);
      if (params.get("figure") === "1") state.requested = true;
    } catch (e) {}
    if (state.requested) {
      if (window.PokeMoaMap) setMode("figure", { scroll: false, force: true });
      document.addEventListener("pokemoa:loaded", function () {
        if (state.requested) { state.requested = false; setMode("figure", { scroll: false, force: true }); }
      }, { once: true });
    }

    /* 안내 팝업 — 오늘 하루 보지 않기를 고르지 않았다면 첫 방문에 띄운다 */
    if (dismissedUntil() > Date.now()) {
      showReopen();
    } else {
      var t = setTimeout(function () {
        if (!state.popupEl) openPopup();
      }, 900);
      if (typeof t === "object" && t && t.unref) t.unref();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.PokeMoaFigure = {
    isActive: isActive,
    setMode: setMode,
    openPopup: openPopup,
    closePopup: closePopup,
    goStock: goStock,
    refreshStock: function () { queryStock(true); },
    product: F
  };
})();
