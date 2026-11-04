# Youplay 작업 규칙

> 공통 안내는 [AGENTS.md](AGENTS.md), 인수인계 문서는 [DOCS/HANDOFF.md](DOCS/HANDOFF.md)(현재 상태, 코드 지도, 백로그, 점검 목록)에 있다. 작업을 시작하기 전에 HANDOFF부터 읽는다.

- 이 저장소에서 작업할 때는 **항상 작업 내용을 `DOCS/`에 Markdown으로 기록한다.** 규칙은 [DOCS/README.md](DOCS/README.md).
  - 매 작업마다 `DOCS/LOG.md`에 항목 추가 (최신이 위).
  - 상태가 바뀌면 `DOCS/OVERVIEW.md` 갱신.
  - 주제별 내용은 해당 파일(조사, 설계, 결정, 테스트, 리스크)에 기록.
- **새 환경(로컬 PC, Mac, 네트워크가 열린 세션)에서 시작하면 `DOCS/ENV_PENDING.md`부터 본다.** 그 환경에서 풀 수 있는 항목을 처리하고 상태를 갱신한다.
- 환경 때문에 못 한 일이 새로 생기면 `DOCS/ENV_PENDING.md`에 항목을 추가한다.
- 문서는 한국어로 쓴다.
- 공용 스크립트/라이브러리를 고치면 테스트를 돌린다:
  - `node shared/test/bgplay.test.mjs`
  - `node shared/test/library.test.mjs`
