from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import utcnow


class StationMaster(Base):
    __tablename__ = "station_master"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    store_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    brand: Mapped[str] = mapped_column(String(64), default="Unknown", index=True)
    station_name: Mapped[str] = mapped_column(String(255), index=True)
    address: Mapped[str] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(128), index=True)
    state: Mapped[str] = mapped_column(String(16), index=True)
    zip: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    parking_spaces_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fuel_lane_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    shower_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    amenities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    restaurants: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(255), default="final_fuel_stations.csv")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    prices: Mapped[list["FuelPrice"]] = relationship(back_populates="station")
    dispatches: Mapped[list["FuelDispatch"]] = relationship(back_populates="station")
