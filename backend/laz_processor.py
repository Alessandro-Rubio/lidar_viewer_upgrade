# laz_processor.py
import os
import time
import gc
import psutil
from typing import List, Dict, Any, Generator, Optional, Tuple, ContextManager
import numpy as np
import traceback

# Intentar importar LasReader desde laspy 2.x
try:
    from laspy import LasReader
except Exception as e:
    raise ImportError("laspy no está instalado o no se puede importar LasReader. Instala con: pip install laspy") from e


class LAZProcessor:
    def __init__(self):
        self.supported_formats = ['.laz', '.las']
        # parámetros por defecto
        self.CHUNK_SIZE_DEFAULT = 200_000    # puntos por chunk (ajustable)
        self.COLOR_NORMALIZATION = 65535.0
        self.MAX_MEMORY_GB = 40.0            # umbral para GC
        self._pid_process = psutil.Process(os.getpid())

    # -------------------------
    # UTILIDADES
    # -------------------------
    def _format_file_size(self, size_bytes: int) -> str:
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} TB"

    def _create_error_response(self, file_name: str, error_msg: str) -> Dict[str, Any]:
        return {
            "points": [],
            "colors": None,
            "bounds": {"min_x": 0, "max_x": 0, "min_y": 0, "max_y": 0, "min_z": 0, "max_z": 0},
            "total_points": 0,
            "original_points": 0,
            "file_name": file_name,
            "error": error_msg
        }

    def _check_memory_usage(self):
        try:
            mem_gb = self._pid_process.memory_info().rss / 1024 / 1024 / 1024
            if mem_gb > self.MAX_MEMORY_GB:
                print(f"🧹 Memoria alta ({mem_gb:.2f}GB), ejecutando GC")
                gc.collect()
        except Exception:
            pass

    # -------------------------
    # Apertura robusta de LasReader (soporta path o file-like)
    # -------------------------
    from contextlib import contextmanager

    @contextmanager
    def _open_reader(self, file_path: str) -> ContextManager:
        """
        Intenta abrir LasReader(file_path). Si laspy requiere file-like,
        abre el archivo y pasa el file-handle.
        Devuelve un context manager que produce el 'reader'.
        """
        try:
            # Primer intento: pasar la ruta (comportamiento usual)
            reader = LasReader(file_path)
            try:
                yield reader
            finally:
                # LasReader debería soportar close/context, intentar cerrarlo si tiene close()
                try:
                    reader.close()
                except Exception:
                    pass
            return
        except Exception as err_route:
            # Si obtener error tipo "'str' object has no attribute 'read'" o similar,
            # intentamos pasar un file-like (open(..., 'rb')).
            # Mostramos traza breve para debugging.
            tb = traceback.format_exc()
            print(f"⚠️ _open_reader: fallo con LasReader(path) — intentando fallback file-like. Error: {err_route}\n{tb}")

            # Fallback: abrir archivo en modo binario y pasar handle
            fh = None
            try:
                fh = open(file_path, "rb")
                reader = LasReader(fh)
                try:
                    yield reader
                finally:
                    try:
                        reader.close()
                    except Exception:
                        pass
                    try:
                        fh.close()
                    except Exception:
                        pass
                return
            except Exception as err_filelike:
                # si también falla, propagar excepción con contexto
                tb2 = traceback.format_exc()
                # cerrar handle si quedó abierto
                try:
                    if fh and not fh.closed:
                        fh.close()
                except Exception:
                    pass

                raise Exception(f"Unable to open LAS/LAZ with LasReader(path) or LasReader(fileobj). "
                                f"PathErr: {err_route}; FallbackErr: {err_filelike}\nTrace1:\n{tb}\nTrace2:\n{tb2}")

    # -------------------------
    # LISTA DE ARCHIVOS
    # -------------------------
    def get_file_list(self, data_dir: str = "data") -> List[Dict[str, Any]]:
        files = []
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            return files

        for fn in os.listdir(data_dir):
            if any(fn.lower().endswith(ext) for ext in self.supported_formats):
                path = os.path.join(data_dir, fn)
                size = os.path.getsize(path)
                files.append({
                    "name": fn,
                    "path": path,
                    "size": self._format_file_size(size),
                    "size_bytes": size
                })
        files.sort(key=lambda f: f["size_bytes"])
        return files

    # -------------------------
    # READ CHUNKED (REST use)
    # -------------------------
    def read_laz_file_chunked(self, file_path: str, target_points: int = 5_000_000) -> Dict[str, Any]:
        """
        Lectura chunked que devuelve hasta target_points (útil para endpoints REST).
        """
        file_name = os.path.basename(file_path)
        if not os.path.exists(file_path):
            return self._create_error_response(file_name, "Archivo no existe")

        try:
            start_time = time.time()
            with self._open_reader(file_path) as reader:
                total_points = int(getattr(reader.header, "point_count", getattr(reader.header, "number_of_points", 0)))
                if total_points == 0:
                    return self._create_error_response(file_name, "Archivo vacío")

                # detectar si hay colores (manera robusta)
                has_color = False
                try:
                    pf_dims = getattr(reader.header, "point_format", None)
                    if pf_dims is not None:
                        has_color = "red" in getattr(pf_dims, "dimension_names", [])
                except Exception:
                    # fallback simple
                    try:
                        # si reader tiene atributo points/dimensions
                        has_color = any(d in ("red", "green", "blue") for d in getattr(reader, "point_format", {}).get("dimension_names", [])) if hasattr(reader, "point_format") else False
                    except Exception:
                        has_color = False

                sampled_points = []
                sampled_colors = []
                sample_ratio = min(1.0, target_points / max(1, total_points))

                min_x = min_y = min_z = float('inf')
                max_x = max_y = max_z = float('-inf')

                # elegir iterator de chunks robusto
                if hasattr(reader, "chunk_iterator"):
                    chunk_iter = reader.chunk_iterator(self.CHUNK_SIZE_DEFAULT)
                else:
                    # fallback: leer por slices (menos eficiente pero compatible)
                    def _slice_iter(rdr, chunk_size_local):
                        total = total_points
                        idx = 0
                        while idx < total:
                            end = min(total, idx + chunk_size_local)
                            # LasReader antiguas/no estándar podrían tener read_points
                            if hasattr(rdr, "read_points"):
                                yield rdr.read_points(idx, end)
                            else:
                                # intentar slicing por .points (no ideal)
                                yield rdr.points[idx:end]
                            idx = end
                    chunk_iter = _slice_iter(reader, self.CHUNK_SIZE_DEFAULT)

                for chunk in chunk_iter:
                    self._check_memory_usage()
                    n = len(chunk.x) if hasattr(chunk, "x") else 0
                    if n == 0:
                        continue
                    mask = np.random.random(n) < sample_ratio
                    if mask.any():
                        px = chunk.x[mask]; py = chunk.y[mask]; pz = chunk.z[mask]
                        min_x = min(min_x, float(px.min()))
                        max_x = max(max_x, float(px.max()))
                        min_y = min(min_y, float(py.min()))
                        max_y = max(max_y, float(py.max()))
                        min_z = min(min_z, float(pz.min()))
                        max_z = max(max_z, float(pz.max()))
                        sampled_points.append(np.vstack((px, py, pz)).T)
                        if has_color:
                            try:
                                red = chunk.red[mask] / self.COLOR_NORMALIZATION
                                green = chunk.green[mask] / self.COLOR_NORMALIZATION
                                blue = chunk.blue[mask] / self.COLOR_NORMALIZATION
                                sampled_colors.append(np.vstack((red, green, blue)).T)
                            except Exception:
                                # si no se pueden obtener colores, desactivar
                                has_color = False

                    if sum(len(a) for a in sampled_points) >= target_points:
                        break

            if len(sampled_points) == 0:
                return self._create_error_response(file_name, "No se pudieron muestrear puntos")

            points = np.vstack(sampled_points)[:target_points]
            colors = (np.vstack(sampled_colors)[:target_points] if len(sampled_colors) > 0 else None)

            bounds = {
                "min_x": float(min_x),
                "max_x": float(max_x),
                "min_y": float(min_y),
                "max_y": float(max_y),
                "min_z": float(min_z),
                "max_z": float(max_z)
            }

            processing_time = round(time.time() - start_time, 2)
            print(f"✅ {file_name} procesado: {len(points):,}/{total_points:,} pts en {processing_time}s")

            return {
                "points": points.tolist(),
                "colors": colors.tolist() if colors is not None else None,
                "bounds": bounds,
                "total_points": len(points),
                "original_points": total_points,
                "file_name": file_name,
                "processing_time": processing_time,
                "has_colors": has_color
            }

        except Exception as e:
            tb = traceback.format_exc()
            print(f"❌ Error read_laz_file_chunked({file_name}): {e}\n{tb}")
            return self._create_error_response(file_name, str(e))

    # -------------------------
    # STREAM BINARIO (para WebSocket)
    # -------------------------
    def stream_chunks_binary(self, file_path: str, chunk_size: Optional[int] = None) -> Generator[Tuple[Dict[str, Any], bytes, Optional[bytes]], None, None]:
        """
        Generador que yield (meta, pos_bytes, color_bytes)
        Posiciones y colores son bytes (Float32 interleaved).
        """
        file_name = os.path.basename(file_path)
        if not os.path.exists(file_path):
            raise Exception(f"Archivo no existe: {file_path}")

        if chunk_size is None or chunk_size <= 0:
            chunk_size = self.CHUNK_SIZE_DEFAULT

        try:
            with self._open_reader(file_path) as reader:
                total_points = int(getattr(reader.header, "point_count", getattr(reader.header, "number_of_points", 0)))
                if total_points == 0:
                    raise Exception("Archivo vacío")

                # intentar detectar colores
                has_color = False
                try:
                    pf = getattr(reader.header, "point_format", None)
                    if pf is not None:
                        has_color = "red" in getattr(pf, "dimension_names", [])
                except Exception:
                    has_color = False  # lo re-evaluaremos por chunk

                start_index = 0
                chunk_index = 0
                est_total_chunks = max(1, (total_points + chunk_size - 1) // chunk_size)

                # elegir iterator robusto
                if hasattr(reader, "chunk_iterator"):
                    chunk_iter = reader.chunk_iterator(chunk_size)
                else:
                    def _slice_iter(rdr, csize):
                        total = total_points
                        idx = 0
                        while idx < total:
                            end = min(total, idx + csize)
                            if hasattr(rdr, "read_points"):
                                yield rdr.read_points(idx, end)
                            else:
                                yield rdr.points[idx:end]
                            idx = end
                    chunk_iter = _slice_iter(reader, chunk_size)

                proc = self._pid_process

                for chunk in chunk_iter:
                    chunk_t0 = time.time()
                    # si has_color es incierto, intentar detectar en este chunk
                    if not has_color:
                        try:
                            has_color = hasattr(chunk, "red") and hasattr(chunk, "green") and hasattr(chunk, "blue")
                        except Exception:
                            has_color = False

                    # extraer xyz como float32
                    try:
                        px = np.asarray(chunk.x, dtype=np.float32)
                        py = np.asarray(chunk.y, dtype=np.float32)
                        pz = np.asarray(chunk.z, dtype=np.float32)
                    except Exception as e_xyz:
                        raise Exception(f"Error extrayendo X/Y/Z del chunk: {e_xyz}")

                    n = px.size
                    if n == 0:
                        continue

                    positions = np.empty(n * 3, dtype=np.float32)
                    positions[0::3] = px
                    positions[1::3] = py
                    positions[2::3] = pz
                    pos_bytes = positions.tobytes()

                    color_bytes = None
                    if has_color:
                        try:
                            red = np.asarray(chunk.red, dtype=np.float32) / self.COLOR_NORMALIZATION
                            green = np.asarray(chunk.green, dtype=np.float32) / self.COLOR_NORMALIZATION
                            blue = np.asarray(chunk.blue, dtype=np.float32) / self.COLOR_NORMALIZATION
                            colors = np.empty(n * 3, dtype=np.float32)
                            colors[0::3] = red
                            colors[1::3] = green
                            colors[2::3] = blue
                            color_bytes = colors.tobytes()
                        except Exception:
                            # si falla, desactivar color para próximos
                            color_bytes = None
                            has_color = False

                    try:
                        mem_gb = proc.memory_info().rss / 1024 / 1024 / 1024
                        cpu_pct = proc.cpu_percent(interval=None)
                    except Exception:
                        mem_gb = 0.0
                        cpu_pct = 0.0

                    meta = {
                        "file_name": file_name,
                        "start": start_index,
                        "count": n,
                        "total_points": total_points,
                        "chunk_index": chunk_index,
                        "total_chunks_est": est_total_chunks,
                        "progress_pct": round((start_index / total_points) * 100, 4) if total_points > 0 else 0.0,
                        "chunk_time_ms": round((time.time() - chunk_t0) * 1000, 4),
                        "has_color": bool(color_bytes is not None),
                        "memory_gb": round(mem_gb, 3),
                        "cpu_percent": round(cpu_pct, 2),
                    }

                    start_index += n
                    chunk_index += 1

                    yield meta, pos_bytes, color_bytes

                return

        except Exception as e:
            # envolver excepción para que el caller la pueda loggear con el nombre de archivo
            tb = traceback.format_exc()
            raise Exception(f"Error en stream_chunks_binary({file_name}): {e}\n{tb}")
