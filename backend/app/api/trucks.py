from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import Truck
from app.schemas.truck import TruckListOut
from app.services.auth_service import current_user_from_token, require_admin_user, require_current_user
from app.services.truck_broadcaster import truck_broadcaster
from app.services.truck_service import list_trucks

router = APIRouter()


@router.get("", response_model=TruckListOut)
async def api_list_trucks(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _=Depends(require_current_user),
    session: AsyncSession = Depends(get_session),
) -> TruckListOut:
    total, trucks = await list_trucks(session, search=search, status_filter=status_filter, limit=limit, offset=offset)
    return TruckListOut(total=total, items=trucks)


@router.patch("/{truck_id}/active")
async def api_set_truck_active(
    truck_id: int,
    active: bool,
    _=Depends(require_admin_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    truck = await session.get(Truck, truck_id)
    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found")
    truck.active = active
    await session.commit()
    return {"active": truck.active}


@router.get("/stream")
async def api_truck_stream(token: str, session: AsyncSession = Depends(get_session)) -> StreamingResponse:
    user = await current_user_from_token(session, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    async def event_stream():
        async for event in truck_broadcaster.subscribe():
            yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
