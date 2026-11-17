#!/usr/bin/env node
/**
 * 포케모아(PokeMoa) — 집 태블릿 실재고 중계 서버
 * ---------------------------------------------------------------
 * 태블릿(Termux)에서 `node server.js` 한 줄로 실행하는 무의존 단일 파일 서버입니다.
 * 외부 npm 패키지 없이 Node 18+ 내장 모듈(http, crypto, fetch)만 씁니다.
 *
 *   GET  /health    → { ok, service: "pokemoa-relay", version, time }
 *   GET  /api/nearby?lat=36.07&lng=129.39&keyword=포켓몬
 *                   → 이마트24 · CU · 세븐일레븐의 점포별 실재고를 모아 돌려줍니다.
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
 *   SEVEN_RSA_KEY_B64        세븐일레븐 좌표 암호화 공개키(SPKI DER, base64) — 있을 때만 사용
 *   SEVEN_SM_CD              세븐일레븐 상품 코드 — 있을 때만 재고 조회
 *
 * 주의: 이 서버는 조회만 합니다. 주문·결제·선점 같은 쓰기 요청은 없습니다.
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const VERSION = '1.0';
const SERVICE = 'pokemoa-relay';

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '127.0.0.1';
const TIMEOUT_MS = Number(process.env.RELAY_TIMEOUT_MS || 8000);
const CACHE_MS = Number(process.env.RELAY_CACHE_MS || 60000);

const BASE = {
  emart24: process.env.EMART24_BASE || 'https://everse.emart24.co.kr',
  cu: process.env.CU_BASE || 'https://www.pocketcu.co.kr',
  seven: process.env.SEVEN_BASE || 'https://new.7-elevenapp.co.kr'
};

const DEFAULT_LAT = 36.0733;   // 포항 북구 환호동
const DEFAULT_LNG = 129.3947;
const DEFAULT_KEYWORD = '포켓몬';

const MAX_PRODUCTS = 6;        // 체인당 재고를 물어볼 상품 수 (요청 예산 보호)
const MAX_STORES = 40;         // 응답에 담는 점포 수

/* ------------------------------------------------------------ 공통 도구 */

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 12; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

function num(v, fallback) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 문자열 키를 소문자·언더스코어 제거 형태로 비교하기 위한 도우미 */
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

