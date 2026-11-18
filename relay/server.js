#!/usr/bin/env node
/**
 * 포켓몬카드모아(PokemonCardMoa) — 집 태블릿 실재고 중계 서버
 * ---------------------------------------------------------------
 * 태블릿(Termux)에서 `node server.js` 한 줄로 실행하는 무의존 단일 파일 서버입니다.
 * 외부 npm 패키지 없이 Node 18+ 내장 모듈(http, crypto, fetch)만 씁니다.
 *
 *   GET  /health    → { ok, service: "pokemoa-relay", version, time }
 *   GET  /api/nearby?lat=36.07&lng=129.39&keyword=포켓몬카드&radius=3000
 *                   → 이마트24 · CU · 세븐일레븐의 점포별 실재고를 모아 돌려줍니다.
 *   GET  /api/diag  → 체인별로 어디까지 됐는지(응답 코드·차단 여부)만 모아 보여 줍니다.
 *   GET  /api/kream-movers → (준비 중 · 501) KREAM 시세를 사이트 「시세·팝수」 탭에 공급하는 자리
 *   GET  /api/pop?q=      → (준비 중 · 501) PSA·BRG 팝수를 공급하는 자리
 *
 * 실행 예:
 *   node server.js                       # 127.0.0.1:3100
 *   PORT=3100 HOST=0.0.0.0 node server.js # 같은 와이파이의 다른 기기에서도 접속
 *   cloudflared tunnel --url http://127.0.0.1:3100   # 밖에서 쓸 주소 만들기
 *
 * 환경 변수(선택)
 *   PORT / HOST              리슨 포트·주소 (기본 3100 / 127.0.0.1)
 *   RELAY_TIMEOUT_MS         체인별 조회 제한 (기본 8000)
 *   RELAY_CACHE_MS           같은 좌표 응답 캐시 (기본 60000, 0이면 끔)
 *   EMART24_BASE / CU_BASE / SEVEN_BASE   업체 주소가 바뀌었을 때 덮어쓰기
 *   EMART24_COOKIE           이마트24 웹뷰 세션 쿠키(있으면 그대로 사용)
 *   CU_COOKIE                포켓CU 로그인 세션 쿠키(있으면 매장별 수량까지 시도)
 *   SEVEN_AREA               세븐일레븐 점포 검색에 쓸 지역명(예: "포항 북구")
 *   SEVEN_ITEM_CDS           세븐일레븐에 물어볼 상품 바코드(쉼표 구분, 없으면 자동)
 *   SEVEN_SM_CD / SEVEN_RSA_KEY_B64   예전 방식(암호화 경로) 수동 지정 — 지금은 쓰지 않음
 *
 * 2026-11-18 개정(v1.1)에서 바뀐 점
 *   · 이마트24: 점포 조회 전에 재고 페이지를 한 번 열어 세션 쿠키를 받아 두고,
 *     실패하면 v2/v3 재고 경로를 차례로 시도합니다. 차단(403/500)이면 그 사실을
 *     sources에 그대로 적어 「재고 0」과 구분합니다.
 *   · CU: 검색어가 '포켓몬'이면 과자(빼빼로)만 잡혀 카드가 0건이었습니다.
 *     '포켓몬카드'로 먼저 찾고 카드 상품만 골라 씁니다(상품 확인은 실제로 됨).
 *     매장별 수량(stock)은 로그인 세션에서만 내려오므로, 없으면 0으로 속이지 않고
 *     note로 알립니다(CU_COOKIE를 주면 수량까지 시도).
 *   · 세븐일레븐: 앱 전용 암호화 경로 대신 공개 경로를 씁니다.
 *     상품 메타 `GET /api/v1/open/product/search/stock?itemCd=바코드`
 *     → 매장별 실재고 `POST /api/v1/open/real-stock/multi/01/stocks`(점포 1곳씩).
 *     상품 코드와 지역명은 실행할 때 자동으로 찾습니다.
 *
 * 주의: 이 서버는 조회만 합니다. 주문·결제·선점 같은 쓰기 요청은 없습니다.
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const VERSION = '1.1';
const SERVICE = 'pokemoa-relay';

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '127.0.0.1';
const TIMEOUT_MS = Number(process.env.RELAY_TIMEOUT_MS || 8000);
const CACHE_MS = Number(process.env.RELAY_CACHE_MS || 60000);

const BASE = {
  emart24: process.env.EMART24_BASE || 'https://everse.emart24.co.kr',
  emart24Open: 'https://emart24.co.kr',
  cu: process.env.CU_BASE || 'https://www.pocketcu.co.kr',
  seven: process.env.SEVEN_BASE || 'https://new.7-elevenapp.co.kr'
};

const DEFAULT_LAT = 36.0733;   // 포항 북구 환호동
const DEFAULT_LNG = 129.3947;
const DEFAULT_KEYWORD = '포켓몬카드';
const DEFAULT_RADIUS = 3000;   // m — 사이트가 ?radius= 로 덮어쓸 수 있다

const MAX_PRODUCTS = 5;        // 체인당 재고를 물어볼 상품 수 (요청 예산 보호)
const MAX_STORES = 40;         // 응답에 담는 점포 수
const SEVEN_STORE_LIMIT = 8;   // 세븐일레븐은 점포 1곳당 요청 1번이라 더 좁게
const SEVEN_MAX_ITEMS = 3;     // 세븐일레븐에서 점포마다 물어볼 상품 수

/* ------------------------------------------------------------ 공통 도구 */

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 12; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

