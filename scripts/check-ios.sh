#!/usr/bin/env bash
# iOS 프로젝트 생성·컴파일 점검 (DOCS/ENV_PENDING.md E-03)
# ⚠️ 개발 환경에는 macOS/Xcode가 없어 이 스크립트를 실행해 보지 못했다(2026-11-03).
#
# 필요: macOS, Xcode 15+, XcodeGen(brew install xcodegen)
# 사용: scripts/check-ios.sh     시뮬레이터용 빌드(서명 없이)로 컴파일 오류 확인
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/scripts/out"; mkdir -p "$OUT"
LOG="$OUT/ios-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee "$LOG") 2>&1
step() { printf '\n=== %s ===\n' "$*"; }

step "환경"
xcodebuild -version || { echo "!! Xcode 없음"; exit 1; }
command -v xcodegen >/dev/null || { echo "!! xcodegen 없음: brew install xcodegen"; exit 1; }

step "XcodeGen"
cd "$ROOT/ios" && xcodegen generate || exit 1

step "시뮬레이터 빌드 (서명 없음)"
xcodebuild -project BgPlay.xcodeproj -scheme BgPlay -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$OUT/DerivedData" \
  CODE_SIGNING_ALLOWED=NO build 2>&1 | tee "$OUT/xcodebuild-last.log" | grep -E 'error:|warning:|BUILD (SUCCEEDED|FAILED)'
APP=$(find "$OUT/DerivedData" -name 'BgPlay.app' -type d | head -1)
if [ -n "$APP" ]; then
  step "번들 리소스 확인"
  ls "$APP/bgplay.js" "$APP/library/index.html" "$APP/library/core.js" "$APP/library/ui.js" "$APP/library/style.css" || echo "!! 리소스 누락 — project.yml 의 sources 확인"
  /usr/libexec/PlistBuddy -c 'Print :UIBackgroundModes' "$APP/Info.plist" || true
fi
echo; echo "완료. 로그: $LOG  → 실기기 실행은 Xcode에서 Team 지정 후 (ENV_PENDING.md E-03)"
