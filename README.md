# 포케모아 (PokeMoa) — 포켓몬 카드 정가·입고·재고 허브

포켓몬 카드 **MEGA 확장팩 「30th CELEBRATION」** 기준으로 정가 구매처, 추첨·입고 일정,
편의점 4사 매장을 실제 지도에서 찾는 「동네 찾기」, 정가 구매처 보드, 추첨·입고 일정,
수록 카드 도감과 구매 가이드를 한 페이지에 모은 정적 사이트입니다.
프레임워크 없이 HTML/CSS/JS로 동작하며, 지도는 Leaflet + OpenStreetMap 타일, 주변 매장은 Overpass API로 조회합니다.

- 데이터 기준일: 2026-11-17 (지도 스냅샷도 같은 날짜)
- 대상 뷰포트: 모바일 390×844, 데스크톱 1280×800 (그 외 반응형)
- **v2 변경**: 첫 화면을 「동네에서 찾기」(실제 지도)로, 정가 구매처를 2번 탭으로 이동. SVG 약도 → 실제 OSM 지도 + 실시간 주변 매장 조회 + 로딩 UI
- **v2.1 추가**: 매장 목록 10곳 + `더보기` 접이식, 반경 20km(지방 전용·`out center 100` 상한), 구매처 카드별 실제 상품·검색 페이지 링크, 일정·입고 탭의 지난 기록 접기
- **v3 변경**: 지역 선택을 **전국 17개 시·도 · 55개 지역**으로 확장. `시/도` + `시/군/구` 2단 드롭다운 + **동네 이름 검색**. 지역별 `allow20` 메타데이터로 도심(5km까지)과 지방·외곽(20km까지)을 구분하고, 내장 OSM 스냅샷도 전국 55개 지역·반경 3km로 다시 받았습니다
- **v3.1 변경**: 지도를 **편의점 4사 전용**으로 정리(4사 외 업종·브랜드는 필터·쿼리·스냅샷에서 제외, Overpass 쿼리는 `shop=convenience`만). 매장 목록·지도 카드에 **취급·재고 카드 상품명 태그**(30th CELEBRATION · 입고 / 배틀 파트너즈 · 소량 / 확인 필요 / 최근 입고 품절)를 표시하고, 툴바에 **카드 상품 필터**를 추가했습니다

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
- **지역 선택 (전국)**: `시/도`(17개) → `시/군/구` 2단 드롭다운과 **동네 이름 검색**(예: 판교, 해운대, 제주시). 기본값은 포항 북구(환호동). 지역을 바꾸면 지도가 그 좌표로 이동하고 주변 매장을 새로 조회합니다. 55개 지역의 중심 좌표는 OpenStreetMap(Nominatim) 기준입니다
- **실시간 주변 매장**: 지역 선택 또는 **내 위치로 찾기**(브라우저 Geolocation) →
  Overpass API로 반경 내 편의점(`shop=convenience`) 좌표만 조회한 뒤 **편의점 4사(GS25·CU·세븐일레븐·이마트24)**만 남겨 표시(그 밖의 브랜드·업종은 제외)
- **로딩 UI**: 지도 타일 → 매장 조회 2단계 진행률 바 + 스피너 + "실제 지도와 주변 매장 위치를 불러오는 중..." 안내,
  매장 목록은 스켈레톤 카드로 자리 표시
- **폴백**: Overpass 응답이 8초 안에 오지 않거나 429/502 제한이면 내장 실제 좌표 스냅샷(2026-11-17, 전국 55개 지역·반경 3km OSM 조회분)으로 자동 전환.
  상단 배지가 `실시간 조회` / `내장 스냅샷` 상태를 그대로 표기하고 `실시간 다시 조회` 버튼 제공
