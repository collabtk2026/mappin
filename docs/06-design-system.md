# 06. 디자인 시스템 — "조용한 지도, 선명한 핀"

> 목표: **심플 · 모던 · 세련**. 주인공은 지도와 사용자의 핀이다. UI는 그 위에 얇게 떠 있는 유리판처럼 존재감을 줄인다.

## 1. 조사 요약 → 설계 원칙

| 조사에서 얻은 근거 | 원칙 |
|---|---|
| 데이터 지도는 배경지도의 색과 채도를 낮춰야 점 데이터가 돋보인다. CARTO는 Positron(밝은 회색)을 포인트 데이터용으로 권장하고, Mapbox Light도 "데이터 레이어가 경쟁 없이 돋보이도록" 톤을 절제한다 | **P1. 조용한 배경지도** — 회색조 기본지도(Positron 계열·다크는 Dark Matter 계열). 색은 오직 사용자의 핀과 카테고리에만 쓴다 |
| Apple Maps의 시트는 검색창 + 요약만 보이는 "peek"에서 시작한다. 끌어올리면 정보가 늘고, 내리면 지도가 화면을 가져간다. 지도는 계속 조작할 수 있어야 하므로 비모달 시트가 맞다 | **P2. 지도 우선 레이아웃** — 데스크톱은 왼쪽에 떠 있는 패널, 모바일은 3단(peek/half/full) **비모달 바텀시트** |
| Apple의 Liquid Glass(2025~): 반투명 재질은 "콘텐츠 **주변**"에 쓸 때 효과적이다. 대신 가독성 문제가 지적되어 투명도 줄이기·대비 높이기 옵션이 필요하다 | **P3. 절제된 유리 재질** — 떠 있는 컨트롤과 패널에만 blur + 높은 불투명도(82~88%)를 쓴다. `prefers-reduced-transparency`이거나 대비가 높으면 불투명 면으로 바꾼다 |
| 핀이 수십 개를 넘으면 클러스터링한다. 색 팔레트는 제한하고, 터치 타깃은 48dp 이상으로 한다 | **P4. 읽히는 핀** — 원형 핀 + 단색 아이콘 글리프 + 흰 테두리. 카테고리 색은 10색으로 제한. 클러스터는 중립색 원 + 숫자 |
| 토스는 한글에 Pretendard를 쓰고, 큰 글씨 모드에서 말줄임으로 정보가 손실되는 문제를 겪었다 | **P5. 한글 타이포그래피 우선** — Pretendard Variable, 숫자는 tabular-nums, 제목은 2줄까지 허용하고 말줄임을 남발하지 않는다 |
| (공통) 친근하고 간결한 해요체 마이크로카피 | **P6. 짧고 다정한 말투** — "저장했어요", "아직 메모가 없어요" |

## 2. 토큰

### 2.1 색 (CSS 변수, 라이트/다크)

| 토큰 | Light | Dark | 용도 |
|---|---|---|---|
| `--bg` | `#F5F6F8` | `#0E1013` | 앱 배경 (지도가 없을 때) |
| `--surface` | `#FFFFFF` | `#16191E` | 카드·패널 (불투명) |
| `--surface-glass` | `rgba(255,255,255,.86)` | `rgba(22,25,30,.82)` | 지도 위에 떠 있는 패널 |
| `--surface-muted` | `#F0F2F5` | `#1E2228` | 입력창, 칩 바탕 |
| `--border` | `rgba(15,23,42,.08)` | `rgba(255,255,255,.08)` | 1px 헤어라인 |
| `--text` | `#111418` | `#F2F4F7` | 본문 (대비 15:1 이상) |
| `--text-2` | `#4B5563` | `#A9B1BC` | 보조 (4.5:1 이상) |
| `--text-3` | `#8A94A3` | `#6E7783` | 힌트·메타 |
| `--accent` | `#3366FF` | `#5B84FF` | 주요 행동, 선택, 포커스 링 |
| `--accent-soft` | `rgba(51,102,255,.10)` | `rgba(91,132,255,.16)` | 선택된 칩·행 배경 |
| `--danger` | `#E5484D` | `#FF6369` | 삭제 |
| `--success` | `#2E9F6B` | `#3DD68C` | 완료 토스트 |

**카테고리/핀 팔레트 (10색)** — 회색 지도 위에서 서로 구분되고, 흰 글리프와의 대비가 3:1 이상인 색으로 골랐다.
`#3366FF` 블루 · `#E4572E` 코랄 · `#F08C00` 앰버 · `#2E9F6B` 그린 · `#12A4B6` 틸 · `#7B61FF` 바이올렛 · `#E5487D` 핑크 · `#9C6B4E` 브라운 · `#5B6B7F` 슬레이트 · `#1F2328` 잉크

