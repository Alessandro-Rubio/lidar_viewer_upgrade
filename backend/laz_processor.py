import laspy
import numpy as np
from pathlib import Path


class LazProcessor:
    def __init__(self):
        pass

    def load_laz(self, file_path: Path):
        """
        Carga un archivo LAZ/LAS usando laspy
        """
        return laspy.read(file_path)

    def extract_points(self, las):
        """
        Extrae XYZ y RGB normalizado (0–1)
        NO envía buffers
        NO concatena archivos
        """

        xyz = np.vstack((
            las.x,
            las.y,
            las.z
        )).T.astype(np.float32)

        if hasattr(las, "red"):
            rgb = np.vstack((
                las.red,
                las.green,
                las.blue
            )).T.astype(np.float32) / 65535.0
        else:
            rgb = np.ones_like(xyz, dtype=np.float32)

        return xyz, rgb

    def compute_bounds(self, xyz):
        """
        Bounding box de un bloque
        """
        return xyz.min(axis=0), xyz.max(axis=0)

    def extract_points(self, las):
        xyz = np.vstack((las.x, las.y, las.z)).T.astype(np.float64)

        if hasattr(las, "red"):
            rgb = np.vstack((
                las.red,
                las.green,
                las.blue
            )).T.astype(np.uint16)
        else:
            rgb = np.ones_like(xyz, dtype=np.uint16) * 65535

        return xyz, rgb
