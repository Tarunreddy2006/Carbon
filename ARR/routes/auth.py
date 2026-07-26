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

from ARR.database.db import get_db
from ARR.database.models import Farmer, Institution
from ARR.services.auth import create_access_token, verify_password, get_password_hash

router = APIRouter(tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

class InstitutionRegisterRequest(BaseModel):
    username: str
    password: str
    company_name: str
class FarmerRegisterRequest(BaseModel):
    username: str
    password: str

# ==========================================
# 🌾 FIELD APP LOGIN (Farmers)
# ==========================================
@router.post("/login/farmer")
async def login_farmer(credentials: LoginRequest, db: Session = Depends(get_db)):
    farmer = db.query(Farmer).filter(Farmer.username == credentials.username).first()
    
    if not farmer or not verify_password(credentials.password, farmer.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Farmer credentials")
        
    token = create_access_token(user_id=str(farmer.id), role="farmer")
    
    return {"access_token": token, "token_type": "bearer"}

@router.post("/register/farmer")
async def register_farmer(req: FarmerRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(Farmer).filter(Farmer.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed_pw = get_password_hash(req.password)
    new_farmer = Farmer(
        username=req.username,
        password_hash=hashed_pw,
    )
    db.add(new_farmer)
    db.commit()
    db.refresh(new_farmer)
    return {"message": "Farmer registered successfully"}
# ==========================================
# 🏢 PRO DASHBOARD LOGIN (Institutions)
# ==========================================
@router.post("/login/institution")
async def login_institution(credentials: LoginRequest, db: Session = Depends(get_db)):
    inst = db.query(Institution).filter(Institution.username == credentials.username).first()
    
    if not inst or not verify_password(credentials.password, inst.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Institution credentials")
        
    token = create_access_token(user_id=str(inst.id), role="institution")
    
    return {"access_token": token, "token_type": "bearer"}

@router.post("/register/institution")
async def register_institution(req: InstitutionRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(Institution).filter(Institution.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed_pw = get_password_hash(req.password)
    new_inst = Institution(
        username=req.username,
        password_hash=hashed_pw,
        company_name=req.company_name
    )
    db.add(new_inst)
    db.commit()
    db.refresh(new_inst)
    return {"message": "Institution registered successfully"}
