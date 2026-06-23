from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.db.session import async_session_maker
from app.services.auth_service import ensure_creator_user
from app.services.samsara_background_worker import samsara_background_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session_maker() as session:
        await ensure_creator_user(session)
    samsara_background_worker.start()
    try:
        yield
    finally:
        await samsara_background_worker.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
