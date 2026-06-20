from __future__ import annotations

import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
STATION_CSV = ROOT / "final_fuel_stations.csv"
SAMSARA_BASE_URL = "https://api.samsara.com"

TRUCKS: list[dict[str, Any]] = []
LAST_TEST: dict[str, Any] | None = None


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def env_accounts() -> list[tuple[str, str]]:
    accounts: list[tuple[str, str]] = []
    if os.environ.get("SAMSARA_API_TOKEN"):
        accounts.append(("Samsara", os.environ["SAMSARA_API_TOKEN"]))
    for index in range(1, 4):
        token = os.environ.get(f"SAMSARA_API_TOKEN_{index}", "").strip()
        if token:
            name = os.environ.get(f"SAMSARA_ACCOUNT_NAME_{index}", f"Samsara Fleet {index}").strip()
            accounts.append((name, token))
    return accounts


def request_samsara(token: str, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    base_url = os.environ.get("SAMSARA_BASE_URL", SAMSARA_BASE_URL).rstrip("/")
    query = urllib.parse.urlencode(params or {})
    url = f"{base_url}{path}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def list_paginated(token: str, path: str, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        page_params = dict(params or {})
        if cursor:
            page_params["after"] = cursor
        payload = request_samsara(token, path, page_params)
        items.extend(payload.get("data", []))
        pagination = payload.get("pagination") or {}
        if not pagination.get("hasNextPage"):
            return items
        cursor = pagination.get("endCursor")
        if not cursor:
            return items


def vehicle_id(item: dict[str, Any]) -> str:
    vehicle = item.get("vehicle") or item
    return str(vehicle.get("id") or item.get("id") or "")


def latest_value(value: Any) -> dict[str, Any] | None:
    if isinstance(value, list) and value:
        return value[-1]
    if isinstance(value, dict):
        return value
    if isinstance(value, (int, float)):
        return {"value": value}
    return None


def float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def meters_to_miles(value: float | None) -> float | None:
    return None if value is None else value / 1609.344


def driver_from(item: dict[str, Any], fallback_id: int) -> dict[str, Any] | None:
    driver = item.get("driver") or item.get("currentDriver")
    if not isinstance(driver, dict):
        return None
    name = driver.get("name") or driver.get("username")
    if not name:
        return None
    return {"id": fallback_id, "name": str(name)}


def truck_from_snapshot(
    *,
    index: int,
    account_name: str,
    vehicle: dict[str, Any],
    stat: dict[str, Any],
) -> dict[str, Any]:
    merged = {**stat, "vehicle": vehicle}
    gps = latest_value(merged.get("gps"))
    odometer = latest_value(merged.get("obdOdometerMeters") or merged.get("odometerMeters"))
    fuel = latest_value(merged.get("fuelPercents") or merged.get("fuelPercent"))
    external_ids = vehicle.get("externalIds") if isinstance(vehicle.get("externalIds"), dict) else {}
    return {
        "id": index,
        "unit_number": str(vehicle.get("name") or external_ids.get("samsara.serial") or vehicle_id(merged)),
        "fuel_percent": float_or_none((fuel or {}).get("value")),
        "latitude": float_or_none((gps or {}).get("latitude")),
        "longitude": float_or_none((gps or {}).get("longitude")),
        "odometer_miles": meters_to_miles(float_or_none((odometer or {}).get("value"))),
        "current_city": None,
        "current_state": None,
        "destination": None,
        "active": True,
        "samsara_account_name": account_name,
        "driver": driver_from(merged, index),
    }


def sync_samsara() -> dict[str, Any]:
    global TRUCKS, LAST_TEST
    accounts = env_accounts()
    trucks: list[dict[str, Any]] = []
    account_results: list[dict[str, Any]] = []
    latest_error: str | None = None
    next_id = 1

    for account_name, token in accounts:
        try:
            group_id = os.environ.get("SAMSARA_GROUP_ID", "").strip()
            common_params = {"groupIds": group_id} if group_id else {}
            vehicles = list_paginated(token, "/fleet/vehicles", common_params)
            stats = list_paginated(
                token,
                "/fleet/vehicles/stats",
                {**common_params, "types": "gps,obdOdometerMeters,fuelPercents"},
            )
            stats_by_id = {vehicle_id(item): item for item in stats}
            before = len(trucks)
            for vehicle in vehicles:
                item_id = vehicle_id(vehicle)
                if not item_id:
                    continue
                trucks.append(
                    truck_from_snapshot(
                        index=next_id,
                        account_name=account_name,
                        vehicle=vehicle,
                        stat=stats_by_id.get(item_id, {}),
                    )
                )
                next_id += 1
            account_results.append(
                {
                    "account_name": account_name,
                    "success": True,
                    "vehicles_read": len(vehicles),
                    "vehicles_updated": len(trucks) - before,
                    "error": None,
                }
            )
        except Exception as exc:
            latest_error = str(exc)
            account_results.append(
                {
                    "account_name": account_name,
                    "success": False,
                    "vehicles_read": 0,
                    "vehicles_updated": 0,
                    "error": latest_error,
                }
            )

    TRUCKS = sorted(trucks, key=lambda truck: truck["fuel_percent"] if truck["fuel_percent"] is not None else 101)
    LAST_TEST = {
        "api_token_configured": bool(accounts),
        "connection_status": "ok" if TRUCKS else "failed",
        "vehicle_count": len(TRUCKS),
        "sample_vehicle_names": [truck["unit_number"] for truck in TRUCKS[:10]],
        "latest_error": latest_error,
        "accounts": account_results,
    }
    return {
        "synced_accounts": len(account_results),
        "vehicles_read": sum(item["vehicles_read"] for item in account_results),
        "vehicles_updated": sum(item["vehicles_updated"] for item in account_results),
        "accounts": account_results,
    }


def load_stations(limit: int = 5000) -> list[dict[str, Any]]:
    if not STATION_CSV.exists():
        return []
    stations: list[dict[str, Any]] = []
    with STATION_CSV.open(newline="", encoding="utf-8-sig") as file:
        for index, row in enumerate(csv.DictReader(file), start=1):
            if (row.get("fuel_type") or "").upper() != "DSL":
                continue
            stations.append(
                {
                    "id": index,
                    "site_code": row.get("site_code") or "",
                    "store_number": row.get("store_number") or "",
                    "brand": row.get("brand") or "",
                    "station_name": row.get("station_name") or "",
                    "address": row.get("address") or "",
                    "city": row.get("city") or "",
                    "state": row.get("state") or "",
                    "zip": row.get("zip") or None,
                    "latitude": float_or_none(row.get("latitude")) or 0,
                    "longitude": float_or_none(row.get("longitude")) or 0,
                    "phone": row.get("phone") or None,
                    "parking_spaces_count": int(row["parking_spaces_count"]) if row.get("parking_spaces_count") else None,
                    "fuel_lane_count": int(row["fuel_lane_count"]) if row.get("fuel_lane_count") else None,
                    "shower_count": int(row["shower_count"]) if row.get("shower_count") else None,
                    "amenities": row.get("amenities") or None,
                    "restaurants": row.get("restaurants") or None,
                    "latest_price": {
                        "fuel_type": row.get("fuel_type") or "DSL",
                        "retail_price": row.get("retail_price") or None,
                        "discount_price": row.get("discount_price") or None,
                        "your_price": row.get("your_price") or "0",
                        "effective_date": row.get("effective_date") or "",
                    },
                }
            )
            if len(stations) >= limit:
                break
    return stations


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        if parsed.path == "/api/health":
            self.send_json({"status": "ok"})
        elif parsed.path == "/api/stations":
            limit = int(query.get("limit", ["5000"])[0])
            items = load_stations(limit=limit)
            self.send_json({"total": len(items), "items": items})
        elif parsed.path == "/api/trucks":
            self.send_json({"total": len(TRUCKS), "items": TRUCKS})
        elif parsed.path == "/api/samsara/test":
            if LAST_TEST is None:
                sync_samsara()
            self.send_json(LAST_TEST)
        else:
            self.send_json({"detail": "Not found"}, status=404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/samsara/sync":
            self.send_json(sync_samsara())
        else:
            self.send_json({"detail": "Not found"}, status=404)

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> None:
    load_env()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Dev Samsara API serving on http://127.0.0.1:8000", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
