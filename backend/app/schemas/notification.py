from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.models.notification_event import NotificationStatus


class NotificationEventOut(BaseModel):
    id: int
    truck_id: int
    dispatch_id: Optional[int]
    event_type: str
    title: str
    message: str
    status: NotificationStatus
    read_at: Optional[datetime]
    archived_at: Optional[datetime]
    created_at: datetime
    sent_at: Optional[datetime]
    payload_json: dict[str, Any]
    unit_number: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class NotificationListOut(BaseModel):
    total: int
    items: list[NotificationEventOut]


class NotificationBulkActionIn(BaseModel):
    notification_ids: list[int]


class NotificationUnreadCountOut(BaseModel):
    unread_count: int
