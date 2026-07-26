import hashlib
import json
from datetime import datetime

def calculate_sha256_hash(data: dict) -> str:
    """
    Serializes an incoming data dictionary deterministically by sorting keys,
    and returns a unique SHA-256 hex string to serve as an unalterable signature.
    """
    serialized_data = json.dumps(
        data, 
        sort_keys=True, 
        default=str
    ).encode('utf-8')
    
    return hashlib.sha256(serialized_data).hexdigest()

def generate_secure_timestamp() -> str:
    """
    Returns an absolute, explicit ISO 8601 high-precision UTC timestamp 
    string to clear verification window requirements.
    """
    return datetime.utcnow().isoformat() + "Z"