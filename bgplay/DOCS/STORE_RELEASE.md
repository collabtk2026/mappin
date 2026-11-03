# 스토어 출시 검토: App Store · Google Play 심사/정책 문제와 대응 방안

> 문서 목록: [README](README.md) · [작업 로그](LOG.md) · [전체 개요](OVERVIEW.md) · 관련: [RISKS.md](RISKS.md), [CASE_STUDIES.md](CASE_STUDIES.md)

작성일: 2026-11-03 · 근거 표기: **[공식]** 정책 원문 확인 · **[공식-요약]** 공식 문서지만 검색 요약으로만 확인 · **[보도]** 뉴스/포럼 · **[추정]** 근거가 약함, 확인 필요

> ⚠️ 이 문서는 정책 해석이지 법률 자문이 아니다. 실제 출시 전에는 최신 정책 원문과 YouTube 약관을 다시 확인한다. 이 환경에서 `support.google.com`(Google Play 정책 원문)이 막혀 있어 Play 정책 일부는 원문을 못 읽었다([ENV_PENDING E-07](ENV_PENDING.md)).

---

## 0. 결론 먼저

| 질문 | 답 |
|---|---|
| **지금 형태 그대로 출시할 수 있나?** | **거의 확실히 안 된다.** 지금 형태란 YouTube 전용 WebView 래퍼에 백그라운드 재생 위장이 들어간 것이다. Apple은 5.2.2/5.2.3(제3자 서비스 약관, YouTube를 명시)과 4.2(웹사이트 재포장)에 걸린다. Google Play는 YouTube 백그라운드 재생으로 거절된 사례가 반복된다(Device and Network Abuse). 통과하더라도 YouTube가 신고하면 사후 삭제된다(ProTube 2017, Musi 2024). |
| **심사를 "피해 가는" 방법이 있나?** | 심사 때 기능을 숨기거나 출시 후 원격으로 켜는 방법은 **하면 안 된다.** 이는 Apple 2.5.19, 2.3.1 위반이고 **개발자 계정 전체가 해지**된다. 이 문서는 그런 방법을 다루지 않는다(§4). |
| **정당하게 스토어에 낼 수 있는 길은?** | ① **보관함 우선 앱(S1)**: 빠른 저장·분류는 우리 앱, 재생은 공식 YouTube/YT Music 앱에 넘긴다. 심사 위험이 가장 낮고, 이번에 만든 핵심 기능이 그대로 산다. ② **범용 브라우저(S2, Brave형)**: 위험이 중간이고 개발량이 크다. ③ **스토어 밖 배포(S4)**: 개인용이라면 이것이 현실적이다. |
| **추천** | **이중 트랙**이다. 개인용 풀 기능은 스토어 밖(사이드로드/TestFlight 내부)으로 쓰고, 스토어에는 백그라운드 위장이 없는 **"BgPlay Library"(S1) 빌드**를 낸다. 코드는 빌드 변형(flavor/scheme)으로 나눈다(§5). |

---

## 1. 문제가 될 수 있는 항목 체크리스트

### 1.1 Apple App Store

