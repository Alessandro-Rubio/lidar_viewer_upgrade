import asyncio
import websockets
import json
import time
import sys


async def test_websocket():
    uri = "ws://localhost:8000/ws/stream?target_points=10000"  # Reducir para prueba rápida
    
    try:
        print(f"🔗 Conectando a {uri}")
        async with websockets.connect(uri, ping_interval=20, ping_timeout=20) as websocket:
            print("✅ Conectado al servidor WebSocket")
            
            # Recibir primer mensaje
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5)
                data = json.loads(message)
                print(f"📦 Primer mensaje recibido: {data}")
                
                if data.get('type') == 'error':
                    print(f"❌ ERROR del servidor: {data}")
                    return
                    
            except asyncio.TimeoutError:
                print("⏳ Timeout esperando primer mensaje")
                return
            
            # Escuchar más mensajes - AUMENTAR TIEMPO
            start_time = time.time()
            message_count = 0
            max_wait_time = 60  # 60 segundos máximo
            
            while time.time() - start_time < max_wait_time:
                try:
                    # Timeout más largo para recibir datos
                    message = await asyncio.wait_for(websocket.recv(), timeout=30)
                    data = json.loads(message)
                    message_count += 1
                    
                    if data.get('type') == 'heartbeat':
                        print(f"💓 Heartbeat recibido: {data.get('message', '')}")
                    elif data.get('type') == 'data_chunk':
                        chunk_metadata = data.get('metadata', {})
                        print(f"📦 Chunk {message_count}: {data.get('type')}")
                        print(f"   • Progreso: {chunk_metadata.get('progress_percentage', 0):.1f}%")
                        print(f"   • Archivos: {chunk_metadata.get('files_processed', 0)}/{chunk_metadata.get('total_files', 0)}")
                    else:
                        print(f"📦 Mensaje {message_count}: {data.get('type', 'unknown')}")
                    
                    if data.get('type') == 'stream_complete':
                        print("🏁 Stream completado")
                        break
                        
                except asyncio.TimeoutError:
                    elapsed = time.time() - start_time
                    print(f"⏳ Esperando datos... ({message_count} mensajes en {elapsed:.1f}s)")
                    # Enviar ping para mantener conexión
                    try:
                        await websocket.ping()
                    except:
                        pass
                    continue
                except json.JSONDecodeError as e:
                    print(f"❌ Error decodificando JSON: {e}")
                    print(f"   Mensaje crudo: {message[:100]}...")
                    
            print(f"📊 Total de mensajes recibidos: {message_count}")
                    
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"❌ Conexión cerrada inesperadamente: {e}")
    except Exception as e:
        print(f"❌ Error general: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

def test_api_endpoints():
    import requests
    
    print("\n🌐 Probando endpoints HTTP...")
    
    endpoints = [
        ("http://localhost:8000/", "Root"),
        ("http://localhost:8000/api/health", "Health"),
        ("http://localhost:8000/api/test", "Test"),
        ("http://localhost:8000/api/start-stream-session?target_points=100000", "Start Stream Session"),
    ]
    
    for url, name in endpoints:
        try:
            print(f"\n📡 Probando {name}: {url}")
            response = requests.get(url, timeout=5)
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   Respuesta: {json.dumps(data, indent=2)[:200]}...")
            else:
                print(f"   Error: {response.text[:200]}")
        except requests.exceptions.ConnectionError:
            print(f"   ❌ No se pudo conectar al backend")
            print("   Asegúrate de que el servidor esté ejecutándose: python main.py")
        except Exception as e:
            print(f"   ❌ Error: {type(e).__name__}: {e}")

def test_stream_processor():
    print("\n🧪 Probando StreamProcessor directamente...")
    
    try:
        # Intenta importar el StreamProcessor
        from stream_processor import StreamProcessor
        
        processor = StreamProcessor()
        print("✅ StreamProcessor importado correctamente")
        
        # Verificar archivos disponibles
        from laz_processor import LAZProcessor
        laz_processor = LAZProcessor()
        files = laz_processor.get_file_list()
        print(f"📁 Archivos encontrados: {len(files)}")
        
        if len(files) > 0:
            print("📋 Primeros 5 archivos:")
            for i, f in enumerate(files[:5]):
                print(f"   {i+1}. {f['name']} ({f['size']})")
        else:
            print("⚠️ No se encontraron archivos .laz en la carpeta /data")
            
    except ImportError as e:
        print(f"❌ Error importando módulos: {e}")
        print("   Asegúrate de que los archivos existan:")
        print("   - stream_processor.py")
        print("   - laz_processor.py")
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🧪 Probando sistema de streaming...")
    
    # Primero probar endpoints HTTP
    test_api_endpoints()
    
    # Probar el StreamProcessor
    test_stream_processor()
    
    # Solo probar WebSocket si todo lo anterior funciona
    print("\n1. Probando WebSocket...")
    asyncio.run(test_websocket())