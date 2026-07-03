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
    # 단일 프로세스 인메모리 카운터라 인스턴스 재시작 시 리셋되고 인스턴스 간 공유되지 않는다.
    ai_rate_limit_per_minute: int = 10
    # OCR fallback (opt-in). 손상/스캔 PDF를 렌더→RapidOCR(한국어)로 재인식한다.
    # 무겁고 느려 기본 off. 켜려면 requirements-ocr.txt 설치 필요.
    ocr_enabled: bool = False
    ocr_max_pages: int = 20
    ocr_dpi: int = 200
    # 한국어 rec ONNX 모델·dict. 경로가 있으면 사용, 없으면 아래 URL에서 캐시로 1회 다운로드한다.
    ocr_rec_model_path: str = ""
    ocr_rec_keys_path: str = ""
    ocr_model_dir: str = ""
    ocr_rec_model_url: str = (
        "https://huggingface.co/cycloneboy/korean_PP-OCRv4_rec_infer/resolve/main/model.onnx"
    )
    ocr_rec_keys_url: str = (
        "https://huggingface.co/cycloneboy/korean_PP-OCRv4_rec_infer/resolve/main/korean_dict.txt"
    )
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
        return bool(self.ocr_enabled)

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


settings = Settings()
