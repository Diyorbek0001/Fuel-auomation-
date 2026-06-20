from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StationPriceOut(BaseModel):
    fuel_type: str
    retail_price: Optional[Decimal]
    discount_price: Optional[Decimal]
    your_price: Decimal
    effective_date: date

    model_config = ConfigDict(from_attributes=True)


class StationOut(BaseModel):
    id: int
    site_code: str
    store_number: str
    brand: str
    station_name: str
    address: str
    city: str
    state: str
    zip: Optional[str]
    latitude: float
    longitude: float
    phone: Optional[str]
    parking_spaces_count: Optional[int]
    fuel_lane_count: Optional[int]
    shower_count: Optional[int]
    amenities: Optional[str]
    restaurants: Optional[str]
    latest_price: Optional[StationPriceOut] = None

    model_config = ConfigDict(from_attributes=True)


class StationListOut(BaseModel):
    total: int
    items: list[StationOut]


class FuelImportResultOut(BaseModel):
    batch_id: int
    source_file: str
    rows_read: int
    rows_imported: int
    rows_skipped: int
    effective_date: Optional[date]
