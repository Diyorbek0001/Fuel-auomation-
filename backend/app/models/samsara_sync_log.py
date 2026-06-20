from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import utcnow


class SamsaraSyncLog(Base):
    __tablename__ = "samsara_sync_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    vehicles_read: Mapped[int] = mapped_column(Integer, default=0)
    vehicles_updated: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
