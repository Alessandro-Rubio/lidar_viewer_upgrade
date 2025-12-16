import json
from pathlib import Path
from typing import Dict, Tuple, List

import numpy as np

# =========================
# SPATIAL INDEX
# =========================

class SpatialIndex:
    def __init__(self, root: Path):
        self.root = root
        self.tiles_dir = root / "tiles"
        self.metadata = json.loads((root / "metadata.json").read_text())
        self.tiles = self.metadata["tiles"]

    def tile_path(self, tile_id: str) -> Path:
        return self.tiles_dir / f"{tile_id}.bin"

    def tile_meta(self, tile_id: str):
        return self.tiles.get(tile_id)

    def query(self, min_x, min_y, max_x, max_y):
        result = []
        for tid, t in self.tiles.items():
            ox, oy, _ = t["origin"]
            if min_x <= ox <= max_x and min_y <= oy <= max_y:
                result.append(tid)
        return result
