"""
carbon/biochar/backend/storage/provider.py
──────────────────────────────────────────────────────────────────────────────
Abstract base class representing the Stomata Object Storage Provider interface.
Allows backend to interact with various object storage providers (R2, S3, MinIO)
without coupling to provider-specific SDKs.
──────────────────────────────────────────────────────────────────────────────
"""

from abc import ABC, abstractmethod
from typing import Dict, Any

class StorageProvider(ABC):
    @abstractmethod
    def generate_presigned_upload_url(
        self, 
        object_key: str, 
        mime_type: str, 
        file_size: int, 
        expires_in: int = 3600
    ) -> Dict[str, Any]:
        """
        Generate a pre-signed URL for direct client upload (PUT request).
        
        Args:
            object_key: The target path/key for the object in the bucket.
            mime_type: The content type of the file to be uploaded.
            file_size: The expected size of the file in bytes.
            expires_in: The lifetime of the pre-signed URL in seconds.

        Returns:
            A dictionary containing 'url', 'method', and 'headers'.
        """
        pass

    @abstractmethod
    def generate_presigned_download_url(
        self, 
        object_key: str, 
        expires_in: int = 3600
    ) -> str:
        """
        Generate a pre-signed download/view URL for client-side access.

        Args:
            object_key: The path/key of the object in the bucket.
            expires_in: The lifetime of the URL in seconds.

        Returns:
            A signed GET URL.
        """
        pass

    @abstractmethod
    def delete_file(self, object_key: str) -> None:
        """
        Delete an object from storage.

        Args:
            object_key: The path/key of the object to delete.
        """
        pass

    @abstractmethod
    def verify_upload(self, object_key: str, expected_size: int) -> bool:
        """
        Verify that an object exists in storage and matches the expected size.

        Args:
            object_key: The path/key of the object.
            expected_size: The expected size of the object in bytes.

        Returns:
            True if the object exists and size matches, False otherwise.
        """
        pass
