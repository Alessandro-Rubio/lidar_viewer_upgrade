import json
import numpy as np
from pathlib import Path
from typing import Dict, List


class TileEntry:
    def __init__(
        self,
        tile_id: str,
        tx: int,
        ty: int,
        origin: np.ndarray,
        size: float,
        point_count: int,
        file_path: Path
    ):
        self.tile_id = tile_id
        self.tx = tx
        self.ty = ty
        self.origin = origin
        self.size = size
        self.point_count = point_count
        self.file_path = file_path

        self.min = origin
        self.max = origin + np.array([size, size, np.inf])

    def distance_to_camera(self, cam: np.ndarray) -> float:
        delta = np.maximum(0, np.maximum(self.min - cam, cam - self.max))
        return float(np.linalg.norm(delta))


class SpatialIndex:
    """
    Índice espacial basado en tiles UTM persistentes.
    """

    def __init__(self, processed_dir: Path):
        self.processed_dir = processed_dir
        self.tiles_dir = processed_dir / "tiles"
        self.tiles: Dict[str, TileEntry] = {}

        self.bounds_min = None
        self.bounds_max = None
        self.tile_size = None
        self.total_points = 0

    # ─────────────────────────────
    # LOAD
    # ─────────────────────────────
    def load(self):
        metadata_path = self.processed_dir / "metadata.json"

        if not metadata_path.exists():
            raise FileNotFoundError("metadata.json no encontrado")

        with open(metadata_path, "r") as f:
            meta = json.load(f)

        self.tile_size = meta["tile_size"]
        self.bounds_min = np.array(meta["bounds"]["min"], dtype=np.float64)
        self.bounds_max = np.array(meta["bounds"]["max"], dtype=np.float64)
        self.total_points = meta["total_points"]

        for tile_id, t in meta["tiles"].items():
            entry = TileEntry(
                tile_id=tile_id,
                tx=t["tx"],
                ty=t["ty"],
                origin=np.array(t["origin"], dtype=np.float64),
                size=self.tile_size,
                point_count=t["points"],
                file_path=self.tiles_dir / f"{tile_id}.bin"
            )

            self.tiles[tile_id] = entry

        print(f"🧠 SpatialIndex cargado: {len(self.tiles)} tiles")

    # ─────────────────────────────
    # QUERY
    # ─────────────────────────────
    def query_visible_tiles(
        self,
        camera_pos: np.ndarray,
        max_distance: float,
        max_tiles: int
    ) -> List[TileEntry]:
        """
        Selecciona tiles visibles según distancia.
        """
        candidates = []

        for tile in self.tiles.values():
            dist = tile.distance_to_camera(camera_pos)

            if dist <= max_distance:
                candidates.append((dist, tile))

        candidates.sort(key=lambda x: x[0])

        return [t for _, t in candidates[:max_tiles]]

    # ─────────────────────────────
    # LOAD TILE DATA
    # ─────────────────────────────
    def load_tile_binary(self, tile: TileEntry) -> bytes:
        return tile.file_path.read_bytes()
