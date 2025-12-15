from pathlib import Path
from stream_processor import StreamProcessor


class WebSocketHandler:
    def __init__(self):
        # 📂 Directorio donde están los LAZ
        data_dir = Path("data")
        self.sp = StreamProcessor(data_dir)

    async def handle(self, ws, chunk_size: int):
        print(f"🔵 WS conectado | chunk_size={chunk_size}")
        try:
            await self.sp.stream_all(ws)
        except Exception as e:
            print(f"❌ ERROR WS: {e}")
        finally:
            print("🔴 WS cerrado")
