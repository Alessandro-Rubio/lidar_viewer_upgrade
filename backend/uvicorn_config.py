import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0", 
        port=8000,
        reload=True,
        # Solo parámetros válidos para uvicorn.run()
        timeout_keep_alive=300,
        log_level="info",
        # Configuración para grandes respuestas (parámetros válidos)
        workers=1,  # Usar 1 worker para evitar problemas de memoria
        loop="asyncio",  # Tipo de loop
        http="httptools"  # Implementación HTTP más rápida
    )