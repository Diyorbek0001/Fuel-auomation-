from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def main() -> None:
    from app.db.session import async_session_maker
    from app.services.samsara_sync_service import sync_all_samsara_accounts

    async with async_session_maker() as session:
        logs = await sync_all_samsara_accounts(session)

    if not logs:
        print("No Samsara API tokens configured.")
        return
    for log in logs:
        status = "ok" if log.success else "failed"
        print(
            f"{log.account_name}: {status}; "
            f"vehicles_read={log.vehicles_read}; vehicles_updated={log.vehicles_updated}; "
            f"error={log.error_message or ''}"
        )


if __name__ == "__main__":
    asyncio.run(main())
