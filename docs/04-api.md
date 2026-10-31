# 04. 서비스 API 개요

정식 계약은 [`api/openapi.yaml`](../api/openapi.yaml) (OpenAPI 3.1, 엔드포인트 64개)에 있다. 이 문서는 그 명세를 사람이 읽기 쉽게 요약한 것이다.
검증 명령: `npx @redocly/cli lint api/openapi.yaml`

## 1. 공통 규약

| 항목 | 규칙 |
|---|---|
| Base URL | `https://api.mappin.app/v1` (버전은 URL 경로에 둔다. 호환이 깨지는 변경은 `/v2`) |
| 인증 | `Authorization: Bearer <JWT>` (15분). `POST /auth/refresh`로 갱신 |
| ID | UUIDv7. **클라이언트가 만들 수 있다** (오프라인 생성, 재시도할 때 중복 방지) |
| 좌표 | WGS84 `{lat, lng}` (bbox는 `west,south,east,north`) |
| 시간 | RFC 3339 UTC |
| 페이지네이션 | `?cursor=&limit=` → `{ items, next_cursor }` |
| 동시성 | 응답 `ETag: "<version>"` → 수정할 때 `If-Match` 필수, 어긋나면 `412` |
| 멱등성 | POST에 `Idempotency-Key` 헤더 → 같은 키로 다시 보내면 같은 응답을 돌려준다 |
| 오류 | RFC 9457 `application/problem+json` + 기계가 읽는 `code` 필드 |
| 레이트 리밋 | `429` + `Retry-After`. 외부 지도 프록시(`/geo/*`)는 사용자별로 따로 한도를 둔다 |

## 2. 리소스별 엔드포인트

| 영역 | 주요 엔드포인트 |
|---|---|
| **Auth** | `POST /auth/signup` · `/auth/login` · `/auth/oauth/{google\|apple\|kakao\|naver}` · `/auth/refresh` · `/auth/logout` · `/auth/password/forgot` · `/auth/password/reset` · `/auth/email/verify` |
| **Me** | `GET/PATCH/DELETE /me` (DELETE = 회원 탈퇴) · `GET /me/sessions` · `DELETE /me/sessions/{id}` · `GET /me/identities` |
| **Places** | `GET /places?bbox&near&category_id&tag&tag_mode&q&scope&sort&deleted` · `POST /places` · `GET/PATCH/DELETE /places/{id}` · `POST /places/{id}/restore` · `GET /places/{id}/timeline` · `PUT/DELETE /places/{id}/tags/{tagId}` · `POST /places/{id}/copy` · `POST /places/batch` |
| **Notes** | `GET/POST /places/{id}/notes` · `PATCH/DELETE /notes/{id}` · `GET /notes/{id}/revisions` |
| **Tags** | `GET /tags?q` · `POST /tags` · `PATCH/DELETE /tags/{id}` · `POST /tags/{id}/merge` |
| **Categories** | `GET /categories?format=tree\|flat` · `POST /categories` · `PATCH/DELETE /categories/{id}` · `POST /categories/reorder` |
| **Icons** | `GET /icons` (공개, CDN 캐시) |
| **Map** | `GET /map/config?platform=` (지역별 공급자와 키) · `GET /map/clusters?bbox&zoom` |
| **Geo** | `GET /geo/search?q&near` · `GET /geo/reverse?lat&lng` · `GET /geo/provider-place/{provider}/{id}` — 응답을 **저장하지 않는** 실시간 프록시 |
| **Sharing** | `GET/POST /shares` · `PATCH/DELETE /shares/{id}` · `POST /shares/{id}/rotate-link` · `POST /shares/{id}/accept` · `GET /shared-with-me` · `GET /public/shares/{token}` (로그인 없이 열람) |
| **Friends** | `GET /friends` · `GET/POST /friends/requests` · `POST /friends/requests/{userId}/{accept\|decline}` · `DELETE /friends/{userId}` |
| **Sync** | `GET /sync/changes?cursor` · `POST /sync/push` |
| **Export** | `POST /export` · `POST /import` · `GET /jobs/{id}` |

