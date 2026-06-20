from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Fuel Dispatch Platform"
    environment: str = "local"
    database_url: str = "postgresql+asyncpg://fuel_user:fuel_password@db:5432/fuel_dispatch"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    station_seed_csv: Path = Path("final_fuel_stations.csv")
    low_fuel_threshold_percent: int = 50
    missed_station_threshold_miles: float = 10.0
    samsara_api_token: str = ""
    samsara_api_token_1: str = ""
    samsara_api_token_2: str = ""
    samsara_api_token_3: str = ""
    samsara_group_id: str = ""
    samsara_base_url: str = "https://api.samsara.com"
    samsara_account_name_1: str = "Samsara 1"
    samsara_account_name_2: str = "Samsara 2"
    samsara_account_name_3: str = "Samsara 3"
    samsara_sync_interval_seconds: int = 180
    telegram_bot_token: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("cors_origins", mode="after")
    @classmethod
    def normalize_cors_origins(cls, value: str) -> str:
        return ",".join(origin.strip() for origin in value.split(",") if origin.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def samsara_accounts(self) -> list[tuple[str, str]]:
        accounts = [
            (self.samsara_account_name_1, self.samsara_api_token_1),
            (self.samsara_account_name_2, self.samsara_api_token_2),
            (self.samsara_account_name_3, self.samsara_api_token_3),
        ]
        if self.samsara_api_token:
            accounts.insert(0, ("Samsara", self.samsara_api_token))
        return [(name.strip(), token.strip()) for name, token in accounts if token.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
