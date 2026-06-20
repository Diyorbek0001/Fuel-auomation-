# Fuel Dispatch Platform

Dockerized FastAPI + React + PostgreSQL platform for fuel dispatch operations.

## Data Source

`final_fuel_stations.csv` is the station master source. Site ID is the permanent station identifier. The app does not geocode or search external station sources during import.

Current prepared station count: 683.

## Local Setup

```bash
cp .env.example .env
docker compose up --build
```

In another terminal, apply migrations and import stations:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/import_stations.py /final_fuel_stations.csv
```

Configure up to three Samsara API accounts in `.env`:

```env
SAMSARA_API_TOKEN_1=
SAMSARA_API_TOKEN_2=
SAMSARA_API_TOKEN_3=
SAMSARA_ACCOUNT_NAME_1=Fleet 1
SAMSARA_ACCOUNT_NAME_2=Fleet 2
SAMSARA_ACCOUNT_NAME_3=Fleet 3
```

Run a manual Samsara sync:

```bash
docker compose exec backend python scripts/sync_samsara.py
```

Open:

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8000/api/health`
- Station API: `http://127.0.0.1:8000/api/stations?limit=10`

## Version 1 Build Order

Phase 1 is included:

- Database models
- Alembic migration
- CSV station/price import
- Station list/detail APIs
- Docker Compose
- React dark station map shell

Next phases:

- Truck sidebar and MapLibre route overlays
- Samsara sync every 3 minutes
- Recommendation engine
- Telegram dispatch
- Missed station detection
- Import/history/audit pages