/** 응답 JSON 안에서 "점포처럼 생긴" 배열을 찾는다 */
function findArrayWith(obj, predicate, depth) {
  if (!obj || typeof obj !== 'object' || (depth || 0) > 4) return null;
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

/** 업체 응답은 HTML 오류 페이지(403 등)일 수 있으므로 본문을 먼저 확인한다 */
async function request(url, init, label) {
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(TIMEOUT_MS) }, init));
  const text = await res.text();
  if (!res.ok) {
    const brief = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    throw new Error(`${label} HTTP ${res.status}${brief ? ' · ' + brief : ''}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    const brief = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    throw new Error(`${label} JSON 아님${brief ? ' · ' + brief : ''}`);
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

/* --------------------------------------------------------- 이마트24 */
/* 점포: POST /store/getNearStoreList, 상품: POST /stock/stock/search,
   점포별 수량: GET /api/stock/v3/stock-search/store (searchPluCode, bizNoArr) */

async function emart24Stores(lat, lng) {
  const body = await request(
    BASE.emart24 + '/store/getNearStoreList',
    {
      method: 'POST',
      headers: Object.assign({ 'user-agent': UA_ANDROID, origin: BASE.emart24, referer: BASE.emart24 + '/stock/goods/search' }, FORM_HEADERS),
      body: formBody({ lat, lon: lng, pageCnt: 20, order_by: 'distance' })
    },
    '이마트24 점포'
  );
  const rows = findArrayWith(body, isStoreLike) || [];
  return rows
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
    .filter(Boolean);
}

function looksLikeCard(name) {
  return /카드|card|tcg|확장팩|부스터|celebration|스타터|덱|이브이|피카츄|리자몽/i.test(name || '');
}

async function emart24Products(keyword) {
  const body = await request(
    BASE.emart24 + '/stock/stock/search',
    {
      method: 'POST',
      headers: Object.assign({ 'user-agent': UA_ANDROID, origin: BASE.emart24, referer: BASE.emart24 + '/stock/goods/search' }, FORM_HEADERS),
      body: formBody({
        currentPage: 1,
        pageCnt: 20,
        sortType: 'SALE',
        saleProductYn: 'N',
        searchWord: keyword
      })
    },
    '이마트24 상품'
  );
  const list = (body && (body.productList || (body.data && body.data.productList))) || [];
  const rows = list
    .map((p) => ({ code: String(pick(p, ['pluCd', 'PLU_CD', 'plu_cd']) || ''), name: String(pick(p, ['goodsNm', 'goodsName', 'GOODS_NM']) || '') }))
    .filter((p) => p.code && p.name);
  const cards = rows.filter((p) => looksLikeCard(p.name));
  return (cards.length ? cards : rows).slice(0, MAX_PRODUCTS);
}

async function emart24Stock(pluCodes, bizNos) {
  const out = {};
  await Promise.all(
    pluCodes.map(async (plu) => {
      const url =
        BASE.emart24 +
        '/api/stock/v3/stock-search/store?searchPluCode=' +
        encodeURIComponent(plu) +
        '&bizNoArr=' +
        encodeURIComponent(bizNos.join(','));
      const body = await request(url, { method: 'GET', headers: { 'user-agent': UA_ANDROID, 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' } }, '이마트24 재고');
      const rows = (body && body.storeGoodsQty) || [];
      for (const row of rows) {
        const biz = String(pick(row, ['BIZNO', 'bizNo', 'bizno']) || '');
        const qty = num(pick(row, ['BIZQTY', 'bizQty', 'qty']), null);
        if (!biz || qty === null) continue;
        (out[biz] = out[biz] || []).push({ code: plu, qty });
      }
    })
  );
  return out;
}

async function collectEmart24(lat, lng, keyword) {
  const stores = await emart24Stores(lat, lng);
  if (!stores.length) return [];
  const products = await emart24Products(keyword);
  if (!products.length) return [];
  const nameByCode = {};
  for (const p of products) nameByCode[p.code] = p.name;
  const qty = await emart24Stock(products.map((p) => p.code), stores.map((s) => s.id));
  const out = [];
  for (const store of stores) {
    const rows = qty[store.id];
    if (!rows || !rows.length) continue; // 취급하지 않는 점포는 결과에도 넣지 않는다
    const items = rows.map((r) => ({ name: nameByCode[r.code] || r.code, qty: r.qty, code: r.code }));
    out.push(Object.assign({}, store, { brand: 'emart24', items }));
  }
  return out;
}

/* --------------------------------------------------------------- CU */
/* 앱 웹뷰 API: 재고 검색 POST /api/search/rest/stock/main,
   좌표 기반 점포 POST /api/store. 앱 식별자 User-Agent가 있어야 응답한다. */

const CU_UA =
  'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36;BGFCU';

function cuHeaders() {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/javascript, */*; q=0.01',
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': CU_UA,
    origin: BASE.cu,
    referer: BASE.cu + '/search/stock/main'
  };
}

async function cuSearch(keyword) {
  try {
    await request(
      BASE.cu + '/api/search/display/stock',
      { method: 'POST', headers: cuHeaders(), body: '{}' },
      'CU 준비'
    );
  } catch (err) {
    /* 준비 호출은 실패해도 본 검색으로 넘어간다 */
  }
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
        limit: 20,
        searchSort: 'recom'
      })
    },
    'CU 상품'
  );
  const result = body && body.data && body.data.stockResult && body.data.stockResult.result;
  const rows = (result && result.rows) || [];
  const items = rows
    .map((row) => row && row.fields)
    .filter(Boolean)
    .map((f) => ({ code: String(pick(f, ['item_cd', 'itemCd']) || ''), name: String(pick(f, ['item_nm', 'itemNm']) || '') }))
    .filter((p) => p.code && p.name);
  const cards = items.filter((p) => looksLikeCard(p.name));
  return (cards.length ? cards : items).slice(0, MAX_PRODUCTS);
}

async function cuStoresForItem(lat, lng, item) {
  const payload = {
    latVal: String(lat),
    longVal: String(lng),
    baseLatVal: String(lat),
    baseLongVal: String(lng),
    tabId: '2',
    filterSvcList: [],
    filterAdtList: [],
    stockCdcYn: 'N',
    searchStock: false,
    pickupType: 'change',
    getRoute: 'IOS',
    areaTplNo: '0',
    childMealPickUpYn: 'N',
    isCurrentSearch: 'N',
    pageType: 'search_improve',
    searchWord: '',
    isRecommend: '',
    recommendId: '',
    jipCd: item.code,
    itemCd: item.code,
    item_cd: item.code,
    onItemNo: ''
  };
  const body = await request(
    BASE.cu + '/api/store',
    { method: 'POST', headers: cuHeaders(), body: JSON.stringify(payload) },
    'CU 점포'
  );
  const list = (body && body.storeList) || [];
  const out = [];
  for (const raw of list) {
    const stock = num(pick(raw, ['stock', 'stockQty']), null);
    if (stock === null) continue;
    const sLat = num(pick(raw, ['latVal', 'lat', 'latitude']), NaN);
    const sLng = num(pick(raw, ['longVal', 'lng', 'longitude']), NaN);
    const code = String(pick(raw, ['storeCd', 'storeCode', 'store_cd']) || '');
    if (!code || !Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;
    const road = [pick(raw, ['doroStoreAddr1']), pick(raw, ['doroStoreAddr2'])].filter(Boolean).join(' ').trim();
    const jibun = [pick(raw, ['addrFst']), pick(raw, ['addrDetail'])].filter(Boolean).join(' ').trim();
    out.push({
      id: code,
      name: String(pick(raw, ['storeNm', 'storeName', 'store_nm']) || ''),
      address: road || jibun,
      lat: sLat,
      lng: sLng,
      tel: String(pick(raw, ['storeTelNo', 'tel']) || ''),
      item: { name: item.name, qty: stock, code: item.code }
    });
  }
  return out;
}

async function collectCu(lat, lng, keyword) {
  const products = await cuSearch(keyword);
  if (!products.length) return [];
  const lists = await Promise.all(products.map((item) => cuStoresForItem(lat, lng, item)));
  const byStore = new Map();
  for (const list of lists) {
    for (const row of list) {
      const cur = byStore.get(row.id) || Object.assign({}, row, { items: [] });
      /* 같은 상품이 여러 번 오면 마지막 값을 쓴다 */
      const idx = cur.items.findIndex((i) => i.code === row.item.code);
      if (idx >= 0) cur.items[idx] = row.item;
      else cur.items.push(row.item);
      byStore.set(row.id, cur);
    }
  }
  return Array.from(byStore.values()).map((s) => Object.assign(s, { brand: 'cu' }));
}

/* ------------------------------------------------------- 세븐일레븐 */
/* 앱은 좌표를 RSA-OAEP(SHA-256)로 암호화해 보내고 상품 코드(smCd)를 요구한다.
   공개키와 상품 코드가 없으면 재고를 받을 수 없으므로, 그 경우 이 체인만
   status: "error"로 격리하고 나머지 체인 결과는 그대로 돌려준다. */

function sevenEncrypt(value) {
  const b64 = process.env.SEVEN_RSA_KEY_B64;
  if (!b64) return null;
  const key = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
  const cipher = crypto.publicEncrypt(
    { key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(String(value), 'utf8')
  );
  return cipher.toString('base64');
}

async function collectSeven(lat, lng) {
  const headers = {
    accept: 'application/json',
    'user-agent': UA_ANDROID,
    origin: BASE.seven,
    referer: BASE.seven + '/'
  };
  await request(BASE.seven + '/api/v1/auth/session/is-authenticated', { method: 'GET', headers }, '세븐일레븐 세션');

  if (!process.env.SEVEN_SM_CD) {
    throw new Error('상품 코드(SEVEN_SM_CD) 미설정 — 앱 전용 경로라 재고 조회를 건너뜁니다');
  }
  const myLat = sevenEncrypt(lat);
  const myLng = sevenEncrypt(lng);
  if (!myLat || !myLng) {
    throw new Error('좌표 암호화 공개키(SEVEN_RSA_KEY_B64) 미설정 — 앱 전용 암호화가 필요합니다');
  }
  const body = await request(
    BASE.seven + '/api/v1/stock/search/stores',
    {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
      body: JSON.stringify({
        searchType: 'list',
        myLat,
        myLng,
        order: 'stock',
        smCd: process.env.SEVEN_SM_CD,
        ignoreRateYn: 'Y'
      })
    },
    '세븐일레븐 재고'
  );
  const rows = findArrayWith(body, isStoreLike) || [];
  return rows
    .map((row) => {
      const code = String(pick(row, ['smCd', 'storeCd', 'storeCode', 'storeNo']) || '');
      const sLat = num(pick(row, ['lat', 'latitude', 'y']), NaN);
      const sLng = num(pick(row, ['lon', 'lng', 'longitude', 'x']), NaN);
      const qty = num(pick(row, ['stokMngQty', 'stock', 'realStock']), null);
      if (!code || !Number.isFinite(sLat) || !Number.isFinite(sLng)) return null;
      return {
        id: code,
        brand: 'seven',
        name: String(pick(row, ['storeNm', 'storeName', 'name']) || ''),
        address: String(pick(row, ['addr', 'address', 'storeAddr']) || ''),
        lat: sLat,
        lng: sLng,
        items: [{ name: process.env.SEVEN_SM_CD, qty: qty === null ? 0 : qty, code: process.env.SEVEN_SM_CD }]
      };
    })
    .filter(Boolean);
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
      items: items.map((i) => ({ name: i.name, qty: Number(i.qty), code: String(i.code) })),
      updatedAt: nowIso
    });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, MAX_STORES);
}

const cache = new Map();

function cacheKey(lat, lng, keyword) {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${keyword}`;
}

async function nearby(lat, lng, keyword) {
  const key = cacheKey(lat, lng, keyword);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Object.assign({}, hit.value, { cached: true });

  const nowIso = new Date().toISOString();
  const channels = [
    ['emart24', collectEmart24(lat, lng, keyword)],
    ['cu', collectCu(lat, lng, keyword)],
    ['seven', collectSeven(lat, lng)]
  ];

  const settled = await Promise.allSettled(
    channels.map(([name, task]) => withTimeout(task, TIMEOUT_MS + 4000, name))
  );

  const sources = {};
  const stores = [];
  settled.forEach((res, i) => {
    const name = channels[i][0];
    if (res.status === 'fulfilled') {
      const list = res.value || [];
      sources[name] = { ok: true, count: list.length };
      stores.push(...list);
    } else {
      const msg = (res.reason && res.reason.message) || String(res.reason);
      sources[name] = { ok: false, count: 0, error: msg.slice(0, 200) };
    }
  });

  const value = {
    ok: true,
    relay: 'home-tablet',
    version: VERSION,
    lat,
    lng,
    keyword,
    generatedAt: nowIso,
    sources,
    stores: mergeStores(stores, lat, lng, nowIso)
  };

  cache.set(key, { at: Date.now(), value });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return value;
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
<title>포케모아 중계 서버</title>
<body style="font:15px/1.6 -apple-system,system-ui,'Malgun Gothic',sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#16233c">
<h1 style="font-size:20px">포케모아 실재고 중계 서버가 켜져 있습니다</h1>
<p>이 주소를 포케모아 「동네에서 찾기」 화면의 <b>실시간 중계 연결</b>에 붙여 넣으면 매장별 실제 재고가 표시됩니다.</p>
<ul>
<li><code>GET /health</code> — 서버 상태</li>
<li><code>GET /api/nearby?lat=36.07&amp;lng=129.39&amp;keyword=포켓몬</code> — 주변 점포 실재고</li>
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
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        sendJson(res, 400, { ok: false, error: 'lat/lng 범위를 확인해 주세요' });
        return;
      }
      const value = await nearby(lat, lng, keyword);
      sendJson(res, 200, value);
      console.log(
        `[nearby] ${lat.toFixed(4)},${lng.toFixed(4)} "${keyword}" ` +
          `emart24=${value.sources.emart24.count} cu=${value.sources.cu.count} seven=${value.sources.seven.count} ` +
          `→ ${value.stores.length}곳 ${Date.now() - started}ms${value.cached ? ' (cache)' : ''}`
      );
      return;
    }

    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(HELP_HTML);
      return;
    }

    sendJson(res, 404, { ok: false, error: '없는 경로입니다. /health, /api/nearby 를 쓰세요.' });
  } catch (err) {
    console.error('[error]', err && err.message);
    sendJson(res, 500, { ok: false, error: (err && err.message) || '서버 오류' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`포케모아 중계 서버 v${VERSION} — http://${HOST}:${PORT}`);
  console.log(`  상태 확인: curl http://${HOST}:${PORT}/health`);
  console.log(`  실재고:    curl "http://${HOST}:${PORT}/api/nearby?lat=${DEFAULT_LAT}&lng=${DEFAULT_LNG}&keyword=포켓몬"`);
  console.log('  바깥에서 쓰려면: cloudflared tunnel --url http://' + HOST + ':' + PORT);
});

module.exports = { server, nearby, mergeStores, distanceM };
