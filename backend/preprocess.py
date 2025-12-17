import json
import math
import gc
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import laspy


TILE_SIZE_METERS = 100.0
MAX_POINTS_PER_TILE = 5_000_000
OUTPUT_VERSION = "1.0"
CHUNK_SIZE = 2_000_000  # puntos por chunk


def floor_div(a: float, b: float) -> int:
    return int(math.floor(a / b))


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


class LazPreprocessor:

    def __init__(self, input_dir: Path, output_dir: Path):
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.tiles_dir = output_dir / "tiles"

        ensure_dir(self.output_dir)
        ensure_dir(self.tiles_dir)

        self.global_min = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
        self.global_max = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)

        self.total_points = 0
        self.tile_point_counts: Dict[str, int] = {}

    # =========================
    # FASE 1: BOUNDS GLOBALES
    # =========================

    def scan_bounds(self):
        print("🔍 Escaneando límites globales...")

        for laz_file in self.input_dir.glob("*.laz"):
            print(f"   → {laz_file.name}")

            with laspy.open(laz_file) as reader:
                for points in reader.chunk_iterator(CHUNK_SIZE):
                    xyz = np.vstack((points.x, points.y, points.z)).T

                    self.global_min = np.minimum(self.global_min, xyz.min(axis=0))
                    self.global_max = np.maximum(self.global_max, xyz.max(axis=0))

                    del xyz, points
                    gc.collect()

        print("✅ Bounds globales:")
        print(f"   MIN: {self.global_min}")
        print(f"   MAX: {self.global_max}")

    # =========================
    # FASE 2: TILEADO STREAMING
    # =========================

    def process_files(self):
        print("🧱 Procesando archivos LAZ...")

        for laz_file in self.input_dir.glob("*.laz"):
            print(f"📦 {laz_file.name}")

            with laspy.open(laz_file) as reader:
                for points in reader.chunk_iterator(CHUNK_SIZE):

                    xyz = np.vstack((points.x, points.y, points.z)).T.astype(np.float32)

                    rgb = np.vstack((
                        points.red,
                        points.green,
                        points.blue
                    )).T.astype(np.float32)

                    data = np.hstack((xyz, rgb))
                    self.total_points += data.shape[0]

                    # Calcular tiles vectorizado
                    tx = np.floor((xyz[:, 0] - self.global_min[0]) / TILE_SIZE_METERS).astype(np.int32)
                    ty = np.floor((xyz[:, 1] - self.global_min[1]) / TILE_SIZE_METERS).astype(np.int32)

                    for tile_x, tile_y in np.unique(np.column_stack((tx, ty)), axis=0):
                        mask = (tx == tile_x) & (ty == tile_y)
                        tile_points = data[mask]

                        tile_id = f"{tile_x}_{tile_y}"
                        tile_path = self.tiles_dir / f"{tile_id}.bin"

                        # Limitar puntos por tile
                        count = self.tile_point_counts.get(tile_id, 0)
                        if count >= MAX_POINTS_PER_TILE:
                            continue

                        remaining = MAX_POINTS_PER_TILE - count
                        tile_points = tile_points[:remaining]

                        # Escribir incremental
                        with open(tile_path, "ab") as f:
                            f.write(tile_points.tobytes())

                        self.tile_point_counts[tile_id] = count + tile_points.shape[0]

                    del xyz, rgb, data, points
                    gc.collect()

        print(f"✅ Total puntos procesados: {self.total_points}")

    # =========================
    # FASE 3: METADATA
    # =========================

    def write_metadata(self):
        print("🧾 Escribiendo metadata...")

        tiles_meta = {}

        for tile_id, count in self.tile_point_counts.items():
            tx, ty = map(int, tile_id.split("_"))

            origin_x = self.global_min[0] + tx * TILE_SIZE_METERS
            origin_y = self.global_min[1] + ty * TILE_SIZE_METERS
            origin_z = self.global_min[2]

            tiles_meta[tile_id] = {
                "tx": tx,
                "ty": ty,
                "origin": [origin_x, origin_y, origin_z],
                "points": count
            }

        metadata = {
            "version": OUTPUT_VERSION,
            "tile_size": TILE_SIZE_METERS,
            "bounds": {
                "min": self.global_min.tolist(),
                "max": self.global_max.tolist()
            },
            "total_points": self.total_points,
            "tiles": tiles_meta
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
        self.write_metadata()


if __name__ == "__main__":
    INPUT = Path("data")
    OUTPUT = Path("data/processed")

    LazPreprocessor(INPUT, OUTPUT).run()
