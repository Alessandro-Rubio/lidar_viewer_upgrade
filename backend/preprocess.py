import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from laz_processor import LazProcessor


# =========================
# CONFIGURACIÓN
# =========================

TILE_SIZE_METERS = 100.0
MAX_POINTS_PER_TILE = 5_000_000
OUTPUT_VERSION = "1.0"

# =========================
# UTILIDADES
# =========================

def floor_div(a: float, b: float) -> int:
    return int(math.floor(a / b))


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)

# =========================
# PREPROCESSOR
# =========================

class LazPreprocessor:

    def __init__(self, input_dir: Path, output_dir: Path):
        self.input_dir = input_dir
        self.output_dir = output_dir

        self.tiles_dir = output_dir / "tiles"

        ensure_dir(self.output_dir)
        ensure_dir(self.tiles_dir)

        self.processor = LazProcessor()

        self.global_min = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
        self.global_max = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)

        self.tiles: Dict[Tuple[int, int], List[np.ndarray]] = {}
        self.total_points = 0

    # =========================
    # FASE 1: BOUNDS GLOBALES
    # =========================

    def scan_bounds(self):
        print("🔍 Escaneando límites globales...")

        for laz_file in self.input_dir.glob("*.laz"):
            print(f"   → {laz_file.name}")
            las = self.processor.load_laz(laz_file)
            xyz, _ = self.processor.extract_points(las)

            self.global_min = np.minimum(self.global_min, xyz.min(axis=0))
            self.global_max = np.maximum(self.global_max, xyz.max(axis=0))

        print("✅ Bounds globales:")
        print(f"   MIN: {self.global_min}")
        print(f"   MAX: {self.global_max}")

    # =========================
    # FASE 2: TILEADO
    # =========================

    def process_files(self):
        print("🧱 Procesando archivos LAZ...")

        for laz_file in self.input_dir.glob("*.laz"):
            print(f"📦 {laz_file.name}")

            las = self.processor.load_laz(laz_file)
            xyz, rgb = self.processor.extract_points(las)

            self.total_points += xyz.shape[0]

            # Concatenar [x y z r g b]
            data = np.hstack((xyz, rgb.astype(np.float32)))

            for point in data:
                x, y = point[0], point[1]

                tx = floor_div(x - self.global_min[0], TILE_SIZE_METERS)
                ty = floor_div(y - self.global_min[1], TILE_SIZE_METERS)

                key = (tx, ty)

                if key not in self.tiles:
                    self.tiles[key] = []

                self.tiles[key].append(point)

        print(f"✅ Total puntos procesados: {self.total_points}")

    # =========================
    # FASE 3: ESCRITURA
    # =========================

    def write_tiles(self):
        print("💾 Escribiendo tiles...")

        metadata_tiles = {}

        for (tx, ty), points in self.tiles.items():
            tile_id = f"{tx}_{ty}"
            tile_path = self.tiles_dir / f"{tile_id}.bin"

            points_np = np.array(points, dtype=np.float32)

            if points_np.shape[0] > MAX_POINTS_PER_TILE:
                print(f"⚠️ Tile {tile_id} excede límite, truncando")
                points_np = points_np[:MAX_POINTS_PER_TILE]

            origin_x = self.global_min[0] + tx * TILE_SIZE_METERS
            origin_y = self.global_min[1] + ty * TILE_SIZE_METERS
            origin_z = self.global_min[2]

            # Coordenadas relativas
            points_np[:, 0] -= origin_x
            points_np[:, 1] -= origin_y
            points_np[:, 2] -= origin_z

            with open(tile_path, "wb") as f:
                f.write(points_np.tobytes())

            metadata_tiles[tile_id] = {
                "tx": tx,
                "ty": ty,
                "origin": [origin_x, origin_y, origin_z],
                "points": int(points_np.shape[0])
            }

        return metadata_tiles

    # =========================
    # FASE 4: METADATA
    # =========================

    def write_metadata(self, tiles_metadata: Dict):
        print("🧾 Escribiendo metadata...")

        metadata = {
            "version": OUTPUT_VERSION,
            "tile_size": TILE_SIZE_METERS,
            "bounds": {
                "min": self.global_min.tolist(),
                "max": self.global_max.tolist()
            },
            "total_points": self.total_points,
            "tiles": tiles_metadata
        }

        with open(self.output_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        print("✅ Dataset listo")

    # =========================
    # PIPELINE
    # =========================

    def run(self):
        self.scan_bounds()
        self.process_files()
        tiles_metadata = self.write_tiles()
        self.write_metadata(tiles_metadata)

# =========================
# ENTRY POINT
# =========================

if __name__ == "__main__":
    INPUT = Path("data")
    OUTPUT = Path("data/processed")

    pre = LazPreprocessor(INPUT, OUTPUT)
    pre.run()
