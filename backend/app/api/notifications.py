from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import NotificationStatus
from app.schemas.notification import (
    NotificationBulkActionIn,
    NotificationListOut,
    NotificationUnreadCountOut,
)
from app.services.auth_service import current_user_from_token, require_current_user
from app.services.notification_broadcaster import notification_broadcaster
from app.services.notification_service import (
    archive_notifications,
    list_notifications,
    mark_notifications_read,
    unread_count,
)

router = APIRouter()


@router.get("", response_model=NotificationListOut)
async def api_list_notifications(
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(require_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationListOut:
    if status and status not in {item.value for item in NotificationStatus}:
        raise HTTPException(status_code=400, detail="Invalid notification status")
    total, notifications = await list_notifications(session, status=status, limit=limit, offset=offset)
    return NotificationListOut(total=total, items=notifications)


@router.get("/unread-count", response_model=NotificationUnreadCountOut)
async def api_unread_count(
    _=Depends(require_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationUnreadCountOut:
    return NotificationUnreadCountOut(unread_count=await unread_count(session))


@router.post("/mark-read")
async def api_mark_notifications_read(
    payload: NotificationBulkActionIn,
    _=Depends(require_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    changed = await mark_notifications_read(session, payload.notification_ids)
    return {"updated": changed, "unread_count": await unread_count(session)}


@router.post("/archive")
async def api_archive_notifications(
    payload: NotificationBulkActionIn,
    _=Depends(require_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    changed = await archive_notifications(session, payload.notification_ids)
    return {"updated": changed, "unread_count": await unread_count(session)}


@router.get("/stream")
async def api_notification_stream(token: str, session: AsyncSession = Depends(get_session)) -> StreamingResponse:
    user = await current_user_from_token(session, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    async def event_stream():
        async for event in notification_broadcaster.subscribe():
            yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
