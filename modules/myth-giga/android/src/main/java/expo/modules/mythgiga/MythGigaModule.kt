package expo.modules.mythgiga

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

/**
 * Multi-threaded, resumable HTTP downloader.
 *
 * The design follows the GiGaGet engine used by NewPipe (initializer probes the file, the file is split
 * into fixed-size blocks, N worker threads claim blocks and write them at their offsets, finished blocks are
 * persisted so a later start resumes where it stopped, and a single-stream fallback handles servers without
 * Range support). The code is an independent implementation, not a copy of NewPipe's sources.
 */
class MythGigaModule : Module() {
  private val missions = ConcurrentHashMap<String, Mission>()

  override fun definition() = ModuleDefinition {
    Name("MythGiga")

    // Starts (or resumes) a download. Resolves when finished; rejects with a code the JS layer maps:
    // E_CANCELLED, E_EXPIRED (403/404/410: the link died, re-resolve and call again), E_NETWORK, E_IO.
    AsyncFunction("download") { id: String, url: String, headers: Map<String, String>, dest: String, threads: Int, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("E_IO", "Application context is not available", null)
        return@AsyncFunction
      }
      if (missions.containsKey(id)) {
        promise.reject("E_BUSY", "A download with this id is already running", null)
        return@AsyncFunction
      }
      val mission = Mission(context, id, url, headers, dest, threads.coerceIn(1, 16))
      missions[id] = mission
      Thread({
        try {
          val bytes = mission.run()
          promise.resolve(mapOf("bytes" to bytes))
        } catch (e: MissionException) {
          promise.reject(e.code, e.message, e)
        } catch (e: Throwable) {
          promise.reject("E_IO", e.message ?: e.javaClass.simpleName, e)
        } finally {
          missions.remove(id)
        }
      }, "giga-$id").start()
    }

    Function("progress") { id: String ->
      missions[id]?.snapshot()
    }

    // keepProgress=true pauses (the block map stays on disk so the next start resumes).
    Function("cancel") { id: String, keepProgress: Boolean ->
      missions[id]?.cancel()
      if (!keepProgress) {
        appContext.reactContext?.applicationContext?.let { Mission.deleteMeta(it, id) }
      }
    }

    Function("forget") { id: String ->
      appContext.reactContext?.applicationContext?.let { Mission.deleteMeta(it, id) }
    }
  }
}
