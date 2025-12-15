import laspy
import numpy as np
from pathlib import Path


class LazProcessor:
    def __init__(self):
        pass

    def load_laz(self, file_path: Path):
        return laspy.read(file_path)

    def build_buffer(self, las):
        """
        Devuelve un buffer binario listo para enviar por WebSocket
        Formato por punto:
        [x, y, z, r, g, b] -> Float32
        """

        # Coordenadas
        x = las.x
        y = las.y
        z = las.z

        xyz = np.vstack((x, y, z)).T.astype(np.float32)

        # 🎨 COLORES LAZ (si existen)
        if hasattr(las, "red"):
            rgb = np.vstack((
                las.red,
                las.green,
                las.blue
            )).T.astype(np.float32)

            # Normalizar 16 bits → 0–1
            rgb /= 65535.0
        else:
            # Fallback blanco (NO rompe nada)
            rgb = np.ones_like(xyz, dtype=np.float32)

        # Buffer final [x,y,z,r,g,b]
        data = np.hstack((xyz, rgb)).astype(np.float32)

        return data.tobytes(), xyz.shape[0]
