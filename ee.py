import ee
import json
import os
from google.oauth2 import service_account

service_account_info = json.loads(
    os.getenv("GEE_SERVICE_ACCOUNT_JSON")
)

credentials = service_account.Credentials.from_service_account_info(
    service_account_info,
    scopes=['https://www.googleapis.com/auth/cloud-platform']
)

ee.Initialize(credentials)