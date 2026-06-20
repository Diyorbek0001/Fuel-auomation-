from typing import Optional

from pydantic import BaseModel, ConfigDict


class DriverSummaryOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class TruckOut(BaseModel):
    id: int
    unit_number: str
    fuel_percent: Optional[float]
    latitude: Optional[float]
    longitude: Optional[float]
    odometer_miles: Optional[float]
    current_city: Optional[str]
    current_state: Optional[str]
    destination: Optional[str]
    active: bool
    samsara_account_name: Optional[str]
    driver: Optional[DriverSummaryOut]

    model_config = ConfigDict(from_attributes=True)


class TruckListOut(BaseModel):
    total: int
    items: list[TruckOut]
