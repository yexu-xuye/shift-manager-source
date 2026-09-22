import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .database import engine, Base
from .routers import employees, groups, schedule, duty_groups, duty_schedule, ad_routes

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="排班管理系统 API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8020", "http://127.0.0.1:8020"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ——— 全局异常处理 ———
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # SPA 兜底：前端路由（无扩展名、非 API）404 时返回 index.html
    if exc.status_code == 404 and DIST.is_dir():
        path = request.url.path
        if not path.startswith("/api") and not path.startswith("/health") and not Path(path).suffix:
            index_file = DIST / "index.html"
            if index_file.exists():
                return FileResponse(index_file)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"[500] {request.method} {request.url.path}")
    return JSONResponse(status_code=500, content={"error": "服务器内部错误"})

app.include_router(employees.router)
app.include_router(groups.router)
app.include_router(schedule.router)
app.include_router(duty_groups.router)
app.include_router(duty_schedule.router)
app.include_router(ad_routes.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# ——— 缓存策略 ———
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") or path.startswith("/health"):
        return response
    if path == "/" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    elif path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


# ——— 前端静态文件 ———
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="frontend")
