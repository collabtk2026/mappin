# 08. 개별 서버에 설치하기 (Self-hosting)

> 검증: 이 구성(`deploy/docker-compose.yml`, Caddy `DOMAIN=:80` 모드)으로 띄운 스택에서 브라우저 E2E 20/20 통과, 백업 → 전체 복원 확인 (2026-11-02). Let's Encrypt 발급은 실제 도메인이 있어야 해서 확인하지 못했습니다.

Docker Compose 하나로 **DB(PostGIS) + API + 웹 + HTTPS 프록시(Caddy)**를 띄웁니다.
Caddy가 Let's Encrypt 인증서를 자동으로 발급하고 갱신합니다.

```
인터넷 ──443/80──▶ Caddy ──/v1/*──▶ api (Fastify, 8080) ──▶ db (PostGIS, 외부 비공개)
                         └──그 외──▶ web (Next.js, 3000)
```

## 1. 준비물

| 항목 | 권장 |
|---|---|
| OS | Ubuntu 22.04 / 24.04 LTS (Debian, Rocky 등 Docker가 되는 Linux면 무관) |
| 사양 | 최소 2 vCPU · 2 GB RAM · 20 GB 디스크. 이미지를 빌드할 때 메모리를 가장 많이 씁니다. 1 GB 서버라면 swap 2 GB를 추가하세요 |
| 소프트웨어 | Docker Engine 24 이상 + Docker Compose v2, git |
| 도메인 | 예: `map.example.com`. **휴대폰에서 '내 위치'를 쓰려면 HTTPS가 필수**라서 도메인을 권장합니다 |
| 방화벽 | 80, 443(TCP·UDP) 인바운드 허용. 5432(DB)는 열지 않습니다 |

## 2. 설치 순서

### ① Docker 설치 (Ubuntu 기준, 이미 있으면 건너뛰기)

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker $USER && newgrp docker
```

### ② 도메인 연결
DNS 관리 화면에서 `A 레코드: map.example.com → 서버 공인 IP`를 추가합니다. 반영될 때까지 몇 분에서 몇 시간 걸릴 수 있습니다.
확인: `ping map.example.com`을 했을 때 서버 IP가 나오면 됩니다.

### ③ 방화벽 열기 (ufw 사용 시)

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
```

클라우드 서버(AWS, NCP 등)라면 **보안 그룹**에서도 80과 443을 열어 주세요.

### ④ 코드 받기
저장소가 비공개라면 GitHub 개인 액세스 토큰이나 Deploy Key가 필요합니다.

```bash
git clone https://github.com/collabtk2026/mappin.git && cd mappin
```

### ⑤ 설치 실행 (도메인 사용)

```bash
DOMAIN=map.example.com ./deploy/setup.sh
```

- `deploy/.env`를 만들고, DB 비밀번호와 JWT 비밀키를 무작위로 생성합니다. **이 파일은 꼭 따로 백업해 두세요.**
- 이미지를 빌드하고 컨테이너를 실행합니다. 처음에는 5~10분 걸립니다.
- DB 마이그레이션은 API가 시작될 때 자동으로 적용됩니다.
- 끝나면 `✓ 실행 중 → https://map.example.com`이 나옵니다. 휴대폰에서 이 주소로 접속해 회원가입하면 됩니다.

### ⑤-1. 도메인 없이 IP로 먼저 시험해 보기

```bash
DOMAIN=:80 PUBLIC_WEB_URL=http://서버IP COOKIE_SECURE=false ./deploy/setup.sh
```

- HTTP로만 동작합니다. 휴대폰 브라우저에서는 **'내 위치' 버튼이 막히고**(HTTPS 전용 기능), 통신도 암호화되지 않습니다. 시험용으로만 쓰세요.
- 나중에 도메인을 붙일 때는 `deploy/.env`에서 `DOMAIN`, `PUBLIC_WEB_URL=https://…`, `COOKIE_SECURE=true`로 바꾸고 `./deploy/setup.sh`를 다시 실행하면 됩니다.

## 3. 설정 (`deploy/.env`)

| 변수 | 설명 |
|---|---|
| `DOMAIN` | 서비스 도메인. `:80`이면 HTTP 시험 모드 |
| `PUBLIC_WEB_URL` | 공유 링크와 메일에 들어가는 주소 (예: `https://map.example.com`) |
| `POSTGRES_PASSWORD`, `JWT_SECRET` | setup.sh가 자동으로 생성합니다. **JWT_SECRET을 바꾸면 모든 사용자가 로그아웃됩니다** |
| `COOKIE_SECURE` | HTTPS면 `true`(기본). HTTP 시험에서만 `false` |
| `SMTP_URL`, `MAIL_FROM` | 비밀번호 재설정·이메일 인증 메일. 비워 두면 메일 내용이 API 로그에만 찍힙니다 (`docker compose logs api`). 예: `smtps://아이디:앱비밀번호@smtp.gmail.com:465` |
| `KAKAO_JS_KEY`, `KAKAO_REST_KEY` | 넣으면 국내 지도와 장소 검색이 카카오로 바뀝니다. 카카오 개발자 콘솔의 플랫폼 → Web에 `https://map.example.com`을 등록해야 합니다 |
| `HTTP_PORT`, `HTTPS_PORT` | 80과 443을 이미 다른 프로그램이 쓰고 있을 때 (§6 참고) |

