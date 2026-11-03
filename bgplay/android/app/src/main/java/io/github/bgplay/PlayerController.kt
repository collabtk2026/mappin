package io.github.bgplay

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.MutableContextWrapper
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONException
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet

/** Activity 가 구현하는 UI 콜백. Activity 가 없을 때(백그라운드)는 null. */
interface UiHost {
    fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback)
    fun onHideCustomView()
    /** 렌더러 크래시 후 WebView 를 새로 만들었을 때. 다시 붙여야 한다. */
    fun onWebViewReplaced()
}

/**
 * WebView 1개와 재생 상태를 소유한다 (프로세스 싱글턴).
 *
 * - WebView 는 MutableContextWrapper 로 만들어 Activity 가 바뀌어도 재사용한다.
 * - bgplay.js 를 document-start 에 주입하고, origin 제한 메시지 채널로 상태를 받는다.
 * - 재생이 시작되면 PlaybackService(포그라운드 서비스 + MediaSession)를 띄운다.
 */
class PlayerController(private val app: Application) {

    fun interface Listener {
        fun onPlaybackChanged(info: PlaybackInfo)
    }

    val settings = Settings(app)
    var uiHost: UiHost? = null
    /** 보관함이 떠 있는 Activity. 없으면(백그라운드) 임시 저장은 pending 으로 쌓인다. */
    var library: LibraryController? = null
    var webView: BackgroundWebView? = null
        private set
    var info = PlaybackInfo()
        private set

    private val main = Handler(Looper.getMainLooper())
    private val contextWrapper = MutableContextWrapper(app)
    private val listeners = CopyOnWriteArraySet<Listener>()
    private var scriptHandler: ScriptHandler? = null
    private val script: String by lazy { app.assets.open("bgplay.js").bufferedReader().use { it.readText() } }
    private val hasDocumentStart get() = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

    init {
        val debuggable = app.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        WebView.setWebContentsDebuggingEnabled(debuggable) // chrome://inspect 로 디버깅
    }

    fun addListener(l: Listener) = listeners.add(l)
    fun removeListener(l: Listener) = listeners.remove(l)

    /** Activity 에 붙일 WebView 를 돌려준다 (없으면 생성). */
    fun attach(activity: Activity): BackgroundWebView {
        contextWrapper.baseContext = activity
        return webView ?: create(settings.lastUrl ?: Settings.HOME_YOUTUBE)
    }

    /** Activity 파괴 시. WebView 는 살려 두고(재생 계속) 부모에서만 뗀다. */
    fun detach(activity: Activity) {
        if (contextWrapper.baseContext === activity) contextWrapper.baseContext = app
        webView?.let { (it.parent as? ViewGroup)?.removeView(it) }
    }

    fun load(url: String) {
        webView?.loadUrl(url)
    }

    /** bgplay.js 의 window.__bgplay.command(name, arg) 호출. */
    fun command(name: String, arg: Double? = null) {
        val a = arg?.takeIf { !it.isNaN() && !it.isInfinite() }?.toString() ?: "null"
        webView?.evaluateJavascript(
            "window.__bgplay&&window.__bgplay.command(${JSONObject.quote(name)},$a)", null
        )
    }

    // ------------------------------------------------------------------ 재생 큐 (보관함의 "전체 재생")

    private var queue: List<QueueItem> = emptyList()
    private var queueIndex = -1
    var queueName: String? = null
        private set
    private var awaitingId: String? = null
    private var awaitingSince = 0L

    val hasQueue get() = queue.isNotEmpty()
    val hasQueueNext get() = hasQueue && queueIndex + 1 < queue.size

    fun playQueue(name: String, items: List<QueueItem>, index: Int) {
        queue = items
        queueIndex = index
        queueName = name
        loadQueueItem()
    }

    /** 보관함에서 곡 하나 재생 — 큐는 끝낸다. */
    fun playSingle(url: String) {
        clearQueue()
        load(url)
    }

