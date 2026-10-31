# 02. 지도 데이터 공급자 조사와 결정

> 조사 기준일: 2026-10-31. 요금과 쿼터는 자주 바뀌므로 **계약·출시 직전에 각 사 콘솔과 약관에서 다시 확인**해야 한다. 이 조사에서 공식 문서로 직접 확인하지 못한 수치는 "(확인 필요)"로 표시했다.

## 1. 결론 요약

| 결정 | 내용 |
|---|---|
| **원칙** | 사용자 데이터(좌표·메모·태그 등)는 **우리 DB가 원본**이다. 지도사는 "배경지도 + 검색 도구"로만 쓰고, `MapProvider` 어댑터 뒤에 숨긴다 |
| **국내 기본 (MVP 웹)** | **Kakao Maps** — 지도 SDK와 로컬(장소·주소·카테고리) 검색 API를 같은 공급자로 맞춘다 |
| **국내 대안 (상시 대기)** | **Naver Maps (NCP Maps)** — 어댑터로 언제든 전환할 수 있게 둔다. 모바일 RN 래퍼 성숙도가 높아 P1 모바일에서 다시 검토한다 |
| **해외·장애 대비** | **MapLibre GL + OpenStreetMap 벡터타일** (OpenFreeMap 또는 Protomaps PMTiles 자체 호스팅). 공급자 종속이 없는 최종 안전판 |
| **주소 정규화** | **행정안전부 도로명주소 API(juso.go.kr)**와 **브이월드** — 공공데이터라 저장·재사용 제약이 적다 (이용허락범위는 출시 전에 확인) |
| **Google Maps** | 2026-02 고정밀 지도 반출이 조건부로 허가됐지만 2026-10 현재 국내 길찾기는 아직 출시되지 않았다. **2027년 해외 확장 시점에 다시 평가**한다 |

**왜 이렇게 정했나 — "지속성"은 특정 지도사를 고르는 것으로는 얻을 수 없다.** 네이버는 2025년에, 카카오는 2026년에 무료 정책을 바꿨고, 구글도 2025년에 과금 체계를 전면 개편했다. 공급자 정책은 반드시 바뀐다. 그래서 진짜 지속성은 다음 세 가지에서 나온다.
1. 사용자 데이터를 공급자와 무관한 형식(WGS84 + 우리 스키마)으로 소유한다.
2. 지도 렌더링과 검색을 어댑터로 감싸서 공급자를 갈아끼울 수 있게 한다.
3. 공급자 설정(키, 스타일 URL, 지역별 공급자)을 서버의 `/v1/map/config`로 내려줘서, **앱을 업데이트하지 않고도** 공급자를 바꿀 수 있게 한다.

## 2. 후보별 비교

| 항목 | Kakao Maps | Naver Maps (NCP) | Google Maps Platform | MapLibre + OSM | 브이월드 (국토부) | Apple MapKit |
|---|---|---|---|---|---|---|
| 국내 지도 상세도 | ◎ | ◎ | ○ (고정밀 데이터 반영 진행 중) | △ (지역 편차 큼) | ○ (공공 기본도·항공영상) | △ |
| 국내 POI(상호) 데이터 | ◎ 로컬 API로 키워드·카테고리 검색 | ○ 검색 API가 제한적 (아래 참고) | ○ 개선 중 | △ | △ (POI 빈약) | △ |
| 해외 커버리지 | ✕ | ✕ (일부) | ◎ | ◎ | ✕ | ◎ |
| Web SDK | ○ JS SDK | ○ JS v3 | ◎ | ◎ MapLibre GL JS | ○ WMTS (OpenLayers 등) | ○ MapKit JS |
| iOS/Android SDK | ○ 네이티브 SDK | ○ 네이티브 SDK | ◎ | ◎ MapLibre Native | △ | iOS만 |
| React Native | △ 커뮤니티 래퍼가 미성숙 | ○ `@mj-studio/react-native-naver-map` | ◎ `react-native-maps` | ◎ `@maplibre/maplibre-react-native` | ✕ | ○ |
| 응답 데이터 저장 | **장소 ID만 저장 가능**, 이름·주소 등 응답값 저장은 불가 (포럼 운영진 답변 기준) | 제한적 (약관 확인 필요) | `place_id`는 저장 가능. 그 밖의 콘텐츠는 API별로 제한이 다르다 | 자유 (ODbL: 출처 표시, 파생 DB는 공유 의무) | 공공저작물 (출처 표시) | 임시 캐시만 |
| 타사 지도 위 표시 | 불명확 (공식 답변 미확인) | 불명확 | **불가** (구글 콘텐츠는 구글 지도에만) | 자유 | 자유 | 불가 |
| 정책 안정성 | △ 2026-07 무료 쿼터 정책 변경 | △ 2025-07 구 상품 무료 종료 | △ 2025-03 과금 체계 전면 개편 | ◎ (자체 호스팅 시 통제 가능) | ○ | ○ |

