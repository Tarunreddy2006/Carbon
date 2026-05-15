from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
import stripe
from database.db import get_db
from database.models import CarbonCredit, CreditStatus
from core.config import settings
from services.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing & Monetization"])

stripe.api_key = settings.STRIPE_SECRET_KEY

# Base URL for redirects
FRONTEND_URL = "http://localhost:8000"

@router.post("/create-checkout-session/{credit_id}")
async def create_checkout_session(credit_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Creates a Stripe Checkout Session to pay for minting the verified carbon credit."""
    if user.get("role") != "institution":
        raise HTTPException(status_code=403, detail="Only auditors can mint credits.")
        
    credit = db.query(CarbonCredit).filter(CarbonCredit.id == credit_id).first()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit not found.")
        
    if credit.status == CreditStatus.ISSUED:
        raise HTTPException(status_code=400, detail="Credit is already issued/minted.")

    if credit.status != CreditStatus.VERIFIED:
        raise HTTPException(status_code=400, detail=f"Credit status must be VERIFIED. Current status: {credit.status.value}")

    # Charge $1.00 per tonne of CO2e
    co2e_tons = credit.estimated_co2e
    unit_amount_cents = int(1.00 * 100) # $1.00 per unit
    quantity = int(max(1, co2e_tons))

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f'CarbonEngine Verified Certificate',
                        'description': f'Minting {co2e_tons:.1f} tonnes of Carbon Sequestration',
                    },
                    'unit_amount': unit_amount_cents,
                },
                'quantity': quantity,
            }],
            mode='payment',
            success_url=f"{FRONTEND_URL}/?checkout=success&credit_id={credit_id}",
            cancel_url=f"{FRONTEND_URL}/?checkout=canceled",
            metadata={
                "credit_id": str(credit.id)
            }
        )
        return {"checkout_url": session.url}
    except Exception as e:
        logger.error(f"Stripe Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session.")

@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None), db: Session = Depends(get_db)):
    """Stripe Webhook to listen for successful payments."""
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        credit_id = session.get('metadata', {}).get('credit_id')
        
        if credit_id:
            credit = db.query(CarbonCredit).filter(CarbonCredit.id == credit_id).first()
            if credit and credit.status == CreditStatus.VERIFIED:
                credit.status = CreditStatus.ISSUED
                db.commit()
                logger.info(f"✅ PAYMENT SUCCESSFUL: Credit {credit_id} marked as ISSUED.")

    return {"status": "success"}
