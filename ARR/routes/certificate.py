from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ARR.database.db import get_db
from ARR.database.models import CarbonCredit, CreditStatus
from ARR.services.pdf_generator import generate_certificate_pdf
from ARR.services.auth import get_current_user

router = APIRouter(tags=["Certificate"])

@router.get("/certificate/{credit_id}/download")
async def download_certificate(credit_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Downloads the minted certificate as a PDF. Requires Payment."""
    if user.get("role") != "institution":
        raise HTTPException(status_code=403, detail="Only auditors can access certificates.")
        
    credit = db.query(CarbonCredit).filter(CarbonCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit not found.")
        
    if credit.status == CreditStatus.VERIFIED:
        raise HTTPException(status_code=402, detail="Payment Required to mint this certificate. Please complete billing first.")
        
    if credit.status != CreditStatus.ISSUED:
        raise HTTPException(status_code=400, detail=f"Certificate not available. Status: {credit.status.value}")
        
    pdf_buffer = generate_certificate_pdf(credit)
    
    headers = {
        'Content-Disposition': f'attachment; filename="CarbonEngine_Certificate_{credit.unique_code[:8]}.pdf"'
    }
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers=headers
    )
