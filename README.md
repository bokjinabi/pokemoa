# 포케모아 (PokeMoa) — 포켓몬 카드 정가·입고·재고 허브

포켓몬 카드 **MEGA 확장팩 「30th CELEBRATION」** 기준으로 정가 구매처, 추첨·입고 일정,
편의점·아트박스·카드샵 재고 지도(데모), 수록 카드 도감과 구매 가이드를 한 페이지에 모은 정적 사이트입니다.
외부 CDN·지도 API·프레임워크 없이 HTML/CSS/JS만으로 동작합니다.

- 데이터 기준일: 2026-11-17
- 대상 뷰포트: 모바일 390×844, 데스크톱 1280×800 (그 외 반응형)
- 콘솔 에러 0건으로 검증 완료

---

## 1. 로컬에서 보기

```bash
cd pokemoa
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080/ 열기
```

`file://`로 열어도 대부분 동작하지만, `fetch` 기반 기능이 없으므로 문제는 없습니다.
(지도·탭·검색 모두 순수 DOM/SVG로 그립니다.)

## 2. 폴더 구조

```
pokemoa/
├─ index.html                # 홈 / 지도 / 일정·입고 / 도감·가이드 (한 페이지, 해시 라우팅)
├─ privacy.html              # 개인정보처리방침 (단독 URL — AdSense 심사용)
├─ terms.html                # 이용약관 (단독 URL)
├─ robots.txt
├─ sitemap.xml
├─ assets/
│  ├─ css/style.css          # 전체 스타일 (모바일 우선)
│  └─ js/
│     ├─ data.js             # 매장·카드·일정·구매처 데이터
│     ├─ map.js              # 자체 SVG 인터랙티브 지도 엔진
│     └─ app.js              # 탭·필터·검색·모달·계산기
├─ screenshots/              # 검증 스크린샷
└─ pokemoa-web.zip           # 배포용 압축본 (index/privacy/terms/assets/robots/sitemap/README)
```

## 3. 주요 기능

### 홈
- 히어로: 정가(1팩 3,500원 / 1박스 20팩 70,000원)와 리셀가 주의 안내
- **정가 구매처 보드 7개 채널**: 포켓몬스토어(추첨), SSG 공식인증샵(70,000+3,000), G마켓 공식인증샵,
  티씨지박스, 토이저러스·롯데마트, 아트박스(오프라인·자판기), 편의점 3사 — 실제 URL 링크 포함
- 인기 카드팩 트렌드 4종, 오늘의 체크 포인트, 최근 입고 타임라인(샘플)

### 지도 탐색
- **외부 지도 API/CDN 없이** SVG로 그린 스타일화 약도 (도로·블록·공원·해안/강)
- 드래그 팬, 휠·더블클릭·버튼 줌, 반경 링(1/3/5km), 축척 바
- 브랜드 필터 7종 + 반경 필터 + 지역 드롭다운(포항 북구/남구, 서울 강남/홍대/노원, 부산 서면)
- 마커 클릭 → 팝업(상태 배지·판매 단위·관측 시각·네이버 지도 링크)
- 지도와 매장 목록 양방향 연동, 상태별 카운트
- **샘플 데이터 고지**와 실제 확인용 공식 채널 8곳 바로가기

### 일정 · 입고
- 포켓몬스토어 1·2차 추첨, FUTURISTIC BOX, 편의점 3사 입고 일정 타임라인
- 요일별 입고 체크 가이드, 11월 입고 캘린더(예상 샘플), 최근 입고 피드, 공지 확인처 링크

### 도감 · 가이드
- 정가 vs 리셀 비교표 + **리셀 프리미엄 계산기**(팩당 단가·차액·비율)
- 수록 카드 도감 35장: 이름 검색 + 레어도 필터(FUR/SAR/AR/피카츄 30종/복각/에너지)
- 카드 클릭 → 상세 모달
- 미개봉(슈링크) 체크리스트 7항목, 가품·재포장 주의 신호
- FAQ 8문항 아코디언(한 번에 하나만 열림)

