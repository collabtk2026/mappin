package io.github.bgplay

import android.app.Application
import android.content.Context

class BgPlayApp : Application() {
    /** WebView와 재생 상태는 Activity가 아니라 프로세스 수명에 묶는다(Activity가 사라져도 재생 유지). */
    val player: PlayerController by lazy { PlayerController(this) }
    val library: LibraryStore by lazy { LibraryStore(this) }
}

val Context.player: PlayerController
    get() = (applicationContext as BgPlayApp).player

val Context.libraryStore: LibraryStore
    get() = (applicationContext as BgPlayApp).library
