# main.py
from fastapi import FastAPI, WebSocket
from web_socket_handler import WebSocketHandler

app = FastAPI()
ws_handler = WebSocketHandler()

@app.on_event("startup")
def startup():
    print("🚀 Backend Lidar Viewer inicializado")

@app.websocket("/ws/binary-stream")
async def ws_stream(websocket: WebSocket, chunk_size: int = 150000):
    await websocket.accept()
    await ws_handler.handle(websocket, chunk_size)
