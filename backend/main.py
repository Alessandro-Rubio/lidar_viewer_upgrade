from fastapi import FastAPI, WebSocket
from pathlib import Path
import numpy as np
import json

from spatial_index import SpatialIndex

app = FastAPI()

spatial = SpatialIndex(Path("data/processed"))
spatial.load()


@app.websocket("/ws/tiles")
async def tiles_ws(ws: WebSocket):
    await ws.accept()
    print("🔵 WS frontend conectado")

    try:
        while True:
            msg = await ws.receive_json()

            cam = np.array(msg["camera"], dtype=np.float64)
            max_dist = float(msg.get("max_distance", 2500))
            max_tiles = int(msg.get("max_tiles", 64))

            tiles = spatial.query_visible_tiles(
                camera_pos=cam,
                max_distance=max_dist,
                max_tiles=max_tiles
            )

            for tile in tiles:
                await ws.send_text(json.dumps({
                    "type": "tile_meta",
                    "tile_id": tile.tile_id,
                    "origin": tile.origin.tolist(),
                    "points": tile.point_count
                }))

                payload = spatial.load_tile_binary(tile)
                await ws.send_bytes(payload)

    except Exception as e:
        print("🔴 WS cerrado:", e)
