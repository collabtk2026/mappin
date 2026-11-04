# Youplay 문서 (DOCS)

Youplay 프로젝트의 모든 조사·설계·작업 기록은 이 폴더에 Markdown으로 남긴다.

## 규칙

1. **작업할 때마다 [LOG.md](LOG.md)에 기록한다.** 날짜/시각, 한 일, 결정, 검증 결과, 남은 일. 최신 항목을 위에 적는다(append-only, 지우지 않음).
2. **[OVERVIEW.md](OVERVIEW.md)는 "지금 상태"의 한 장 요약이다.** 기능이나 구조가 바뀌면 같이 고친다.
3. **주제별 내용은 해당 파일에 쌓는다.** 새 주제가 생기면 파일을 만들고 아래 목록에 추가한다.
4. 결정을 내리면 [DECISIONS.md](DECISIONS.md)에 이유와 함께 남긴다.
5. 환경 때문에 못 한 일은 [ENV_PENDING.md](ENV_PENDING.md)에 "막힌 이유 · 필요한 환경 · 실행 절차 · 완료 기준"으로 남기고, 해결하면 상태를 바꾼다.
6. 출처는 각 문서 끝에 링크로 남기고, 사실 확인 수준을 표시한다: [소스 확인] / [공식] / [보도].

## 문서 목록

| 파일 | 내용 |
|---|---|
| [HANDOFF.md](HANDOFF.md) | **인수인계(AI/개발자용)**: 현재 상태, 코드 지도, 브리지 프로토콜, 하지 말 것, 백로그 T-xx, 점검 목록. 이어서 작업한다면 가장 먼저 읽을 것 |
| [LOG.md](LOG.md) | 작업 로그 (시간순) |
| [OVERVIEW.md](OVERVIEW.md) | 전체 개요: 목표, 현재 기능, 구조, 상태, 다음 단계 |
| [ENV_PENDING.md](ENV_PENDING.md) | **환경 제약으로 못 한 일과 다른 환경에서 해결하는 절차** (새 환경에서 가장 먼저 볼 것) |
| [DECISIONS.md](DECISIONS.md) | 설계 결정 기록 |
| [RESEARCH_BRAVE.md](RESEARCH_BRAVE.md) | Brave 소스 분석, 2026 YouTube 정책 변화, 플랫폼/엔진 제약 |
| [CASE_STUDIES.md](CASE_STUDIES.md) | 유사 앱 사례 조사와 구현 방식 비교 |
| [FEATURE_PLAYLIST.md](FEATURE_PLAYLIST.md) | 빠른 저장 → 나중에 분류하는 플레이리스트 기능: UX 연구와 설계 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 앱 구조와 플랫폼별 구현 상세 |
| [TEST_PLAN.md](TEST_PLAN.md) | 자동 테스트와 실기기 체크리스트 |
| [RISKS.md](RISKS.md) | 배포·정책 리스크 |
| [STORE_RELEASE.md](STORE_RELEASE.md) | App Store/Google Play 출시 시 심사·정책 문제 체크, 사례, 대응 전략(이중 트랙), 출시 전 체크리스트 |
