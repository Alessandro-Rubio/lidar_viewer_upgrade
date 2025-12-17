from pathlib import Path
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse
from dataset_loader import DatasetLoader

router = APIRouter(prefix="/dataset")

DATASET_PATH = Path("data/processed")
dataset = DatasetLoader(DATASET_PATH)

# ─────────────────────────────────────────────
# METADATA
# ─────────────────────────────────────────────

@router.get("/metadata")
def get_metadata():
    return dataset.metadata

# ─────────────────────────────────────────────
# TILE QUERY
# ─────────────────────────────────────────────

@router.get("/tiles")
def get_tiles(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float
):
    return dataset.tiles_for_bbox(min_x, min_y, max_x, max_y)

# ─────────────────────────────────────────────
# TILE BINARIO
# ─────────────────────────────────────────────

@router.get("/tile/{tile_id}")
def get_tile(tile_id: str):
    path = dataset.tile_path(tile_id)

    if not path.exists():
        raise HTTPException(status_code=404, detail="Tile no encontrado")

    meta = dataset.tile_metadata(tile_id)

    headers = {
        "X-Tile-Meta": json_dumps(meta)
    }

    return FileResponse(
        path,
        media_type="application/octet-stream",
        headers=headers
    )

# ─────────────────────────────────────────────
# TILE META (OPCIONAL)
# ─────────────────────────────────────────────

@router.get("/tile/{tile_id}/meta")
def get_tile_meta(tile_id: str):
    if tile_id not in dataset.tiles_meta:
        raise HTTPException(status_code=404, detail="Tile no encontrado")

    return dataset.tile_metadata(tile_id)


def json_dumps(obj):
    import json
    return json.dumps(obj, separators=(",", ":"))