| # | 조항 [공식 원문 확인 2026-11-03] | 요지 | 우리 앱에서 걸리는 부분 | 위험 | 대응 |
|---|---|---|---|---|---|
| A1 | **5.2.2 Third-Party Sites/Services** | "If your app uses, accesses, monetizes access to, or displays content from a third-party service, ensure that you are specifically permitted to do so under the service's terms of use. Authorization must be provided upon request." | 앱 전체가 YouTube 콘텐츠를 표시함. 백그라운드 재생은 YouTube 약관상 Premium 기능 | **매우 높음** | S1(공식 앱으로 재생 위임) 또는 S2(범용 브라우저). YouTube 허가는 현실적으로 얻기 어렵다 |
| A2 | **5.2.3 Audio/Video Downloading** | "…the ability to save, convert, or download media from third-party sources (such as Apple Music, **YouTube**, …) without explicit authorization… **Streaming of audio/video content may also violate Terms of Use**…" | 다운로드 기능은 없음(유지할 것). 다만 "스트리밍도 약관 위반일 수 있다"는 문구가 백그라운드 재생에 적용될 수 있음 | 높음 | 오프라인 저장이나 스트림 추출은 절대 넣지 않음. Brave도 2026-06 Apple 요구로 Playlist 오프라인 재생을 제거함(§2) |
| A3 | **4.2 Minimum Functionality / 4.2.2** | "…elevate it beyond a repackaged website…", "…shouldn't primarily be… web clippings, content aggregators, or a collection of links." | m.youtube.com을 감싼 형태 | 높음 | 보관함, 분류, 큐, 잠금화면 같은 네이티브 기능을 앞세움. S1은 이 문제가 없음 |
| A4 | **5.2.1 Intellectual Property**, 4.1 Copycats | 허가 없는 상표, 오해를 부르는 이름·메타데이터 금지 | 앱 이름, 아이콘, 스크린샷, 키워드에 "YouTube"나 빨간 재생 버튼 | 중간 | "BgPlay" 이름 유지. 스토어 설명에서 YouTube는 "~와 함께 사용" 수준으로만 언급하고 로고는 쓰지 않음. 아이콘은 YouTube와 다르게(현재 아이콘의 빨간 삼각형은 바꾸는 것을 권장) |
| A5 | **2.5.4 Background services** | "Multitasking apps may only use background services for their intended purposes: VoIP, audio playback…" | `UIBackgroundModes: audio` | 낮음~중간 | 실제 오디오 재생에만 쓰면 조항 자체는 충족. 단 A1·A2와 함께 묶여 판단됨 |
| A6 | **2.5.19 Hidden features**, **2.3.1** | 숨겨진·휴면·문서화 안 된 기능 금지("termination of your developer account"). 모든 기능을 심사 노트에 구체적으로 적을 것 | (해당 없음, 해서는 안 됨) | — | 스토어 빌드에 없는 기능은 코드에서도 빼고, 원격 플래그로 켜지 않음 |
| A7 | **2.5.2** Downloading code | 기능을 바꾸는 코드를 내려받아 실행 금지 | `bgplay.js`는 번들에 포함(D-04). 원격 스크립트 없음 | 낮음 | 유지. YTPro식 `@latest` 원격 로딩은 금지 |
| A8 | **2.5.6** WebKit | 웹 탐색은 WebKit 필수. EU·일본은 대체 엔진 entitlement 가능 | WKWebView 사용 | 없음 | 유지 |
| A9 | **5.1.1** Privacy | 개인정보처리방침 링크(메타데이터와 앱 내), 수집·보관·삭제 설명 | 서버 없음, 로컬 저장만 함. 처리방침 페이지가 없음 | 낮음(준비만 하면 됨) | 처리방침 작성, Privacy Nutrition Label "데이터 수집 안 함". **Privacy Manifest**(`PrivacyInfo.xcprivacy`)에 UserDefaults 사용 사유 선언 [공식-요약: required reason API] |
| A10 | YouTube의 사후 신고 | 심사를 통과해도 YouTube가 Apple에 신고하면 삭제됨 | 전체 | **높음** | ProTube, Musi 사례(§2). Apple은 "with or without cause"로 삭제할 수 있음(2026-03 판결) |

### 1.2 Google Play

