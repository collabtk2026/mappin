package io.github.bgplay

import android.content.Context
import android.view.View
import android.webkit.WebView

/**
 * 창이 안 보이게 돼도(홈 버튼, 화면 꺼짐) WebView(Chromium)에게 "보이는 중"이라고 알린다.
 *
 * WebView는 onWindowVisibilityChanged 로 창 가시성을 받아 렌더러의 페이지를 hidden 으로 바꾸고,
 * 그러면 document.visibilityState 가 'hidden' 이 되며 Chromium 미디어 파이프라인의 백그라운드
 * 최적화(숨겨진 비디오 일시정지 등)가 동작한다. 이 신호를 막으면 엔진 레벨에서는 계속 포그라운드로
 * 취급되고, bgplay.js 는 페이지 레벨 위장을 담당한다. (Brave는 브라우저 자체를 고치므로 이 층이
 * 필요 없지만, 시스템 WebView를 쓰는 앱에서는 이게 엔진 패치를 대신한다.)
 */
class BackgroundWebView(context: Context) : WebView(context) {

    var keepVisibleWhenHidden: Boolean = true

    override fun onWindowVisibilityChanged(visibility: Int) {
        if (keepVisibleWhenHidden && visibility != View.VISIBLE) {
            super.onWindowVisibilityChanged(View.VISIBLE)
            return
        }
        super.onWindowVisibilityChanged(visibility)
    }
}
