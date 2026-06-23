from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import FuelDispatch, FuelDispatchStatus, StationMaster, Truck
from app.models.common import utcnow
from app.schemas.dispatch import DispatchAssignIn, DispatchCancelIn, DispatchOut
from app.services.auth_service import require_admin_user

router = APIRouter()


@router.post("/assign", response_model=DispatchOut)
async def api_assign_dispatch(
    payload: DispatchAssignIn,
    _=Depends(require_admin_user),
    session: AsyncSession = Depends(get_session),
) -> FuelDispatch:
    truck = await session.get(Truck, payload.truck_id)
    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found")
    if not truck.active:
        raise HTTPException(status_code=400, detail="Inactive units cannot be dispatched")
    station = await session.get(StationMaster, payload.station_id)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")

    existing_dispatches = await session.scalars(
        select(FuelDispatch).where(
            FuelDispatch.truck_id == truck.id,
            FuelDispatch.status == FuelDispatchStatus.assigned,
        )
    )
    for dispatch in existing_dispatches:
        dispatch.status = FuelDispatchStatus.cancelled
        dispatch.cancelled_at = utcnow()

    dispatch = FuelDispatch(truck_id=truck.id, driver_id=truck.driver_id, station_id=station.id)
    session.add(dispatch)
    await session.commit()
    await session.refresh(dispatch)
    return dispatch


@router.post("/cancel")
async def api_cancel_dispatch(
    payload: DispatchCancelIn,
    _=Depends(require_admin_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    dispatches = await session.scalars(
        select(FuelDispatch).where(
            FuelDispatch.truck_id == payload.truck_id,
            FuelDispatch.status == FuelDispatchStatus.assigned,
        )
    )
    changed = 0
    now = utcnow()
    for dispatch in dispatches:
        dispatch.status = FuelDispatchStatus.cancelled
        dispatch.cancelled_at = now
        changed += 1
    await session.commit()
    return {"updated": changed}
