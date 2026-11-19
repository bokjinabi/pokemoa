#!/usr/bin/env node
/**
 * GS25 authReturn 주소 → 세션 파일(gs25-session.json) 만들기 — 의존성 없는 단일 파일.
 * ---------------------------------------------------------------
 * 네이버 로그인을 마치면 브라우저가 아래 주소로 이동합니다.
 *
 *   https://b2c-bff.woodongs.com/api/bff/v4/grmHub/authReturn
 *        ?result=Y&resultCode=0000&token=<access JWT>&refresh=<refresh JWT>…
 *
 * 그 주소를 이 스크립트의 표준입력으로 넣으면, 화면에 토큰을 찍지 않고
 * `{ accessToken, refreshToken, deviceId }` 만 담은 0600 파일을 만듭니다.
 *
 *   node gs25-capture.js --device <티켓 발급 때 쓴 deviceId> [--out gs25-session.json]
 *   → 실행 후 주소를 붙여넣고 Enter (토큰은 화면에 되찍히지 않습니다)
 *
 *   node gs25-capture.js --device … --url-file auth-return.url   # 주소를 파일로 받은 경우
 *
 * 실패하면 아무것도 쓰지 않고 0이 아닌 코드로 끝납니다.
 * 성공 출력: {"authenticated":true,"file":"…","accessExpiresAt":"…","refreshExpiresAt":"…"}
 */

'use strict';

const fs = require('node:fs');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function jwtExp(token) {
  const m = String(token || '').match(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  if (!m) throw new Error('JWT 형식이 아닙니다');
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= 0) throw new Error('만료 시각이 없습니다');
  return exp * 1000;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function fail(reason, detail) {
  console.error(JSON.stringify({ authenticated: false, reason, detail: detail || null }));
  process.exit(1);
}

function main() {
  const deviceId = String(arg('device', '') || '').trim();
  if (!/^[\w-]{1,100}$/.test(deviceId)) fail('device_missing', '--device <티켓 발급 때의 deviceId> 가 필요합니다');

  const outFile = arg('out', 'gs25-session.json');
  const urlFile = arg('url-file', '');
  const raw = (urlFile ? fs.readFileSync(urlFile, 'utf8') : readStdin()).trim();
  if (!raw) fail('url_missing', 'authReturn 주소를 붙여넣고 Enter 를 눌러 주세요');

  let url;
  try {
    url = new URL(raw.replace(/^["'<]+|["'>]+$/g, ''));
  } catch (err) {
    fail('url_invalid');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'b2c-bff.woodongs.com' || url.pathname !== '/api/bff/v4/grmHub/authReturn') {
    fail('not_gs_auth_return', url.hostname + url.pathname);
  }

  const q = url.searchParams;
  const result = q.get('result');
  const resultCode = q.get('resultCode');
  const access = String(q.get('token') || '').replace(/^Bearer\s+/i, '').trim();
  const refresh = String(q.get('refresh') || '').replace(/^Bearer\s+/i, '').trim();
  if (result && result !== 'Y') fail('result_not_y', result);
  if (resultCode !== '0000') fail('result_code', resultCode || null);
  if (!access || !refresh) fail('tokens_missing');

  let accessExp;
  let refreshExp;
  try {
    accessExp = jwtExp(access);
    refreshExp = jwtExp(refresh);
  } catch (err) {
    fail('token_invalid', err.message);
  }
  if (accessExp < Date.now() || refreshExp < Date.now()) fail('token_expired');

  /* 기존 파일은 지우지 않고 옆에 백업해 둔다(회전된 refresh 를 잃지 않도록). */
  if (fs.existsSync(outFile)) {
    try {
      fs.copyFileSync(outFile, outFile + '.prev');
      fs.chmodSync(outFile + '.prev', 0o600);
    } catch (err) {
      /* 백업 실패는 무시 */
    }
  }
  const tmp = outFile + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ accessToken: access, refreshToken: refresh, deviceId }), { mode: 0o600 });
  fs.renameSync(tmp, outFile);
  try {
    fs.chmodSync(outFile, 0o600);
  } catch (err) {
    /* 윈도우 등 권한 개념이 다른 환경 */
  }

  console.log(
    JSON.stringify({
      authenticated: true,
      file: outFile,
      accessExpiresAt: new Date(accessExp).toISOString(),
      refreshExpiresAt: new Date(refreshExp).toISOString()
    })
  );
}

main();
