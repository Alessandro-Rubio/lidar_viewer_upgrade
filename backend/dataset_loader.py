import json
from pathlib import Path
from typing import Dict, List


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"
TILES_DIR = PROCESSED_DIR / "tiles"
METADATA_PATH = PROCESSED_DIR / "metadata.json"


class DatasetLoader:
    def __init__(self):
        if not METADATA_PATH.exists():
            raise FileNotFoundError("metadata.json no encontrado")

        if not TILES_DIR.exists():
            raise FileNotFoundError("Carpeta tiles no encontrada")

        # 🔹 Cargar metadata UNA sola vez
        with open(METADATA_PATH, "r") as f:
            self.metadata: Dict = json.load(f)

        self.tile_size: float = float(self.metadata["tile_size"])
        self.bounds_min = self.metadata["bounds"]["min"]
        self.tiles_meta: Dict[str, Dict] = self.metadata["tiles"]

    # ─────────────────────────────────────────────
    # METADATA
    # ─────────────────────────────────────────────

    def get_metadata(self) -> Dict:
        return self.metadata

    # ─────────────────────────────────────────────
    # TILE LOOKUP
    # ─────────────────────────────────────────────

    def tiles_for_bbox(
        self,
        min_x: float,
        min_y: float,
        max_x: float,
        max_y: float
    ) -> List[str]:
        origin_x = self.bounds_min[0]
        origin_y = self.bounds_min[1]

        tx_min = int((min_x - origin_x) // self.tile_size)
        ty_min = int((min_y - origin_y) // self.tile_size)
        tx_max = int((max_x - origin_x) // self.tile_size)
        ty_max = int((max_y - origin_y) // self.tile_size)

        visible_tiles: List[str] = []

        for tx in range(tx_min, tx_max + 1):
            for ty in range(ty_min, ty_max + 1):
                tile_id = f"{tx}_{ty}"
                if tile_id in self.tiles_meta:
                    visible_tiles.append(tile_id)

        return visible_tiles

    # ─────────────────────────────────────────────
    # TILE IO
    # ─────────────────────────────────────────────

    def tile_path(self, tile_id: str) -> Path:
        path = TILES_DIR / f"{tile_id}.bin"
        if not path.exists():
            raise FileNotFoundError(f"Tile {tile_id} no existe")
        return path

    def tile_metadata(self, tile_id: str) -> Dict:
        if tile_id not in self.tiles_meta:
            raise KeyError(f"Tile {tile_id} sin metadata")
        return self.tiles_meta[tile_id]
