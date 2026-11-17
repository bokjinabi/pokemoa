/* =========================================================================
 * 포케모아(PokeMoa) — 데이터 계층
 * 모든 가격·일정은 2026-11-17 기준 공개 자료를 정리한 값입니다.
 * 지도 매장 위치는 OpenStreetMap 실제 좌표, 재고 상태는 제보·샘플 기반 표시입니다.
 * ========================================================================= */
window.POKEMOA_DATA = (function () {
  "use strict";

  var SITE = {
    name: "포케모아",
    nameEn: "PokeMoa",
    tagline: "포켓몬 카드의 정가·입고·재고를 한 곳에 모아",
    dataDate: "2026-11-17",
    dataTime: "11:00",
    siteUrl: "https://pokemoa.example"
  };

  /* ---------------------------------------------------------------- 세트 */
  var SET_TARGET = {
    id: "m6a",
    name: "30th CELEBRATION",
    series: "MEGA 확장팩",
    code: "M6a",
    release: "2026-09-16",
    packPrice: 3500,
    boxPrice: 70000,
    packsPerBox: 20,
    cardsPerPack: 6,
    cardsPerBox: 120,
    totalCards: 176,
    pikaCards: 30,
    officialUrl:
      "https://www.pokemonstore.co.kr/pages/pokemoncardgame30th/product/index.html"
  };

  /* ------------------------------------------------------ 정가 구매처 보드 */
  var channels = [
    {
      id: "pokemonstore",
      name: "포켓몬스토어 온라인",
      kind: "official",
      kindLabel: "공식 스토어",
      badge: "추첨 판매",
      price: "70,000원",
      priceNote: "무료배송 · 1박스(20팩) 단위만",
      features: [
        "1인 1계정 1회 응모 · 응모 순서는 결과와 무관",
        "쿠폰·적립금 사용 불가, 월별 뱃지 이벤트 제외",
        "당첨 후 기한 내 결제하지 않으면 당첨 무효"
      ],
      tip:
        "확장팩 1차(9/8~9/13)·2차(10/19~10/25) 추첨은 모두 종료됐습니다. 다음 회차 공지는 포켓몬 카드 게임 공지와 30주년 특설 페이지에서 가장 먼저 올라옵니다.",
      links: [
        { label: "30주년 특설 페이지", url: "https://www.pokemonstore.co.kr/pages/pokemoncardgame30th/product/index.html" },
        { label: "포켓몬스토어", url: "https://www.pokemonstore.co.kr/" }
      ]
    },
    {
      id: "ssg",
      name: "SSG 공식인증샵",
      kind: "online",
      kindLabel: "온라인몰",
      badge: "정가 + 배송비",
      price: "70,000원",
      priceNote: "배송비 3,000원 별도 (제주·도서산간 +3,000원)",
      features: [
        "판매자: 포켓몬카드게임공식인증샵(게임피아)",
        "CJ대한통운 택배 · 리뷰 평점 5.0",
        "총 결제액 73,000원(박스 1개 기준)"
      ],
      tip:
        "정가에 배송비가 붙는 구조입니다. 박스를 1개만 살 때는 총액 73,000원을, 여러 개 살 때는 배송비가 한 번만 붙는지 장바구니에서 확인하세요.",
      links: [
        { label: "SSG 상품 페이지", url: "https://www.ssg.com/item/itemView.ssg?itemId=1000881834004" }
      ]
    },
    {
      id: "gmarket",
      name: "G마켓 공식인증샵",
      kind: "online",
      kindLabel: "온라인몰",
      badge: "정가 + 배송비",
      price: "70,000원",
      priceNote: "배송비 3,000원 · 낱팩 옵션 상품 별도",
      features: [
        "판매자: 게임피아(주) · 포켓몬 카드 공식 인증샵",
        "1팩·2팩·3팩·5팩·10팩·15팩 등 옵션 상품 운영",
        "상담 평일 10:00~17:00 (토·일·공휴일 휴무)"
      ],
      tip:
        "낱팩 옵션은 팩당 단가가 정가(3,500원)보다 높게 책정된 경우가 있습니다. 결제 전에 총액을 팩 수로 나눠 팩당 단가로 비교하세요.",
      links: [
        { label: "G마켓 공식인증샵", url: "https://minishop.gmarket.co.kr/pokemoncard" }
      ]
    },
    {
      id: "tcgbox",
      name: "티씨지박스 (TCGBOX)",
      kind: "online",
      kindLabel: "전문 카드샵",
      badge: "정가 · 품절 잦음",
      price: "70,000원",
      priceNote: "정가 판매 · 재고 변동 빠름",
      features: [
        "온라인 전문 카드샵 · 싱글카드 16,000장 이상 보유",
        "인기 세트는 예약 오픈 직후 마감되는 편",
        "상담 070-8262-0805 · 평일 10:00~17:00"
      ],
      tip:
        "박스가 품절이면 목표 카드를 싱글카드로 사는 쪽이 예산을 아끼는 경우가 많습니다. 박스 1개 값으로 원하는 카드 1장을 확보하는 계산을 먼저 해보세요.",
      links: [{ label: "티씨지박스", url: "https://tcgbox.co.kr/" }]
    },
    {
      id: "mart",
      name: "토이저러스 · 롯데마트",
      kind: "offline",
      kindLabel: "오프라인",
      badge: "정가 채널",
      price: "70,000원",
      priceNote: "매장 표기 정가 · 지점별 입고 상이",
      features: [
        "완구코너·토이저러스 매장에서 정가 판매",
        "포켓몬 카드 자판기가 함께 있는 매장이 많음",
        "수·목 오전 진열 빈도가 높다는 후기 다수(공식 아님)"
      ],
      tip:
        "지점마다 입고일과 수량이 달라 '마트면 있겠지'는 위험합니다. 방문 전 매장 고객센터로 박스 판매 여부와 수량을 확인하세요.",
      links: [{ label: "롯데마트", url: "https://www.lottemart.com/" }]
    },
    {
      id: "artbox",
      name: "아트박스 (ARTBOX)",
      kind: "offline",
      kindLabel: "오프라인 · 자판기",
      badge: "낱팩 중심",
      price: "3,500원",
      priceNote: "낱팩 정가 기준 · 매장·자판기",
      features: [
        "전국 오프라인 매장과 포켓몬 카드 자판기 운영",
        "POOM 앱에서 상품별 '구매 가능한 매장' 재고 조회",
        "자판기는 낱팩만 판매 · 박스 구매 불가"
      ],
      tip:
        "POOM 앱 → 상품 검색 → 상세 화면의 '구매 가능한 매장 보기'로 재고를 확인하고, 전산 재고와 실재고가 다를 수 있으니 매장에 전화까지 하세요.",
      links: [
        { label: "POOM 공식몰", url: "https://poom.co.kr" },
        { label: "아트박스 매장 목록", url: "https://company.artbox.kr/OfflineStore.asp" }
      ]
    },
    {
      id: "cvs",
      name: "편의점 3사 (GS25·CU·세븐일레븐)",
      kind: "offline",
      kindLabel: "오프라인",
      badge: "낱팩 3,500원",
      price: "3,500원",
      priceNote: "낱팩 정가 · 매장별 입고·수량 차이",
      features: [
        "세븐일레븐 10/1 판매 시작, 1~5일 1차 물량 80% 소진",
        "GS25 10/6부터 점포당 발주 수량 제한",
        "CU 10/7 예약 발주 → 10/24부터 매장 입고"
      ],
      tip:
        "편의점 앱 재고는 전산값입니다. 방문 직전 앱으로 확인하고, 박스로 살 계획이면 매장에 전화해 판매 단위를 먼저 물어보세요.",
      links: [
        { label: "GS25 (우리동네GS)", url: "https://www.gs25.com/main.do" },
        { label: "CU (포켓CU)", url: "https://www.cu.co.kr/" },
        { label: "세븐일레븐", url: "https://www.7-eleven.co.kr/" }
      ]
    }
  ];

  /* --------------------------------------------------------- 인기 카드팩 */
  var trends = [
    {
      id: "m6a",
      name: "30th CELEBRATION",
      code: "M6a · MEGA",
      release: "2026-09-16",
      pack: "3,500원",
      box: "70,000원",
      config: "1팩 6장 / 1박스 20팩",
      highlights: ["FUR 뮤 ex·뮤츠 ex", "피카츄 홀로 30종", "복각 카드 30종"],
      note: "팩마다 30주년 피카츄 1장·기본 에너지 1장이 확정 봉입됩니다.",
      hot: true,
      tag: "현재 최고 수요"
    },
    {
      id: "sv9",
      name: "배틀파트너즈",
      code: "SV9 · 스칼렛&바이올렛",
      release: "2025-03-21",
      pack: "1,000원",
      box: "30,000원",
      config: "1팩 5장 / 1상자 30팩",
      highlights: ["N의 조로아크 ex", "릴리에의 삐삐 ex", "트레이너의 포켓몬"],
      note: "입문용으로 낱팩 부담이 가장 적은 세트입니다.",
      hot: false,
      tag: "가성비"
    },
    {
      id: "m5",
      name: "어비스아이",
      code: "M5 · MEGA",
      release: "2026-06-26",
      pack: "1,500원",
      box: "45,000원",
      config: "1팩 5장 / 1상자 30팩",
      highlights: ["메가다크라이 ex", "MUR 1종", "SAR 6종"],
      note: "2026년 6월부터 적용된 가격 조정 이후 세트입니다.",
      hot: false,
      tag: "최신 MEGA"
    },
    {
      id: "sv11b",
      name: "블랙볼트",
      code: "SV11B · 스칼렛&바이올렛",
      release: "2025-08-01",
      pack: "2,000원",
      box: "40,000원",
      config: "1팩 7장 / 1박스 20팩",
      highlights: ["제크로무 ex BWR", "N의 방안 SAR", "174종"],
      note: "BWR 제크로무 ex가 세트 최고가 카드로 꼽힙니다.",
      hot: false,
      tag: "고가 카드"
    }
  ];

  /* ----------------------------------------------------------- 카드 도감 */
  var cards = [
    { id: "fur-mew", name: "뮤 ex", rarity: "FUR", tag: "fur", num: "135/103", illus: "YOSHIROTTEN", note: "30주년 신규 레어도. 크롬처럼 빛나는 질감과 벤치 포켓몬의 기술을 모두 쓰는 특성 '기억의 나선'으로 주목받는 카드입니다." },
    { id: "fur-mewtwo", name: "뮤츠 ex", rarity: "FUR", tag: "fur", num: "134/103", illus: "YOSHIROTTEN", note: "세트 최상위 희귀도 FUR 2종 중 하나. 뮤 ex와 함께 30주년을 대표하는 카드입니다." },

    { id: "sar-fuecoco", name: "뜨아거 ex", rarity: "SAR", tag: "sar", illus: "Atsushi Furusawa", note: "스타터 ex의 스페셜 아트. SAR 10종 중 하나입니다." },
    { id: "sar-greninja", name: "개굴닌자 ex", rarity: "SAR", tag: "sar", illus: "GIDORA", note: "데미지 카운터를 활용하는 배틀 카드로도 쓰입니다." },
    { id: "sar-pikachu-a", name: "피카츄 ex", rarity: "SAR", tag: "sar", illus: "Kantaro", note: "피카츄 ex SAR은 2종이 수록됩니다." },
    { id: "sar-mewtwo", name: "뮤츠 ex", rarity: "SAR", tag: "sar", illus: "Yano Keiji", note: "FUR과는 다른 일러스트의 스페셜 아트 버전입니다." },
    { id: "sar-mew", name: "뮤 ex", rarity: "SAR", tag: "sar", illus: "Kuroimori", note: "뮤 ex의 스페셜 아트. FUR과 함께 인기 수집 대상입니다." },
    { id: "sar-sylveon", name: "님피아 ex", rarity: "SAR", tag: "sar", illus: "You Iribi", note: "이브이 계열 ex 중 하나로 컬렉터 수요가 있습니다." },
    { id: "sar-gengar", name: "팬텀 ex", rarity: "SAR", tag: "sar", illus: "CHORISO", note: "고전 인기 포켓몬의 스페셜 아트입니다." },
    { id: "sar-jirachi", name: "지라치 ex", rarity: "SAR", tag: "sar", illus: "AKIRA EGAWA", note: "30주년 기념 라인업에 포함된 전설 포켓몬 카드입니다." },
    { id: "sar-salamence", name: "보만다 ex", rarity: "SAR", tag: "sar", illus: "Ryota Murayama", note: "배틀과 수집을 함께 노리는 카드입니다." },

    { id: "ar-exeggutor", name: "알로라 나시", rarity: "AR", tag: "ar", illus: "AYUMI ODASHIMA", note: "AR 20종 중 하나. 일러스트 감상용으로 인기가 많습니다." },
    { id: "ar-lapras", name: "라프라스", rarity: "AR", tag: "ar", illus: "Amelicart", note: "AR 일러스트 카드." },
    { id: "ar-drifloon", name: "흔들풍손", rarity: "AR", tag: "ar", illus: "Whisker", note: "AR 일러스트 카드." },
    { id: "ar-chandelure", name: "샹델라", rarity: "AR", tag: "ar", illus: "YASHIRO Nanaco", note: "AR 일러스트 카드." },
    { id: "ar-lycanroc", name: "루가루암", rarity: "AR", tag: "ar", illus: "Raita Kazama", note: "AR 일러스트 카드." },
    { id: "ar-zorua", name: "히스이 조로아", rarity: "AR", tag: "ar", illus: "0313", note: "히스이 폼 조로아의 AR 카드." },

    { id: "pika-sugimori", name: "피카츄 (Ken Sugimori)", rarity: "피카츄 30종", tag: "pika", illus: "Ken Sugimori", note: "30종 피카츄의 01번. 1996년 정글 시리즈 피카츄 일러스트를 원화 작가가 다시 그린 카드입니다." },
    { id: "pika-sowsow", name: "피카츄 (sowsow)", rarity: "피카츄 30종", tag: "pika", illus: "sowsow", note: "017~046번 30종 피카츄 중 한 장. 카드마다 01/30~30/30 마크가 들어갑니다." },
    { id: "pika-teeziro", name: "피카츄 (Teeziro)", rarity: "피카츄 30종", tag: "pika", illus: "Teeziro", note: "30명의 일러스트레이터가 한 장씩 맡은 피카츄 시리즈입니다." },
    { id: "pika-kanda", name: "피카츄 (Shinji Kanda)", rarity: "피카츄 30종", tag: "pika", illus: "Shinji Kanda", note: "전 카드에 불꽃놀이 홀로 처리가 들어갑니다." },
    { id: "pika-nishida", name: "피카츄 (Atsuko Nishida)", rarity: "피카츄 30종", tag: "pika", illus: "Atsuko Nishida", note: "피카츄를 처음 디자인한 작가의 참여로 화제가 된 카드입니다." },
    { id: "pika-group", name: "피카츄 30종 한눈에", rarity: "피카츄 30종", tag: "pika", illus: "30명", note: "017~046번이 모두 피카츄입니다. 1박스는 20팩이라 한 박스로 30종을 모두 모을 수 없습니다. 30종 수집은 박스 2개 이상 또는 싱글 구매를 병행해야 합니다." },

    { id: "classic-pikachu", name: "피카츄 (1996)", rarity: "복각", tag: "classic", illus: "Mitsuhiro Arita", note: "포켓몬 카드 게임 제1탄을 상징하는 카드의 복각판입니다." },
    { id: "classic-charizard", name: "리자몽 (1996)", rarity: "복각", tag: "classic", illus: "Mitsuhiro Arita", note: "1996년 첫 확장팩 리자몽의 복각 카드. 문구는 당시 그대로입니다." },
    { id: "classic-celebi", name: "빛나는 세레비", rarity: "복각", tag: "classic", illus: "Hironobu Yoshida", note: "Shining 시리즈의 대표 카드 복각판입니다." },
    { id: "classic-lugia", name: "루기아", rarity: "복각", tag: "classic", illus: "Naoyo Kimura", note: "Wind from the Sea 루기아의 복각 카드로 꼽힙니다." },
    { id: "classic-darkrai", name: "다크라이 & 크레세리아 LEGEND", rarity: "복각", tag: "classic", illus: "Noriko Takaya · Shinji Higuchi", note: "LEGEND 카드 복각. 2장 연결 일러스트로 유명합니다." },
    { id: "classic-mewvmax", name: "뮤 VMAX", rarity: "복각", tag: "classic", illus: "5ban Graphics", note: "2021년 세트를 대표했던 카드의 복각판입니다." },
    { id: "classic-arceus", name: "아르세우스 VSTAR", rarity: "복각", tag: "classic", illus: "5ban Graphics", note: "신오 지방을 상징하는 카드의 복각판입니다." },
    { id: "classic-magikarp", name: "잉어킹 (2023 AR)", rarity: "복각", tag: "classic", illus: "Shinji Kanda", note: "최근 복각 중 가장 최신 연도의 카드로 꼽힙니다." },

    { id: "energy", name: "기본 에너지 8종", rarity: "에너지", tag: "energy", illus: "YOSHIROTTEN", note: "팩마다 기본 에너지 1장이 확정 봉입됩니다. 일러스트를 YOSHIROTTEN이 맡아 수집 대상이 됐습니다." },
    { id: "rgb-mew", name: "뮤 (RGB Rare)", rarity: "RGB", tag: "energy", illus: "YOSHIROTTEN", note: "번호 대신 R/RGB·G/RGB·B/RGB로 표기되는 뮤 3종입니다." },
    { id: "rr-pikachu", name: "피카츄 ex (RR)", rarity: "RR", tag: "energy", illus: "5ban Graphics", note: "배틀용 더블 레어. 스페셜 아트와는 별도 카드입니다." }
  ];

  /* ------------------------------------------------------------- 일정 */
  var timeline = [
    {
      date: "2026-09-08 ~ 09-13",
      title: "확장팩 1차 구매권 추첨",
      body: "포켓몬스토어 온라인 · 1인 1계정 1회 · 1박스 70,000원",
      tag: "추첨",
      state: "done"
    },
    {
      date: "2026-09-16",
      title: "30th CELEBRATION 정식 발매",
      body: "전 세계 동시 발매 · 1팩 3,500원 / 1박스 70,000원",
      tag: "발매",
      state: "done"
    },
    {
      date: "2026-09-29 ~ 10-05",
      title: "FUTURISTIC BOX 추첨",
      body: "275,000원 · 10/7 발표 · 10/14 이후 순차 배송",
      tag: "추첨",
      state: "done"
    },
    {
      date: "2026-10-01",
      title: "세븐일레븐 판매 시작",
      body: "1~5일 1차 공급 물량의 80% 판매 · 추가 물량 준비",
      tag: "편의점",
      state: "done"
    },
    {
      date: "2026-10-19 ~ 10-25",
      title: "확장팩 2차 구매권 추첨",
      body: "10/27 발표 · 10/30 자정까지 결제 · 11/2 이후 순차 배송",
      tag: "추첨",
      state: "done"
    },
    {
      date: "2026-10-24",
      title: "CU 매장 입고 시작",
      body: "10/7부터 점포별 예약 발주 → 10/24부터 매장 입고",
      tag: "편의점",
      state: "done"
    },
    {
      date: "2026-11-17",
      title: "현재 — 다음 추첨·재입고 공지 대기",
      body: "새 회차 공지는 포켓몬 카드 게임 공지와 30주년 특설 페이지에서 확인",
      tag: "진행 중",
      state: "now"
    },
    {
      date: "미정",
      title: "3차 추첨 또는 재입고",
      body: "공식 공지 전까지 일정 확정 없음 · 포케모아가 공지 확인처를 안내",
      tag: "예정",
      state: "next"
    }
  ];

  var weekdayGuide = [
    { day: "월", focus: "온라인 공지 확인", detail: "공식 스토어·카드샵 재입고 알림을 켜두고, 주말에 빠진 물량이 풀리는지 확인", place: "온라인" },
    { day: "화", focus: "대형마트 완구코너", detail: "오전에 진열이 도는 편이라 점심 전 방문이 유리", place: "마트" },
    { day: "수", focus: "마트·토이저러스", detail: "수·목 오전 진열 빈도가 높다는 후기가 많음(공식 아님)", place: "마트" },
    { day: "목", focus: "카드샵·자판기", detail: "주말 물량을 미리 받는 곳이 있어 카드샵 문의 가치가 큼", place: "카드샵" },
    { day: "금", focus: "편의점 주말 물량", detail: "퇴근 시간 이후 빠르게 소진 · 오전~오후 초반이 승부", place: "편의점" },
    { day: "토", focus: "오픈런 주의", detail: "인기 매장은 대기 발생 · 방문 전 전화로 재고 확인", place: "전체" },
    { day: "일", focus: "편의점 위주", detail: "카드샵 휴무가 많아 편의점·자판기로 범위를 좁히기", place: "편의점" }
  ];

  var recentStock = [
    { when: "11-17 09:40", where: "GS25 환호공원점", what: "30th 낱팩 6개 확인", type: "in", region: "포항 북구" },
    { when: "11-17 09:15", where: "세븐일레븐 포항해맞이점", what: "재고 0개 확인", type: "none", region: "포항 북구" },
    { when: "11-16 18:20", where: "CU 포항양덕점", what: "30th 낱팩 입고 제보", type: "in", region: "포항 북구" },
    { when: "11-16 14:05", where: "아트박스 포항점", what: "자판기 30th 품절", type: "none", region: "포항 북구" },
    { when: "11-16 11:30", where: "카드샵 포항TCG", what: "박스 1인 1박스 제한", type: "check", region: "포항 북구" },
    { when: "11-15 16:10", where: "롯데마트 포항점 자판기", what: "낱팩 일부 남음(확인 필요)", type: "check", region: "포항 북구" }
  ];

  /* ------------------------------------------------------- 입고 캘린더 */
  var calendar = {
    year: 2026,
    month: 11,
    firstWeekday: 0, // 2026-11-01 = 일요일
    days: 30,
    today: 17,
    marks: {
      3: ["cvs"], 5: ["mart"], 10: ["shop"], 12: ["cvs", "mart"],
      17: ["cvs"], 19: ["mart"], 24: ["cvs"], 26: ["shop"], 28: ["mart"]
    }
  };

  /* ----------------------------------------------------------- 지도 지역 */
  /* center: 실제 위도/경도 (OpenStreetMap 기준) */
  var regions = [
    { id: "pohang-north", name: "포항 · 북구 (환호동)", short: "포항 북구", label: "환호동", lat: 36.0736, lng: 129.3864, zoom: 15 },
    { id: "pohang-south", name: "포항 · 남구 (이동)", short: "포항 남구", label: "이동", lat: 36.0120, lng: 129.3400, zoom: 15 },
    { id: "seoul-gangnam", name: "서울 · 강남 (역삼·선릉)", short: "서울 강남", label: "역삼동", lat: 37.4979, lng: 127.0276, zoom: 15 },
    { id: "seoul-hongdae", name: "서울 · 마포 (홍대·합정)", short: "서울 홍대", label: "서교동", lat: 37.5572, lng: 126.9245, zoom: 15 },
    { id: "seoul-nowon", name: "서울 · 노원 (노원·상계)", short: "서울 노원", label: "노원동", lat: 37.6554, lng: 127.0613, zoom: 15 },
    { id: "busan-seomyeon", name: "부산 · 부산진 (서면)", short: "부산 서면", label: "부전동", lat: 35.1577, lng: 129.0594, zoom: 15 }
  ];

  /* ------------------------------------------------ 내장 실제 좌표 스냅샷 */
  /* 출처: OpenStreetMap (Overpass API shop=convenience|stationery|toys|gift)
     조회 시점: 2026-11-17 / 반경 1.5km / 지역 중심에서 가까운 순으로 브랜드별 상한 적용.
     실시간 Overpass 조회가 실패(타임아웃·응답 제한)할 때 지도에 그대로 표시된다. */
  var osmSnapshot = {
    fetchedAt: "2026-11-17",
    radius: 1500,
    source: "OpenStreetMap · Overpass API",
    items: [
    { id: "pohangnorth-00", regionId: "pohang-north", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "장량로32번길", lat: 36.077388, lng: 129.383873 },
    { id: "pohangnorth-01", regionId: "pohang-north", brand: "gs25", shop: "convenience", name: "GS25", street: "법원로", lat: 36.078379, lng: 129.385501 },
    { id: "pohangnorth-02", regionId: "pohang-north", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.067696, lng: 129.389866 },
    { id: "pohangnorth-03", regionId: "pohang-north", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.067695, lng: 129.382866 },
    { id: "pohangnorth-04", regionId: "pohang-north", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.069389, lng: 129.393216 },
    { id: "pohangnorth-05", regionId: "pohang-north", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 36.066848, lng: 129.381088 },
    { id: "pohangnorth-06", regionId: "pohang-north", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 36.066241, lng: 129.381418 },
    { id: "pohangnorth-07", regionId: "pohang-north", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 36.065344, lng: 129.384005 },
    { id: "pohangnorth-08", regionId: "pohang-north", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 36.064842, lng: 129.38584 },
    { id: "pohangnorth-09", regionId: "pohang-north", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.079756, lng: 129.394249 },
    { id: "pohangnorth-10", regionId: "pohang-north", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.064563, lng: 129.38704 },
    { id: "pohangnorth-11", regionId: "pohang-north", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 36.080481, lng: 129.394483 },
    { id: "pohangnorth-12", regionId: "pohang-north", brand: "cu", shop: "convenience", name: "CU 환호희망점", street: "", lat: 36.069871, lng: 129.397759 },
    { id: "pohangnorth-13", regionId: "pohang-north", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 36.070061, lng: 129.401536 },
    { id: "pohangnorth-14", regionId: "pohang-north", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 36.083137, lng: 129.397455 },
    { id: "pohangsouth-15", regionId: "pohang-south", brand: "other", shop: "convenience", name: "그린24시편의점", street: "", lat: 36.014538, lng: 129.340795 },
    { id: "pohangsouth-16", regionId: "pohang-south", brand: "cu", shop: "convenience", name: "CU", street: "효자동길2번길", lat: 36.009059, lng: 129.334377 },
    { id: "pohangsouth-17", regionId: "pohang-south", brand: "gs25", shop: "convenience", name: "GS25", street: "효성로27번길", lat: 36.006447, lng: 129.336857 },
    { id: "pohangsouth-18", regionId: "pohang-south", brand: "emart24", shop: "convenience", name: "이마트24", street: "효자동길10번길", lat: 36.009091, lng: 129.333308 },
    { id: "pohangsouth-19", regionId: "pohang-south", brand: "other", shop: "convenience", name: "", street: "효자로", lat: 36.011593, lng: 129.332314 },
    { id: "pohangsouth-20", regionId: "pohang-south", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "효성로", lat: 36.006252, lng: 129.335032 },
    { id: "pohangsouth-21", regionId: "pohang-south", brand: "emart24", shop: "convenience", name: "", street: "효성로82번길", lat: 36.005105, lng: 129.342373 },
    { id: "pohangsouth-22", regionId: "pohang-south", brand: "gs25", shop: "convenience", name: "GS25", street: "효자동길10번길", lat: 36.00637, lng: 129.334513 },
    { id: "pohangsouth-23", regionId: "pohang-south", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "대이로46번길", lat: 36.020381, lng: 129.343423 },
    { id: "pohangsouth-24", regionId: "pohang-south", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.010414, lng: 129.351039 },
    { id: "pohangsouth-25", regionId: "pohang-south", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 36.007756, lng: 129.328854 },
    { id: "pohangsouth-26", regionId: "pohang-south", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 36.007806, lng: 129.328682 },
    { id: "pohangsouth-27", regionId: "pohang-south", brand: "cu", shop: "convenience", name: "CU포항이동점", street: "", lat: 36.025047, lng: 129.341128 },
    { id: "seoulgangnam-28", regionId: "seoul-gangnam", brand: "gs25", shop: "convenience", name: "GS25 강남역3호점", street: "강남대로", lat: 37.49784, lng: 127.028579 },
    { id: "seoulgangnam-29", regionId: "seoul-gangnam", brand: "gs25", shop: "convenience", name: "GS25 강남본점", street: "테헤란로2길", lat: 37.497629, lng: 127.028729 },
    { id: "seoulgangnam-30", regionId: "seoul-gangnam", brand: "seven", shop: "convenience", name: "세븐일레븐 강남스퀘어점", street: "테헤란로1길", lat: 37.498962, lng: 127.028228 },
    { id: "seoulgangnam-31", regionId: "seoul-gangnam", brand: "other", shop: "convenience", name: "위드미", street: "", lat: 37.499073, lng: 127.027483 },
    { id: "seoulgangnam-32", regionId: "seoul-gangnam", brand: "seven", shop: "convenience", name: "세븐일레븐 강남광장점", street: "서초대로77길", lat: 37.498589, lng: 127.026213 },
    { id: "seoulgangnam-33", regionId: "seoul-gangnam", brand: "gs25", shop: "convenience", name: "GS25 강남프리미엄점", street: "서초대로77길", lat: 37.498849, lng: 127.026144 },
    { id: "seoulgangnam-34", regionId: "seoul-gangnam", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.499426, lng: 127.02812 },
    { id: "seoulgangnam-35", regionId: "seoul-gangnam", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.497662, lng: 127.025413 },
    { id: "seoulgangnam-36", regionId: "seoul-gangnam", brand: "gs25", shop: "convenience", name: "GS25 서초삼성타운점", street: "서초대로74길", lat: 37.496744, lng: 127.025704 },
    { id: "seoulgangnam-37", regionId: "seoul-gangnam", brand: "cu", shop: "convenience", name: "CU 강남해커스점", street: "강남대로61길", lat: 37.498891, lng: 127.025556 },
    { id: "seoulgangnam-38", regionId: "seoul-gangnam", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.498935, lng: 127.02988 },
    { id: "seoulgangnam-39", regionId: "seoul-gangnam", brand: "cu", shop: "convenience", name: "CU 역삼강남점", street: "강남대로94길", lat: 37.499748, lng: 127.029196 },
    { id: "seoulgangnam-40", regionId: "seoul-gangnam", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.49572, lng: 127.026894 },
    { id: "seoulgangnam-41", regionId: "seoul-gangnam", brand: "seven", shop: "convenience", name: "세븐일레븐 역삼타워점", street: "강남대로84길", lat: 37.49669, lng: 127.030026 },
    { id: "seoulgangnam-42", regionId: "seoul-gangnam", brand: "artbox", shop: "convenience", name: "Artbox", street: "", lat: 37.500374, lng: 127.026868 },
    { id: "seoulgangnam-43", regionId: "seoul-gangnam", brand: "cu", shop: "convenience", name: "CU 오벨리스크점", street: "서초대로74길", lat: 37.495288, lng: 127.027261 },
    { id: "seoulgangnam-44", regionId: "seoul-gangnam", brand: "cu", shop: "convenience", name: "CU 서초동아타워점", street: "서운로", lat: 37.495994, lng: 127.025267 },
    { id: "seoulgangnam-45", regionId: "seoul-gangnam", brand: "cu", shop: "convenience", name: "CU 서초삼성타운점", street: "강남대로55길", lat: 37.495672, lng: 127.025554 },
    { id: "seoulgangnam-46", regionId: "seoul-gangnam", brand: "cu", shop: "convenience", name: "CU 역삼디오빌", street: "강남대로84길", lat: 37.497546, lng: 127.031093 },
    { id: "seoulgangnam-47", regionId: "seoul-gangnam", brand: "stationery", shop: "gift", name: "라인프렌즈 플래그십 스토어", street: "", lat: 37.501326, lng: 127.025568 },
    { id: "seoulgangnam-48", regionId: "seoul-gangnam", brand: "other", shop: "convenience", name: "미니스톱 역삼청솔점", street: "강남대로78길", lat: 37.495232, lng: 127.031343 },
    { id: "seoulgangnam-49", regionId: "seoul-gangnam", brand: "emart24", shop: "convenience", name: "이마트24", street: "", lat: 37.501322, lng: 127.024849 },
    { id: "seoulgangnam-50", regionId: "seoul-gangnam", brand: "stationery", shop: "gift", name: "", street: "", lat: 37.503149, lng: 127.028118 },
    { id: "seoulgangnam-51", regionId: "seoul-gangnam", brand: "emart24", shop: "convenience", name: "이마트24 강남더인피닛스퀘어점", street: "사평대로58길", lat: 37.503449, lng: 127.023492 },
    { id: "seoulgangnam-52", regionId: "seoul-gangnam", brand: "emart24", shop: "convenience", name: "이마트24 역삼초교점", street: "역삼로8길", lat: 37.492767, lng: 127.034247 },
    { id: "seoulgangnam-53", regionId: "seoul-gangnam", brand: "emart24", shop: "convenience", name: "이마트24", street: "", lat: 37.499738, lng: 127.017767 },
    { id: "seoulgangnam-54", regionId: "seoul-gangnam", brand: "stationery", shop: "stationery", name: "어린왕자", street: "", lat: 37.499688, lng: 127.017731 },
    { id: "seoulgangnam-55", regionId: "seoul-gangnam", brand: "stationery", shop: "stationery", name: "래미안 문구", street: "", lat: 37.499589, lng: 127.017634 },
    { id: "seoulgangnam-56", regionId: "seoul-gangnam", brand: "stationery", shop: "toys", name: "캐잼", street: "", lat: 37.50919, lng: 127.018613 },
    { id: "seoulhongdae-57", regionId: "seoul-hongdae", brand: "stationery", shop: "toys", name: "미니돌", street: "양화로", lat: 37.557209, lng: 126.923778 },
    { id: "seoulhongdae-58", regionId: "seoul-hongdae", brand: "cu", shop: "convenience", name: "CU 홍대와이즈점", street: "홍익로6길", lat: 37.557091, lng: 126.925462 },
    { id: "seoulhongdae-59", regionId: "seoul-hongdae", brand: "other", shop: "convenience", name: "", street: "", lat: 37.556342, lng: 126.924343 },
    { id: "seoulhongdae-60", regionId: "seoul-hongdae", brand: "cu", shop: "convenience", name: "CU", street: "어울마당로", lat: 37.556313, lng: 126.924891 },
    { id: "seoulhongdae-61", regionId: "seoul-hongdae", brand: "stationery", shop: "gift", name: "카카오프렌즈", street: "", lat: 37.556473, lng: 126.923748 },
    { id: "seoulhongdae-62", regionId: "seoul-hongdae", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.557561, lng: 126.923363 },
    { id: "seoulhongdae-63", regionId: "seoul-hongdae", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 37.558287, lng: 126.925183 },
    { id: "seoulhongdae-64", regionId: "seoul-hongdae", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.556959, lng: 126.926151 },
    { id: "seoulhongdae-65", regionId: "seoul-hongdae", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.555861, lng: 126.924398 },
    { id: "seoulhongdae-66", regionId: "seoul-hongdae", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 37.557097, lng: 126.922533 },
    { id: "seoulhongdae-67", regionId: "seoul-hongdae", brand: "stationery", shop: "gift", name: "Butter", street: "", lat: 37.556444, lng: 126.922748 },
    { id: "seoulhongdae-68", regionId: "seoul-hongdae", brand: "stationery", shop: "toys", name: "리펀샵", street: "", lat: 37.557921, lng: 126.926308 },
    { id: "seoulhongdae-69", regionId: "seoul-hongdae", brand: "artbox", shop: "stationery", name: "아트박스", street: "", lat: 37.557753, lng: 126.926403 },
    { id: "seoulhongdae-70", regionId: "seoul-hongdae", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.555876, lng: 126.923218 },
    { id: "seoulhongdae-71", regionId: "seoul-hongdae", brand: "stationery", shop: "toys", name: "제일복권", street: "", lat: 37.557847, lng: 126.926473 },
    { id: "seoulhongdae-72", regionId: "seoul-hongdae", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 37.55742, lng: 126.926788 },
    { id: "seoulhongdae-73", regionId: "seoul-hongdae", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 37.556686, lng: 126.922215 },
    { id: "seoulhongdae-74", regionId: "seoul-hongdae", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.559079, lng: 126.924872 },
    { id: "seoulhongdae-75", regionId: "seoul-hongdae", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.557573, lng: 126.927247 },
    { id: "seoulhongdae-76", regionId: "seoul-hongdae", brand: "other", shop: "convenience", name: "", street: "", lat: 37.558928, lng: 126.922698 },
    { id: "seoulhongdae-77", regionId: "seoul-hongdae", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.557799, lng: 126.921466 },
    { id: "seoulhongdae-78", regionId: "seoul-hongdae", brand: "emart24", shop: "convenience", name: "Emart24", street: "", lat: 37.554978, lng: 126.925959 },
    { id: "seoulhongdae-79", regionId: "seoul-hongdae", brand: "emart24", shop: "convenience", name: "이마트24 홍대역점", street: "월드컵북로2길", lat: 37.555997, lng: 126.921442 },
    { id: "seoulhongdae-80", regionId: "seoul-hongdae", brand: "seven", shop: "convenience", name: "세븐일레븐 마포동교로점", street: "동교로25길", lat: 37.55833, lng: 126.921164 },
    { id: "seoulhongdae-81", regionId: "seoul-hongdae", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.557138, lng: 126.92817 },
    { id: "seoulhongdae-82", regionId: "seoul-hongdae", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.554203, lng: 126.923675 },
    { id: "seoulhongdae-83", regionId: "seoul-hongdae", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.554545, lng: 126.926479 },
    { id: "seoulhongdae-84", regionId: "seoul-hongdae", brand: "emart24", shop: "convenience", name: "이마트24 에너비스동교점", street: "연희로", lat: 37.55987, lng: 126.92685 },
    { id: "seoulhongdae-85", regionId: "seoul-hongdae", brand: "emart24", shop: "convenience", name: "이마트24", street: "", lat: 37.553571, lng: 126.92041 },
    { id: "seoulhongdae-86", regionId: "seoul-hongdae", brand: "artbox", shop: "gift", name: "ARTBOX", street: "", lat: 37.552367, lng: 126.922145 },
    { id: "seoulnowon-87", regionId: "seoul-nowon", brand: "seven", shop: "convenience", name: "세븐일레븐 노원2점", street: "상계로", lat: 37.65616, lng: 127.061515 },
    { id: "seoulnowon-88", regionId: "seoul-nowon", brand: "seven", shop: "convenience", name: "세븐일레븐 노원제일점", street: "동일로", lat: 37.655069, lng: 127.05998 },
    { id: "seoulnowon-89", regionId: "seoul-nowon", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 37.654287, lng: 127.062122 },
    { id: "seoulnowon-90", regionId: "seoul-nowon", brand: "gs25", shop: "convenience", name: "GS25 노원웰빙", street: "상계로1길", lat: 37.65691, lng: 127.061817 },
    { id: "seoulnowon-91", regionId: "seoul-nowon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.654672, lng: 127.059052 },
    { id: "seoulnowon-92", regionId: "seoul-nowon", brand: "seven", shop: "convenience", name: "세븐일레븐 kt노원점", street: "노해로", lat: 37.65445, lng: 127.063692 },
    { id: "seoulnowon-93", regionId: "seoul-nowon", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 37.654986, lng: 127.058609 },
    { id: "seoulnowon-94", regionId: "seoul-nowon", brand: "seven", shop: "convenience", name: "세븐일레븐 노원역점", street: "동일로217가길", lat: 37.653439, lng: 127.059885 },
    { id: "seoulnowon-95", regionId: "seoul-nowon", brand: "gs25", shop: "convenience", name: "GS25 노원 청산점", street: "노해로", lat: 37.654105, lng: 127.058226 },
    { id: "seoulnowon-96", regionId: "seoul-nowon", brand: "gs25", shop: "convenience", name: "GS25 상계주공점", street: "동일로217가길", lat: 37.653065, lng: 127.05821 },
    { id: "seoulnowon-97", regionId: "seoul-nowon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 37.658693, lng: 127.05987 },
    { id: "seoulnowon-98", regionId: "seoul-nowon", brand: "cu", shop: "convenience", name: "CU 상계3단지점", street: "동일로", lat: 37.651804, lng: 127.060894 },
    { id: "seoulnowon-99", regionId: "seoul-nowon", brand: "cu", shop: "convenience", name: "CU 노원나래점", street: "상계로7길", lat: 37.658516, lng: 127.064461 },
    { id: "seoulnowon-00", regionId: "seoul-nowon", brand: "gs25", shop: "convenience", name: "GS25 상계6단지점", street: "노원로", lat: 37.654224, lng: 127.066978 },
    { id: "seoulnowon-01", regionId: "seoul-nowon", brand: "cu", shop: "convenience", name: "CU 상계주공4단지점", street: "동일로", lat: 37.649881, lng: 127.062237 },
    { id: "seoulnowon-02", regionId: "seoul-nowon", brand: "other", shop: "convenience", name: "", street: "", lat: 37.661106, lng: 127.06087 },
    { id: "seoulnowon-03", regionId: "seoul-nowon", brand: "other", shop: "convenience", name: "미니스톱", street: "", lat: 37.651655, lng: 127.066924 },
    { id: "seoulnowon-04", regionId: "seoul-nowon", brand: "cu", shop: "convenience", name: "CU 상계하이츠점", street: "노원로28길", lat: 37.653028, lng: 127.068469 },
    { id: "seoulnowon-05", regionId: "seoul-nowon", brand: "cu", shop: "convenience", name: "CU 상계성원점", street: "한글비석로47길", lat: 37.660641, lng: 127.066646 },
    { id: "seoulnowon-06", regionId: "seoul-nowon", brand: "emart24", shop: "convenience", name: "이마트24 창동동아점", street: "노해로", lat: 37.651943, lng: 127.051003 },
    { id: "seoulnowon-07", regionId: "seoul-nowon", brand: "emart24", shop: "convenience", name: "이마트24 상계벽산점", street: "한글비석로", lat: 37.662303, lng: 127.073582 },
    { id: "busanseomyeon-08", regionId: "busan-seomyeon", brand: "other", shop: "convenience", name: "", street: "", lat: 35.158257, lng: 129.058652 },
    { id: "busanseomyeon-09", regionId: "busan-seomyeon", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "서전로", lat: 35.157574, lng: 129.060778 },
    { id: "busanseomyeon-10", regionId: "busan-seomyeon", brand: "cu", shop: "convenience", name: "Nice 2 CU", street: "", lat: 35.156895, lng: 129.057334 },
    { id: "busanseomyeon-11", regionId: "busan-seomyeon", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 35.159266, lng: 129.058064 },
    { id: "busanseomyeon-12", regionId: "busan-seomyeon", brand: "other", shop: "convenience", name: "미니스톱", street: "", lat: 35.157872, lng: 129.06217 },
    { id: "busanseomyeon-13", regionId: "busan-seomyeon", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 35.157887, lng: 129.062444 },
    { id: "busanseomyeon-14", regionId: "busan-seomyeon", brand: "seven", shop: "convenience", name: "7-Eleven", street: "", lat: 35.155806, lng: 129.056551 },
    { id: "busanseomyeon-15", regionId: "busan-seomyeon", brand: "seven", shop: "convenience", name: "세븐일레븐", street: "", lat: 35.154744, lng: 129.057965 },
    { id: "busanseomyeon-16", regionId: "busan-seomyeon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 35.160415, lng: 129.057275 },
    { id: "busanseomyeon-17", regionId: "busan-seomyeon", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 35.160909, lng: 129.058041 },
    { id: "busanseomyeon-18", regionId: "busan-seomyeon", brand: "seven", shop: "convenience", name: "7-eleven", street: "", lat: 35.156828, lng: 129.054644 },
    { id: "busanseomyeon-19", regionId: "busan-seomyeon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 35.157916, lng: 129.053457 },
    { id: "busanseomyeon-20", regionId: "busan-seomyeon", brand: "emart24", shop: "convenience", name: "eMart24", street: "", lat: 35.160615, lng: 129.054575 },
    { id: "busanseomyeon-21", regionId: "busan-seomyeon", brand: "cu", shop: "convenience", name: "Nice to CU", street: "", lat: 35.15281, lng: 129.056687 },
    { id: "busanseomyeon-22", regionId: "busan-seomyeon", brand: "cu", shop: "convenience", name: "CU", street: "신천대로50번길", lat: 35.152298, lng: 129.060034 },
    { id: "busanseomyeon-23", regionId: "busan-seomyeon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 35.152241, lng: 129.058542 },
    { id: "busanseomyeon-24", regionId: "busan-seomyeon", brand: "cu", shop: "convenience", name: "CU", street: "", lat: 35.151796, lng: 129.064673 },
    { id: "busanseomyeon-25", regionId: "busan-seomyeon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 35.158156, lng: 129.048288 },
    { id: "busanseomyeon-26", regionId: "busan-seomyeon", brand: "emart24", shop: "convenience", name: "이마트24", street: "", lat: 35.15705, lng: 129.047284 },
    { id: "busanseomyeon-27", regionId: "busan-seomyeon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 35.147785, lng: 129.06049 },
    { id: "busanseomyeon-28", regionId: "busan-seomyeon", brand: "gs25", shop: "convenience", name: "GS25", street: "", lat: 35.156252, lng: 129.04369 }
    ]
  };

  /* 브랜드 분류 (OSM 태그 → 서비스 카테고리) */
  var brandMeta = {
    gs25: { label: "GS25", short: "GS", color: "#0f7ad4", soft: "#e3f1fd" },
    cu: { label: "CU", short: "CU", color: "#5aa72c", soft: "#ecf7e6" },
    seven: { label: "세븐일레븐", short: "7", color: "#d33a2c", soft: "#fdeceb" },
    emart24: { label: "이마트24", short: "24", color: "#f0a500", soft: "#fff5dd" },
    artbox: { label: "아트박스", short: "A", color: "#8a5cf6", soft: "#f1ebff" },
    stationery: { label: "문구·완구·선물", short: "T", color: "#0e9f8a", soft: "#e2f7f3" },
    other: { label: "기타 편의점", short: "·", color: "#64748b", soft: "#eef1f6" }
  };

  var brands = [
    { id: "all", label: "전체" },
    { id: "gs25", label: "GS25" },
    { id: "cu", label: "CU" },
    { id: "seven", label: "세븐일레븐" },
    { id: "emart24", label: "이마트24" },
    { id: "artbox", label: "아트박스" },
    { id: "stationery", label: "문구·완구·선물" },
    { id: "other", label: "기타 편의점" }
  ];

  /* --------------------------------------------------------- 외부 바로가기 */
  var shortcuts = [
    { id: "gs", label: "우리동네GS", desc: "GS25 매장 재고찾기", url: "https://www.gs25.com/main.do" },
    { id: "cu", label: "포켓CU", desc: "CU 앱 재고 조회", url: "https://www.cu.co.kr/" },
    { id: "seven", label: "세븐일레븐", desc: "매장·상품 안내", url: "https://www.7-eleven.co.kr/" },
    { id: "pokeconv", label: "PokeConv", desc: "편의점 재고 지도", url: "https://pokeconv.shop" },
    { id: "cardcatch", label: "CardCatch · PokeConv", desc: "두 서비스 모아보기", url: "https://rokeshot.com/conv" },
    { id: "pokamap", label: "포카맵", desc: "자판기·카드샵 지도", url: "https://pokamap.shop/" },
    { id: "poom", label: "POOM", desc: "아트박스 매장 재고", url: "https://poom.co.kr" },
    { id: "vending", label: "공식 자판기 지도", desc: "포켓몬코리아 안내", url: "https://pokemonkorea.co.kr/card_vending_machine" }
  ];

  /* ------------------------------------------------------------ FAQ */
  var faq = [
    {
      q: "30th CELEBRATION 정가는 얼마인가요?",
      a: "공식 기준 1팩 3,500원, 1박스(20팩) 70,000원입니다. 1팩에는 카드 6장이 랜덤으로 들어가고, 1박스는 120장입니다. 이 가격이 정가 구매처를 판단하는 기준선입니다."
    },
    {
      q: "편의점에서 박스로 살 수 있나요?",
      a: "매장마다 다릅니다. 편의점은 낱팩 위주로 입고되고, 박스 판매 여부는 점포 정책에 따라 갈립니다. 박스가 목적이라면 방문 전 매장에 판매 단위를 먼저 확인하세요."
    },
    {
      q: "포케모아에 보이는 재고는 실제인가요?",
      a: "반은 실제, 반은 아직 샘플입니다. 지도의 매장 위치·이름은 OpenStreetMap 실제 데이터를 조회해 표시하고, 실시간 조회가 지연되면 내장된 실제 좌표로 대체합니다. 다만 각 매장의 포켓몬카드 재고(재고 있음/확인 필요/없음)는 편의점 앱 API가 아직 연결되지 않아 제보·샘플 기반 표시입니다. 방문 전에는 각 편의점 공식 앱과 매장 전화로 확인하세요."
    },
    {
      q: "포켓몬스토어 추첨에 당첨되면 자동 결제되나요?",
      a: "아닙니다. 당첨은 구매권이고, 안내된 기한 안에 직접 결제해야 합니다. 2차 추첨은 10월 30일 자정까지였고, 기한을 넘기면 당첨이 무효가 됩니다. 결제 다음 날 오전 9시 이후에는 취소와 배송지 변경이 어렵습니다."
    },
    {
      q: "박스 한 개로 피카츄 30종을 다 모을 수 있나요?",
      a: "어렵습니다. 피카츄 홀로 카드는 30종인데 1박스는 20팩입니다. 게다가 공식 안내에도 한 상자에 모든 카드가 들어 있지 않고 같은 카드가 중복될 수 있다고 적혀 있습니다. 30종 수집은 여러 박스 또는 싱글 구매를 병행해야 합니다."
    },
    {
      q: "미개봉(슈링크) 박스는 어떻게 구별하나요?",
      a: "박스 외부 비닐(슈링크)이 원형대로 있고, 접힘선·열봉인 상태가 자연스러운지 봅니다. 재포장 흔적(비닐 이중, 테이프 자국, 박스 모서리 눌림)이 있으면 개봉 후 재포장을 의심하세요. 온라인 구매는 판매자 평가와 반품 조건을 함께 확인하는 것이 안전합니다."
    },
    {
      q: "리셀가는 어느 정도면 비싼 건가요?",
      a: "정가 기준으로 계산하세요. 박스 70,000원은 팩당 3,500원입니다. 12만 원에 올라온 박스는 팩당 6,000원으로 정가보다 팩당 2,500원, 박스 기준 50,000원(+71%) 비싼 것입니다. 가이드 탭의 계산기에 금액을 넣으면 바로 환산됩니다."
    },
    {
      q: "확장팩만 사면 바로 대전할 수 있나요?",
      a: "할 수 없습니다. 공식 안내에 확장팩만으로는 대전이 불가능하다고 적혀 있습니다. 덱이 구성된 스타터 세트가 따로 필요하고, 확장팩은 덱 강화와 수집용으로 쓰는 것이 기본입니다."
    }
  ];

  /* ------------------------------------------------------ 사실 메모(출처) */
  var facts = [
    { label: "정가·구성", text: "포켓몬 카드 게임 공식 제품 정보 (1팩 3,500원 / 1상자 70,000원, 1팩 6장, 1상자 20팩)", url: "https://pokemoncard.co.kr/card/960" },
    { label: "추첨 일정", text: "포켓몬스토어 30주년 특설 페이지 및 2차 추첨 안내 보도(10/20)", url: "https://www.pokemonstore.co.kr/pages/pokemoncardgame30th/product/index.html" },
    { label: "편의점 입고", text: "편의점 3사 판매 일정 보도(10/9 세계일보 · 10/20 TCG뉴스 정리)", url: "https://tcgnews.kr/article/34" },
    { label: "SSG 판매 조건", text: "SSG 공식인증샵 상품 페이지 (70,000원 + 배송비 3,000원)", url: "https://www.ssg.com/item/itemView.ssg?itemId=1000881834004" },
    { label: "수록 카드", text: "30th CELEBRATION 카드 목록 (176종 · FUR 2종 · SAR 10종 · AR 20종 · 복각 30종)", url: "https://www.tcgheart.com/set/30th-celebration-korean" }
  ];

  return {
    SITE: SITE,
    SET: SET_TARGET,
    channels: channels,
    trends: trends,
    cards: cards,
    timeline: timeline,
    weekdayGuide: weekdayGuide,
    recentStock: recentStock,
    calendar: calendar,
    regions: regions,
    osmSnapshot: osmSnapshot,
    brands: brands,
    brandMeta: brandMeta,
    shortcuts: shortcuts,
    faq: faq,
    facts: facts
  };
})();
