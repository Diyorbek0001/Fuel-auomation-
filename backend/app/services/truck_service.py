from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import FuelDispatch, FuelDispatchStatus, Truck


async def list_trucks(
    session: AsyncSession,
    *,
    search: str | None = None,
    status_filter: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> tuple[int, list[Truck]]:
    stmt = _truck_query(search=search, status_filter=status_filter)
    total = int((await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
    trucks = await session.scalars(
        stmt.options(selectinload(Truck.driver))
        .order_by(Truck.fuel_percent.asc().nulls_last(), Truck.unit_number)
        .limit(limit)
        .offset(offset)
    )
    return total, list(trucks)


def _truck_query(*, search: str | None, status_filter: str | None) -> Select[tuple[Truck]]:
    stmt = select(Truck).where(Truck.active.is_(True))
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.outerjoin(Truck.driver).where(
            or_(
                Truck.unit_number.ilike(pattern),
                Truck.current_city.ilike(pattern),
                Truck.current_state.ilike(pattern),
            )
        )
    if status_filter == "fuel_lt_60":
        stmt = stmt.where(Truck.fuel_percent < 60)
    elif status_filter == "fuel_lt_50":
        stmt = stmt.where(Truck.fuel_percent < 50)
    elif status_filter == "fuel_lt_40":
        stmt = stmt.where(Truck.fuel_percent < 40)
    elif status_filter == "assigned":
        stmt = stmt.join(FuelDispatch).where(FuelDispatch.status == FuelDispatchStatus.assigned)
    elif status_filter == "missed":
        stmt = stmt.join(FuelDispatch).where(FuelDispatch.status == FuelDispatchStatus.missed)
    return stmt
