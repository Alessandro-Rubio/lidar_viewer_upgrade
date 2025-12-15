from pathlib import Path
from laz_processor import LazProcessor


class StreamProcessor:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.laz = LazProcessor()

    async def stream_all(self, ws):
        laz_files = sorted(self.data_dir.glob("*.laz"))

        print(f"📂 Archivos encontrados: {len(laz_files)}")

        for laz_file in laz_files:
            print(f"📦 Enviando {laz_file}")

            las = self.laz.load_laz(laz_file)
            buffer, count = self.laz.build_buffer(las)

            await ws.send_bytes(buffer)

            print(f"📤 {count} puntos enviados")
