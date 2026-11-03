package io.github.bgplay

import android.content.Context

class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("bgplay", Context.MODE_PRIVATE)

    /** Brave의 "백그라운드 동영상 재생" 토글에 해당. */
    var backgroundPlay: Boolean
        get() = prefs.getBoolean(KEY_BG, true)
        set(value) = prefs.edit().putBoolean(KEY_BG, value).apply()

    var lastUrl: String?
        get() = prefs.getString(KEY_URL, null)
        set(value) = prefs.edit().putString(KEY_URL, value).apply()

    companion object {
        private const val KEY_BG = "background_play"
        private const val KEY_URL = "last_url"
        const val HOME_YOUTUBE = "https://m.youtube.com/"
        const val HOME_MUSIC = "https://music.youtube.com/"
    }
}