◎ 매우 좋음 · ○ 좋음 · △ 제한적 · ✕ 미지원

## 3. 공급자별 상세

### 3.1 Kakao Maps (국내 1순위)
- **구성**: 지도 Web SDK, Android/iOS 네이티브 SDK, 로컬 REST API (키워드 장소 검색, 카테고리 검색, 주소 검색, 좌표→주소 변환).
- **쿼터**: 앱별 무료 쿼터가 있고, 다 쓰면 HTTP 429를 돌려준다. 그 이상은 유료 API로 설정해서 쓴다.
  - **2026-07-21 정책 변경**: 이날 이후 카카오맵 API를 활성화한 앱에는 "개발자 계정의 첫 번째 카카오맵 API 활성화 앱"에만 무료 쿼터를 준다. 그 이전부터 쓰던 앱은 기존 무료 쿼터를 유지한다.
  - 구체적인 일·월 한도는 콘솔의 [통계] > [쿼터]에서 확인한다. 포럼에는 검색 API 일 50,000건이라는 보고가 있다 (확인 필요).
  - → **조치**: 운영 앱은 회사 대표 개발자 계정의 첫 번째 앱으로 만든다. 개발과 테스트는 별도 계정으로 분리한다.
- **저장 정책 (가장 중요)**: 카카오 FAQ와 포럼 운영진 답변에 따르면 응답 데이터를 따로 저장해 쓰는 것은 허용되지 않고 실시간 호출만 가능하다. **장소 ID는 저장할 수 있지만**, 장소명·주소 같은 응답값을 함께 저장하는 형태는 허용되지 않는다. 장소 ID로 한 건을 조회하는 API는 없다.
  - → **우리 설계 반영**:
    - 좌표는 사용자가 지도에서 확정한 "사용자의 핀"으로 저장한다.
    - 이름은 사용자가 입력하거나 확인한 "사용자의 라벨"로 저장한다. 검색 결과로 미리 채워 주는 것이 허용되는지는 **카카오에 서면으로 확인**해야 한다.
    - 주소는 공공 API(도로명주소, 브이월드)로 다시 조회해서 저장한다.
    - 카카오 장소 ID는 `provider_refs`에 참조로만 둔다.
- **장점**: 지도와 검색을 같은 공급자로 맞추기 쉽다. 장소 카테고리 코드 체계가 있어서 우리 카테고리 자동 제안에 쓸 수 있다.
- **약점**: RN 래퍼가 미성숙하다 → 모바일에서는 Expo Native Module로 직접 감싸야 할 수 있다.

### 3.2 Naver Maps — NCP Maps (국내 2순위, 상시 대체)
- **구성**: Web Dynamic Map, Mobile Dynamic Map, Static Map, Geocoding, Reverse Geocoding, Directions 5/15.
- **요금 변경**: 2025-07-01부터 구 "AI NAVER API" 상품의 지도 API 무료 이용량이 끝나고 전량 유료로 바뀌었다. 무료 이용량을 받으려면 새 **Maps 상품으로 전환**해야 한다. 무료 이용량은 **대표 계정(Maps를 가장 먼저 쓴 계정)에만** 준다. 구체적인 수치는 NCP 포털에서 확인한다.
- **장소 검색**: 지역 검색은 NAVER API HUB의 검색 API(`GET /search/v1/local`)로 하고, 하루 한도는 25,000회다 (2026-06 문서 기준). 구 오픈 API 시절에는 한 번에 받을 수 있는 결과 수가 적었다 (확인 필요). POI 검색 품질 면에서 카카오 로컬 API보다 개발자 친화성이 떨어진다.
- **장점**: 국내 지도 품질이 최상위다. RN 래퍼(`@mj-studio/react-native-naver-map`)가 활발하게 관리된다.
- **결정**: 어댑터를 처음부터 함께 만들어 둔다. P1 모바일에서 "카카오 네이티브 모듈 직접 개발 비용"과 "네이버 전환"을 비교해 결정한다 (**결정 게이트 G1**).

