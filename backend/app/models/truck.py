from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import utcnow


class Truck(Base):
    __tablename__ = "trucks"
    __table_args__ = (UniqueConstraint("samsara_account_name", "samsara_vehicle_id", name="uq_truck_samsara_account_vehicle"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"), nullable=True, index=True)
    driver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("drivers.id"), nullable=True, index=True)
    samsara_account_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    samsara_vehicle_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    unit_number: Mapped[str] = mapped_column(String(64), index=True)
    fuel_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, index=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    odometer_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_city: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    current_state: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_samsara_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    company: Mapped[Optional["Company"]] = relationship(back_populates="trucks")
    driver: Mapped[Optional["Driver"]] = relationship(back_populates="trucks")
    dispatches: Mapped[list["FuelDispatch"]] = relationship(back_populates="truck")
