from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.station import StationListOut, StationOut, StationPriceOut
from app.services.station_service import get_station_by_site, latest_price, list_stations

router = APIRouter()


@router.get("", response_model=StationListOut)
async def api_list_stations(
    state: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> StationListOut:
    total, stations = await list_stations(session, state=state, search=search, limit=limit, offset=offset)
    return StationListOut(total=total, items=[_station_out(station) for station in stations])


@router.get("/{site_code}", response_model=StationOut)
async def api_get_station(site_code: str, session: AsyncSession = Depends(get_session)) -> StationOut:
    station = await get_station_by_site(session, site_code)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return _station_out(station)


def _station_out(station) -> StationOut:
    price = latest_price(station)
    return StationOut(
        id=station.id,
        site_code=station.site_code,
        store_number=station.store_number,
        brand=station.brand,
        station_name=station.station_name,
        address=station.address,
        city=station.city,
        state=station.state,
        zip=station.zip,
        latitude=station.latitude,
        longitude=station.longitude,
        phone=station.phone,
        parking_spaces_count=station.parking_spaces_count,
        fuel_lane_count=station.fuel_lane_count,
        shower_count=station.shower_count,
        amenities=station.amenities,
        restaurants=station.restaurants,
        latest_price=StationPriceOut.model_validate(price) if price else None,
    )
