# AGENTS.md — BgPlay (AI 에이전트 공통 안내)

이 저장소(BgPlay)는 YouTube/YouTube Music을 앱 안에서 재생하는 프로젝트다. 백그라운드 재생, 그리고 "빠른 저장 → 나중에 분류" 보관함을 갖춘 Android/iOS 앱이다.

**먼저 읽을 것: [DOCS/HANDOFF.md](DOCS/HANDOFF.md)**. 현재 상태, 코드 지도, 하지 말 것, 백로그(T-xx), 점검 목록이 있다.

필수 규칙(요약, 상세는 HANDOFF §0·§4·§8):
- 사용자와 문서는 **한국어**로 한다.
- 작업할 때마다 `DOCS/LOG.md`에 기록한다(최신이 위). 상태가 바뀌면 `DOCS/OVERVIEW.md`와 `DOCS/HANDOFF.md`를 갱신한다.
- 새 환경(빌드/기기/네트워크 가능)에서는 `DOCS/ENV_PENDING.md`부터 처리한다.
- Premium 확인 우회나 스토어 심사 회피 기법은 구현하지 않는다(DECISIONS D-03, D-12).
- `shared/`를 고치면 다음 두 테스트를 돌린다:
  - `node shared/test/bgplay.test.mjs`
  - `node shared/test/library.test.mjs`
- 검증하지 못한 것은 미검증으로 기록한다.