### 수익화 · 운영 페이지
- AdSense 슬롯 6곳: `home-top-banner`, `home-infeed-1`, `map-bottom`, `schedule-bottom`,
  `guide-bottom`, `mobile-sticky` — 점선 플레이스홀더 + `data-ad-slot` 속성
- 쿠팡 파트너스 슬롯 2곳(대가성 문구 포함)
- 푸터 모달: 소개 / 개인정보처리방침 / 이용약관 / 운영 문의(재고 제보 폼)
- `privacy.html`, `terms.html` 단독 문서, `sitemap.xml`, `robots.txt`, OG/Twitter/JSON-LD(WebSite·FAQPage)

## 4. 배포 전에 바꿀 것 (중요)

1. **도메인**: `https://bokjinabi.github.io/pokemoa` 를 실제 도메인으로 일괄 치환
   (`index.html`, `privacy.html`, `terms.html`, `sitemap.xml`, `robots.txt`)
2. **AdSense**: `index.html` 상단의 주석 처리된 `adsbygoogle.js` 스크립트를 풀고 `ca-pub-…` 입력,
   각 슬롯 자리에 `<ins class="adsbygoogle" data-ad-client="ca-pub-…" data-ad-slot="…">` 삽입
3. **쿠팡 파트너스**: `data-affiliate="coupang-30th"`, `data-affiliate="coupang-supplies"` 링크의
   `href`를 실제 파트너스 링크로 교체 (현재는 클릭 시 안내 토스트만 표시)
4. **운영 문의**: `tpl-contact`의 폼을 실제 폼 백엔드(Formspree·Google Forms 등)나 메일 주소로 연결,
   `privacy.html` 문의처에 운영 이메일 기입
5. **실데이터**: 지도 매장/재고는 `assets/js/data.js`의 `regions`·`storeRows`에 있는 샘플입니다.
   실서비스에서는 편의점 앱 재고 API 또는 이용자 제보 DB로 교체하고, 관측 시각·상태를 서버에서 내려주세요.
6. **카드 이미지**: 저작권 문제로 공식 카드 이미지를 사용하지 않고 CSS 그라데이션 아트로 대체했습니다.
   이미지 사용 권한을 확보한 경우에만 교체하세요.
7. **광고 정책**: 만 14세 미만 이용자 대상이 아니며, 카드 도박·현금 거래를 조장하는 문구는 넣지 않았습니다.

## 5. 검증 기록

- Playwright(Chromium)로 데스크톱 1280×800, 모바일 390×844에서 확인
- 탭 4개 전환, 지도 지역 전환·브랜드/반경 필터·마커 클릭 팝업·줌 버튼, 카드 검색·레어도 필터·
  카드 모달, FAQ 아코디언, 푸터 모달 4종, 계산기, 모바일 하단 광고 닫기
- 콘솔 에러 0건, 페이지 에러 0건
- 스크린샷: `screenshots/01-home-desktop.png`, `02-map-desktop.png`,
  `03-cards-guide.png`, `04-mobile-home.png` (+ `05-mobile-map.png`)

## 6. 참고 자료

- 포켓몬 카드 게임 공식 제품 정보 — https://pokemoncard.co.kr/card/960
- 포켓몬스토어 30주년 특설 페이지 — https://www.pokemonstore.co.kr/pages/pokemoncardgame30th/product/index.html
- SSG 공식인증샵 상품 페이지 — https://www.ssg.com/item/itemView.ssg?itemId=1000881834004
- 30th Celebration 카드 목록(176종) — https://www.tcgheart.com/set/30th-celebration-korean
- 편의점 3사 판매 일정 보도 — https://tcgnews.kr/article/34

포케모아는 포켓몬코리아 및 권리자와 무관한 비공식 정보 사이트입니다.
