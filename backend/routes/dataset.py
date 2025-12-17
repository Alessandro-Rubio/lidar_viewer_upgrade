from fastapi import APIRouter, HTTPException, Response
from dataset_loader import DatasetLoader

router = APIRouter(prefix="/dataset")

loader = DatasetLoader()

# ─────────────────────────────────────────────
# METADATA GLOBAL
# ─────────────────────────────────────────────

@router.get("/metadata")
def get_metadata():
    return loader.get_metadata()

# ─────────────────────────────────────────────
# TILE BINARIO
# ─────────────────────────────────────────────

@router.get("/tile/{tile_id}")
def get_tile(tile_id: str):
    try:
        tile_path = loader.tile_path(tile_id)
        data = tile_path.read_bytes()

        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"Content-Length": str(len(data))}
        )

    except FileNotFoundError:
        raise HTTPException(404, "Tile no encontrado")

# ─────────────────────────────────────────────
# TILE METADATA (OPCIONAL)
# ─────────────────────────────────────────────

@router.get("/tile/{tile_id}/info")
def get_tile_info(tile_id: str):
    try:
        return loader.tile_metadata(tile_id)
    except KeyError:
        raise HTTPException(404, "Tile sin metadata")

# ─────────────────────────────────────────────
# TILE QUERY POR BBOX
# ─────────────────────────────────────────────

@router.get("/tiles")
def get_tiles_for_bbox(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float
):
    return loader.tiles_for_bbox(min_x, min_y, max_x, max_y)
