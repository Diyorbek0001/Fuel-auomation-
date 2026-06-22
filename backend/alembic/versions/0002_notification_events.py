"""add notification events

Revision ID: 0002_notification_events
Revises: 0001_initial
Create Date: 2026-06-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_notification_events"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    notification_status = sa.Enum("unread", "read", "archived", name="notificationstatus")
    notification_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "notification_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("truck_id", sa.Integer(), nullable=False),
        sa.Column("dispatch_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=96), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", notification_status, nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["dispatch_id"], ["fuel_dispatches.id"]),
        sa.ForeignKeyConstraint(["truck_id"], ["trucks.id"]),
    )
    op.create_index(op.f("ix_notification_events_truck_id"), "notification_events", ["truck_id"])
    op.create_index(op.f("ix_notification_events_dispatch_id"), "notification_events", ["dispatch_id"])
    op.create_index(op.f("ix_notification_events_event_type"), "notification_events", ["event_type"])
    op.create_index(op.f("ix_notification_events_status"), "notification_events", ["status"])
    op.create_index(op.f("ix_notification_events_created_at"), "notification_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("notification_events")
    sa.Enum(name="notificationstatus").drop(op.get_bind(), checkfirst=True)
