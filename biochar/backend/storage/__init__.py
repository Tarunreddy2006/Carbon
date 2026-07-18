"""
carbon/biochar/backend/storage/__init__.py
──────────────────────────────────────────────────────────────────────────────
Initialization package for the reusable Storage module.
Exposes the StorageProvider base class and creates a single instance provider factory.
──────────────────────────────────────────────────────────────────────────────
"""

import os
import logging
from .provider import StorageProvider
from .r2_provider import CloudflareR2Provider

logger = logging.getLogger("carbon_engine")

_provider = None

def get_storage_provider() -> StorageProvider:
    """
    Factory function to retrieve or initialize the configured StorageProvider.
    Uses environment variables for Cloudflare R2 credentials with standard fallbacks.
    """
    global _provider
    if _provider is not None:
        return _provider

    # Read config from environment variables
    endpoint_url = os.getenv("R2_ENDPOINT_URL") or os.getenv("S3_API")
    access_key_id = os.getenv("R2_ACCESS_KEY_ID") or os.getenv("Access_Key_ID")
    secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("Secret_Access_Key")
    bucket_name = os.getenv("R2_BUCKET_NAME") or os.getenv("Bucket_Name")
    region_name = os.getenv("R2_REGION") or os.getenv("Region", "auto")

    # Log warnings if any of the configurations are missing
    missing = []
    if not endpoint_url:
        missing.append("R2_ENDPOINT_URL/S3_API")
    if not access_key_id:
        missing.append("R2_ACCESS_KEY_ID/Access_Key_ID")
    if not secret_access_key:
        missing.append("R2_SECRET_ACCESS_KEY/Secret_Access_Key")
    if not bucket_name:
        missing.append("R2_BUCKET_NAME/Bucket_Name")

    if missing:
        raise RuntimeError(
            f"Missing required Cloudflare R2 environment configuration variable(s): {', '.join(missing)}"
        )

    logger.info("Initializing Cloudflare R2 Storage Provider on bucket: %s", bucket_name)
    
    _provider = CloudflareR2Provider(
        endpoint_url=endpoint_url,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        bucket_name=bucket_name,
        region_name=region_name
    )
    return _provider
