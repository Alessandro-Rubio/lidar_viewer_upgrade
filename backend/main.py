import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter
import uvicorn

app = FastAPI()
router = APIRouter()

# ───────────────────────────────
# MOCK DE LECTURA (REEMPLAZA POR LAZ REAL)
# ───────────────────────────────
def read_chunks(file, chunk_size):
    import random
    import struct

    for _ in range(50):
        data = bytearray()
        for _ in range(chunk_size):
            data.extend(struct.pack(
                "ffffff",
                random.random() * 100,
                random.random() * 100,
                random.random() * 100,
                random.random(),
                random.random(),
                random.random()
            ))
        yield bytes(data)


# ───────────────────────────────
# WEBSOCKET
# ───────────────────────────────
@router.websocket("/ws/binary-stream")
async def ws_stream(websocket: WebSocket, chunk_size: int = 150_000):
    await websocket.accept()
    print("🔵 WS conectado")

    paused = False

    async def control_channel():
        nonlocal paused
        try:
            while True:
                msg = await websocket.receive_text()
                if msg == "PAUSE":
                    paused = True
                    print("⏸️ Stream pausado")
                elif msg == "RESUME":
                    paused = False
                    print("▶️ Stream reanudado")
        except WebSocketDisconnect:
            pass

    asyncio.create_task(control_channel())

    try:
        laz_files = [
            "file1.laz",
            "file2.laz",
            "file3.laz"
        ]

        for file in laz_files:
            print(f"📦 Enviando {file}")
            for chunk in read_chunks(file, chunk_size):

                while paused:
                    await asyncio.sleep(0.05)

                await websocket.send_bytes(chunk)

    except WebSocketDisconnect:
        print("🔴 WS desconectado")

    except Exception as e:
        print("❌ ERROR WS:", e)

    finally:
        print("🧹 Stream finalizado")


app.include_router(router)

# ───────────────────────────────
# ENTRYPOINT
# ───────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1
    )