- **매장 목록은 처음 10곳만** 표시하고 `더보기 (N개 더 보기)`로 펼침(다시 누르면 접힘). 지역·브랜드·반경 필터가 바뀌면 10곳 접힘 상태로 초기화
- 브랜드 필터 5종(전체·GS25·CU·세븐일레븐·이마트24) + 카드 상품 필터 7종(전체 카드·30th CELEBRATION·배틀 파트너즈·테라스탈 페스타 ex·로켓단의 영광·초전 브레이커·스타터 세트) + 반경 1/3/5/**20km** + 상태별 카운트
- **20km 반경**: 지역별 `allow20` 값으로 나뉩니다. 서울·인천·경기 주요 도심(수원·성남·용인·고양·부천)·광역시 도심(부산·대구·대전·광주·울산)은 5km까지이며 20km 버튼이 비활성화되고 `도심은 5km까지 지원` 안내와 함께 자동으로 5km로 전환됩니다. 포항·경주·경남·강원·충청·전라·제주와 경기 외곽(화성·평택·의정부)·세종은 20km가 활성화됩니다. 20km 조회는 Overpass에 `out center 100` 상한을 걸고 가까운 100곳만 지도·목록에 올림
- **매장별 취급·재고 카드명**: 목록 카드와 지도 팝업에 `30th CELEBRATION · 입고`, `배틀 파트너즈 · 소량`, `… · 확인 필요`, `최근 입고 품절` 같은 상품명 태그를 표시. 재고 있음 매장은 입고/소량, 확인 필요 매장은 확인 필요, 재고 없음 매장은 품절/미입고와 `최근 입고 품절` 머리표로 구분
- **카드 상품 필터**: 상단 `카드` 줄에서 원하는 상품을 고르면 그 상품을 취급(또는 최근 입고)한 매장만 지도·목록에 남고, 목록 머리에 `30th CELEBRATION · 6곳`처럼 표시
- 마커/목록 양방향 연동, 마커 선택 시 지도 하단 고정 카드(상태·거리·관측 시각·취급 카드명·네이버 지도 링크)
- **정직한 고지**: 매장 위치·이름은 실제 OSM 데이터, 재고 상태(재고 있음/확인 필요/없음)와 취급 카드 상품명은 편의점 앱 API 미연동으로 제보·샘플 기반임을 배지·카드·목록·`샘플 재고` 칩으로 표시

#### 전국 55개 지역 (v3)

| 시·도 | 지역 | 20km |
| --- | --- | --- |
| 서울 | 강남·역삼, 홍대·마포, 노원·강북, 잠실·송파, 여의도·영등포, 종로·명동 | ✗ (5km) |
| 부산 | 서면·부산진, 해운대, 남포·중구, 사상·북구 | ✗ (5km) |
| 대구 | 동성로·중구, 수성구, 달서구 | ✗ (5km) |
| 인천 | 송도·연수, 부평, 구월·남동 | ✗ (5km) |
| 광주 | 충장로·동구, 상무·서구 | ✗ (5km) |
| 대전 | 둔산·서구, 유성구 | ✗ (5km) |
| 울산 | 삼산·남구, 중구 | ✗ (5km) |
| 세종 | 세종시청·보람동 | ○ |
| 경기 | 수원·영통, 성남·판교, 용인·수지, 고양·일산, 부천 (5km) / 화성·동탄, 평택, 의정부 (20km) | 일부 |
| 강원 | 춘천, 원주, 강릉 | ○ |
| 충북 | 청주, 충주 | ○ |
| 충남 | 천안, 아산 | ○ |
| 전북 | 전주, 익산, 군산 | ○ |
| 전남 | 순천, 여수, 목포 | ○ |
| 경북 | 포항·북구(환호동, 기본), 포항·남구, 경주, 구미, 안동 | ○ |
| 경남 | 창원·성산, 김해, 진주, 양산 | ○ |
| 제주 | 제주시, 서귀포시 | ○ |

### 2번 탭 — 정가 구매처 (기존 홈)
- **채널별 실제 상품·검색 페이지 연결**: 포켓몬스토어 30th 상품(m6a), SSG 상품(1000881834004), G마켓 상품(4856436280), 티씨지박스 30th 1BOX(22970), 롯데ON 포켓몬카드 검색, CU 상품 검색, GS25, 세븐일레븐, 이마트24
- 히어로: 정가(1팩 3,500원 / 1박스 20팩 70,000원)와 리셀가 주의 안내
- **정가 구매처 보드 6개 채널**: 포켓몬스토어(추첨), SSG 공식인증샵(70,000+3,000), G마켓 공식인증샵,
  티씨지박스, 토이저러스·롯데마트, 편의점 4사 — 실제 URL 링크 포함
- 인기 카드팩 트렌드 4종, 오늘의 체크 포인트, 최근 입고 타임라인(샘플)

### 일정 · 입고
- **오늘(KST) 이후 일정만 기본 표시**: 지난 추첨·입고 기록은 `지난 일정 보기 (N건)` 접이식으로 숨김, 캘린더도 오늘 이후 입고일만 표시(`지난 입고일 보기` 토글로 확인)
- 포켓몬스토어 1·2차 추첨, FUTURISTIC BOX, 편의점 4사 입고 일정 타임라인
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
- v3 확인 항목: 전국 17개 시·도 · 55개 지역 2단 셀렉트와 동네 검색(제주·해운대)·기본 지역 포항 북구, 지역 변경 시 지도 중심 이동과 재조회, 포항 북구 20km 활성(반경 20000 · `out center 100` 쿼리), 제주시 20km 유지(allow20), 서울 강남 자동 5km 전환 + 20km 비활성·`도심은 5km까지 지원` 안내, 로딩 스피너·진행 바, 목록 10곳+더보기(18곳→접힘), 마커 카드·브랜드 필터(CU 6곳), 지난 일정 접기(`지난 일정 보기 (6건)`)·캘린더 토글, 모바일 390px 가로 넘침 없음, 페이지 에러 0건
- v3.1 확인 항목(2026-11-17 라이브): 지도 제목·부제가 `내 주변 편의점 4사, 실제 지도에서 찾기`로 바뀌고 본문에 4사 외 업종 언급이 없음, 브랜드 칩 5종(전체·GS25·CU·세븐일레븐·이마트24), 카드 상품 칩 7종(전체 카드·30th CELEBRATION·배틀 파트너즈·테라스탈 페스타 ex·로켓단의 영광·초전 브레이커·스타터 세트), 매장 목록·지도 카드의 상품명 태그(입고/소량/확인 필요/품절/미입고 + `최근 입고 품절` 머리표), `30th CELEBRATION` 필터 선택 시 22곳으로 축소(미입고 2곳 제외)·마커 동기화, CU 필터 12곳, 필터 초기화 복원, 10곳+더보기(31곳→10곳), 서울 강남 자동 5km 전환과 `도심은 5km까지 지원`, 모바일 390px 가로 넘침 0·태그 10.5px, 페이지 오류 0건(콘솔의 502는 Overpass 응답)
- v3.1 스냅샷: Overpass 스냅샷에서 4사 외 항목 285건을 제거해 **1,272건 → 987건**(전국 55개 지역 유지)
- v3 Overpass 상태(2026-11-17 라이브 확인)
  - 실시간 응답: `실시간 조회 · OpenStreetMap 주변 매장 31곳 (Overpass API)` — 포항 북구 3km, 마커 31개·목록 10+더보기 21
  - 20km 실시간: 포항 북구 **97곳**(`out center 100` · 확대 10), 제주시 **87곳**
  - 도심 5km 실시간: 서울 강남 반경 5km에서 1,045곳 응답 중 가까운 **90곳** 표시(마커 상한)
  - 8초 초과: 내장 스냅샷 18곳을 먼저 표시(`조금 더 기다리는 중`) → 응답 도착 시 31곳으로 자동 교체(실제로 확인)
  - 502·타임아웃: `실시간 조회 지연/제한 → 내장 실제 좌표 스냅샷(반경 3km) 사용 (2026-11-17)` 배지 + `실시간 다시 조회` 버튼. 20km를 고른 상태면 `· 넓은 반경은 실시간 조회에서만 표시`를 덧붙입니다. 검증 시점에 overpass-api.de가 용량 초과로 간헐적 502를 반환해 스냅샷 경로가 자주 쓰였습니다
- 스크린샷(v3.1): `screenshots/26-v31-desktop-stores.png`(매장 목록 카드명), `27-v31-map-card.png`(지도 팝업 카드명),
  `28-v31-product-filter.png`(30th CELEBRATION 필터), `29-v31-mobile.png`
  (배포 화면 라이브 캡처: `downloads/pokemoa-v31-stores.png`, `pokemoa-v31-card.png`, `pokemoa-v31-filter.png`, `pokemoa-v31-mobile.png`)
- 스크린샷(v3): `screenshots/18-nationwide-loading.png`(로딩), `19-nationwide-desktop.png`, `20-pohang-20km.png`,
  `21-region-search.png`(동네 검색), `22-jeju-20km.png`, `23-seoul-5km.png`(도심 20km 비활성),
  `24-mobile-nationwide.png`, `25-live-pohang.png`
  (배포 화면 라이브 캡처: `downloads/pokemoa-v3-nationwide.png`, `pokemoa-v3-pohang-20km.png`, `pokemoa-v3-jeju-20km.png`, `pokemoa-v3-seoul-5km.png`, `pokemoa-v3-loading.png`)
- 스크린샷(v2.1 이전): `screenshots/01-pricing-desktop.png`, `02-map-desktop.png`, `03-map-loading-desktop.png`,
  `04-card-mobile.png`, `05-mobile-map.png`, `06-mobile-store-list.png`, `07-mobile-pricing.png`, `08-cards-guide.png`,
  `10-store-list-10-more.png`, `11-store-list-expanded.png`, `12-radius-20km.png`, `13-seoul-5km-note.png`,
  `14-schedule-folded.png`, `15-schedule-past-open.png`, `16-channels-links.png`, `17-mobile-schedule.png`
- v2.1 확인 항목: 하단 내비 `동네에서 찾기`, 목록 10곳+더보기(펼침/접힘·필터 초기화), 20km 활성/비활성과 자동 5km 전환, `out center 100` 쿼리, 지난 일정 접기·캘린더 토글, 채널 링크 7종
- v2 확인 항목: 첫 화면이 「동네에서 찾기」인지, OSM 타일(`tile.openstreetmap.org`) 로드, 로딩 스피너·진행 바·스켈레톤 노출,
  배지의 조회 상태 표기, 지역 변경(포항 북구→부산 서면), 브랜드 필터(CU 6곳)·반경 필터(1/3/5km), 마커 선택 카드,
  내 위치(권한 허용·차단 양쪽), 2번 탭 「정가 구매처」, 지도 탭 왕복 후 지도 크기, 모바일 하단 내비 순서·가로 넘침 없음
- Overpass 응답 세 가지 경로(실시간 / 8초 지연 후 교체 / 502·타임아웃 스냅샷) 모두 위 v3 항목에서 다시 확인
- 페이지 에러 0건. 콘솔에는 Overpass가 돌려준 502 응답 오류만 남고(외부 API 상태), 스크립트 오류는 없습니다.
- 스크린샷(v2 이전): `screenshots/02-map-desktop.png`, `03-map-loading-desktop.png`,
  `04-card-mobile.png`, `05-mobile-map.png`, `06-mobile-store-list.png`, `07-mobile-pricing.png`,
  `10-store-list-10-more.png`, `11-store-list-expanded.png`, `12-radius-20km.png`,
  `13-seoul-5km-note.png`, `14-schedule-folded.png`, `15-schedule-past-open.png`, `16-channels-links.png`
  (배포 화면 라이브 캡처: `downloads/pokemoa-v2-live-map.png`, `downloads/pokemoa-v2-live-stores.png`)

## 6. 참고 자료

- 포켓몬 카드 게임 공식 제품 정보 — https://pokemoncard.co.kr/card/960
- 포켓몬스토어 30주년 특설 페이지 — https://www.pokemonstore.co.kr/pages/pokemoncardgame30th/product/index.html
- SSG 공식인증샵 상품 페이지 — https://www.ssg.com/item/itemView.ssg?itemId=1000881834004
- 30th Celebration 카드 목록(176종) — https://www.tcgheart.com/set/30th-celebration-korean
- 편의점 판매 일정 보도 — https://tcgnews.kr/article/34

포케모아는 포켓몬코리아 및 권리자와 무관한 비공식 정보 사이트입니다.
