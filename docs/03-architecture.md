# 03. 아키텍처 — 웹 우선, iOS·Android까지 공통 뼈대

## 1. 전체 구조

```
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Web (Next.js)│   │ iOS (Expo RN)    │   │ Android (Expo RN)│
│ MapLibre/Kakao│  │ Kakao|Naver SDK  │   │ Kakao|Naver SDK  │
└──────┬───────┘   └────────┬─────────┘   └────────┬─────────┘
       │  공통 패키지: @mappin/api-client · @mappin/domain · @mappin/map-core
       └───────────────┬────────────┴─────────────────────┘
                       │ HTTPS  REST /v1  (OpenAPI 3.1 = 단일 계약)
              ┌────────▼─────────┐
              │  API 서버         │  Node.js 22 + Fastify + TypeScript
              │  (stateless)     │  인증 · 장소 · 메모 · 태그 · 카테고리 · 공유 · 동기화
              └──┬──────┬─────┬──┘
                 │      │     │
     ┌───────────▼┐ ┌───▼───┐ ┌▼──────────────────────┐
     │ PostgreSQL │ │ Redis │ │ Object Storage (S3/R2) │
     │ + PostGIS  │ │(선택) │ │ 사진, 내보내기 파일     │
     └────────────┘ └───────┘ └───────────────────────┘
                 │
     ┌───────────▼──────────────────────────────┐
     │ 외부: Kakao Local · 도로명주소 · 브이월드  │  ← 서버에서 프록시 (키 보호, 쿼터 관리)
     └──────────────────────────────────────────┘
```

## 2. 기술 선택과 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| 언어 | **TypeScript 하나로 통일** | 웹·모바일·서버가 타입과 검증 로직을 공유한다. 팀이 작을 때 가장 빠르다 |
| API 계약 | **OpenAPI 3.1** (`api/openapi.yaml`) | 계약을 먼저 정하고 코드를 만든다(contract-first). TS 클라이언트를 생성하고, 나중에 Swift/Kotlin 네이티브로 가도 같은 명세에서 클라이언트를 생성한다 |
| 서버 | Fastify + Zod (+ `fastify-type-provider-zod`) | 가볍고 빠르다. Zod 스키마와 OpenAPI를 서로 맞물려 검증할 수 있다 |
| DB | PostgreSQL 16 + **PostGIS** | bbox·반경 조회와 클러스터링(`ST_ClusterDBSCAN`, `ST_SnapToGrid`), 트랜잭션, JSONB |
| ORM/쿼리 | Drizzle ORM + 마이그레이션 SQL | 공간 쿼리는 SQL을 직접 쓴다 |
| 웹 | **Next.js (App Router)** | 지도 화면은 클라이언트 렌더링. **공유 링크 페이지만 SSR**로 그려서 OG 태그와 미리보기를 지원한다 |
| 모바일 | **Expo (React Native)** + Expo Router | 웹과 도메인·API 클라이언트·상태 관리를 공유한다. 지도처럼 네이티브가 필요한 부분은 Expo Native Module로 처리한다 |
| 상태·캐시 | TanStack Query (웹·RN 공통) | 서버 상태 캐시, 낙관적 업데이트 |
| 모바일 로컬 DB | expo-sqlite (+ Drizzle) | 오프라인 캐시와 대기 중인 변경(outbox) |
| 인증 | 자체 발급 JWT(access) + 회전형 refresh 토큰 | 소셜(OIDC) 로그인을 붙이기 쉽고 공급자에 종속되지 않는다 |
| 인프라 | AWS 서울 리전 (ECS Fargate + RDS PostgreSQL) 또는 NCP | 위치·개인정보를 국내에 보관한다 (법무 검토에 유리) |
| 관측 | OpenTelemetry → Grafana/Sentry | |

> 왜 Flutter나 순수 네이티브가 아닌가: "웹이 기본"이라는 요구 때문이다. React(웹)와 React Native(앱)가 같은 TS 패키지를 그대로 공유할 수 있어서다. 지도 SDK 래퍼처럼 꼭 네이티브여야 하는 부분만 Swift/Kotlin으로 작게 작성한다.

