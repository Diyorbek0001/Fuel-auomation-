from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import NotificationEvent, NotificationStatus, Truck
from app.models.common import utcnow
from app.schemas.notification import NotificationEventOut
from app.services.notification_broadcaster import notification_broadcaster


VALID_NOTIFICATION_STATUSES = {status.value for status in NotificationStatus}


async def list_notifications(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[int, list[NotificationEvent]]:
    stmt = select(NotificationEvent).options(selectinload(NotificationEvent.truck))
    if status:
        stmt = stmt.where(NotificationEvent.status == NotificationStatus(status))
    else:
        stmt = stmt.where(NotificationEvent.status != NotificationStatus.archived)

    total = int((await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
    notifications = await session.scalars(
        stmt.order_by(NotificationEvent.created_at.desc(), NotificationEvent.id.desc()).limit(limit).offset(offset)
    )
    return total, list(notifications)


async def unread_count(session: AsyncSession) -> int:
    return int(
        (
            await session.execute(
                select(func.count()).select_from(NotificationEvent).where(NotificationEvent.status == NotificationStatus.unread)
            )
        ).scalar_one()
    )


async def mark_notifications_read(session: AsyncSession, notification_ids: list[int]) -> int:
    if not notification_ids:
        return 0
    now = utcnow()
    notifications = await session.scalars(
        select(NotificationEvent).where(
            NotificationEvent.id.in_(notification_ids),
            NotificationEvent.status == NotificationStatus.unread,
        )
    )
    changed = 0
    for notification in notifications:
        notification.status = NotificationStatus.read
        notification.read_at = now
        changed += 1
    await session.commit()
    notification_broadcaster.publish_unread_count(await unread_count(session))
    return changed


async def archive_notifications(session: AsyncSession, notification_ids: list[int]) -> int:
    if not notification_ids:
        return 0
    now = utcnow()
    notifications = await session.scalars(select(NotificationEvent).where(NotificationEvent.id.in_(notification_ids)))
    changed = 0
    for notification in notifications:
        notification.status = NotificationStatus.archived
        notification.archived_at = now
        if notification.read_at is None:
            notification.read_at = now
        changed += 1
    await session.commit()
    notification_broadcaster.publish_unread_count(await unread_count(session))
    return changed


async def create_notification_event(
    session: AsyncSession,
    *,
    truck: Truck,
    event_type: str,
    title: str,
    message: str,
    dispatch_id: int | None = None,
    payload_json: dict[str, Any] | None = None,
    sent_at=None,
) -> NotificationEvent | None:
    if not truck.active:
        return None

    notification = NotificationEvent(
        truck=truck,
        dispatch_id=dispatch_id,
        event_type=event_type,
        title=title,
        message=message,
        status=NotificationStatus.unread,
        sent_at=sent_at,
        payload_json=payload_json or {},
    )
    session.add(notification)
    await session.commit()
    notification_broadcaster.publish_notification(
        NotificationEventOut.model_validate(notification),
        await unread_count(session),
    )
    return notification
