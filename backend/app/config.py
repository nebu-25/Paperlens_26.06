from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PaperLens API"
    # 배포 시 CORS_ORIGINS 환경변수로 덮어쓴다(쉼표 구분). GitHub Pages 오리진은 경로 없이 호스트까지만 적는다.
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,https://nebu-25.github.io"
    )
    # CrossRef "polite pool" 사용을 위한 연락처(선택). 설정 시 User-Agent에 포함된다.
    crossref_mailto: str = ""
    # 리뷰 노트 SQLite 파일 경로 (백엔드 작업 디렉터리 기준)
    database_path: str = "paperlens.db"
    # 설정 시 SQLite 대신 PostgreSQL을 사용한다. 예: postgresql://user:pass@host:5432/db
    database_url: str = ""
    # 잠긴 DB를 만났을 때 즉시 실패하지 않고 재시도할 최대 대기 시간(ms). 동시 쓰기 견고화용.
    sqlite_busy_timeout_ms: int = 5000
    # Phase 2 AI 보조 레이어(OpenRouter). 키가 없으면 AI API는 비활성 상태로 응답한다.
    ai_api_key: str = ""
    ai_model: str = "openai/gpt-5.2"
    ai_site_url: str = "https://nebu-25.github.io/Paperlens_26.06/"
    ai_app_name: str = "PaperLens"
    # PyMuPDF OCR fallback. Render 기본 Python 런타임에는 Tesseract가 없을 수 있어 best-effort로만 사용한다.
    ocr_languages: str = "kor+eng"
    ocr_max_pages: int = 20
    ocr_dpi: int = 200

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def crossref_user_agent(self) -> str:
        contact = f" (mailto:{self.crossref_mailto})" if self.crossref_mailto else ""
        return f"PaperLens/0.1{contact}"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.ai_api_key.strip())


settings = Settings()
