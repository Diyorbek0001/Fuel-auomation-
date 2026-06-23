from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_session
from app.integrations.samsara import SamsaraClient
from app.services.auth_service import require_admin_user, require_current_user
from app.services.samsara_sync_service import sync_all_samsara_accounts

router = APIRouter()


@router.get("/test")
async def api_samsara_test(_=Depends(require_current_user)) -> dict:
    settings = get_settings()
    accounts = settings.samsara_accounts
    if not accounts:
        return {
            "api_token_configured": False,
            "connection_status": "not_configured",
            "vehicle_count": 0,
            "sample_vehicle_names": [],
            "latest_error": "No Samsara API token configured.",
        }

    results = []
    total_vehicle_count = 0
    latest_error = None
    for account_name, token in accounts:
        result = await SamsaraClient(
            token,
            base_url=settings.samsara_base_url,
            group_id=settings.samsara_group_id,
        ).test_connection()
        total_vehicle_count += result.vehicle_count
        latest_error = result.latest_error or latest_error
        results.append(
            {
                "account_name": account_name,
                "api_token_configured": result.configured,
                "connection_status": "ok" if result.ok else "failed",
                "vehicle_count": result.vehicle_count,
                "sample_vehicle_names": result.sample_vehicle_names,
                "latest_error": result.latest_error,
            }
        )

    return {
        "api_token_configured": True,
        "connection_status": "ok" if any(item["connection_status"] == "ok" for item in results) else "failed",
        "vehicle_count": total_vehicle_count,
        "sample_vehicle_names": [name for item in results for name in item["sample_vehicle_names"]][:10],
        "latest_error": latest_error,
        "accounts": results,
    }


@router.post("/sync")
async def api_samsara_sync(
    _=Depends(require_admin_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    logs = await sync_all_samsara_accounts(session)
    return {
        "synced_accounts": len(logs),
        "vehicles_read": sum(log.vehicles_read for log in logs),
        "vehicles_updated": sum(log.vehicles_updated for log in logs),
        "accounts": [
            {
                "account_name": log.account_name,
                "success": log.success,
                "vehicles_read": log.vehicles_read,
                "vehicles_updated": log.vehicles_updated,
                "error": log.error_message,
            }
            for log in logs
        ],
    }
