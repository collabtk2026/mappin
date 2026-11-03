#!/usr/bin/env bash
# Android 빌드·설치·상태 점검 (DOCS/ENV_PENDING.md E-01, E-02)
# ⚠️ 개발 환경에는 Android SDK가 없어 이 스크립트를 실행해 보지 못했다(2026-11-03).
#
# 필요: Android SDK(ANDROID_HOME 또는 local.properties의 sdk.dir), JDK 17+, (선택) adb로 연결된 기기
# 사용: bgplay/scripts/check-android.sh            빌드 + lint
#       bgplay/scripts/check-android.sh --install  + 기기 설치·실행 + 상태 덤프
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/scripts/out"; mkdir -p "$OUT"
LOG="$OUT/android-$(date +%Y%m%d-%H%M%S).log"
PKG=io.github.bgplay
exec > >(tee "$LOG") 2>&1

step() { printf '\n=== %s ===\n' "$*"; }
step "환경"
java -version 2>&1 | head -1
echo "ANDROID_HOME=${ANDROID_HOME:-<unset>}"
if [ -z "${ANDROID_HOME:-}" ] && ! grep -qs '^sdk.dir=' "$ROOT/android/local.properties"; then
  echo "!! ANDROID_HOME 이 없고 android/local.properties 에 sdk.dir 도 없음. Android Studio로 한 번 열거나 sdk.dir 을 지정하세요."
  exit 1
fi

step "공용 테스트"
(cd "$ROOT/.." && node bgplay/shared/test/bgplay.test.mjs | tail -1 && node bgplay/shared/test/library.test.mjs | tail -1) || echo "!! 공용 테스트 실패/실행 불가 (Playwright 필요)"

step "Gradle 빌드 (assembleDebug)"
cd "$ROOT/android"
if ./gradlew --no-daemon assembleDebug; then
  ls -la app/build/outputs/apk/debug/*.apk
  echo "assets 확인 (bgplay.js, library/*):"
  unzip -l app/build/outputs/apk/debug/app-debug.apk | grep -E 'assets/(bgplay\.js|library/)' || echo "!! assets 누락"
else
  echo "!! 빌드 실패 — ENV_PENDING.md E-01 의 '예상 오류와 대처' 참고"; exit 1
fi

step "Lint"
./gradlew --no-daemon lintDebug || echo "!! lint 경고/오류 — app/build/reports/lint-results-debug.html"

if [ "${1:-}" != "--install" ]; then echo; echo "완료. 로그: $LOG"; exit 0; fi

step "기기 설치·실행"
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk || exit 1
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell am start -n $PKG/.MainActivity
echo "앱에서 영상을 재생한 뒤 Enter 를 누르세요 (재생 중 상태 덤프)"; read -r _
adb shell dumpsys activity services $PKG | grep -E 'ServiceRecord|isForeground|foregroundServiceType' || true
adb shell dumpsys media_session | grep -A6 -i "$PKG" | head -30 || true
echo "화면을 끄고(전원 버튼) 60초 기다린 뒤 Enter (백그라운드 상태 덤프)"; read -r _
adb shell dumpsys activity processes | grep -A3 "$PKG" | head -20 || true
adb shell dumpsys media_session | grep -E 'state=PlaybackState' | head -5 || true
step "logcat (BgPlay 태그, 최근 200줄)"
adb logcat -d -s BgPlay:V chromium:W | tail -200
echo; echo "완료. 로그: $LOG  → 결과를 DOCS/LOG.md, DOCS/TEST_PLAN.md 에 기록"
