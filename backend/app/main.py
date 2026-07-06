from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app import db
from app.config import settings
from app.routers import ai, notes, papers, research


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Cache-Control", "no-store")
        content_type = response.headers.get("content-type", "")
        if content_type.startswith("application/json") and "charset=" not in content_type.lower():
            response.headers["content-type"] = "application/json; charset=utf-8"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.include_router(papers.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(research.router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/diagnostics")
def diagnostics() -> dict[str, object]:
    return {
        "status": "ok",
        "auth": settings.auth_diagnostics,
        "database": {
            "mode": "postgresql" if settings.database_url.strip() else "sqlite",
        },
        "ai": settings.ai_diagnostics,
        "ocr": settings.ocr_diagnostics,
    }
