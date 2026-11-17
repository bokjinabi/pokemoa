/* =========================================================================
 * 포케모아 — 화면 동작 (탭 · 지도 연동 · 도감 검색 · 모달 · 계산기)
 * ========================================================================= */
(function () {
  "use strict";
  var D = window.POKEMOA_DATA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

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

  /* --------------------------------------------------------------- 탭 */
  var panels = {
    home: $("#panel-home"),
    map: $("#panel-map"),
    schedule: $("#panel-schedule"),
    guide: $("#panel-guide")
  };
  var navBtns = $$(".nav-btn");
  var currentTab = "map";
  function showTab(name, opts) {
    if (!panels[name]) name = "map";
    Object.keys(panels).forEach(function (k) {
      if (panels[k]) panels[k].hidden = k !== name;
    });
    navBtns.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
    });
    currentTab = name;
    if (name === "map") {
      ensureMap();
      if (mapReady && window.PokeMoaMap) {
        setTimeout(function () { window.PokeMoaMap.invalidate(); }, 80);
      }
    }
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
      ? "1/2 · 지도 타일(OpenStreetMap) 불러오는 중"
      : "2/2 · 주변 매장 위치 조회 중 (Overpass API)";
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
    list.forEach(function (s) { counts[s.status] += 1; });
    if (mapCountEl) {
      mapCountEl.innerHTML = "표시 중 <b>" + list.length + "</b>곳 · 재고 " + counts.in + " · 확인 " + counts.check + " · 없음 " + counts.none;
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
      var item = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "store-item is-" + s.status;
      btn.setAttribute("data-store", s.id);
      btn.innerHTML =
        '<span class="s-top">' +
        '<span class="s-brand" style="background:' + b.color + '">' + b.short + "</span>" +
        '<span class="s-name">' + s.name + "</span>" +
        '<span class="s-dist">' + dist + "</span>" +
        "</span>" +
        '<span class="s-meta">' +
        '<span class="status-badge ' + s.status + '">' + statusText[s.status] + "</span>" +
        '<span class="chip chip-sample">샘플</span>' +
        (s.street ? "<small>" + s.street + "</small>" : "") +
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
    if (d.brandCounts) renderBrandSummary(d.brandCounts, d.brand || filterState.brand);
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

  function closeSuggest() {
    if (!regionSuggest) return;
    regionSuggest.hidden = true;
    regionSuggest.innerHTML = "";
    suggestItems = [];
    suggestActive = -1;
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
    suggestItems = hits;
    suggestActive = hits.length ? 0 : -1;
    regionSuggest.innerHTML = "";
    if (!normText(q)) { closeSuggest(); return; }
    if (!hits.length) {
      var empty = document.createElement("li");
      empty.className = "region-suggest-empty";
      empty.textContent = "일치하는 지역이 없습니다. 시·도와 시·군·구에서 골라 주세요.";
      regionSuggest.appendChild(empty);
    }
    hits.forEach(function (r, i) {
      var li = document.createElement("li");
      li.className = "region-suggest-item" + (i === suggestActive ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === suggestActive ? "true" : "false");
      li.setAttribute("data-region", r.id);
      li.innerHTML = "<strong>" + r.name + "</strong><span>" +
        (r.allow20 ? "20km까지" : "도심 · 5km까지") + "</span>";
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        selectRegion(r.id);
        if (regionSearch) regionSearch.blur();
      });
      regionSuggest.appendChild(li);
    });
    regionSuggest.hidden = false;
    regionSearch.setAttribute("aria-expanded", "true");
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
          selectRegion(suggestItems[suggestActive].id);
          regionSearch.blur();
        } else if (suggestItems.length === 1) {
          selectRegion(suggestItems[0].id);
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
    });
  });

  var resetBtn = $("#filterReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      filterState.brand = "all";
      filterState.sort = "stock";
      filterState.stockOnly = false;
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
      if (!dexExpanded && dexGrid) {
        var top = dexGrid.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top > 0 ? top : 0, behavior: "smooth" });
      }
    });
  }

  /* --------------------------------------------------------------- FAQ */
  var faqItems = $$(".faq-item");
  faqItems.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (!item.open) return;
      faqItems.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

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

    var form = modalBody.querySelector("#contactForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = modalBody.querySelector("#contactEmail");
        var body = modalBody.querySelector("#contactBody");
        if (email && email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
          toast("이메일 형식을 확인해 주세요.");
          email.focus();
          return;
        }
        if (body && !body.value.trim()) {
          toast("문의 내용을 적어 주세요.");
          body.focus();
          return;
        }
        toast("데모 화면입니다 — 실제 전송은 배포 후 연결됩니다.");
      });
    }
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
        about: "포케모아 소개",
        privacy: "개인정보처리방침",
        terms: "이용약관",
        contact: "운영 문의 · 재고 제보"
      };
      openModalFromTemplate(key, titles[key] || "포케모아");
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

  /* --------------------------------------------------------------- 초기화 */
  buildCalendar();
  buildScheduleFold();
  renderSetNav();
  renderSetSummary();
  renderCompare();
  renderRarityChips();
  renderDex();
  runCalc();

  var hash = (location.hash || "").replace("#", "");
  if (hash === "cards") {
    showTab("guide", { keepScroll: true });
  } else if (panels[hash]) {
    showTab(hash, { keepScroll: true });
  } else {
    /* v2: 첫 화면 = 동네 찾기(실제 지도) */
    showTab("map", { keepScroll: true });
  }

  window.addEventListener("hashchange", function () {
    var h = (location.hash || "").replace("#", "");
    if (panels[h] && h !== currentTab) showTab(h, { keepScroll: true });
  });
})();
