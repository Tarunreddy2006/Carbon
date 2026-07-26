from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import shapely.wkb
import shapely.geometry
from typing import List

from ARR.database.db import get_db
from ARR.database.models import ParcelRecord
from ARR.services.auth import get_current_user

router = APIRouter(tags=["User Profile"])

@router.get("/estimate-carbon/history")
async def get_user_parcels(user_token: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User ID missing from token")
    
    parcels = db.query(ParcelRecord).filter(ParcelRecord.user_id == user_id).all()
    
    results = []
    for p in parcels:
        try:
            geom_obj = shapely.wkb.loads(bytes(p.boundary.data))
            geojson_geom = {"type": "Polygon", "coordinates": [list(shapely.geometry.mapping(geom_obj)['coordinates'][0])]}
        except Exception:
            geojson_geom = None

        results.append({
            "id": str(p.id),
            "farm_id": p.farm_id,
            "source_type": p.source_type,
            "calculated_area_ha": p.calculated_area_ha,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "polygon": geojson_geom
        })
        
    return {"parcels": results}
