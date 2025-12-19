from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

app = FastAPI()

# =========================
# CORS (frontend Angular)
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# RUTA REAL DE DATA
# =========================
DATA_DIR = Path("data/processed")

if not DATA_DIR.exists():
    raise RuntimeError(f"No existe {DATA_DIR.resolve()}")

# =========================
# STATIC FILES
# =========================
app.mount(
    "/data/processed",
    StaticFiles(directory=DATA_DIR),
    name="processed-data"
)

@app.get("/")
def root():
    return {"status": "ok"}
