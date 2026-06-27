from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from tqdm import tqdm
import yt_dlp


PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLDa9XDOOJcNLH4O-uOiDWzrMloGAfWWh0"

CARPETA_DESTINO = Path(
    r"F:\Sol Argentino TV - LIBRERIA DE AUDIO\JugandoConNatalia - Dying Light"
)

MAX_CALIDAD = 1080

# MODO DEMENCIAL
VIDEOS_EN_PARALELO = 23
FRAGMENTOS_POR_VIDEO = 700  # 23 x 26 = 598 conexiones aprox.

CARPETA_DESTINO.mkdir(parents=True, exist_ok=True)


class LoggerSilencioso:
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        pass


def obtener_videos_playlist():
    opciones = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "ignoreerrors": True,
        "logger": LoggerSilencioso(),
    }

    with yt_dlp.YoutubeDL(opciones) as ydl:
        info = ydl.extract_info(PLAYLIST_URL, download=False)

    videos = []

    for i, entry in enumerate(info.get("entries", []), start=1):
        if not entry:
            continue

        video_id = entry.get("id") or entry.get("url")
        video_url = entry.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}"

        videos.append({
            "index": i,
            "url": video_url,
        })

    return videos


def descargar_video(video):
    index = video["index"]
    url = video["url"]

    opciones = {
        # Mejor video REAL hasta 1080p + mejor audio.
        # No escala, no recodifica, no inventa falso 720/1080.
        "format": f"bv*[height<={MAX_CALIDAD}]+ba/b[height<={MAX_CALIDAD}]",

        # MP4 final si es posible.
        # FFmpeg une/remuxa; no convierte la calidad.
        "merge_output_format": "mp4",

        # Nombre: 01 Título.mp4
        "outtmpl": str(CARPETA_DESTINO / f"{index:02d} %(title)s.%(ext)s"),

        # Casi 600 conexiones en total
        "concurrent_fragment_downloads": FRAGMENTOS_POR_VIDEO,

        # Consola limpia: sin barra individual por video
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": LoggerSilencioso(),

        # Reintentos fuertes
        "retries": 30,
        "fragment_retries": 30,
        "extractor_retries": 10,
        "file_access_retries": 10,
        "socket_timeout": 30,
        "continuedl": True,

        # No aceptar fragmentos faltantes
        "skip_unavailable_fragments": False,

        # Cada hilo baja solo su video, no toda la playlist otra vez
        "noplaylist": True,

        # Windows
        "windowsfilenames": True,
    }

    with yt_dlp.YoutubeDL(opciones) as ydl:
        ydl.download([url])

    return index


def main():
    videos = obtener_videos_playlist()

    if not videos:
        print("No se encontraron videos.")
        return

    total = len(videos)

    print(f"Videos encontrados: {total}")
    print(f"Duración total estimada: 13 h 52 min 07 s")
    print(f"Destino: {CARPETA_DESTINO}")
    print(f"Modo: {VIDEOS_EN_PARALELO} videos x {FRAGMENTOS_POR_VIDEO} fragmentos")
    print(f"Conexiones aprox: {VIDEOS_EN_PARALELO * FRAGMENTOS_POR_VIDEO}")
    print("Descargando en modo demencial...")

    with tqdm(
        total=total,
        desc="Playlist completa",
        unit="video",
        dynamic_ncols=True,
        leave=True,
    ) as barra:
        with ThreadPoolExecutor(max_workers=VIDEOS_EN_PARALELO) as executor:
            tareas = [executor.submit(descargar_video, video) for video in videos]

            for tarea in as_completed(tareas):
                try:
                    tarea.result()
                except Exception as e:
                    tqdm.write(f"Error en un video: {e}")

                barra.update(1)

    print("LISTO. Descarga terminada.")


if __name__ == "__main__":
    main()