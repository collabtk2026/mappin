package io.github.bgplay

import android.os.SystemClock
import org.json.JSONObject

/** bgplay.js 가 보내는 {type:"state"} 메시지. */
data class PlaybackInfo(
    val hasMedia: Boolean = false,
    val playing: Boolean = false,
    val ended: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = -1,
    val rate: Float = 1f,
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val artworkUrl: String? = null,
    val url: String? = null,
    val canNext: Boolean = false,
    val canPrev: Boolean = false,
    /** positionMs 를 측정한 시각 (elapsedRealtime). PlaybackState 외삽에 사용. */
    val updatedAt: Long = SystemClock.elapsedRealtime(),
) {
    companion object {
        fun fromJson(o: JSONObject) = PlaybackInfo(
            hasMedia = o.optBoolean("hasMedia"),
            playing = o.optBoolean("playing"),
            ended = o.optBoolean("ended"),
            positionMs = o.secondsToMs("position") ?: 0,
            durationMs = o.secondsToMs("duration") ?: -1,
            rate = o.doubleOrNull("rate")?.toFloat() ?: 1f,
            title = o.stringOrNull("title"),
            artist = o.stringOrNull("artist"),
            album = o.stringOrNull("album"),
            artworkUrl = o.stringOrNull("artwork"),
            url = o.stringOrNull("url"),
            canNext = o.optBoolean("canNext"),
            canPrev = o.optBoolean("canPrev"),
        )

        private fun JSONObject.stringOrNull(key: String): String? =
            if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

        private fun JSONObject.doubleOrNull(key: String): Double? =
            if (isNull(key)) null else optDouble(key).takeIf { !it.isNaN() && !it.isInfinite() }

        private fun JSONObject.secondsToMs(key: String): Long? = doubleOrNull(key)?.let { (it * 1000).toLong() }
    }
}
