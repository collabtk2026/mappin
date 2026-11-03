package io.github.bgplay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.util.Log
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/**
 * 보관함(임시함·카테고리·분류 시트) 오버레이. UI 와 데이터 로직은 공용 웹 모듈
 * (assets/library = shared/web/library) 이고, 여기서는 띄우기/숨기기, 저장, 브리지만 한다.
 *
 * 투명 WebView 를 화면 전체에 겹쳐 두고, 닫혀 있을 때는 INVISIBLE(터치는 아래 YouTube 로 감).
 */
class LibraryController(context: Context, private val store: LibraryStore, private val host: Host) {

    interface Host {
        fun onLibraryStats(inbox: Int, total: Int)
        fun onLibraryClosed()
        fun onLibraryPlay(url: String, keepOpen: Boolean)
        fun onLibraryPlayQueue(name: String, items: List<QueueItem>, index: Int)
        fun onLibraryToast(text: String)
        fun onLibraryExport(json: String, filename: String)
    }

    val view: WebView = WebView(context)
    private var ready = false
    private val whenReady = mutableListOf<() -> Unit>()
    private val assets = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    init {
        setup()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup() {
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        view.setBackgroundColor(Color.TRANSPARENT)
        view.visibility = View.INVISIBLE
        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            // 보관함 페이지 밖으로는 이동하지 않는다.
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean =
                request.url.host != ASSET_HOST
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view, "BgLibNative", setOf("https://$ASSET_HOST")) { _, msg, _, isMainFrame, _ ->
                if (isMainFrame) msg.data?.let(::onMessage)
            }
        } else {
            view.addJavascriptInterface(object {
                @JavascriptInterface
                fun postMessage(data: String) = view.post { onMessage(data) }
            }, "BgLibNative")
        }
        view.loadUrl(URL)
    }

    val isShowing: Boolean get() = view.visibility == View.VISIBLE

    /** 상단 "＋": 결과 {status, title, where[], inbox} */
    fun quickSave(track: JSONObject, callback: (JSONObject?) -> Unit) = runWhenReady {
        view.evaluateJavascript("__bglib.quickSave($track)") { r -> callback(parseStringResult(r)) }
    }

    /** 상단 "분류": 분류 시트 */
    fun openSave(track: JSONObject) = runWhenReady {
        show()
        view.evaluateJavascript("__bglib.openSave($track)", null)
    }

    fun openLibrary(nowPlaying: JSONObject?) = runWhenReady {
        show()
        view.evaluateJavascript("__bglib.nowPlaying(${nowPlaying ?: "null"});__bglib.openLibrary(null)", null)
    }

    /** 뒤로 가기. 페이지가 처리 못 하면(최상위) 닫는다. */
    fun back() {
        if (!ready) return hide()
        view.evaluateJavascript("__bglib.back()") { r -> if (r != "true") hide() }
    }

    fun destroy() {
        (view.parent as? android.view.ViewGroup)?.removeView(view)
        view.destroy()
    }

    // --------------------------------------------------------------------------------------------

    private fun show() {
        view.visibility = View.VISIBLE
        view.requestFocus()
    }

    private fun hide() {
        val imm = view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(view.windowToken, 0)
        view.visibility = View.INVISIBLE
        host.onLibraryClosed()
    }

    private fun runWhenReady(block: () -> Unit) {
        if (ready) block() else whenReady.add(block)
    }

    private fun onMessage(data: String) {
        val o = runCatching { JSONObject(data) }.getOrNull() ?: return
        when (o.optString("type")) {
            "ready" -> boot()
            "persist" -> store.write(o.optString("data"))
            "stats" -> host.onLibraryStats(o.optInt("inbox"), o.optInt("total"))
            "close" -> hide()
            "play" -> {
                val url = o.optString("url")
                val keep = o.optBoolean("keepOpen")
                if (UrlPolicy.isYouTube(Uri.parse(url))) {
                    if (!keep) hide()
                    host.onLibraryPlay(url, keep)
                }
            }
            "playQueue" -> {
                val arr = o.optJSONArray("items") ?: JSONArray()
                val items = (0 until arr.length()).mapNotNull { i ->
                    val it = arr.optJSONObject(i) ?: return@mapNotNull null
                    val url = it.optString("url")
                    val id = UrlPolicy.videoIdOf(url) ?: return@mapNotNull null
                    QueueItem(id, url, it.optString("title"))
                }
                if (items.isNotEmpty()) {
                    hide()
                    host.onLibraryPlayQueue(o.optString("name"), items, o.optInt("index").coerceIn(0, items.size - 1))
                }
            }
            "toast" -> host.onLibraryToast(o.optString("text"))
            "export" -> host.onLibraryExport(o.optString("json"), o.optString("filename"))
        }
    }

    /** 페이지 준비 → 저장된 데이터로 boot → 대기 중이던 저장(알림에서 누른 것 등) 반영. */
    private fun boot() {
        val json = store.read()
        val arg = if (json != null) JSONObject.quote(json) else "null"
        view.evaluateJavascript("__bglib.boot($arg)") {
            ready = true
            val pending = store.takePending()
            for (i in 0 until pending.length()) {
                pending.optJSONObject(i)?.let { t -> view.evaluateJavascript("__bglib.quickSave($t)", null) }
            }
            val queued = whenReady.toList()
            whenReady.clear()
            queued.forEach { it() }
        }
    }

    private fun parseStringResult(r: String?): JSONObject? = try {
        (JSONTokener(r ?: "null").nextValue() as? String)?.let(::JSONObject)
    } catch (e: Exception) {
        Log.w("BgPlay", "bad quickSave result: $r")
        null
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val URL = "https://$ASSET_HOST/assets/library/index.html"
    }
}

data class QueueItem(val videoId: String, val url: String, val title: String)
