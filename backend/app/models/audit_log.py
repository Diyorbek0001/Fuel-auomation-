from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import utcnow


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(nullable=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(96), index=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String(96), nullable=True, index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True, index=True)
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
