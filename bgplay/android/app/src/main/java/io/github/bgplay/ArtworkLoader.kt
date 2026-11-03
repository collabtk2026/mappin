package io.github.bgplay

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** 알림/잠금화면용 앨범아트. 마지막 1개만 캐시. */
class ArtworkLoader {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var cachedUrl: String? = null
    private var cached: Bitmap? = null
    private var inFlight: String? = null

    fun get(url: String?): Bitmap? = if (url != null && url == cachedUrl) cached else null

    /** 캐시에 없으면 받아서 onLoaded 를 메인 스레드에서 호출. */
    fun load(url: String?, onLoaded: () -> Unit) {
        if (url == null || url == cachedUrl || url == inFlight) return
        if (!url.startsWith("https://")) return
        inFlight = url
        executor.execute {
            val bmp = runCatching { fetch(url) }.getOrNull()
            main.post {
                if (inFlight == url) inFlight = null
                if (bmp != null) {
                    cachedUrl = url
                    cached = bmp
                    onLoaded()
                }
            }
        }
    }

    private fun fetch(url: String): Bitmap? {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        return try {
            val bytes = conn.inputStream.use { it.readBytes() }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 512 && bounds.outHeight / (sample * 2) >= 512) sample *= 2
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        } finally {
            conn.disconnect()
        }
    }

    fun shutdown() = executor.shutdownNow()
}
