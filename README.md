# 포케모아 (PokeMoa) — 포켓몬 카드 정가·입고·재고 허브

포켓몬 카드 **MEGA 확장팩 「30th CELEBRATION」** 기준으로 정가 구매처, 추첨·입고 일정,
편의점·아트박스 매장을 실제 지도에서 찾는 「동네 찾기」, 정가 구매처 보드, 추첨·입고 일정,
수록 카드 도감과 구매 가이드를 한 페이지에 모은 정적 사이트입니다.
프레임워크 없이 HTML/CSS/JS로 동작하며, 지도는 Leaflet + OpenStreetMap 타일, 주변 매장은 Overpass API로 조회합니다.

- 데이터 기준일: 2026-11-17 (지도 스냅샷도 같은 날짜)
- 대상 뷰포트: 모바일 390×844, 데스크톱 1280×800 (그 외 반응형)
- **v2 변경**: 첫 화면을 「동네에서 찾기」(실제 지도)로, 정가 구매처를 2번 탭으로 이동. SVG 약도 → 실제 OSM 지도 + 실시간 주변 매장 조회 + 로딩 UI
- **v2.1 추가**: 매장 목록 10곳 + `더보기` 접이식, 반경 20km(지방 전용·`out center 100` 상한), 구매처 카드별 실제 상품·검색 페이지 링크, 일정·입고 탭의 지난 기록 접기

---

## 1. 로컬에서 보기

```bash
cd pokemoa
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080/ 열기
```

`file://`로 열어도 탭·검색은 동작합니다. 지도는 Leaflet CDN과 OSM 타일, Overpass API를 쓰므로
인터넷 연결이 필요하고, 실시간 조회가 막히면 내장 좌표 스냅샷으로 자동 대체됩니다.

## 2. 폴더 구조

```
pokemoa/
├─ index.html                # 동네 찾기 / 정가 구매처 / 일정·입고 / 도감·가이드 (해시 라우팅)
├─ pokemoa-preview.html      # 위 파일 + CSS/JS를 한 파일로 합친 미리보기
├─ privacy.html              # 개인정보처리방침 (단독 URL — AdSense 심사용)
├─ terms.html                # 이용약관 (단독 URL)
├─ robots.txt
├─ sitemap.xml
├─ assets/
│  ├─ css/style.css          # 전체 스타일 (모바일 우선)
│  └─ js/
│     ├─ data.js             # 지역·OSM 좌표 스냅샷·카드·일정·구매처 데이터
│     ├─ map.js              # Leaflet + OSM 타일 + Overpass 조회 지도 엔진
│     └─ app.js              # 탭·필터·검색·모달·계산기
├─ screenshots/              # 검증 스크린샷
└─ pokemoa-web.zip           # 배포용 압축본 (index/privacy/terms/assets/robots/sitemap/README)
```

## 3. 주요 기능

### 1번 탭 — 동네에서 찾기 (v2 첫 화면)
- **실제 지도**: Leaflet 1.9.4 + OpenStreetMap 표준 타일 (도로·건물·지명 그대로)
- **실시간 주변 매장**: 지역 선택(포항 북구/남구, 서울 강남/홍대/노원, 부산 서면) 또는 **내 위치로 찾기**(브라우저 Geolocation) →
  Overpass API로 반경 내 편의점(`shop=convenience`)과 문구·완구·선물(`shop=stationery|toys|gift`) 좌표 조회
- **로딩 UI**: 지도 타일 → 매장 조회 2단계 진행률 바 + 스피너 + "실제 지도와 주변 매장 위치를 불러오는 중..." 안내,
  매장 목록은 스켈레톤 카드로 자리 표시
- **폴백**: Overpass 응답이 8초 안에 오지 않거나 429/502 제한이면 내장 실제 좌표 스냅샷(2026-11-17, OSM 조회분)으로 자동 전환.
  상단 배지가 `실시간 조회` / `내장 스냅샷` 상태를 그대로 표기하고 `실시간 다시 조회` 버튼 제공
