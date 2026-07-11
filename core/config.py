from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["https://stomata.tech", "https://www.stomata.tech"]
    FRONTEND_URL: str = "https://stomata.tech"
    
    # Stripe integration
    STRIPE_SECRET_KEY: str
    STRIPE_WEBHOOK_SECRET: str = "whsec_123"

settings = Settings()
