package io.github.bgplay

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast

/**
 * WebView 를 화면에 붙이는 껍데기. WebView 자체는 PlayerController 가 소유하므로
 * 이 Activity 가 백그라운드로 가거나 파괴돼도 재생은 계속된다.
 */
class MainActivity : Activity(), UiHost {

    private lateinit var root: FrameLayout
    private lateinit var webContainer: FrameLayout
    private lateinit var bgButton: Button
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        setContentView(root)
        player.uiHost = this
        attachWebView()
        handleIntent(intent)
        requestNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        if (!player.settings.backgroundPlay) player.webView?.onResume()
    }

    override fun onStop() {
        super.onStop()
        CookieManager.getInstance().flush()
        if (!player.settings.backgroundPlay && !isChangingConfigurations) {
            // 백그라운드 재생 끔: 일반 브라우저처럼 멈춘다.
            player.command("pause")
            player.webView?.onPause()
            PlaybackService.stop(this)
        }
    }

    override fun onDestroy() {
        if (customView != null) onHideCustomView()
        if (player.uiHost === this) player.uiHost = null
        player.detach(this)
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val wv = player.webView
        when {
            customView != null -> customCallback?.onCustomViewHidden() ?: onHideCustomView()
            wv != null && wv.canGoBack() -> wv.goBack()
            // 재생 중이면 YouTube 앱처럼 Activity 를 끝내지 않고 뒤로 보낸다.
            player.info.playing -> moveTaskToBack(true)
            else -> super.onBackPressed()
        }
    }

    // ---------------------------------------------------------------- UiHost

    override fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (customView != null) {
            callback.onCustomViewHidden()
            return
        }
        customView = view
        customCallback = callback
        view.setBackgroundColor(Color.BLACK)
        root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setSystemBarsHidden(true)
        root.requestApplyInsets()
    }

    override fun onHideCustomView() {
        val v = customView ?: return
        root.removeView(v)
        customView = null
        customCallback = null
        setSystemBarsHidden(false)
        root.requestApplyInsets()
    }

    override fun onWebViewReplaced() = attachWebView()

    // ---------------------------------------------------------------- UI

    private fun attachWebView() {
        val wv = player.attach(this)
        (wv.parent as? ViewGroup)?.removeView(wv)
        webContainer.removeAllViews()
        webContainer.addView(wv, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
    }

    private fun buildUi() {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(getColor(R.color.bar))
            setPadding(dp(4), 0, dp(4), 0)
        }
        bar.addView(barButton(getString(R.string.home_youtube)) { player.load(Settings.HOME_YOUTUBE) })
        bar.addView(barButton(getString(R.string.home_music)) { player.load(Settings.HOME_MUSIC) })
        bar.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        bar.addView(barButton("⟳") { player.webView?.reload() })
        bgButton = barButton("") {
            val enabled = !player.settings.backgroundPlay
            player.setBackgroundPlay(enabled)
            updateBgButton()
            val msg = if (enabled) R.string.bg_toggled_on else R.string.bg_toggled_off
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }
        bar.addView(bgButton)
        updateBgButton()

        webContainer = FrameLayout(this)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, dp(44)))
            addView(webContainer, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        }
        root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.bg))
            addView(column, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        }
        // targetSdk 35 는 edge-to-edge 강제: 시스템 바/키보드 영역만큼 직접 비운다.
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener { v, insets ->
                if (customView != null) {
                    v.setPadding(0, 0, 0, 0)
                } else {
                    val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                    v.setPadding(i.left, i.top, i.right, i.bottom)
                }
                insets
            }
        }
    }

    private fun barButton(label: String, onClick: () -> Unit) = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
        text = label
        isAllCaps = false
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        minWidth = 0
        minimumWidth = 0
        setPadding(dp(10), 0, dp(10), 0)
        setOnClickListener { onClick() }
    }

    private fun updateBgButton() {
        val on = player.settings.backgroundPlay
        bgButton.text = getString(if (on) R.string.bg_on else R.string.bg_off)
        bgButton.setTextColor(if (on) getColor(R.color.accent) else Color.GRAY)
    }

    private fun setSystemBarsHidden(hidden: Boolean) {
        if (Build.VERSION.SDK_INT >= 30) {
            val c = window.insetsController ?: return
            if (hidden) {
                c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                c.hide(WindowInsets.Type.systemBars())
            } else {
                c.show(WindowInsets.Type.systemBars())
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (hidden) {
                View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            } else {
                View.SYSTEM_UI_FLAG_VISIBLE
            }
        }
    }

    private fun handleIntent(intent: Intent?) {
        val url = when (intent?.action) {
            Intent.ACTION_SEND -> UrlPolicy.extractYouTubeUrl(intent.getStringExtra(Intent.EXTRA_TEXT))
            Intent.ACTION_VIEW -> intent.data?.takeIf { UrlPolicy.isYouTube(it) }?.toString()
            else -> null
        } ?: return
        player.load(url)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
