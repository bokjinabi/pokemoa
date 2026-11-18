/* =========================================================================
 * 포켓몬카드모아 — 화면 동작 (탭 · 지도 연동 · 도감 검색 · 모달 · 계산기)
 * ========================================================================= */
(function () {
  "use strict";
  var D = window.POKEMOA_DATA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------- GA4 이벤트 */
  /* gtag(GA4)가 없는 경우(스크립트 차단·오프라인·단일 파일 미리보기) 조용히 넘어간다. */
  function trackEvent(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  /* ------------------------------------------------------------ 공통 UI */
  var toastEl = $("#toast");
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-show"); }, 2600);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* --------------------------------------------------------------- 탭 */
  var panels = {
    home: $("#panel-home"),
    map: $("#panel-map"),
    schedule: $("#panel-schedule"),
    guide: $("#panel-guide"),
    trends: $("#panel-trends")
  };
  var navBtns = $$(".nav-btn");
  var currentTab = "map";
  var tabBooted = false;
  function showTab(name, opts) {
    if (!panels[name]) name = "map";
    Object.keys(panels).forEach(function (k) {
      if (panels[k]) panels[k].hidden = k !== name;
    });
    navBtns.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
    });
    currentTab = name;
    /* 첫 화면 진입과 탭 전환을 구분해 보낸다(페이지뷰·체류 시간 해석용) */
    var tabEntry = tabBooted ? "switch" : "initial";
    tabBooted = true;
    trackEvent("tab_view", { tab: name, entry: tabEntry });
    if (name === "map") {
      ensureMap();
      if (mapReady && window.PokeMoaMap) {
        setTimeout(function () { window.PokeMoaMap.invalidate(); }, 80);
      }
    }
    if (name === "trends") loadRelayMovers();
    if (!opts || !opts.keepScroll) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    if (history.replaceState) history.replaceState(null, "", "#" + name);
  }

  function onTabClick(e) {
    var el = e.currentTarget;
    var name = el.getAttribute("data-tab");
    if (!name) return;
    e.preventDefault();
    showTab(name);
    var setId = el.getAttribute("data-goto-set");
    if (setId) selectSet(setId);
    var href = el.getAttribute("href");
    if (href && href.charAt(0) === "#" && href.length > 1) {
      var target = document.getElementById(href.slice(1));
      if (target) {
        setTimeout(function () {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    }
  }
  $$("[data-tab]").forEach(function (el) {
    el.addEventListener("click", onTabClick);
  });

  /* --------------------------------------------------------------- 지도 */
  /* 실제 지도 엔진(map.js) 연동: 로딩 상태 · 배지 · 매장 목록 · 내 위치 */
  var mapShell = $("#mapShell");
  var provinceSelect = $("#provinceSelect");
  var districtSelect = $("#districtSelect");
  var regionSearch = $("#regionSearch");
  var regionSuggest = $("#regionSuggest");
  var brandSummary = $("#brandSummary");
  var sortSelect = $("#sortSelect");
  var stockToggle = $("#stockOnly");
  var storeListEl = $("#storeList");
  var storeSkeleton = $("#storeSkeleton");
  var mapCountEl = $("#mapCount");
  var mapLoading = $("#mapLoading");
  var mapLoadingText = $("#mapLoadingText");
  var mapLoadingBar = $("#mapLoadingBar");
  var mapLoadingStep = $("#mapLoadingStep");
  var mapStatusText = $("#mapStatusText");
  var mapStatusDot = $("#mapStatusDot");
  var mapRetry = $("#mapRetry");
  var geoBtn = $("#geoBtn");
  var sideSummary = $("#sideSummary");
  var mapCard = $("#mapCard");
  var mapReady = false;
  var gotFirstData = false;
  var isLoadingMap = true;
  var LIST_PAGE = 10;
  var listExpanded = false;
  var currentStores = [];
  var filterState = {
    region: "pohang-north",
    brand: "all",
    sort: "stock",
    stockOnly: false,
    showOffline: true,
    radius: 3000
  };

  var statusText = { in: "재고 있음", check: "매장 확인 필요", none: "재고 없음" };

  function ensureMap() {
    if (mapReady || !window.PokeMoaMap || !mapShell) return;
    mapReady = true;
    window.PokeMoaMap.init({ container: mapShell, card: mapCard });
    if (filterState.region && window.PokeMoaMap.getState().regionId !== filterState.region) {
      window.PokeMoaMap.setRegion(filterState.region);
    }
  }

  /* 로딩 오버레이 */
  var loadingTimer = null;
  function renderLoading(d) {
    if (!mapLoading) return;
    isLoadingMap = !!(d && d.active);
    if (!d || !d.active) {
      mapLoading.classList.add("is-done");
      setTimeout(function () { mapLoading.hidden = true; }, 260);
      clearInterval(loadingTimer);
      return;
    }
    mapLoading.hidden = false;
    mapLoading.classList.remove("is-done");
    if (mapCountEl) mapCountEl.textContent = "주변 매장 조회 중...";
    if (sideSummary) sideSummary.textContent = "불러오는 중...";
    var moreWrapEl = $("#storeMoreWrap");
    if (moreWrapEl) moreWrapEl.hidden = true;
    mapLoadingText.textContent = d.message || "실제 지도와 주변 매장 위치를 불러오는 중...";
    mapLoadingBar.style.width = (d.progress || 20) + "%";
    mapLoadingStep.textContent = d.phase === "tiles"
      ? "1/2 · 카카오맵 지도 불러오는 중"
      : "2/2 · 카카오 장소 검색으로 주변 편의점 4사 찾는 중";
    /* 진행 바가 멈춰 보이지 않도록 천천히 늘려 둔다 */
    clearInterval(loadingTimer);
    var base = d.progress || 20;
    var cap = d.phase === "data" ? 92 : 44;
    loadingTimer = setInterval(function () {
      base = Math.min(cap, base + 1);
      if (mapLoadingBar) mapLoadingBar.style.width = base + "%";
    }, 420);
  }

  function renderBadge(b) {
    if (!mapStatusText || !b) return;
    mapStatusText.textContent = b.text;
    if (mapStatusDot) mapStatusDot.className = "ms-dot is-" + (b.kind || "snapshot");
    if (mapRetry) mapRetry.hidden = !b.action;
    if (storeSkeleton) storeSkeleton.hidden = !!(gotFirstData && !isLoadingMap);
    if (storeListEl) storeListEl.hidden = !(gotFirstData && !isLoadingMap);
  }

  /* 매장별 취급·재고 카드 상품명 태그 */
  function productTagsHtml(s) {
    var list = s.products || [];
    if (!list.length) return "";
    var soldout = list.some(function (p) { return p.state === "soldout"; });
    var head = s.status === "none" && soldout
      ? '<span class="p-head">최근 입고 품절</span>'
      : "";
    var tags = list.map(function (p) {
      return '<span class="p-tag is-' + p.state + '" title="' + p.name + " · " + p.stateLabel + '">' +
        p.short + ' <i>· ' + p.stateLabel + "</i></span>";
    }).join("");
    return '<span class="s-products">' + head + tags + "</span>";
  }

  /* 정렬: 재고 우선(재고 있음 → 확인 필요 → 없음, 각각 가까운 순) / 가까운 거리순 */
  var STATUS_RANK = { in: 0, check: 1, none: 2 };
  function sortStores(list) {
    var arr = (list || []).slice();
    if (filterState.sort === "stock") {
      arr.sort(function (a, b) {
        var d = (STATUS_RANK[a.status] || 0) - (STATUS_RANK[b.status] || 0);
        return d !== 0 ? d : a.distance - b.distance;
      });
    } else {
      arr.sort(function (a, b) { return a.distance - b.distance; });
    }
    return arr;
  }

  /* 매장 목록: 재고 우선/가까운 순 정렬 + 처음 10곳 + 더보기 */
  function renderStores(list) {
    currentStores = (list || []).slice();
    drawStoreList();
  }

  function drawStoreList() {
    if (!storeListEl) return;
    var list = sortStores(currentStores);
    var counts = { in: 0, check: 0, none: 0 };
    var offlineN = 0;
    list.forEach(function (s) {
      counts[s.status] += 1;
      if (s.offline) offlineN += 1;
    });
    if (mapCountEl) {
      mapCountEl.innerHTML = "표시 중 <b>" + list.length + "</b>곳" +
        (offlineN ? " · 오프라인 " + offlineN + "곳" : "") +
        " · 재고 " + counts.in + " · 확인 " + (counts.check - offlineN) + " · 없음 " + counts.none;
    }
    if (sideSummary) {
      sideSummary.textContent = list.length
        ? (filterState.sort === "stock" ? "재고 우선 · " : "가까운 순 · ") + list.length + "곳"
        : "조건에 맞는 매장 없음";
    }

    storeListEl.innerHTML = "";
    if (!list.length) {
      var li0 = document.createElement("li");
      li0.className = "store-empty";
      li0.textContent = "이 조건에 맞는 매장이 없습니다. 반경을 넓히거나 다른 브랜드를 골라 보세요.";
      storeListEl.appendChild(li0);
      return;
    }

    var shown = listExpanded ? list : list.slice(0, LIST_PAGE);
    var selectedId = (window.PokeMoaMap && window.PokeMoaMap.getState) ? window.PokeMoaMap.getState().selectedId : null;

    shown.forEach(function (s) {
      var b = D.brandMeta[s.brand] || { label: s.brand, short: "?", color: "#1b2a4a" };
      var dist = s.distance < 1000 ? Math.round(s.distance) + "m" : (s.distance / 1000).toFixed(1) + "km";
      var sLabel = s.offline
        ? (s.brand === "vending" ? "공식 설치 지점" : s.brand === "cardshop" ? "공인 카드샵" : "확인 필요")
        : statusText[s.status];
      var item = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "store-item is-" + s.status + (s.offline ? " is-offline" : "");
      btn.setAttribute("data-store", s.id);
      btn.innerHTML =
        '<span class="s-top">' +
        '<span class="s-brand" style="background:' + b.color + '">' + b.short + "</span>" +
        '<span class="s-name">' + s.name + "</span>" +
        '<span class="s-dist">' + dist + "</span>" +
        "</span>" +
        '<span class="s-meta">' +
        '<span class="status-badge ' + s.status + '">' + sLabel + "</span>" +
        (s.offline
          ? '<span class="chip chip-offline">재고 미확인</span>'
          : (s.relay
            ? '<span class="chip chip-relay">실시간 ' + (s.relayQty || 0) + '개</span>'
            : '<span class="chip chip-sample">샘플</span>')) +
        (s.street ? "<small>" + escapeHtml(s.street) + "</small>" : "") +
        "</span>" +
        productTagsHtml(s);
      btn.addEventListener("click", function () {
        if (!mapReady) return;
        window.PokeMoaMap.focusStore(s.id);
        if (window.innerWidth < 980) {
          mapShell.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      if (selectedId && s.id === selectedId) btn.classList.add("is-active");
      item.appendChild(btn);
      storeListEl.appendChild(item);
    });

    syncMoreButton(list.length);
  }

  /* 더보기 버튼 (목록 스크롤 밖에 고정) */
  function syncMoreButton(total) {
    var wrap = $("#storeMoreWrap");
    var more = $("#storeMore");
    if (!wrap || !more) return;
    if (total <= LIST_PAGE) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    more.setAttribute("aria-expanded", listExpanded ? "true" : "false");
    more.textContent = listExpanded
      ? "접기 (처음 " + LIST_PAGE + "곳만 보기)"
      : "더보기 (" + (total - LIST_PAGE) + "개 더 보기)";
    if (!more.dataset.bound) {
      more.dataset.bound = "1";
      more.addEventListener("click", function () {
        listExpanded = !listExpanded;
        drawStoreList();
        if (!listExpanded && storeListEl) storeListEl.scrollTop = 0;
      });
    }
  }

  document.addEventListener("pokemoa:loading", function (e) { renderLoading(e.detail); });

  function syncRadiusUI(allow20, radius) {
    var r20 = $("#radius20");
    var note = $("#radiusNote");
    if (r20) {
      r20.disabled = !allow20;
      r20.classList.toggle("is-disabled", !allow20);
      r20.setAttribute("aria-disabled", allow20 ? "false" : "true");
      r20.title = allow20
        ? "넓은 반경으로 주변 매장을 최대 100곳까지 봅니다"
        : "도심은 5km까지 지원합니다";
    }
    if (note) note.hidden = !!allow20;
    if (typeof radius === "number") {
      filterState.radius = radius;
      $$(".radius-btn").forEach(function (b) {
        b.classList.toggle("is-active", Number(b.getAttribute("data-radius")) === radius);
      });
    }
  }

  document.addEventListener("pokemoa:data", function (e) {
    var d = e.detail || {};
    syncRadiusUI(d.allow20, d.radius);
    renderBadge(d.badge);
    if (d.badge && d.badge.text && mapStatusText) {
      mapStatusText.title = d.error ? "마지막 실시간 조회 오류: " + d.error : "";
    }
    if (d.source && !d.loading) {
      gotFirstData = true;
      if (storeSkeleton) storeSkeleton.hidden = true;
      if (storeListEl) storeListEl.hidden = false;
    }
    if (d.brandCounts) {
      renderBrandSummary(d.brandCounts, d.brand || filterState.brand);
      renderOfflineChips(d.brandCounts, d.brand || filterState.brand, d.showOffline);
    }
  });

  document.addEventListener("pokemoa:visible", function (e) {
    var d = e.detail || {};
    renderStores(d.stores || []);
  });

  document.addEventListener("pokemoa:loaded", function (e) {
    var d = e.detail || {};
    if (d.source === "snapshot") {
      toast("실시간 조회가 지연되어 내장 실제 좌표로 표시합니다.");
    } else if (d.source === "live" && d.late) {
      toast("실시간 주변 매장 데이터를 받아 지도에 반영했습니다.");
    }
  });

  document.addEventListener("pokemoa:sdk-error", function (e) {
    /* 카카오맵 SDK는 등록된 도메인에서만 열린다 — 오류로 멈추지 않고 내장 좌표로 계속 쓴다 */
    renderLoading({ active: false });
    toast((e.detail && e.detail.message) || "카카오맵을 이 주소에서 열 수 없어 내장 좌표로 표시합니다.");
  });

  document.addEventListener("pokemoa:error", function (e) {
    toast((e.detail && e.detail.message) || "지도를 불러오지 못했습니다.");
    renderLoading({ active: false });
  });

  document.addEventListener("pokemoa:geo-start", function () {
    if (geoBtn) geoBtn.classList.add("is-busy");
    toast("현재 위치를 확인하는 중입니다. 브라우저 위치 권한을 허용해 주세요.");
  });
  document.addEventListener("pokemoa:geo-done", function (e) {
    if (geoBtn) geoBtn.classList.remove("is-busy");
    if (regionSearch) regionSearch.value = "";
    closeSuggest();
    toast("내 위치 주변 매장을 조회했습니다.");
  });
  document.addEventListener("pokemoa:geo-error", function (e) {
    if (geoBtn) geoBtn.classList.remove("is-busy");
    toast((e.detail && e.detail.message) || "위치를 확인하지 못했습니다.");
  });

  document.addEventListener("pokemoa:store-selected", function (e) {
    var id = e.detail && e.detail.id;
    $$(".store-item").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-store") === id);
    });
    var active = $('.store-item[data-store="' + id + '"]');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  });
  document.addEventListener("pokemoa:store-cleared", function () {
    $$(".store-item").forEach(function (b) { b.classList.remove("is-active"); });
  });

  /* ------------------------------------------- 집 태블릿 실시간 중계 연결 */
  /* 태블릿(Termux)에서 켜 둔 relay/server.js 주소를 저장하고, 연결된 동안에는
     주변 매장 조회마다 중계 서버의 실제 재고를 받아 지도·매장 카드에 반영한다.
     연결이 없거나 응답이 없으면 기존 카카오맵·스냅샷 + 샘플·제보 모드로 자연스럽게 돌아간다. */
  var RELAY_KEY = "pokemoa.relayUrl";
  var relayBar = $("#relayBar");
  var relayStateText = $("#relayStateText");
  var relayOpenBtn = $("#relayOpenBtn");
  var relayRefreshBtn = $("#relayRefreshBtn");
  var relayModal = $("#relayModal");
  var relayModalMsg = $("#relayModalMsg");
  var relayUrlInput = $("#relayUrlInput");
  var relayConnectBtn = $("#relayConnectBtn");
  var relayDisconnectBtn = $("#relayDisconnectBtn");
  var relayModalClose = $("#relayModalClose");
  var relayPresetBox = $("#relayPresetBox");
  var RELAY_PRESET = D.relayPreset || null;

  var relay = {
    url: "",
    state: "off",        /* off | checking | online | error */
    busy: false,
    lastCount: 0,
    lastKey: "",
    noticeShown: "",
    timer: null
  };

  function relayNormalize(raw) {
    var v = String(raw || "").trim().replace(/\s+/g, "");
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    v = v.replace(/\/+$/, "");
    if (!/^https?:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?(\/[^\s]*)?$/i.test(v)) return "";
    return v;
  }

  function relaySaved() {
    try { return localStorage.getItem(RELAY_KEY) || ""; } catch (e) { return ""; }
  }
  function relaySave(url) {
    try { if (url) localStorage.setItem(RELAY_KEY, url); else localStorage.removeItem(RELAY_KEY); } catch (e) {}
  }
  function relayHost() {
    return relay.url ? relay.url.replace(/^https?:\/\//, "") : "";
  }

  function relayMsg(text, kind) {
    if (!relayModalMsg) return;
    relayModalMsg.textContent = text || "";
    relayModalMsg.className = "rm-msg" + (kind ? " is-" + kind : "");
  }

  function relayRender() {
    if (relayBar) relayBar.setAttribute("data-state", relay.state);
    if (relayStateText) {
      if (relay.state === "online") {
        relayStateText.textContent = "연결됨 · " + relayHost() +
          (relay.lastCount ? " · 실제 재고 " + relay.lastCount + "곳" : " · 실재고 확인 중");
      } else if (relay.state === "checking") {
        relayStateText.textContent = "연결 확인 중… (" + relayHost() + ")";
      } else if (relay.state === "error") {
        relayStateText.textContent = "중계 응답 없음 · " + relayHost() + " · 제보·샘플 재고로 표시";
      } else {
        relayStateText.textContent = "연결 안 됨 · 지금은 제보·샘플 재고로 표시합니다";
      }
    }
    if (relayOpenBtn) relayOpenBtn.textContent = relay.state === "online" ? "설정" : relay.state === "error" ? "다시 연결" : "중계 연결";
    if (relayRefreshBtn) relayRefreshBtn.hidden = relay.state !== "online";
  }

  function relayOpen() {
    if (!relayModal) return;
    /* 저장된 주소가 없으면 최근에 열린 집 태블릿 터널 주소를 미리 채워 둡니다.
       (자동 연결은 하지 않고, 사용자가 '연결 확인'을 누를 때만 요청을 보냅니다.) */
    relayUrlInput.value = relay.url || relaySaved() || (RELAY_PRESET && RELAY_PRESET.url) || "";
    relayMsg("");
    relayRenderPreset();
    relayModal.hidden = false;
    setTimeout(function () { try { relayUrlInput.focus(); } catch (e) {} }, 40);
  }

  function relayRenderPreset() {
    if (!relayPresetBox) return;
    if (!RELAY_PRESET || !RELAY_PRESET.url) { relayPresetBox.hidden = true; return; }
    relayPresetBox.hidden = false;
    relayPresetBox.innerHTML =
      '<span class="rm-preset-label">최근 열린 터널' + (RELAY_PRESET.label ? ' · ' + escapeHtml(RELAY_PRESET.label) : '') + '</span>' +
      '<code class="rm-preset-url">' + escapeHtml(RELAY_PRESET.url.replace(/^https?:\/\//, '')) + '</code>' +
      '<span class="rm-preset-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="relayPresetFill">주소 넣기</button>' +
        '<button type="button" class="btn btn-dark btn-sm" id="relayPresetConnect">바로 연결</button>' +
      '</span>';
    var fill = document.getElementById("relayPresetFill");
    var go = document.getElementById("relayPresetConnect");
    if (fill) fill.addEventListener("click", function () {
      relayUrlInput.value = RELAY_PRESET.url;
      relayUrlInput.focus();
      relayMsg("주소를 넣었습니다. '연결 확인'을 누르면 연결합니다.");
    });
    if (go) go.addEventListener("click", function () { relayConnect(RELAY_PRESET.url); });
  }

  function relayClose() {
    if (relayModal) relayModal.hidden = true;
  }

  function relayCheck(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 6500);
    return fetch(url + "/health", { signal: ctrl.signal, mode: "cors", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (d) {
        if (!d || d.service !== "pokemoa-relay") throw new Error("중계 서버 응답이 아닙니다");
        return d;
      })
      .finally(function () { clearTimeout(timer); });
  }

  function relayConnect(raw, opts) {
    opts = opts || {};
    var target = relayNormalize(raw);
    if (!target) {
      relayMsg("주소 형식을 확인해 주세요. 예: https://example.trycloudflare.com", "warn");
      return;
    }
    relay.url = target;
    relay.state = "checking";
    relay.lastCount = 0;
    relayRender();
    relayMsg("연결을 확인하는 중입니다…");
    relayCheck(target).then(function () {
      relaySave(target);
      relay.state = "online";
      relayRender();
      relayMsg("연결됐습니다. 실재고를 불러오는 중…", "ok");
      toast("실시간 중계에 연결했습니다. 실제 재고를 불러옵니다.");
      trackEvent("relay_connect", { status: "online" });
      if (!opts.keepOpen) relayClose();
      relayRefresh(true);
    }).catch(function (err) {
      relay.state = "error";
      relayRender();
      var reason = err && err.name === "AbortError"
        ? "응답 시간 초과(6.5초)"
        : (err && err.message) || "응답 없음";
      relayMsg("연결하지 못했습니다 — " + reason +
        ". 태블릿의 server.js·터널 주소를 확인해 주세요.", "warn");
      trackEvent("relay_connect", { status: "error" });
    });
  }

  function relayDisconnect() {
    relaySave("");
    relay.url = "";
    relay.state = "off";
    relay.lastCount = 0;
    relay.noticeShown = "";
    relayRender();
    if (mapReady && window.PokeMoaMap) window.PokeMoaMap.clearRelay();
    relayMsg("연결을 해제했습니다. 제보·샘플 재고로 표시합니다.", "ok");
    toast("실시간 중계 연결을 해제했습니다.");
  }

  function relayRefresh(manual) {
    if (relay.state !== "online" || !relay.url || !mapReady || !window.PokeMoaMap) return;
    var mstate = window.PokeMoaMap.getState();
    if (!mstate || !mstate.center) return;
    var lat = Number(mstate.center.lat).toFixed(4);
    var lng = Number(mstate.center.lng).toFixed(4);
    var key = lat + "," + lng;
    if (relay.busy) return;
    relay.busy = true;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 18000);
    var url = relay.url + "/api/nearby?lat=" + lat + "&lng=" + lng + "&keyword=" + encodeURIComponent("포켓몬");
    fetch(url, { signal: ctrl.signal, mode: "cors", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        var n = window.PokeMoaMap.applyRelay(payload);
        relay.lastCount = n;
        relay.lastKey = key;
        relayRender();
        if (!n) {
          if (relay.noticeShown !== "empty:" + key) {
            relay.noticeShown = "empty:" + key;
            toast("중계는 연결됐지만 이 지역에서 받은 실재고가 없습니다 · 제보·샘플로 표시합니다.");
          }
        } else if (manual || relay.noticeShown !== key) {
          relay.noticeShown = key;
          toast("실제 재고 " + n + "곳을 지도에 반영했습니다.");
        }
      })
      .catch(function () {
        relay.state = "error";
        relay.lastCount = 0;
        relayRender();
        if (window.PokeMoaMap) window.PokeMoaMap.clearRelay();
        toast("중계 서버 응답이 없습니다 · 기존 샘플 모드로 표시합니다.");
      })
      .finally(function () {
        clearTimeout(timer);
        relay.busy = false;
      });
  }

  function relayScheduleRefresh() {
    if (relay.state !== "online") return;
    clearTimeout(relay.timer);
    relay.timer = setTimeout(function () { relayRefresh(false); }, 900);
  }

  if (relayOpenBtn) relayOpenBtn.addEventListener("click", relayOpen);
  if (relayRefreshBtn) relayRefreshBtn.addEventListener("click", function () { relayRefresh(true); });
  if (relayModalClose) relayModalClose.addEventListener("click", relayClose);
  if (relayConnectBtn) {
    relayConnectBtn.addEventListener("click", function () { relayConnect(relayUrlInput.value); });
  }
  if (relayUrlInput) {
    relayUrlInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); relayConnect(relayUrlInput.value); }
    });
  }
  if (relayDisconnectBtn) relayDisconnectBtn.addEventListener("click", relayDisconnect);
  if (relayModal) {
    relayModal.addEventListener("click", function (e) {
      if (e.target === relayModal) relayClose();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !relayModal.hidden) relayClose();
    });
  }

  /* 지도가 새로 조회를 끝낼 때마다(지역 변경·내 위치) 중계도 같이 새로 받는다 */
  document.addEventListener("pokemoa:loaded", relayScheduleRefresh);
  document.addEventListener("pokemoa:geo-done", relayScheduleRefresh);

  /* ?relay=https://… 로 열면 그 주소를 저장하고 바로 연결한다 */
  function relayInit() {
    relayRender();
    var param = "";
    try {
      param = new URLSearchParams(location.search).get("relay") || "";
    } catch (e) {
      param = "";
    }
    var fromQuery = relayNormalize(param);
    if (fromQuery) {
      relayConnect(fromQuery, { keepOpen: false });
      return;
    }
    var saved = relayNormalize(relaySaved());
    if (saved) relayConnect(saved, { keepOpen: true, silent: true });
  }
  relayInit();

  if (mapRetry) {
    mapRetry.addEventListener("click", function () {
      if (mapReady) window.PokeMoaMap.retry();
    });
  }

  if (geoBtn) {
    geoBtn.addEventListener("click", function () {
      if (mapReady) window.PokeMoaMap.locate();
    });
  }

  /* --------------------------------------------- 지역 선택기 (전국 2단 + 검색) */
  function regionById(id) {
    for (var i = 0; i < D.regions.length; i++) if (D.regions[i].id === id) return D.regions[i];
    return null;
  }

  function optionLabel(r) {
    /* "경북 · 포항 · 북구 (환호동)" → "포항 · 북구 (환호동)" */
    var prefix = r.province + " · ";
    return r.name.indexOf(prefix) === 0 ? r.name.slice(prefix.length) : r.name;
  }

  function fillDistricts(province, selectedId) {
    if (!districtSelect) return;
    districtSelect.innerHTML = "";
    var list = D.regions.filter(function (r) { return r.province === province; });
    list.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.id;
      o.textContent = optionLabel(r);
      if (r.id === selectedId) o.selected = true;
      districtSelect.appendChild(o);
    });
    if (selectedId && list.some(function (r) { return r.id === selectedId; })) {
      districtSelect.value = selectedId;
    }
  }

  function applyRegion(id) {
    var r = regionById(id);
    if (!r) return;
    filterState.region = r.id;
    gotFirstData = false;
    listExpanded = false;
    if (storeSkeleton) storeSkeleton.hidden = false;
    if (storeListEl) storeListEl.hidden = true;
    if (mapReady) window.PokeMoaMap.setRegion(r.id);
    trackEvent("region_search", {
      region: r.id,
      region_name: r.name,
      radius_km: filterState.radius / 1000
    });
  }

  /* 시·도 · 시군구 드롭다운과 동네 검색이 같은 지역을 가리키도록 맞춘다 */
  function selectRegion(id, opts) {
    var r = regionById(id);
    if (!r) return;
    if (provinceSelect) provinceSelect.value = r.province;
    fillDistricts(r.province, r.id);
    if (regionSearch && (!opts || !opts.keepQuery)) regionSearch.value = "";
    closeSuggest();
    applyRegion(r.id);
  }

  var suggestItems = [];
  var suggestActive = -1;
  var placeTimer = null;
  var placeSeq = 0;

  function closeSuggest() {
    if (!regionSuggest) return;
    regionSuggest.hidden = true;
    regionSuggest.innerHTML = "";
    suggestItems = [];
    suggestActive = -1;
    placeSeq += 1;
    clearTimeout(placeTimer);
    if (regionSearch) regionSearch.setAttribute("aria-expanded", "false");
  }

  function normText(s) {
    return (s || "").toLowerCase().replace(/\s+/g, "");
  }

  function searchRegions(q) {
    var n = normText(q);
    if (!n) return [];
    var hits = [];
    D.regions.forEach(function (r) {
      var hay = normText(r.name) + "|" + normText(r.short) + "|" + normText(r.district) +
        "|" + normText(r.label) + "|" + normText(r.province);
      if (hay.indexOf(n) !== -1) hits.push(r);
    });
    /* 이름 앞부분에서 바로 맞는 지역을 먼저 */
    hits.sort(function (a, b) {
      var ai = normText(a.name).indexOf(n) === 0 || normText(a.short).indexOf(n) === 0 ? 0 : 1;
      var bi = normText(b.name).indexOf(n) === 0 || normText(b.short).indexOf(n) === 0 ? 0 : 1;
      return ai - bi;
    });
    return hits.slice(0, 8);
  }

  function highlightSuggest(i) {
    suggestActive = i;
    $$("li.region-suggest-item", regionSuggest).forEach(function (li, idx) {
      var on = idx === i;
      li.classList.toggle("is-active", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderSuggest(q) {
    if (!regionSuggest || !regionSearch) return;
    var hits = searchRegions(q);
    suggestItems = hits.map(function (r) { return { kind: "region", region: r }; });
    suggestActive = suggestItems.length ? 0 : -1;
    var query = String(q || "").trim();
    drawSuggest(query);
    /* 카카오 장소 검색으로 동네·역·건물 이름도 바로 찾는다(지역 목록에 없는 곳) */
    clearTimeout(placeTimer);
    placeSeq += 1;
    if (!query || query.length < 2) return;
    if (!window.PokeMoaMap || !window.PokeMoaMap.searchPlaces) return;
    var seq = placeSeq;
    placeTimer = setTimeout(function () {
      window.PokeMoaMap.searchPlaces(query, function (list) {
        if (seq !== placeSeq || !list || !list.length) return;
        var have = {};
        suggestItems.forEach(function (it) {
          if (it.kind === "region") have[it.region.id] = 1;
        });
        list.forEach(function (p) {
          if (suggestItems.length >= 10) return;
          suggestItems.push({
            kind: "place",
            place: p,
            dup: false
          });
          have[p.name] = 1;
        });
        drawSuggest(query);
      });
    }, 220);
  }

  /* 제안 목록 그리기 — 지역(내장 55개) 먼저, 그 뒤에 카카오 장소 검색 결과 */
  function drawSuggest(query) {
    if (!regionSuggest || !regionSearch) return;
    regionSuggest.innerHTML = "";
    if (!normText(query)) { closeSuggest(); return; }
    if (!suggestItems.length) {
      var empty = document.createElement("li");
      empty.className = "region-suggest-empty";
      empty.textContent = "일치하는 지역이 없습니다. 시·도와 시·군·구에서 골라 주세요.";
      regionSuggest.appendChild(empty);
    }
    suggestItems.forEach(function (item, i) {
      var li = document.createElement("li");
      li.className = "region-suggest-item" + (i === suggestActive ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === suggestActive ? "true" : "false");
      if (item.kind === "region") {
        var r = item.region;
        li.setAttribute("data-region", r.id);
        li.innerHTML = "<strong>" + r.name + "</strong><span>" +
          (r.allow20 ? "20km까지" : "도심 · 5km까지") + "</span>";
      } else {
        var p = item.place;
        li.setAttribute("data-place", p.name);
        li.innerHTML = "<strong>" + escapeHtml(p.name) + "</strong><span>" +
          escapeHtml(p.address || "카카오맵") + "</span>";
      }
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        chooseSuggest(i);
        if (regionSearch) regionSearch.blur();
      });
      regionSuggest.appendChild(li);
    });
    regionSuggest.hidden = false;
    regionSearch.setAttribute("aria-expanded", "true");
  }

  /* 제안 선택 — 내장 지역이면 그 지역으로, 카카오 장소면 그 좌표로 지도를 연다 */
  function chooseSuggest(i) {
    var item = suggestItems[i];
    if (!item) return;
    if (item.kind === "region") { selectRegion(item.region.id); return; }
    selectPlace(item.place);
  }

  /* 카카오 장소 검색 결과(동네·역·건물) 주변을 본다 */
  function selectPlace(p) {
    if (!p) return;
    filterState.region = "";
    gotFirstData = false;
    listExpanded = false;
    if (storeSkeleton) storeSkeleton.hidden = false;
    if (storeListEl) storeListEl.hidden = true;
    if (regionSearch) regionSearch.value = p.name;
    /* 시·군·구 드롭다운에는 '검색한 장소'를 임시 항목으로 보여 준다(지역 목록을 골라 다시 이동 가능) */
    if (districtSelect) {
      var tmp = districtSelect.querySelector('option[data-place-temp]');
      if (tmp) tmp.parentNode.removeChild(tmp);
      var opt = document.createElement("option");
      opt.value = "";
      opt.setAttribute("data-place-temp", "1");
      opt.textContent = "검색: " + p.name;
      opt.selected = true;
      districtSelect.insertBefore(opt, districtSelect.firstChild);
      districtSelect.value = "";
    }
    closeSuggest();
    if (mapReady) window.PokeMoaMap.setPoint({ lat: p.lat, lng: p.lng, name: p.name });
    toast("‘" + p.name + "’ 주변 편의점 4사를 찾습니다.");
    trackEvent("region_search", {
      region: "kakao-place",
      region_name: p.name,
      radius_km: filterState.radius / 1000
    });
  }

  if (provinceSelect) {
    provinceSelect.addEventListener("change", function () {
      var prov = provinceSelect.value;
      var first = D.regions.filter(function (r) { return r.province === prov; })[0];
      if (!first) return;
      fillDistricts(prov, first.id);
      applyRegion(first.id);
    });
  }

  if (districtSelect) {
    districtSelect.addEventListener("change", function () {
      if (!districtSelect.value) return;
      var tmp = districtSelect.querySelector('option[data-place-temp]');
      if (tmp) tmp.parentNode.removeChild(tmp);
      if (regionSearch) regionSearch.value = "";
      closeSuggest();
      applyRegion(districtSelect.value);
    });
  }

  if (regionSearch) {
    regionSearch.addEventListener("input", function () { renderSuggest(regionSearch.value); });
    regionSearch.addEventListener("focus", function () {
      if (regionSearch.value) renderSuggest(regionSearch.value);
    });
    regionSearch.addEventListener("keydown", function (e) {
      var open = regionSuggest && !regionSuggest.hidden;
      if (e.key === "ArrowDown" && open) {
        e.preventDefault();
        highlightSuggest(Math.min(suggestItems.length - 1, suggestActive + 1));
      } else if (e.key === "ArrowUp" && open) {
        e.preventDefault();
        highlightSuggest(Math.max(0, suggestActive - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (suggestActive >= 0 && suggestItems[suggestActive]) {
          chooseSuggest(suggestActive);
          regionSearch.blur();
        } else if (suggestItems.length === 1) {
          chooseSuggest(0);
          regionSearch.blur();
        }
      } else if (e.key === "Escape") {
        closeSuggest();
      }
    });
    regionSearch.addEventListener("blur", function () {
      setTimeout(closeSuggest, 120);
    });
  }

  /* 첫 화면: 포항 북구(환호동)를 기본 선택 */
  var initialRegion = regionById(filterState.region) || D.regions[0];
  if (initialRegion) {
    if (provinceSelect) provinceSelect.value = initialRegion.province;
    fillDistricts(initialRegion.province, initialRegion.id);
    filterState.region = initialRegion.id;
  }

  /* 카드 상품 필터 (data.js cardProducts 로 칩을 만든다) */
  /* 편의점 4사별 현황 요약 (클릭하면 그 브랜드만 보기 · 한 번 더 누르면 전체) */
  var BRAND_ORDER = ["gs25", "cu", "seven", "emart24"];
  function renderBrandSummary(counts, activeBrand) {
    if (!brandSummary || !counts) return;
    var all = counts.all || { total: 0, in: 0, check: 0, none: 0 };
    var html = '<button type="button" class="bs-card bs-all' + (activeBrand === "all" ? " is-active" : "") + '" data-brand="all">' +
      '<span class="bs-head"><span class="bs-name">전체</span></span>' +
      '<strong class="bs-count">' + all.total + '<small>곳</small></strong>' +
      '<span class="bs-sub">재고 ' + all.in + " · 확인 " + all.check + " · 없음 " + all.none + "</span></button>";
    BRAND_ORDER.forEach(function (id) {
      var meta = D.brandMeta[id] || { label: id, short: id, color: "#1b2a4a" };
      var c = counts[id] || { total: 0, in: 0, check: 0, none: 0 };
      html += '<button type="button" class="bs-card' + (activeBrand === id ? " is-active" : "") + '" data-brand="' + id + '" style="--brand:' + meta.color + '">' +
        '<span class="bs-head"><i class="bs-dot"></i><span class="bs-name">' + meta.label + "</span></span>" +
        '<strong class="bs-count">' + c.total + "<small>곳</small></strong>" +
        '<span class="bs-sub">' + (c.in ? "재고 " + c.in + "곳" : "재고 없음") + "</span></button>";
    });
    brandSummary.innerHTML = html;
  }

  /* 오프라인 판매처(마트·아트박스·자판기·카드샵) 칩 — 누르면 그 종류만, 한 번 더 누르면 전체 */
  var offlineChips = $("#offlineChips");
  var offlineToggle = $("#offlineToggle");
  var offlineCounts = null;

  function renderOfflineChips(counts, activeBrand, showOffline) {
    if (!offlineChips) return;
    if (counts) offlineCounts = counts;
    counts = offlineCounts || {};
    var on = showOffline !== false;
    var list = D.offlineBrands || [];
    offlineChips.innerHTML = list.map(function (b) {
      var meta = D.brandMeta[b.id] || { color: "#1b2a4a" };
      var c = counts[b.id] || { total: 0 };
      var active = activeBrand === b.id;
      return '<button type="button" class="off-chip' + (active ? " is-active" : "") + (on ? "" : " is-muted") +
        '" data-offline="' + b.id + '" style="--brand:' + meta.color + '" aria-pressed="' + (active ? "true" : "false") + '">' +
        '<i class="off-dot" aria-hidden="true"></i><span>' + b.label + "</span><b>" + c.total + "</b></button>";
    }).join("");
    if (offlineToggle) offlineToggle.checked = on;
  }

  if (offlineChips) {
    offlineChips.addEventListener("click", function (e) {
      var btn = e.target.closest(".off-chip");
      if (!btn) return;
      var next = btn.getAttribute("data-offline");
      if (!next) return;
      if (next === filterState.brand) next = "all";
      filterState.brand = next;
      listExpanded = false;
      if (mapReady) window.PokeMoaMap.setBrand(next);
      else renderOfflineChips(null, next, filterState.showOffline);
    });
  }

  if (offlineToggle) {
    offlineToggle.addEventListener("change", function () {
      filterState.showOffline = offlineToggle.checked;
      listExpanded = false;
      if (mapReady) window.PokeMoaMap.setShowOffline(filterState.showOffline);
      toast(filterState.showOffline ? "오프라인 판매처(마트·아트박스·자판기·카드샵)를 함께 표시합니다." : "오프라인 판매처를 지도·목록에서 숨겼습니다.");
    });
  }

  if (brandSummary) {
    brandSummary.addEventListener("click", function (e) {
      var btn = e.target.closest(".bs-card");
      if (!btn) return;
      var next = btn.getAttribute("data-brand");
      if (!next) return;
      if (next !== "all" && next === filterState.brand) next = "all";
      filterState.brand = next;
      listExpanded = false;
      if (mapReady) window.PokeMoaMap.setBrand(next);
    });
  }

  if (sortSelect) {
    sortSelect.value = filterState.sort;
    sortSelect.addEventListener("change", function () {
      filterState.sort = sortSelect.value;
      listExpanded = false;
      drawStoreList();
    });
  }

  if (stockToggle) {
    stockToggle.addEventListener("change", function () {
      filterState.stockOnly = stockToggle.checked;
      listExpanded = false;
      if (mapReady) window.PokeMoaMap.setStockOnly(filterState.stockOnly);
      toast(stockToggle.checked ? "재고 있는 매장만 보여 드립니다." : "확인 필요·없음 매장도 함께 표시합니다.");
    });
  }

  $$(".radius-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $$(".radius-btn").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      filterState.radius = Number(btn.getAttribute("data-radius"));
      listExpanded = false;
      if (mapReady) window.PokeMoaMap.setRadius(filterState.radius);
      var r = regionById(filterState.region);
      trackEvent("region_search", {
        region: filterState.region,
        region_name: r ? r.name : "",
        radius_km: filterState.radius / 1000
      });
    });
  });

  var resetBtn = $("#filterReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      filterState.brand = "all";
      filterState.sort = "stock";
      filterState.stockOnly = false;
      filterState.showOffline = true;
      filterState.radius = 3000;
      listExpanded = false;
      if (sortSelect) sortSelect.value = "stock";
      if (stockToggle) stockToggle.checked = false;
      $$(".radius-btn").forEach(function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-radius") === "3000");
      });
      if (mapReady) {
        window.PokeMoaMap.setBrand("all");
        window.PokeMoaMap.setStockOnly(false);
        window.PokeMoaMap.setShowOffline(true);
        window.PokeMoaMap.setRadius(3000);
        window.PokeMoaMap.closeCard();
      }
      toast("필터를 초기화했습니다.");
    });
  }

  /* ------------------------------------------------------------- 캘린더 */
  /* 오늘(KST) 이후 일정만 기본 표시 · 지난 기록은 접이식 */
  function kstNow() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  function ymdNum(y, m, d) { return y * 10000 + m * 100 + d; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var calShowPast = false;

  function renderCalendar() {
    var grid = $("#calGrid");
    if (!grid) return;
    var c = D.calendar;
    var year = c.year || 2026;
    var month = c.month || 11;
    var today = kstNow();
    var todayNum = ymdNum(today.y, today.m, today.d);
    var sameMonth = today.y === year && today.m === month;
    var html = Array.prototype.map.call(grid.querySelectorAll(".cal-dow"), function (n) {
      return n.outerHTML;
    }).join("");

    for (var i = 0; i < c.firstWeekday; i++) html += '<div class="cal-cell is-empty"></div>';
    for (var d = 1; d <= c.days; d++) {
      var isPast = ymdNum(year, month, d) < todayNum;
      var isToday = sameMonth && d === today.d;
      var marks = c.marks[d];
      var show = marks && marks.length && (!isPast || calShowPast);
      html += '<div class="cal-cell' + (isToday ? " is-today" : "") + (isPast ? " is-past" : "") +
        '" aria-label="' + month + '월 ' + d + '일' + (show ? " 입고 예상 표시" : (isPast ? " 지난 날짜" : "")) + '">' +
        "<span>" + d + "</span>" +
        (show ? '<span class="marks">' + marks.map(function (k) { return '<i class="m-' + k + '"></i>'; }).join("") + "</span>" : "") +
        "</div>";
    }
    grid.innerHTML = html;
  }

  function buildCalendar() { renderCalendar(); }

  var calPastToggle = $("#calPastToggle");
  if (calPastToggle) {
    calPastToggle.addEventListener("click", function () {
      calShowPast = !calShowPast;
      calPastToggle.setAttribute("aria-expanded", calShowPast ? "true" : "false");
      calPastToggle.textContent = calShowPast ? "지난 입고일 숨기기" : "지난 입고일 보기";
      var note = $("#calNote");
      if (note) note.textContent = calShowPast ? "지난 입고일까지 모두 표시합니다." : "오늘 이후 입고 예정일만 표시합니다.";
      renderCalendar();
    });
  }

  /* 추첨 타임라인: 지난 일정 접기 */
  function buildScheduleFold() {
    var panel = $("#panel-schedule");
    if (!panel) return;
    var today = kstNow();
    var todayNum = ymdNum(today.y, today.m, today.d);
    var ul = panel.querySelector(".timeline");
    if (ul && !panel.querySelector(".timeline-now-label")) {
      var past = [];
      Array.prototype.forEach.call(ul.querySelectorAll("li"), function (li) {
        var end = li.getAttribute("data-end");
        if (!end) return;
        if (Number(end.replace(/-/g, "")) < todayNum) past.push(li);
      });

      var label = document.createElement("p");
      label.className = "timeline-now-label";
      label.textContent = past.length
        ? "다가오는 일정 · 지난 기록 " + past.length + "건은 아래에 접어 두었습니다."
        : "다가오는 일정";
      ul.parentNode.insertBefore(label, ul);

      if (past.length) {
        var box = document.createElement("details");
        box.className = "past-block";
        box.id = "pastTimeline";
        var sum = document.createElement("summary");
        sum.textContent = "지난 일정 보기 (" + past.length + "건)";
        var pul = document.createElement("ul");
        pul.className = "timeline is-past";
        past.forEach(function (li) { pul.appendChild(li); });
        box.appendChild(sum);
        box.appendChild(pul);
        ul.parentNode.appendChild(box);
      }
    }

    var chip = panel.querySelector(".cal-head .chip");
    if (chip) chip.textContent = "오늘 " + pad2(today.m) + "-" + pad2(today.d);
  }

  /* ------------------------------------------------- 도감 · 가이드 (세트별) */
  var SETS = D.SETS || [];
  var activeSetId = SETS.length ? SETS[0].id : "";
  var dexGrid = $("#dexGrid");
  var dexMoreWrap = $("#dexMoreWrap");
  var dexMore = $("#dexMore");
  var DEX_PAGE = 4; /* 도감은 처음 4장만 보이고 '더보기'로 펼침 */
  var dexExpanded = false;
  var dexCount = $("#dexCount");
  var dexEyebrow = $("#dexEyebrow");
  var dexDesc = $("#dexDesc");
  var dexNoteEl = $("#dexNote");
  var searchInput = $("#cardSearch");
  var searchClear = $("#cardSearchClear");
  var setPicker = $("#setPicker");
  var setSummary = $("#setSummary");
  var compareBody = $("#compareBody");
  var compareSub = $("#compareSub");
  var compareNote = $("#compareNote");
  var rarityChipsEl = $("#rarityChips");
  var thPrice = $("#thPrice");
  var thPerUnit = $("#thPerUnit");
  var calcSetName = $("#calcSetName");
  var calcHint = $("#calcHint");
  var calcPerPackLabel = $("#calcPerPackLabel");
  var query = "";
  var rarity = "all";

  var won = function (n) { return Number(n).toLocaleString("ko-KR") + "원"; };
  function signedRate(v) {
    var r = Math.round(v);
    if (r === 0) return "기준";
    return (r > 0 ? "+" : "−") + Math.abs(r) + "%";
  }

  var artClass = {
    fur: "art-fur", sar: "art-sar", ar: "art-ar", sr: "art-sr",
    ur: "art-ur", mur: "art-mur", bwr: "art-bwr", rr: "art-rr",
    deck: "art-deck", pika: "art-pika", classic: "art-classic", energy: "art-energy"
  };

  function artStyle(card) {
    var h = 0;
    for (var i = 0; i < card.id.length; i++) h = (h * 31 + card.id.charCodeAt(i)) % 360;
    if (card.tag === "fur") return "";
    if (card.tag === "classic") return "background:linear-gradient(150deg,hsl(38 32% 89%),hsl(32 26% 80%) 55%,hsl(26 22% 75%))";
    if (card.tag === "energy") return "background:linear-gradient(150deg,hsl(210 34% 89%),hsl(220 30% 81%) 55%,hsl(230 26% 85%))";
    if (card.tag === "deck") return "background:linear-gradient(150deg,hsl(40 44% 92%),hsl(34 32% 85%) 55%,hsl(46 42% 91%))";
    var base =
      card.tag === "pika" ? 44 :
      card.tag === "sar" ? 330 :
      card.tag === "ur" ? 42 :
      card.tag === "mur" ? 275 :
      card.tag === "bwr" ? 220 :
      card.tag === "sr" ? 196 :
      card.tag === "rr" ? 165 : 200;
    var hue = (base + (h % 150) - 75 + 360) % 360;
    return "background:linear-gradient(150deg,hsl(" + hue + " 72% 89%),hsl(" + ((hue + 46) % 360) + " 68% 83%) 55%,hsl(" + ((hue + 92) % 360) + " 62% 89%))";
  }

  function activeSet() {
    for (var i = 0; i < SETS.length; i++) if (SETS[i].id === activeSetId) return SETS[i];
    return SETS[0];
  }
  function isDeck(s) { return !s || s.packsPerBox <= 1; }

  function renderSetNav() {
    if (!setPicker) return;
    setPicker.innerHTML = "";
    SETS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "set-chip" + (s.id === activeSetId ? " is-active" : "");
      b.setAttribute("data-set", s.id);
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", s.id === activeSetId ? "true" : "false");
      b.innerHTML = "<strong>" + s.short + "</strong><small>" + s.code + " · " + s.release.replace(/-/g, ".") + "</small>";
      b.addEventListener("click", function () { selectSet(s.id); });
      setPicker.appendChild(b);
    });
    var act = setPicker.querySelector(".set-chip.is-active");
    if (act && setPicker.scrollWidth > setPicker.clientWidth + 4) {
      setPicker.scrollLeft = Math.max(0, act.offsetLeft - 10);
    }
  }

  function renderSetSummary() {
    if (!setSummary) return;
    var s = activeSet();
    var deck = isDeck(s);
    var kreamTxt = (s.kream || []).map(function (k) { return won(k.price); });
    var main = s.kream && s.kream[0];
    var rate = main ? ((main.price - s.boxPrice) / s.boxPrice) * 100 : 0;
    var rows = [];
    rows.push(["발매일", s.release]);
    rows.push([
      "구성",
      deck ? "카드 " + s.cardsPerPack + "장 + 플레이 용품" :
        "1팩 " + s.cardsPerPack + "장 · 1박스 " + s.packsPerBox + "팩(카드 " + s.packsPerBox * s.cardsPerPack + "장)"
    ]);
    rows.push([
      "공식 정가",
      deck ? won(s.boxPrice) + " (1세트)" : won(s.packPrice) + " / 1박스 " + won(s.boxPrice)
    ]);
    rows.push(["수록 카드", s.total]);
    rows.push([
      "KREAM 즉시구매",
      kreamTxt.length ? kreamTxt.join(" · ") + " (" + signedRate(rate) + ")" : "미확인"
    ]);

    var links = [];
    if (s.official) links.push('<a href="' + s.official + '" target="_blank" rel="noopener">공식 제품 정보 ↗</a>');
    if (s.extraLink) links.push('<a href="' + s.extraLink.url + '" target="_blank" rel="noopener">' + s.extraLink.label + " ↗</a>");
    (s.kream || []).forEach(function (k, i) {
      links.push('<a href="' + k.url + '" target="_blank" rel="noopener">KREAM 시세' + (i > 0 ? " (" + (i + 1) + ")" : "") + " ↗</a>");
    });

    setSummary.innerHTML =
      '<div class="ss-head">' +
      '<span class="ss-code">' + s.code + " · " + s.series + "</span>" +
      '<h2 class="ss-name">' + s.short + "</h2>" +
      "</div>" +
      '<p class="ss-summary">' + s.summary + "</p>" +
      '<dl class="ss-grid">' +
      rows.map(function (r) {
        return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>";
      }).join("") +
      "</dl>" +
      '<div class="ss-links">' + links.join("") + "</div>";
  }

  function renderCompare() {
    var s = activeSet();
    var deck = isDeck(s);
    var unit = deck ? "세트" : "팩";
    var packs = deck ? 1 : s.packsPerBox;
    if (thPrice) thPrice.textContent = deck ? "세트 가격" : "박스 가격";
    if (thPerUnit) thPerUnit.textContent = unit + "당 단가";
    if (calcPerPackLabel) calcPerPackLabel.textContent = unit + "당 단가";
    if (!compareBody) return;

    var rows = [{
      label: "공식 정가 (" + (deck ? "1세트" : "1박스·" + packs + "팩") + ")",
      price: s.boxPrice,
      base: true
    }];
    (s.extra || []).forEach(function (x) { rows.push({ label: x.label, price: x.price }); });
    (s.kream || []).forEach(function (x) { rows.push({ label: x.label, price: x.price }); });

    compareBody.innerHTML = rows.map(function (r) {
      var per = Math.round(r.price / packs);
      var pct = ((r.price - s.boxPrice) / s.boxPrice) * 100;
      var cls = r.base || pct < 0 ? "flat" : pct > 0 ? "up" : "";
      return "<tr><td>" + r.label + "</td>" +
        '<td class="num">' + won(r.price) + "</td>" +
        '<td class="num">' + won(per) + "</td>" +
        '<td class="num ' + cls + '">' + (r.base ? "기준" : signedRate(pct)) + "</td></tr>";
    }).join("");

    if (compareSub) {
      compareSub.innerHTML = deck
        ? "정가 " + won(s.boxPrice) + "(" + s.total + ")를 2026-11-17 KREAM 즉시구매 최저가와 비교한 값입니다."
        : "정가 기준 1박스 " + won(s.boxPrice) + " = " + unit + "당 " + won(Math.round(s.boxPrice / packs)) +
          ". 아래는 2026-11-17 KREAM 한글판 1박스 즉시구매 최저가를 정가와 비교한 값입니다(배송비·검수 수수료 별도).";
    }
    if (compareNote) {
      var links = (s.kream || []).map(function (k, i) {
        return '<a href="' + k.url + '" target="_blank" rel="noopener">' + k.label + "</a>";
      }).join(" · ");
      compareNote.innerHTML =
        "KREAM 시세는 2026-11-17 확인 기준 즉시구매 최저가입니다(한글판 " + (deck ? "스타터 세트" : "1박스") +
        "). 배송비(빠른배송 5,000원 · 일반배송 3,000원)와 검수 수수료는 별도이고, 시점과 박스 상태(슈링크 여부)에 따라 달라집니다. " +
        links;
    }
  }

  function renderRarityChips() {
    if (!rarityChipsEl) return;
    var s = activeSet();
    var seen = [];
    s.cards.forEach(function (c) {
      if (seen.indexOf(c.rarity) === -1) seen.push(c.rarity);
    });
    var html = '<button type="button" class="rarity-chip' + (rarity === "all" ? " is-active" : "") + '" data-rarity="all">전체</button>';
    seen.forEach(function (r) {
      html += '<button type="button" class="rarity-chip' + (rarity === r ? " is-active" : "") + '" data-rarity="' + r + '">' + r + "</button>";
    });
    rarityChipsEl.innerHTML = html;
  }

  function cardMatches(card) {
    if (rarity !== "all" && card.rarity !== rarity) return false;
    if (!query) return true;
    var hay = (card.name + " " + card.rarity + " " + (card.num || "") + " " + (card.illus || "") + " " + card.note).toLowerCase();
    return hay.indexOf(query.toLowerCase()) !== -1;
  }

  function syncDexMore(total) {
    if (!dexMoreWrap || !dexMore) return;
    if (total <= DEX_PAGE) {
      dexExpanded = false;
      dexMoreWrap.hidden = true;
      return;
    }
    dexMoreWrap.hidden = false;
    dexMore.setAttribute("aria-expanded", dexExpanded ? "true" : "false");
    dexMore.textContent = dexExpanded
      ? "접기"
      : "더보기 (" + (total - DEX_PAGE) + "장 더 보기)";
  }

  function renderDex() {
    if (!dexGrid) return;
    var s = activeSet();
    var list = s.cards.filter(cardMatches);
    dexGrid.innerHTML = "";
    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "dex-empty";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "‘" + query + "’에 해당하는 카드가 없습니다. 다른 이름이나 레어도로 찾아보세요.";
      dexGrid.appendChild(empty);
    }
    var shown = dexExpanded ? list : list.slice(0, DEX_PAGE);
    shown.forEach(function (card) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dex-card";
      btn.setAttribute("data-card", card.id);
      btn.innerHTML =
        '<span class="dex-art ' + (artClass[card.tag] || "art-energy") + '" data-mark="' + (s.mark || "") + '" style="' + artStyle(card) + '">' +
        '<span class="rarity-tag">' + card.rarity + "</span>" +
        (card.num ? '<span class="art-num">' + card.num + "</span>" : "") +
        '<span class="art-name">' + card.name + "</span>" +
        "</span>" +
        '<span class="dex-info">' +
        "<strong>" + card.name + "</strong>" +
        "<small>" + card.rarity + (card.num ? " · " + card.num : "") + (card.illus ? " · " + card.illus : "") + "</small>" +
        '<span class="dex-note">' + card.note + "</span>" +
        "</span>";
      btn.addEventListener("click", function () { openCardModal(card); });
      dexGrid.appendChild(btn);
    });
    if (dexCount) {
      dexCount.textContent = query || rarity !== "all" ? "검색 결과 " + list.length + "장" : "전체 " + s.cards.length + "장";
    }
    if (searchClear) searchClear.hidden = !query;
    if (dexEyebrow) dexEyebrow.textContent = s.short + " 도감";
    if (dexDesc) dexDesc.innerHTML = "<strong>" + s.total + "</strong> · " + s.summary;
    if (dexNoteEl) dexNoteEl.textContent = s.dexNote || "";
    syncDexMore(list.length);
  }

  function selectSet(id) {
    trackEvent("dex_set_select", { set_id: id });
    activeSetId = id;
    rarity = "all";
    dexExpanded = false; /* 세트를 바꾸면 다시 4장만 */
    renderSetNav();
    renderSetSummary();
    renderCompare();
    renderRarityChips();
    renderDex();
    runCalc();
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      query = searchInput.value.trim();
      renderDex();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", function () {
      searchInput.value = "";
      query = "";
      renderDex();
      searchInput.focus();
    });
  }
  if (rarityChipsEl) {
    rarityChipsEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".rarity-chip");
      if (!btn) return;
      $$(".rarity-chip", rarityChipsEl).forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      rarity = btn.getAttribute("data-rarity");
      renderDex();
    });
  }
  if (dexMore) {
    dexMore.addEventListener("click", function () {
      dexExpanded = !dexExpanded;
      renderDex();
      trackEvent("dex_expand", { expanded: dexExpanded });
      if (!dexExpanded && dexGrid) {
        var top = dexGrid.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top > 0 ? top : 0, behavior: "smooth" });
      }
    });
  }

  /* --------------------------------------------------------------- FAQ */
  /* 처음 3개만 보이고 '더보기 (N개 더 보기)' / '접기'로 펼침 (도감 더보기와 같은 방식) */
  var FAQ_PAGE = 3;
  var faqList = $("#faqList");
  var faqItems = $$(".faq-item");
  var faqMoreWrap = $("#faqMoreWrap");
  var faqMore = $("#faqMore");
  var faqExpanded = false;

  function syncFaqMore() {
    var total = faqItems.length;
    if (!faqMoreWrap || !faqMore) return;
    if (total <= FAQ_PAGE) {
      faqExpanded = false;
      faqMoreWrap.hidden = true;
      faqItems.forEach(function (item) { item.classList.remove("is-faq-hidden"); });
      return;
    }
    faqMoreWrap.hidden = false;
    faqMore.setAttribute("aria-expanded", faqExpanded ? "true" : "false");
    faqMore.textContent = faqExpanded
      ? "접기"
      : "더보기 (" + (total - FAQ_PAGE) + "개 더 보기)";
    faqItems.forEach(function (item, i) {
      var hide = !faqExpanded && i >= FAQ_PAGE;
      item.classList.toggle("is-faq-hidden", hide);
      if (hide) item.open = false;
    });
  }

  faqItems.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (!item.open) return;
      faqItems.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  if (faqMore) {
    faqMore.addEventListener("click", function () {
      faqExpanded = !faqExpanded;
      syncFaqMore();
      trackEvent("faq_expand", { expanded: faqExpanded });
      if (!faqExpanded && faqList) {
        var top = faqList.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top > 0 ? top : 0, behavior: "smooth" });
      }
    });
  }
  syncFaqMore();

  /* ------------------------------------------------------------ 계산기 */
  var calcInput = $("#calcInput");
  var calcBtn = $("#calcBtn");
  var calcPerPack = $("#calcPerPack");
  var calcDiff = $("#calcDiff");
  var calcRate = $("#calcRate");
  var calcVerdict = $("#calcVerdict");
  var fmt = function (n) { return Number(n).toLocaleString("ko-KR"); };

  function runCalc() {
    if (!calcInput) return;
    var s = activeSet();
    var deck = isDeck(s);
    var packs = deck ? 1 : s.packsPerBox;
    var unit = deck ? "세트" : "팩";
    var priceWord = deck ? "세트" : "박스";
    if (calcSetName) calcSetName.textContent = "· " + s.short;
    if (calcHint) {
      calcHint.textContent = priceWord + " 가격을 넣으면 " + unit + "당 단가와 정가(" + won(s.boxPrice) + ") 대비 차액을 계산합니다.";
    }
    var raw = Number(String(calcInput.value).replace(/[^0-9]/g, ""));
    if (!raw || raw <= 0) {
      calcPerPack.textContent = "-";
      calcDiff.textContent = "-";
      calcRate.textContent = "-";
      calcRate.className = "";
      calcVerdict.textContent = "정가 " + won(s.boxPrice) + "(" + s.short + ")을 기준으로 판단합니다.";
      return;
    }
    var perPack = Math.round(raw / packs);
    var diff = raw - s.boxPrice;
    var rate = Math.round((diff / s.boxPrice) * 1000) / 10;

    calcPerPack.textContent = fmt(perPack) + "원";
    calcDiff.textContent = (diff > 0 ? "+" : diff < 0 ? "−" : "") + fmt(Math.abs(diff)) + "원";
    calcRate.textContent = (rate > 0 ? "+" : rate < 0 ? "−" : "") + Math.abs(rate) + "%";
    calcRate.className = rate > 30 ? "is-bad" : rate <= 5 ? "is-good" : "";

    if (rate <= 0) {
      calcVerdict.textContent = "정가 이하입니다. 판매 조건(정품·미개봉·배송비)을 확인하세요.";
    } else if (rate <= 5) {
      calcVerdict.textContent = "정가 수준입니다(배송비 포함 범위). 무리 없이 구매할 수 있는 가격대입니다.";
    } else if (rate <= 30) {
      calcVerdict.textContent = "정가보다 조금 비쌉니다. 배송비까지 포함한 총액으로 다시 비교해 보세요.";
    } else {
      calcVerdict.textContent = "정가보다 크게 비쌉니다. 정가 재고를 먼저 확인하는 것을 권합니다.";
    }
  }
  if (calcBtn) calcBtn.addEventListener("click", runCalc);
  if (calcInput) {
    calcInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); runCalc(); }
    });
  }

  /* --------------------------------------------------------------- 모달 */
  var backdrop = $("#modalBackdrop");
  var modalTitle = $("#modalTitle");
  var modalBody = $("#modalBody");
  var modalClose = $("#modalClose");
  var lastFocus = null;

  /* ------------------------------------------- 관리자 문의 (정적 사이트 단독 동작) */
  /* 서버 없이도 100% 동작해야 하므로 mailto: 와 이메일·내용 복사만 쓴다.
     회사복지모아 API(https://bokjimoa.onrender.com/api/inquiries)는 CORS가 열려 있지만
     이 사이트는 호출하지 않는다. 나중에 연동하더라도 아래 두 경로는 그대로 남긴다. */
  var INQUIRY_EMAIL = "acewoni3717@gmail.com";
  var pendingInquiryType = "";

  function inquiryTypeValue() {
    var el = modalBody && modalBody.querySelector("#inquiryType");
    return el ? el.value : "기타";
  }

  /* 메일 제목·본문 — 받는 사람이 유형·제목·내용·보낸 페이지를 바로 알 수 있게 만든다 */
  function buildInquiryMail() {
    var subjectEl = modalBody ? modalBody.querySelector("#inquirySubject") : null;
    var bodyEl = modalBody ? modalBody.querySelector("#inquiryBody") : null;
    var type = inquiryTypeValue();
    var subject = subjectEl ? subjectEl.value.trim() : "";
    var body = bodyEl ? bodyEl.value.trim() : "";
    var where = (location.origin && location.origin !== "null")
      ? location.origin + location.pathname
      : "포켓몬카드모아";
    return {
      subject: "[포켓몬카드모아 관리자 문의] " + (subject || type),
      body: [
        "문의 유형: " + type,
        "제목: " + (subject || "(없음)"),
        "",
        body,
        "",
        "--",
        "보낸 곳: " + where + " (" + new Date().toLocaleString("ko-KR") + ")"
      ].join("\n")
    };
  }

  function copyText(text, okMsg, failMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMsg : failMsg);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else {
      fallback();
    }
  }

  function initInquiryForm(form) {
    var typeEl = form.querySelector("#inquiryType");
    var subjectEl = form.querySelector("#inquirySubject");
    var bodyEl = form.querySelector("#inquiryBody");
    if (typeEl && pendingInquiryType) typeEl.value = pendingInquiryType;
    pendingInquiryType = "";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (bodyEl && !bodyEl.value.trim()) {
        toast("문의 내용을 적어 주세요.");
        bodyEl.focus();
        return;
      }
      var mail = buildInquiryMail();
      trackEvent("admin_inquiry", { method: "mailto", inquiry_type: inquiryTypeValue() });
      window.location.href = "mailto:" + INQUIRY_EMAIL +
        "?subject=" + encodeURIComponent(mail.subject) +
        "&body=" + encodeURIComponent(mail.body);
      toast("메일 앱이 열립니다. 열리지 않으면 이메일 복사로 주소를 복사해 보내주세요.");
    });

    var copyEmailBtn = form.querySelector("#inquiryCopyEmail");
    if (copyEmailBtn) {
      copyEmailBtn.addEventListener("click", function () {
        copyText(INQUIRY_EMAIL,
          "운영자 이메일을 복사했습니다 · " + INQUIRY_EMAIL,
          "복사하지 못했습니다. 메일 주소를 길게 눌러 선택해 주세요.");
        trackEvent("admin_inquiry", { method: "copy_email", inquiry_type: inquiryTypeValue() });
      });
    }

    var copyBodyBtn = form.querySelector("#inquiryCopyBody");
    if (copyBodyBtn) {
      copyBodyBtn.addEventListener("click", function () {
        var mail = buildInquiryMail();
        copyText("받는 사람: " + INQUIRY_EMAIL + "\n제목: " + mail.subject + "\n\n" + mail.body,
          "문의 내용을 복사했습니다. 메일에 붙여넣어 보내주세요.",
          "복사하지 못했습니다. 내용을 길게 눌러 선택해 주세요.");
        trackEvent("admin_inquiry", { method: "copy_body", inquiry_type: inquiryTypeValue() });
      });
    }
  }

  function openModalFromTemplate(key, title) {
    var tpl = document.getElementById("tpl-" + key);
    if (!tpl || !backdrop) return;
    lastFocus = document.activeElement;
    modalTitle.textContent = title;
    modalBody.innerHTML = "";
    modalBody.appendChild(tpl.content.cloneNode(true));
    backdrop.hidden = false;
    document.body.classList.add("no-scroll");
    modalBody.scrollTop = 0;
    setTimeout(function () { if (modalClose) modalClose.focus(); }, 20);

    var form = modalBody.querySelector("#inquiryForm");
    if (form) initInquiryForm(form);
  }

  function openCardModal(card) {
    if (!backdrop) return;
    var tpl = document.getElementById("tpl-card");
    lastFocus = document.activeElement;
    modalTitle.textContent = "카드 정보";
    modalBody.innerHTML = "";
    modalBody.appendChild(tpl.content.cloneNode(true));
    var art = modalBody.querySelector("#modalCardArt");
    art.className = "dex-modal-art " + (artClass[card.tag] || "art-energy");
    modalBody.querySelector("#modalCardName").textContent = card.name;
    modalBody.querySelector("#modalCardTitle").textContent = card.name;
    var meta = modalBody.querySelector("#modalCardMeta");
    var bits = [card.rarity];
    if (card.num) bits.push(card.num);
    if (card.illus) bits.push("Illus. " + card.illus);
    bits.forEach(function (t) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      meta.appendChild(chip);
    });
    modalBody.querySelector("#modalCardNote").textContent = card.note;
    backdrop.hidden = false;
    document.body.classList.add("no-scroll");
    setTimeout(function () { if (modalClose) modalClose.focus(); }, 20);
  }

  function closeModal() {
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    document.body.classList.remove("no-scroll");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $$("[data-modal]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var key = btn.getAttribute("data-modal");
      var titles = {
        about: "포켓몬카드모아 소개",
        privacy: "개인정보처리방침",
        terms: "이용약관",
        inquiry: "관리자 문의"
      };
      pendingInquiryType = btn.getAttribute("data-inquiry-type") || "";
      openModalFromTemplate(key, titles[key] || "포켓몬카드모아");
    });
  });
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (backdrop) {
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  /* ---------------------------------------- 정가 구매처 밖으로 나가는 클릭 */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest
      ? e.target.closest(".channel-links a[href^='http'], .store-shortcut[href^='http']")
      : null;
    if (!a) return;
    var card = a.closest(".channel-card, .store-shortcut");
    var nameEl = card ? card.querySelector(".channel-name, .store-shortcut-name") : null;
    trackEvent("store_outbound_click", {
      store_name: nameEl ? nameEl.textContent.trim() : "",
      url: a.href
    });
  });

  /* ------------------------------------------- 쿠팡 파트너스 영역 반응 */
  /* iframe 내부 클릭은 cross-origin이라 부모 페이지에서 볼 수 없다. 카드·슬롯 상자의
     클릭·포커스만 집계하고, 슬롯이 없으면 카드 ID를 slot으로 쓴다. */
  function affiliateSlotOf(el) {
    var card = el && el.closest ? el.closest("[data-affiliate-card], .affiliate") : null;
    if (!card) return "";
    var slot = el.closest("[data-affiliate-slot]");
    if (slot) return slot.getAttribute("data-affiliate-slot") || "";
    return card.getAttribute("data-affiliate-card") || "";
  }
  document.addEventListener("click", function (e) {
    var slot = affiliateSlotOf(e.target);
    if (slot) trackEvent("affiliate_interact", { slot: slot, action: "click" });
  }, true);
  document.addEventListener("focusin", function (e) {
    var slot = affiliateSlotOf(e.target);
    if (slot) trackEvent("affiliate_interact", { slot: slot, action: "focus" });
  });

  /* --------------------------------------------------------- 제휴 링크 */
  $$("[data-affiliate]").forEach(function (a) {
    // 실제 파트너스 링크가 들어간 자리는 그대로 새 창으로 이동한다
    var href = a.getAttribute("href") || "";
    if (/^https?:/i.test(href)) return;
    a.addEventListener("click", function (e) {
      e.preventDefault();
      toast("제휴 링크 자리입니다. 배포 시 실제 쿠팡 파트너스 링크로 교체됩니다.");
    });
  });

  /* ------------------------------------------------------- 모바일 하단광고 */
  var mobileAd = $("#mobileAd");
  var mobileAdClose = $("#mobileAdClose");
  function maybeShowMobileAd() {
    if (!mobileAd || mobileAd.hidden) return;
    if (window.scrollY > 320) mobileAd.classList.add("is-visible");
  }
  window.addEventListener("scroll", maybeShowMobileAd, { passive: true });
  maybeShowMobileAd();
  if (mobileAdClose) {
    mobileAdClose.addEventListener("click", function () {
      mobileAd.hidden = true;
    });
  }

  /* ------------------------------------- 다른 확장팩·박스 정가 구매처 (v4.6) */
  /* 정가 구매처 탭 안에서 30th가 아닌 박스를 골라 그 박스의 정가·KREAM 시세와
     공식/인증 판매처 링크를 보여 줍니다. 판매처 URL·재고 표시는 data.js의
     STORE_CHECK(2026-11-18) 기준이고, 실시간 재고·금액은 판매처 페이지에서 확인합니다. */
  var BOX_SETS = SETS.filter(function (s) { return s.id !== "m6a"; });
  var boxPicker = $("#boxPicker");
  var boxBoard = $("#boxBoard");
  var activeBoxId = BOX_SETS.length ? BOX_SETS[0].id : "";

  function boxSetById(id) {
    for (var i = 0; i < BOX_SETS.length; i++) if (BOX_SETS[i].id === id) return BOX_SETS[i];
    return BOX_SETS[0];
  }

  function renderBoxPicker() {
    if (!boxPicker) return;
    boxPicker.innerHTML = "";
    BOX_SETS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "set-chip" + (s.id === activeBoxId ? " is-active" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", s.id === activeBoxId ? "true" : "false");
      b.innerHTML = "<strong>" + escapeHtml(s.short) + "</strong><small>" +
        escapeHtml(s.code) + " · " + escapeHtml(won(s.boxPrice)) + "</small>";
      b.addEventListener("click", function () {
        if (activeBoxId === s.id) return;
        activeBoxId = s.id;
        renderBoxPicker();
        renderBoxBoard();
      });
      boxPicker.appendChild(b);
    });
    var act = boxPicker.querySelector(".set-chip.is-active");
    if (act && boxPicker.scrollWidth > boxPicker.clientWidth + 4) {
      boxPicker.scrollLeft = Math.max(0, act.offsetLeft - 10);
    }
  }

  function renderBoxBoard() {
    if (!boxBoard) return;
    var s = boxSetById(activeBoxId);
    if (!s) return;
    var deck = isDeck(s);
    var packs = deck ? 1 : s.packsPerBox;
    var kream = (s.kream || [])[0];
    var rate = kream ? ((kream.price - s.boxPrice) / s.boxPrice) * 100 : 0;
    var cells = [
      ["발매일", escapeHtml(s.release)],
      [deck ? "세트 정가" : "1팩 정가", deck ? won(s.boxPrice) : won(s.packPrice), deck],
      [deck ? "구성" : "1박스 정가", deck ? "카드 " + s.cardsPerPack + "장 + 플레이 용품" : won(s.boxPrice), !deck],
      deck
        ? null
        : ["1박스 구성", packs + "팩 · 카드 " + packs * s.cardsPerPack + "장"],
      ["KREAM 참고 시세", kream ? won(kream.price) + ' <em>' + signedRate(rate) + "</em>" : "미확인"],
      ["수록 카드", escapeHtml(s.total)]
    ].filter(Boolean);
    var links = [];
    if (s.official) links.push('<a href="' + s.official + '" target="_blank" rel="noopener">공식 제품 정보 ↗</a>');
    if (kream) links.push('<a href="' + kream.url + '" target="_blank" rel="noopener">KREAM 시세 ↗</a>');
    links.push('<button type="button" class="box-dex-btn" data-box-dex="' + s.id + '">이 박스 도감·시세 비교 →</button>');

    var stores = (s.stores || []).map(function (st) {
      var line = st.state
        ? '<span class="store-state ' + (st.stateKind || "none") + '">' + escapeHtml(st.state) + "</span>"
        : '<span class="store-sub">' + escapeHtml(st.sub || "검색 바로가기") + "</span>";
      return '<a class="store-shortcut" href="' + st.url + '" target="_blank" rel="noopener" data-store="' + st.id + '"' +
        ' aria-label="' + escapeHtml((st.short || "") + " · " + (st.label || "") + " (새 창)") + '">' +
        '<span class="store-badge" style="--brand:' + (st.brand || "#e9eef7") + ';--brand-ink:' + (st.brandInk || "#10203c") + '">' + escapeHtml(st.initial || "") + "</span>" +
        '<span class="store-shortcut-body"><strong class="store-shortcut-name">' + escapeHtml(st.short || "") + "</strong>" + line + "</span>" +
        '<span class="store-go" aria-hidden="true">↗</span>' +
        "</a>";
    }).join("");

    boxBoard.innerHTML =
      '<div class="box-head"><span class="ss-code">' + escapeHtml(s.code + " · " + s.series) + "</span>" +
      '<h3 class="box-name">' + escapeHtml(s.short) + "</h3></div>" +
      '<p class="box-sub">' + escapeHtml(s.name) + " · " + escapeHtml(s.release) + " 발매</p>" +
      '<dl class="box-price">' +
      cells.map(function (c) {
        return '<div' + (c[2] ? ' class="is-key"' : '') + "><dt>" + c[0] + "</dt><dd>" + c[1] + "</dd></div>";
      }).join("") +
      "</dl>" +
      '<div class="box-links">' + links.join("") + "</div>" +
      (s.storeMemo ? '<p class="box-memo"><b>확인 메모</b> — ' + escapeHtml(s.storeMemo) + "</p>" : "") +
      '<div class="box-store-head"><h4>정가 구매처</h4><span>' + (s.stores || []).length +
      "곳 · " + escapeHtml((D.STORE_CHECK || "") + " 확인") + "</span></div>" +
      '<div class="box-store-grid">' + stores + "</div>";

    var dexBtn = boxBoard.querySelector("[data-box-dex]");
    if (dexBtn) {
      dexBtn.addEventListener("click", function () {
        showTab("guide");
        selectSet(s.id);
      });
    }
  }

  /* =========================================================================
   * 시세·이슈·신규팩·팝수 (v4.9)
   * - 시세: data.js 의 kreamMovers(2026-11-18 KREAM 확인값)를 그대로 그립니다.
   *   태블릿 중계({relay}/api/kream-movers)가 연결되면 같은 자리를 실시간 값으로
   *   바꾸고, 응답이 없거나 형식이 다르면 정적 값으로 남겨 둡니다.
   * - 팝수: 도감·번호 인덱스에서 찾아 기본 정보와 바로가기를 보여 주고,
   *   중계의 /api/pop?q= 가 응답하면 팝수를 함께 표시합니다.
   * ========================================================================= */
  var KC = D.KREAM_CHECKED || {};
  var MOVERS = (D.kreamMovers || []).slice();
  var CARD_NUMBERS = D.cardNumbers || [];
  var CARD_RANGES = D.cardRanges || [];
  var POP_TOOLS = D.popTools || {};

  var moverGrid = $("#moverGrid");
  var kreamTableBody = $("#kreamTableBody");
  var kreamBoardSub = $("#kreamBoardSub");
  var kreamRelayBadge = $("#kreamRelayBadge");
  var trendStats = $("#trendStats");
  var kreamLiveLink = $("#kreamLiveLink");
  var issueList = $("#issueList");
  var releaseGrid = $("#releaseGrid");

  var popForm = $("#popForm");
  var popQueryEl = $("#popQuery");
  var popChips = $("#popChips");
  var popLinks = $("#popLinks");
  var popResults = $("#popResults");
  var popRelayStatus = $("#popRelayStatus");
  var popRelaySeq = 0;

  function won(n) {
    if (n == null || isNaN(n)) return "-";
    return Number(n).toLocaleString("ko-KR") + "원";
  }
  function signed(n) {
    if (n == null || isNaN(n)) return "-";
    return (n > 0 ? "+" : n < 0 ? "-" : "") + Math.abs(Number(n)).toLocaleString("ko-KR");
  }
  function pctAbs(n) {
    if (n == null || isNaN(n)) return "";
    return Math.abs(Number(n)).toFixed(1).replace(/\.0$/, "") + "%";
  }
  function pctOf(n) {
    if (n == null || isNaN(n)) return "";
    return (n > 0 ? "+" : n < 0 ? "-" : "") + pctAbs(n);
  }
  function relDirection(m) {
    if (m.dir === "up") return "up";
    if (m.dir === "down") return "down";
    if (m.dir === "flat") return "flat";
    return "na";
  }
  function artFor(item) {
    var c = artClass[item.tag];
    if (c) return c;
    return "art-sar";
  }
  function artGradient(item) {
    if (item.tag === "fur") return "";
    if (item.tag === "classic") return "background:linear-gradient(150deg,hsl(38 32% 89%),hsl(32 26% 80%) 55%,hsl(26 22% 75%))";
    if (item.tag === "ar") return "background:linear-gradient(150deg,hsl(198 60% 90%),hsl(150 42% 88%) 55%,hsl(44 70% 90%))";
    return "background:linear-gradient(150deg,hsl(330 70% 92%),hsl(292 58% 89%) 55%,hsl(258 56% 92%))";
  }
  function relayUrl() {
    try { return localStorage.getItem("pokemoa.relayUrl") || ""; } catch (e) { return ""; }
  }

  /* --------------------------------------------------- 오늘 오른 카드 */
  function renderTrendStats(list) {
    if (!trendStats) return;
    var up = 0, down = 0, flat = 0, na = 0;
    list.forEach(function (m) {
      var d = relDirection(m);
      if (d === "up") up++; else if (d === "down") down++;
      else if (d === "flat") flat++; else na++;
    });
    trendStats.innerHTML =
      '<span class="trend-stat is-up"><b>' + up + '</b>장 상승</span>' +
      '<span class="trend-stat is-down"><b>' + down + '</b>장 하락</span>' +
      '<span class="trend-stat"><b>' + flat + '</b>장 보합</span>' +
      (na ? '<span class="trend-stat"><b>' + na + '</b>장 비교 불가</span>' : "") +
      '<span class="trend-stat is-src">' + escapeHtml((KC.label || "KREAM") + " · " + (KC.date || "") + " " + (KC.time || "") + " 확인") + "</span>";
  }

  function renderMovers(list) {
    if (!moverGrid) return;
    var rising = list.filter(function (m) { return relDirection(m) === "up"; });
    rising.sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });
    if (!rising.length) {
      moverGrid.innerHTML = '<p class="mover-empty">지금 확인된 상승 체결이 없습니다. 아래 표에서 오늘 체결 전체를 볼 수 있습니다.</p>';
      return;
    }
    moverGrid.innerHTML = rising.slice(0, 4).map(function (m, i) {
      return '<article class="mover-card">' +
        '<span class="mover-rank">' + (i + 1) + '</span>' +
        '<span class="mover-art ' + artFor(m) + '" data-mark="' + escapeHtml((m.num || "").split("/")[0] || "") + '" style="' + artGradient(m) + '">' +
          '<span class="mover-rarity">' + escapeHtml(m.rarity || "") + '</span>' +
          '<span class="mover-num">' + escapeHtml(m.num || "") + '</span>' +
        '</span>' +
        '<div class="mover-body">' +
          '<div class="mover-top"><strong>' + escapeHtml(m.name) + '</strong>' +
            (m.kreamId ? '<a class="mover-kream" href="' + m.url + '" target="_blank" rel="noopener" data-kream-out="' + m.kreamId + '">KREAM ↗</a>' : '') +
          '</div>' +
          '<div class="mover-price"><b>' + won(m.lastPrice) + '</b>' +
            '<span class="mover-delta is-up">▲ ' + pctAbs(m.pct) + '</span></div>' +
          '<p class="mover-meta">최근 체결 <b>' + escapeHtml(m.lastWhen || "") + '</b> · 직전 ' + won(m.prevPrice) + '(' + escapeHtml(m.prevWhen || "") + ') · 누적 ' + (m.trades || 0) + '건</p>' +
          '<p class="mover-note">' + escapeHtml(m.set || "") + ' · ' + escapeHtml(m.model || "") + '</p>' +
          '<button type="button" class="mover-pop" data-pop-num="' + escapeHtml(m.num || "") + '">' + escapeHtml(m.num || "") + ' 팝수 조회 →</button>' +
        '</div>' +
      '</article>';
    }).join("");
    $$("[data-pop-num]", moverGrid).forEach(function (b) {
      b.addEventListener("click", function () {
        showTab("trends");
        if (popQueryEl) popQueryEl.value = b.getAttribute("data-pop-num");
        runPopSearch(b.getAttribute("data-pop-num"), "mover");
        var anchor = $("#popSection");
        if (anchor) setTimeout(function () { anchor.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
      });
    });
    $$("[data-kream-out]", moverGrid).forEach(function (a) {
      a.addEventListener("click", function () { trackEvent("kream_outbound", { from: "movers" }); });
    });
  }

  function renderKreamTable(list) {
    if (!kreamTableBody) return;
    var order = list.slice().sort(function (a, b) {
      var rank = { up: 0, flat: 1, down: 2, na: 3 };
      function r(m) {
        var v = rank[relDirection(m)];
        return v == null ? 3 : v;
      }
      var d = r(a) - r(b);
      if (d) return d;
      return Math.abs(b.pct || 0) - Math.abs(a.pct || 0);
    });
    kreamTableBody.innerHTML = order.map(function (m) {
      var dir = relDirection(m);
      var pctCell = dir === "na"
        ? '<span class="kream-na">비교 불가</span>'
        : '<span class="kream-pct is-' + dir + '">' + (dir === "up" ? "▲ " : dir === "down" ? "▼ " : "") + pctAbs(m.pct) + '</span>' +
          (m.diff ? '<small>(' + signed(m.diff) + '원)</small>' : "");
      var pageCell = m.pageDelta
        ? '<span class="kream-page is-' + m.pageDelta.kind + '">' + escapeHtml(m.pageDelta.text) + '</span><small>' + escapeHtml(m.pageDelta.note || "") + '</small>'
        : '<span class="kream-na">표시 없음</span>';
      return '<tr>' +
        '<td><a class="kream-name" href="' + m.url + '" target="_blank" rel="noopener" data-kream-out="' + m.kreamId + '">' + escapeHtml(m.name) + '</a>' +
          '<small class="kream-sub">' + escapeHtml(m.num || "") + ' · ' + escapeHtml(m.model || "") + '</small></td>' +
        '<td class="num">' + won(m.lastPrice) + '<small>' + escapeHtml(m.lastWhen || "") + '</small></td>' +
        '<td class="num">' + won(m.prevPrice) + '<small>' + escapeHtml(m.prevWhen || "") + '</small></td>' +
        '<td class="num">' + pctCell + '</td>' +
        '<td class="num">' + (m.trades || 0) + '건</td>' +
        '<td>' + pageCell + '</td>' +
      '</tr>';
    }).join("");
    $$("[data-kream-out]", kreamTableBody).forEach(function (a) {
      a.addEventListener("click", function () { trackEvent("kream_outbound", { from: "table" }); });
    });
  }

  function renderKreamNote(list) {
    if (kreamBoardSub) {
      kreamBoardSub.textContent = (KC.date || "") + " " + (KC.time || "") + " 확인 · 한글판 · 비로그인 공개 내역 · 수수료·배송비 별도 · " + list.length + "장";
    }
    if (kreamLiveLink && KC.collection) kreamLiveLink.href = KC.collection;
  }

  function applyMovers(list, source) {
    MOVERS = list;
    renderTrendStats(list);
    renderMovers(list);
    renderKreamTable(list);
    renderKreamNote(list);
    if (kreamRelayBadge) {
      kreamRelayBadge.textContent = source === "relay" ? "중계 실시간" : "정적 데이터";
      kreamRelayBadge.className = "chip " + (source === "relay" ? "chip-yellow" : "chip-line");
    }
  }

  var relayMoversTried = false;
  function loadRelayMovers() {
    renderTrendStats(MOVERS);
    renderMovers(MOVERS);
    renderKreamTable(MOVERS);
    renderKreamNote(MOVERS);
    if (relayMoversTried) return;
    relayMoversTried = true;
    trackEvent("trends_view", { cards: MOVERS.length });
    var base = relayUrl();
    if (!base) return;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 6000);
    fetch(base + "/api/kream-movers", { signal: ctrl.signal, mode: "cors", cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (payload) {
        if (payload && payload.ok && payload.items && payload.items.length) {
          applyMovers(payload.items, "relay");
          toast("중계에서 KREAM 시세 " + payload.items.length + "장을 받았습니다.");
        }
      })
      .catch(function () { /* 중계가 없으면 정적 값 그대로 */ })
      .finally(function () { clearTimeout(timer); });
  }

  /* ------------------------------------------------------- 카드 이슈 */
  function renderIssues() {
    if (!issueList) return;
    var items = D.cardIssues || [];
    issueList.innerHTML = items.map(function (it) {
      var links = (it.links || []).map(function (l) {
        return '<a href="' + l.url + '" target="_blank" rel="noopener" data-issue-out="' + escapeHtml(it.tag) + '">' + escapeHtml(l.label) + ' ↗</a>';
      }).join("");
      return '<li class="issue-item is-' + (it.kind || "etc") + '">' +
        '<div class="issue-side"><span class="issue-date">' + escapeHtml(it.date) + '</span>' +
          '<span class="issue-tag">' + escapeHtml(it.tag) + '</span></div>' +
        '<div class="issue-body"><h3>' + escapeHtml(it.title) + '</h3>' +
          '<p>' + escapeHtml(it.body) + '</p>' +
          '<div class="issue-links">' + links + '</div></div>' +
      '</li>';
    }).join("");
    $$("[data-issue-out]", issueList).forEach(function (a) {
      a.addEventListener("click", function () { trackEvent("issue_outbound", { tag: a.getAttribute("data-issue-out") }); });
    });
  }

  /* ---------------------------------------------------- 신규 팩 발매 */
  function renderReleases() {
    if (!releaseGrid) return;
    var items = D.newReleases || [];
    releaseGrid.innerHTML = items.map(function (r) {
      var chipCls = r.kind === "soon" ? "chip-yellow" : r.kind === "overseas" ? "chip-blue" : "chip-line";
      return '<article class="release-card is-' + (r.kind || "done") + '">' +
        '<div class="release-head"><span class="chip ' + chipCls + '">' + escapeHtml(r.status) + '</span>' +
          '<span class="release-date">' + escapeHtml(r.date) + '</span></div>' +
        '<h3>' + escapeHtml(r.name) + '</h3>' +
        '<p class="release-type">' + escapeHtml(r.type) + '</p>' +
        '<dl class="release-spec">' +
          '<div><dt>정가</dt><dd>' + escapeHtml(r.price) + '</dd></div>' +
          '<div><dt>구성</dt><dd>' + escapeHtml(r.config) + '</dd></div>' +
        '</dl>' +
        '<p class="release-note">' + escapeHtml(r.note || "") + '</p>' +
        '<div class="release-links">' +
          '<a href="' + r.url + '" target="_blank" rel="noopener" data-release-out="official">공식 제품 정보 ↗</a>' +
          (r.store ? '<a href="' + r.store + '" target="_blank" rel="noopener" data-release-out="store">스토어 상품 페이지 ↗</a>' : '') +
        '</div>' +
      '</article>';
    }).join("");
    $$("[data-release-out]", releaseGrid).forEach(function (a) {
      a.addEventListener("click", function () { trackEvent("release_outbound", { kind: a.getAttribute("data-release-out") }); });
    });
  }

  /* ------------------------------------------------------ 팝수 조회 */
  function normNum(raw) {
    var s = String(raw == null ? "" : raw).replace(/\s+/g, "");
    var m = s.match(/(\d{1,4})\/(\d{1,4})/);
    if (!m) return "";
    return parseInt(m[1], 10) + "/" + parseInt(m[2], 10);
  }
  function moverFor(item) {
    for (var i = 0; i < MOVERS.length; i++) {
      if (item.num && normNum(MOVERS[i].num) === normNum(item.num) && MOVERS[i].name === item.name) return MOVERS[i];
    }
    for (var j = 0; j < MOVERS.length; j++) {
      if (item.num && normNum(MOVERS[j].num) === normNum(item.num)) return MOVERS[j];
    }
    return null;
  }
  function popQueryText(item) {
    var parts = [];
    if (item.en) parts.push(item.en);
    else if (item.name) parts.push(item.name);
    if (item.num) parts.push(item.num);
    if (item.set && !item.en) parts.push(item.set);
    return parts.join(" ");
  }
  function priceChartingUrl(item) {
    var base = POP_TOOLS.pricecharting || "https://www.pricecharting.com/search-products?q=";
    var q = item && item.en ? (item.en + " " + (/30th/i.test(item.set || "") ? "30th Celebration" : (item.set || ""))) : (popQueryEl ? popQueryEl.value : "");
    return base + encodeURIComponent(q.trim()) + "&type=prices";
  }
  function copyText(text) {
    var value = String(text || "");
    if (!value) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () { return true; }).catch(function () { return legacyCopy(value); });
    }
    return Promise.resolve(legacyCopy(value));
  }
  function legacyCopy(value) {
    try {
      var ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function openExternal(url) {
    var w = window.open(url, "_blank", "noopener");
    if (w) w.opener = null;
  }

  function popMatches(raw) {
    var q = String(raw || "").trim();
    var out = { items: [], range: null, query: q };
    if (!q) return out;
    var num = normNum(q);
    var seen = {};
    function push(item) {
      var key = (item.set || "") + "|" + item.name + "|" + (item.num || "");
      if (seen[key]) return;
      seen[key] = 1;
      out.items.push(item);
    }
    if (num) {
      CARD_NUMBERS.forEach(function (c) { if (normNum(c.num) === num) push(c); });
      SETS.forEach(function (s) {
        (s.cards || []).forEach(function (c) {
          if (c.num && normNum(c.num) === num) {
            push({ name: c.name, num: c.num, rarity: c.rarity, tag: c.tag, set: s.short, note: c.note });
          }
        });
      });
      if (!out.items.length) {
        var parts = num.split("/");
        var no = parseInt(parts[0], 10), total = parseInt(parts[1], 10);
        CARD_RANGES.forEach(function (r) {
          if (r.total === total && no >= r.from && no <= r.to) {
            out.range = { set: r.set, label: r.label, note: r.note, num: no + "/" + total };
          }
        });
      }
      return out;
    }
    var needle = q.toLowerCase();
    CARD_NUMBERS.forEach(function (c) {
      if (String(c.name).toLowerCase().indexOf(needle) >= 0 || String(c.en || "").toLowerCase().indexOf(needle) >= 0) push(c);
    });
    SETS.forEach(function (s) {
      (s.cards || []).forEach(function (c) {
        if (String(c.name).toLowerCase().indexOf(needle) >= 0) {
          push({ name: c.name, num: c.num, rarity: c.rarity, tag: c.tag, set: s.short, note: c.note });
        }
      });
    });
    return out;
  }

  function renderPopLinks(context) {
    if (!popLinks) return;
    var q = context && context.query ? context.query : "";
    var item = context && context.items && context.items.length ? context.items[0] : null;
    var text = item ? popQueryText(item) : q;
    var kreamBase = POP_TOOLS.kream || "https://kream.co.kr/search?keyword=";
    var kreamKeyword = item ? (item.name + " " + (item.set || "")) : q;
    popLinks.innerHTML =
      '<button type="button" class="pop-link" data-pop-tool="psa"><b>PSA 팝 리포트</b><small>검색어 복사 후 열기</small></button>' +
      '<button type="button" class="pop-link" data-pop-tool="brg"><b>BRG 팝 리포트</b><small>검색어 복사 후 열기</small></button>' +
      '<a class="pop-link" href="' + kreamBase + encodeURIComponent(kreamKeyword) + '" target="_blank" rel="noopener" data-pop-tool="kream"><b>KREAM 시세 검색</b><small>' + escapeHtml(item ? item.name + " " + (item.num || "") : (q || "카드명을 넣어 보세요")) + '</small></a>' +
      '<a class="pop-link" href="' + priceChartingUrl(item) + '" target="_blank" rel="noopener" data-pop-tool="price"><b>PriceCharting</b><small>영문 카드명 기준 검색</small></a>';

    $$("[data-pop-tool]", popLinks).forEach(function (el) {
      var tool = el.getAttribute("data-pop-tool");
      el.addEventListener("click", function (e) {
        trackEvent("pop_outbound", { tool: tool });
        if (tool === "psa" || tool === "brg") {
          e.preventDefault();
          var url = tool === "psa" ? (POP_TOOLS.psa || {}).url : (POP_TOOLS.brg || {}).url;
          var target = tool === "psa" ? (POP_TOOLS.psa || {}).url : (POP_TOOLS.brg || {}).url;
          if (!target) return;
          copyText(text || q).then(function (ok) {
            openExternal(target);
            toast(ok
              ? "검색어 \u201c" + (text || q) + "\u201d를 복사했습니다. 열린 사이트 검색창에 붙여넣으세요."
              : "검색어 \u201c" + (text || q) + "\u201d를 직접 입력해 주세요.");
          });
        }
      });
    });
  }

  function renderPopResults(context) {
    if (!popResults) return;
    var items = context.items || [];
    var html = "";
    if (!context.query) {
      html = '<p class="pop-empty">카드 번호나 카드명을 넣으면 도감·번호 인덱스에서 찾아 드립니다. 위쪽 빠른 검색을 눌러도 됩니다.</p>';
    } else if (!items.length && !context.range) {
      html = '<p class="pop-empty">‘' + escapeHtml(context.query) + '’에 해당하는 카드를 사이트 도감에서 찾지 못했습니다. 위 팝 리포트·KREAM 검색으로 바로 확인해 보세요.</p>';
    }
    if (context.range) {
      html += '<div class="pop-range"><b>' + escapeHtml(context.range.num) + ' · ' + escapeHtml(context.range.set) + '</b>' +
        '<span>' + escapeHtml(context.range.label) + ' 구간입니다. ' + escapeHtml(context.range.note) + '</span></div>';
    }
    html += items.slice(0, 8).map(function (item) {
      var mv = moverFor(item);
      var priceLine = mv
        ? '<span class="pop-price">KREAM 최근 체결 <b>' + won(mv.lastPrice) + '</b> · ' + escapeHtml(mv.lastWhen || "") + ' (누적 ' + (mv.trades || 0) + '건)</span>'
        : '<span class="pop-price muted">참고 시세 없음 · KREAM 검색으로 확인</span>';
      return '<article class="pop-card">' +
        '<span class="pop-art ' + artFor(item) + '" data-mark="' + escapeHtml((item.set || "").slice(0, 2)) + '" style="' + artGradient(item) + '">' +
          '<span class="mover-rarity">' + escapeHtml(item.rarity || "") + '</span></span>' +
        '<div class="pop-info">' +
          '<div class="pop-name">' + escapeHtml(item.name) + '</div>' +
          '<div class="pop-set">' + escapeHtml(item.set || "") + (item.num ? ' · ' + escapeHtml(item.num) : '') + '</div>' +
          priceLine +
          (item.note ? '<p class="pop-note-line">' + escapeHtml(item.note) + '</p>' : '') +
          '<div class="pop-card-links">' +
            (item.kream ? '<a href="' + item.kream + '" target="_blank" rel="noopener">KREAM ↗</a>' : '') +
            '<button type="button" data-pop-psa="' + escapeHtml(popQueryText(item)) + '">PSA 팝</button>' +
            '<button type="button" data-pop-brg="' + escapeHtml(popQueryText(item)) + '">BRG 팝</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join("");
    popResults.innerHTML = html;

    function bind(key, url) {
      $$('[data-pop-' + key + ']', popResults).forEach(function (b) {
        b.addEventListener("click", function () {
          var text = b.getAttribute('data-pop-' + key) || "";
          trackEvent("pop_outbound", { tool: key });
          copyText(text).then(function (ok) {
            openExternal(url);
            toast(ok ? "검색어 \u201c" + text + "\u201d를 복사했습니다. 검색창에 붙여넣으세요." : "검색어를 직접 입력해 주세요: " + text);
          });
        });
      });
    }
    bind("psa", (POP_TOOLS.psa || {}).url);
    bind("brg", (POP_TOOLS.brg || {}).url);
  }

  function renderPopRelay(payload, context) {
    if (!popRelayStatus) return;
    if (!payload) {
      popRelayStatus.textContent = relayUrl()
        ? "태블릿 중계에 팝수 조회(/api/pop?q=)를 요청했습니다."
        : "PSA·BRG 팝수는 사이트에서 직접 읽어 올 수 없어 검색어 복사 방식으로 연결합니다. 태블릿 중계를 연결하면 이 자리에 팝수가 표시됩니다.";
      return;
    }
    var rows = payload.items || payload.results || [];
    if (!payload.ok || !rows.length) {
      popRelayStatus.textContent = "중계 응답에 팝수가 없습니다. 팝 리포트 바로가기로 확인해 주세요.";
      return;
    }
    popRelayStatus.innerHTML = '<span class="pop-relay-title">중계 팝수 · ' + escapeHtml(context.query) + '</span>' +
      rows.map(function (r) {
        return '<span class="pop-relay-row"><b>' + escapeHtml(r.name || r.label || "") + '</b> ' +
          (r.psa10 != null ? 'PSA 10 ' + r.psa10 + '장' : '') +
          (r.psaTotal != null ? ' / PSA 전체 ' + r.psaTotal + '장' : '') +
          (r.brg10 != null ? ' · BRG 10 ' + r.brg10 + '장' : '') +
          (r.brgTotal != null ? ' / BRG 전체 ' + r.brgTotal + '장' : '') + '</span>';
      }).join("");
  }

  function runPopSearch(raw, from) {
    var context = popMatches(raw);
    renderPopLinks(context);
    renderPopResults(context);
    trackEvent("pop_search", { from: from || "form", has_result: context.items.length ? 1 : 0 });
    var base = relayUrl();
    if (!base || !context.query) {
      renderPopRelay(null, context);
      return;
    }
    var seq = ++popRelaySeq;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 7000);
    fetch(base + "/api/pop?q=" + encodeURIComponent(context.query), { signal: ctrl.signal, mode: "cors", cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (payload) {
        if (seq === popRelaySeq) renderPopRelay(payload || { ok: false }, context);
      })
      .catch(function () {
        if (seq === popRelaySeq) renderPopRelay({ ok: false }, context);
      })
      .finally(function () { clearTimeout(timer); });
  }

  function initPop() {
    if (!popForm) return;
    popForm.addEventListener("submit", function (e) {
      e.preventDefault();
      runPopSearch(popQueryEl ? popQueryEl.value : "", "form");
    });
    if (popChips) {
      popChips.innerHTML = (POP_TOOLS.quick || []).map(function (q) {
        return '<button type="button" class="pop-chip" data-quick="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
      }).join("");
      $$("[data-quick]", popChips).forEach(function (b) {
        b.addEventListener("click", function () {
          var q = b.getAttribute("data-quick");
          if (popQueryEl) popQueryEl.value = q;
          runPopSearch(q, "chip");
        });
      });
    }
    renderPopLinks({ query: "", items: [] });
    renderPopResults({ query: "", items: [] });
    renderPopRelay(null, { query: "" });
  }

  /* --------------------------------------------------------------- 초기화 */
  buildCalendar();
  buildScheduleFold();
  renderSetNav();
  renderSetSummary();
  renderCompare();
  renderRarityChips();
  renderDex();
  runCalc();
  renderBoxPicker();
  renderBoxBoard();
  applyMovers(MOVERS, "static");
  renderIssues();
  renderReleases();
  initPop();

  /* #stores·#boxStores는 「정가 구매처」 탭의 짧은 주소로 같이 받아 줍니다. */
  function tabOfHash(h) {
    if (h === "stores" || h === "boxStores") return "home";
    if (h === "cards") return "guide";
    if (h === "pop" || h === "movers" || h === "issues" || h === "releases") return "trends";
    return panels[h] ? h : "";
  }

  var hash = (location.hash || "").replace("#", "");
  var hashTab = tabOfHash(hash);
  if (hashTab) {
    showTab(hashTab, { keepScroll: true });
    if (hash === "boxStores") {
      var boxAnchor = document.getElementById("boxStores");
      if (boxAnchor && boxAnchor.scrollIntoView) {
        setTimeout(function () { boxAnchor.scrollIntoView({ block: "start" }); }, 60);
      }
    }
  } else {
    /* v2: 첫 화면 = 동네 찾기(실제 지도) */
    showTab("map", { keepScroll: true });
  }

  window.addEventListener("hashchange", function () {
    var h = tabOfHash((location.hash || "").replace("#", ""));
    if (h && h !== currentTab) showTab(h, { keepScroll: true });
  });
})();
