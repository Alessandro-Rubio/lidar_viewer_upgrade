from fastapi import APIRouter, HTTPException, Response
from dataset_loader import DatasetLoader

router = APIRouter()

loader = DatasetLoader()

@router.get("/metadata")
def get_metadata():
    return loader.load_metadata()


@router.get("/tiles")
def get_tiles_for_bbox(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float
):
    metadata = loader.load_metadata()

    tile_size = metadata["tile_size"]
    global_min = metadata["bounds"]["min"]
    tiles = metadata["tiles"]

    tx_min = int((min_x - global_min[0]) // tile_size)
    ty_min = int((min_y - global_min[1]) // tile_size)
    tx_max = int((max_x - global_min[0]) // tile_size)
    ty_max = int((max_y - global_min[1]) // tile_size)

    visible = []

    for tx in range(tx_min, tx_max + 1):
        for ty in range(ty_min, ty_max + 1):
            tile_id = f"{tx}_{ty}"
            if tile_id in tiles:
                visible.append(tile_id)

    return visible


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
        raise HTTPException(status_code=404, detail="Tile no encontrado")