### 3.3 Google Maps Platform (관찰, 해외 확장 시 재평가)
- **국내 상황**: 2026-02-27 정부가 1:5,000 고정밀 지도의 국외 반출을 **조건부로 허가**했다.
  - 조건: 보안 처리된 영상만 사용, 군사·보안시설 가림, 내비게이션·길찾기에 필요한 데이터로 한정.
  - 국토부는 적용까지 엔지니어링에 약 6개월이 걸릴 것으로 봤다.
  - **2026-10 현재 국내 도보·차량 길찾기는 아직 출시되지 않았고**, 출시일도 공개되지 않았다.
- **요금**: 2025-03-01부터 월 $200 크레딧이 없어지고 SKU별 월 무료 호출 수로 바뀌었다 (Essentials 10,000 / Pro 5,000 / Enterprise 1,000 수준. 공식 가격표에서 확인 필요). Places API는 New 버전만 새로 활성화할 수 있다.
- **약관**: `place_id`는 캐시·저장할 수 있다. 다른 콘텐츠는 API별로 기간 제한이 있다 (예: Android Geocoder 위경도는 30일). **구글 콘텐츠를 구글이 아닌 지도 위에 표시하는 것은 금지**된다 → 어댑터로 섞어 쓰기 어렵다.
- **결정**: 해외 POI 상세 데이터는 구글이 가장 좋다. 해외 사용자 비중이 커지는 시점(**결정 게이트 G2**)에 "해외 지역은 구글 지도 + 구글 검색"으로 지역별 공급자 조합을 추가한다.

### 3.4 MapLibre GL + OpenStreetMap (안전판·해외 기본)
- **렌더러**: MapLibre GL JS / Native / React Native. 오픈소스(BSD)라 라이선스 비용이 없다.
- **타일**:
  - OpenFreeMap (무료 공개 벡터타일)
  - **Protomaps PMTiles 자체 호스팅** (단일 파일을 R2/S3에 올리고 CDN으로 서빙 → 공급자 종속이 0)
  - 유료 대안: MapTiler, Stadia
- **검색·지오코딩**: Nominatim/Photon 자체 호스팅 또는 유료 API.
- **국내 품질**: 한국어 POI 태그(`name:ko`)의 완성도와 최신성은 지역 편차가 크다 → 국내 기본 지도로는 부족하고, **해외 기본 + 국내 장애 시 폴백**으로 쓴다.
- **라이선스**: ODbL — "© OpenStreetMap contributors" 표시. OSM 데이터를 가공한 DB를 공개 배포하면 공유 의무가 생긴다 (사용자 데이터와 섞지 않으면 문제가 없다).

### 3.5 공공 데이터 (주소·배경지도)
- **도로명주소 API (juso.go.kr)**: 주소 검색과 좌표 변환. 저장한 주소를 공급자와 무관하게 정규화하는 데 쓴다.
- **브이월드 (국토교통부)**: 배경지도·영상지도 WMTS, 벡터지도, 지오코더.
  - 공공데이터포털 표기: 배경지도 API는 "이용허락범위 제한 없음", 벡터지도 API는 "공공저작물 출처표시(제1유형)이며 운영 단계 심의 승인 필요".
  - → 상업적 이용 조건은 출시 전에 브이월드 고객센터에 확인한다.

### 3.6 Apple MapKit JS (보류)
- 멤버십당 하루 지도 뷰 250,000회, 서비스 호출 25,000회 수준의 무료 쿼터 (포럼 기준, 확인 필요).
- 국내 POI 품질이 낮고 캐시는 임시로만 허용된다 → 국내 서비스에는 채택하지 않는다. iOS에서도 국내 지도는 카카오/네이버 SDK를 쓴다.

## 4. 데이터 저장 정책 (공급자 약관 준수 설계)

| 필드 | 출처 | 저장 | 비고 |
|---|---|---|---|
| `lat`, `lng` | 사용자가 확정한 핀 | ✅ | 사용자 생성 데이터. 검색 결과 좌표는 사용자가 "저장"을 누르는 순간 사용자의 핀이 된다 (공급자에 서면 확인 권장) |
| `title` | 사용자 입력 | ✅ | 검색 결과로 미리 채울 수 있는지는 공급자에 확인한다 |
| `address_*` | 도로명주소 API / 브이월드 | ✅ | 공공데이터로 다시 조회해서 저장 |
| `provider_refs.external_id` | 카카오·네이버·구글 장소 ID | ✅ | ID만 저장. 상세 정보는 화면을 띄울 때 실시간으로 조회 |
| 영업시간, 전화, 리뷰 등 | 공급자 | ❌ | 저장하지 않고 상세 패널에서 실시간 조회 + 공급자 링크로 이동 |
| 메모·태그·아이콘·카테고리 | 사용자 | ✅ | 우리 데이터 |

