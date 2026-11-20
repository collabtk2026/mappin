# Mappin 인수인계 (클라우드 세션 → 로컬 컴퓨터)

> 작성일 2026-11-20 · 기준 커밋은 압축 파일 안의 `git log -1`로 확인 · 저장소 `collabtk2026/mappin` (`main`)
> 이 문서는 클라우드 세션에서 하던 작업을 **사용자 컴퓨터의 로컬 폴더**에서 이어가기 위한 안내입니다.
> 사람과 AI(Claude Code 등) 모두 이 문서 → [`CLAUDE.md`](CLAUDE.md) → [`docs/07-p0-report.md`](docs/07-p0-report.md) 순서로 읽으면 됩니다.

## 1. 한 줄 요약
지도 기반 장소 기록·공유 서비스 **Mappin**의 기획, 지도 공급자 조사, API·DB 설계, **P0 웹 MVP(API 서버 + 웹)**, 운영 설치(Docker), **실제 지도 매핑 검증**까지 끝났습니다.
다음 단계는 **사용자 컴퓨터에서 실제 화면을 직접 확인**하고, 백로그(§8)를 이어가는 것입니다.

## 2. 압축 파일 구성 (`mappin-handoff-*.zip`)

```
mappin/                       ← 이 폴더를 그대로 작업 폴더로 씁니다
├─ .git/                      전체 커밋 이력 (원격 origin = github.com/collabtk2026/mappin)
├─ HANDOFF.md                 이 문서
├─ CLAUDE.md / AGENTS.md      AI 작업 규칙 (먼저 읽기)
├─ apps/server  apps/web  packages/  api/  db/  deploy/  scripts/  docs/
├─ apps/web/public/demo-basemap/   오프라인 데모 지도 데이터 (git 제외 파일, 편의상 포함)
└─ handoff-data/
   ├─ mappin-dev.sql.gz       클라우드 개발 DB 덤프 (선택, 아래 §5)
   └─ README.md
```

- `node_modules`, `.next`(빌드 결과), `.env` 같은 비밀값 파일은 **넣지 않았습니다**. 설치 명령으로 다시 만듭니다.
- 이 저장소의 원격 브랜치 중 Mappin과 무관한 것(`bgplay-main`, `ccr-*` 4개)은 압축 파일에 포함하지 않았습니다 ([docs/09](docs/09-repo-housekeeping.md)).

## 3. 로컬 폴더에 풀고 권한 주기

1. **압축 풀 위치**: 경로에 숨김 폴더(`.`으로 시작)가 없고 가능하면 **영문 경로**를 권장합니다.
   - 예: Windows `C:\dev\mappin`, macOS `~/dev/mappin`
   - 앞서 `지도매핑_프로토타입` 폴더가 클라우드 세션에 열리지 않았던 원인 후보 중 하나가 경로라서, 영문 경로로 피해 가는 게 안전합니다.
2. 압축을 풀면 `mappin` 폴더가 생깁니다. 그 **`mappin` 폴더 자체**를 작업 폴더로 지정하세요 (상위 폴더 아님).
3. **Claude 앱 → 설정 → Claude Code → Remote Control**에서 그 폴더를 추가합니다. 추가한 뒤 앱을 한 번 완전히 재시작하세요.
4. 클라우드 세션에서 이어가려면 그 세션에 "폴더 지정했어"라고 알려주세요. 로컬 Claude Code에서 바로 이어가도 됩니다 (이 문서와 `CLAUDE.md`를 읽게 하세요).

## 4. 로컬 실행 준비물

| 항목 | Windows | macOS / Linux |
|---|---|---|
| Git | Git for Windows (Git Bash 포함) | 기본 또는 패키지 관리자 |
| Node.js | **22.x** (nodejs.org LTS) | 22.x |
| pnpm | `corepack enable` (Node에 포함) | 동일 |
| DB | **Docker Desktop** (PostGIS 컨테이너) | Docker 또는 Postgres 16 + PostGIS 3 |
| 브라우저 검증(선택) | `npx playwright install chromium` | 동일 |