### 2.2 타이포그래피 — Pretendard Variable (자체 호스팅)

| 토큰 | 크기/행간 | 굵기 | 용도 |
|---|---|---|---|
| `display` | 28/36 | 700, 자간 -0.02em | 빈 화면 제목, 공유 페이지 제목 |
| `title` | 20/28 | 700, -0.015em | 패널 제목, 장소 이름 |
| `headline` | 17/24 | 600, -0.01em | 섹션 제목 |
| `body` | 15/22 | 400 | 본문, 메모 |
| `callout` | 14/20 | 500 | 버튼, 입력 |
| `caption` | 13/18 | 500 | 메타(시간·주소) |
| `micro` | 12/16 | 600 | 배지, 칩 |

숫자와 시간은 `font-variant-numeric: tabular-nums`. 영문과 숫자 혼용 비율은 Pretendard 기본값을 그대로 쓴다.

### 2.3 간격·모양·그림자·모션
- **간격**: 4pt 그리드 — 4, 8, 12, 16, 20, 24, 32, 48
- **반경**: `--r-sm 8px`(입력 내부 요소), `--r-md 12px`(버튼·입력), `--r-lg 16px`(카드), `--r-xl 22px`(패널·시트), `--r-full`(칩·핀)
- **그림자** (지도 위 요소 전용, 2겹으로 부드럽게)
  - `--shadow-1`: `0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04)` — 칩, 작은 버튼
  - `--shadow-2`: `0 4px 12px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.06)` — 검색창, 지도 컨트롤
  - `--shadow-3`: `0 16px 40px rgba(15,23,42,.14), 0 2px 8px rgba(15,23,42,.06)` — 패널, 시트, 팝오버
- **유리 재질**: `background: var(--surface-glass); backdrop-filter: blur(20px) saturate(1.6); border: 1px solid var(--border)`
- **모션**: 호버·누름 120ms `ease-out`, 패널·시트 260ms `cubic-bezier(.2,.8,.2,1)`, 핀이 나타날 때 scale .6→1 + fade 180ms. `prefers-reduced-motion`이면 모두 페이드만 쓴다.

## 3. 레이아웃

```
데스크톱 (≥ 900px)                               모바일 (< 900px)
┌───────────────────────────────────────────┐   ┌──────────────────┐
│ ┌──────────────┐                 (◐)(👤) │   │ [🔍 장소 검색  👤]│
│ │🔍 검색   ⌘K  │                          │   │                  │
│ ├──────────────┤        지도               │   │      지도         │
│ │ 탭: 장소|카테고리|공유                    │   │                  │
│ │ [필터 칩...]  │                          │   │            (+)(◎)│
│ │ 목록 / 상세   │                   (+)    │   ├──────────────────┤
│ │              │                   (◎)    │   │ ━━ 바텀시트       │
│ └──────────────┘                   (±)    │   │ peek / half / full│
└───────────────────────────────────────────┘   └──────────────────┘
```
- 패널 폭 384px, 화면 가장자리에서 12px 띄워 떠 있게 한다 (지도가 패널 뒤로 이어져 보이도록).
- 지도 컨트롤(내 위치, 확대·축소, 새 장소)은 오른쪽 아래에 세로로 모은다. 크기는 44×44, 유리 재질.
- 상단 오른쪽에 테마 전환과 계정 메뉴를 둔다.

## 4. 핵심 컴포넌트

| 컴포넌트 | 명세 |
|---|---|
| **Pin** | 지름 34px 원 + 2px 흰 링 + `--shadow-2`, 가운데 18px Lucide 글리프(흰색, stroke 2). 아래에 6px 꼬리. 선택하면 scale 1.18 + 4px 강조 링. 공유받은 핀은 오른쪽 위에 14px 아바타 배지 |
| **Cluster** | 잉크색(`--text`) 원, 지름 34~56px(개수의 로그에 비례), 흰 숫자(micro, tabular). 클릭하면 확장 줌으로 이동 |
| **SearchBar** | 높이 48, `--r-lg`, 유리 재질 + `--shadow-2`. 왼쪽 돋보기, 오른쪽 `⌘K` 힌트. 포커스하면 패널 안에 결과 목록 (내 장소 결과 먼저, 그다음 외부 검색) |
| **Chip** | 높이 30, `--r-full`, `micro`. 기본은 `--surface-muted`, 선택하면 `--accent-soft` + accent 글자, 카테고리 칩은 색 점(8px) 포함 |
| **PlaceRow** | 40px 아이콘 원 + 제목(headline) + 메타 1줄(카테고리 · 마지막 메모 시각) + 태그 칩 최대 3개 |
| **Timeline** | 왼쪽 2px 세로선 + 8px 점. 메모는 카드(body), 이벤트는 회색 한 줄(caption) — "‘데이트’ 태그를 붙였어요 · 3일 전". 수정된 메모에는 "수정됨" 배지 → 누르면 리비전 목록 |
| **IconPicker** | 6열 그리드, 그룹 탭(음식/카페/여행/쇼핑/자연/기타), 아래에 10색 스와치 |
| **Sheet (모바일)** | 위쪽 핸들 36×5, 스냅 높이 peek 112px / half 52vh / full 92vh. 드래그 속도로 다음 스냅을 고른다. 지도는 계속 조작할 수 있다 |
| **Toast** | 하단 중앙, 잉크색 바탕 + 흰 글자, 3초. "되돌리기" 액션 지원 (삭제 등) |
| **Empty state** | 큰 Lucide 아이콘(40px, `--text-3`) + 한 줄 제목 + 한 줄 설명 + 주요 행동 1개 |