## 5. 어댑터 설계 요지 (자세한 내용은 03-architecture.md)

```ts
interface MapProvider {
  id: 'kakao' | 'naver' | 'maplibre' | 'google';
  mount(el, options): Promise<MapHandle>;           // 지도 렌더링
  search?(query, near?): Promise<PlaceCandidate[]>; // 같은 공급자의 검색 (서버 프록시)
  reverseGeocode?(lat, lng): Promise<Address>;
}
// 지역별 선택: /v1/map/config → { regions: [{ bbox: KR, provider: 'kakao' }, { default: 'maplibre' }] }
```

## 6. 결정 게이트

| ID | 시점 | 질문 | 판단 기준 |
|---|---|---|---|
| G0 | MVP 착수 전 | 카카오 약관 서면 확인 | 검색 결과 좌표와 이름으로 미리 채우는 것이 허용되는가? 안 되면 "검색은 이동만, 저장은 사용자 핀으로" UX로 바꾼다 |
| G1 | P1 모바일 착수 | 국내 모바일 지도를 카카오로 유지할지 네이버로 바꿀지 | 카카오 네이티브 모듈 개발 공수가 2주를 넘으면 네이버로 전환 (검색-표시 공급자 일치 원칙도 함께 이동) |
| G2 | 해외 MAU 비중 20% 초과 | 해외에 구글을 도입할지 | 해외 POI 상세 수요와 비용 비교 |
| G3 | 구글 국내 길찾기 출시 후 | 국내 구글 검토 | 국내 POI 품질과 약관(타사 지도 혼용 불가) 비교 |

## 7. 참고 자료
- 구글 고정밀 지도 반출 조건부 허가: [정책브리핑](https://www.korea.kr/briefing/actuallyView.do?newsId=148960107), [ZDNet Korea](https://zdnet.co.kr/view/?no=20260227120235), [바이라인네트워크](https://byline.network/2026/02/27_129874/), [한국경제(2026-04)](https://www.hankyung.com/article/2026041406261), [나무위키 – 구글 지도/대한민국](https://namu.wiki/w/%EA%B5%AC%EA%B8%80%20%EC%A7%80%EB%8F%84/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD)
- Google Maps Platform: [2025년 3월 변경사항](https://developers.google.com/maps/billing-and-pricing/march-2025?hl=ko), [가격 개요](https://developers.google.com/maps/billing/overview/), [서비스별 약관](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- Naver: [NCP Maps 개요](https://guide.ncloud-docs.com/docs/maps-overview), [Maps API 요금 안내 포럼](https://www.ncloud-forums.com/topic/99/), [NAVER API HUB 지역 검색](https://api.ncloud-docs.com/docs/naver-api-hub-search-local.md)
- Kakao: [카카오맵 공통 가이드](https://developers.kakao.com/docs/latest/ko/kakaomap/common), [무료 쿼터 정책 공지](https://devtalk.kakao.com/t/api-notice-on-new-kakao-map-api-features-and-free-quota-policy/150222), [쿼터 문서](https://developers.kakao.com/docs/latest/ko/getting-started/quota), [로컬 API 타사 지도 표시 문의](https://devtalk.kakao.com/t/local-api-sdk/150397), [로컬 API 임시 저장 문의](https://devtalk.kakao.com/t/api-20/151271)
- Apple: [MapKit JS 가격](https://developer.apple.com/maps/mapkitjs/pricing), [포럼 – MapKitJS Pricing](https://developer.apple.com/forums/thread/782750)
- 공공: [브이월드 배경지도 API (공공데이터포털)](https://www.data.go.kr/catalog/15101104/openapi.json), [브이월드 벡터지도 API](https://data.go.kr/data/15140371/openapi.do)
- OSM/MapLibre: [FOSS4G-Asia 2023 서울 – 아시아 웹지도 현지화](https://talks.osgeo.org/foss4g-asia-2023/talk/8YG7LN/)
