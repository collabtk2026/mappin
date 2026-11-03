package io.github.bgplay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * 백그라운드 재생의 OS 레이어.
 *
 * - mediaPlayback 타입 포그라운드 서비스: 앱 프로세스(=WebView 브라우저 프로세스)가 백그라운드에서
 *   죽거나 캐시 상태로 얼지 않게 한다. Brave/Chrome 은 Chromium 의 미디어 알림 서비스가 이 역할을 한다.
 * - MediaSession: 잠금화면/알림/블루투스/이어폰 버튼 -> bgplay.js 명령.
 * - WakeLock/WifiLock: 화면이 꺼진 뒤에도 스트리밍 유지.
 */
class PlaybackService : Service(), PlayerController.Listener {

    private lateinit var session: MediaSession
    private val artwork = ArtworkLoader()
    private val notifications by lazy { getSystemService(NOTIFICATION_SERVICE) as NotificationManager }
    private val handler = Handler(Looper.getMainLooper())
    private val idleStop = Runnable { stopSelf() }
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // 이어폰 분리/블루투스 끊김 -> 스피커로 터지지 않게 정지
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) player.command("pause")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createChannel()
        session = MediaSession(this, "BgPlay").apply {
            setCallback(SessionCallback())
            setSessionActivity(contentIntent())
            isActive = true
        }
        // startForegroundService() 후 몇 초 안에 반드시 호출해야 한다.
        startInForeground(buildNotification(player.info))
        val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(noisyReceiver, filter)
        }
        player.addListener(this)
        onPlaybackChanged(player.info)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> player.command("play")
            ACTION_PAUSE -> player.command("pause")
            ACTION_NEXT -> player.skipNext()
            ACTION_PREV -> player.skipPrev()
            ACTION_SAVE -> player.quickSaveFromBackground()
            ACTION_CLOSE -> {
                player.command("pause")
                stopSelf()
            }
            else -> startInForeground(buildNotification(player.info))
        }
        // 프로세스가 죽으면 WebView 상태도 없으므로 재시작하지 않는다.
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // 최근 앱에서 스와이프로 지워도 재생 중이면 계속(알림의 닫기로 종료). 멈춰 있으면 정리.
        if (!player.info.playing) stopSelf()
    }

    override fun onDestroy() {
        isRunning = false
        player.removeListener(this)
        handler.removeCallbacks(idleStop)
        runCatching { unregisterReceiver(noisyReceiver) }
        releaseLocks()
        session.isActive = false
        session.release()
        artwork.shutdown()
        if (Build.VERSION.SDK_INT >= 33) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        super.onDestroy()
    }

    // --------------------------------------------------------------------------------------------

    override fun onPlaybackChanged(info: PlaybackInfo) {
        session.setPlaybackState(buildState(info))
        session.setMetadata(buildMetadata(info))
        artwork.load(info.artworkUrl) { onPlaybackChanged(player.info) }
        notifications.notify(NOTIFICATION_ID, buildNotification(info))

        handler.removeCallbacks(idleStop)
        if (info.playing) {
            acquireLocks()
        } else {
            releaseLocks()
            handler.postDelayed(idleStop, IDLE_TIMEOUT_MS) // 오래 멈춰 있으면 서비스 종료
        }
    }

    private fun buildState(info: PlaybackInfo): PlaybackState {
        var actions = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP
        if (info.durationMs > 0) actions = actions or PlaybackState.ACTION_SEEK_TO
        if (info.canNext || player.hasQueueNext) actions = actions or PlaybackState.ACTION_SKIP_TO_NEXT
        // "이전"은 핸들러가 없어도 처음으로 되감기로 동작한다.
        if (info.hasMedia) actions = actions or PlaybackState.ACTION_SKIP_TO_PREVIOUS
        val state = when {
            info.playing -> PlaybackState.STATE_PLAYING
            info.hasMedia -> PlaybackState.STATE_PAUSED
            else -> PlaybackState.STATE_NONE
        }
        val b = PlaybackState.Builder()
        // Android 13+ 미디어 컨트롤(잠금화면/알림)에 "＋ 임시 저장" 버튼
        if (UrlPolicy.videoIdOf(info.url) != null) {
            b.addCustomAction(
                PlaybackState.CustomAction.Builder(CUSTOM_SAVE, getString(R.string.action_save), R.drawable.ic_action_save).build()
            )
        }
        return b
            .setActions(actions)
            .setState(state, info.positionMs, info.rate, info.updatedAt)
            .build()
    }

    private fun buildMetadata(info: PlaybackInfo): MediaMetadata {
        val b = MediaMetadata.Builder()
        b.putString(MediaMetadata.METADATA_KEY_TITLE, info.title ?: getString(R.string.app_name))
        info.artist?.let { b.putString(MediaMetadata.METADATA_KEY_ARTIST, it) }
        info.album?.let { b.putString(MediaMetadata.METADATA_KEY_ALBUM, it) }
        if (info.durationMs > 0) b.putLong(MediaMetadata.METADATA_KEY_DURATION, info.durationMs)
        artwork.get(info.artworkUrl)?.let { b.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it) }
        return b.build()
    }

    private fun buildNotification(info: PlaybackInfo): Notification {
        val playPause = if (info.playing) {
            action(android.R.drawable.ic_media_pause, R.string.action_pause, ACTION_PAUSE)
        } else {
            action(android.R.drawable.ic_media_play, R.string.action_play, ACTION_PLAY)
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_bgplay)
            .setContentTitle(info.title ?: getString(R.string.nothing_playing))
            .setContentText(listOfNotNull(info.artist, player.queueName).joinToString(" · "))
            .setLargeIcon(artwork.get(info.artworkUrl))
            .setContentIntent(contentIntent())
            .setOngoing(info.playing)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(action(android.R.drawable.ic_media_previous, R.string.action_prev, ACTION_PREV))
            .addAction(playPause)
            .addAction(action(android.R.drawable.ic_media_next, R.string.action_next, ACTION_NEXT))
            .addAction(action(R.drawable.ic_action_save, R.string.action_save, ACTION_SAVE))
            .addAction(action(android.R.drawable.ic_menu_close_clear_cancel, R.string.action_close, ACTION_CLOSE))
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()
    }

    private fun action(icon: Int, title: Int, action: String): Notification.Action {
        val pi = PendingIntent.getService(
            this, action.hashCode(),
            Intent(this, PlaybackService::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return Notification.Action.Builder(Icon.createWithResource(this, icon), getString(title), pi).build()
    }

    private fun contentIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun startInForeground(n: Notification) {
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
    }

    private fun createChannel() {
        val ch = NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
        ch.description = getString(R.string.channel_desc)
        ch.setShowBadge(false)
        notifications.createNotificationChannel(ch)
    }

    private fun acquireLocks() {
        val wl = wakeLock ?: (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BgPlay:playback")
            .apply { setReferenceCounted(false) }
            .also { wakeLock = it }
        wl.acquire(WAKE_LOCK_TIMEOUT_MS) // 재획득 시 타임아웃 갱신
        @Suppress("DEPRECATION")
        val wifi = wifiLock ?: (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "BgPlay:playback")
            .apply { setReferenceCounted(false) }
            .also { wifiLock = it }
        if (!wifi.isHeld) wifi.acquire()
    }

    private fun releaseLocks() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wifiLock?.takeIf { it.isHeld }?.release()
    }

    private inner class SessionCallback : MediaSession.Callback() {
        override fun onPlay() = player.command("play")
        override fun onPause() = player.command("pause")
        override fun onSkipToNext() = player.skipNext()
        override fun onSkipToPrevious() = player.skipPrev()
        override fun onCustomAction(action: String, extras: android.os.Bundle?) {
            if (action == CUSTOM_SAVE) player.quickSaveFromBackground()
        }
        override fun onSeekTo(pos: Long) = player.command("seekto", pos / 1000.0)
        override fun onStop() {
            player.command("pause")
            stopSelf()
        }
    }

    companion object {
        @Volatile
        var isRunning = false
            private set

        private const val CHANNEL_ID = "playback"
        private const val NOTIFICATION_ID = 1
        private const val IDLE_TIMEOUT_MS = 30 * 60 * 1000L
        private const val WAKE_LOCK_TIMEOUT_MS = 3 * 60 * 60 * 1000L

        private const val ACTION_PLAY = "io.github.bgplay.PLAY"
        private const val ACTION_PAUSE = "io.github.bgplay.PAUSE"
        private const val ACTION_NEXT = "io.github.bgplay.NEXT"
        private const val ACTION_PREV = "io.github.bgplay.PREV"
        private const val ACTION_CLOSE = "io.github.bgplay.CLOSE"
        private const val ACTION_SAVE = "io.github.bgplay.SAVE"
        private const val CUSTOM_SAVE = "save_to_inbox"

        fun stop(context: Context) {
            context.stopService(Intent(context, PlaybackService::class.java))
        }
    }
}
