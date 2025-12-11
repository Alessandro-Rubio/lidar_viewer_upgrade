# main.py
import os
import time
import uuid
import traceback
import asyncio
from typing import List, Dict, Optional

import psutil
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

# Importa tu LAZProcessor (asegúrate de que backend/laz_processor.py esté actualizado)
from laz_processor import LAZProcessor

# -----------------------
# Aplicación FastAPI
# -----------------------
app = FastAPI(
    title="LAZ File Visualizer",
    version="3.0.0",
    description="Backend optimizado para LiDAR con streaming WebSocket (binario)"
)

# CORS — permitir frontend local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar carpeta de datos (para servir archivos si es necesario)
if not os.path.exists("data"):
    os.makedirs("data")
app.mount("/data", StaticFiles(directory="data"), name="data")

# Instancia processor (singleton)
processor = LAZProcessor()

# -----------------------
# Endpoints simples / health
# -----------------------
@app.get("/")
async def root():
    return {"message": "LAZ File Visualizer API", "version": "3.0.0", "status": "running"}

@app.get("/api/test")
async def api_test():
    try:
        files = processor.get_file_list()
        total_size = sum(f["size_bytes"] for f in files) if files else 0
        mem = psutil.virtual_memory()
        return {
            "status": "ok",
            "message": "Backend funcionando",
            "data_files": len(files),
            "sample_files": [f["name"] for f in files[:8]],
            "total_size_gb": round(total_size / (1024**3), 3),
            "system": {
                "memory_available_gb": round(mem.available / (1024**3), 2),
                "memory_used_percent": mem.percent
            }
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"status":"error","message":str(e)})

@app.get("/api/files", response_model=List[Dict])
async def api_files():
    try:
        files = processor.get_file_list()
        # añadir metadatos (no obligatorio)
        enriched = []
        for idx, f in enumerate(files):
            try:
                meta = processor.get_file_metadata(f["path"]) if hasattr(processor, "get_file_metadata") else {}
                f2 = f.copy()
                if meta:
                    f2.update(meta)
                enriched.append(f2)
            except Exception:
                enriched.append(f)
        return enriched
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/file-metadata/{file_name}")
async def file_metadata(file_name: str):
    path = os.path.join("data", file_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    try:
        meta = processor.get_file_metadata(path) if hasattr(processor, "get_file_metadata") else {}
        return meta
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system-info")
async def system_info():
    mem = psutil.virtual_memory()
    files = processor.get_file_list()
    total_size = sum(f["size_bytes"] for f in files) if files else 0
    return {
        "status": "healthy",
        "memory_available_gb": round(mem.available/(1024**3), 2),
        "memory_used_percent": mem.percent,
        "files": {"count": len(files), "total_size_gb": round(total_size/(1024**3), 3)}
    }

# -----------------------
# WEB SOCKET BINARIO
# -----------------------
@app.websocket("/ws/binary-stream")
async def websocket_binary_stream(websocket: WebSocket):
    """
    Protocol:
      - Query params:
         * chunk_size (int, optional) points per chunk
         * file_name  (optional) stream single file
      - Server sends:
         1) JSON {type: "connected", ...}
         2) For each chunk:
            a) JSON {type: "chunk_meta", meta: {...}}
            b) Binary frame: positions (Float32 interleaved: x,y,z)
            c) (Optional) Binary frame: colors (Float32 interleaved: r,g,b)
            d) JSON {type: "progress", ...}  (optional)
         3) JSON {type: "complete"}
         4) If error: JSON {type: "error", message, file}
    """
    await websocket.accept()
    # leer query params con seguridad (WebSocketQueryParams son strings)
    try:
        qs = websocket.query_params
        chunk_size = int(qs.get("chunk_size", 200000))
    except Exception:
        chunk_size = 200000

    file_name = websocket.query_params.get("file_name", None)

    client_id = str(uuid.uuid4())[:8]
    print(f"🔵 WebSocket conectado | client={client_id} | chunk_size={chunk_size} | file_name={file_name}")

    try:
        # decidir lista de archivos
        if file_name:
            target_paths = [os.path.join("data", file_name)]
        else:
            files = processor.get_file_list()
            target_paths = [f["path"] for f in files]

        if not target_paths:
            await websocket.send_json({"type": "complete", "message": "No hay archivos disponibles", "total_files": 0})
            print("⚪ No files to stream — closing WS")
            await websocket.close()
            return

        # Enviar connected
        await websocket.send_json({
            "type": "connected",
            "message": f"Binary streaming iniciado ({len(target_paths)} archivos)",
            "total_files": len(target_paths),
            "chunk_size": chunk_size
        })

        # Iterar archivos
        for path in target_paths:
            fname = os.path.basename(path)
            print(f"📦 Streaming archivo: {path} (client={client_id})")
            try:
                # stream_chunks_binary es síncrono/generador — lo iteramos
                gen = processor.stream_chunks_binary(path, chunk_size=chunk_size)
                chunk_counter = 0
                for meta, pos_bytes, color_bytes in gen:
                    # meta: dict, pos_bytes: bytes, color_bytes: bytes|None
                    # 1) enviar meta JSON
                    try:
                        await websocket.send_json({"type": "chunk_meta", "meta": meta})
                    except Exception as e:
                        # si no se puede enviar JSON (socket cerrado), abortar
                        raise e

                    # 2) enviar positions (binary)
                    try:
                        if pos_bytes is None:
                            raise Exception("pos_bytes is None for chunk")
                        await websocket.send_bytes(pos_bytes)
                    except Exception as e:
                        raise Exception(f"Failed sending pos bytes: {e}")

                    # 3) enviar colors si existen
                    try:
                        if color_bytes:
                            await websocket.send_bytes(color_bytes)
                    except Exception as e:
                        # no crítico: log y continuar
                        print(f"⚠️ Warning sending colors for {fname}: {e}")

                    # 4) enviar progreso JSON opcional
                    try:
                        await websocket.send_json({
                            "type": "progress",
                            "file": meta.get("file_name", fname),
                            "start": meta.get("start"),
                            "count": meta.get("count"),
                            "total_points": meta.get("total_points"),
                            "chunk_index": meta.get("chunk_index"),
                            "progress_pct": meta.get("progress_pct")
                        })
                    except:
                        pass

                    chunk_counter += 1
                    # breve sleep para evitar saturar la red/buffer — ajustable
                    await asyncio.sleep(0.005)

                print(f"✅ Archivo stream completado: {fname} -> chunks sent: {chunk_counter} (client={client_id})")

            except Exception as e:
                # enviar error al cliente en JSON
                tb = traceback.format_exc()
                err_msg = f"Error en stream_chunks_binary({fname}): {e}"
                print(f"❌ {err_msg}\n{tb}")
                try:
                    await websocket.send_json({"type": "error", "message": err_msg, "file": fname})
                except:
                    pass
                # continuar con siguientes archivos
                continue

        # Al terminar todos los archivos
        try:
            await websocket.send_json({"type": "complete", "message": "stream finished"})
            print(f"🟢 Streaming binario completado (client={client_id})")
        except:
            pass

    except Exception as e:
        tb = traceback.format_exc()
        print(f"❌ Error WebSocket (client={client_id}): {e}\n{tb}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass

    finally:
        try:
            await websocket.close()
        except:
            pass
        print(f"🔴 WebSocket cerrado (client={client_id})")
