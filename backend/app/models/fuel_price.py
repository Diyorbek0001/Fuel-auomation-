from datetime import date, datetime
from decimal import Decimal
import enum
from typing import Optional

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import utcnow


class FuelPriceImportStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


class FuelPriceImportBatch(Base):
    __tablename__ = "fuel_price_import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_file: Mapped[str] = mapped_column(String(255), index=True)
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    status: Mapped[FuelPriceImportStatus] = mapped_column(
        Enum(FuelPriceImportStatus), default=FuelPriceImportStatus.pending, index=True
    )
    rows_read: Mapped[int] = mapped_column(Integer, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    imported_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    prices: Mapped[list["FuelPrice"]] = relationship(back_populates="import_batch")


class FuelPrice(Base):
    __tablename__ = "fuel_prices"
    __table_args__ = (
        UniqueConstraint("station_id", "fuel_type", "effective_date", "import_batch_id", name="uq_fuel_price_batch"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("station_master.id"), index=True)
    import_batch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("fuel_price_import_batches.id"), nullable=True, index=True)
    site_code: Mapped[str] = mapped_column(String(32), index=True)
    fuel_type: Mapped[str] = mapped_column(String(32), index=True)
    retail_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    discount_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    your_price: Mapped[Decimal] = mapped_column(Numeric(10, 4), index=True)
    effective_date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    station: Mapped["StationMaster"] = relationship(back_populates="prices")
    import_batch: Mapped[Optional["FuelPriceImportBatch"]] = relationship(back_populates="prices")
