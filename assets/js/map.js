/* =========================================================================
 * 포케모아 — 자체 SVG 인터랙티브 지도 (외부 지도 API·CDN 미사용)
 * 월드 좌표 = 지역 중심 기준 미터 단위 (x: 동쪽+, y: 남쪽+)
 * ========================================================================= */
window.PokeMoaMap = (function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var D = window.POKEMOA_DATA;

  var el = {};
  var st = {
    region: null,
    stores: [],
    brand: "all",
    radius: 3,
    z: 1,
    cx: 0,
    cy: 0,
    w: 0,
    h: 0,
    baseMpp: 5,
    selectedId: null,
    markerEls: {}
  };

  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
      }
    }
    return n;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mpp() {
    return st.baseMpp / st.z;
  }

  function viewBox() {
    var m = mpp();
    return {
      x: st.cx - (st.w * m) / 2,
      y: st.cy - (st.h * m) / 2,
      w: st.w * m,
      h: st.h * m
    };
  }

  function toScreen(wx, wy) {
    var vb = viewBox();
    var m = mpp();
    return { x: (wx - vb.x) / m, y: (wy - vb.y) / m };
  }

  /* ------------------------------------------------------------ 기본 도면 */
  function buildBase() {
    var svg = el.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var region = st.region;
    if (!region) return;
    var rnd = mulberry32(region.seed);
    var R = 2400;

    /* --- 패턴(건물 텍스처) --- */
    var defs = svgEl("defs", {});
    function makePattern(id, base, cells) {
      var p = svgEl("pattern", { id: id, width: 34, height: 28, patternUnits: "userSpaceOnUse" });
      p.appendChild(svgEl("rect", { width: 34, height: 28, fill: base }));
      cells.forEach(function (c) {
        p.appendChild(svgEl("rect", { x: c[0], y: c[1], width: c[2], height: c[3], rx: 1.5, fill: c[4] }));
      });
      return p;
    }
    svg.appendChild(defs);

    svg.appendChild(svgEl("rect", { x: -9000, y: -9000, width: 18000, height: 18000, fill: "#ffffff" }));

    /* --- 공원 --- */
    var parks = [
      { x: -760 + rnd() * 500, y: -560 + rnd() * 320, rx: 330, ry: 220 },
      { x: 620 + rnd() * 700, y: 480 + rnd() * 420, rx: 280, ry: 190 },
      { x: -1500 + rnd() * 400, y: 1000 + rnd() * 320, rx: 250, ry: 260 }
    ];
    var gParks = svgEl("g", {});
    parks.forEach(function (p) {
      gParks.appendChild(svgEl("ellipse", { cx: p.x, cy: p.y, rx: p.rx, ry: p.ry, fill: "#dbedd9" }));
      gParks.appendChild(svgEl("ellipse", { cx: p.x - p.rx * 0.18, cy: p.y + p.ry * 0.12, rx: p.rx * 0.62, ry: p.ry * 0.58, fill: "#d2e8d0" }));
      for (var t = 0; t < 16; t++) {
        var ang = rnd() * Math.PI * 2;
        var rad = Math.sqrt(rnd()) * 0.82;
        gParks.appendChild(svgEl("circle", {
          cx: p.x + Math.cos(ang) * p.rx * rad,
          cy: p.y + Math.sin(ang) * p.ry * rad,
          r: 9 + rnd() * 10,
          fill: "#c3e0c1"
        }));
      }
    });
    svg.appendChild(gParks);

    /* --- 물 --- */
    var gWater = svgEl("g", {});
    var coastX = 1400;
    if (region.water === "east") {
      var pts = [];
      for (var y = -7000; y <= 7000; y += 200) {
        var edge = coastX + Math.sin(y / 700) * 120 + Math.cos(y / 230) * 26;
        pts.push([edge, y]);
      }
      var d = "M " + pts.map(function (p) { return p[0] + "," + p[1]; }).join(" L ") + " L 9000,7000 L 9000,-7000 Z";
      gWater.appendChild(svgEl("path", { d: d, fill: "#c9e2f8" }));
      var beach = "M " + pts.map(function (p) { return p[0] + "," + p[1]; }).join(" L ");
      gWater.appendChild(svgEl("path", { d: beach, fill: "none", stroke: "#e6e0d2", "stroke-width": 46, "stroke-linecap": "round" }));
      gWater.appendChild(svgEl("path", { d: beach, fill: "none", stroke: "#c9e2f8", "stroke-width": 40, "stroke-linecap": "round" }));
      for (var w = 0; w < 7; w++) {
        var wy = -1200 + w * 420;
        var wx = coastX + 240 + Math.sin(wy / 700) * 120 + w * 120;
        gWater.appendChild(svgEl("path", {
          d: "M " + wx + "," + (wy - 46) + " q 46,46 92,0",
          fill: "none", stroke: "#b6d6f2", "stroke-width": 14, "stroke-linecap": "round"
        }));
      }
    } else if (region.water === "north") {
      gWater.appendChild(svgEl("path", {
        d: "M -9000,-9000 L 9000,-9000 L 9000,-1560 C 5200,-1400 3200,-1660 1200,-1490 C -600,-1350 -2600,-1600 -4700,-1460 C -6500,-1340 -7800,-1560 -9000,-1480 Z",
        fill: "#c9e2f8"
      }));
      gWater.appendChild(svgEl("path", {
        d: "M -9000,-1480 C -7800,-1560 -6500,-1340 -4700,-1460 C -2600,-1600 -600,-1350 1200,-1490 C 3200,-1660 5200,-1400 9000,-1560",
        fill: "none", stroke: "#e9dfc6", "stroke-width": 44, "stroke-linecap": "round"
      }));
    }
    svg.appendChild(gWater);

    /* --- 블록 --- */
    var gBlocks = svgEl("g", {});
    function inWater(x, y) {
      if (region.water === "east") return x > coastX + Math.sin(y / 700) * 120 - 40;
      if (region.water === "north") return y < -1500;
      return false;
    }
    function inPark(x, y) {
      return parks.some(function (p) {
        var dx = (x - p.x) / (p.rx + 30);
        var dy = (y - p.y) / (p.ry + 30);
        return dx * dx + dy * dy < 1;
      });
    }
    var stepX = 246;
    var stepY = 196;
    var row = 0;
    for (var gy = -R; gy <= R; gy += stepY) {
      var offset = (row % 2) * (stepX / 2);
      for (var gx = -R - stepX; gx <= R + stepX; gx += stepX) {
        var jx = gx + offset + (rnd() - 0.5) * 16;
        var jy = gy + (rnd() - 0.5) * 14;
        if (inWater(jx, jy) || inPark(jx, jy)) continue;
        if (rnd() < 0.1) continue;
        var bw = 176 + Math.floor(rnd() * 46);
        var bh = 138 + Math.floor(rnd() * 38);
        var tone = rnd();
        var fill = tone > 0.88 ? "#d3deee" : tone > 0.64 ? "#dce5f1" : tone > 0.3 ? "#e4ebf5" : "#ebf0f7";
        gBlocks.appendChild(svgEl("rect", {
          x: jx - bw / 2,
          y: jy - bh / 2,
          width: bw,
          height: bh,
          rx: 7,
          fill: fill
        }));

      }
      row += 1;
    }
    /* 큰 시설 블록 */
    [[-320, 240, 210, 150], [980, -320, 180, 130], [-980, -980, 170, 120]].forEach(function (b) {
      if (inWater(b[0], b[1])) return;
      gBlocks.appendChild(svgEl("rect", {
        x: b[0], y: b[1], width: b[2], height: b[3], rx: 6,
        fill: "#dfe7f3", stroke: "#d2dcec", "stroke-width": 3
      }));
    });
    svg.appendChild(gBlocks);

    /* --- 도로 --- */
    var gRoads = svgEl("g", {});
    function road(x1, y1, x2, y2, width, surface) {
      gRoads.appendChild(svgEl("line", {
        x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: "#ccd7e7", "stroke-width": width + 9, "stroke-linecap": "round"
      }));
      gRoads.appendChild(svgEl("line", {
        x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: surface || "#ffffff", "stroke-width": width, "stroke-linecap": "round"
      }));
    }
    var i;
    for (i = -R; i <= R; i += stepX * 3) {
      if (region.water === "east" && i > coastX - 140) continue;
      if (region.water === "north" && i <= -1560) continue;
      road(i + stepX / 2, -R - 200, i + stepX / 2, R + 200, 46);
    }
    for (i = -R; i <= R; i += stepY * 3) {
      if (region.water === "east" && i < -1500) continue;
      if (region.water === "north" && i < -1460) continue;
      road(-R - 200, i + stepY / 2, R + 200, i + stepY / 2, 40);
    }
    /* 대각선 간선 */
    road(-R - 200, -R + 620, R + 200, R - 480, 36, "#ffffff");
    svg.appendChild(gRoads);

    /* --- 라벨 --- */
    if (region.label) {
      var lbl = svgEl("text", {
        x: 0, y: -700, "text-anchor": "middle",
        "font-size": 110, "font-weight": 700,
        fill: "#9fadc4", "letter-spacing": 6,
        "paint-order": "stroke", stroke: "#ffffff", "stroke-width": 14
      });
      lbl.textContent = region.label;
      svg.appendChild(lbl);
    }
    var lbl2 = svgEl("text", {
      x: -1750, y: 1560, "text-anchor": "middle",
      "font-size": 64, fill: "#aab4c6", "letter-spacing": 5
    });
    lbl2.textContent = "포케모아 스타일 지도";
    svg.appendChild(lbl2);

    /* --- 지형지물 라벨 --- */
    var labels = [
      { x: -520, y: 120, t: "중심 상가", size: 46 },
      { x: 780, y: 640, t: "시장", size: 42 },
      { x: -1250, y: -700, t: "주거 지구", size: 40 }
    ];
    labels.forEach(function (l) {
      var t = svgEl("text", {
        x: l.x, y: l.y, "text-anchor": "middle",
        "font-size": l.size, fill: "#8d9ab2", "letter-spacing": 3,
        "paint-order": "stroke", stroke: "#ffffff", "stroke-width": 8
      });
      t.textContent = l.t;
      svg.appendChild(t);
    });

    /* --- 반경 링 --- */
    var gRings = svgEl("g", { id: "map-rings" });
    [1, 3, 5].forEach(function (km) {
      var c = svgEl("circle", {
        cx: 0, cy: 0, r: km * 1000,
        fill: "none", stroke: "#2f6df6", "stroke-width": 7,
        "stroke-dasharray": "46 34", opacity: 0.14,
        "data-radius": km
      });
      gRings.appendChild(c);
      var t = svgEl("text", {
        x: 0, y: -km * 1000 - 26,
        "text-anchor": "middle", "font-size": 60, fill: "#2f6df6", opacity: 0.35,
        "data-radius": km
      });
      t.textContent = km + "km";
      gRings.appendChild(t);
    });
    svg.appendChild(gRings);
    updateRings();
  }

  function updateRings() {
    var g = el.svg.querySelector("#map-rings");
    if (!g) return;
    Array.prototype.forEach.call(g.querySelectorAll("[data-radius]"), function (n) {
      var km = Number(n.getAttribute("data-radius"));
      var active = km === st.radius;
      n.setAttribute("opacity", active ? (n.tagName === "text" ? 0.75 : 0.5) : 0.1);
      n.setAttribute("stroke-dasharray", active ? "46 34" : "24 40");
    });
  }

  /* ---------------------------------------------------------------- 마커 */
  function buildMarkers() {
    el.layer.innerHTML = "";
    st.markerEls = {};
    var meta = D.brandMeta;

    /* 기준점 */
    var origin = document.createElement("div");
    origin.className = "map-origin";
    origin.innerHTML = '<span class="origin-dot"></span><span class="origin-label">지도 기준점</span>';
    el.layer.appendChild(origin);
    st.originEl = origin;

    st.stores.forEach(function (s) {
      var b = meta[s.brand] || { label: s.brand, short: "?", color: "#1b2a4a", soft: "#eee" };
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-marker status-" + s.status;
      btn.setAttribute("data-id", s.id);
      btn.setAttribute("aria-label", s.name + " · " + statusLabel(s.status));
      btn.innerHTML =
        '<span class="pin" style="--brand:' + b.color + '">' + b.short + "</span>" +
        '<span class="pin-label">' + s.name + "</span>";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        select(s.id);
      });
      el.layer.appendChild(btn);
      st.markerEls[s.id] = btn;
    });
    updateMarkerPositions();
  }

  function statusLabel(s) {
    return s === "in" ? "재고 있음" : s === "check" ? "매장 확인 필요" : "재고 없음";
  }

  function isVisible(s) {
    if (st.brand !== "all" && s.brand !== st.brand) return false;
    if (s.distance > st.radius) return false;
    return true;
  }

  function updateMarkerPositions() {
    var meta = D.brandMeta;
    st.stores.forEach(function (s) {
      var btn = st.markerEls[s.id];
      if (!btn) return;
      var p = toScreen(s.dx, s.dy);
      btn.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
      btn.style.display = isVisible(s) ? "" : "none";
      if (st.brand === "all" && !btn.querySelector(".pin-label").dataset.base) {
        var b = meta[s.brand];
        btn.querySelector(".pin").title = b ? b.label : s.brand;
      }
    });
    if (st.originEl) {
      var o = toScreen(0, 0);
      st.originEl.style.transform = "translate(" + o.x.toFixed(1) + "px," + o.y.toFixed(1) + "px)";
    }
    if (st.selectedId) positionPopup();
    updateScaleBar();
  }

  function updateScaleBar() {
    if (!el.scale) return;
    var m = mpp(); // 미터/픽셀
    var targetPx = 78;
    var meters = targetPx * m;
    var nice = [100, 200, 500, 1000, 2000, 5000, 10000];
    var pick = nice[0];
    for (var i = 0; i < nice.length; i++) {
      if (nice[i] <= meters) pick = nice[i];
    }
    var width = pick / m;
    el.scaleBar.style.width = Math.max(24, Math.min(160, width)).toFixed(1) + "px";
    el.scaleText.textContent = pick >= 1000 ? (pick / 1000) + " km" : pick + " m";
  }

  /* --------------------------------------------------------------- 팝업 */
  function select(id) {
    var s = st.stores.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    st.selectedId = id;
    Object.keys(st.markerEls).forEach(function (k) {
      st.markerEls[k].classList.toggle("is-selected", k === id);
    });
    renderPopup(s);
    el.container.scrollLeft = 0;
    el.container.scrollTop = 0;
    document.dispatchEvent(new CustomEvent("pokemoa:store-selected", { detail: { id: id } }));
  }

  function clearSelection() {
    st.selectedId = null;
    Object.keys(st.markerEls).forEach(function (k) {
      st.markerEls[k].classList.remove("is-selected");
    });
    if (el.popup) el.popup.hidden = true;
    document.dispatchEvent(new CustomEvent("pokemoa:store-cleared"));
  }

  function renderPopup(s) {
    var b = D.brandMeta[s.brand] || { label: s.brand, color: "#1b2a4a" };
    var pop = el.popup;
    pop.hidden = false;
    pop.innerHTML =
      '<div class="popup-head">' +
      '<span class="popup-brand" style="background:' + b.color + '">' + b.short + "</span>" +
      "<div class=\"popup-title\"><strong>" + s.name + "</strong>" +
      "<span>" + s.area + " · " + s.distance.toFixed(1) + "km</span></div>" +
      '<button type="button" class="popup-close" aria-label="닫기">×</button>' +
      "</div>" +
      '<div class="popup-meta">' +
      '<span class="status-badge ' + s.status + '">' + statusLabel(s.status) + "</span>" +
      '<span class="chip">' + s.unit + "</span>" +
      '<span class="chip">' + s.observed + " 관측</span>" +
      "</div>" +
      '<p class="popup-note">' + s.note + "</p>" +
      '<p class="popup-demo">샘플 관측값 · 실제 재고 아님</p>' +
      '<a class="btn btn-sm btn-dark popup-link" target="_blank" rel="noopener" href="https://map.naver.com/p/search/' +
      encodeURIComponent(s.name) + '">네이버 지도에서 보기</a>';

    pop.querySelector(".popup-close").addEventListener("click", function (e) {
      e.stopPropagation();
      clearSelection();
    });
    pop.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    positionPopup();
  }

  function positionPopup() {
    if (!st.selectedId || !el.popup || el.popup.hidden) return;
    var s = st.stores.filter(function (x) { return x.id === st.selectedId; })[0];
    if (!s) return;
    var p = toScreen(s.dx, s.dy);
    var pw = el.popup.offsetWidth;
    var ph = el.popup.offsetHeight;
    if (st.w < 620) {
      el.popup.style.left = "10px";
      el.popup.style.right = "10px";
      el.popup.style.top = "auto";
      el.popup.style.bottom = "10px";
      el.popup.style.width = "auto";
      return;
    }
    el.popup.style.width = "300px";
    el.popup.style.right = "auto";
    el.popup.style.bottom = "auto";
    var left = p.x - pw / 2;
    left = Math.max(10, Math.min(st.w - pw - 10, left));
    var top = p.y - ph - 20;
    if (top < 10) top = p.y + 24;
    top = Math.max(10, Math.min(st.h - ph - 10, top));
    el.popup.style.left = left.toFixed(0) + "px";
    el.popup.style.top = top.toFixed(0) + "px";
  }

  /* --------------------------------------------------------------- 뷰 조작 */
  function applyView() {
    var vb = viewBox();
    el.svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
    el.svg.setAttribute("preserveAspectRatio", "none");
    updateMarkerPositions();
  }

  function clampCenter() {
    var lim = (st.region ? st.region.span : 3000) * 1.1;
    st.cx = Math.max(-lim, Math.min(lim, st.cx));
    st.cy = Math.max(-lim, Math.min(lim, st.cy));
  }

  function zoomAt(factor, px, py) {
    var before = { x: st.cx, y: st.cy };
    var m0 = mpp();
    var vb = viewBox();
    var anchorX = 0;
    var anchorY = 0;
    if (typeof px === "number") {
      anchorX = vb.x + px * m0;
      anchorY = vb.y + py * m0;
    } else {
      anchorX = before.x;
      anchorY = before.y;
    }
    var z = Math.max(0.85, Math.min(6, st.z * factor));
    if (z === st.z) return;
    st.z = z;
    var m1 = mpp();
    if (typeof px === "number") {
      var nvx = anchorX - px * m1;
      var nvy = anchorY - py * m1;
      st.cx = nvx + (st.w * m1) / 2;
      st.cy = nvy + (st.h * m1) / 2;
    }
    clampCenter();
    applyView();
    document.dispatchEvent(new CustomEvent("pokemoa:map-view", { detail: { z: st.z } }));
  }

  function reset() {
    st.z = 1;
    st.cx = 0;
    st.cy = 0;
    applyView();
    document.dispatchEvent(new CustomEvent("pokemoa:map-view", { detail: { z: st.z } }));
  }

  /* ---------------------------------------------------------------- 초기화 */
  function measure() {
    var r = el.container.getBoundingClientRect();
    st.w = Math.max(240, r.width);
    st.h = Math.max(220, r.height);
    if (st.region) {
      st.baseMpp = st.region.span / Math.min(st.w, st.h);
    }
  }

  function setRegion(regionId) {
    var region = D.regions.filter(function (g) { return g.id === regionId; })[0];
    if (!region) return;
    st.region = region;
    st.stores = D.stores.filter(function (s) { return s.regionId === regionId; });
    st.selectedId = null;
    if (el.popup) el.popup.hidden = true;
    measure();
    st.z = 1;
    st.cx = 0;
    st.cy = 0;
    buildBase();
    buildMarkers();
    applyView();
  }

  function setFilter(brand, radius) {
    if (brand) st.brand = brand;
    if (radius) st.radius = radius;
    updateRings();
    updateMarkerPositions();
    if (st.selectedId) {
      var s = st.stores.filter(function (x) { return x.id === st.selectedId; })[0];
      if (s && !isVisible(s)) clearSelection();
    }
  }

  function focusStore(id) {
    var s = st.stores.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    st.cx = s.dx;
    st.cy = s.dy;
    if (st.z < 2.2) st.z = 2.2;
    clampCenter();
    applyView();
    select(id);
  }

  function init(opts) {
    el.container = opts.container;
    el.svg = opts.svg;
    el.layer = opts.layer;
    el.popup = opts.popup;
    el.scaleBar = opts.scaleBar;
    el.scaleText = opts.scaleText;

    var drag = null;
    el.container.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".map-marker, .map-popup, .map-controls, .map-legend")) return;
      if (e.button !== undefined && e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy, moved: false };
      el.container.classList.add("is-dragging");
      if (el.container.setPointerCapture) {
        try { el.container.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });
    el.container.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      var m = mpp();
      st.cx = drag.cx - dx * m;
      st.cy = drag.cy - dy * m;
      clampCenter();
      applyView();
    });
    function endDrag(e) {
      if (!drag) return;
      el.container.classList.remove("is-dragging");
      if (!drag.moved) clearSelection();
      drag = null;
    }
    el.container.addEventListener("pointerup", endDrag);
    el.container.addEventListener("pointercancel", endDrag);
    el.container.addEventListener("pointerleave", function (e) {
      if (drag && e.buttons === 0) endDrag(e);
    });

    el.container.addEventListener("wheel", function (e) {
      if (e.target.closest(".map-popup")) return;
      e.preventDefault();
      var rect = el.container.getBoundingClientRect();
      var factor = e.deltaY < 0 ? 1.16 : 1 / 1.16;
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    /* 마커 포커스로 컨테이너가 스크롤되는 현상 방지 */
    el.container.addEventListener("scroll", function () {
      if (el.container.scrollLeft !== 0) el.container.scrollLeft = 0;
      if (el.container.scrollTop !== 0) el.container.scrollTop = 0;
    });

    el.container.addEventListener("dblclick", function (e) {
      if (e.target.closest(".map-marker, .map-popup, .map-controls")) return;
      var rect = el.container.getBoundingClientRect();
      zoomAt(1.4, e.clientX - rect.left, e.clientY - rect.top);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && st.selectedId) clearSelection();
    });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        var prevW = st.w;
        var prevH = st.h;
        measure();
        if (prevW !== st.w || prevH !== st.h) applyView();
      });
      ro.observe(el.container);
    }

    return API;
  }

  var API = {
    init: init,
    setRegion: setRegion,
    setFilter: setFilter,
    focusStore: focusStore,
    select: select,
    clearSelection: clearSelection,
    zoomAt: zoomAt,
    reset: reset,
    getState: function () { return st; },
    isVisible: isVisible
  };
  return API;
})();