    fun clearQueue() {
        queue = emptyList()
        queueIndex = -1
        queueName = null
        awaitingId = null
    }

    /** 알림/잠금화면/이어폰의 "다음": 큐가 있으면 큐, 없으면 사이트의 다음 곡. */
    fun skipNext() {
        if (hasQueue) {
            if (hasQueueNext) { queueIndex++; loadQueueItem() } else clearQueue()
        } else command("next")
    }

    fun skipPrev() {
        if (hasQueue && queueIndex > 0) { queueIndex--; loadQueueItem() } else command("prev")
    }

    private fun loadQueueItem() {
        val item = queue[queueIndex]
        awaitingId = item.videoId
        awaitingSince = SystemClock.elapsedRealtime()
        load(item.url)
    }

    /**
     * 재생 상태로 큐를 진행한다.
     * - 새 곡 로딩 중(awaiting)에는 이전 페이지 상태를 무시
     * - 현재 곡이 끝나면(ended) 다음 곡 (YouTube 자동재생 카운트다운보다 먼저)
     * - 사용자가 다른 영상으로 이동하면 큐 종료
     */
    private fun advanceQueue(state: PlaybackInfo) {
        if (!hasQueue) return
        val vid = UrlPolicy.videoIdOf(state.url)
        val current = queue[queueIndex].videoId
        val waiting = awaitingId
        if (waiting != null) {
            if (vid == waiting || SystemClock.elapsedRealtime() - awaitingSince > 20_000) awaitingId = null
            return
        }
        when {
            vid != null && vid != current -> clearQueue()
            vid == current && state.ended -> skipNext()
        }
    }

    // ------------------------------------------------------------------ 임시 저장

    /** 지금 보고 있는 영상 정보 (보관함 track 형식). 영상 페이지가 아니면 null. */
    fun currentTrack(): JSONObject? {
        val url = info.url?.takeIf { UrlPolicy.videoIdOf(it) != null }
            ?: webView?.url?.takeIf { UrlPolicy.videoIdOf(it) != null }
            ?: return null
        val sameAsState = info.url == url
        return JSONObject().apply {
            put("url", url)
            put("title", if (sameAsState) info.title else webView?.title)
            put("artist", if (sameAsState) info.artist else null)
            put("artwork", if (sameAsState) info.artworkUrl else null)
            if (sameAsState && info.durationMs > 0) put("duration", info.durationMs / 1000.0)
        }
    }

    /** 알림/잠금화면의 "＋ 임시 저장" (앱이 백그라운드일 수 있음). */
    fun quickSaveFromBackground() {
        val track = currentTrack() ?: return toast(app.getString(R.string.nothing_to_save))
        val lib = library
        if (lib != null) {
            lib.quickSave(track) { r ->
                val status = r?.optString("status")
                toast(app.getString(if (status == "duplicate") R.string.already_saved else R.string.saved_to_inbox))
            }
        } else {
            app.libraryStore.addPending(track)
            toast(app.getString(R.string.saved_to_inbox))
        }
    }

    private fun toast(text: String) = Toast.makeText(app, text, Toast.LENGTH_SHORT).show()

    fun setBackgroundPlay(enabled: Boolean) {
        settings.backgroundPlay = enabled
        val wv = webView ?: return
        wv.keepVisibleWhenHidden = enabled
        installScript(wv)
        wv.reload()
    }

    // --------------------------------------------------------------------------------------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun create(url: String): BackgroundWebView {
        val wv = BackgroundWebView(contextWrapper)
        wv.keepVisibleWhenHidden = settings.backgroundPlay
        with(wv.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // 알림/잠금화면 버튼으로 play() 호출 허용
            setSupportMultipleWindows(false)
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(wv, true) // Google 계정 로그인 리다이렉트
        }
        // 앱이 안 보여도 렌더러 프로세스 우선순위를 낮추지 않게 한다 (OOM kill 방지).
        wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        wv.setBackgroundColor(0xFF0F0F0F.toInt())

