from datetime import datetime
import enum
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import utcnow


class FuelDispatchStatus(str, enum.Enum):
    assigned = "assigned"
    completed = "completed"
    missed = "missed"
    cancelled = "cancelled"


class FuelDispatch(Base):
    __tablename__ = "fuel_dispatches"

    id: Mapped[int] = mapped_column(primary_key=True)
    truck_id: Mapped[int] = mapped_column(ForeignKey("trucks.id"), index=True)
    driver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("drivers.id"), nullable=True, index=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("station_master.id"), index=True)
    fuel_price_id: Mapped[Optional[int]] = mapped_column(ForeignKey("fuel_prices.id"), nullable=True, index=True)
    status: Mapped[FuelDispatchStatus] = mapped_column(Enum(FuelDispatchStatus), default=FuelDispatchStatus.assigned, index=True)
    assigned_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    missed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recommendation_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_off_route_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    navigation_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    telegram_message_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    truck: Mapped["Truck"] = relationship(back_populates="dispatches")
    driver: Mapped[Optional["Driver"]] = relationship(back_populates="dispatches")
    station: Mapped["StationMaster"] = relationship(back_populates="dispatches")
    fuel_price: Mapped[Optional["FuelPrice"]] = relationship()
    notes: Mapped[list["FuelDispatchNote"]] = relationship(back_populates="dispatch")


class FuelDispatchNote(Base):
    __tablename__ = "fuel_dispatch_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("fuel_dispatches.id"), index=True)
    author_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    dispatch: Mapped["FuelDispatch"] = relationship(back_populates="notes")
