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
  var regionSelect = $("#regionSelect");
  var brandChips = $("#brandChips");
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
  var filterState = {
    region: regionSelect ? regionSelect.value : "pohang-north",
    brand: "all",
    radius: 3000
  };

  var statusText = { in: "재고 있음", check: "매장 확인 필요", none: "재고 없음" };

  function ensureMap() {
    if (mapReady || !window.PokeMoaMap || !mapShell) return;
    mapReady = true;
    window.PokeMoaMap.init({ container: mapShell, card: mapCard });
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

  /* 매장 목록 */
  function renderStores(list) {
    if (!storeListEl) return;
    var counts = { in: 0, check: 0, none: 0 };
    list.forEach(function (s) { counts[s.status] += 1; });
    if (mapCountEl) {
      mapCountEl.innerHTML = "표시 중 <b>" + list.length + "</b>곳 · 재고 " + counts.in + " · 확인 " + counts.check + " · 없음 " + counts.none;
    }
    if (sideSummary) {
      sideSummary.textContent = list.length ? "가까운 순 · " + list.length + "곳" : "조건에 맞는 매장 없음";
    }

    storeListEl.innerHTML = "";
    if (!list.length) {
      var li0 = document.createElement("li");
      li0.className = "store-empty";
      li0.textContent = "이 조건에 맞는 매장이 없습니다. 반경을 넓히거나 다른 브랜드를 골라 보세요.";
      storeListEl.appendChild(li0);
      return;
    }

    list.forEach(function (s) {
      var b = D.brandMeta[s.brand] || { label: s.brand, short: "?", color: "#1b2a4a" };
      var dist = s.distance < 1000 ? Math.round(s.distance) + "m" : (s.distance / 1000).toFixed(1) + "km";
      var item = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "store-item";
      btn.setAttribute("data-store", s.id);
      btn.innerHTML =
        '<span class="s-top">' +
        '<span class="s-brand" style="background:' + b.color + '">' + b.short + "</span>" +
        '<span class="s-name">' + s.name + "</span>" +
        '<span class="s-dist">' + dist + "</span>" +
        "</span>" +
        '<span class="s-meta">' +
        '<span class="status-badge ' + s.status + '">' + statusText[s.status] + "</span>" +
        '<span class="chip chip-sample">샘플 재고</span>' +
        (s.street ? "<small>" + s.street + "</small>" : "") +
        "</span>";
      btn.addEventListener("click", function () {
        if (!mapReady) return;
        window.PokeMoaMap.focusStore(s.id);
        if (window.innerWidth < 980) {
          mapShell.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      item.appendChild(btn);
      storeListEl.appendChild(item);
    });
  }

  document.addEventListener("pokemoa:loading", function (e) { renderLoading(e.detail); });

  document.addEventListener("pokemoa:data", function (e) {
    var d = e.detail || {};
    renderBadge(d.badge);
    if (d.badge && d.badge.text && mapStatusText) {
      mapStatusText.title = d.error ? "마지막 실시간 조회 오류: " + d.error : "";
    }
    if (d.source && !d.loading) {
      gotFirstData = true;
      if (storeSkeleton) storeSkeleton.hidden = true;
      if (storeListEl) storeListEl.hidden = false;
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
    if (regionSelect) regionSelect.value = "";
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

  if (regionSelect) {
    regionSelect.addEventListener("change", function () {
      filterState.region = regionSelect.value;
      if (!filterState.region) return;
      gotFirstData = false;
      if (storeSkeleton) storeSkeleton.hidden = false;
      if (storeListEl) storeListEl.hidden = true;
      if (mapReady) window.PokeMoaMap.setRegion(filterState.region);
    });
  }

  if (brandChips) {
    brandChips.addEventListener("click", function (e) {
      var btn = e.target.closest(".brand-chip");
      if (!btn) return;
      $$(".brand-chip", brandChips).forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      filterState.brand = btn.getAttribute("data-brand");
      if (mapReady) window.PokeMoaMap.setBrand(filterState.brand);
    });
  }

  $$(".radius-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $$(".radius-btn").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      filterState.radius = Number(btn.getAttribute("data-radius"));
      if (mapReady) window.PokeMoaMap.setRadius(filterState.radius);
    });
  });

  var resetBtn = $("#filterReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      filterState.brand = "all";
      filterState.radius = 3000;
      $$(".brand-chip").forEach(function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-brand") === "all");
      });
      $$(".radius-btn").forEach(function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-radius") === "3000");
      });
      if (mapReady) {
        window.PokeMoaMap.setBrand("all");
        window.PokeMoaMap.setRadius(3000);
        window.PokeMoaMap.closeCard();
      }
      toast("필터를 초기화했습니다.");
    });
  }

  /* ------------------------------------------------------------- 캘린더 */
  function buildCalendar() {
    var grid = $("#calGrid");
    if (!grid) return;
    var c = D.calendar;
    for (var i = 0; i < c.firstWeekday; i++) {
      var empty = document.createElement("div");
      empty.className = "cal-cell is-empty";
      grid.appendChild(empty);
    }
    for (var d = 1; d <= c.days; d++) {
      var cell = document.createElement("div");
      cell.className = "cal-cell" + (d === c.today ? " is-today" : "");
      var num = document.createElement("span");
      num.textContent = d;
      cell.appendChild(num);
      var marks = c.marks[d];
      if (marks && marks.length) {
        var m = document.createElement("span");
        m.className = "marks";
        marks.forEach(function (k) {
          var dot = document.createElement("i");
          dot.className = "m-" + k;
          m.appendChild(dot);
        });
        cell.appendChild(m);
      }
      cell.setAttribute("aria-label", "11월 " + d + "일" + (marks ? " 입고 예상 표시" : ""));
      grid.appendChild(cell);
    }
  }

  /* --------------------------------------------------------------- 도감 */
  var dexGrid = $("#dexGrid");
  var dexCount = $("#dexCount");
  var searchInput = $("#cardSearch");
  var searchClear = $("#cardSearchClear");
  var query = "";
  var rarity = "all";

  var artClass = {
    fur: "art-fur", sar: "art-sar", ar: "art-ar",
    pika: "art-pika", classic: "art-classic", energy: "art-energy"
  };

  function artStyle(card) {
    var h = 0;
    for (var i = 0; i < card.id.length; i++) h = (h * 31 + card.id.charCodeAt(i)) % 360;
    if (card.tag === "fur") return "";
    if (card.tag === "classic") return "background:linear-gradient(150deg,hsl(38 32% 89%),hsl(32 26% 80%) 55%,hsl(26 22% 75%))";
    if (card.tag === "energy") return "background:linear-gradient(150deg,hsl(210 34% 89%),hsl(220 30% 81%) 55%,hsl(230 26% 85%))";
    var base = card.tag === "pika" ? 44 : card.tag === "sar" ? 330 : 200;
    var hue = (base + (h % 150) - 75 + 360) % 360;
    return "background:linear-gradient(150deg,hsl(" + hue + " 72% 89%),hsl(" + ((hue + 46) % 360) + " 68% 83%) 55%,hsl(" + ((hue + 92) % 360) + " 62% 89%))";
  }

  function cardMatches(card) {
    if (rarity !== "all" && card.tag !== rarity) return false;
    if (!query) return true;
    var hay = (card.name + " " + card.rarity + " " + (card.illus || "") + " " + card.note).toLowerCase();
    return hay.indexOf(query.toLowerCase()) !== -1;
  }

  function renderDex() {
    if (!dexGrid) return;
    var list = D.cards.filter(cardMatches);
    dexGrid.innerHTML = "";
    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "dex-empty";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "‘" + query + "’에 해당하는 카드가 없습니다. 다른 이름이나 레어도로 찾아보세요.";
      dexGrid.appendChild(empty);
    }
    list.forEach(function (card) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dex-card";
      btn.setAttribute("data-card", card.id);
      btn.innerHTML =
        '<span class="dex-art ' + (artClass[card.tag] || "art-energy") + '" style="' + artStyle(card) + '">' +
        '<span class="rarity-tag">' + card.rarity + "</span>" +
        (card.num ? '<span class="art-num">' + card.num + "</span>" : "") +
        '<span class="art-name">' + card.name + "</span>" +
        "</span>" +
        '<span class="dex-info">' +
        "<strong>" + card.name + "</strong>" +
        "<small>" + card.rarity + (card.illus ? " · " + card.illus : "") + "</small>" +
        '<span class="dex-note">' + card.note + "</span>" +
        "</span>";
      btn.addEventListener("click", function () { openCardModal(card); });
      dexGrid.appendChild(btn);
    });
    if (dexCount) {
      dexCount.textContent = query || rarity !== "all" ? "검색 결과 " + list.length + "장" : "전체 " + D.cards.length + "장";
    }
    if (searchClear) searchClear.hidden = !query;
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
  var rarityChips = $("#rarityChips");
  if (rarityChips) {
    rarityChips.addEventListener("click", function (e) {
      var btn = e.target.closest(".rarity-chip");
      if (!btn) return;
      $$(".rarity-chip", rarityChips).forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      rarity = btn.getAttribute("data-rarity");
      renderDex();
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
  var fmt = function (n) { return n.toLocaleString("ko-KR"); };

  function runCalc() {
    if (!calcInput) return;
    var raw = Number(String(calcInput.value).replace(/[^0-9]/g, ""));
    if (!raw || raw <= 0) {
      calcPerPack.textContent = "-";
      calcDiff.textContent = "-";
      calcRate.textContent = "-";
      calcRate.className = "";
      calcVerdict.textContent = "정가 70,000원을 기준으로 판단합니다.";
      return;
    }
    var perPack = Math.round(raw / D.SET.packsPerBox);
    var diff = raw - D.SET.boxPrice;
    var rate = Math.round((diff / D.SET.boxPrice) * 1000) / 10;

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
  renderDex();

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
