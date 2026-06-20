from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import FuelPrice, StationMaster


async def list_stations(
    session: AsyncSession,
    *,
    state: str | None = None,
    search: str | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> tuple[int, list[StationMaster]]:
    stmt = _station_query(state=state, search=search)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await session.execute(count_stmt)).scalar_one())
    rows = await session.scalars(
        stmt.options(selectinload(StationMaster.prices))
        .order_by(StationMaster.site_code)
        .limit(limit)
        .offset(offset)
    )
    return total, list(rows)


async def get_station_by_site(session: AsyncSession, site_code: str) -> StationMaster | None:
    normalized = site_code.zfill(3) if site_code.isdigit() and len(site_code) < 3 else site_code
    return await session.scalar(
        select(StationMaster)
        .options(selectinload(StationMaster.prices))
        .where(StationMaster.site_code == normalized)
    )


def latest_price(station: StationMaster) -> FuelPrice | None:
    if not station.prices:
        return None
    return sorted(station.prices, key=lambda price: (price.effective_date, price.id), reverse=True)[0]


def _station_query(*, state: str | None, search: str | None) -> Select[tuple[StationMaster]]:
    stmt = select(StationMaster).where(StationMaster.active.is_(True))
    if state:
        stmt = stmt.where(StationMaster.state == state.upper())
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                StationMaster.site_code.ilike(pattern),
                StationMaster.station_name.ilike(pattern),
                StationMaster.city.ilike(pattern),
            )
        )
    return stmt