| # | 정책 | 요지 | 우리 앱에서 걸리는 부분 | 위험 | 대응 |
|---|---|---|---|---|---|
| G1 | **Device and Network Abuse** [보도: 거절 사례 다수, 원문 미확인] | 다른 서비스의 약관을 위반하도록 돕는 앱 금지. "enabling background play of YouTube videos"를 사유로 든 거절 통지가 개발자 포럼에 반복적으로 보고됨 | `BackgroundWebView`, `bgplay.js` 위장, `PlaybackService` | **매우 높음** | 스토어 빌드에서 백그라운드 위장 제거(S1/S3) 또는 범용 브라우저화(S2). Kiwi 사례: 복귀 조건이 YouTube 백그라운드 재생 비활성화였음 |
| G2 | **Spam / Minimum functionality: WebView** [추정: 원문 미확인, 기억에 의존] | "소유하거나 관리하지 않는 웹사이트의 WebView 제공이 주목적인 앱"은 허가 없이는 금지(로 알려짐) | m.youtube.com 래퍼 | 높음 | S1은 해당 없음. S2는 범용 브라우저라 해당 없음. **원문 확인 필요**(ENV_PENDING E-07) |
| G3 | **Intellectual Property / Impersonation** | 상표, 혼동을 주는 이름·아이콘 금지 | A4와 같음 | 중간 | A4와 같음 |
| G4 | **Foreground service 유형 선언** [공식-요약] | targetSdk 34 이상에서 FGS 유형 선언이 필요하고, Play Console에서 사용 목적 신고(필요 시 시연 영상) | `foregroundServiceType="mediaPlayback"` | 낮음 | 미디어 앱이면 정당한 사용. Console 신고서를 작성 |
| G5 | **Target API 요구사항** [공식-요약] | **2026-08-31부터 신규 앱과 업데이트는 Android 16(API 36) 타깃** | 현재 `targetSdk = 35` | **필수** | 36으로 올림. 이때 **predictive back이 기본이 되어 `onBackPressed()`가 호출되지 않음** → `OnBackInvokedCallback`으로 바꿔야 함([HANDOFF T-12](HANDOFF.md)) |
| G6 | **Data safety / 개인정보처리방침** | Data safety 양식 작성, 처리방침 URL | 로컬 저장만 함 | 낮음 | "수집 없음"으로 작성. 처리방침 페이지 |
| G7 | **Permissions** | 필요한 권한만 요청 | POST_NOTIFICATIONS, WAKE_LOCK, FGS_MEDIA_PLAYBACK | 낮음 | 유지 |
| G8 | YouTube의 사후 신고 | 정책 위반 신고로 삭제·정지 | 전체 | 높음 | Kiwi 2019 사례 |

### 1.3 YouTube 쪽 (스토어와 무관하게 적용)

| # | 근거 | 요지 | 대응 |
|---|---|---|---|
| Y1 | YouTube 서비스 약관 [보도/추정: 원문 재확인 필요] | 서비스 기능을 우회·비활성화하는 행위 금지. 백그라운드 재생은 Premium 기능(Google 공식 입장, 2026-01) | 스토어 빌드에서는 위장을 제거하고 Premium 사용자의 정상 사용을 전제로 함 |
| Y2 | YouTube API Services 약관/개발자 정책 [공식-요약] | **API(IFrame 플레이어 포함)를 쓰면** 백그라운드 재생, 오디오·영상 분리가 명시적으로 금지됨 | IFrame Player API로 백그라운드 재생 금지. Data API(재생목록 동기화)는 허용 범위 안에서만 |
| Y3 | 상표·브랜딩 가이드라인 | YouTube 로고와 이름 사용 제한 | A4/G3 |
| Y4 | 법적 조치 사례 | Vanced 2022 cease-and-desist | 상표 미사용, 광고 제거 기능 넣지 않음, 수익화 없음 |

---

## 2. 사례 연구

| 사례 | 무슨 일이 있었나 | 교훈 | 근거 |
|---|---|---|---|
| **ProTube (iOS, 2017)** | YouTube가 반복해서 요청하자 Apple이 App Store에서 삭제함. 백그라운드 재생과 오디오 전용 같은 핵심 기능 제거를 요구받음 | 심사를 통과해도 권리자가 신고하면 삭제됨 | [보도] AppleInsider, MacRumors |
| **Musi (iOS, 2024 → 2026)** | YouTube 법무팀 불만이 접수돼 2024-09에 삭제됨. 소송했지만 2026-03 법원이 Apple의 "with or without cause" 삭제 권한을 인정하고 기각 | 오랜 기간 서비스한 대형 앱도 예외가 아님. 법적 다툼도 승산이 낮음 | [보도] MBW, MacRumors |
| **Kiwi Browser (Android, 2019)** | YouTube 백그라운드 재생 때문에 Play에서 삭제된 것으로 보도됨. **복귀 버전 노트에 "background play is now disabled on YouTube (request of Google Play)"** | 범용 브라우저라도 YouTube 백그라운드 재생이 명시적으로 문제가 될 수 있음 | [보도] MobileSyrup, Android Police 인용 |
| **Brave iOS Playlist (2026-06)** | Apple이 Playlist의 **오프라인 재생(저장) 기능 제거**를 요구했고 Brave가 이의 제기 중이라고 보도됨. 백그라운드 재생은 PiP를 활용하는 방식 | 브라우저라도 5.2.3(저장·다운로드)은 엄격히 적용됨. 단순 재생보다 저장이 더 위험 | [보도] PiunikaWeb(단일 출처), Brave 공식 Playlist 소개 |
| **Brave / Samsung Internet / Vivaldi / Edge** | 백그라운드 재생 설정이 있는 범용 브라우저로 양 스토어에 계속 있음. 2026-01 이후에는 YouTube 서버 측 차단으로 대응 | "범용 브라우저의 일반 기능"이라는 포지셔닝은 스토어에서 버틸 수 있음. 대신 YouTube가 기술적으로 막음 | [보도] |
| **Play 거절: WebView/IFrame YouTube 앱들** | 다수 개발자가 "enabling background play of YouTube videos" 사유로 Device and Network Abuse 거절을 보고함. 일부는 WebView가 백그라운드에서도 재생되는 것 자체가 원인이었음 | **의도하지 않은 백그라운드 재생도 거절 사유**가 됨. 스토어 빌드는 백그라운드 진입 시 반드시 정지해야 함 | [보도] B4X, Ionic, Thunkable 포럼 |
| **Vanced (Android, 2022)** | Google의 cease-and-desist로 개발과 배포를 중단함 | 상표, 공식 앱 수정, 광고 제거가 결합되면 법적 조치까지 감 | [보도] The Verge, TechSpot |
| **NewPipe / YTPro / NouTube** | 처음부터 Play에 내지 않음. F-Droid, GitHub, TestFlight(NouTube iOS)로 배포 | 이 부류 앱의 현실적인 경로는 스토어 밖 | [소스 확인] README |
| **Facebook Research 앱 (2019)** | 사내용 Enterprise 인증서로 일반인에게 배포하다 적발돼 Apple이 인증서를 취소함 | Enterprise 프로그램을 공개 배포에 쓰면 안 됨 | [보도] |

