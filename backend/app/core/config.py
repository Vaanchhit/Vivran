from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Vivran"
    
    # Tier 1 - Open / Local AI (Ollama) per Spec §22 & §59.
    # Optional: only used if reachable (local dev). Production has no Ollama
    # host, so Tier 1 falls back to the same Gemini flash-lite model used
    # below whenever Ollama is unset or unreachable.
    ollama_host: str = ""
    ollama_model: str = "qwen2.5:7b"

    # Gemini API (all three tiers run on Gemini; tiers differ by model choice).
    gemini_api_key: str = ""
    open_model: str = "gemini-2.0-flash-lite"
    cheap_model: str = "gemini-2.0-flash"
    premium_model: str = "gemini-2.5-pro"
    embedding_model: str = "text-embedding-004"
    embedding_dimensions: int = 768

    # Media Services per Spec §31
    cartesia_api_key: str = ""
    elevenlabs_api_key: str = ""

    # Supabase Infrastructure
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "materials"

    # Supabase Auth JWT validation (JWT_SECRET from Supabase project settings)
    supabase_jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

