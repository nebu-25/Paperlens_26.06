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
    ai_model: str = "openai/gpt-4o-mini"
    ai_site_url: str = "https://nebu-25.github.io/Paperlens_26.06/"
    ai_app_name: str = "PaperLens"
    # AI 엔드포인트 사용자별 분당 호출 상한(비용·남용 방지). 0 이하면 제한 없음.
    ai_rate_limit_per_minute: int = 10
    # AI 비용 원장/예산. 가격은 모델·공급자에 따라 변하므로 환경변수로 주입한다.
    # 금액 단위는 USD cents, 토큰 단가는 1M tokens당 cents. 0 이하면 해당 제한/추정 비활성.
    ai_daily_cost_limit_cents: int = 0
    ai_monthly_cost_limit_cents: int = 0
    ai_prompt_cost_per_million_cents: int = 0
    ai_completion_cost_per_million_cents: int = 0
    # Provider-side guardrails are configured outside the app (OpenRouter billing UI, alerts,
    # and key rotation process). These flags make deployment diagnostics catch missing ops setup.
    ai_provider_spend_limit_configured: bool = False
    ai_provider_billing_alerts_configured: bool = False
    ai_key_rotation_runbook_url: str = ""
    # AI rate limit 상태를 공유할 Redis URL. 설정 시 다중 워커/다중 인스턴스에서 공유된다.
    # 비워두면 개발 편의를 위해 프로세스 메모리 저장소를 사용한다.
    redis_url: str = ""
    # OCR fallback (opt-in). 손상/스캔 PDF를 렌더→NAVER CLOVA OCR API로 재인식한다.
    # 외부 API 비용과 원문 이미지 전송이 발생하므로 기본 off.
    ocr_enabled: bool = False
    ocr_max_pages: int = 20
    ocr_dpi: int = 200
    clova_ocr_invoke_url: str = ""
    clova_ocr_secret_key: str = ""
    clova_ocr_timeout_sec: int = 30
    # 샘플 PDF 파일을 배포 서버에 커밋하지 않고 제공할 때 사용하는 원격 PDF URL.
    sample_pdf_url: str = ""
    # Supabase Auth. JWT secret이 있으면 보호 API에서 Bearer token을 검증해 user_id를 추출한다.
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    # 검증 시 요구할 audience(aud) 클레임. Supabase 로그인 토큰은 기본적으로 "authenticated".
    # 빈 값으로 두면 aud 검사를 비활성화한다(권장하지 않음).
    supabase_jwt_aud: str = "authenticated"

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

    @property
    def auth_enabled(self) -> bool:
        return bool(self.supabase_jwt_secret.strip())

    @property
    def ocr_ready(self) -> bool:
        return bool(
            self.ocr_enabled
            and self.clova_ocr_invoke_url.strip()
            and self.clova_ocr_secret_key.strip()
        )

    @property
    def ocr_diagnostics(self) -> dict[str, object]:
        configured = {
            "invoke_url": bool(self.clova_ocr_invoke_url.strip()),
            "secret_key": bool(self.clova_ocr_secret_key.strip()),
        }
        warnings: list[str] = []
        if self.ocr_enabled and not all(configured.values()):
            warnings.append(
                "Set CLOVA_OCR_INVOKE_URL and CLOVA_OCR_SECRET_KEY when OCR_ENABLED=true."
            )
        return {
            "enabled": self.ocr_enabled,
            "provider": "naver_clova",
            "ready": self.ocr_ready,
            "max_pages": self.ocr_max_pages,
            "dpi": self.ocr_dpi,
            "timeout_sec": self.clova_ocr_timeout_sec,
            "configured": configured,
            "warnings": warnings,
        }

    @property
    def supabase_expected_issuer(self) -> str:
        # Supabase가 발급하는 토큰의 iss는 "{SUPABASE_URL}/auth/v1" 형태다.
        # supabase_url이 설정된 경우에만 iss 검증에 사용한다.
        url = self.supabase_url.strip().rstrip("/")
        return f"{url}/auth/v1" if url else ""

    @property
    def auth_diagnostics(self) -> dict[str, object]:
        configured = {
            "supabase_url": bool(self.supabase_url.strip()),
            "supabase_anon_key": bool(self.supabase_anon_key.strip()),
            "supabase_jwt_secret": bool(self.supabase_jwt_secret.strip()),
        }
        warnings: list[str] = []
        if any(configured.values()) and not all(configured.values()):
            warnings.append(
                "Supabase auth is partially configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_JWT_SECRET together."
            )
        return {
            "mode": "supabase" if configured["supabase_jwt_secret"] else "local",
            "configured": configured,
            "ready": all(configured.values()),
            "warnings": warnings,
        }

    @property
    def ai_diagnostics(self) -> dict[str, object]:
        configured = {
            "api_key": bool(self.ai_api_key.strip()),
            "redis_url": bool(self.redis_url.strip()),
            "daily_cost_limit": self.ai_daily_cost_limit_cents > 0,
            "monthly_cost_limit": self.ai_monthly_cost_limit_cents > 0,
            "prompt_price": self.ai_prompt_cost_per_million_cents > 0,
            "completion_price": self.ai_completion_cost_per_million_cents > 0,
            "provider_spend_limit": self.ai_provider_spend_limit_configured,
            "provider_billing_alerts": self.ai_provider_billing_alerts_configured,
            "key_rotation_runbook": bool(self.ai_key_rotation_runbook_url.strip()),
        }
        warnings: list[str] = []
        if self.ai_enabled:
            if not configured["redis_url"]:
                warnings.append("Set REDIS_URL so AI rate limits are shared across workers.")
            if not configured["daily_cost_limit"] and not configured["monthly_cost_limit"]:
                warnings.append("Set AI_DAILY_COST_LIMIT_CENTS or AI_MONTHLY_COST_LIMIT_CENTS.")
            if not configured["prompt_price"] or not configured["completion_price"]:
                warnings.append(
                    "Set AI_PROMPT_COST_PER_MILLION_CENTS and AI_COMPLETION_COST_PER_MILLION_CENTS for cost estimates."
                )
            if not configured["provider_spend_limit"]:
                warnings.append("Configure provider-side AI spend limits.")
            if not configured["provider_billing_alerts"]:
                warnings.append("Configure provider-side billing alerts.")
            if not configured["key_rotation_runbook"]:
                warnings.append("Document the AI API key rotation runbook URL.")
        return {
            "enabled": self.ai_enabled,
            "model": self.ai_model,
            "configured": configured,
            "ready": not warnings if self.ai_enabled else True,
            "warnings": warnings,
        }


settings = Settings()
