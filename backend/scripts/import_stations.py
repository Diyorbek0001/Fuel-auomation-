from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Import final_fuel_stations.csv into the fuel dispatch database.")
    parser.add_argument("csv_path", nargs="?", default="../final_fuel_stations.csv")
    parser.add_argument("--imported-by", default="system")
    args = parser.parse_args()

    from app.db.session import async_session_maker
    from app.services.station_import_service import import_final_fuel_stations

    async with async_session_maker() as session:
        result = await import_final_fuel_stations(session, args.csv_path, imported_by=args.imported_by)

    print("Fuel station import complete.")
    print(f"Batch ID: {result.batch_id}")
    print(f"Source: {result.source_file}")
    print(f"Rows read: {result.rows_read}")
    print(f"Rows imported: {result.rows_imported}")
    print(f"Rows skipped: {result.rows_skipped}")
    print(f"Effective date: {result.effective_date}")


if __name__ == "__main__":
    asyncio.run(main())
