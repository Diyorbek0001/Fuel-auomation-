"""initial fuel dispatch schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = sa.Enum("admin", "dispatcher", "viewer", name="userrole")
    fuel_price_import_status = sa.Enum("pending", "completed", "failed", name="fuelpriceimportstatus")
    fuel_dispatch_status = sa.Enum("assigned", "completed", "missed", "cancelled", name="fueldispatchstatus")
    user_role.create(op.get_bind(), checkfirst=True)
    fuel_price_import_status.create(op.get_bind(), checkfirst=True)
    fuel_dispatch_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_companies_name"), "companies", ["name"], unique=True)
    op.create_index(op.f("ix_companies_active"), "companies", ["active"])

    op.create_table(
        "station_master",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_code", sa.String(length=32), nullable=False),
        sa.Column("store_number", sa.String(length=32), nullable=False),
        sa.Column("brand", sa.String(length=64), nullable=False),
        sa.Column("station_name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=128), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("zip", sa.String(length=32), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("parking_spaces_count", sa.Integer(), nullable=True),
        sa.Column("fuel_lane_count", sa.Integer(), nullable=True),
        sa.Column("shower_count", sa.Integer(), nullable=True),
        sa.Column("amenities", sa.Text(), nullable=True),
        sa.Column("restaurants", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_station_master_site_code"), "station_master", ["site_code"], unique=True)
    op.create_index(op.f("ix_station_master_store_number"), "station_master", ["store_number"], unique=True)
    op.create_index(op.f("ix_station_master_brand"), "station_master", ["brand"])
    op.create_index(op.f("ix_station_master_station_name"), "station_master", ["station_name"])
    op.create_index(op.f("ix_station_master_city"), "station_master", ["city"])
    op.create_index(op.f("ix_station_master_state"), "station_master", ["state"])
    op.create_index(op.f("ix_station_master_active"), "station_master", ["active"])

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("role", user_role, nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
    )
    op.create_index(op.f("ix_users_company_id"), "users", ["company_id"])
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_role"), "users", ["role"])
    op.create_index(op.f("ix_users_active"), "users", ["active"])

    op.create_table(
        "drivers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("telegram_username", sa.String(length=255), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
    )
    op.create_index(op.f("ix_drivers_company_id"), "drivers", ["company_id"])
    op.create_index(op.f("ix_drivers_name"), "drivers", ["name"])
    op.create_index(op.f("ix_drivers_telegram_id"), "drivers", ["telegram_id"], unique=True)
    op.create_index(op.f("ix_drivers_telegram_username"), "drivers", ["telegram_username"], unique=True)
    op.create_index(op.f("ix_drivers_active"), "drivers", ["active"])

    op.create_table(
        "fuel_price_import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_file", sa.String(length=255), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("status", fuel_price_import_status, nullable=False),
        sa.Column("rows_read", sa.Integer(), nullable=False),
        sa.Column("rows_imported", sa.Integer(), nullable=False),
        sa.Column("rows_skipped", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("imported_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_fuel_price_import_batches_source_file"), "fuel_price_import_batches", ["source_file"])
    op.create_index(op.f("ix_fuel_price_import_batches_effective_date"), "fuel_price_import_batches", ["effective_date"])
    op.create_index(op.f("ix_fuel_price_import_batches_status"), "fuel_price_import_batches", ["status"])
    op.create_index(op.f("ix_fuel_price_import_batches_created_at"), "fuel_price_import_batches", ["created_at"])

    op.create_table(
        "trucks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("driver_id", sa.Integer(), nullable=True),
        sa.Column("samsara_account_name", sa.String(length=255), nullable=True),
        sa.Column("samsara_vehicle_id", sa.String(length=255), nullable=True),
        sa.Column("unit_number", sa.String(length=64), nullable=False),
        sa.Column("fuel_percent", sa.Float(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("odometer_miles", sa.Float(), nullable=True),
        sa.Column("current_city", sa.String(length=128), nullable=True),
        sa.Column("current_state", sa.String(length=16), nullable=True),
        sa.Column("destination", sa.String(length=255), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("last_samsara_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"]),
        sa.UniqueConstraint("samsara_account_name", "samsara_vehicle_id", name="uq_truck_samsara_account_vehicle"),
    )
    op.create_index(op.f("ix_trucks_company_id"), "trucks", ["company_id"])
    op.create_index(op.f("ix_trucks_driver_id"), "trucks", ["driver_id"])
    op.create_index(op.f("ix_trucks_samsara_account_name"), "trucks", ["samsara_account_name"])
    op.create_index(op.f("ix_trucks_samsara_vehicle_id"), "trucks", ["samsara_vehicle_id"])
    op.create_index(op.f("ix_trucks_unit_number"), "trucks", ["unit_number"])
    op.create_index(op.f("ix_trucks_fuel_percent"), "trucks", ["fuel_percent"])
    op.create_index(op.f("ix_trucks_active"), "trucks", ["active"])

    op.create_table(
        "fuel_prices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), nullable=True),
        sa.Column("site_code", sa.String(length=32), nullable=False),
        sa.Column("fuel_type", sa.String(length=32), nullable=False),
        sa.Column("retail_price", sa.Numeric(10, 4), nullable=True),
        sa.Column("discount_price", sa.Numeric(10, 4), nullable=True),
        sa.Column("your_price", sa.Numeric(10, 4), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["import_batch_id"], ["fuel_price_import_batches.id"]),
        sa.ForeignKeyConstraint(["station_id"], ["station_master.id"]),
        sa.UniqueConstraint("station_id", "fuel_type", "effective_date", "import_batch_id", name="uq_fuel_price_batch"),
    )
    op.create_index(op.f("ix_fuel_prices_station_id"), "fuel_prices", ["station_id"])
    op.create_index(op.f("ix_fuel_prices_import_batch_id"), "fuel_prices", ["import_batch_id"])
    op.create_index(op.f("ix_fuel_prices_site_code"), "fuel_prices", ["site_code"])
    op.create_index(op.f("ix_fuel_prices_fuel_type"), "fuel_prices", ["fuel_type"])
    op.create_index(op.f("ix_fuel_prices_your_price"), "fuel_prices", ["your_price"])
    op.create_index(op.f("ix_fuel_prices_effective_date"), "fuel_prices", ["effective_date"])

    op.create_table(
        "fuel_dispatches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("truck_id", sa.Integer(), nullable=False),
        sa.Column("driver_id", sa.Integer(), nullable=True),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("fuel_price_id", sa.Integer(), nullable=True),
        sa.Column("status", fuel_dispatch_status, nullable=False),
        sa.Column("assigned_by", sa.String(length=255), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("missed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recommendation_score", sa.Float(), nullable=True),
        sa.Column("distance_miles", sa.Float(), nullable=True),
        sa.Column("distance_off_route_miles", sa.Float(), nullable=True),
        sa.Column("navigation_url", sa.Text(), nullable=True),
        sa.Column("telegram_message_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"]),
        sa.ForeignKeyConstraint(["fuel_price_id"], ["fuel_prices.id"]),
        sa.ForeignKeyConstraint(["station_id"], ["station_master.id"]),
        sa.ForeignKeyConstraint(["truck_id"], ["trucks.id"]),
    )
    op.create_index(op.f("ix_fuel_dispatches_truck_id"), "fuel_dispatches", ["truck_id"])
    op.create_index(op.f("ix_fuel_dispatches_driver_id"), "fuel_dispatches", ["driver_id"])
    op.create_index(op.f("ix_fuel_dispatches_station_id"), "fuel_dispatches", ["station_id"])
    op.create_index(op.f("ix_fuel_dispatches_fuel_price_id"), "fuel_dispatches", ["fuel_price_id"])
    op.create_index(op.f("ix_fuel_dispatches_status"), "fuel_dispatches", ["status"])
    op.create_index(op.f("ix_fuel_dispatches_assigned_at"), "fuel_dispatches", ["assigned_at"])

    op.create_table(
        "fuel_dispatch_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dispatch_id", sa.Integer(), nullable=False),
        sa.Column("author_username", sa.String(length=255), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dispatch_id"], ["fuel_dispatches.id"]),
    )
    op.create_index(op.f("ix_fuel_dispatch_notes_dispatch_id"), "fuel_dispatch_notes", ["dispatch_id"])
    op.create_index(op.f("ix_fuel_dispatch_notes_created_at"), "fuel_dispatch_notes", ["created_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=96), nullable=False),
        sa.Column("entity_type", sa.String(length=96), nullable=True),
        sa.Column("entity_id", sa.String(length=96), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"])
    op.create_index(op.f("ix_audit_logs_username"), "audit_logs", ["username"])
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"])
    op.create_index(op.f("ix_audit_logs_entity_type"), "audit_logs", ["entity_type"])
    op.create_index(op.f("ix_audit_logs_entity_id"), "audit_logs", ["entity_id"])
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"])

    op.create_table(
        "samsara_sync_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_name", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("vehicles_read", sa.Integer(), nullable=False),
        sa.Column("vehicles_updated", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index(op.f("ix_samsara_sync_logs_account_name"), "samsara_sync_logs", ["account_name"])
    op.create_index(op.f("ix_samsara_sync_logs_started_at"), "samsara_sync_logs", ["started_at"])
    op.create_index(op.f("ix_samsara_sync_logs_success"), "samsara_sync_logs", ["success"])


def downgrade() -> None:
    op.drop_table("samsara_sync_logs")
    op.drop_table("audit_logs")
    op.drop_table("fuel_dispatch_notes")
    op.drop_table("fuel_dispatches")
    op.drop_table("fuel_prices")
    op.drop_table("trucks")
    op.drop_table("fuel_price_import_batches")
    op.drop_table("drivers")
    op.drop_table("users")
    op.drop_table("station_master")
    op.drop_table("companies")
    sa.Enum(name="fueldispatchstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="fuelpriceimportstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