## 5. 아이콘 세트 (Lucide 기반 시스템 아이콘)
`pin.default`(MapPin) · `food`(UtensilsCrossed) · `cafe`(Coffee) · `bar`(Wine) · `bakery`(Croissant) · `travel`(Plane) · `hotel`(BedDouble) · `nature`(Trees) · `beach`(Waves) · `mountain`(Mountain) · `shopping`(ShoppingBag) · `culture`(Landmark) · `art`(Palette) · `music`(Music) · `sport`(Dumbbell) · `health`(HeartPulse) · `school`(GraduationCap) · `work`(Briefcase) · `home`(House) · `parking`(SquareParking) · `star`(Star) · `heart`(Heart) · `camera`(Camera) · `gift`(Gift)

## 6. 접근성 체크리스트
- 텍스트 대비 4.5:1 이상(보조 텍스트 포함), 핀 글리프 3:1 이상
- 모든 터치 타깃 44×44 이상, 포커스 링 2px `--accent` + 2px 오프셋
- 키보드: `⌘K`/`Ctrl+K` 검색, `Esc` 패널 닫기, `N` 새 장소, 목록은 화살표로 이동
- 지도 핀은 목록에도 똑같이 있어서, 스크린리더 사용자는 목록으로 모든 기능을 쓸 수 있다
- `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-color-scheme` 존중

## 7. 지도 스타일 적용
- **MapLibre**: OpenFreeMap `positron`(라이트)과 `dark`(다크) 스타일을 쓴다. 라벨은 핀보다 아래 레이어에 둔다 (핀은 HTML 마커라 항상 위에 있다).
- **Kakao**: 스타일을 바꾸는 API가 제한적이다 → 기본 지도를 쓰되, 핀·패널 쪽 디자인으로 통일감을 맞춘다. 다크 모드에서는 MapLibre 다크로 전환할지 설정에서 고른다 (P1).
- **오프라인 데모 스타일**: 네트워크가 막힌 개발·테스트 환경용. 서울 자치구·행정동 경계(공공 통계 데이터)로 그린 회색조 스타일이다. `MAP_STYLE=demo`일 때 쓴다.

## 8. 참고
- Positron/Dark Matter 소개 — [Stamen](https://stamen.com/introducing-positron-dark-matter-new-basemap-styles-for-cartodb-d02172610baa/), [CARTO basemap-styles](https://github.com/CartoDB/basemap-styles), [CARTO 스타일링 가이드](https://carto.com/help/tutorials/improve-the-message-of-your-map-through-styling)
- [Mapbox Light 스타일](https://docs.mapbox.com/map-styles/reference/light/)
- 바텀시트·지도 UI — [Eleken: Bottom sheet UI](https://www.eleken.co/blog-posts/bottom-sheet-ui), [Eleken: Map UI design](https://eleken.co/blog-posts/map-ui-design), [Apple HIG – Maps](https://developer.apple.com/design/human-interface-guidelines/maps), [Adobe XD – Map UI tips](https://xd.adobe.com/ideas/process/ui-design/designing-map-ui-tips-and-inspiration/)
- Liquid Glass — [Apple 문서](https://developer.apple.com/documentation/technologyoverviews/liquid-glass), [Apple Magazine](https://applemagazine.com/liquid-glass-design/), [UX Collective 비평](https://uxdesign.cc/liquid-glass-is-beautiful-but-is-the-chemistry-missing-00b4f79ff529)
- 한글 타이포그래피 — [요즘IT: Pretendard](https://yozm.wishket.com/magazine/detail/1846), [토스: 서체](https://toss.im/tossfeed/article/beginning-of-tps), [바이라인: 토스 UX](https://byline.network/2023/06/09-104/)
