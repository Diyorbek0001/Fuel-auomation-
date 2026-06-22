from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

from app.schemas.notification import NotificationEventOut


class NotificationBroadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict]] = set()

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers.discard(queue)

    def publish_notification(self, notification: NotificationEventOut, unread_count: int) -> None:
        self._publish(
            {
                "type": "notification",
                "notification": notification.model_dump(mode="json"),
                "unread_count": unread_count,
            }
        )

    def publish_unread_count(self, unread_count: int) -> None:
        self._publish({"type": "unread_count", "unread_count": unread_count})

    def _publish(self, event: dict) -> None:
        dead_queues: list[asyncio.Queue[dict]] = []
        for queue in self._subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead_queues.append(queue)
        for queue in dead_queues:
            self._subscribers.discard(queue)


notification_broadcaster = NotificationBroadcaster()