## 3. 모노레포 구조 (pnpm workspace + Turborepo)

```
mappin/
├─ api/openapi.yaml            # 단일 API 계약 (모든 클라이언트의 기준)
├─ db/schema.sql               # 초기 스키마 (PostGIS)
├─ apps/
│  ├─ server/                  # Fastify API
│  ├─ web/                     # Next.js
│  └─ mobile/                  # Expo (P1)
├─ packages/
│  ├─ api-client/              # openapi.yaml로 생성한 타입·fetch 클라이언트 (openapi-typescript + openapi-fetch)
│  ├─ domain/                  # 도메인 타입, 아이콘·색 결정 규칙, 필터 로직, 검증(Zod)
│  ├─ map-core/                # MapProvider 어댑터 인터페이스 + 공통 클러스터링 (supercluster)
│  └─ map-native/              # RN 어댑터 (Kakao/Naver/MapLibre) — P1
│  (P0: 웹 어댑터는 apps/web/src/map/{maplibre,kakao,pins}.ts — 모바일 착수 시 패키지로 분리)
└─ docs/
```

## 4. 지도 어댑터 계층 (`packages/map-core`)

UI는 지도사 SDK를 직접 부르지 않는다. 모든 지도 동작은 `MapHandle` 인터페이스를 거친다. 인터페이스 정의는 [`packages/map-core/src/index.ts`](../packages/map-core/src/index.ts)에 있다.

- **렌더링**: `setCamera`, `setMarkers` (diff 반영), `onCameraIdle`(bbox·zoom), `onLongPress`, `onMarkerClick`
- **마커 모델**: 공급자와 무관한 `MarkerSpec { id, lat, lng, icon, color, badge?, clusterKey? }`
- **클러스터링**: 장소가 적으면(< 5,000) 클라이언트에서 `supercluster`로 묶는다. 많으면 서버의 `/v1/map/clusters`가 묶은 결과를 받는다. 어느 쪽이든 결과는 `MarkerSpec`으로 바꿔서 어댑터에 넘긴다 → 공급자마다 다른 클러스터러에 의존하지 않는다.
- **공급자 선택**: 앱이 시작될 때 `/v1/map/config`를 받아 지역(bbox)별 공급자, API 키(도메인 제한된 공개 키), 스타일 URL을 정한다. **공급자를 바꿀 때 앱을 다시 배포할 필요가 없다.**
- **검색**: 클라이언트는 우리 서버의 `/v1/geo/search`만 부른다. 서버가 해당 지역 공급자의 검색 API로 프록시한다. 서버 키가 숨겨지고, 쿼터와 캐시 정책을 한곳에서 통제한다 (카카오처럼 저장이 금지된 응답은 캐시하지 않는다).

## 5. 인증·계정

| 항목 | 설계 |
|---|---|
| 방식 | 이메일+비밀번호(argon2id), 소셜: Google·Apple·Kakao·Naver (OIDC/OAuth2 + PKCE) |
| 토큰 | Access JWT 15분 (EdDSA 서명, `sub`, `sid`) + Refresh 토큰 30일 (불투명 토큰, DB에는 해시만 저장, **사용할 때마다 회전**, 재사용이 감지되면 세션 전체 폐기) |
| 웹 | Refresh 토큰은 `HttpOnly; Secure; SameSite=Lax` 쿠키에, Access 토큰은 메모리에 둔다. `/auth/refresh`는 쿠키 기반 + CSRF 토큰 |
| 모바일 | Refresh 토큰은 iOS Keychain / Android Keystore(expo-secure-store)에, Access 토큰은 메모리에 둔다 |
| 소셜 연결 | `auth_identities` 테이블로 계정 하나에 여러 로그인 수단을 연결한다 |
| 필수 정책 | App Store: 다른 소셜 로그인이 있으면 **Sign in with Apple을 반드시 제공**하고, **앱 안에서 계정 삭제**가 가능해야 한다 → `DELETE /v1/me` |
| 권한 검사 | 모든 리소스는 `owner_id`로 확인한다. 공유된 리소스는 `shares`를 거쳐 `viewer`/`editor`로 판정한다 (서버의 `authorize(user, action, resource)` 한 곳에서). Postgres RLS는 2차 방어선으로 검토한다 |