function num(v, fallback) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 문자열 키를 소문자·기호 제거 형태로 비교하기 위한 도우미 */
function normKey(k) {
  return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 객체에서 후보 키 이름들로 첫 값을 꺼낸다 (응답 스키마가 조금 바뀌어도 견디도록) */
function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') return obj[name];
  }
  const lower = {};
  for (const k of Object.keys(obj)) lower[normKey(k)] = obj[k];
  for (const name of names) {
    const v = lower[normKey(name)];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** 깊이 중첩된 응답에서도 후보 키의 첫 값을 찾는다 (세븐일레븐 open API 대비) */
function pickDeep(obj, names, depth) {
  if (!obj || typeof obj !== 'object' || (depth || 0) > 6) return undefined;
  if (Array.isArray(obj)) {
    for (const row of obj) {
      const v = pickDeep(row, names, (depth || 0) + 1);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const own = pick(obj, names);
  if (own !== undefined) return own;
  for (const key of Object.keys(obj)) {
    const v = pickDeep(obj[key], names, (depth || 0) + 1);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** 응답 JSON 안에서 "점포처럼 생긴" 배열을 찾는다 */
function findArrayWith(obj, predicate, depth) {
  if (!obj || typeof obj !== 'object' || (depth || 0) > 5) return null;
  if (Array.isArray(obj)) {
    const hitCount = obj.filter((row) => row && typeof row === 'object' && predicate(row)).length;
    if (hitCount && hitCount * 2 >= obj.length) return obj;
    for (const row of obj) {
      const hit = findArrayWith(row, predicate, (depth || 0) + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    const hit = findArrayWith(obj[key], predicate, (depth || 0) + 1);
    if (hit) return hit;
  }
  return null;
}

function isStoreLike(row) {
  const lat = pick(row, ['lat', 'latitude', 'wgs84Lat', 'y', 'latVal', 'LATITUDE']);
  const lng = pick(row, ['lon', 'lng', 'longitude', 'wgs84Lon', 'x', 'longVal', 'LONGITUDE']);
  const name = pick(row, ['storeNm', 'storeName', 'store_nm', 'TITLE', 'name', 'nm']);
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && !!name;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 시간 초과(${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 쿠키 병 — 업체가 페이지를 한 번 열어야 세션을 주는 경우가 있어 아주 단순하게만 흉내 낸다 */
function newJar() {
  return { map: new Map() };
}

function jarCookie(jar) {
  if (!jar || !jar.map.size) return null;
  return Array.from(jar.map, ([k, v]) => `${k}=${v}`).join('; ');
}

function jarRemember(jar, res) {
  if (!jar) return;
  try {
    const lines = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = String(line).split(';')[0];
      const at = pair.indexOf('=');
      if (at > 0) jar.map.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  } catch (err) {
    /* 쿠키를 못 읽어도 조회는 계속한다 */
  }
}

/** HTML 오류 페이지를 사람이 읽을 한 줄로 줄인다 (style·script 내용은 버린다) */
function plainBrief(text) {
  return String(text || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

/**
 * 업체 응답은 HTML 오류 페이지(403 등)일 수 있으므로 본문을 먼저 확인한다.
 * diag를 넘기면 마지막 응답 상태·본문 머리를 그 object에 남긴다.
 */
async function request(url, init, label, jar, diag) {
  const headers = Object.assign({}, (init && init.headers) || {});
  const cookie = jarCookie(jar);
  if (cookie) headers.cookie = cookie;

  const tms = (init && init.tms) || TIMEOUT_MS;
  const opts = Object.assign({}, init, { headers });
  delete opts.tms;
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(tms) }, opts));
  jarRemember(jar, res);
  const text = await res.text();
  if (diag) {
    diag.push({
      label,
      url: url.replace(/\?.*$/, ''),
      status: res.status,
      bytes: text.length,
      head: text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    });
  }
  if (!res.ok) {
    const brief = plainBrief(text);
    const err = new Error(`${label} HTTP ${res.status}${brief ? ' · ' + brief : ''}`);
    err.upstreamStatus = res.status;
    throw err;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    const brief = plainBrief(text);
    const e = new Error(`${label} JSON 아님${brief ? ' · ' + brief : ''}`);
    e.upstreamStatus = res.status;
    throw e;
  }
}

const FORM_HEADERS = {
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'ko-KR,ko;q=0.9'
};

function formBody(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) sp.set(k, String(v));
  return sp.toString();
}

function distanceM(aLat, aLng, bLat, bLng) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** 상품명이 포켓몬카드(TCG) 상품인지 — 과자·문구 콜라보와 구분한다 */
function looksLikeCard(name) {
  const s = String(name || '');
  if (/빼빼로|과자|음료|우유|아이스크림|젤리|초콜릿/.test(s)) return false;
  return /카드|card|tcg|확장팩|부스터|celebration|스타터|덱|이브이|피카츄|리자몽|파트너즈/i.test(s);
}

/** 동시 실행 수를 제한하며 매핑한다 (업체 서버를 두드리는 양 조절) */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let index = 0;
  const workers = new Array(Math.min(limit, list.length || 1)).fill(0).map(async () => {
    while (index < list.length) {
      const i = index++;
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function uniqBy(list, keyOf) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/* --------------------------------------------------------- 이마트24 */
/* 점포: POST /store/getNearStoreList (lat, lon, pageCnt, order_by=distance)
   상품: POST /stock/stock/search  → Content-Type에 charset=UTF-8 이 없으면 한글이 0건
   점포별 수량: GET /api/stock/v3/stock-search/store (searchPluCode, bizNoArr)
              → 응답 { storeGoodsQty:[{BIZNO, PLU_CD, BIZQTY}] } (취급 점포만 행이 온다) */

const emart24Jar = newJar();
let emart24Primed = false;

const EMART24_HEADERS = () =>
  Object.assign(
    {
      'user-agent': UA_ANDROID,
      origin: BASE.emart24,
      referer: BASE.emart24 + '/stock/goods/search',
      'accept-language': 'ko-KR,ko;q=0.9'
    },
    FORM_HEADERS
  );

/** 재고 페이지를 한 번 열어 세션 쿠키를 받아 둔다(차단 판정도 여기서 드러난다) */
async function emart24Prime(diag) {
  if (emart24Primed) return;
  emart24Primed = true;
  if (process.env.EMART24_COOKIE) {
    for (const pair of process.env.EMART24_COOKIE.split(';')) {
      const at = pair.indexOf('=');
      if (at > 0) emart24Jar.map.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  }
  try {
    await request(
      BASE.emart24 + '/stock/goods/search',
      { method: 'GET', headers: { 'user-agent': UA_ANDROID, 'accept-language': 'ko-KR,ko;q=0.9' } },
      '이마트24 세션',
      emart24Jar,
      diag
    );
  } catch (err) {
    /* 페이지가 막혀도 API가 열려 있는 경우가 있어 계속 진행한다 */
  }
}

async function emart24Stores(lat, lng, diag) {
  const body = await request(
    BASE.emart24 + '/store/getNearStoreList',
    {
      method: 'POST',
      headers: EMART24_HEADERS(),
      body: formBody({ lat, lon: lng, pageCnt: 50, order_by: 'distance' })
    },
    '이마트24 점포',
    emart24Jar,
    diag
  );
  const rows = findArrayWith(body, isStoreLike) || [];
  return uniqBy(
    rows
      .map((row) => {
        const code = String(pick(row, ['bizNo', 'bizno', 'BIZNO', 'storeCode', 'storeCd', 'CODE', 'smCd']) || '');
        const sLat = num(pick(row, ['lat', 'latitude', 'wgs84Lat', 'LATITUDE', 'y']), NaN);
        const sLng = num(pick(row, ['lon', 'lng', 'longitude', 'wgs84Lon', 'LONGITUDE', 'x']), NaN);
        if (!code || !Number.isFinite(sLat) || !Number.isFinite(sLng)) return null;
        return {
          id: code,
          name: String(pick(row, ['storeNm', 'storeName', 'store_nm', 'TITLE', 'name']) || ''),
          address: String(pick(row, ['storeAddr', 'roadAddr', 'addr', 'ADDRESS', 'address']) || ''),
          lat: sLat,
          lng: sLng,
          tel: String(pick(row, ['tel', 'phone', 'storeTel', 'PHONE']) || '')
        };
      })
      .filter(Boolean),
    (s) => s.id
  );
}

async function emart24Products(keyword, diag) {
  const body = await request(
    BASE.emart24 + '/stock/stock/search',
    {
      method: 'POST',
      headers: EMART24_HEADERS(),
      body: formBody({
        currentPage: 1,
        pageCnt: 40,
        sortType: 'SALE',
        saleProductYn: 'N',
        searchWord: keyword
      })
    },
    '이마트24 상품',
    emart24Jar,
    diag
  );
  const list = (body && (body.productList || (body.data && body.data.productList))) || [];
  const rows = list
    .map((p) => ({
      code: String(pick(p, ['pluCd', 'PLU_CD', 'plu_cd']) || ''),
      name: String(pick(p, ['goodsNm', 'goodsName', 'GOODS_NM']) || '')
    }))
    .filter((p) => p.code && p.name);
  return rows;
}

/** 상품 1개를 재고 조회 화면에 올리는 준비 호출 — 실패해도 무시한다 */
async function emart24Prepare(plu, diag) {
  try {
    await request(
      BASE.emart24 + '/api/stock/v1/search/keyword',
      {
        method: 'POST',
        headers: EMART24_HEADERS(),
        body: formBody({ pluCd: plu, searchPage: 'STOCK_SEARCH_SERVICE' })
      },
      '이마트24 준비',
      emart24Jar,
      diag
    );
  } catch (err) {
    /* 준비 호출은 실패해도 본 조회로 넘어간다 */
  }
}

async function emart24StockOne(plu, bizNos, diag) {
  const query = 'searchPluCode=' + encodeURIComponent(plu) + '&bizNoArr=' + encodeURIComponent(bizNos.join(','));
  const headers = {
    'user-agent': UA_ANDROID,
    'x-requested-with': 'XMLHttpRequest',
    accept: 'application/json',
    referer: BASE.emart24 + '/stock/goods/search'
  };
  let body;
  try {
    body = await request(BASE.emart24 + '/api/stock/v3/stock-search/store?' + query, { method: 'GET', headers }, '이마트24 재고', emart24Jar, diag);
  } catch (err) {
    /* v3가 막히거나 바뀌면 v2로 한 번 더 */
    body = await request(BASE.emart24 + '/api/stock/v2/stock-search/store?' + query, { method: 'GET', headers }, '이마트24 재고(v2)', emart24Jar, diag);
  }
  /* v2는 본문이 문자열로 한 번 더 감싸져 오는 경우가 있다 */
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      body = {};
    }
  }
  const rows = (body && (body.storeGoodsQty || (body.data && body.data.storeGoodsQty))) || [];
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const biz = String(pick(row, ['BIZNO', 'bizNo', 'bizno']) || '');
    const qty = num(pick(row, ['BIZQTY', 'bizQty', 'qty']), null);
    if (!biz || qty === null) continue;
    out.push({ biz, qty });
  }
  return out;
}

async function collectEmart24(lat, lng, keyword, diag, ctx) {
  await emart24Prime(diag);
  let stores = [];
  let note = '';
  try {
    stores = await emart24Stores(lat, lng, diag);
  } catch (err) {
    /* 재고 화면이 막혔을 때: 공개 매장 API로 점포라도 확보한다 */
    const fallback = await emart24StoresApi1(lat, lng, (ctx && ctx.area) || '', diag).catch(() => []);
    if (!fallback.length) throw err;
    stores = fallback;
    note = '점포는 공개 매장 API에서 받았습니다(앱 재고 화면 차단). 수량은 비어 있을 수 있습니다.';
  }
  if (!stores.length) return { stores: [], products: [], hints: [], note: '점포 목록이 비었습니다' };

  const keywords = uniqBy([keyword, '포켓몬카드', '포켓몬'], (k) => k).slice(0, 3);
  let products = [];
  for (const kw of keywords) {
    products = await emart24Products(kw, diag);
    const cards = products.filter((p) => looksLikeCard(p.name));
    if (cards.length) {
      products = cards;
      break;
    }
  }
  if (!products.length) return { stores: [], products: [], hints: stores, note: '상품 검색 0건' };
  products = products.slice(0, MAX_PRODUCTS);

  const nameByCode = {};
  for (const p of products) nameByCode[p.code] = p.name;

  const bizNos = stores.map((s) => s.id);
  const qtyByBiz = new Map();
  for (const p of products) {
    await emart24Prepare(p.code, diag);
    const rows = await emart24StockOne(p.code, bizNos, diag);
    for (const row of rows) {
      if (!qtyByBiz.has(row.biz)) qtyByBiz.set(row.biz, []);
      qtyByBiz.get(row.biz).push({ code: p.code, qty: row.qty });
    }
  }

  const out = [];
  for (const store of stores) {
    const rows = qtyByBiz.get(store.id);
    if (!rows || !rows.length) continue; // 취급하지 않는 점포는 결과에도 넣지 않는다
    const items = rows.map((r) => ({ name: nameByCode[r.code] || r.code, qty: r.qty, code: r.code }));
    out.push(Object.assign({}, store, { brand: 'emart24', items }));
  }
  return { stores: out, products, hints: stores, note };
}

/** 공개 매장 API(emart24.co.kr/api1/store) — 앱 재고 화면이 막혔을 때 점포만이라도 확보 */
async function emart24StoresApi1(lat, lng, area, diag) {
  const query = String(area || '').trim();
  const rows = [];
  for (const page of [1, 2]) {
    const url =
      BASE.emart24Open + '/api1/store?page=' + page + (query ? '&search=' + encodeURIComponent(query) : '');
    const body = await request(url, { method: 'GET', headers: { 'user-agent': UA_ANDROID, accept: 'application/json' }, tms: 2500 }, '이마트24 공개 매장', null, diag);
    const pageRows = (body && body.data) || [];
    rows.push(...(Array.isArray(pageRows) ? pageRows : []));
    if (!Array.isArray(pageRows) || pageRows.length < 30) break;
  }
  return uniqBy(
    rows
      .map((row) => {
        const code = String(pick(row, ['CODE', 'code', 'BIZNO']) || '');
        const sLat = num(pick(row, ['LATITUDE', 'latitude', 'lat']), NaN);
        const sLng = num(pick(row, ['LONGITUDE', 'longitude', 'lng']), NaN);
        if (!code || !Number.isFinite(sLat) || !Number.isFinite(sLng)) return null;
        if (distanceM(lat, lng, sLat, sLng) > DEFAULT_RADIUS * 2) return null;
        const addr = [pick(row, ['ADDRESS']), pick(row, ['ADDRESS_DE'])].filter(Boolean).join(' ').trim();
        return {
          id: code,
          name: String(pick(row, ['TITLE', 'title']) || ''),
          address: addr,
          lat: sLat,
          lng: sLng,
          tel: String(pick(row, ['PHONE', 'phone']) || '')
        };
      })
      .filter(Boolean),
    (s) => s.id
  );
}

/* --------------------------------------------------------------- CU */
/* 앱 웹뷰 API: 재고 검색 POST /api/search/rest/stock/main,
   좌표 기반 점포 POST /api/store. 앱 식별자(BGFCU) User-Agent가 있어야 응답한다.
   매장별 수량(storeList[].stock)은 로그인 세션에서만 채워지므로, 없으면 0으로 바꾸지 않는다. */

const CU_UA =
  'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36;BGFCU';

function cuHeaders() {
  const h = {
    'content-type': 'application/json',
    accept: 'application/json, text/javascript, */*; q=0.01',
    'x-requested-with': 'XMLHttpRequest',
    AJAX: 'true',
    'user-agent': CU_UA,
    origin: BASE.cu,
    referer: BASE.cu + '/search/stock/main'
  };
  if (process.env.CU_COOKIE) h.cookie = process.env.CU_COOKIE;
  return h;
}

async function cuSearchOne(keyword, diag) {
  const body = await request(
    BASE.cu + '/api/search/rest/stock/main',
    {
      method: 'POST',
      headers: cuHeaders(),
      body: JSON.stringify({
        searchWord: keyword,
        prevSearchWord: '',
        spellModifyUseYn: 'Y',
        offset: 0,
        limit: 40,
        searchSort: 'recom'
      })
    },
    'CU 상품',
    null,
    diag
  );
  const rows = (body && body.data && body.data.stockResult && body.data.stockResult.result.rows) || [];
  return rows
    .map((row) => row && row.fields)
    .filter(Boolean)
    .map((f) => ({
      code: String(pick(f, ['item_cd', 'itemCd']) || ''),
      name: String(pick(f, ['item_nm', 'itemNm']) || ''),
      onItemNo: String(pick(f, ['on_item_no', 'onItemNo']) || '')
    }))
    .filter((p) => p.code && p.name);
}

async function cuSearch(keyword, diag) {
  const keywords = uniqBy([keyword, '포켓몬카드', '포켓몬'], (k) => k).slice(0, 3);
  let all = [];
  for (const kw of keywords) {
    let rows = [];
    try {
      rows = await cuSearchOne(kw, diag);
    } catch (err) {
      if (!all.length) throw err;
      break;
    }
    all = all.concat(rows);
    const cards = all.filter((p) => looksLikeCard(p.name));
    if (cards.length >= 3) return uniqBy(cards, (p) => p.code).slice(0, MAX_PRODUCTS);
  }
  const cards = all.filter((p) => looksLikeCard(p.name));
  return uniqBy(cards, (p) => p.code).slice(0, MAX_PRODUCTS);
}

async function cuStoresForItem(lat, lng, item, diag) {
  const payload = {
    latVal: String(lat),
    longVal: String(lng),
    baseLatVal: String(lat),
    baseLongVal: String(lng),
    items: '',
    jipCd: '',
    voucher_cd: '',
    exPin: '',
    custId: '',
    isRecommend: 'Y',
    recommendId: '',
    cateTyp: '',
    pageType: 'search_improve stock_sch_improve',
    item_cd: item.code,
    storeCd: '',
    isCoupon: '',
    target: '',
    firstRowNum: '',
    tabId: '2',
    filterSvcList: [],
    filterAdtList: [],
    stockCdcYn: 'N',
    alcProdYn: '',
    searchStock: false,
    pickupType: 'change',
    getRoute: 'IOS',
    areaTplNo: '0',
    itemCd: item.code,
    onItemNo: item.onItemNo || '',
    childMealPickUpYn: 'N',
    onlineType: '',
    searchWord: '',
    distanceLimitYn: 'N',
    stockChkYn: '',
    isCurrentSearch: 'N'
  };
  const body = await request(
    BASE.cu + '/api/store',
    {
      method: 'POST',
      headers: Object.assign(cuHeaders(), { referer: BASE.cu + '/search/stock?isRecommend=Y&item_cd=' + item.code }),
      body: JSON.stringify(payload)
    },
    'CU 점포',
    null,
    diag
  );
  const list = (body && body.storeList) || [];
  const out = [];
  for (const raw of list) {
    const sLat = num(pick(raw, ['latVal', 'lat', 'latitude']), NaN);
    const sLng = num(pick(raw, ['longVal', 'lng', 'longitude']), NaN);
    const code = String(pick(raw, ['storeCd', 'storeCode', 'store_cd']) || '');
    if (!code || !Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;
    const road = [pick(raw, ['doroStoreAddr1']), pick(raw, ['doroStoreAddr2'])].filter(Boolean).join(' ').trim();
    const jibun = [pick(raw, ['addrFst']), pick(raw, ['addrDetail'])].filter(Boolean).join(' ').trim();
    const qty = num(pick(raw, ['stock', 'stockQty']), null);
    out.push({
      id: code,
      name: String(pick(raw, ['storeNm', 'storeName', 'store_nm']) || ''),
      address: road || jibun,
      lat: sLat,
      lng: sLng,
      tel: String(pick(raw, ['storeTelNo', 'tel']) || ''),
      item: { name: item.name, qty, code: item.code }
    });
  }
  return out;
}

async function collectCu(lat, lng, keyword, diag) {
  const products = await cuSearch(keyword, diag);
  if (!products.length) return { stores: [], products: [], note: '카드 상품 검색 0건' };

  /* 비로그인 응답에는 수량이 없으므로, 세션 쿠키가 없을 때는 점포 목록을 한 번만 받아
     지역명·점포 힌트로만 쓴다(체인 요청 예산 절약). CU_COOKIE가 있으면 상품별로 모두 묻는다. */
  const targets = process.env.CU_COOKIE ? products : products.slice(0, 1);
  const lists = await mapLimit(targets, 5, async (item) => {
    try {
      return await cuStoresForItem(lat, lng, item, diag);
    } catch (err) {
      return [];
    }
  });

  const byStore = new Map();
  const hints = [];
  let withQty = 0;
  for (const list of lists) {
    for (const row of list) {
      hints.push(row);
      if (row.item.qty === null) continue; // 수량 미확인 → 0으로 속이지 않는다
      withQty++;
      const cur = byStore.get(row.id) || Object.assign({}, row, { items: [] });
      const idx = cur.items.findIndex((i) => i.code === row.item.code);
      if (idx >= 0) cur.items[idx] = row.item;
      else cur.items.push(row.item);
      byStore.set(row.id, cur);
    }
  }
  const stores = Array.from(byStore.values()).map((s) => Object.assign(s, { brand: 'cu' }));
  const note = withQty
    ? ''
    : 'CU는 앱 로그인 세션에서만 매장별 수량을 내려줍니다(비로그인 응답 stock=null). ' +
      '상품은 ' + products.length + '종 확인. CU_COOKIE를 넣으면 수량까지 조회합니다.';
  return { stores, products, hints, note };
}

/* ------------------------------------------------------- 세븐일레븐 */
/* 앱 재고 화면도 웹뷰다. 예전 /api/v1/stock/search/stores 는 좌표를 RSA로 암호화해
   보내야 하지만, 같은 데이터를 주는 공개 경로가 열려 있다.
     ① 상품 메타   GET  /api/v1/open/product/search/stock?itemCd=바코드
                    → { smCd, stokMngCd, stokMngQty, stockApplicationRate }
     ② 점포별 재고 POST /api/v1/open/real-stock/multi/01/stocks
                    body { smCd, stokMngCd, stokMngQty, stockApplicationRate, storeList:[점포 1곳] }
                    ※ storeList는 반드시 한 곳씩(두 곳 이상이면 400)
     ③ 점포 후보   POST /api/v1/open/search/store
                    body { collection:"store", query:지역명, sort:"Date/desc", listCount:9999 }
   로그인·암호화 없이 평문으로 동작한다. */

function sevenHeaders(extra) {
  return Object.assign(
    {
      accept: 'application/json',
      'user-agent': UA_ANDROID,
      origin: BASE.seven,
      referer: BASE.seven + '/',
      'accept-language': 'ko-KR,ko;q=0.9'
    },
    extra || {}
  );
}

async function sevenItemMeta(itemCd, diag) {
  const body = await request(
    BASE.seven + '/api/v1/open/product/search/stock?itemCd=' + encodeURIComponent(itemCd),
    { method: 'GET', headers: sevenHeaders() },
    '세븐일레븐 상품 메타',
    null,
    diag
  );
  const smCd = pickDeep(body, ['smCd', 'sm_cd']);
  const stokMngCd = pickDeep(body, ['stokMngCd', 'stok_mng_cd', 'stockMngCd']);
  const stokMngQty = pickDeep(body, ['stokMngQty', 'stok_mng_qty', 'stockMngQty']);
  const rate = pickDeep(body, ['stockApplicationRate', 'stock_application_rate']);
  if (!smCd) return null;
  return {
    itemCd,
    smCd: String(smCd),
    stokMngCd: String(stokMngCd || smCd),
    stokMngQty: Number(stokMngQty || 1) || 1,
    stockApplicationRate: String(rate || '100'),
    name: String(pickDeep(body, ['goodsNm', 'goodsNmKor', 'productNm', 'itemNm', 'smNm']) || itemCd)
  };
}

async function sevenStoreCandidates(area, diag) {
  const body = await request(
    BASE.seven + '/api/v1/open/search/store',
    {
      method: 'POST',
      headers: sevenHeaders({ 'content-type': 'application/json; charset=UTF-8' }),
      body: JSON.stringify({ collection: 'store', query: area, sort: 'Date/desc', listCount: 9999 })
    },
    '세븐일레븐 점포',
    null,
    diag
  );
  const rows = findArrayWith(body, isStoreLike) || [];
  return uniqBy(
    rows
      .map((row) => {
        const code = String(pick(row, ['storeCd', 'storeCode', 'store_cd', 'smCd', 'storeNo']) || '');
        const sLat = num(pick(row, ['lat', 'latitude', 'y', 'latVal', 'wgs84Lat']), NaN);
        const sLng = num(pick(row, ['lon', 'lng', 'longitude', 'x', 'longVal', 'wgs84Lon']), NaN);
        if (!code || !Number.isFinite(sLat) || !Number.isFinite(sLng)) return null;
        return {
          id: code,
          name: String(pick(row, ['storeNm', 'storeName', 'store_nm', 'name']) || ''),
          address: String(pick(row, ['addr', 'address', 'storeAddr', 'roadAddr', 'doroAddr']) || ''),
          lat: sLat,
          lng: sLng
        };
      })
      .filter(Boolean),
    (s) => s.id
  );
}

async function sevenRealStock(storeCd, meta, diag) {
  const body = await request(
    BASE.seven + '/api/v1/open/real-stock/multi/01/stocks',
    {
      method: 'POST',
      headers: sevenHeaders({ 'content-type': 'application/json; charset=UTF-8' }),
      body: JSON.stringify({
        smCd: meta.smCd,
        stokMngCd: meta.stokMngCd,
        stokMngQty: meta.stokMngQty,
        stockApplicationRate: meta.stockApplicationRate,
        storeList: [storeCd]
      })
    },
    '세븐일레븐 재고',
    null,
    diag
  );
  const qty = pickDeep(body, ['stock', 'realStock', 'stokMngQty', 'stockQty', 'qty', 'realStockQty']);
  return qty === undefined ? null : num(qty, null);
}

async function collectSeven(lat, lng, ctx, diag) {
  const area = process.env.SEVEN_AREA || ctx.area || '';
  if (!area) return { stores: [], products: [], note: '지역명을 찾지 못해 세븐일레븐 점포 검색을 건너뜁니다(SEVEN_AREA로 지정 가능)' };

  /* 상품 바코드는 CU 검색 결과(공용 바코드)를 먼저 쓰고, 없으면 환경변수 */
  let itemCodes = String(process.env.SEVEN_ITEM_CDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!itemCodes.length) itemCodes = (ctx.barcodes || []).slice(0, MAX_PRODUCTS);
  if (!itemCodes.length) return { stores: [], products: [], note: '상품 바코드를 찾지 못했습니다' };

  const found = await mapLimit(itemCodes.slice(0, SEVEN_MAX_ITEMS), 3, async (code) => {
    try {
      return await sevenItemMeta(code, diag);
    } catch (err) {
      return null; /* 상품 하나가 실패해도 나머지를 계속 본다 */
    }
  });
  const metas = found.filter(Boolean);
  if (!metas.length) return { stores: [], products: [], note: '상품 메타(smCd)를 받지 못했습니다 (앱 상품이 아니거나 차단)' };

  const candidates = await sevenStoreCandidates(area, diag);
  if (!candidates.length) return { stores: [], products: metas, note: '지역 "' + area + '" 점포 검색 0건' };

  const near = candidates
    .map((s) => Object.assign({}, s, { distanceM: distanceM(lat, lng, s.lat, s.lng) }))
    .filter((s) => s.distanceM <= ctx.radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, SEVEN_STORE_LIMIT);

  const nameByCode = {};
  for (const m of metas) nameByCode[m.smCd] = m.name;

  const built = await mapLimit(near, 3, async (store) => {
    const items = [];
    for (const meta of metas) {
      let qty = null;
      try {
        qty = await sevenRealStock(store.id, meta, diag);
      } catch (err) {
        /* 점포 하나·상품 하나 실패는 건너뛴다 */
      }
      if (qty === null) continue;
      items.push({ name: nameByCode[meta.smCd] || meta.smCd, qty, code: meta.smCd });
    }
    if (!items.length) return null;
    return { id: store.id, brand: 'seven', name: store.name, address: store.address, lat: store.lat, lng: store.lng, items };
  });
  const out = built.filter(Boolean);
  return { stores: out, products: metas, note: '' };
}

/* --------------------------------------------------------- 결과 조립 */

function mergeStores(stores, lat, lng, nowIso) {
  const out = [];
  for (const s of stores) {
    const distance = distanceM(lat, lng, s.lat, s.lng);
    const twin = out.find(
      (o) => o.brand === s.brand && distanceM(o.lat, o.lng, s.lat, s.lng) < 60
    );
    if (twin) {
      for (const item of s.items || []) if (!twin.items.some((i) => i.code === item.code)) twin.items.push(item);
      continue;
    }
    const items = (s.items || []).filter((i) => Number.isFinite(Number(i.qty)));
    if (!items.length) continue;
    out.push({
      id: `${s.brand}-${s.id}`,
      brand: s.brand,
      name: s.name,
      address: s.address || '',
      lat: s.lat,
      lng: s.lng,
      distanceM: distance,
      status: items.some((i) => Number(i.qty) > 0) ? 'in_stock' : 'out_of_stock',
      items: items.map((i) => ({ name: i.name, code: String(i.code), qty: Number(i.qty) })),
      updatedAt: nowIso
    });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, MAX_STORES);
}

/** 점포 주소에서 세븐일레븐 점포검색에 쓸 지역명을 뽑는다 ("경북 포항시 북구 …" → "포항시 북구") */
function areaFromStores(stores) {
  for (const s of stores || []) {
    if (!s) continue;
    const addr = String(s.address || '').trim();
    if (!addr) continue;
    const tokens = addr.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) return tokens[1] + ' ' + tokens[2];
    if (tokens.length >= 2) return tokens[1];
  }
  return '';
}

const cache = new Map();

function cacheKey(lat, lng, keyword, radius) {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${keyword},${radius}`;
}

async function runChain(name, task, diag) {
  try {
    const value = await withTimeout(task(), TIMEOUT_MS + 6000, name);
    return { ok: true, value: value || { stores: [], products: [], note: '' } };
  } catch (err) {
    const msg = (err && err.message) || String(err);
    return {
      ok: false,
      error: msg.slice(0, 200),
      upstreamStatus: err && err.upstreamStatus ? err.upstreamStatus : undefined,
      value: { stores: [], products: [], note: '' }
    };
  }
}

async function nearby(lat, lng, keyword, radius) {
  const key = cacheKey(lat, lng, keyword, radius);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Object.assign({}, hit.value, { cached: true });

  const nowIso = new Date().toISOString();
  const diag = { emart24: [], cu: [], seven: [] };

  /* CU를 먼저 본다(상품 바코드·점포 주소가 나온다) → 이마트24·세븐일레븐에 넘긴다 */
  const cu = await runChain('cu', () => collectCu(lat, lng, keyword, diag.cu), diag.cu);

  const ctx = {
    radius,
    area: areaFromStores([].concat((cu.value && cu.value.hints) || [], cu.value.stores)),
    barcodes: uniqBy(cu.value.products || [], (p) => p.code).map((p) => p.code)
  };

  const [em, se] = await Promise.all([
    runChain('emart24', () => collectEmart24(lat, lng, keyword, diag.emart24, ctx), diag.emart24),
    runChain('seven', () => collectSeven(lat, lng, ctx, diag.seven), diag.seven)
  ]);

  const sources = {};
  const stores = [];
  for (const [name, res] of [['emart24', em], ['cu', cu], ['seven', se]]) {
    const list = res.value.stores || [];
    const entry = { ok: res.ok, count: list.length };
    if (res.ok) {
      if (res.value.note) entry.note = res.value.note;
      const products = res.value.products || [];
      if (products.length) entry.products = products.length;
    } else {
      entry.error = res.error;
      if (res.upstreamStatus) entry.upstream = res.upstreamStatus;
    }
    sources[name] = entry;
    stores.push(...list);
  }

  const merged = mergeStores(stores, lat, lng, nowIso).filter((s) => s.distanceM <= radius);

  const value = {
    ok: true,
    relay: 'home-tablet',
    version: VERSION,
    lat,
    lng,
    keyword,
    radius,
    generatedAt: nowIso,
    sources,
    stores: merged
  };

  cache.set(key, { at: Date.now(), value });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return value;
}

/* 체인별로 "어디까지 됐는지"만 보여 주는 진단 — 태블릿에서 원인 확인용 */
async function diagnose(lat, lng, keyword, radius) {
  const diag = { emart24: [], cu: [], seven: [] };
  const steps = {};
  const safe = async (name, task) => {
    try {
      steps[name] = { ok: true, detail: await task() };
    } catch (err) {
      steps[name] = { ok: false, error: ((err && err.message) || String(err)).slice(0, 200) };
    }
  };

  await safe('emart24', async () => {
    await emart24Prime(diag.emart24);
    const stores = await emart24Stores(lat, lng, diag.emart24);
    const products = await emart24Products('포켓몬카드', diag.emart24);
    const cards = products.filter((p) => looksLikeCard(p.name));
    let stockRows = null;
    if (cards.length && stores.length) {
      await emart24Prepare(cards[0].code, diag.emart24);
      stockRows = await emart24StockOne(cards[0].code, stores.map((s) => s.id), diag.emart24);
    }
    return { stores: stores.length, products: products.length, cards: cards.length, sampleStockRows: stockRows ? stockRows.length : null };
  });

  await safe('cu', async () => {
    const products = await cuSearch(keyword, diag.cu);
    let storesWithQty = null;
    if (products.length) {
      const list = await cuStoresForItem(lat, lng, products[0], diag.cu);
      storesWithQty = list.filter((r) => r.item.qty !== null).length;
    }
    return { cards: products.length, sample: products[0] && products[0].name, storesWithQty };
  });

  const cuStore = await (async () => {
    try {
      return await cuSearchOne(keyword, []);
    } catch (err) {
      return [];
    }
  })();
  const area = process.env.SEVEN_AREA || '';
  await safe('seven', async () => {
    const codes = String(process.env.SEVEN_ITEM_CDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const itemCode = codes[0] || (cuStore[0] && cuStore[0].code) || '';
    let meta = null;
    if (itemCode) meta = await sevenItemMeta(itemCode, diag.seven);
    let stores = 0;
    if (area) stores = (await sevenStoreCandidates(area, diag.seven)).length;
    let stock = null;
    if (meta && stores) {
      const cands = await sevenStoreCandidates(area, []);
      stock = await sevenRealStock(cands[0].id, meta, diag.seven);
    }
    return { area: area || '(미설정)', itemCode, smCd: meta && meta.smCd, stores, sampleStock: stock };
  });

  return { ok: true, version: VERSION, lat, lng, keyword, radius, steps, upstream: diag };
}

/* --------------------------------------------------------------- HTTP */

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-requested-with');
  res.setHeader('access-control-max-age', '86400');
}

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text)
  });
  res.end(text);
}

const HELP_HTML = `<!doctype html><html lang="ko"><meta charset="utf-8">
<title>포켓몬카드모아 중계 서버</title>
<body style="font:15px/1.6 -apple-system,system-ui,'Malgun Gothic',sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#16233c">
<h1 style="font-size:20px">포켓몬카드모아 실재고 중계 서버가 켜져 있습니다</h1>
<p>이 주소를 포켓몬카드모아 「동네에서 찾기」 화면의 <b>실시간 중계 연결</b>에 붙여 넣으면 매장별 실제 재고가 표시됩니다.</p>
<ul>
<li><code>GET /health</code> — 서버 상태</li>
<li><code>GET /api/nearby?lat=36.07&amp;lng=129.39&amp;keyword=포켓몬카드&amp;radius=3000</code> — 주변 점포 실재고</li>
<li><code>GET /api/diag</code> — 체인별 조회 진단(어디서 막히는지)</li>
</ul>
<p style="color:#5b6b85">조회 전용입니다. 주문·결제·선점 요청은 만들지 않습니다.</p>
</body></html>`;

const server = http.createServer(async (req, res) => {
  cors(res);
  const started = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: '조회 전용 서버입니다 (GET, OPTIONS만 지원)' });
    return;
  }

  try {
    if (path === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: SERVICE,
        version: VERSION,
        time: new Date().toISOString(),
        uptimeSec: Math.round(process.uptime())
      });
      return;
    }

    if (path === '/api/nearby') {
      const lat = num(url.searchParams.get('lat'), DEFAULT_LAT);
      const lng = num(url.searchParams.get('lng'), DEFAULT_LNG);
      const keyword = (url.searchParams.get('keyword') || DEFAULT_KEYWORD).trim().slice(0, 40) || DEFAULT_KEYWORD;
      const radius = Math.min(20000, Math.max(300, num(url.searchParams.get('radius'), DEFAULT_RADIUS)));
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        sendJson(res, 400, { ok: false, error: 'lat/lng 범위를 확인해 주세요' });
        return;
      }
      const value = await nearby(lat, lng, keyword, radius);
      sendJson(res, 200, value);
      console.log(
        `[nearby] ${lat.toFixed(4)},${lng.toFixed(4)} "${keyword}" r=${radius} ` +
          `emart24=${value.sources.emart24.count} cu=${value.sources.cu.count} seven=${value.sources.seven.count} ` +
          `→ ${value.stores.length}곳 ${Date.now() - started}ms${value.cached ? ' (cache)' : ''}`
      );
      return;
    }

    if (path === '/api/diag') {
      const lat = num(url.searchParams.get('lat'), DEFAULT_LAT);
      const lng = num(url.searchParams.get('lng'), DEFAULT_LNG);
      const keyword = (url.searchParams.get('keyword') || DEFAULT_KEYWORD).trim().slice(0, 40) || DEFAULT_KEYWORD;
      const radius = Math.min(20000, Math.max(300, num(url.searchParams.get('radius'), DEFAULT_RADIUS)));
      const value = await diagnose(lat, lng, keyword, radius);
      sendJson(res, 200, value);
      console.log(`[diag] ${Date.now() - started}ms`);
      return;
    }

    if (path === '/api/kream-movers') {
      /* 계약(안) — 사이트의 「시세·팝수」 탭이 이 응답이 있으면 정적 값을 대체합니다.
         KREAM은 로그인·검색 API 제한이 있어 수집기를 태블릿에서 따로 돌려 붙이는 단계입니다.
         그 전까지는 명확한 501로 답해 사이트가 정적 데이터를 그대로 쓰게 합니다. */
      sendJson(res, 501, {
        ok: false,
        error: 'kream_movers_not_configured',
        hint: 'KREAM 시세 수집기를 연결하면 이 경로가 items 배열을 돌려줍니다.'
      });
      return;
    }

    if (path === '/api/pop') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
      const company = (url.searchParams.get('company') || '').trim().slice(0, 12);
      sendJson(res, 501, {
        ok: false,
        error: 'pop_lookup_not_configured',
        query: q,
        company,
        hint: 'PSA·BRG 팝수 조회기를 연결하면 이 경로가 카드별 팝수를 돌려줍니다.'
      });
      return;
    }

    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(HELP_HTML);
      return;
    }

    sendJson(res, 404, { ok: false, error: '없는 경로입니다. /health, /api/nearby, /api/diag 를 쓰세요.' });
  } catch (err) {
    console.error('[error]', err && err.message);
    sendJson(res, 500, { ok: false, error: (err && err.message) || '서버 오류' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`포켓몬카드모아 중계 서버 v${VERSION} — http://${HOST}:${PORT}`);
  console.log(`  상태 확인: curl http://${HOST}:${PORT}/health`);
  console.log(`  실재고:    curl "http://${HOST}:${PORT}/api/nearby?lat=${DEFAULT_LAT}&lng=${DEFAULT_LNG}&keyword=${encodeURIComponent(DEFAULT_KEYWORD)}"`);
  console.log(`  진단:      curl "http://${HOST}:${PORT}/api/diag"`);
  console.log('  바깥에서 쓰려면: cloudflared tunnel --url http://' + HOST + ':' + PORT);
});

module.exports = { server, nearby, diagnose, mergeStores, distanceM, looksLikeCard, areaFromStores };