---

## 3. 대응 전략 비교

| 전략 | 내용 | App Store | Google Play | 개발량 | 이번 기능 유지 |
|---|---|---|---|---|---|
| **S1 보관함 우선 앱** | 공유로 들어오는 곡을 빠르게 저장하고 분류하는 앱. **재생은 공식 YouTube/YT Music 앱으로 넘김**(Premium이면 공식 앱에서 백그라운드 재생). 선택: 짧은 미리보기만 포그라운드로 보여주기. 선택: YouTube Data API로 사용자 YouTube 재생목록에 동기화 | **낮음~중간** | **낮음~중간** | 중간 | ✅ 빠른 저장, 분류, 임시함, 하나씩 분류 그대로 |
| **S2 범용 브라우저** | 주소창, 탭, 북마크를 갖춘 브라우저. "미디어 백그라운드 재생"을 **모든 사이트에 적용되는 설정**으로 둠(Brave iOS처럼). 보관함은 "미디어 북마크"로 일반화. YouTube 언급 없음 | 중간 | 중간~높음(Kiwi 사례) | **큼** | 🔶 일반화 필요 |
| **S3 Premium 동반 앱** | 현재 앱에서 위장과 자동 재개만 뺌. "Premium 사용자의 백그라운드 재생 보조"로 포지셔닝 | 높음(A1/A3/A10은 그대로) | 높음(G1/G2는 그대로) | 작음 | ✅ |
| **S4 스토어 밖 배포** | 현재 풀 기능 유지. 아래 §3.1 경로 | — | — | 작음 | ✅ |

**권장 순서**: S4(개인 사용, 지금 바로 가능) → S1(스토어 출시용 빌드 변형) → (원하면) S2.
S3은 수정은 적지만 거절 사유의 핵심(WebView 래퍼, 제3자 약관)이 그대로라 효과가 작다.

### 3.1 S4 스토어 밖 배포 경로 (2026-11 기준)