        installScript(wv)
        installBridge(wv)
        wv.webViewClient = Client()
        wv.webChromeClient = ChromeClient()
        wv.loadUrl(url)
        webView = wv
        return wv
    }

    private fun configScript(): String =
        "window.__BGPLAY_CONFIG={backgroundPlay:${settings.backgroundPlay},platform:\"android\"};\n"

    /** document-start 주입. 지원 안 되는 아주 오래된 WebView 는 onPageStarted 폴백. */
    private fun installScript(wv: WebView) {
        if (!hasDocumentStart) return
        scriptHandler?.remove()
        scriptHandler = WebViewCompat.addDocumentStartJavaScript(wv, configScript() + script, ORIGINS)
    }

    private fun installBridge(wv: WebView) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // 허용 origin 의 페이지에만 window.BgPlayNative 가 생긴다.
            WebViewCompat.addWebMessageListener(wv, "BgPlayNative", ORIGINS) { _, message, _, isMainFrame, _ ->
                if (isMainFrame) message.data?.let { data -> onUi { onMessage(data) } }
            }
        } else {
            // 폴백: 모든 프레임에 노출되므로 현재 URL 이 YouTube 일 때만 받는다.
            wv.addJavascriptInterface(object {
                @JavascriptInterface
                fun postMessage(data: String) = onUi {
                    val current = webView?.url?.let(Uri::parse)
                    if (current != null && UrlPolicy.isYouTube(current)) onMessage(data)
                }
            }, "BgPlayNative")
        }
    }

    private fun onUi(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    private fun onMessage(data: String) {
        val o = try {
            JSONObject(data)
        } catch (e: JSONException) {
            return
        }
        when (o.optString("type")) {
            "state" -> {
                info = PlaybackInfo.fromJson(o)
                advanceQueue(info)
                if (info.playing) ensureService()
                listeners.forEach { it.onPlaybackChanged(info) }
            }
            "autoResume" -> Log.d(TAG, "engine pause detected; resumed")
        }
    }

    private fun ensureService() {
        if (PlaybackService.isRunning) return
        try {
            app.startForegroundService(Intent(app, PlaybackService::class.java))
        } catch (e: Exception) {
            // Android 12+: 앱이 백그라운드일 때는 FGS 시작 불가 (ForegroundServiceStartNotAllowedException).
            // 보통은 사용자가 앱에서 재생을 시작할 때 이미 서비스가 떠 있다.
            Log.w(TAG, "cannot start playback service", e)
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            app.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "no handler for $uri")
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (UrlPolicy.isInternal(uri)) return false
            when (uri.scheme?.lowercase()) {
                // "앱에서 열기" 류 링크는 무시하고 이 앱에 머문다.
                "intent", "vnd.youtube", "youtube" -> {}
                else -> if (request.isForMainFrame) openExternal(uri)
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            if (!hasDocumentStart && url != null && UrlPolicy.isYouTube(Uri.parse(url))) {
                view.evaluateJavascript(configScript() + script, null)
            }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            if (url != null && UrlPolicy.isYouTube(Uri.parse(url))) settings.lastUrl = url
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.w(TAG, "renderer gone (crash=${detail.didCrash()}); recreating WebView")
            if (view !== webView) return true
            val url = view.url ?: settings.lastUrl ?: Settings.HOME_YOUTUBE
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            webView = null
            scriptHandler = null
            info = PlaybackInfo()
            listeners.forEach { it.onPlaybackChanged(info) }
            create(url)
            uiHost?.onWebViewReplaced()
            return true
        }
    }

    private inner class ChromeClient : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            uiHost?.onShowCustomView(view, callback) ?: callback.onCustomViewHidden()
        }

        override fun onHideCustomView() {
            uiHost?.onHideCustomView()
        }

        /** 포스터가 없을 때 나오는 회색 재생 아이콘 제거. */
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    }

    companion object {
        private const val TAG = "BgPlay"
        val ORIGINS = setOf("https://youtube.com", "https://*.youtube.com")
    }
}
