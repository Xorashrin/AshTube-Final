package expo.modules.mythgiga

import android.content.Context
import android.net.Uri
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.Collections
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class MissionException(val code: String, message: String) : IOException(message)

private const val BLOCK_SIZE = 1024L * 1024L
private const val BUFFER_SIZE = 64 * 1024
private const val MAX_ATTEMPTS = 5

class Mission(
  private val context: Context,
  private val id: String,
  private val url: String,
  private val headers: Map<String, String>,
  private val dest: String,
  private val threads: Int,
) {
  @Volatile private var cancelled = false
  @Volatile private var failure: MissionException? = null
  @Volatile private var state = "starting"
  @Volatile private var total = 0L
  private val downloaded = AtomicLong(0)
  private val calls: MutableList<Call> = Collections.synchronizedList(mutableListOf())
  private var lastSampleBytes = 0L
  private var lastSampleAt = System.currentTimeMillis()
  private var lastSpeed = 0L

  private val client: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .retryOnConnectionFailure(true)
    .build()

  fun cancel() {
    cancelled = true
    synchronized(calls) { calls.forEach { it.cancel() } }
  }

  @Synchronized
  fun snapshot(): Map<String, Any?> {
    val now = System.currentTimeMillis()
    val bytes = downloaded.get()
    if (now - lastSampleAt >= 800) {
      lastSpeed = ((bytes - lastSampleBytes) * 1000) / (now - lastSampleAt)
      lastSampleBytes = bytes
      lastSampleAt = now
    }
    return mapOf("downloaded" to bytes, "total" to total, "state" to state, "speed" to lastSpeed)
  }

  private fun request(rangeStart: Long?, rangeEnd: Long?): Request {
    val b = Request.Builder().url(url)
    headers.forEach { (k, v) -> b.header(k, v) }
    if (rangeStart != null) b.header("Range", "bytes=$rangeStart-${rangeEnd ?: ""}")
    return b.build()
  }

  // ------------------------------------------------------------ destination

  private fun openChannel(truncate: Boolean): Pair<FileChannel, () -> Unit> {
    if (dest.startsWith("content://")) {
      val pfd = context.contentResolver.openFileDescriptor(Uri.parse(dest), if (truncate) "rwt" else "rw")
        ?: throw MissionException("E_IO", "Cannot open the selected folder file")
      val stream = FileOutputStream(pfd.fileDescriptor)
      return stream.channel to { runCatching { stream.close() }; runCatching { pfd.close() }; Unit }
    }
    val path = if (dest.startsWith("file://")) Uri.parse(dest).path!! else dest
    val file = File(path)
    file.parentFile?.mkdirs()
    val raf = RandomAccessFile(file, "rw")
    if (truncate) raf.setLength(0)
    return raf.channel to { runCatching { raf.close() }; Unit }
  }

  // ------------------------------------------------------------ resume metadata

  private fun metaFile(): File = File(File(context.filesDir, "giga").apply { mkdirs() }, "${safe(id)}.json")

  private fun loadMeta(expectedTotal: Long, blocks: Int): BooleanArray? {
    return try {
      val f = metaFile()
      if (!f.exists()) return null
      val o = JSONObject(f.readText())
      if (o.getString("dest") != dest || o.getLong("total") != expectedTotal || o.getLong("block") != BLOCK_SIZE) return null
      val done = BooleanArray(blocks)
      val arr = o.getJSONArray("done")
      for (i in 0 until arr.length()) {
        val idx = arr.getInt(i)
        if (idx in 0 until blocks) done[idx] = true
      }
      done
    } catch (e: Throwable) {
      null
    }
  }

  private var lastMetaWrite = 0L

  private fun saveMeta(done: BooleanArray, force: Boolean) {
    val now = System.currentTimeMillis()
    if (!force && now - lastMetaWrite < 1500) return
    lastMetaWrite = now
    try {
      val arr = JSONArray()
      synchronized(done) { done.forEachIndexed { i, d -> if (d) arr.put(i) } }
      val o = JSONObject().put("dest", dest).put("total", total).put("block", BLOCK_SIZE).put("done", arr)
      metaFile().writeText(o.toString())
    } catch (_: Throwable) {
    }
  }

  // ------------------------------------------------------------ run

  fun run(): Long {
    try {
      val probe = probe()
      return if (probe.rangeOk && probe.total > 0) segmented(probe.total) else single(probe.total)
    } catch (e: MissionException) {
      state = if (e.code == "E_CANCELLED") "cancelled" else "failed"
      throw e
    } catch (e: IOException) {
      state = if (cancelled) "cancelled" else "failed"
      throw if (cancelled) MissionException("E_CANCELLED", "Cancelled") else MissionException("E_NETWORK", e.message ?: "Network error")
    }
  }

  private class Probe(val rangeOk: Boolean, val total: Long)

  /** Initializer step: one tiny ranged request tells us whether Range works and how big the file is. */
  private fun probe(): Probe {
    val call = client.newCall(request(0, 0))
    calls.add(call)
    try {
      return call.execute().use { r ->
        when {
          r.code == 206 -> {
            val total = r.header("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: 0L
            Probe(total > 0, total)
          }
          r.code == 200 -> Probe(false, r.header("Content-Length")?.toLongOrNull() ?: 0L)
          r.code == 401 || r.code == 403 || r.code == 404 || r.code == 410 -> throw MissionException("E_EXPIRED", "HTTP ${r.code}")
          else -> throw MissionException("E_NETWORK", "HTTP ${r.code}")
        }
      }
    } finally {
      calls.remove(call)
    }
  }

  private fun segmented(size: Long): Long {
    total = size
    val blocks = ((size + BLOCK_SIZE - 1) / BLOCK_SIZE).toInt()
    val saved = loadMeta(size, blocks)
    val done = saved ?: BooleanArray(blocks)
    var already = 0L
    for (i in 0 until blocks) if (done[i]) already += blockLength(i, size)
    downloaded.set(already)
    state = "downloading"

    val (channel, close) = openChannel(truncate = saved == null)
    try {
      val next = AtomicInteger(0)
      val workers = (1..minOf(threads, blocks)).map {
        Thread({
          try {
            while (!cancelled && failure == null) {
              val idx = next.getAndIncrement()
              if (idx >= blocks) break
              if (synchronized(done) { done[idx] }) continue
              fetchBlock(idx, size, channel)
              synchronized(done) { done[idx] = true }
              saveMeta(done, false)
            }
          } catch (e: MissionException) {
            if (failure == null) failure = e
            cancelCalls()
          } catch (e: Throwable) {
            if (failure == null) failure = MissionException(if (cancelled) "E_CANCELLED" else "E_NETWORK", e.message ?: "Network error")
            cancelCalls()
          }
        }, "giga-$id-w$it").also { it.start() }
      }
      workers.forEach { it.join() }
      saveMeta(done, true)
      if (cancelled) throw MissionException("E_CANCELLED", "Cancelled")
      failure?.let { throw it }
      if (synchronized(done) { done.any { !it } }) throw MissionException("E_IO", "Download incomplete")
      state = "done"
      metaFile().delete()
      return size
    } finally {
      close()
    }
  }

  private fun cancelCalls() {
    synchronized(calls) { calls.forEach { it.cancel() } }
  }

  private fun blockLength(idx: Int, size: Long): Long = minOf(BLOCK_SIZE, size - idx * BLOCK_SIZE)

  private fun fetchBlock(idx: Int, size: Long, channel: FileChannel) {
    val start = idx * BLOCK_SIZE
    val end = start + blockLength(idx, size) - 1
    var attempt = 0
    var fatal = 0
    while (true) {
      if (cancelled || failure != null) throw MissionException("E_CANCELLED", "Cancelled")
      var counted = 0L
      val call = client.newCall(request(start, end))
      calls.add(call)
      try {
        call.execute().use { r ->
          if (r.code == 401 || r.code == 403 || r.code == 404 || r.code == 410) {
            fatal++
            if (fatal >= 2) throw MissionException("E_EXPIRED", "HTTP ${r.code}")
            throw IOException("HTTP ${r.code}")
          }
          if (r.code != 206) throw MissionException("E_NETWORK", "Server stopped honoring Range (HTTP ${r.code})")
          val body = r.body ?: throw IOException("Empty body")
          val buf = ByteArray(BUFFER_SIZE)
          var pos = start
          body.byteStream().use { input ->
            while (pos <= end) {
              if (cancelled || failure != null) throw MissionException("E_CANCELLED", "Cancelled")
              val n = input.read(buf, 0, minOf(buf.size.toLong(), end - pos + 1).toInt())
              if (n < 0) break
              val bb = ByteBuffer.wrap(buf, 0, n)
              var written = 0
              while (bb.hasRemaining()) written += channel.write(bb, pos + written)
              pos += n
              counted += n
              downloaded.addAndGet(n.toLong())
            }
          }
          if (pos <= end) throw IOException("Block $idx ended early")
        }
        return
      } catch (e: MissionException) {
        downloaded.addAndGet(-counted)
        throw e
      } catch (e: IOException) {
        downloaded.addAndGet(-counted)
        if (cancelled) throw MissionException("E_CANCELLED", "Cancelled")
        attempt++
        if (attempt >= MAX_ATTEMPTS) throw MissionException("E_NETWORK", e.message ?: "Network error")
        Thread.sleep(400L * attempt)
      } finally {
        calls.remove(call)
      }
    }
  }

  /** Fallback for servers without Range support: one stream, no resume. */
  private fun single(knownTotal: Long): Long {
    total = knownTotal
    downloaded.set(0)
    state = "downloading"
    val (channel, close) = openChannel(truncate = true)
    val call = client.newCall(request(null, null))
    calls.add(call)
    try {
      call.execute().use { r ->
        if (r.code == 401 || r.code == 403 || r.code == 404 || r.code == 410) throw MissionException("E_EXPIRED", "HTTP ${r.code}")
        if (!r.isSuccessful) throw MissionException("E_NETWORK", "HTTP ${r.code}")
        if (total == 0L) total = r.header("Content-Length")?.toLongOrNull() ?: 0L
        val body = r.body ?: throw IOException("Empty body")
        val buf = ByteArray(BUFFER_SIZE)
        var pos = 0L
        body.byteStream().use { input ->
          while (true) {
            if (cancelled) throw MissionException("E_CANCELLED", "Cancelled")
            val n = input.read(buf)
            if (n < 0) break
            val bb = ByteBuffer.wrap(buf, 0, n)
            var written = 0
            while (bb.hasRemaining()) written += channel.write(bb, pos + written)
            pos += n
            downloaded.addAndGet(n.toLong())
          }
        }
        if (total > 0 && pos < total) throw IOException("Connection closed early")
        state = "done"
        return pos
      }
    } finally {
      calls.remove(call)
      close()
    }
  }

  companion object {
    private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9_-]"), "_")

    fun deleteMeta(context: Context, id: String) {
      File(File(context.filesDir, "giga"), "${safe(id)}.json").delete()
    }
  }
}
