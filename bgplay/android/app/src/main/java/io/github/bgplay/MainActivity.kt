package io.github.bgplay

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView

/**
 * WebView 를 화면에 붙이는 껍데기. WebView 자체는 PlayerController 가 소유하므로
 * 이 Activity 가 백그라운드로 가거나 파괴돼도 재생은 계속된다.
 */
class MainActivity : Activity(), UiHost, LibraryController.Host {

    private lateinit var root: FrameLayout
    private lateinit var webContainer: FrameLayout
    private lateinit var libraryButton: Button
    private lateinit var library: LibraryController
    private lateinit var snackBar: LinearLayout
    private lateinit var snackText: TextView
    private lateinit var snackAction: Button
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        setContentView(root)
        player.uiHost = this
        player.library = library
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
        if (player.library === library) player.library = null
        library.destroy()
        player.detach(this)
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val wv = player.webView
        when {
            customView != null -> customCallback?.onCustomViewHidden() ?: onHideCustomView()
            library.isShowing -> library.back()
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
            setPadding(dp(2), 0, dp(2), 0)
        }
        bar.addView(barButton(getString(R.string.home_youtube)) { player.load(Settings.HOME_YOUTUBE) })
        bar.addView(barButton(getString(R.string.home_music)) { player.load(Settings.HOME_MUSIC) })
        bar.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        // ① 임시 저장: 탭 한 번, 아무것도 묻지 않음. 길게 누르면 바로 분류 시트.
        bar.addView(barButton(getString(R.string.btn_quick_save), accent = true) { quickSave() }.apply {
            setOnLongClickListener { classify(); true }
        })
        // ② 분류 저장: 카테고리/태그 시트
        bar.addView(barButton(getString(R.string.btn_classify)) { classify() })
        libraryButton = barButton(getString(R.string.btn_library)) { library.openLibrary(player.currentTrack()) }
        bar.addView(libraryButton)
        bar.addView(barButton("⋮") { v -> showMenu(v) })

        webContainer = FrameLayout(this)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, dp(44)))
            addView(webContainer, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        }
        library = LibraryController(this, libraryStore, this)
        snackBar = buildSnackBar()
        root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.bg))
            addView(column, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(library.view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(snackBar, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM).apply {
                setMargins(dp(12), 0, dp(12), dp(16))
            })
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

    private fun barButton(label: String, accent: Boolean = false, onClick: (View) -> Unit) =
        Button(this, null, android.R.attr.borderlessButtonStyle).apply {
            text = label
            isAllCaps = false
            setTextColor(if (accent) getColor(R.color.accent) else Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            minWidth = 0
            minimumWidth = 0
            minHeight = 0
            minimumHeight = 0
            setPadding(dp(8), 0, dp(8), 0)
            setOnClickListener(onClick)
        }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        menu.menu.add(0, 1, 0, R.string.menu_reload)
        menu.menu.add(0, 2, 1, R.string.menu_bg).apply {
            isCheckable = true
            isChecked = player.settings.backgroundPlay
        }
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> player.webView?.reload()
                2 -> {
                    val enabled = !player.settings.backgroundPlay
                    player.setBackgroundPlay(enabled)
                    snack(getString(if (enabled) R.string.bg_toggled_on else R.string.bg_toggled_off))
                }
            }
            true
        }
        menu.show()
    }

    // ---------------------------------------------------------------- 임시 저장 / 분류

    private fun quickSave() {
        val track = player.currentTrack() ?: return snack(getString(R.string.nothing_to_save))
        library.quickSave(track) { r ->
            when (r?.optString("status")) {
                "added" -> snack(getString(R.string.saved_to_inbox), getString(R.string.snack_classify)) { library.openSave(track) }
                "duplicate" -> {
                    val where = r.optJSONArray("where")
                    val names = (0 until (where?.length() ?: 0)).map { where!!.optString(it) }
                    val text = if (names.isEmpty()) getString(R.string.already_in_inbox)
                    else getString(R.string.already_in, names.joinToString(", "))
                    snack(text, getString(R.string.snack_classify)) { library.openSave(track) }
                }
                else -> snack(getString(R.string.nothing_to_save))
            }
        }
    }

    private fun classify() {
        val track = player.currentTrack() ?: return snack(getString(R.string.nothing_to_save))
        library.openSave(track)
    }

    // ---------------------------------------------------------------- LibraryController.Host

    override fun onLibraryStats(inbox: Int, total: Int) {
        libraryButton.text = if (inbox > 0) getString(R.string.btn_library_n, inbox) else getString(R.string.btn_library)
    }

    override fun onLibraryClosed() {}

    override fun onLibraryPlay(url: String, keepOpen: Boolean) = player.playSingle(url)

    override fun onLibraryPlayQueue(name: String, items: List<QueueItem>, index: Int) =
        player.playQueue(name, items, index)

    override fun onLibraryToast(text: String) = snack(text)

    override fun onLibraryExport(json: String, filename: String) {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, filename)
            .putExtra(Intent.EXTRA_TEXT, json)
        startActivity(Intent.createChooser(send, getString(R.string.export_title)))
    }

    // ---------------------------------------------------------------- 스낵바

    private fun buildSnackBar(): LinearLayout {
        val bg = GradientDrawable().apply {
            setColor(0xFF2F2F2F.toInt())
            cornerRadius = dp(12).toFloat()
        }
        snackText = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        }
        snackAction = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
            setTextColor(getColor(R.color.accent))
            isAllCaps = false
            minWidth = 0
            minimumWidth = 0
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = bg
            setPadding(dp(16), dp(4), dp(4), dp(4))
            elevation = dp(6).toFloat()
            visibility = View.GONE
            addView(snackText, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            addView(snackAction)
        }
    }

    private val hideSnack = Runnable { snackBar.visibility = View.GONE }

    private fun snack(text: String, actionLabel: String? = null, action: (() -> Unit)? = null) {
        snackText.text = text
        if (actionLabel != null && action != null) {
            snackAction.visibility = View.VISIBLE
            snackAction.text = actionLabel
            snackAction.setOnClickListener {
                snackBar.visibility = View.GONE
                action()
            }
        } else {
            snackAction.visibility = View.GONE
        }
        snackBar.visibility = View.VISIBLE
        snackBar.bringToFront()
        snackBar.removeCallbacks(hideSnack)
        snackBar.postDelayed(hideSnack, 4000)
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
        player.playSingle(url)
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