## 6. 공유 권한 판정

```
canRead(user, place) =
     place.owner_id = user.id
  OR ∃ share(target=place, grantee=user, active)
  OR ∃ share(target=category C, grantee=user, active) where place.category ∈ subtree(C) [include_descendants]
canWrite(user, place) = owner OR (위 share 중 permission='editor')
링크 공유: GET /v1/s/{token} → 토큰 해시로 share를 찾아 읽기 전용 응답 (is_private 메모 제외)
```
카테고리 하위 트리 판정은 `categories.path`(materialized path, `ltree`)로 인덱스를 타게 한다.

## 7. 동기화 (모바일 오프라인 대비, 웹도 같은 방식)

- **ID는 클라이언트가 만든다**: UUIDv7. 오프라인에서 만든 장소도 ID가 바로 정해진다.
- **변경 피드**: 모든 변경 가능한 행은 `updated_at`과 전역 단조 증가 값 `change_seq`(bigserial 시퀀스)를 가진다. 삭제는 `deleted_at` 툼스톤으로 남긴다.
  - `GET /v1/sync/changes?cursor=<seq>&limit=500` → `{ changes: [...], next_cursor, has_more }`
  - 공유받은 리소스도 같은 피드에 섞어서 내려준다 (`scope: own | shared`).
- **업로드**: `POST /v1/sync/push` — 오프라인 동안 쌓인 변경 묶음. 항목마다 `Idempotency-Key`를 붙인다.
- **충돌**: 장소 필드는 **필드 단위 최종 기록 우선(LWW)**, 기준은 `base_version`. 메모와 태그 부착은 추가(append) 위주라 충돌이 거의 없다. 메모 본문이 충돌하면 두 버전을 모두 리비전으로 보존한다.
- 일반 REST 쓰기(`PATCH /places/{id}`)도 `If-Match: <version>`으로 낙관적 잠금을 건다 → 412가 오면 클라이언트가 병합한다.

## 8. 성능 설계

- `places.location geography(Point,4326)` + GiST 인덱스. bbox 조회: `ST_Intersects(location, ST_MakeEnvelope(...)::geography)`
- 클러스터 API: 줌 레벨별 격자(`ST_SnapToGrid` on `ST_Transform(…,3857)`)로 묶어 개수와 대표 아이콘을 돌려준다.
- 목록은 커서 페이지네이션(`(updated_at, id)` 키셋).
- 응답 압축, `ETag`/`If-None-Match`.

## 9. 플랫폼별 접근 계획

| | Web | iOS | Android |
|---|---|---|---|
| 앱 형태 | Next.js PWA (홈 화면 추가, 오프라인 읽기 캐시) | Expo 빌드 (EAS) | Expo 빌드 (EAS) |
| API 클라이언트 | `@mappin/api-client` | 동일 | 동일 |
| 국내 지도 | Kakao JS SDK | Kakao iOS SDK (Expo 모듈) — G1에서 Naver로 바꿀 수 있음 | Kakao Android SDK (Expo 모듈) — 동일 |
| 해외/폴백 지도 | MapLibre GL JS | MapLibre Native (RN) | MapLibre Native (RN) |
| 로그인 | 쿠키 refresh | Keychain + Sign in with Apple, Kakao SDK 로그인 | Keystore + Google Credential Manager, Kakao SDK 로그인 |
| 위치 | Geolocation API | CoreLocation (When-In-Use) | Fused Location (foreground) |
| 공유 받기 | `/s/{token}` 웹 페이지 | Universal Links → 앱 열기 | App Links → 앱 열기 |
| 푸시 (P1) | Web Push | APNs (Expo Notifications) | FCM |

> **네이티브(Swift/Kotlin)로 갈 경우**: API 계약이 OpenAPI라서 `swift-openapi-generator`와 `openapi-generator(kotlin)`으로 같은 클라이언트를 생성할 수 있다. 서버를 바꿀 필요가 없다. 도메인 규칙(아이콘 결정 등)은 단순하게 유지해서 각 언어로 옮기는 비용을 낮춘다.
