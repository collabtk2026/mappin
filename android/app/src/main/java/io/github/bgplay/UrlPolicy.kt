package io.github.bgplay

import android.net.Uri

/** WebView 안에서 열 호스트. 나머지는 외부 브라우저/앱으로 넘긴다. */
object UrlPolicy {
    private val suffixes = listOf(
        "youtube.com", "youtu.be", "youtube-nocookie.com", "ytimg.com", "ggpht.com",
        "googlevideo.com", "gstatic.com", "googleusercontent.com", "google.com",
    )
    // accounts.google.co.kr 같은 국가별 Google 도메인 (로그인 리다이렉트)
    private val googleCountry = Regex("""(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$""")

    fun isInternal(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "https" && scheme != "http") return false
        val host = uri.host?.lowercase() ?: return false
        return suffixes.any { host == it || host.endsWith(".$it") } || googleCountry.containsMatchIn(host)
    }

    fun isYouTube(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return false
        return host == "youtube.com" || host.endsWith(".youtube.com") || host == "youtu.be"
    }

    private val videoId = Regex("^[A-Za-z0-9_-]{11}$")

    /** core.js parseVideo 와 같은 규칙: watch?v= / youtu.be / shorts / live / embed. */
    fun videoIdOf(url: String?): String? {
        if (url == null) return null
        val uri = Uri.parse(url)
        if (!isYouTube(uri)) return null
        val host = uri.host!!.lowercase()
        val segs = uri.pathSegments
        val id = when {
            host == "youtu.be" -> segs.firstOrNull()
            uri.isHierarchical && uri.getQueryParameter("v") != null -> uri.getQueryParameter("v")
            segs.size >= 2 && segs[0] in setOf("shorts", "live", "embed", "v") -> segs[1]
            else -> null
        }
        return id?.takeIf { videoId.matches(it) }
    }

    /** 공유 텍스트("제목 https://youtu.be/xxx") 에서 첫 YouTube URL 추출. */
    fun extractYouTubeUrl(text: String?): String? {
        if (text == null) return null
        return Regex("""https?://\S+""").findAll(text)
            .map { it.value.trimEnd('.', ',', ')', ']') }
            .firstOrNull { isYouTube(Uri.parse(it)) }
    }
}