> Windows에서는 **WSL2(Ubuntu)** 안에서 작업하면 셸 스크립트(`scripts/*.sh`, `deploy/*.sh`)까지 그대로 동작해 가장 편합니다. PowerShell에서도 아래 `pnpm` 명령은 그대로 동작합니다.
> 줄바꿈: 저장소의 `.gitattributes`가 `*.sh`를 LF로 고정합니다. 셸 스크립트를 메모장 등으로 CRLF 저장하지 마세요.

## 5. 실행 순서

`mappin` 폴더에서:

```bash
docker compose up -d db
```

```bash
cp .env.example .env
```
(PowerShell: `Copy-Item .env.example .env`)

```bash
corepack enable && pnpm install && pnpm db:migrate
```

```bash
pnpm dev
```

브라우저에서 http://localhost:3000 → 회원가입 → 지도를 길게 누르거나(우클릭) `+`로 장소 저장.
`.env`의 기본값(`MAP_STYLE=openfreemap`)이면 **실제 지도**가 나옵니다. 사용자 컴퓨터는 인터넷이 열려 있으니 프록시 설정은 필요 없습니다.

**(선택) 클라우드에서 쓰던 테스트 데이터 복원** — 검증 중 만든 테스트 계정 24개와 장소 151곳이 들어 있습니다. 비어 있는 DB에서 시작해도 되므로 필수는 아닙니다.

```bash
gunzip -c handoff-data/mappin-dev.sql.gz | docker compose exec -T db psql -U postgres -d mappin
```

(마이그레이션을 먼저 돌렸다면 충돌 메시지가 날 수 있습니다. 그때는 `docker compose down -v && docker compose up -d db`로 DB를 비운 뒤 위 명령을 실행하고, API를 시작하세요.)
테스트 계정 비밀번호는 모두 `correct-horse-1`입니다 (예: `handoff-data/README.md`의 계정).

## 6. 검증 명령 (클라우드에서의 마지막 결과)

| 명령 | 내용 | 마지막 결과 |
|---|---|---|
| `pnpm typecheck` | 전체 타입 검사 | 통과 |
| `pnpm --filter @mappin/server test` | 서버 통합·단위 테스트 (`TEST_DATABASE_URL` 필요, 예: `postgres://postgres:postgres@localhost:5432/mappin_test` — DB를 먼저 만들 것) | **26/26** |
| `pnpm lint:api` | OpenAPI 명세 검사 | 통과 |
| `pnpm e2e` | 브라우저 E2E 20개 (서버를 띄운 상태, `pnpm --filter @mappin/web build` 후 `scripts/serve-local.sh` 또는 `pnpm dev`) | **20/20** (실제 지도) |
| `pnpm verify:map` | 실제 지도 매핑 검증 10개: 핀 위치·저장 좌표·주소·검색·한글 라벨·다크 | **10/10** |

> E2E·지도 검증은 **빌드된 웹**(`pnpm --filter @mappin/web build` → `next start`) 기준으로 맞춰져 있습니다. `pnpm dev`(개발 모드)에서도 대부분 동작하지만, 첫 페이지 컴파일이 느려 시간 초과가 날 수 있습니다.

## 7. 지금 상태 요약

**완료**
- 기획·조사 문서 01~09, 디자인 시스템("조용한 지도, 선명한 핀")
- API 57개 구현 (명세 65개 중 P1 8개 제외): 인증(이메일, 카카오·구글 서버 검증), 장소·메모(수정 이력)·태그(붙인 시각)·카테고리(계층)·공유(이메일·링크·레이어)·내보내기
- 웹: 데스크톱 패널 / 모바일 바텀시트, 라이트·다크, 한국어 라벨
- 운영 설치: `deploy/` (Docker Compose + Caddy 자동 HTTPS), 백업·복원 확인 → [docs/08](docs/08-self-hosting.md)
- 실제 지도 검증 → [docs/07 §7](docs/07-p0-report.md)

