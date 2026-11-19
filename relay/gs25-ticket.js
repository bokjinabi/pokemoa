#!/usr/bin/env node
/**
 * 우리동네GS(GS25) 로그인 시작 URL 만들기 — 의존성 없는 단일 파일.
 * ---------------------------------------------------------------
 * 우리동네GS 앱이 쓰는 `POST /api/bff/v4/grmHub/authTicket` 로 1회용 티켓을 받아,
 * GS 허브(네이버 로그인)로 들어가는 주소를 만들어 화면에 찍습니다.
 *
 *   node gs25-ticket.js                    # 티켓 발급 + 시작 URL 출력
 *   node gs25-ticket.js --out t.json       # deviceId 까지 파일로 남기기(권장)
 *
 * 출력의 `url` 을 브라우저에서 열고 네이버 로그인을 마치면, 마지막에
 * `https://b2c-bff.woodongs.com/api/bff/v4/grmHub/authReturn?...` 주소로 이동합니다.
 * 그 주소를 `gs25-capture.js` 에 넣으면 토큰 파일이 만들어집니다.
 *
 * 주의
 *  - 티켓은 10분 안에 한 번만 쓸 수 있습니다. 만료되면 이 스크립트를 다시 실행하세요.
 *  - `deviceId` 는 티켓 발급 때 쓴 값 그대로 세션 파일에 들어가야 합니다(--out 사용 권장).
 *  - 이 스크립트는 로그인·토큰을 대신 하지 않습니다. 네이버 로그인은 사람이 합니다.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const BASE = process.env.GS25_BFF_BASE || 'https://b2c-bff.woodongs.com';
const HUB = process.env.GS25_HUB_BASE || 'https://ex-hubpage.grm.gsretail.com';
const APP = {
  version: process.env.GS25_APP_VERSION || '5.3.61',
  build: process.env.GS25_APP_BUILD || '2132',
  model: process.env.GS25_APP_MODEL || 'sdk_gphone64_arm64',
  os: process.env.GS25_APP_OS || '14'
};

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function headers(deviceId) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': `woodongs-app/${APP.version} (Android; ${APP.os}; ${APP.model})`,
    request_id: crypto.randomUUID(),
    appinfo_device_id: deviceId,
    appinfo_model_name: APP.model,
    appinfo_os_version: APP.os,
    appinfo_app_version: APP.version,
    appinfo_app_build_number: APP.build,
    appinfo_os_type: 'android',
    'grm-sysCdDtl': '2011'
  };
}

async function main() {
  const deviceId = arg('device', crypto.randomUUID());
  const out = arg('out', '');

  const res = await fetch(BASE + '/api/bff/v4/grmHub/authTicket', {
    method: 'POST',
    headers: headers(deviceId),
    body: '{}',
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch (err) {
    body = {};
  }
  if (res.status !== 200 || body.resultCode !== '0000' || !body.ticket) {
    console.error(JSON.stringify({ ok: false, status: res.status, resultCode: body.resultCode || null }));
    process.exit(1);
  }

  const params = new URLSearchParams({
    grmSysCdDtl: '2011',
    page: 'NAVER',
    return: BASE + '/api/bff/v4/grmHub/authReturn',
    ticket: body.ticket
  });
  const url = HUB + '/bizmgt/signin/bridge?' + params.toString();

  if (out) {
    fs.writeFileSync(out, JSON.stringify({ deviceId, at: new Date().toISOString() }), { mode: 0o600 });
  }
  /* 티켓은 10분짜리 1회용입니다. 세션 토큰이 아니므로 출력해도 계정이 열리지 않습니다. */
  console.log(JSON.stringify({ ok: true, deviceId, expiresInSec: 600, url, out: out || null }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: (err && err.message) || String(err) }));
  process.exit(1);
});