| 플랫폼 | 경로 | 조건·제약 | 근거 |
|---|---|---|---|
| Android | APK 직접 설치(GitHub Releases, Obtainium) | **Android 개발자 인증**: 2026-09-30부터 브라질·인도네시아·싱가포르·태국에서 시행, **2027년 전 세계 확대**. 인증 안 된 개발자의 앱은 인증 기기에서 새로 설치할 수 없음. 예외는 다음과 같음. ① 사용자가 "advanced flow"(24시간 지연, 경고)를 켜면 설치 가능. ② `adb install`은 영향 없음. ③ 학생·취미용 **limited distribution account**(2026 출시) | [공식-요약] developer.android.com, [보도] 9to5Google, Android Authority |
| Android | F-Droid | 전체 소스 공개(FOSS)와 F-Droid 자체 빌드가 필요. YouTube 의존 앱에는 "NonFreeNet" 등 안티피처 표시 | [보도/추정] NewPipe 사례 |
| iOS | Xcode 개인 서명(무료 Personal Team) | 7일마다 재설치, 기기 수 제한 | [공식-요약] |
| iOS | 유료 개발자 계정 Ad Hoc | 연간 기기 100대 | [공식-요약] |
| iOS | **TestFlight 내부 테스터** | 팀 구성원 최대 100명, **베타 심사 없음**. 빌드는 90일 유효 | [공식-요약] |
| iOS | TestFlight 외부 테스터 | 최대 10,000명이지만 **베타 앱 심사**를 거침 → A1~A3에 걸릴 수 있음 | [공식-요약] |
| iOS | EU 대체 마켓플레이스 / 웹 배포 | EU 사용자 한정. Apple 공증(Notarization: 자동 검사 + 기본 사람 심사, App Review보다 좁음), 핵심기술 수수료 조건 | [공식-요약] Apple 지원 문서, [보도] |
| iOS | 일본 대체 마켓플레이스 | iOS 26.2 이상(2025-12, 스마트폰 경쟁법). 공증된 앱만. 웹에서 직접 설치는 의무가 아님 | [공식-요약] Apple 개발자 문서, MacRumors |
| iOS | Enterprise 프로그램 | **공개 배포 금지**(Facebook 2019 인증서 취소) | ❌ 사용 금지 |

> 한국 사용자 기준으로 정리하면 이렇다. iOS는 대체 마켓플레이스 대상국이 아니므로 **Xcode 개인 서명, Ad Hoc, TestFlight 내부**가 현실적이다. Android는 2027년 전 세계 개발자 인증 확대 전에 **limited distribution account 등록**을 검토한다.

---

## 4. 하면 안 되는 "회피" 방법과 이유

아래는 사례와 정책에 나오는 "심사 회피" 방법이다. **BgPlay에서는 쓰지 않는다**(결정 [D-12](DECISIONS.md)).

| 방법 | 위반 | 결과(사례) |
|---|---|---|
| 심사 중에는 기능을 끄고, 출시 후 서버 플래그·지역·날짜로 켜기 | Apple 2.5.19(숨겨진 기능), 2.3.1(심사 노트 허위). Play 기만 정책 | 앱 삭제와 **개발자 계정 해지**(그 계정의 모든 앱) |
| 출시 후 원격 스크립트로 기능 추가(`@latest` 로딩 등) | Apple 2.5.2. Play 동적 코드 정책 | 삭제, 공급망 위험(SmartTube 2025 서명키 탈취) |
| 이름·설명으로 정체를 숨기기("음악 메모 앱"이라고 하고 실제로는 YouTube 백그라운드 플레이어) | Apple 2.3.1, Play 기만적 행위 | 삭제와 계정 해지 |
| Enterprise 인증서로 일반 배포 | Apple Enterprise 약관 | 인증서 취소(Facebook 2019) |
| 다른 개발자 계정으로 재출시 반복 | Apple 5.6 개발자 행동규범, Play 연관 계정 정책 | 연관 계정 일괄 해지 |

**이유**: 위 방법은 일시적으로 통과하더라도, 걸리면 앱 하나가 아니라 계정 전체를 잃는다. 또 YouTube가 신고하면 어차피 내려간다(ProTube, Musi). 스토어 빌드는 **스토어에서 실제로 하는 일만 담고 그대로 설명한다.**

---

## 5. 구현 방안: 빌드 변형으로 이중 트랙

현재 코드를 크게 바꾸지 않고 **배포 채널별 빌드 변형**으로 나누는 계획이다(아직 구현 안 함, [HANDOFF T-20~T-24](HANDOFF.md)).

