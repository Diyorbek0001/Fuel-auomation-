# Backend

FastAPI service for the Fuel Dispatch Platform.

## Commands

```bash
alembic upgrade head
python scripts/import_stations.py /final_fuel_stations.csv
python scripts/sync_samsara.py
uvicorn app.main:app --reload
```
