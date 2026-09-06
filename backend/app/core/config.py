from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Vivran"
    
    # Tier 1 - Open / Local AI (Ollama) per Spec §22 & §59
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"
    
    # Tier 2 - Cheap Cloud AI
    cheap_model: str = "gpt-4o-mini"
    
    # Tier 3 - Premium AI
    premium_model: str = "gpt-4o"
    
    # Media Services per Spec §31
    cartesia_api_key: str = ""
    elevenlabs_api_key: str = ""
    
    # Supabase Infrastructure
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