## 3. 핵심 흐름

### 3.1 지도 홈 진입
```
GET /map/config?platform=web          → 지역별 공급자(KR=kakao, 기본=maplibre), 공개 키
GET /categories?format=tree           → 필터 패널
GET /tags                             → 태그 칩
(지도 이동이 멈출 때마다)
GET /places?bbox=...&scope=all&limit=500     ← 장소가 적은 계정 (클라이언트에서 클러스터링)
GET /map/clusters?bbox=...&zoom=13           ← 장소가 많은 계정 (서버에서 클러스터링)
```

### 3.2 검색해서 저장
```
GET  /geo/search?q=성수 라멘&near=37.54,127.05   → PlaceCandidate[] (저장하지 않음, already_saved_place_id 표시)
POST /places  { id, title, location, provider_ref:{provider:'kakao', external_id}, category_id,
                new_tags:['데이트'], first_note:{ body:'첫 방문' }, source:'search' }
     → 서버: 공공 주소 API로 address를 채우고, place.created·tag.added·note.added 이벤트를 기록
```

### 3.3 메모 누적과 히스토리
```
POST  /places/{id}/notes { body:'재방문: 웨이팅 30분', noted_at:'2026-11-02T03:00:00Z' }
PATCH /notes/{noteId}  If-Match: "1"  { body:'재방문: 웨이팅 40분' }   → revision 2, 이전 내용은 note_revisions에 보존
GET   /places/{id}/timeline     → [note, event(tag.added), note, event(place.created) ...] 시간 역순
GET   /notes/{noteId}/revisions → 수정 이력
```

### 3.4 공유
```
POST /shares { target_type:'category', target_id, grantee:{type:'user', user_id}, permission:'viewer' }
     → 받는 사람: GET /shared-with-me → POST /shares/{id}/accept → GET /places?scope=shared&share_id=...
POST /shares { target_type:'category', target_id, grantee:{type:'link'} }
     → 응답의 link_url(https://mappin.app/s/<token>)은 이번 한 번만 원문 제공 → 웹 SSR 페이지가 GET /public/shares/{token}
```

### 3.5 모바일 오프라인 동기화
```
앱 시작: GET /sync/changes?cursor=<저장해 둔 커서>  (has_more가 false가 될 때까지 반복)
오프라인 작성: 로컬 outbox에 Mutation{client_mutation_id, entity, op, id, base_version, data} 쌓기
온라인 복귀: POST /sync/push {mutations:[...]} → 항목별 applied | duplicate | conflict | rejected
            conflict → 서버 최신본과 필드 단위로 병합한 뒤 다시 push
```

## 4. 클라이언트 생성 (각 OS에서 접근하는 방법)

| 클라이언트 | 도구 | 산출물 |
|---|---|---|
| Web / React Native | `openapi-typescript` + `openapi-fetch` | `packages/api-client` (타입 안전 fetch, 웹·RN 공용) |
| iOS 네이티브 (선택) | `swift-openapi-generator` | Swift Package |
| Android 네이티브 (선택) | `openapi-generator -g kotlin` (Retrofit/Ktor) | Gradle 모듈 |
| 서버 | Zod 스키마 ↔ OpenAPI 비교 테스트 (CI) | 명세와 구현이 어긋나면 빌드 실패 |

## 5. 버전·호환 정책
- 필드 **추가**는 호환이 유지되는 변경이다. 클라이언트는 모르는 필드를 무시해야 한다.
- 필드 삭제, 의미 변경, enum 값 축소는 `/v2`에서만 한다.
- 모바일 구버전 대응: `/map/config`가 `min_supported_app_version`을 내려준다 (P1에서 추가). 지도 공급자 전환도 이 설정으로 한다.