설정을 바꾼 뒤에는 `./deploy/setup.sh`를 다시 실행하면 반영됩니다.

## 4. 운영

`deploy` 폴더에서 실행합니다.

| 작업 | 명령 |
|---|---|
| 상태 확인 | `docker compose ps` |
| 로그 보기 | `docker compose logs -f api` (또는 `web`, `caddy`, `db`) |
| 재시작 | `docker compose restart api` |
| 중지 | `docker compose down` (데이터는 볼륨에 남습니다) |
| **업데이트** | 저장소 루트에서 `git pull && ./deploy/setup.sh`. 새 마이그레이션은 자동으로 적용됩니다 |
| DB 접속 | `docker compose exec db psql -U mappin -d mappin` |

### 백업 (꼭 설정하세요)

```bash
./deploy/backup.sh
```

매일 새벽 3시 30분에 자동 백업하고 14일치를 보관하려면 `crontab -e`에 아래 한 줄을 추가합니다.

```
30 3 * * * /home/ubuntu/mappin/deploy/backup.sh >> /var/log/mappin-backup.log 2>&1
```

복원 (현재 DB를 백업 시점으로 되돌립니다. `deploy` 폴더에서 실행):

```bash
docker compose stop api
```

```bash
docker compose exec -T db psql -U mappin -d postgres -c "DROP DATABASE mappin" -c "CREATE DATABASE mappin"
```

```bash
gunzip -c backups/mappin-20261102-0330.sql.gz | docker compose exec -T db psql -q -U mappin -d mappin
```

```bash
docker compose start api
```

`deploy/backups/` 폴더는 다른 서버나 오브젝트 스토리지에도 복사해 두는 것을 권장합니다.

## 5. 문제 해결

| 증상 | 확인 |
|---|---|
| HTTPS 인증서가 발급되지 않음 | `docker compose logs caddy`를 확인하세요. 대부분 DNS가 아직 반영되지 않았거나 80/443이 막힌 경우입니다 |
| 로그인했는데 새로고침하면 풀림 | HTTP로 접속 중인데 `COOKIE_SECURE=true`인 경우입니다. HTTPS로 접속하거나 시험 모드 설정을 확인하세요 |
| 지도가 회색으로만 보임 | 서버나 휴대폰에서 `tiles.openfreemap.org`에 접속이 막혔을 수 있습니다. 사내망이라면 방화벽을 확인하세요 |
| '새 장소 찾기' 검색 실패 | 키가 없으면 OpenStreetMap(Nominatim) 공개 서버를 씁니다. 사용 정책상 초당 1회 수준만 허용되므로 실사용은 카카오 키를 권장합니다 |
| 메모리 부족으로 빌드 실패 | swap을 추가하세요: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| "요청이 너무 많아요" (429) | 같은 IP 기준으로 로그인 관련은 분당 20회, 검색은 60회, 일반 API는 300회로 제한합니다 |

## 6. 이미 nginx 같은 웹서버가 80/443을 쓰고 있다면

Caddy를 다른 포트로 띄우고 기존 nginx가 그 포트로 넘기도록 합니다.

1. `deploy/.env`에 다음을 넣습니다: `DOMAIN=:80`, `HTTP_PORT=8081`, `PUBLIC_WEB_URL=https://map.example.com`, `COOKIE_SECURE=true`
2. nginx에 사이트를 추가합니다. 인증서는 기존 방식(certbot 등)을 그대로 씁니다.

```nginx
server {
    listen 443 ssl http2;
    server_name map.example.com;
    # ssl_certificate ... (기존 설정)
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## 7. 공개 서비스로 열기 전에 확인할 것

- [ ] HTTPS 접속, `COOKIE_SECURE=true`
- [ ] `deploy/.env` 백업, 자동 DB 백업(cron)과 외부 보관
- [ ] SMTP 설정 (비밀번호 재설정 메일)
- [ ] 서버 OS 자동 보안 업데이트 (`sudo apt install unattended-upgrades`)
- [ ] 지인끼리 쓰는 수준을 넘어 일반에 공개한다면: **위치기반서비스사업 신고**, 이용약관·개인정보처리방침 게시 ([05 문서](05-roadmap-and-compliance.md) 법규 체크리스트)
