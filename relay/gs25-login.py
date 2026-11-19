#!/usr/bin/env python3
"""
GS25(우리동네GS) 로그인 → 세션 파일 만들기 (PC용, Playwright)
=============================================================
브라우저 콘솔(개발자 도구)을 쓰지 않고, 사람이 네이버 로그인만 하면
GS 재고 토큰(access·refresh·deviceId)을 파일로 저장합니다.

준비 (한 번만):
    pip install playwright
    python -m playwright install chromium

실행:
    python relay/gs25-login.py                    # 화면이 보이는 Chrome 창이 열립니다
    python relay/gs25-login.py --out gs25-session.json
    python relay/gs25-login.py --headless         # 화면 없이(로그인은 다른 방법으로)

하는 일:
  1) GS 1회용 티켓 발급 → GS 허브 주소 생성
  2) 브라우저로 열고 '네이버 통신 장애' 팝업을 닫은 뒤, GS 앱 라우터로 /bizmgt/signin/bridge/naver 이동
     (주소를 직접 열면 GS SHOP 채널이 되어 우리동네GS 토큰이 나오지 않습니다 — 2026-11-19 확인)
  3) 사람이 네이버 로그인(필요 시 추가 인증)
  4) 돌아온 code/state 로 GS 공식 로그인 모듈의 loginNaver 를 호출
  5) 최종 authReturn 주소에서 토큰만 뽑아 0600 파일로 저장 (토큰은 화면에 찍지 않습니다)

이 스크립트는 주문·결제 등 쓰기 요청을 하지 않습니다. 로그인만 대신 안내합니다.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import uuid

BFF = "https://b2c-bff.woodongs.com"
HUB = "https://ex-hubpage.grm.gsretail.com"
APP = {"version": "5.3.61", "build": "2132", "model": "sdk_gphone64_arm64", "os": "14"}

EXCHANGE_JS = r"""
async (moduleHint) => {
  const p = new URLSearchParams(location.search);
  const codes = p.getAll('code'), states = p.getAll('state');
  if (codes.length !== 1 || states.length !== 1 || !codes[0] || !states[0]) return 'NO_CODE';
  const nuxt = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties?.$nuxt;
  if (typeof nuxt?.runWithContext !== 'function') return 'NO_CONTEXT';
  let modulePath = moduleHint;
  if (!modulePath) {
    const hit = performance.getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => /\/_nuxt\/login\.[\w-]+\.js$/.test(n))
      .pop();
    if (!hit) return 'NO_MODULE';
    modulePath = new URL(hit).pathname;
  }
  try {
    const mod = await import(modulePath);
    if (typeof mod.u !== 'function') return 'NO_EXPORT:' + modulePath;
    const api = nuxt.runWithContext(() => mod.u());
    if (typeof api?.loginNaver !== 'function') return 'NO_LOGIN_NAVER';
    const r = await nuxt.runWithContext(() => api.loginNaver({ code: codes[0], state: states[0] }));
    return r === 'ERROR' ? 'EXCHANGE_ERROR' : 'EXCHANGE_OK';
  } catch (e) {
    return 'EXCHANGE_THROW:' + String(e).slice(0, 80);
  }
}
"""


def issue_ticket(device_id):
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": f"woodongs-app/{APP['version']}" + f" (Android; {APP['os']}; {APP['model']})",
        "request_id": str(uuid.uuid4()),
        "appinfo_device_id": device_id,
        "appinfo_model_name": APP["model"],
        "appinfo_os_version": APP["os"],
        "appinfo_app_version": APP["version"],
        "appinfo_app_build_number": APP["build"],
        "appinfo_os_type": "android",
        "grm-sysCdDtl": "2011",
    }
    req = urllib.request.Request(BFF + "/api/bff/v4/grmHub/authTicket", data=b"{}", headers=headers)
    with urllib.request.urlopen(req, timeout=15) as res:
        body = json.loads(res.read(1 << 17))
    if body.get("resultCode") != "0000" or not body.get("ticket"):
        raise RuntimeError("ticket_failed")
    query = urllib.parse.urlencode(
        {
            "grmSysCdDtl": "2011",
            "page": "NAVER",
            "return": BFF + "/api/bff/v4/grmHub/authReturn",
            "ticket": body["ticket"],
        }
    )
    return HUB + "/bizmgt/signin/bridge?" + query


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="gs25-session.json")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--channel", default="", help="설치된 Chrome 사용: --channel chrome (Chromium 내려받기 생략)")
    ap.add_argument("--timeout", type=int, default=300, help="로그인 대기 시간(초)")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        print(json.dumps({"authenticated": False, "reason": "playwright_missing",
                          "hint": "pip install playwright && python -m playwright install chromium"}))
        return 1

    device_id = str(uuid.uuid4())
    url = issue_ticket(device_id)
    print(json.dumps({"step": "ticket_issued", "deviceId": device_id}), flush=True)

    deadline = time.time() + args.timeout
    final_url = None
    exchange = None

    with sync_playwright() as pw:
        launch_kwargs = {"headless": args.headless}
        if args.channel:
            launch_kwargs["channel"] = args.channel
        browser = pw.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 480, "height": 900})
        page.goto(url, wait_until="domcontentloaded", timeout=60000)

        # '네이버 통신 장애' 팝업이 뜨면 확인
        for _ in range(3):
            try:
                btn = page.get_by_role("button", name="확인")
                if btn.count():
                    btn.first.click(timeout=2000)
                    break
            except Exception:
                pass
            page.wait_for_timeout(800)

        # GS 앱 라우터로 우리동네GS 채널 로그인 화면으로 이동
        push = page.evaluate(
            """async () => {
              const r = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties?.$router;
              if (!r) return 'NO_ROUTER';
              await r.push('/bizmgt/signin/bridge/naver');
              return 'OK';
            }"""
        )
        print(json.dumps({"step": "channel_bridge", "result": push}), flush=True)

        if not args.headless:
            print(json.dumps({"step": "waiting_for_login",
                              "message": "열린 창에서 네이버 로그인(필요 시 추가 인증)을 마쳐 주세요."}), flush=True)

        while time.time() < deadline:
            page.wait_for_timeout(1000)
            cur = page.url or ""
            if cur.startswith(BFF + "/api/bff/v4/grmHub/authReturn"):
                final_url = cur
                break
            if "/bizmgt/signin/bridge/naver" in cur and "code=" in cur:
                # GS 코드 교환 (한 번만)
                if exchange is None:
                    try:
                        exchange = page.evaluate(EXCHANGE_JS, None)
                    except Exception as exc:  # noqa: BLE001
                        exchange = "EVAL_ERROR:" + str(exc)[:60]
                    print(json.dumps({"step": "exchange", "result": exchange}), flush=True)
                continue
            if "/bizmgt/signin/join" in cur:
                print(json.dumps({"step": "join_required",
                                  "message": "GS 가입/동의 화면입니다. 창에서 진행해 주세요."}), flush=True)

        browser.close()

    if not final_url:
        print(json.dumps({"authenticated": False, "reason": "timeout_or_no_authreturn"}))
        return 1

    q = urllib.parse.parse_qs(urllib.parse.urlsplit(final_url).query)

    def one(name):
        v = q.get(name) or []
        return v[0] if len(v) == 1 else ""

    access = one("token").removeprefix("Bearer ").strip()
    refresh = one("refresh").removeprefix("Bearer ").strip()
    if one("result") not in ("", "Y") or one("resultCode") != "0000" or not access or not refresh:
        print(json.dumps({"authenticated": False, "reason": "authreturn_not_success",
                          "result": one("result"), "resultCode": one("resultCode")}))
        return 1

    data = json.dumps({"accessToken": access, "refreshToken": refresh, "deviceId": device_id})
    tmp = args.out + f".{os.getpid()}.tmp"
    fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(data)
    os.replace(tmp, args.out)
    try:
        os.chmod(args.out, 0o600)
    except OSError:
        pass
    exp = {}
    for key, tok in (("access", access), ("refresh", refresh)):
        try:
            payload = json.loads(
                __import__("base64").urlsafe_b64decode(tok.split(".")[1] + "=" * (-len(tok.split(".")[1]) % 4))
            )
            exp[key] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(int(payload["exp"])))
        except Exception:
            exp[key] = None
    print(json.dumps({"authenticated": True, "file": args.out,
                      "accessExpiresAt": exp.get("access"), "refreshExpiresAt": exp.get("refresh")},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
