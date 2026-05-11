"""
services/auth.py
─────────────────────────────────────────────────────────────────────────────
Zero-Trust Security Engine. Generates and validates JSON Web Tokens (JWT).
─────────────────────────────────────────────────────────────────────────────
"""
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Security, status
import os
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

# In production, this SECRET_KEY MUST be stored in a .env file!
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")) # Tokens expire in 2 hours

security = HTTPBearer()

def create_access_token(user_id: str, role: str) -> str:
    """Mints a new JWT with the user's role embedded inside."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire
    }
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    The Bouncer. Intercepts incoming requests, opens the JWT, and verifies it.
    If the token is fake or expired, it instantly rejects the request.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload # Returns the dictionary: {"sub": "user_id", "role": "FARMER", ...}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")