import json
from pathlib import Path
from typing import Dict

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"
TILES_DIR = PROCESSED_DIR / "tiles"
METADATA_PATH = PROCESSED_DIR / "metadata.json"


class DatasetLoader:
    def __init__(self):
        if not METADATA_PATH.exists():
            raise FileNotFoundError(f"No se encontró {METADATA_PATH}")

        if not TILES_DIR.exists():
            raise FileNotFoundError(f"No existe {TILES_DIR}")

    def load_metadata(self) -> Dict:
        with open(METADATA_PATH, "r") as f:
            return json.load(f)

    def tile_path(self, tile_id: str) -> Path:
        path = TILES_DIR / f"{tile_id}.bin"
        if not path.exists():
            raise FileNotFoundError(tile_id)
        return path
