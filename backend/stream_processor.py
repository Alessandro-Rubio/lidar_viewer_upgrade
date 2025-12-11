import asyncio
import json
from typing import AsyncGenerator, Dict, List, Any
import time
from laz_processor import LAZProcessor
import psutil
from concurrent.futures import ThreadPoolExecutor
import zlib
import base64
import traceback

class StreamProcessor:
    def __init__(self):
        self.processor = LAZProcessor()
        self.active_streams = {}
        # Thread pool para procesamiento pesado
        self.executor = ThreadPoolExecutor(max_workers=4)

    async def stream_all_files(
        self,
        target_points: int = 100000,
        batch_size: int = 5  # REDUCIDO de 10 a 5 para mensajes más pequeños
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream de datos para carga progresiva sin límites - ASINCRONO"""
        try:
            files = self.processor.get_file_list()
            # Aceptar que get_file_list devuelva lista de strings o de dicts
            total_files = len(files) if files else 0

            if total_files == 0:
                print("⚠️ StreamProcessor: no se encontraron archivos (get_file_list devolvió vacío)")
                yield {
                    "type": "stream_error",
                    "error": "No se encontraron archivos LAZ en el directorio /data",
                    "timestamp": time.time()
                }
                return

            print(f"🌊 INICIANDO STREAM: {total_files} archivos, batch_size={batch_size}, target_points={target_points}")

            # Enviar información inicial INMEDIATAMENTE
            yield {
                "type": "stream_start",
                "message": f"Iniciando stream de {total_files} archivos",
                "total_files": total_files,
                "target_points": target_points,
                "batch_size": batch_size,
                "timestamp": time.time()
            }

            # Enviar un heartbeat inmediatamente para mantener la conexión
            yield {
                "type": "heartbeat",
                "message": "Stream iniciado, procesando primer lote...",
                "timestamp": time.time()
            }

            any_sent = False
            processed_files_global = 0

            for batch_index, batch_start in enumerate(range(0, total_files, batch_size)):
                batch_end = min(batch_start + batch_size, total_files)
                batch_files = files[batch_start:batch_end]

                print(f"📦 Procesando lote {batch_index + 1}: archivos índices {batch_start}..{batch_end-1} (count={len(batch_files)})")

                # Ejecutar procesamiento en thread pool (no bloquear event loop)
                loop = asyncio.get_event_loop()
                try:
                    batch_data = await loop.run_in_executor(
                        self.executor,
                        self._process_batch_sync,
                        batch_files,
                        target_points
                    )
                except Exception as e:
                    print("❌ Excepción en run_in_executor:", e)
                    traceback.print_exc()
                    # Enviar error al cliente pero continuar con siguientes batches
                    yield {
                        "type": "stream_error",
                        "error": f"Error procesando lote {batch_index + 1}: {str(e)}",
                        "batch_index": batch_index,
                        "timestamp": time.time()
                    }
                    continue

                if not batch_data:
                    print(f"⚠️  Lote {batch_index + 1} vacío (batch_files may be invalid or no points).")
                    # Notificar lote vacío al cliente para trazabilidad
                    yield {
                        "type": "batch_empty",
                        "batch_index": batch_index,
                        "message": "No se extrajeron puntos de este lote (posible formato inesperado o error interno).",
                        "timestamp": time.time()
                    }
                    await asyncio.sleep(0.05)
                    continue

                # Comprimir datos para reducir tamaño
                try:
                    compressed_data = self._compress_data(batch_data)
                    original_size = self._get_data_size(batch_data)
                    compressed_size = len(compressed_data.encode('utf-8')) if isinstance(compressed_data, str) else 0
                except Exception as e:
                    print("⚠️ Error comprimiendo lote, enviando sin comprimir:", e)
                    compressed_data = json.dumps(batch_data)
                    original_size = self._get_data_size(batch_data)
                    compressed_size = len(compressed_data.encode('utf-8'))

                # Enviar datos del lote (COMPRIMIDOS)
                chunk = {
                    "type": "data_chunk",
                    "data": compressed_data,
                    "metadata": {
                        "chunk_index": batch_index,
                        "files_in_chunk": len(batch_data),
                        "total_files": total_files,
                        "files_processed_upto": batch_end,
                        "progress_percentage": (batch_end / total_files) * 100 if total_files > 0 else 0,
                        "compressed": True,
                        "original_size_bytes": original_size,
                        "compressed_size_bytes": compressed_size
                    },
                    "timestamp": time.time()
                }

                any_sent = True
                processed_files_global += len(batch_data)

                print(f"📤 Enviando chunk {batch_index} - archivos: {len(batch_data)} - orig {original_size} B -> comp {compressed_size} B")
                yield chunk

                # Pequeña pausa para no saturar
                await asyncio.sleep(0.05)

            # Al finalizar, enviar resumen
            if any_sent:
                yield {
                    "type": "stream_complete",
                    "message": f"Stream completado: {processed_files_global} archivos procesados (de {total_files})",
                    "total_files": total_files,
                    "processed_files": processed_files_global,
                    "timestamp": time.time()
                }
                print(f"✅ Stream completado: processed_files={processed_files_global}")
            else:
                # No se envió ningún chunk útil: notificar al cliente
                print("⚠️ Stream finalizó sin enviar ningún chunk útil.")
                yield {
                    "type": "stream_error",
                    "error": "Stream finalizó sin enviar datos. Revisar get_file_list() y read_files_batch_fast_for_streaming().",
                    "total_files": total_files,
                    "timestamp": time.time()
                }

        except Exception as e:
            print(f"❌ Error en stream (fatal): {e}")
            traceback.print_exc()
            yield {
                "type": "stream_error",
                "error": str(e),
                "timestamp": time.time()
            }

    def _process_batch_sync(self, batch_files: List[Any], target_points: int) -> List[Dict[str, Any]]:
        """Procesa un lote de archivos de manera síncrona (se ejecuta en thread pool)

        batch_files puede ser:
          - lista de strings (rutas)
          - lista de dicts con 'path' o 'name'
        """
        try:
            # Normalizar batch_files -> file_paths (lista de rutas)
            file_paths = []
            for f in batch_files:
                if isinstance(f, str):
                    file_paths.append(f)
                elif isinstance(f, dict):
                    # soportar varias claves posibles
                    if 'path' in f:
                        file_paths.append(f['path'])
                    elif 'file_path' in f:
                        file_paths.append(f['file_path'])
                    elif 'name' in f and 'dir' in f:  # ejemplo
                        file_paths.append(f.get('path') or f.get('file_path') or f.get('name'))
                    else:
                        # intentar convertir dict a string si contiene la ruta
                        maybe = f.get('path') or f.get('file') or None
                        if maybe:
                            file_paths.append(maybe)
                        else:
                            print("⚠️ _process_batch_sync: item inesperado en batch_files:", f)
                else:
                    print("⚠️ _process_batch_sync: tipo inesperado en batch_files:", type(f), f)

            if not file_paths:
                print("⚠️ _process_batch_sync: No se pudieron obtener rutas válidas del batch_files")
                return []

            # Usar versión optimizada para streaming
            results = self.processor.read_files_batch_fast_for_streaming(file_paths, target_points)

            # results should be list of file-data dicts; validar
            if not results or not isinstance(results, list):
                print("⚠️ _process_batch_sync: read_files_batch_fast_for_streaming devolvió vacío o formato inesperado")
                return []

            # Filtrar sólo entradas válidas
            processed = []
            for r in results:
                if not r:
                    continue
                # Asegurar que tenga positions o points
                if r.get('positions') or r.get('points') or r.get('total_points', 0) > 0:
                    processed.append(r)
                else:
                    print("⚠️ _process_batch_sync: entrada sin puntos válida:", r.get('file_name') or r.get('filePath') or r)

            return processed

        except Exception as e:
            print(f"❌ Error procesando lote (sync): {e}")
            traceback.print_exc()
            return []

    def _compress_data(self, data: Any) -> str:
        """Comprime datos usando zlib y base64 para reducir tamaño"""
        try:
            json_str = json.dumps(data)
            compressed = zlib.compress(json_str.encode('utf-8'))
            b64 = base64.b64encode(compressed).decode('utf-8')
            return b64
        except Exception as e:
            print(f"⚠️  Error comprimiendo datos: {e}, enviando sin comprimir")
            try:
                return json.dumps(data)
            except:
                return "[]"

    def _get_data_size(self, data: Any) -> int:
        """Obtiene el tamaño aproximado de los datos en bytes"""
        try:
            return len(json.dumps(data).encode('utf-8'))
        except:
            return 0

    async def infinite_stream(
        self,
        target_points: int = 50000,
        chunks_per_second: int = 5
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream infinito para visualización continua"""
        try:
            files = self.processor.get_file_list()

            if len(files) == 0:
                yield {
                    "type": "stream_error",
                    "error": "No se encontraron archivos LAZ en el directorio /data",
                    "timestamp": time.time()
                }
                return

            file_index = 0

            print(f"♾️  STREAM INFINITO INICIADO: {len(files)} archivos disponibles")

            while True:
                if file_index >= len(files):
                    file_index = 0  # Reiniciar al principio

                # Tomar un archivo para procesar
                current_file = files[file_index]

                # Procesar archivo en thread pool
                loop = asyncio.get_event_loop()
                file_data = await loop.run_in_executor(
                    self.executor,
                    self.processor.read_laz_file_fast_for_streaming,
                    current_file["path"] if isinstance(current_file, dict) and "path" in current_file else current_file,
                    target_points
                )

                if file_data and file_data.get("total_points", 0) > 0:
                    # Comprimir datos
                    compressed_data = self._compress_data([file_data])

                    yield {
                        "type": "infinite_chunk",
                        "data": compressed_data,
                        "metadata": {
                            "file_index": file_index,
                            "file_name": current_file.get("name") if isinstance(current_file, dict) else str(current_file),
                            "total_files": len(files),
                            "points_in_chunk": file_data["total_points"],
                            "compressed": True
                        },
                        "timestamp": time.time()
                    }

                file_index += 1

                # Controlar velocidad de stream
                await asyncio.sleep(1 / chunks_per_second)

        except Exception as e:
            print(f"❌ Error en stream infinito: {e}")
            traceback.print_exc()
            yield {
                "type": "stream_error",
                "error": str(e),
                "timestamp": time.time()
            }

    def __del__(self):
        """Limpiar recursos al destruir"""
        if hasattr(self, 'executor'):
            try:
                self.executor.shutdown(wait=False)
            except:
                pass
