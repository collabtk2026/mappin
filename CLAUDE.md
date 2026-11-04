# Mappin — AI 작업 안내

이 저장소는 **Mappin**(저장한 장소와 메모·태그·카테고리 기록을 지도 위에서 보고 지인과 공유하는 서비스, 웹 우선 → iOS/Android) 전용입니다.

## ⚠️ 삭제 대상 브랜치 — 작업하지 말 것
아래 원격 브랜치는 **Mappin과 무관한 다른 프로젝트의 흔적**입니다. 이미 각자의 저장소로 옮겨졌고, 권한 문제로 아직 삭제하지 못했을 뿐입니다.
읽거나 이어서 작업하거나 main에 병합하지 마세요. 자세한 내용과 삭제 방법은 [docs/09-repo-housekeeping.md](docs/09-repo-housekeeping.md)에 있습니다.

| 브랜치 | 다른 프로젝트 | 옮겨 간 저장소 |
|---|---|---|
| `bgplay-main`, `ccr-94ee0a85-9h95lk` | Youplay (구 BgPlay) | `collabtk2026/youplay` |
| `ccr-12767b92-qswouo` | 대학 LMS 조사 | `collabtk2026/studylms` |
| `ccr-482bdde4-1bb1la` | Soom 호흡 앱 | `collabtk2026/soom-breathing` |

## 구조
- `apps/server` — Fastify + PostgreSQL 16/PostGIS API (`postgres`로 SQL 직접 작성, ORM 없음)
- `apps/web` — Next.js 15 웹. 지도 어댑터는 `apps/web/src/map/` (MapLibre 검증됨, Kakao는 키가 없어 미검증)
- `packages/api-client` — `api/openapi.yaml`에서 생성한 타입 + fetch 클라이언트 (`pnpm gen:api`로 재생성)
- `packages/map-core` — 지도 공급자 독립 인터페이스
- `db/migrations` — 순서대로 적용되는 SQL (API 시작 시 자동 적용)
- `deploy/` — 운영 설치 (Docker Compose + Caddy). `docs/08-self-hosting.md`
- `docs/` — 기획(01)·지도 조사(02)·아키텍처(03)·API(04)·로드맵(05)·디자인(06)·P0 결과(07)·설치(08)·저장소 정리(09)

## 규칙
- **API는 계약 우선**: `api/openapi.yaml`을 먼저 고치고, `pnpm lint:api` → `pnpm gen:api`를 실행합니다. `x-status: planned`(요약에 [P1 예정])는 아직 구현되지 않은 것입니다.
- **DB 변경은 새 마이그레이션 파일로** (`db/migrations/000N_*.sql`). 이미 적용된 파일은 고치지 않습니다.
- 사용자 데이터는 공급자와 무관하게(WGS84) 저장하고, 외부 지도사의 응답은 저장하지 않습니다 (docs/02 §4).
- UI는 docs/06 디자인 토큰(`apps/web/src/app/globals.css`)을 따릅니다.
- 사용자에게 보이는 문구는 해요체입니다.

## 검증
- 서버: `pnpm --filter @mappin/server test` (`TEST_DATABASE_URL`에 PostGIS DB 필요)
- 타입: `pnpm typecheck`
- 브라우저 E2E: 서버를 띄운 뒤 `pnpm e2e` (네트워크가 막힌 환경에서는 `pnpm demo:basemap` + `MAP_STYLE=demo`)
- 로컬 실행: `scripts/serve-local.sh` (빌드된 웹 + API)
