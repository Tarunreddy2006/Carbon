"""
carbon/biochar/backend/attestation.py
──────────────────────────────────────────────────────────────────────────────
Farmer Attestation Token & Cryptographic Service

Provides secure JWT-based verification links for outbound biochar distribution.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
import jwt

logger = logging.getLogger("carbon_engine")

# Load configuration secrets with standard default fallbacks
SECRET_KEY = os.getenv("BIOCHAR_SECRET_KEY", os.getenv("SECRET_KEY", "biochar-stomata-tech-super-secret-key"))
ALGORITHM = "HS256"


# ─── Custom Attestation Exceptions ───────────────────────────────────────────

class AttestationError(Exception):
    """Base exception for all attestation-related errors."""
    pass


class AttestationTokenExpiredError(AttestationError):
    """Raised when the attestation token has expired."""
    pass


class AttestationTokenInvalidError(AttestationError):
    """Raised when the attestation token signature is invalid or malformed."""
    pass


# ─── Cryptographic Service Functions ─────────────────────────────────────────

def generate_signed_farmer_link(sink_id: str) -> str:
    """
    Accept a DistributionSink sink_id.
    Generate a cryptographically signed JWT with exactly 7 days expiration.
    Payload:
        {
            "sink_id": sink_id,
            "exp": expiration_timestamp
        }
    Use the application's secret key configuration.
    Return URL format:
        https://biochar.stomata.tech/verify/sink?token={generated_token}
    """
    logger.info("Generating signed farmer attestation link for sink_id: %s", sink_id)
    try:
        expiration = datetime.now(timezone.utc) + timedelta(days=7)
        payload = {
            "sink_id": sink_id,
            "exp": int(expiration.timestamp())
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        link = f"https://biochar.stomata.tech/verify/sink?token={token}"
        return link
    except Exception as exc:
        logger.error(
            "Unexpected error generating attestation link for sink %s: %s",
            sink_id, exc, exc_info=True
        )
        raise AttestationError(f"Failed to generate signed attestation link: {exc}") from exc


def verify_attestation_token(token: str) -> str:
    """
    Verify JWT signature and expiration.
    Handle ExpiredSignatureError and invalid token errors.
    Raise repository-standard application exceptions.
    Return verified sink_id.
    """
    logger.info("Verifying attestation token.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sink_id = payload.get("sink_id")
        if not sink_id:
            logger.error("Token verification failed: payload is missing 'sink_id'.")
            raise AttestationTokenInvalidError("Token payload is missing 'sink_id'.")
        return str(sink_id)
    except jwt.ExpiredSignatureError as exc:
        logger.warning("Attestation token verification failed: token has expired: %s", exc)
        raise AttestationTokenExpiredError("The attestation verification link has expired.") from exc
    except jwt.InvalidTokenError as exc:
        logger.error("Attestation token verification failed: invalid token: %s", exc)
        raise AttestationTokenInvalidError("The attestation verification link is invalid.") from exc
    except Exception as exc:
        logger.error("Unexpected error during attestation token verification: %s", exc, exc_info=True)
        raise AttestationError(f"Token verification failed: {exc}") from exc
