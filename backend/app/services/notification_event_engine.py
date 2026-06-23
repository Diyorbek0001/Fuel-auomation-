from __future__ import annotations

from datetime import date
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models import FuelDispatch, FuelDispatchStatus, Truck, TruckStateHistory
from app.models.common import utcnow
from app.services.notification_service import create_notification_event
from app.services.telegram_service import send_telegram_message


async def process_truck_update(session: AsyncSession, truck: Truck) -> None:
    active_dispatch_distance = await _process_dispatch_events(session, truck)
    session.add(
        TruckStateHistory(
            truck_id=truck.id,
            fuel_percent=truck.fuel_percent,
            latitude=truck.latitude,
            longitude=truck.longitude,
            odometer_miles=truck.odometer_miles,
            speed_mph=truck.speed_mph,
            distance_to_active_dispatch_miles=active_dispatch_distance,
        )
    )

    if not truck.active:
        return

    await _process_fuel_events(session, truck)


async def _process_fuel_events(session: AsyncSession, truck: Truck) -> None:
    settings = get_settings()
    previous = truck.previous_fuel_percent
    current = truck.fuel_percent
    if previous is None or current is None:
        return

    threshold = settings.fuel_default_threshold_percent or settings.low_fuel_threshold_percent
    today = date.today().isoformat()

    if previous > threshold >= current:
        message = f"Unit {truck.unit_number} fuel dropped below {threshold}%. Current fuel: {current:.0f}%."
        notification = await create_notification_event(
            session,
            truck=truck,
            event_type="FUEL_DROPPED_BELOW_THRESHOLD",
            title=f"Fuel below {threshold}%",
            message=message,
            dedupe_key=f"fuel_low:{truck.id}:{threshold}:{today}",
            payload_json={"previous_fuel_percent": previous, "fuel_percent": current},
        )
        if notification:
            await _send_telegram_safe(_fuel_low_message(truck, current))

    increase = current - previous
    if increase >= settings.fuel_refuel_jump_percent:
        previous_bucket = int(previous // settings.fuel_refuel_jump_percent)
        current_bucket = int(current // settings.fuel_refuel_jump_percent)
        message = f"Unit {truck.unit_number} likely fueled. Fuel increased from {previous:.0f}% to {current:.0f}%."
        notification = await create_notification_event(
            session,
            truck=truck,
            event_type="FUEL_JUMP_20_PERCENT",
            title="Refuel detected",
            message=message,
            dedupe_key=f"fuel_jump:{truck.id}:{previous_bucket}:{current_bucket}:{today}",
            payload_json={
                "previous_fuel_percent": previous,
                "fuel_percent": current,
                "increase_percent": increase,
            },
        )
        if notification:
            await _send_telegram_safe(_refuel_message(truck, previous, current))


async def _process_dispatch_events(session: AsyncSession, truck: Truck) -> float | None:
    if not truck.active:
        return None
    if truck.latitude is None or truck.longitude is None:
        return None

    settings = get_settings()
    dispatches = await session.scalars(
        select(FuelDispatch)
        .options(selectinload(FuelDispatch.station))
        .where(FuelDispatch.truck_id == truck.id, FuelDispatch.status == FuelDispatchStatus.assigned)
    )

    closest_distance: float | None = None
    now = utcnow()
    for dispatch in dispatches:
        station = dispatch.station
        distance = haversine_miles(truck.latitude, truck.longitude, station.latitude, station.longitude)
        closest_distance = distance if closest_distance is None else min(closest_distance, distance)
        dispatch.last_distance_to_station_miles = distance
        if dispatch.minimum_distance_to_station_miles is None:
            dispatch.minimum_distance_to_station_miles = distance
        else:
            dispatch.minimum_distance_to_station_miles = min(dispatch.minimum_distance_to_station_miles, distance)

        if distance <= settings.dispatch_pre_alert_miles and dispatch.pre_alert_sent_at is None:
            dispatch.pre_alert_sent_at = now
            await _dispatch_notification(
                session,
                truck,
                dispatch,
                "DISPATCH_60_MILES_AWAY",
                "Dispatch 60 miles away",
                f"Unit {truck.unit_number} is {distance:.0f} miles from {station.station_name}.",
            )

        if distance <= settings.dispatch_final_alert_miles and dispatch.final_alert_sent_at is None:
            dispatch.final_alert_sent_at = now
            await _dispatch_notification(
                session,
                truck,
                dispatch,
                "DISPATCH_50_MILES_AWAY",
                "Dispatch 50 miles away",
                f"Unit {truck.unit_number} is {distance:.0f} miles from {station.station_name}.",
            )

        if distance <= settings.dispatch_arrival_radius_miles and dispatch.arrived_alert_sent_at is None:
            dispatch.status = FuelDispatchStatus.completed
            dispatch.completed_at = now
            dispatch.arrived_alert_sent_at = now
            await _dispatch_notification(
                session,
                truck,
                dispatch,
                "DISPATCH_ARRIVED",
                "Dispatch arrived",
                f"Unit {truck.unit_number} arrived at {station.station_name}.",
            )
            continue

        minimum = dispatch.minimum_distance_to_station_miles
        if (
            minimum is not None
            and minimum <= 2
            and distance >= minimum + settings.dispatch_missed_distance_miles
            and dispatch.arrived_alert_sent_at is None
            and dispatch.missed_alert_sent_at is None
        ):
            dispatch.status = FuelDispatchStatus.missed
            dispatch.missed_at = now
            dispatch.missed_alert_sent_at = now
            await _dispatch_notification(
                session,
                truck,
                dispatch,
                "DISPATCH_MISSED",
                "Dispatch missed",
                f"Unit {truck.unit_number} appears to have missed {station.station_name}.",
            )

    return closest_distance


async def _dispatch_notification(
    session: AsyncSession,
    truck: Truck,
    dispatch: FuelDispatch,
    event_type: str,
    title: str,
    message: str,
) -> None:
    notification = await create_notification_event(
        session,
        truck=truck,
        dispatch_id=dispatch.id,
        event_type=event_type,
        title=title,
        message=message,
        dedupe_key=f"{event_type.lower()}:{dispatch.id}",
        payload_json={
            "station_id": dispatch.station_id,
            "distance_miles": dispatch.last_distance_to_station_miles,
            "minimum_distance_miles": dispatch.minimum_distance_to_station_miles,
        },
    )
    if notification:
        await _send_telegram_safe(f"{title}\nUnit: {truck.unit_number}\n{message}")


async def _send_telegram_safe(message: str) -> None:
    try:
        await send_telegram_message(message)
    except Exception:
        return


def _fuel_low_message(truck: Truck, fuel_percent: float) -> str:
    location = ", ".join(part for part in [truck.current_city, truck.current_state] if part) or "Unknown"
    return f"Fuel Alert\nUnit: {truck.unit_number}\nFuel: {fuel_percent:.0f}%\nLocation: {location}"


def _refuel_message(truck: Truck, previous: float, current: float) -> str:
    return (
        f"Refuel Detected\nUnit: {truck.unit_number}\n"
        f"Fuel: {previous:.0f}% -> {current:.0f}%\nIncrease: +{current - previous:.0f}%"
    )


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_miles = 3958.8
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * earth_radius_miles * asin(sqrt(a))