| 항목 | `full`(개인/사이드로드, 현재) | `store`(App Store / Play) |
|---|---|---|
| 앱 이름 | BgPlay | BgPlay Library(가칭) |
| `bgplay.js` 가시성 위장, 엔진 정지 자동 재개 | 켬(설정) | **코드에서 제외**(설정 토글도 없음) |
| Android `BackgroundWebView` 가시성 신호 차단 | 켬 | **제외**. 백그라운드로 가면 `webView.onPause()`와 정지 |
| 재생 위치 | 앱 내 WebView | **공식 YouTube/YT Music 앱으로 열기**(아래). 앱 내 WebView는 사용하지 않거나 포그라운드 미리보기로만 |
| `PlaybackService`, `UIBackgroundModes: audio` | 있음 | **제거**(앱이 오디오를 재생하지 않음) |
| 보관함(빠른 저장, 분류, 임시함, 하나씩 분류) | 있음 | **있음(핵심 기능)** |
| 저장 진입점 | 상단 버튼, 알림 | **공유 시트**(YouTube 앱 → 공유 → BgPlay): Android `ACTION_SEND`(구현됨), iOS Share Extension(신규) |
| YouTube 재생목록 동기화 | 없음 | 선택: YouTube Data API(OAuth). 카테고리 → 사용자 YouTube 재생목록 |

**공식 앱으로 넘기기**

- Android: `Intent(ACTION_VIEW, Uri.parse("https://music.youtube.com/watch?v=ID"))`를 `setPackage("com.google.android.apps.youtube.music")`로 보내고, 실패하면 YouTube 앱(`com.google.android.youtube`), 그다음 브라우저 순으로 시도한다. Android 11 이상은 패키지 가시성 때문에 매니페스트 `<queries>` 선언이 필요하다.
- iOS: `UIApplication.shared.open(URL("https://music.youtube.com/watch?v=ID"))`. Universal Link로 앱이 설치돼 있으면 앱이 열린다. 스킴 확인(`canOpenURL`)이 필요하면 `LSApplicationQueriesSchemes`에 `youtube` 등을 선언한다[추정: 스킴 이름 확인 필요].
- 큐 재생("카테고리 전체 재생"):
  - 동기화를 쓰면 Data API로 만든 YouTube 재생목록 URL을 연다.
  - 동기화를 안 쓰면 `watch_videos?video_ids=` 임시 재생목록을 연다(비공식 URL, 동작 확인 필요 — TEST_PLAN P14).

**YouTube Data API를 쓸 때 주의** [공식-요약/추정 — 원문 확인 필요]

- 재생목록 쓰기에는 OAuth 범위 `youtube`(민감 범위)가 필요하다 → Google OAuth 앱 검증 절차.
- 기본 할당량은 하루 10,000 단위로 알려져 있고, 항목 추가 1건의 비용이 큰 편이다(50단위로 알려짐). 개인 규모로는 충분하고, 대규모라면 할당량 감사가 필요하다.
- API를 쓰는 순간 YouTube API 약관(Y2)이 적용된다. 백그라운드 재생이나 오디오 분리와는 절대 섞지 않는다.

---

## 6. 출시 전 체크리스트 (`store` 빌드 기준)

**공통**
- [ ] 앱 이름, 아이콘, 스크린샷, 설명, 키워드에 YouTube 상표·로고 없음("YouTube 링크를 정리하는 도구" 수준의 사실 설명만)
- [ ] 백그라운드 재생, 위장, 자동 재개 코드가 바이너리에 **없음**(설정으로 숨긴 것이 아니라 빌드에서 제외)
- [ ] 다운로드, 저장, 오프라인 재생, 오디오 추출 기능 없음
- [ ] 개인정보처리방침 페이지(로컬 저장만 함, 수집 없음, 삭제 방법)
- [ ] 보관함 내보내기/가져오기 동작(사용자 데이터 이동권)
- [ ] 심사 노트에 모든 기능을 구체적으로 설명하고, 시연 순서도 적음(공유 → 저장 → 분류 → 공식 앱에서 열기)

**iOS**
- [ ] `PrivacyInfo.xcprivacy`(UserDefaults 사용 사유)
- [ ] Privacy Nutrition Label: Data Not Collected
- [ ] `UIBackgroundModes` 제거(store), Share Extension 추가
- [ ] 4.2 대응: 네이티브 기능(보관함, 분류, 공유 확장, 위젯 등)이 앱의 중심
- [ ] TestFlight 외부 테스트로 베타 심사를 먼저 받아 반응을 확인

