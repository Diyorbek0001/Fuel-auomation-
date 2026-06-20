from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


SAMSARA_BASE_URL = "https://api.samsara.com"


@dataclass(frozen=True)
class SamsaraVehicleSnapshot:
    vehicle_id: str
    unit_number: str
    fuel_percent: float | None
    latitude: float | None
    longitude: float | None
    odometer_miles: float | None
    driver_name: str | None


@dataclass(frozen=True)
class SamsaraConnectionTest:
    configured: bool
    ok: bool
    vehicle_count: int
    sample_vehicle_names: list[str]
    latest_error: str | None = None


class SamsaraClient:
    def __init__(self, api_token: str, *, base_url: str = SAMSARA_BASE_URL, group_id: str = "") -> None:
        self.api_token = api_token
        self.base_url = base_url.rstrip("/")
        self.group_id = group_id

    async def list_vehicle_snapshots(self) -> list[SamsaraVehicleSnapshot]:
        vehicles = await self.list_vehicles()
        stats = await self.list_vehicle_stats()
        stats_by_id = {_vehicle_id(item): item for item in stats}
        snapshots: list[SamsaraVehicleSnapshot] = []
        for vehicle in vehicles:
            vehicle_id = _vehicle_id(vehicle)
            merged = {**stats_by_id.get(vehicle_id, {}), "vehicle": vehicle}
            snapshots.append(_vehicle_snapshot(merged))
        return [snapshot for snapshot in snapshots if snapshot.vehicle_id]

    async def test_connection(self) -> SamsaraConnectionTest:
        if not self.api_token:
            return SamsaraConnectionTest(configured=False, ok=False, vehicle_count=0, sample_vehicle_names=[])
        try:
            vehicles = await self.list_vehicles()
            return SamsaraConnectionTest(
                configured=True,
                ok=True,
                vehicle_count=len(vehicles),
                sample_vehicle_names=[str(vehicle.get("name") or vehicle.get("id") or "Unknown") for vehicle in vehicles[:5]],
            )
        except Exception as exc:
            return SamsaraConnectionTest(
                configured=True,
                ok=False,
                vehicle_count=0,
                sample_vehicle_names=[],
                latest_error=str(exc),
            )

    async def list_vehicles(self) -> list[dict[str, Any]]:
        params = self._params()
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
            response = await client.get(
                "/fleet/vehicles",
                headers={"Authorization": f"Bearer {self.api_token}"},
                params=params,
            )
            response.raise_for_status()
            payload = response.json()
        return payload.get("data", [])

    async def list_vehicle_stats(self) -> list[dict[str, Any]]:
        params = self._params(types="gps,obdOdometerMeters,fuelPercents")
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
            response = await client.get(
                "/fleet/vehicles/stats",
                headers={"Authorization": f"Bearer {self.api_token}"},
                params=params,
            )
            response.raise_for_status()
            payload = response.json()
        return payload.get("data", [])

    def _params(self, **params: str) -> dict[str, str]:
        if self.group_id:
            params["groupIds"] = self.group_id
        return params


def _vehicle_snapshot(item: dict[str, Any]) -> SamsaraVehicleSnapshot:
    vehicle = item.get("vehicle") or item
    gps = _latest_value(item.get("gps"))
    odometer = _latest_value(item.get("obdOdometerMeters") or item.get("odometerMeters"))
    fuel = _latest_value(item.get("fuelPercents") or item.get("fuelPercent"))
    return SamsaraVehicleSnapshot(
        vehicle_id=_vehicle_id(item),
        unit_number=str(vehicle.get("name") or vehicle.get("externalIds", {}).get("samsara.serial") or _vehicle_id(item)),
        fuel_percent=_float_or_none((fuel or {}).get("value")),
        latitude=_float_or_none((gps or {}).get("latitude")),
        longitude=_float_or_none((gps or {}).get("longitude")),
        odometer_miles=_meters_to_miles(_float_or_none((odometer or {}).get("value"))),
        driver_name=_driver_name(item),
    )


def _vehicle_id(item: dict[str, Any]) -> str:
    vehicle = item.get("vehicle") or item
    return str(vehicle.get("id") or item.get("id") or "")


def _latest_value(value: Any) -> dict[str, Any] | None:
    if isinstance(value, list) and value:
        return value[-1]
    if isinstance(value, dict):
        return value
    if isinstance(value, (int, float)):
        return {"value": value}
    return None


def _driver_name(item: dict[str, Any]) -> str | None:
    driver = item.get("driver") or item.get("currentDriver")
    if not isinstance(driver, dict):
        return None
    return driver.get("name") or driver.get("username")


def _float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _meters_to_miles(value: float | None) -> float | None:
    if value is None:
        return None
    return value / 1609.344
