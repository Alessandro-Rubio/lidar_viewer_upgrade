from pathlib import Path
from typing import Iterator, List, Tuple
import numpy as np

from laz_processor import LazProcessor


class DatasetLoader:
    """
    Carga y preprocesa un conjunto completo de archivos LAZ.

    Objetivos de diseño:
    - NO streaming en vivo
    - Preprocesar completamente en backend
    - Preparar datos para visualización progresiva / LOD
    - Escalable a cientos de archivos y miles de millones de puntos
    """

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.processor = LazProcessor()

        if not self.data_dir.exists():
            raise FileNotFoundError(f"Directorio no encontrado: {self.data_dir}")

        self.files: List[Path] = sorted(
            [p for p in self.data_dir.iterdir() if p.suffix.lower() == ".laz"]
        )

        if not self.files:
            raise RuntimeError("No se encontraron archivos .laz en el directorio")

    # ─────────────────────────────────────────────
    # API PRINCIPAL
    # ─────────────────────────────────────────────
    def load_all(self) -> Iterator[Tuple[np.ndarray, np.ndarray]]:
        """
        Itera archivo por archivo y devuelve bloques de puntos.

        Yields:
            xyz: np.ndarray (N,3) float32 (UTM real)
            rgb: np.ndarray (N,3) float32 (0–1)

        NOTA:
        No concatena todo en memoria.
        Esto es CRÍTICO para datasets grandes.
        """
        for path in self.files:
            las = self.processor.load_laz(path)
            xyz, rgb = self._extract_arrays(las)
            yield xyz, rgb

    # ─────────────────────────────────────────────
    # EXTRACCIÓN
    # ─────────────────────────────────────────────
    def _extract_arrays(self, las) -> Tuple[np.ndarray, np.ndarray]:
        """
        Extrae coordenadas y color como arrays separados.
        No genera buffers binarios aquí.
        """
        x = las.x.astype(np.float32)
        y = las.y.astype(np.float32)
        z = las.z.astype(np.float32)

        xyz = np.stack((x, y, z), axis=1)

        if hasattr(las, "red"):
            r = las.red.astype(np.float32)
            g = las.green.astype(np.float32)
            b = las.blue.astype(np.float32)
            rgb = np.stack((r, g, b), axis=1) / 65535.0
        else:
            rgb = np.ones_like(xyz, dtype=np.float32)

        return xyz, rgb

    # ─────────────────────────────────────────────
    # UTILIDADES
    # ─────────────────────────────────────────────
    def count_points(self) -> int:
        """Cuenta puntos sin cargarlos todos en memoria."""
        total = 0
        for path in self.files:
            las = self.processor.load_laz(path)
            total += len(las.x)
        return total
