from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PaperLens API"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # CrossRef "polite pool" 사용을 위한 연락처(선택). 설정 시 User-Agent에 포함된다.
    crossref_mailto: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def crossref_user_agent(self) -> str:
        contact = f" (mailto:{self.crossref_mailto})" if self.crossref_mailto else ""
        return f"PaperLens/0.1{contact}"


settings = Settings()

