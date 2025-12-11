from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio
import time
from stream_processor import StreamProcessor

class WebSocketHandler:
    def __init__(self):
        self.processor = StreamProcessor()
        self.active_connections = {}
    
    async def handle_stream_websocket(self, websocket: WebSocket, target_points: int):
        await websocket.accept()
        connection_id = f"conn_{id(websocket)}"
        self.active_connections[connection_id] = websocket

        print(f"🔗 Nueva conexión WebSocket: {connection_id}")

        try:
            async for chunk in self.processor.stream_all_files(target_points=target_points):

                # Enviar chunk
                await websocket.send_json(chunk)

                # Intentar leer SIN BLOQUEAR pero usando "receive" en modo safe
                if websocket.application_state == websocket.ApplicationState.DISCONNECTED:
                    print("❌ Cliente desconectado antes de tiempo")
                    break

                # No esperar texto; el frontend no envía nada por WS.
                await asyncio.sleep(0)   # ceder control

            print(f"✅ Stream completado para {connection_id}")

        except WebSocketDisconnect:
            print(f"🔌 Cliente {connection_id} desconectado")

        except Exception as e:
            print(f"❌ Error en WebSocket {connection_id}: {e}")
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
            except:
                pass

        finally:
            self.active_connections.pop(connection_id, None)
            print(f"🧹 Conexión {connection_id} eliminada")

    
    async def handle_infinite_stream(self, websocket: WebSocket):
        """Maneja stream infinito"""
        await websocket.accept()
        connection_id = f"infinite_{id(websocket)}"
        
        print(f"🔗 Nueva conexión Infinite Stream: {connection_id}")
        
        try:
            async for chunk in self.processor.infinite_stream():
                try:
                    await websocket.send_json(chunk)
                    
                    # Verificar mensajes del cliente
                    try:
                        data = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                        if data == "stop":
                            print(f"🛑 Cliente {connection_id} detuvo infinite stream")
                            break
                    except asyncio.TimeoutError:
                        continue
                        
                except Exception as e:
                    print(f"❌ Error enviando chunk infinite a {connection_id}: {e}")
                    break
                    
        except WebSocketDisconnect:
            print(f"🔌 Cliente Infinite {connection_id} desconectado")
        except Exception as e:
            print(f"❌ Error en Infinite WebSocket {connection_id}: {e}")
        finally:
            print(f"🧹 Conexión Infinite {connection_id} finalizada")