/* =========================================================================
 * 포켓몬카드모아 — 공식 콜라보 칸
 * 데이터: assets/data/collabs.json  (이 파일만 고치면 화면이 갱신됩니다)
 *   - 새 콜라보는 items 배열에 한 건 추가하면 됩니다.
 *   - 기간(endDate)이 지나면 자동으로 '마감'으로 표시됩니다.
 *   - region 이 "global" 이면 '해외'로 표시합니다(국내 판매 일정은 note 에 적습니다).
 * 상태 계산
 *   statusOverride 가 있으면 그 값을, 없으면 날짜로 계산합니다.
 *   upcoming(예정) / ongoing(진행 중) / ended(마감)
 * ========================================================================= */
(function () {
  "use strict";

  var listEl = document.getElementById("collabList");
  if (!listEl) return;

  var summaryEl = document.getElementById("collabSummary");
  var statusRow = document.getElementById("collabStatusRow");
  var catRow = document.getElementById("collabCatRow");
  var srcEl = document.getElementById("collabSrc");
  var sectionEl = document.getElementById("collabSection");

  var DATA_URL = "assets/data/collabs.json";

  var STATUS_LABEL = { ongoing: "진행 중", upcoming: "예정", ended: "마감" };
  var STATUS_ORDER = { ongoing: 0, upcoming: 1, global: 2, ended: 3 };

  var state = { status: "all", cat: "all", data: null };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function dateOnly(v) {
    return typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : "";
  }
  function daysBetween(fromKey, toKey) {
    var a = new Date(fromKey + "T00:00:00");
    var b = new Date(toKey + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ------------------------------------------------------------- 상태 */
  function statusOf(item, today) {
    if (item.statusOverride) return item.statusOverride;
    var start = dateOnly(item.startDate);
    var end = dateOnly(item.endDate);
    if (end && end < today) return "ended";
    if (start && start > today) return "upcoming";
    return "ongoing";
  }

  function statusChip(item, status, today) {
    var global = item.region === "global";
    var label = STATUS_LABEL[status] || "진행 중";
    var cls = "collab-badge is-" + status;
    var tail = "";
    var end = dateOnly(item.endDate);
    if (global) {
      cls += " is-global";
      label = "해외 · " + label;
    }
    if (status === "ongoing" && end) {
      var left = daysBetween(today, end);
      if (left > 0) tail = '<span class="collab-dday">D-' + left + "</span>";
    }
    if (status === "ended" && end) {
      tail = '<span class="collab-dday">' + escapeHtml(end.slice(5).replace("-", "/")) + " 종료</span>";
    }
    return '<span class="' + cls + '">' + escapeHtml(label) + tail + "</span>";
  }

  /* ---------------------------------------------------------- 필터 칩 */
  function buildStatusRow() {
    if (!statusRow) return;
    var items = [
      ["all", "전체"],
      ["ongoing", "진행 중"],
      ["upcoming", "예정"],
      ["global", "해외"],
      ["ended", "마감"]
    ];
    statusRow.innerHTML = '<span class="collab-filter-label">상태</span>' + items.map(function (p) {
      return '<button type="button" class="collab-chip' + (p[0] === state.status ? " is-on" : "") +
        '" data-status="' + p[0] + '" aria-pressed="' + (p[0] === state.status) + '">' + p[1] + "</button>";
    }).join("");
    statusRow.querySelectorAll("[data-status]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.status = b.getAttribute("data-status");
        buildStatusRow();
        render();
      });
    });
  }

  function buildCatRow() {
    if (!catRow) return;
    var cats = [{ key: "all", label: "전체" }].concat(state.data.categories || []);
    catRow.innerHTML = '<span class="collab-filter-label">분류</span>' + cats.map(function (c) {
      return '<button type="button" class="collab-chip is-soft' + (c.key === state.cat ? " is-on" : "") +
        '" data-cat="' + escapeHtml(c.key) + '" aria-pressed="' + (c.key === state.cat) + '">' +
        escapeHtml(c.label) + "</button>";
    }).join("");
    catRow.querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.cat = b.getAttribute("data-cat");
        buildCatRow();
        render();
      });
    });
  }

  /* ------------------------------------------------------------ 카드 */
  function cardHtml(item, today) {
    var status = statusOf(item, today);
    var isGlobal = item.region === "global";
    var goods = (item.goods || []).map(function (g) {
      return "<li>" + escapeHtml(g) + "</li>";
    }).join("");
    var links = (item.links || []).map(function (l) {
      return '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener">' +
        escapeHtml(l.label) + " ↗</a>";
    }).join("");
    return '<li class="collab-card is-' + status + (isGlobal ? " is-global" : "") +
      '" data-status="' + status + '" data-cat="' + escapeHtml(item.category || "") + '">' +
      '<div class="collab-top">' +
        '<span class="collab-brand">' + escapeHtml(item.brand) + "</span>" +
        '<span class="collab-cat">' + escapeHtml(item.categoryLabel || "") + "</span>" +
        statusChip(item, status, today) +
      "</div>" +
      '<h3 class="collab-title">' + escapeHtml(item.title) + "</h3>" +
      '<p class="collab-period">' + escapeHtml(item.periodLabel || "") + "</p>" +
      (goods ? '<ul class="collab-goods">' + goods + "</ul>" : "") +
      (item.price ? '<p class="collab-price"><span>가격</span>' + escapeHtml(item.price) + "</p>" : "") +
      (item.note ? '<p class="collab-note">' + escapeHtml(item.note) + "</p>" : "") +
      (links ? '<div class="collab-links">' + links + "</div>" : "") +
      "</li>";
  }

  function render() {
    var data = state.data;
    if (!data) return;
    var today = todayKey();
    var all = data.items || [];
    var counts = { ongoing: 0, upcoming: 0, ended: 0, global: 0 };
    all.forEach(function (it) {
      var s = statusOf(it, today);
      if (it.region === "global") counts.global++;
      else counts[s] = (counts[s] || 0) + 1;
    });

    if (summaryEl) {
      summaryEl.innerHTML = "진행 중 <b>" + counts.ongoing + "</b>건 · 해외 <b>" + counts.global +
        "</b>건 · 마감 <b>" + counts.ended + "</b>건 <span>기준 " +
        escapeHtml((data.basisDate || today).slice(5).replace("-", "/")) + "</span>";
    }

    var list = all.filter(function (it) {
      var s = statusOf(it, today);
      if (state.status !== "all") {
        if (state.status === "global") { if (it.region !== "global") return false; }
        else if (it.region === "global" || s !== state.status) return false;
      }
      if (state.cat !== "all" && it.category !== state.cat) return false;
      return true;
    });

    list.sort(function (a, b) {
      var sa = statusOf(a, today), sb = statusOf(b, today);
      var ka = a.region === "global" ? "global" : sa;
      var kb = b.region === "global" ? "global" : sb;
      var r = (STATUS_ORDER[ka] || 0) - (STATUS_ORDER[kb] || 0);
      if (r) return r;
      var da = dateOnly(a.startDate) || "0000-00-00";
      var db = dateOnly(b.startDate) || "0000-00-00";
      return db < da ? -1 : db > da ? 1 : 0;
    });

    if (!list.length) {
      listEl.innerHTML = '<li class="collab-empty">조건에 맞는 콜라보가 없습니다. 다른 필터를 눌러 보세요.</li>';
    } else {
      listEl.innerHTML = list.map(function (it) { return cardHtml(it, today); }).join("");
    }

    if (srcEl) {
      srcEl.innerHTML = "출처: 포켓몬코리아 공식 사이트·공식 SNS, 각 브랜드 공식 공지, 보도. " +
        "가격·기간은 공지 시점 기준이고 재고·매장에 따라 달라질 수 있습니다. " +
        (data.updatedAt ? "데이터 갱신 " + escapeHtml(String(data.updatedAt).slice(0, 10)) + "." : "");
    }

    listEl.querySelectorAll(".collab-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        if (window.gtag) window.gtag("event", "collab_outbound", { link: a.getAttribute("href") });
      });
    });
  }

  /* ------------------------------------------------------------ 로드 */
  function load() {
    // 하루 단위 캐시 무효화 — 데이터만 바꿔도 다음 날 새로 받습니다.
    var d = new Date();
    var bust = "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    fetch(DATA_URL + "?d=" + bust, { cache: "no-cache" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (data) {
        state.data = data;
        buildStatusRow();
        buildCatRow();
        render();
      })
      .catch(function () {
        if (sectionEl) sectionEl.setAttribute("data-collab-error", "1");
        listEl.innerHTML = '<li class="collab-empty">콜라보 목록을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</li>';
      });
  }

  load();
})();