- **매장 목록은 처음 10곳만** 표시하고 `더보기 (N개 더 보기)`로 펼침(다시 누르면 접힘). 지역·브랜드·반경 필터가 바뀌면 10곳 접힘 상태로 초기화
- 브랜드 필터 8종(전체·GS25·CU·세븐일레븐·이마트24·아트박스·문구완구선물·기타 편의점) + 반경 1/3/5/**20km** + 상태별 카운트
- **20km 반경**: 포항 등 지방·외곽에서만 활성화되고, 서울(강남·홍대·노원)·부산(서면) 도심에서는 비활성화 + `도심은 5km까지 지원` 안내와 함께 자동으로 5km로 전환. 20km 조회는 Overpass에 `out center 100` 상한을 걸고 가까운 100곳만 지도·목록에 올림
- 마커/목록 양방향 연동, 마커 선택 시 지도 하단 고정 카드(상태·거리·관측 시각·네이버 지도 링크)
- **정직한 고지**: 매장 위치·이름은 실제 OSM 데이터, 재고 상태(재고 있음/확인 필요/없음)는 편의점 앱 API 미연동으로 제보·샘플 기반임을 배지·카드·목록에서 표시

### 2번 탭 — 정가 구매처 (기존 홈)
- **채널별 실제 상품·검색 페이지 연결**: 포켓몬스토어 30th 상품(m6a), SSG 상품(1000881834004), G마켓 상품(4856436280), 티씨지박스 30th 1BOX(22970), 롯데ON 포켓몬카드 검색, POOM 포켓몬카드 검색(재고 있는 상품), CU 상품 검색
- 히어로: 정가(1팩 3,500원 / 1박스 20팩 70,000원)와 리셀가 주의 안내
- **정가 구매처 보드 7개 채널**: 포켓몬스토어(추첨), SSG 공식인증샵(70,000+3,000), G마켓 공식인증샵,
  티씨지박스, 토이저러스·롯데마트, 아트박스(오프라인·자판기), 편의점 3사 — 실제 URL 링크 포함
- 인기 카드팩 트렌드 4종, 오늘의 체크 포인트, 최근 입고 타임라인(샘플)

### 일정 · 입고
- **오늘(KST) 이후 일정만 기본 표시**: 지난 추첨·입고 기록은 `지난 일정 보기 (N건)` 접이식으로 숨김, 캘린더도 오늘 이후 입고일만 표시(`지난 입고일 보기` 토글로 확인)
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
5. **실데이터**: 매장 위치는 Overpass API 실시간 조회 + `assets/js/data.js`의 `osmSnapshot`(2026-11-17 스냅샷)을 사용합니다.
   스냅샷은 `python3` 스크립트로 Overpass 응답을 다시 받아 갱신하면 됩니다. 재고 상태는 아직 샘플(`sampleStatus`)이므로
   편의점 앱 재고 API 또는 이용자 제보 DB로 교체하고, 관측 시각·상태를 서버에서 내려주세요.
5-1. **지도 정책**: OSM 타일은 `tile.openstreetmap.org`를 사용합니다. 트래픽이 커지면 OSM 타일 사용 정책에 따라
   자체 타일 서버나 상용 타일 제공자로 옮겨야 합니다(현재는 저트래픽 정적 사이트 기준).
6. **카드 이미지**: 저작권 문제로 공식 카드 이미지를 사용하지 않고 CSS 그라데이션 아트로 대체했습니다.
   이미지 사용 권한을 확보한 경우에만 교체하세요.
7. **광고 정책**: 만 14세 미만 이용자 대상이 아니며, 카드 도박·현금 거래를 조장하는 문구는 넣지 않았습니다.

## 5. 검증 기록

- Playwright(Chromium)로 배포 URL(https://bokjinabi.github.io/pokemoa/)에 실제 접속해
  데스크톱 1280×900, 모바일 390×844에서 확인
- v2.1 확인 항목: 하단 내비 `동네에서 찾기`, 목록 10곳+더보기(펼침/접힘·필터 초기화), 20km 활성/비활성과 자동 5km 전환, `out center 100` 쿼리, 지난 일정 접기·캘린더 토글, 채널 링크 7종
- v2 확인 항목: 첫 화면이 「동네에서 찾기」인지, OSM 타일(`tile.openstreetmap.org`) 로드, 로딩 스피너·진행 바·스켈레톤 노출,
  배지의 조회 상태 표기, 지역 변경(포항 북구→부산 서면), 브랜드 필터(CU 6곳)·반경 필터(1/3/5km), 마커 선택 카드,
  내 위치(권한 허용·차단 양쪽), 2번 탭 「정가 구매처」, 지도 탭 왕복 후 지도 크기, 모바일 하단 내비 순서·가로 넘침 없음
- Overpass 응답 상태에 따른 세 가지 경로 모두 확인
  - 즉시 응답: `실시간 조회 · OpenStreetMap 주변 매장 N곳` (포항 북구 3km에서 실제 31곳 확인)
  - 8초 초과: 내장 좌표 스냅샷 15곳을 먼저 표시(`조금 더 기다리는 중`) → 42초에 실시간 응답 도착 시 31곳으로 자동 교체
  - 502·타임아웃: `실시간 조회 지연/제한 → 내장 실제 좌표 스냅샷 사용` 배지 + `실시간 다시 조회` 버튼
- 페이지 에러 0건. 콘솔에는 Overpass가 돌려준 502 응답 오류만 남고(외부 API 상태), 스크립트 오류는 없습니다.
- 스크린샷: `screenshots/01-pricing-desktop.png`, `02-map-desktop.png`, `03-map-loading-desktop.png`,
  `04-card-mobile.png`, `05-mobile-map.png`, `06-mobile-store-list.png`, `07-mobile-pricing.png`, `08-cards-guide.png`,
  `10-store-list-10-more.png`(10곳+더보기), `11-store-list-expanded.png`, `12-radius-20km.png`(20km 조회 로딩),
  `13-seoul-5km-note.png`(도심 20km 비활성), `14-schedule-folded.png`(지난 일정 접힘), `15-schedule-past-open.png`,
  `16-channels-links.png`, `17-mobile-schedule.png`
  (배포 화면 라이브 캡처: `downloads/pokemoa-v2-live-map.png`, `downloads/pokemoa-v2-live-stores.png`)

## 6. 참고 자료

- 포켓몬 카드 게임 공식 제품 정보 — https://pokemoncard.co.kr/card/960
- 포켓몬스토어 30주년 특설 페이지 — https://www.pokemonstore.co.kr/pages/pokemoncardgame30th/product/index.html
- SSG 공식인증샵 상품 페이지 — https://www.ssg.com/item/itemView.ssg?itemId=1000881834004
- 30th Celebration 카드 목록(176종) — https://www.tcgheart.com/set/30th-celebration-korean
- 편의점 3사 판매 일정 보도 — https://tcgnews.kr/article/34

포케모아는 포켓몬코리아 및 권리자와 무관한 비공식 정보 사이트입니다.
