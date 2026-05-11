"""
routes/auth.py
─────────────────────────────────────────────────────────────────────────────
Authentication endpoints for the Dual-Database architecture.
Handles separate login flows for Farmers (Field App) and Institutions (Pro Dashboard).
─────────────────────────────────────────────────────────────────────────────
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Farmer, Institution
from services.auth import create_access_token

router = APIRouter(tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

# ==========================================
# 🌾 FIELD APP LOGIN (Farmers)
# ==========================================
@router.post("/login/farmer")
async def login_farmer(credentials: LoginRequest, db: Session = Depends(get_db)):
    # 1. Query the specific Farmers table
    farmer = db.query(Farmer).filter(Farmer.username == credentials.username).first()
    
    # 2. Verify Credentials 
    # Note: In a live production environment, ALWAYS use bcrypt to verify a hashed password:
    # if not farmer or not verify_password(credentials.password, farmer.password_hash):
    if not farmer or credentials.password != "pass123": 
        raise HTTPException(status_code=401, detail="Invalid Farmer credentials")
        
    # 3. Mint the VIP Wristband (JWT) with the exact role
    token = create_access_token(user_id=str(farmer.id), role="farmer")
    
    return {"access_token": token, "token_type": "bearer"}


# ==========================================
# 🏢 PRO DASHBOARD LOGIN (Institutions)
# ==========================================
@router.post("/login/institution")
async def login_institution(credentials: LoginRequest, db: Session = Depends(get_db)):
    # 1. Query the specific Institutions table
    inst = db.query(Institution).filter(Institution.username == credentials.username).first()
    
    # 2. Verify Credentials
    if not inst or credentials.password != "admin123":
        raise HTTPException(status_code=401, detail="Invalid Institution credentials")
        
    # 3. Mint the VIP Wristband (JWT) with the exact role
    token = create_access_token(user_id=str(inst.id), role="institution")
    
    return {"access_token": token, "token_type": "bearer"}