**미검증 / 미완**
- Kakao 지도·검색: 키가 없어 실제 SDK로 확인하지 못함 (`KAKAO_JS_KEY`, `KAKAO_REST_KEY`)
- 소셜 로그인 버튼(클라이언트) 없음 — 서버 검증만 있음
- HTTPS 인증서 자동 발급: 실제 도메인으로 확인하지 못함

## 8. 백로그 (추천 순서)

1. **사용자 컴퓨터에서 실제 화면 확인** (이번 이전의 목적): 데스크톱·모바일 브라우저, 다크 모드. 이상한 점을 목록으로 정리
2. **다크 모드 지도 라벨 대비**: OpenFreeMap `dark`가 거의 검정이라 라벨이 잘 안 보임 → `apps/web/src/map/maplibre.ts`에서 다크일 때 라벨 색 덮어쓰기
3. **삭제 대상 브랜치 4개 수동 삭제** (권한 문제로 AI가 못 함) → [docs/09 §2](docs/09-repo-housekeeping.md). 지운 뒤 `CLAUDE.md`·docs/09 표 정리
4. **카카오 키 연동 검증**: 카카오 개발자 콘솔에서 앱 생성 → 키를 `.env`에 넣고 국내 지도/검색 확인
5. **운영 배포**: 개인 서버에 `DOMAIN=… ./deploy/setup.sh` ([docs/08](docs/08-self-hosting.md))
6. **P1**: 모바일 앱(Expo), 친구, 오프라인 동기화, 사진 첨부, 가져오기 ([docs/05](docs/05-roadmap-and-compliance.md))
7. 공개 서비스 전 법무: 위치기반서비스사업 신고, 약관·개인정보처리방침

## 9. 알아 둘 것

- **클라우드 환경 `mappin`**: 지도 타일(`tiles.openfreemap.org`)과 지오코딩(`nominatim.openstreetmap.org`)을 허용한 개인 클라우드 환경을 만들어 두었습니다. 클라우드에서 다시 작업할 때 이 환경을 고르면 실제 지도로 검증할 수 있습니다. 그 환경의 설치 스크립트(PostGIS + `pnpm install`)는 새 세션에서 아직 실행해 보지 않았습니다.
- **서버의 외부 호출은 프록시 환경변수를 따르지 않습니다**. 사내망처럼 HTTP 프록시가 필요한 곳에서만 `NODE_USE_ENV_PROXY=1`을 붙이세요. 일반 가정·사무실 인터넷에서는 필요 없습니다.
- **Nominatim(OSM 검색) 사용 정책**: 초당 1회 수준만 허용됩니다. 개발·시연에는 충분하지만 실사용은 카카오 키를 권장합니다.
- **요청 횟수 제한**: 로그인·가입 20회/분, 검색 60회/분, 일반 300회/분 (IP 기준). 개발 중 막히면 `.env`에 `RATE_LIMIT=off`.
- **비밀값**: `.env`는 커밋하지 마세요 (`.gitignore`에 있음). 운영 서버의 `deploy/.env`는 따로 백업.
- **GitHub push**: 로컬에서 커밋한 뒤 `git push origin main`. 인증은 본인 GitHub 계정(Git Credential Manager 등)을 씁니다.

## 10. 다음 AI 세션에 줄 첫 지시 (복사해서 쓰기)

```
HANDOFF.md와 CLAUDE.md를 먼저 읽고, §5대로 로컬에서 실행한 뒤 §6의 검증(typecheck, 서버 테스트, verify:map)을 돌려 결과를 알려줘.
그다음 §8 백로그 1번(실제 화면 확인)과 2번(다크 모드 라벨 대비)을 진행해.
```
