package io.github.bgplay

import android.content.Context
import android.util.AtomicFile
import android.util.Log
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.util.concurrent.Executors

/**
 * 보관함 데이터 저장소. 데이터 모델과 로직은 공용 웹 모듈(shared/web/library/core.js)이 갖고,
 * 네이티브는 JSON 문자열을 원자적으로 저장만 한다.
 *
 * pending: 보관함 화면(WebView)이 없을 때(알림/잠금화면의 "임시 저장") 들어온 곡.
 * 다음에 보관함이 뜨면 quickSave 로 반영된다.
 */
class LibraryStore(context: Context) {
    private val file = AtomicFile(File(context.filesDir, "library.json"))
    private val pendingFile = AtomicFile(File(context.filesDir, "library_pending.json"))
    private val io = Executors.newSingleThreadExecutor()

    fun read(): String? = try {
        String(file.readFully(), Charsets.UTF_8)
    } catch (e: FileNotFoundException) {
        null
    }

    /** 순서 보장을 위해 단일 스레드에서 기록. */
    fun write(json: String) = io.execute { writeNow(file, json) }

    @Synchronized
    fun addPending(track: JSONObject) {
        val arr = readPending()
        arr.put(track)
        writeNow(pendingFile, arr.toString())
    }

    @Synchronized
    fun takePending(): JSONArray {
        val arr = readPending()
        if (arr.length() > 0) pendingFile.delete()
        return arr
    }

    private fun readPending(): JSONArray = try {
        JSONArray(String(pendingFile.readFully(), Charsets.UTF_8))
    } catch (e: FileNotFoundException) {
        JSONArray()
    } catch (e: JSONException) {
        JSONArray()
    }

    private fun writeNow(target: AtomicFile, text: String) {
        val out = try {
            target.startWrite()
        } catch (e: Exception) {
            Log.e("BgPlay", "library write failed", e)
            return
        }
        try {
            out.write(text.toByteArray(Charsets.UTF_8))
            target.finishWrite(out)
        } catch (e: Exception) {
            target.failWrite(out)
            Log.e("BgPlay", "library write failed", e)
        }
    }
}
