from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from spatial_index import SpatialIndex
from pathlib import Path

app = FastAPI()
spatial = SpatialIndex(Path("data/processed"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/dataset/metadata")
def metadata():
    return spatial.metadata


@app.get("/dataset/tiles")
def tiles(min_x: float, min_y: float, max_x: float, max_y: float):
    return spatial.query(min_x, min_y, max_x, max_y)


@app.get("/dataset/tile/{tile_id}")
def tile_data(tile_id: str):
    path = spatial.tile_path(tile_id)
    if not path.exists():
        raise HTTPException(404)

    return Response(
        content=path.read_bytes(),
        media_type="application/octet-stream"
    )


@app.get("/dataset/tile/{tile_id}/meta")
def tile_meta(tile_id: str):
    meta = spatial.tile_meta(tile_id)
    if meta is None:
        raise HTTPException(404)

    return meta
