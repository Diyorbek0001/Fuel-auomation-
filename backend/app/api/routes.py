from fastapi import APIRouter

from app.api import notifications, samsara, stations, trucks

api_router = APIRouter()


@api_router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(stations.router, prefix="/stations", tags=["stations"])
api_router.include_router(trucks.router, prefix="/trucks", tags=["trucks"])
api_router.include_router(samsara.router, prefix="/samsara", tags=["samsara"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
