import ee
import os
from google.oauth2 import service_account

def initialise_gee():
    try:
        ee.Number(1).getInfo()
    except Exception:
        credentials = service_account.Credentials.from_service_account_file(
            "/etc/secrets/detrixai.json",
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )

        ee.Initialize(
            credentials,
            project=os.getenv("GEE_PROJECT_ID")
        )
