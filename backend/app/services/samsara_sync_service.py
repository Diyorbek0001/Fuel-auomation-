from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations.samsara import SamsaraClient, SamsaraVehicleSnapshot
from app.models import Driver, SamsaraSyncLog, Truck
from app.models.common import utcnow


async def sync_all_samsara_accounts(session: AsyncSession) -> list[SamsaraSyncLog]:
    settings = get_settings()
    logs: list[SamsaraSyncLog] = []
    for account_name, api_token in settings.samsara_accounts:
        logs.append(await sync_samsara_account(session, account_name=account_name, api_token=api_token))
    return logs


async def sync_samsara_account(session: AsyncSession, *, account_name: str, api_token: str) -> SamsaraSyncLog:
    settings = get_settings()
    started_at = utcnow()
    log = SamsaraSyncLog(account_name=account_name, started_at=started_at, success=False)
    session.add(log)
    await session.flush()

    try:
        snapshots = await SamsaraClient(
            api_token,
            base_url=settings.samsara_base_url,
            group_id=settings.samsara_group_id,
        ).list_vehicle_snapshots()
        updated = 0
        for snapshot in snapshots:
            await _upsert_truck(session, account_name=account_name, snapshot=snapshot)
            updated += 1
        log.vehicles_read = len(snapshots)
        log.vehicles_updated = updated
        log.success = True
        log.completed_at = utcnow()
        await session.commit()
    except Exception as exc:
        await session.rollback()
        log = SamsaraSyncLog(account_name=account_name, started_at=started_at, success=False)
        session.add(log)
        log.error_message = str(exc)
        log.completed_at = utcnow()
        await session.commit()
    return log


async def _upsert_truck(session: AsyncSession, *, account_name: str, snapshot: SamsaraVehicleSnapshot) -> Truck:
    truck = await session.scalar(
        select(Truck).where(
            Truck.samsara_account_name == account_name,
            Truck.samsara_vehicle_id == snapshot.vehicle_id,
        )
    )
    if truck is None:
        truck = Truck(
            samsara_account_name=account_name,
            samsara_vehicle_id=snapshot.vehicle_id,
            unit_number=snapshot.unit_number,
        )
        session.add(truck)

    truck.unit_number = snapshot.unit_number
    truck.fuel_percent = snapshot.fuel_percent
    truck.latitude = snapshot.latitude
    truck.longitude = snapshot.longitude
    truck.odometer_miles = snapshot.odometer_miles
    truck.last_samsara_sync_at = utcnow()

    if snapshot.driver_name:
        truck.driver = await _upsert_driver(session, snapshot.driver_name)

    return truck


async def _upsert_driver(session: AsyncSession, name: str) -> Driver:
    driver = await session.scalar(select(Driver).where(Driver.name == name))
    if driver is None:
        driver = Driver(name=name)
        session.add(driver)
        await session.flush()
    return driver
