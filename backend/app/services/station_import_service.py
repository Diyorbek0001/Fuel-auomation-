from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FuelPrice, FuelPriceImportBatch, FuelPriceImportStatus, StationMaster
from app.models.common import utcnow


REQUIRED_COLUMNS = {
    "site_code",
    "store_number",
    "brand",
    "station_name",
    "address",
    "city",
    "state",
    "latitude",
    "longitude",
    "fuel_type",
    "your_price",
    "effective_date",
}


@dataclass(frozen=True)
class StationImportResult:
    batch_id: int
    source_file: str
    rows_read: int
    rows_imported: int
    rows_skipped: int
    effective_date: date | None


def _clean(value: object) -> str:
    return str(value or "").strip()


def _site_code(value: object) -> str:
    text = _clean(value)
    return text.zfill(3) if text.isdigit() and len(text) < 3 else text


def _date_required(value: object) -> date:
    text = _clean(value)
    if not text:
        raise ValueError("effective_date is required")
    return datetime.strptime(text, "%Y-%m-%d").date()


def _decimal_required(value: object, field: str) -> Decimal:
    text = _clean(value).replace("$", "").replace(",", "")
    if not text:
        raise ValueError(f"{field} is required")
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"{field} is not a valid decimal") from exc


def _decimal_or_none(value: object) -> Decimal | None:
    text = _clean(value).replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _float_required(value: object, field: str) -> float:
    text = _clean(value)
    if not text:
        raise ValueError(f"{field} is required")
    return float(text)


def _int_or_none(value: object) -> int | None:
    text = _clean(value)
    return int(text) if text else None


async def import_final_fuel_stations(
    session: AsyncSession,
    csv_path: str | Path,
    *,
    imported_by: str | None = "system",
) -> StationImportResult:
    path = Path(csv_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Station CSV not found: {path}")

    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        missing_columns = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Station CSV is missing columns: {', '.join(sorted(missing_columns))}")
        rows = list(reader)

    batch = FuelPriceImportBatch(
        source_file=str(path),
        status=FuelPriceImportStatus.pending,
        rows_read=len(rows),
        imported_by=imported_by,
    )
    session.add(batch)
    await session.flush()

    stations_by_site = await _load_station_map(session)
    imported = 0
    skipped = 0
    effective_dates: set[date] = set()

    try:
        for row in rows:
            try:
                if _clean(row.get("fuel_type")).upper() != "DSL":
                    skipped += 1
                    continue
                effective_date = _date_required(row.get("effective_date"))
                effective_dates.add(effective_date)
                station = _upsert_station(stations_by_site, row)
                session.add(station)
                await session.flush()
                session.add(
                    FuelPrice(
                        station_id=station.id,
                        import_batch_id=batch.id,
                        site_code=station.site_code,
                        fuel_type=_clean(row.get("fuel_type")).upper(),
                        retail_price=_decimal_or_none(row.get("retail_price")),
                        discount_price=_decimal_or_none(row.get("discount_price")),
                        your_price=_decimal_required(row.get("your_price"), "your_price"),
                        effective_date=effective_date,
                    )
                )
                imported += 1
            except Exception:
                skipped += 1

        batch.status = FuelPriceImportStatus.completed
        batch.rows_imported = imported
        batch.rows_skipped = skipped
        batch.effective_date = min(effective_dates) if len(effective_dates) == 1 else None
        batch.completed_at = utcnow()
        await session.commit()
    except Exception as exc:
        batch.status = FuelPriceImportStatus.failed
        batch.rows_imported = imported
        batch.rows_skipped = skipped
        batch.error_message = str(exc)
        batch.completed_at = utcnow()
        await session.commit()
        raise

    return StationImportResult(
        batch_id=batch.id,
        source_file=str(path),
        rows_read=len(rows),
        rows_imported=imported,
        rows_skipped=skipped,
        effective_date=batch.effective_date,
    )


async def _load_station_map(session: AsyncSession) -> dict[str, StationMaster]:
    stations = await session.scalars(select(StationMaster))
    return {station.site_code: station for station in stations}


def _upsert_station(stations_by_site: dict[str, StationMaster], row: dict[str, str]) -> StationMaster:
    site_code = _site_code(row.get("site_code"))
    if not site_code:
        raise ValueError("site_code is required")
    station = stations_by_site.get(site_code)
    if station is None:
        station = StationMaster(site_code=site_code, store_number=_clean(row.get("store_number")))
        stations_by_site[site_code] = station

    station.store_number = _clean(row.get("store_number"))
    station.brand = _clean(row.get("brand")) or "Unknown"
    station.station_name = _clean(row.get("station_name"))
    station.address = _clean(row.get("address"))
    station.city = _clean(row.get("city"))
    station.state = _clean(row.get("state")).upper()
    station.zip = _clean(row.get("zip")) or None
    station.latitude = _float_required(row.get("latitude"), "latitude")
    station.longitude = _float_required(row.get("longitude"), "longitude")
    station.phone = _clean(row.get("phone")) or None
    station.parking_spaces_count = _int_or_none(row.get("parking_spaces_count"))
    station.fuel_lane_count = _int_or_none(row.get("fuel_lane_count"))
    station.shower_count = _int_or_none(row.get("shower_count"))
    station.amenities = _clean(row.get("amenities")) or None
    station.restaurants = _clean(row.get("restaurants")) or None
    station.source = _clean(row.get("source")) or "final_fuel_stations.csv"
    station.active = True
    return station
