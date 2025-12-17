from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dataset import router as dataset_router

app = FastAPI()

# ─────────────────────────────────────────────
# CORS (Angular dev server)
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # en prod se restringe
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# ROUTERS
# ─────────────────────────────────────────────
app.include_router(
    dataset_router,
    prefix="/data",
    tags=["dataset"]
)
