# 배포·정책 리스크

> 스토어 출시 관점의 상세 검토(조항별 체크, 사례, 대응 전략, 체크리스트)는 [STORE_RELEASE.md](STORE_RELEASE.md)에 있다.

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md)

## 1. 배포와 정책 리스크

- **YouTube 약관**: 백그라운드 재생은 Premium 기능이다. 약관은 서비스의 기능 제한을 우회하거나 수정하는 것을 금지한다. 비 Premium 계정에서 위장 레이어를 쓰는 것은 약관과 충돌한다.
- **Google Play**: 제3자 서비스 약관 위반을 돕는 앱은 정책 위반이다. 실제로 YouTube 백그라운드 재생 앱이 다수 삭제됐다. → **스토어 배포 비권장, 개인 사이드로드(APK)용**이다.
- **App Store**: 지침 5.2.3(제3자 미디어)과 5.2.2 위반 소지가 있다. → Xcode 개인 서명(무료 계정은 7일마다 재설치)이나 TestFlight 내부 테스트 정도로 쓴다.
- Brave가 버티는 이유는 "범용 브라우저의 기능"이라는 포지셔닝 덕분이다. 스토어 배포를 원하면 Brave처럼 **범용 브라우저**로 만들고 Premium 사용자를 대상으로 해야 정책 리스크가 줄어든다(단, 그래도 보장은 없다).
- 광고 차단, 다운로드, 스트림 추출은 넣지 않았다.

## 2. 사례 조사에서 확인한 추가 리스크 (2026-11-03)

자세한 내용은 [CASE_STUDIES.md](CASE_STUDIES.md)에 있다.

| 리스크 | 사례 | 대응 |
|---|---|---|
| App Store 사후 삭제 | ProTube(2017, YouTube 요청), Musi(2024 삭제, 2026-03 법원이 Apple의 "with or without cause" 삭제 권한 인정) | iOS는 Xcode 개인 서명이나 TestFlight 같은 비공개 배포를 전제로 한다 |
| 상표 | Vanced(2022 C&D: 로고·명칭), th-ch/youtube-music → Pear Desktop 개명 | 앱 이름과 아이콘에 YouTube 상표를 쓰지 않는다(현재 "Youplay", `io.github.bgplay`) |
| YouTube API 정책 | IFrame Player API 약관이 백그라운드 재생을 명시적으로 금지. Play 거절 사례 | IFrame API는 쓰지 않는다(실제 웹사이트를 띄움). 그래도 YouTube 약관 문제는 남는다 |
| 원격 스크립트 공급망 | YTPro의 `@latest` 원격 로딩, SmartTube 서명키 탈취(2025-12) | 스크립트는 앱에 포함한다([DECISIONS D-04](DECISIONS.md)) |
| YouTube 페이지 변경 | WebView 래퍼 공통 약점 | DOM 셀렉터보다 Media Session 핸들러를 우선 쓴다. 공용 스크립트 하나만 고치면 되게 한다 |
| 백그라운드 다음 곡 진행 실패 | Brave "YT Music 백그라운드 다음 곡 안 넘어감" 보고. FixYTBackground는 이 때문에 pre-advance 사용 | 실기기 P9로 확인한 뒤 보강한다([FEATURE_PLAYLIST §7](FEATURE_PLAYLIST.md)) |
