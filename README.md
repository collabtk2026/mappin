# Mappin

내가 저장한 장소(POI)와 그곳에 쌓인 기록(메모 히스토리, 태그, 아이콘, 카테고리)을 지도 위에서 다시 보고, 지인과 공유하는 서비스.
**웹 우선**으로 만들고, 같은 API와 도메인 모델로 **iOS·Android**까지 확장한다.

## 문서

| # | 문서 | 내용 |
|---|---|---|
| 01 | [서비스 기획](docs/01-product-plan.md) | 시나리오, 기능 우선순위(P0/P1/P2), 도메인 모델, 카테고리·태그·메모 히스토리 설계, 공유 모델, 화면 구성 |
| 02 | [지도 공급자 조사와 결정](docs/02-map-provider-research.md) | Kakao / Naver / Google / MapLibre+OSM / 브이월드 / Apple 비교, 약관에 맞춘 저장 정책, 결정 게이트 |
| 03 | [아키텍처](docs/03-architecture.md) | 기술 스택, 모노레포, 지도 어댑터, 인증, 공유 권한, 동기화, 플랫폼별 접근 계획 |
| 04 | [API 개요](docs/04-api.md) | 공통 규약, 엔드포인트 요약, 핵심 흐름, 클라이언트 생성 |
| 05 | [로드맵·법규·리스크](docs/05-roadmap-and-compliance.md) | 단계별 일정, 위치정보법 등 체크리스트, 리스크 대응 |

## 계약과 뼈대

| 경로 | 설명 |
|---|---|
| [`api/openapi.yaml`](api/openapi.yaml) | **단일 API 계약** (OpenAPI 3.1, 64개 엔드포인트) — 웹·RN·Swift·Kotlin 클라이언트를 모두 여기서 생성한다 |
| [`db/schema.sql`](db/schema.sql) | PostgreSQL 16 + PostGIS 초기 스키마 |
| [`packages/map-core/src/index.ts`](packages/map-core/src/index.ts) | 지도 공급자 독립 인터페이스 (`MapProvider`, `MapHandle`, `MarkerSpec`, 아이콘 결정 규칙) |

## 핵심 결정 요약

1. **데이터는 우리가 소유한다** — 좌표는 WGS84로 저장한다. 지도사 장소 ID는 참조값으로만 둔다. 공급자의 상세 정보는 저장하지 않고 실시간으로 조회한다.
2. **국내 지도는 Kakao(MVP), 대안은 Naver, 해외와 폴백은 MapLibre+OSM** — 모두 어댑터 뒤에 둔다. `/v1/map/config`로 앱을 재배포하지 않고 공급자를 바꾼다.
3. **TypeScript 단일 스택** — Fastify + PostGIS / Next.js / Expo(React Native)가 `api-client`·`domain`·`map-core` 패키지를 공유한다.
4. **카테고리(계층·1개) + 태그(다중·부착 시각 기록) + 메모 타임라인(리비전 보존) + 장소 이벤트 로그**
5. **공유는 장소나 카테고리 단위**로, 사용자·이메일·링크에 `viewer`/`editor` 권한을 준다. 받은 사람은 내 지도 위에 레이어로 겹쳐 본다.

## 검증

```bash
npx @redocly/cli lint api/openapi.yaml
```

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
```