**Android**
- [ ] `targetSdk 36`(2026-08-31 이후 필수), predictive back 대응(`OnBackInvokedCallback`)
- [ ] store flavor에서 `PlaybackService`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK` 제거
- [ ] Data safety 양식(수집 없음), 콘텐츠 등급, 처리방침 URL
- [ ] `<queries>`(YouTube/YT Music 패키지)
- [ ] 내부 테스트 트랙 → 비공개 테스트 트랙으로 심사 반응 확인

---

## 7. 아직 확인 못 한 것 (→ [ENV_PENDING E-07](ENV_PENDING.md))

| 항목 | 이유 |
|---|---|
| Google Play 정책 원문: Device and Network Abuse, Spam/WebView, Intellectual Property, Deceptive Behavior | `support.google.com` 접속 차단. 이 문서의 G1·G2는 보도와 기억에 의존 |
| YouTube 서비스 약관의 해당 문구(기능 우회 금지 등) | 원문 미확인 |
| YouTube API 개발자 정책의 "background play" 금지 문구, Data API 할당량 단가 | developers.google.com 차단 |
| Apple 공증(Notarization) 심사 범위가 5.2.x를 포함하는지 | 원문 미확인 |
| Brave iOS 2026-06 Playlist 이슈의 1차 출처 | 단일 보도만 있음 |
| Android limited distribution account 조건, 한국 시행 일정 | 보도 간 차이가 있음 |

---

## 출처

**공식 (원문 확인)**
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): 2.3.1, 2.5.2, 2.5.4, 2.5.6, 2.5.19, 4.1, 4.2, 4.2.2, 5.1.1, 5.2.1, 5.2.2, 5.2.3 원문(2026-11-03 조회)

**공식 (검색 요약)**
- [Android developer verification](https://developer.android.com/developer-verification) · [Android Developers Blog: verification rolling out](https://developer.android.com/blog/posts/android-developer-verification-rolling-out-to-all-developers-on-play-console-and-android-developer-console) · [Android Developer Console Help](https://support.google.com/android-developer-console/answer/16561738?hl=en)
- [Play target API level requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Apple: alternative app marketplace in Japan](https://developer.apple.com/support/alternative-app-marketplace-jp) · [Apple: Installing apps through alternative app distribution](https://support.apple.com/en-ug/117767)
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) · [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Brave Playlist](https://brave.com/playlist/) · [Brave Playlist iOS launch](https://brave.com/playlist-ios-launch/)

**보도/포럼**
- [9to5Google: advanced sideloading rollout (2026-08)](https://9to5google.com/2026/08/18/google-gradually-rolling-out-androids-advanced-sideloading-ahead-of-developer-verification/) · [Android Authority: verification rollout](https://www.androidauthority.com/google-android-advanced-flow-sideloading-rollout-begins-3700073/) · [XDA](https://www.xda-developers.com/googles-controversial-advanced-flow-sideloading-rolling-out-ahead-of-stricter-developer-verification/)
- [MacRumors: Japan App Store changes (2025-12)](https://www.macrumors.com/2025/12/17/japan-app-store-feature-updates) · [AppleInsider: third-party iOS app stores in Japan](https://appleinsider.com/articles/25/12/17/new-third-party-ios-app-stores-in-japan-preserve-user-privacy-child-safety)
- [MobileSyrup: Kiwi removed (2019)](https://mobilesyrup.com/2019/05/07/kiwi-browser-removed-from-play-store/) · [MobileSyrup: Kiwi back (2020)](https://mobilesyrup.com/2020/09/14/android-web-browser-kiwi-back/)
- [PiunikaWeb: Brave fix for YouTube playlist on iOS (2026-06)](https://piunikaweb.com/2026/06/30/brave-fix-for-broken-youtube-playlist-downloads-on-ios/) · [Engadget: Brave Playlist iOS](https://www.engadget.com/brave-playlist-ios-browser-160040609.html)
- Play 거절 사례: [B4X forum](https://www.b4x.com/android/forum/threads/google-rejects-the-application.103059) · [Ionic forum](https://forum.ionicframework.com/t/solved-violation-of-device-and-network-abuse-policy/145910) · [AppStudio forum](https://discuss.appstudio.dev/t/google-play-taking-my-apps-down-youtube-player/1522) · [Thunkable](https://community.thunkable.com/t/app-rejected-on-play-store/66335)
- ProTube, Musi, Vanced, SmartTube 출처는 [CASE_STUDIES.md §5](CASE_STUDIES.md)
