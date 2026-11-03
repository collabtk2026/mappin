# BgPlay 작업 규칙

- 이 디렉터리(`bgplay/`)에서 작업할 때는 **항상 작업 내용을 `DOCS/`에 Markdown으로 기록한다.** 규칙은 [DOCS/README.md](DOCS/README.md).
  - 매 작업마다 `DOCS/LOG.md`에 항목 추가 (최신이 위).
  - 상태가 바뀌면 `DOCS/OVERVIEW.md` 갱신.
  - 주제별 내용은 해당 파일(조사, 설계, 결정, 테스트, 리스크)에 기록.
- 문서는 한국어로 쓴다.
- 공용 스크립트/라이브러리를 고치면 테스트를 돌린다:
  - `node bgplay/shared/test/bgplay.test.mjs`
  - `node bgplay/shared/test/library.test.mjs`
