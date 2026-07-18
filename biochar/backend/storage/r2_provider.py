"""
carbon/biochar/backend/storage/r2_provider.py
──────────────────────────────────────────────────────────────────────────────
Cloudflare R2 storage provider implementation using boto3.
──────────────────────────────────────────────────────────────────────────────
"""

import boto3
from botocore.config import Config
from typing import Dict, Any
import logging
from .provider import StorageProvider

logger = logging.getLogger("carbon_engine")

class CloudflareR2Provider(StorageProvider):
    def __init__(
        self,
        endpoint_url: str,
        access_key_id: str,
        secret_access_key: str,
        bucket_name: str,
        region_name: str = "auto"
    ):
        self.bucket_name = bucket_name
        # Cloudflare R2 requires SigV4 configuration
        self.s3_config = Config(
            signature_version="s3v4",
            retries={"max_attempts": 3}
        )
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=self.s3_config,
            region_name=region_name
        )

    def generate_presigned_upload_url(
        self, 
        object_key: str, 
        mime_type: str, 
        file_size: int, 
        expires_in: int = 3600
    ) -> Dict[str, Any]:
        try:
            url = self.client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": object_key,
                    "ContentType": mime_type,
                },
                ExpiresIn=expires_in,
                HttpMethod="PUT"
            )
            return {
                "url": url,
                "method": "PUT",
                "headers": {
                    "Content-Type": mime_type
                }
            }
        except Exception as e:
            logger.error("Failed to generate presigned upload URL: %s", e, exc_info=True)
            raise

    def generate_presigned_download_url(
        self, 
        object_key: str, 
        expires_in: int = 3600
    ) -> str:
        try:
            url = self.client.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": object_key
                },
                ExpiresIn=expires_in,
                HttpMethod="GET"
            )
            return url
        except Exception as e:
            logger.error("Failed to generate presigned download URL: %s", e, exc_info=True)
            raise

    def delete_file(self, object_key: str) -> None:
        try:
            self.client.delete_object(
                Bucket=self.bucket_name,
                Key=object_key
            )
            logger.info("Successfully deleted object %s from R2 bucket %s", object_key, self.bucket_name)
        except Exception as e:
            logger.error("Failed to delete object %s from R2: %s", object_key, e, exc_info=True)
            raise

    def verify_upload(self, object_key: str, expected_size: int) -> bool:
        try:
            response = self.client.head_object(
                Bucket=self.bucket_name,
                Key=object_key
            )
            actual_size = response.get("ContentLength", 0)
            if actual_size != expected_size:
                logger.warning(
                    "Verification size mismatch for object %s: expected %d, got %d",
                    object_key, expected_size, actual_size
                )
                return False
            return True
        except Exception as e:
            logger.error("Failed to verify R2 object %s presence: %s", object_key, e, exc_info=True)
            return False
