# 09. 저장소 정리 기록

이 저장소(`collabtk2026/mappin`)는 **Mappin(지도 기반 장소 기록 서비스) 전용**입니다.
예전에 다른 프로젝트가 잠시 이 저장소의 브랜치에서 만들어졌다가 각자의 저장소로 옮겨졌습니다. 남은 브랜치는 **삭제 대상**입니다.

## 1. 삭제할 브랜치 (Mappin과 무관)

| 브랜치 | 내용 | 옮겨 간 곳 | 확인 결과 (2026-11-04) |
|---|---|---|---|
| `bgplay-main` | Youplay(구 BgPlay) — YouTube 백그라운드 재생 앱 | [`collabtk2026/youplay`](https://github.com/collabtk2026/youplay) | youplay `main`에 이 브랜치의 마지막 커밋(`e8d8e9c`)까지 그대로 들어 있음, 빠진 파일 없음 |
| `ccr-94ee0a85-9h95lk` | BgPlay 작업 브랜치 (main + README 안내 2줄) | 위와 같음 | 앱 본체는 youplay에 있음. main과의 차이는 README 2줄뿐 |
| `ccr-12767b92-qswouo` | 대학 LMS 조사 보고서 | [`collabtk2026/studylms`](https://github.com/collabtk2026/studylms) | 보고서가 studylms에 있음 (저장소 이름에 맞춘 문장 1줄 차이) |
| `ccr-482bdde4-1bb1la` | Soom — iPhone 호흡 앱 (SwiftUI) | [`collabtk2026/soom-breathing`](https://github.com/collabtk2026/soom-breathing) | soom-breathing `main`과 파일 38개가 완전히 같음 |

네 브랜치 모두 새 저장소에 내용이 보존돼 있어서 **지워도 잃는 것이 없습니다.**

**삭제하지 못한 이유**: 2026-11-04에 AI 작업 세션에서 `git push origin --delete …`를 시도했지만, 세션의 GitHub 연결 정책이 브랜치 삭제를 막아(HTTP 403) 실패했습니다. 권한 문제일 뿐이고, 저장소 소유자가 직접 지우면 됩니다.

## 2. 직접 지우는 방법

### GitHub 웹에서
1. https://github.com/collabtk2026/mappin/branches 를 엽니다 (저장소 → 상단 **Code** 탭 → 브랜치 선택 메뉴 → **View all branches**).
2. 위 표의 브랜치를 찾아 줄 오른쪽의 **휴지통 아이콘(Delete branch)**을 누릅니다. 네 개 모두 반복합니다.
   - 브랜치에 열려 있는 Pull Request가 있으면 먼저 PR을 닫으라는 안내가 나올 수 있습니다.
   - 실수로 지웠다면 같은 화면에 잠시 나타나는 **Restore**로 되살릴 수 있습니다.
3. `main`은 **지우지 마세요.**

### 터미널에서 (권한이 있는 계정)

```bash
git push origin --delete bgplay-main ccr-94ee0a85-9h95lk ccr-12767b92-qswouo ccr-482bdde4-1bb1la
```

지운 뒤 로컬의 원격 브랜치 목록도 정리하려면:

```bash
git fetch --prune origin
```

## 3. 삭제한 뒤
- 이 문서의 표에 "삭제 완료(날짜)"를 적거나, 이 섹션을 지우세요.
- `CLAUDE.md`의 "삭제 대상 브랜치" 항목도 함께 지우세요.

## 4. AI·개발자 작업 규칙
- 위 브랜치들은 **읽지도, 이어서 작업하지도, main에 병합하지도 마세요.** 해당 프로젝트 작업은 옮겨 간 저장소에서 합니다.
- Mappin 작업은 `main`(또는 main에서 새로 만든 브랜치)에서만 합니다.
- 브랜치 목록에 위 이름이 아직 보인다면, 삭제가 안 된 것일 뿐 살아 있는 작업이 아닙니다.
