import os
import json
import uuid
import hashlib
import re
import secrets
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, Query, HTTPException, Body, Request, Response, Header, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from email_service import email_service

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Helper to read JSON
def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: could not parse {filename}: {e}")
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                    return json.loads(content, strict=False)
            except Exception:
                return []
    return []

def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# Password hashing helper
def hash_password(password: str, salt: Optional[str] = None):
    if not salt:
        salt = os.urandom(16).hex()
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pwd_hash, salt

def verify_password(plain_password: str, stored_hash: str, salt: str) -> bool:
    if not plain_password or not stored_hash or not salt:
        return False
    pwd_hash, _ = hash_password(plain_password, salt)
    return pwd_hash == stored_hash

# In-memory / dynamic store initialized from files
guides_db = load_json("guides.json")
experiences_db = load_json("experiences.json")
partners_db = load_json("partners.json")
community_db = load_json("community.json")
users_db = load_json("users.json")
sessions_data = load_json("sessions.json")
active_sessions = sessions_data if isinstance(sessions_data, dict) else {}
collaboration_requests = []
saved_itineraries = {}
verifications_data = load_json("verifications.json")
pending_verifications = verifications_data if isinstance(verifications_data, dict) else {}
password_resets = {}
notifications_data = load_json("notifications.json")
notifications_db = notifications_data if isinstance(notifications_data, list) else []

def save_verifications():
    try:
        save_json("verifications.json", pending_verifications)
    except Exception as e:
        print(f"Warning: could not persist verifications: {e}")

def save_notifications():
    try:
        save_json("notifications.json", notifications_db)
    except Exception as e:
        print(f"Warning: could not persist notifications: {e}")

def load_trips() -> list:
    return load_json("trips.json") or []

def save_trips(trips_list):
    try:
        save_json("trips.json", trips_list)
    except Exception as e:
        print(f"Warning: could not persist trips: {e}")

def require_authenticated_session(request: Request, token_param: Optional[str] = None) -> dict:
    sess_token = extract_token_from_request(request, token_param)
    if not sess_token or sess_token not in active_sessions:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in to access your trips.")
    session = active_sessions[sess_token]
    if "expires_at" in session:
        try:
            exp = datetime.fromisoformat(session["expires_at"].replace("Z", ""))
            if datetime.utcnow() > exp:
                del active_sessions[sess_token]
                save_sessions()
                raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
        except (ValueError, TypeError):
            pass
    return session

def save_sessions():
    try:
        save_json("sessions.json", active_sessions)
    except Exception as e:
        print(f"Warning: could not persist sessions: {e}")

def create_session(user_dict: dict) -> str:
    session_token = f"bc_sess_{uuid.uuid4().hex}"
    expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat() + "Z"
    active_sessions[session_token] = {
        "session_token": session_token,
        "user_id": user_dict.get("id", ""),
        "email": user_dict.get("email", ""),
        "full_name": user_dict.get("full_name", ""),
        "country": user_dict.get("country", "United States"),
        "traveler_type": user_dict.get("traveler_type", "Explorer"),
        "is_verified": user_dict.get("is_verified", True),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "expires_at": expires_at
    }
    save_sessions()
    return session_token

def extract_token_from_request(request: Request, token_param: Optional[str] = None) -> Optional[str]:
    if token_param:
        return token_param.strip()
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    x_token = request.headers.get("X-Session-Token")
    if x_token:
        return x_token.strip()
    cookie_token = request.cookies.get("bc_session_token")
    if cookie_token:
        return cookie_token.strip()
    return None

app = FastAPI(
    title="BharatConnect AI",
    description="AI-Powered Tourism and Global Collaboration Platform for India",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class TripPlannerRequest(BaseModel):
    origin_country: str = "United States"
    destination: str = "Golden Triangle (Delhi, Agra, Jaipur)"
    start_date: Optional[str] = "2026-10-10"
    duration_days: int = 7
    travelers_count: int = 2
    traveler_type: str = "Couple"
    budget_usd: int = 3500
    travel_style: str = "Cultural"
    interests: List[str] = ["Heritage", "Culinary Trails", "Local Crafts"]
    preferred_language: str = "English"
    accommodation: str = "Heritage Haveli & Boutique"
    transportation: str = "Private Chauffeur & High-speed Rail"
    category: Optional[str] = "Heritage & History"
    pace: Optional[str] = "Balanced (2-3 Sights Daily)"

class CustomTripRequest(BaseModel):
    destination: Optional[str] = "Golden Triangle (Delhi, Agra, Jaipur)"
    destinations: Optional[List[str]] = None
    places: Optional[List[str]] = None
    travel_date: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_days: int = 7
    travelers_count: int = 2
    traveler_type: str = "Couple"
    budget_usd: int = 3500
    interests: List[str] = Field(default_factory=list)
    travel_preferences: Optional[str] = None
    guide_id: Optional[str] = None
    guide_name: Optional[str] = None
    experience_ids: List[str] = Field(default_factory=list)
    activities: List[str] = Field(default_factory=list)
    accommodation: str = "Heritage Haveli & Boutique"
    accommodation_preference: Optional[str] = None
    transportation: str = "Private Chauffeur & High-speed Rail"
    transportation_preference: Optional[str] = None
    daily_pace: str = "Balanced (2-3 Sights Daily)"
    custom_notes: Optional[str] = None
    starting_city: Optional[str] = None
    categories: Optional[List[str]] = Field(default_factory=list)
    cab_type: Optional[str] = "Private Chauffeur Sedan"
    photographer_required: Optional[bool] = False
    photographer_tier: Optional[str] = "None"
    services: Optional[dict] = None

class SaveTripRequest(BaseModel):
    trip: dict

class CollaborationRequest(BaseModel):
    partner_id: str
    partner_name: str
    applicant_name: str
    applicant_email: str
    applicant_company: str
    applicant_country: str = "United States"
    category: str
    message: str
    proposed_date: Optional[str] = None

class PartnerApplication(BaseModel):
    business_name: str
    contact_person: str
    email: str
    phone: str
    city: str
    industry: str
    products_services: str
    verification_documents: Optional[str] = "Self-certified registration provided"

class CommunityPostCreate(BaseModel):
    author_name: str
    author_origin: str
    title: str
    category: str
    tags: List[str]
    content: str

class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    country: Optional[str] = None
    origin_country: Optional[str] = "United States"
    traveler_type: Optional[str] = "Explorer"
    confirm_password: Optional[str] = None
    terms_accepted: Optional[bool] = True
    require_otp: Optional[bool] = False

class LoginRequest(BaseModel):
    email: str
    password: str

class OTPVerifyRequest(BaseModel):
    email: str
    otp: Optional[str] = None
    otp_code: Optional[str] = None

class OTPResendRequest(BaseModel):
    email: str
    purpose: Optional[str] = "registration"

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: Optional[str] = None
    otp_code: Optional[str] = None
    new_password: str
    confirm_password: Optional[str] = None

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    traveler_type: Optional[str] = None
    bio: Optional[str] = None
    travel_style: Optional[str] = None
    interests: Optional[List[str]] = None
    budget_tier: Optional[str] = None
    languages: Optional[List[str]] = None
    dietary: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

class SettingsUpdateRequest(BaseModel):
    # Support both legacy and new field names
    notifications_trip_updates: Optional[bool] = None
    notifications_guide_messages: Optional[bool] = None
    notifications_platform_alerts: Optional[bool] = None
    # New short-form aliases
    notif_trip: Optional[bool] = None
    notif_guide: Optional[bool] = None
    notif_platform: Optional[bool] = None
    # Currency: accept preferred_currency or currency
    preferred_currency: Optional[str] = None
    currency: Optional[str] = None
    language: Optional[str] = "English"
    profile_visibility: Optional[str] = "private"

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ReportIssueRequest(BaseModel):
    reporter_name: str
    email: str
    phone: Optional[str] = None
    category: str
    target_entity: Optional[str] = None
    description: str
    urgent_callback: bool = False

# Sample tracked collaboration requests
sample_tracked_requests = [
    {
        "tracking_id": "BC-9041",
        "partner_name": "Malabar Organic Spice Guild",
        "company": "Austin Artisan Foods LLC",
        "category": "Organic Spice Sourcing",
        "status": "Intro Meeting Scheduled",
        "status_step": 7,
        "date_updated": "Today, 10:30 AM",
        "note": "Virtual introductory call scheduled between Michael Chang and Guild Directors with certified trade concierge."
    },
    {
        "tracking_id": "BC-8820",
        "partner_name": "Jaipur Royal Weaves & Block Collective",
        "company": "Brooklyn Indigo Studio",
        "category": "Handicrafts & Natural Dyes",
        "status": "Fabric Swatch Samples Dispatched",
        "status_step": 6,
        "date_updated": "Yesterday",
        "note": "Handloom organic cotton and natural indigo block print swatches dispatched via DHL Express."
    },
    {
        "tracking_id": "BC-7540",
        "partner_name": "Himalayan Forest Botanical Co.",
        "company": "London Clean Wellness Group",
        "category": "Ayurvedic Essential Oils",
        "status": "Mutual NDA & Sourcing Agreement in Review",
        "status_step": 5,
        "date_updated": "3 days ago",
        "note": "Bulk export documentation and certificate of analysis shared for wild-harvested lavender extracts."
    },
    {
        "tracking_id": "BC-6192",
        "partner_name": "Heritage Haveli Palaces Alliance",
        "company": "Silicon Valley Executive Retreats",
        "category": "Hospitality & Private Fort Buyout",
        "status": "Active Partnership Bridge Established",
        "status_step": 8,
        "date_updated": "1 week ago",
        "note": "Corporate buyout confirmed for 14-suite lakeside haveli in Udaipur for November 2026."
    }
]

# API Routes
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": "BharatConnect AI",
        "version": "1.0.0",
        "currency_rates": {"USD_TO_INR": 86.5, "EUR_TO_INR": 93.5},
        "stats": {
            "guides_count": len(guides_db),
            "experiences_count": len(experiences_db),
            "partners_count": len(partners_db),
            "community_posts": len(community_db)
        }
    }

# Multi-Currency Rates & Configuration API
CURRENCY_RATES_CONFIG = {
    "base": "INR",
    "rates_to_inr": {
        "INR": 1.0,
        "USD": 86.5,
        "EUR": 93.5,
        "GBP": 111.0,
        "JPY": 0.58,
        "CAD": 61.5,
        "AUD": 56.0,
        "SGD": 65.0,
        "AED": 23.5
    },
    "currencies": {
        "INR": {"code": "INR", "symbol": "₹", "name": "Indian Rupee", "rate_to_inr": 1.0, "flag": "🇮🇳", "is_base": True},
        "USD": {"code": "USD", "symbol": "$", "name": "US Dollar", "rate_to_inr": 86.5, "flag": "🇺🇸", "is_base": False},
        "EUR": {"code": "EUR", "symbol": "€", "name": "Euro", "rate_to_inr": 93.5, "flag": "🇪🇺", "is_base": False},
        "GBP": {"code": "GBP", "symbol": "£", "name": "British Pound", "rate_to_inr": 111.0, "flag": "🇬🇧", "is_base": False},
        "JPY": {"code": "JPY", "symbol": "¥", "name": "Japanese Yen", "rate_to_inr": 0.58, "flag": "🇯🇵", "is_base": False},
        "CAD": {"code": "CAD", "symbol": "C$", "name": "Canadian Dollar", "rate_to_inr": 61.5, "flag": "🇨🇦", "is_base": False},
        "AUD": {"code": "AUD", "symbol": "A$", "name": "Australian Dollar", "rate_to_inr": 56.0, "flag": "🇦🇺", "is_base": False},
        "SGD": {"code": "SGD", "symbol": "S$", "name": "Singapore Dollar", "rate_to_inr": 65.0, "flag": "🇸🇬", "is_base": False},
        "AED": {"code": "AED", "symbol": "AED", "name": "UAE Dirham", "rate_to_inr": 23.5, "flag": "🇦🇪", "is_base": False}
    },
    "disclaimer": "Rates are indicative estimates for traveler budget planning only. All transactions in India are processed in Indian Rupees (INR)."
}

@app.get("/api/currency/rates")
def get_currency_rates():
    return {
        "base": CURRENCY_RATES_CONFIG["base"],
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "source": "live_indicative",
        "rates_to_inr": CURRENCY_RATES_CONFIG["rates_to_inr"],
        "currencies": CURRENCY_RATES_CONFIG["currencies"],
        "disclaimer": CURRENCY_RATES_CONFIG["disclaimer"]
    }

@app.get("/api/guides")
def get_guides(
    city: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    max_price: Optional[int] = None
):
    results = load_json("guides.json") or guides_db
    if city and city.lower() != "all":
        results = [g for g in results if city.lower() in g["city"].lower() or city.lower() in g["state"].lower()]
    if language and language.lower() != "all":
        results = [g for g in results if any(language.lower() == l.lower() for l in g.get("languages", []))]
    if category and category.lower() != "all":
        results = [g for g in results if category.lower() in g.get("category", "").lower()]
    if max_price:
        results = [g for g in results if g.get("price_per_day_usd", 100) <= max_price]
    if search:
        s = search.lower()
        results = [
            g for g in results if (
                s in g["name"].lower() or
                s in g["city"].lower() or
                s in g.get("bio", "").lower() or
                any(s in exp.lower() for exp in g.get("expertise", []))
            )
        ]
    return {"guides": results, "total": len(results)}

@app.get("/api/guides/{guide_id}")
def get_guide_by_id(guide_id: str):
    curr_guides = load_json("guides.json") or guides_db
    guide = next((g for g in curr_guides if g["id"] == guide_id), None)
    if not guide:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide

@app.get("/api/experiences")
def get_experiences(
    category: Optional[str] = None,
    city: Optional[str] = None,
    search: Optional[str] = None,
    max_price: Optional[int] = None
):
    results = load_json("experiences.json") or experiences_db
    if category and category.lower() != "all":
        results = [e for e in results if category.lower() in e["category"].lower()]
    if city and city.lower() != "all":
        results = [e for e in results if city.lower() in e["city"].lower() or city.lower() in e["state"].lower()]
    if max_price:
        results = [e for e in results if e.get("price_usd", 200) <= max_price]
    if search:
        s = search.lower()
        results = [
            e for e in results if (
                s in e["title"].lower() or
                s in e["description"].lower() or
                s in e["city"].lower()
            )
        ]
    return {"experiences": results, "total": len(results)}

@app.get("/api/partners")
def get_partners(
    industry: Optional[str] = None,
    search: Optional[str] = None
):
    results = load_json("partners.json") or partners_db
    if industry and industry.lower() != "all":
        results = [p for p in results if industry.lower() in p["industry"].lower()]
    if search:
        s = search.lower()
        results = [
            p for p in results if (
                s in p["name"].lower() or
                s in p["description"].lower() or
                s in p["city"].lower() or
                any(s in pr.lower() for pr in p.get("products", []))
            )
        ]
    return {"partners": results, "total": len(results)}

@app.post("/api/collaborate")
def create_collaboration_request(payload: CollaborationRequest):
    req_id = f"collab-{uuid.uuid4().hex[:8]}"
    record = payload.model_dump()
    record["id"] = req_id
    record["created_at"] = datetime.utcnow().isoformat() + "Z"
    record["status"] = "Under Review & Introduction Pending"
    collaboration_requests.append(record)
    return {
        "success": True,
        "request_id": req_id,
        "message": f"Collaboration request sent to {payload.partner_name}. Our business concierge will initiate the introduction within 24 hours.",
        "record": record
    }

@app.post("/api/partner/apply")
def apply_partner(payload: PartnerApplication):
    app_id = f"app-{uuid.uuid4().hex[:8]}"
    record = payload.model_dump()
    record["id"] = app_id
    record["applied_at"] = datetime.utcnow().isoformat() + "Z"
    record["status"] = "Pending Verification & KYC Audit"
    partner_applications.append(record)
    return {
        "success": True,
        "application_id": app_id,
        "message": "Thank you for applying to the BharatConnect Verified Partner Network. Our trust & safety team will review your business credentials."
    }

@app.get("/api/community")
def get_community(category: Optional[str] = None):
    global community_db
    if not community_db or len(community_db) < 6:
        community_db = load_json("community.json")
    results = community_db
    if category and category.lower() != "all":
        results = [c for c in results if category.lower() in c.get("category", "").lower()]
    return {"posts": results, "total": len(results)}

@app.post("/api/community/posts")
def create_community_post(payload: CommunityPostCreate):
    new_post = {
        "id": f"post-{uuid.uuid4().hex[:6]}",
        "author_name": payload.author_name,
        "author_avatar": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80",
        "author_origin": payload.author_origin,
        "title": payload.title,
        "category": payload.category,
        "tags": payload.tags,
        "date": "Just now",
        "content": payload.content,
        "likes": 1,
        "user_liked": True,
        "comments_count": 0,
        "comments": []
    }
    community_db.insert(0, new_post)
    return {"success": True, "post": new_post}

@app.post("/api/community/like")
def like_post(post_id: str = Body(..., embed=True)):
    for post in community_db:
        if post["id"] == post_id:
            if post.get("user_liked"):
                post["likes"] = max(0, post["likes"] - 1)
                post["user_liked"] = False
            else:
                post["likes"] += 1
                post["user_liked"] = True
            return {"success": True, "likes": post["likes"], "user_liked": post["user_liked"]}
    raise HTTPException(status_code=404, detail="Post not found")

@app.post("/api/community/follow")
def follow_traveler(author_name: str = Body(..., embed=True)):
    for post in community_db:
        if post["author_name"].lower() == author_name.lower():
            is_following = post.get("is_following", False)
            post["is_following"] = not is_following
            curr_followers = post.get("followers_count", 50)
            post["followers_count"] = max(0, curr_followers + (1 if not is_following else -1))
            return {
                "success": True,
                "author_name": post["author_name"],
                "is_following": post["is_following"],
                "followers_count": post["followers_count"]
            }
    return {
        "success": True,
        "author_name": author_name,
        "is_following": True,
        "followers_count": 89
    }

@app.get("/api/collaborate/track")
def track_collaboration(query: Optional[str] = None):
    all_records = list(sample_tracked_requests)
    for req in collaboration_requests:
        all_records.append({
            "tracking_id": f"BC-{req['id'][-4:].upper()}",
            "partner_name": req.get("partner_name", "Verified Partner"),
            "company": req.get("applicant_company", "Global Enterprise"),
            "category": req.get("category", "Trade & Alliance"),
            "status": req.get("status", "Under Review"),
            "status_step": 5,
            "date_updated": "Just now",
            "note": f"Inquiry submitted by {req.get('applicant_name')} for {req.get('category')}."
        })
    if query:
        q = query.lower().strip()
        matched = [
            r for r in all_records
            if q in r["tracking_id"].lower() or q in r["partner_name"].lower() or q in r["company"].lower()
        ]
        return {"records": matched, "total": len(matched)}
    return {"records": all_records, "total": len(all_records)}

@app.post("/api/report")
def report_issue(payload: ReportIssueRequest):
    report_id = f"rep-{uuid.uuid4().hex[:8]}"
    return {
        "success": True,
        "report_id": report_id,
        "message": f"Report received under ticket #{report_id.upper()}. Our 24/7 Trust & Safety dispatch team will review within 2 hours.",
        "urgent_callback": payload.urgent_callback
    }

def initiate_otp_registration(payload: SignupRequest, request: Optional[Request] = None):
    # 1. Full Name validation
    name = (payload.full_name or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Full Name must be at least 2 characters.")

    # 2. Email format validation
    email = (payload.email or "").strip().lower()
    email_pattern = r"^[\w\.\+\-]+@[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+$"
    if not email or not re.match(email_pattern, email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    # 3. Mobile / WhatsApp validation
    phone = (payload.phone or "").strip()
    if phone:
        phone_pattern = r"^\+?[0-9\s\-\(\)]{7,20}$"
        digits_only = re.sub(r"\D", "", phone)
        if not re.match(phone_pattern, phone) or len(digits_only) < 7:
            raise HTTPException(status_code=400, detail="Please enter a valid mobile or WhatsApp number (at least 7 digits).")

    # 4. Password validation
    password = payload.password or ""
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9!@#$%^&*(),.?\":{}|<>\-_]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one letter and at least one number or special character.")

    # 5. Confirm password match (if provided)
    if payload.confirm_password is not None:
        if password != payload.confirm_password:
            raise HTTPException(status_code=400, detail="Passwords do not match. Please verify and try again.")

    # 6. Terms & privacy validation
    if payload.terms_accepted is False:
        raise HTTPException(status_code=400, detail="You must accept the Terms of Service & Privacy Policy to create an account.")

    # 7. Check for duplicate email (case-insensitive)
    global users_db
    current_users = load_json("users.json") or users_db
    for existing in current_users:
        if existing.get("email", "").strip().lower() == email:
            raise HTTPException(status_code=400, detail="An account with this email address already exists. Please sign in instead.")

    # 8. Generate 6-digit cryptographic numeric OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    pwd_hash, salt = hash_password(password)
    user_id = f"usr-{uuid.uuid4().hex[:8]}"
    country = payload.country or payload.origin_country or "United States"

    pending_user = {
        "id": user_id,
        "full_name": name,
        "email": email,
        "phone": phone,
        "country": country,
        "traveler_type": payload.traveler_type or "Explorer",
        "password_hash": pwd_hash,
        "salt": salt,
        "terms_accepted": True,
        "is_verified": False,
        "status": "pending_verification",
        "travel_preferences": {
            "style": payload.traveler_type or "Cultural Explorer",
            "interests": ["Heritage", "Local Culture", "Culinary"],
            "budget_tier": "Standard",
            "languages": ["English"],
            "emergency_contact": {"name": "", "phone": ""},
            "bio": ""
        },
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    pending_verifications[email] = {
        "otp": otp_code,
        "otp_code": otp_code,
        "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat() + "Z",
        "attempts": 0,
        "last_sent_at": datetime.utcnow().isoformat() + "Z",
        "pending_user": pending_user
    }
    save_verifications()

    # 9. Send OTP Email
    try:
        if request and request.headers.get("X-Simulate-Email-Failure") == "1":
            raise Exception("Simulated SMTP Server Down via X-Simulate-Email-Failure header!")
        email_service.send_verification_otp(
            email=email,
            full_name=name,
            otp_code=otp_code,
            expires_minutes=10
        )
    except Exception as notify_err:
        print(f"[WARNING] Verification email dispatch failed: {notify_err}")

    return {
        "success": True,
        "status": "pending_verification",
        "verification_required": True,
        "email": email,
        "expires_in_seconds": 600,
        "message": f"A 6-digit verification code has been dispatched to {email}. Please enter it to verify your account."
    }

def process_registration(payload: SignupRequest, request: Optional[Request] = None):
    if payload.require_otp:
        return initiate_otp_registration(payload, request=request)

    # 1. Full Name validation
    name = (payload.full_name or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Full Name must be at least 2 characters.")

    # 2. Email format validation
    email = (payload.email or "").strip().lower()
    email_pattern = r"^[\w\.\+\-]+@[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+$"
    if not email or not re.match(email_pattern, email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    # 3. Mobile / WhatsApp validation
    phone = (payload.phone or "").strip()
    if phone:
        phone_pattern = r"^\+?[0-9\s\-\(\)]{7,20}$"
        digits_only = re.sub(r"\D", "", phone)
        if not re.match(phone_pattern, phone) or len(digits_only) < 7:
            raise HTTPException(status_code=400, detail="Please enter a valid mobile or WhatsApp number (at least 7 digits).")

    # 4. Password validation
    password = payload.password or ""
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9!@#$%^&*(),.?\":{}|<>\-_]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one letter and at least one number or special character.")

    # 5. Confirm password match (if provided)
    if payload.confirm_password is not None:
        if password != payload.confirm_password:
            raise HTTPException(status_code=400, detail="Passwords do not match. Please verify and try again.")

    # 6. Terms & privacy validation
    if payload.terms_accepted is False:
        raise HTTPException(status_code=400, detail="You must accept the Terms of Service & Privacy Policy to create an account.")

    # 7. Check for duplicate email (case-insensitive)
    global users_db
    current_users = load_json("users.json") or users_db
    for existing in current_users:
        if existing.get("email", "").strip().lower() == email:
            raise HTTPException(status_code=400, detail="An account with this email address already exists. Please sign in instead.")

    # 8. Hash password and persist user
    pwd_hash, salt = hash_password(password)
    user_id = f"usr-{uuid.uuid4().hex[:8]}"
    country = payload.country or payload.origin_country or "United States"

    new_user = {
        "id": user_id,
        "full_name": name,
        "email": email,
        "phone": phone,
        "country": country,
        "traveler_type": payload.traveler_type or "Explorer",
        "password_hash": pwd_hash,
        "salt": salt,
        "terms_accepted": True,
        "is_verified": True,
        "verified_at": datetime.utcnow().isoformat() + "Z",
        "status": "active",
        "travel_preferences": {
            "style": payload.traveler_type or "Cultural Explorer",
            "interests": ["Heritage", "Culinary Trails", "Local Crafts"],
            "budget_tier": "Standard",
            "languages": ["English"],
            "emergency_contact": {"name": "", "phone": ""},
            "bio": "Excited to explore India's vibrant heritage and living traditions."
        },
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    current_users.append(new_user)
    users_db = current_users
    save_json("users.json", users_db)

    session_token = create_session(new_user)

    # Admin notification for new user registration
    try:
        if request and request.headers.get("X-Simulate-Email-Failure") == "1":
            raise Exception("Simulated SMTP Server Down via X-Simulate-Email-Failure header!")
        email_service.notify_new_user_registration(
            full_name=name,
            email=email,
            country=country,
            registered_at=new_user.get("created_at")
        )
    except Exception as notify_err:
        print(f"[WARNING] Admin registration email notification failed: {notify_err}")

    # Add welcome notification
    notifications_db.insert(0, {
        "id": f"notif-{uuid.uuid4().hex[:8]}",
        "user_id": user_id,
        "type": "welcome",
        "title": "Welcome to BharatConnect AI",
        "message": f"Welcome {name}! Your global India travel account is active and verified.",
        "read": False,
        "created_at": datetime.utcnow().isoformat() + "Z"
    })
    save_notifications()

    return {
        "success": True,
        "session_token": session_token,
        "user_id": user_id,
        "full_name": name,
        "email": email,
        "phone": phone,
        "country": country,
        "traveler_type": new_user["traveler_type"],
        "user": {
            "id": user_id,
            "full_name": name,
            "email": email,
            "phone": phone,
            "country": country,
            "traveler_type": new_user["traveler_type"],
            "is_verified": True
        },
        "message": f"Welcome to BharatConnect AI, {name}! Your global traveler account has been created successfully."
    }

@app.post("/api/auth/register-request")
def register_request_endpoint(payload: SignupRequest, request: Request):
    """Step 1 of registration: validates data, generates 6-digit OTP, and emails it."""
    return initiate_otp_registration(payload, request=request)

@app.post("/api/auth/verify-otp")
def verify_otp_endpoint(payload: OTPVerifyRequest, response: Response):
    """Step 2 of registration: validates 6-digit OTP and activates the traveler account."""
    global users_db
    email = (payload.email or "").strip().lower()
    otp = (payload.otp or payload.otp_code or "").strip()

    if not email or not otp:
        raise HTTPException(status_code=400, detail="Please provide both email and verification code.")

    if email not in pending_verifications:
        # Check if already verified user
        curr_users = load_json("users.json") or users_db
        matched = next((u for u in curr_users if u.get("email", "").lower() == email), None)
        if matched and matched.get("is_verified", True):
            session_token = create_session(matched)
            response.set_cookie(key="bc_session_token", value=session_token, samesite="lax", httponly=False)
            return {
                "success": True,
                "already_verified": True,
                "session_token": session_token,
                "user": matched,
                "message": "Account is already verified. Signed in successfully."
            }
        raise HTTPException(status_code=400, detail="No pending verification found for this email. Please register first.")

    record = pending_verifications[email]

    # Expiry check
    try:
        exp = datetime.fromisoformat(record["expires_at"].replace("Z", ""))
        if datetime.utcnow() > exp:
            raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new code.")
    except (ValueError, TypeError):
        pass

    # Attempt limit check
    if record["attempts"] >= 5:
        raise HTTPException(status_code=400, detail="Maximum verification attempts exceeded. Please request a new code.")

    # Match OTP
    expected_otp = record.get("otp") or record.get("otp_code")
    if expected_otp != otp:
        record["attempts"] += 1
        save_verifications()
        remaining = max(0, 5 - record["attempts"])
        raise HTTPException(status_code=400, detail=f"Invalid verification code. {remaining} attempt(s) remaining.")

    # Success: activate user
    pending_user = record["pending_user"]
    pending_user["is_verified"] = True
    pending_user["verified_at"] = datetime.utcnow().isoformat() + "Z"
    pending_user["status"] = "active"

    curr_users = load_json("users.json") or users_db
    curr_users = [u for u in curr_users if u.get("email", "").lower() != email]
    curr_users.append(pending_user)
    users_db = curr_users
    save_json("users.json", users_db)

    del pending_verifications[email]
    save_verifications()

    session_token = create_session(pending_user)
    response.set_cookie(key="bc_session_token", value=session_token, samesite="lax", httponly=False)

    # Add notification
    notifications_db.insert(0, {
        "id": f"notif-{uuid.uuid4().hex[:8]}",
        "user_id": pending_user["id"],
        "type": "verification_success",
        "title": "Email Verified Successfully",
        "message": f"Welcome to BharatConnect AI, {pending_user['full_name']}! Your verified traveler account is now active.",
        "read": False,
        "created_at": datetime.utcnow().isoformat() + "Z"
    })
    save_notifications()

    # Admin notification
    try:
        email_service.notify_new_user_registration(
            full_name=pending_user["full_name"],
            email=email,
            country=pending_user.get("country", "Global"),
            registered_at=pending_user.get("created_at")
        )
    except Exception as notify_err:
        print(f"[WARNING] Admin notification failed: {notify_err}")

    safe_user = {
        "id": pending_user["id"],
        "full_name": pending_user["full_name"],
        "email": email,
        "phone": pending_user.get("phone", ""),
        "country": pending_user.get("country", ""),
        "traveler_type": pending_user.get("traveler_type", ""),
        "is_verified": True,
        "email_verified": True
    }

    return {
        "success": True,
        "session_token": session_token,
        "user_id": pending_user["id"],
        "user": safe_user,
        "message": f"Welcome to BharatConnect AI, {pending_user['full_name']}! Your email has been verified successfully."
    }

@app.post("/api/auth/resend-otp")
def resend_otp_endpoint(payload: OTPResendRequest):
    """Resend a 6-digit verification code with 30-second cooldown."""
    email = (payload.email or "").strip().lower()
    if not email or email not in pending_verifications:
        raise HTTPException(status_code=400, detail="No pending verification found for this email address.")

    record = pending_verifications[email]
    try:
        last_sent = datetime.fromisoformat(record["last_sent_at"].replace("Z", ""))
        if datetime.utcnow() - last_sent < timedelta(seconds=30):
            wait_sec = int(30 - (datetime.utcnow() - last_sent).total_seconds())
            raise HTTPException(status_code=429, detail=f"Please wait {wait_sec} seconds before requesting a new code.")
    except (ValueError, TypeError):
        pass

    new_otp = f"{secrets.randbelow(900000) + 100000}"
    record["otp"] = new_otp
    record["otp_code"] = new_otp
    record["expires_at"] = (datetime.utcnow() + timedelta(minutes=10)).isoformat() + "Z"
    record["attempts"] = 0
    record["last_sent_at"] = datetime.utcnow().isoformat() + "Z"
    save_verifications()

    name = record["pending_user"].get("full_name", "Traveler")
    email_service.send_verification_otp(email=email, full_name=name, otp_code=new_otp, expires_minutes=10)

    return {
        "success": True,
        "email": email,
        "expires_in_seconds": 600,
        "message": "A new 6-digit verification code has been dispatched to your email address."
    }

@app.post("/api/auth/forgot-password")
def forgot_password_endpoint(payload: ForgotPasswordRequest):
    """Initiates password reset by sending a 6-digit OTP to the user's email."""
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Please enter your email address.")

    curr_users = load_json("users.json") or users_db
    matched = next((u for u in curr_users if u.get("email", "").lower() == email), None)
    if not matched:
        # Don't leak user enumeration in production, but provide clear message
        raise HTTPException(status_code=404, detail="No registered traveler account found with this email address.")

    otp_code = f"{secrets.randbelow(900000) + 100000}"
    password_resets[email] = {
        "otp": otp_code,
        "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat() + "Z",
        "attempts": 0,
        "user_id": matched["id"],
        "user_name": matched["full_name"]
    }

    email_service.send_password_reset_otp(email=email, full_name=matched["full_name"], otp_code=otp_code, expires_minutes=10)

    return {
        "success": True,
        "email": email,
        "message": "A 6-digit password reset code has been sent to your email address."
    }

@app.post("/api/auth/reset-password")
def reset_password_endpoint(payload: ResetPasswordRequest):
    """Completes password reset using 6-digit OTP."""
    global users_db
    email = (payload.email or "").strip().lower()
    otp = (payload.otp or "").strip()
    new_password = payload.new_password or ""

    if not email or not otp or not new_password:
        raise HTTPException(status_code=400, detail="Please provide email, verification code, and new password.")

    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long.")

    if email not in password_resets:
        raise HTTPException(status_code=400, detail="No active password reset request found for this email. Please request a new code.")

    record = password_resets[email]
    try:
        exp = datetime.fromisoformat(record["expires_at"].replace("Z", ""))
        if datetime.utcnow() > exp:
            raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new code.")
    except (ValueError, TypeError):
        pass

    if record["otp"] != otp:
        record["attempts"] += 1
        if record["attempts"] >= 5:
            del password_resets[email]
            raise HTTPException(status_code=400, detail="Maximum reset attempts exceeded. Please request a new code.")
        raise HTTPException(status_code=400, detail="Invalid verification code. Please check and try again.")

    # Update password in users_db
    curr_users = load_json("users.json") or users_db
    matched = next((u for u in curr_users if u.get("email", "").lower() == email), None)
    if not matched:
        raise HTTPException(status_code=404, detail="User account not found.")

    pwd_hash, salt = hash_password(new_password)
    matched["password_hash"] = pwd_hash
    matched["salt"] = salt
    matched["updated_at"] = datetime.utcnow().isoformat() + "Z"
    save_json("users.json", curr_users)
    users_db = curr_users

    del password_resets[email]

    return {
        "success": True,
        "message": "Password has been successfully reset. You may now sign in with your new password."
    }


@app.post("/api/auth/register")
def register_user(payload: SignupRequest, response: Response, request: Request):
    res_data = process_registration(payload, request=request)
    if "session_token" in res_data:
        response.set_cookie(key="bc_session_token", value=res_data["session_token"], samesite="lax", httponly=False)
    return res_data

@app.post("/api/auth/signup")
def signup_user(payload: SignupRequest, response: Response, request: Request):
    res_data = process_registration(payload, request=request)
    if "session_token" in res_data:
        response.set_cookie(key="bc_session_token", value=res_data["session_token"], samesite="lax", httponly=False)
    return res_data

@app.post("/api/auth/login")
def login_user(payload: LoginRequest, response: Response):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""

    if not email or not password:
        raise HTTPException(status_code=400, detail="Please enter both email and password.")

    current_users = load_json("users.json") or users_db
    matched_user = None
    for u in current_users:
        if u.get("email", "").strip().lower() == email:
            matched_user = u
            break

    if not matched_user:
        raise HTTPException(status_code=401, detail="Invalid email or password. Please try again.")

    stored_hash = matched_user.get("password_hash", "")
    salt = matched_user.get("salt", "")

    if not verify_password(password, stored_hash, salt):
        raise HTTPException(status_code=401, detail="Invalid email or password. Please try again.")

    session_token = create_session(matched_user)
    response.set_cookie(key="bc_session_token", value=session_token, samesite="lax", httponly=False)

    return {
        "success": True,
        "session_token": session_token,
        "user_id": matched_user["id"],
        "full_name": matched_user["full_name"],
        "email": matched_user["email"],
        "phone": matched_user.get("phone", ""),
        "country": matched_user.get("country", "United States"),
        "traveler_type": matched_user.get("traveler_type", "Explorer"),
        "is_verified": matched_user.get("is_verified", True),
        "user": {
            "id": matched_user["id"],
            "full_name": matched_user["full_name"],
            "email": matched_user["email"],
            "phone": matched_user.get("phone", ""),
            "country": matched_user.get("country", "United States"),
            "traveler_type": matched_user.get("traveler_type", "Explorer"),
            "is_verified": matched_user.get("is_verified", True)
        },
        "message": f"Welcome back, {matched_user['full_name']}! Authentication successful."
    }

@app.get("/api/auth/me")
def get_authenticated_user(request: Request, token: Optional[str] = Query(None)):
    sess_token = extract_token_from_request(request, token)
    if not sess_token or sess_token not in active_sessions:
        raise HTTPException(status_code=401, detail="Authentication required. Session is invalid or expired.")
    session_data = active_sessions[sess_token]
    if "expires_at" in session_data:
        try:
            exp = datetime.fromisoformat(session_data["expires_at"].replace("Z", ""))
            if datetime.utcnow() > exp:
                del active_sessions[sess_token]
                save_sessions()
                raise HTTPException(status_code=401, detail="Authentication required. Session is invalid or expired.")
        except (ValueError, TypeError):
            pass

    safe_user = {
        "id": session_data.get("user_id", ""),
        "full_name": session_data.get("full_name", ""),
        "email": session_data.get("email", ""),
        "country": session_data.get("country", "United States"),
        "traveler_type": session_data.get("traveler_type", "Explorer"),
        "is_verified": session_data.get("is_verified", True)
    }
    return {
        "authenticated": True,
        "session": session_data,
        "user": safe_user
    }

@app.post("/api/auth/logout")
def logout_user(request: Request, response: Response, token: Optional[str] = Query(None), body: Optional[dict] = Body(None)):
    body_token = body.get("token") if isinstance(body, dict) else None
    sess_token = token or body_token or extract_token_from_request(request, None)
    if sess_token and sess_token in active_sessions:
        del active_sessions[sess_token]
        save_sessions()
    response.delete_cookie(key="bc_session_token")
    return {"success": True, "message": "Logged out successfully."}

# ========================================================
# Profile & Account Settings APIs
# ========================================================
@app.get("/api/user/profile")
def get_user_profile(request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    curr_users = load_json("users.json") or users_db
    user = next((u for u in curr_users if u.get("id") == session["user_id"]), None)
    
    profile_data = {
        "id": user.get("id") if user else session.get("user_id"),
        "full_name": user.get("full_name") if user else session.get("full_name", "Traveler"),
        "email": user.get("email") if user else session.get("email"),
        "phone": user.get("phone", "") if user else "",
        "country": user.get("country", "Global") if user else session.get("country", "Global"),
        "traveler_type": user.get("traveler_type", "Explorer") if user else session.get("traveler_type", "Explorer"),
        "is_verified": user.get("is_verified", True) if user else session.get("is_verified", True),
        "verified_at": user.get("verified_at") if user else None,
        "travel_preferences": user.get("travel_preferences", {
            "style": "Cultural Immersion",
            "interests": ["Heritage", "Culinary", "Local Crafts"],
            "budget_tier": "Standard",
            "languages": ["English"],
            "emergency_contact": {"name": "", "phone": ""},
            "bio": ""
        }) if user else {
            "style": "Cultural Immersion",
            "interests": ["Heritage", "Culinary", "Local Crafts"],
            "budget_tier": "Standard",
            "languages": ["English"],
            "emergency_contact": {"name": "", "phone": ""},
            "bio": ""
        },
        "created_at": user.get("created_at") if user else None
    }
    
    return {
        "success": True,
        "user": profile_data,
        **profile_data
    }

@app.put("/api/user/profile")
def update_user_profile(payload: ProfileUpdateRequest, request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    global users_db
    curr_users = load_json("users.json") or users_db
    user = next((u for u in curr_users if u.get("id") == session["user_id"]), None)
    if not user:
        raise HTTPException(status_code=404, detail="User record not found.")

    if payload.full_name is not None:
        user["full_name"] = payload.full_name.strip()
        session["full_name"] = user["full_name"]
    if payload.phone is not None:
        user["phone"] = payload.phone.strip()
    if payload.country is not None:
        user["country"] = payload.country.strip()
        session["country"] = user["country"]
    if payload.traveler_type is not None:
        user["traveler_type"] = payload.traveler_type.strip()
        session["traveler_type"] = user["traveler_type"]

    prefs = user.setdefault("travel_preferences", {})
    if payload.bio is not None:
        prefs["bio"] = payload.bio.strip()
    if payload.travel_style is not None:
        prefs["style"] = payload.travel_style.strip()
    if payload.interests is not None:
        prefs["interests"] = payload.interests
    if payload.budget_tier is not None:
        prefs["budget_tier"] = payload.budget_tier
    if payload.languages is not None:
        prefs["languages"] = payload.languages
    if payload.dietary is not None:
        prefs["dietary"] = payload.dietary

    em_contact = prefs.setdefault("emergency_contact", {})
    if payload.emergency_contact_name is not None:
        em_contact["name"] = payload.emergency_contact_name.strip()
    if payload.emergency_contact_phone is not None:
        em_contact["phone"] = payload.emergency_contact_phone.strip()

    user["updated_at"] = datetime.utcnow().isoformat() + "Z"
    save_json("users.json", curr_users)
    users_db = curr_users
    save_sessions()

    em_name = prefs.get("emergency_contact", {}).get("name", "")
    em_phone = prefs.get("emergency_contact", {}).get("phone", "")
    bio = prefs.get("bio", "")

    return {
        "success": True,
        "message": "Profile updated successfully.",
        "user": {
            "id": user.get("id"),
            "full_name": user.get("full_name"),
            "email": user.get("email"),
            "phone": user.get("phone"),
            "country": user.get("country"),
            "traveler_type": user.get("traveler_type"),
            "bio": bio,
            "emergency_contact_name": em_name,
            "emergency_contact_phone": em_phone,
            "is_verified": user.get("is_verified", True),
            "travel_preferences": user.get("travel_preferences")
        }
    }

@app.get("/api/user/settings")
def get_user_settings(request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    curr_users = load_json("users.json") or users_db
    user = next((u for u in curr_users if u.get("id") == session["user_id"]), None)
    settings = user.get("settings", {
        "notifications_trip_updates": True,
        "notifications_guide_messages": True,
        "notifications_platform_alerts": True,
        "currency": "USD",
        "language": "English",
        "profile_visibility": "private"
    }) if user else {}
    return {
        "success": True,
        "settings": settings,
        "email": session.get("email"),
        "is_verified": session.get("is_verified", True)
    }

@app.put("/api/user/settings")
def update_user_settings(payload: SettingsUpdateRequest, request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    global users_db
    curr_users = load_json("users.json") or users_db
    user = next((u for u in curr_users if u.get("id") == session["user_id"]), None)
    if not user:
        raise HTTPException(status_code=404, detail="User record not found.")

    # Resolve aliased fields (prefer new short-form over legacy names)
    notif_trip = payload.notif_trip if payload.notif_trip is not None else (payload.notifications_trip_updates if payload.notifications_trip_updates is not None else True)
    notif_guide = payload.notif_guide if payload.notif_guide is not None else (payload.notifications_guide_messages if payload.notifications_guide_messages is not None else True)
    notif_platform = payload.notif_platform if payload.notif_platform is not None else (payload.notifications_platform_alerts if payload.notifications_platform_alerts is not None else True)
    # Resolve currency: prefer preferred_currency over currency
    resolved_currency = payload.preferred_currency or payload.currency or "USD"

    user["settings"] = {
        "notifications_trip_updates": notif_trip,
        "notifications_guide_messages": notif_guide,
        "notifications_platform_alerts": notif_platform,
        "preferred_currency": resolved_currency,
        "currency": resolved_currency,
        "language": payload.language or "English",
        "profile_visibility": payload.profile_visibility or "private"
    }
    save_json("users.json", curr_users)
    users_db = curr_users

    return {
        "success": True,
        "message": "Account settings updated successfully.",
        "settings": user["settings"]
    }

@app.post("/api/user/change-password")
def change_user_password(payload: ChangePasswordRequest, request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    global users_db
    curr_users = load_json("users.json") or users_db
    user = next((u for u in curr_users if u.get("id") == session["user_id"]), None)
    if not user:
        raise HTTPException(status_code=404, detail="User record not found.")

    stored_hash = user.get("password_hash", "")
    salt = user.get("salt", "")
    if not verify_password(payload.current_password, stored_hash, salt):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long.")

    new_hash, new_salt = hash_password(payload.new_password)
    user["password_hash"] = new_hash
    user["salt"] = new_salt
    user["updated_at"] = datetime.utcnow().isoformat() + "Z"
    save_json("users.json", curr_users)
    users_db = curr_users

    return {"success": True, "message": "Password changed successfully."}

# ========================================================
# Notifications & Support Configuration APIs
# ========================================================
@app.get("/api/notifications")
def get_user_notifications(request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    user_id = session.get("user_id")
    user_notifs = [n for n in notifications_db if n.get("user_id") in (user_id, "all", None)]
    if not user_notifs:
        # Default starter notification
        user_notifs = [
            {
                "id": "notif-welcome-1",
                "user_id": user_id,
                "type": "welcome",
                "title": "Welcome to BharatConnect AI",
                "message": "Your international India travel account is active. Explore verified local guides and plan with AI.",
                "read": False,
                "created_at": datetime.utcnow().isoformat() + "Z"
            }
        ]
    return {"success": True, "notifications": user_notifs, "unread_count": len([n for n in user_notifs if not n.get("read")])}

@app.post("/api/notifications/mark-read")
def mark_notification_read(notification_id: str = Body(..., embed=True), request: Request = None):
    for n in notifications_db:
        if n.get("id") == notification_id:
            n["read"] = True
            save_notifications()
            return {"success": True, "notification_id": notification_id}
    return {"success": True, "notification_id": notification_id}

@app.get("/api/support/config")
def get_support_config():
    return {
        "success": True,
        "support_phone": "+91 11-2336-5358",
        "ministry_of_tourism_helpline": "1363",
        "ministry_tourism_helpline": "1363",
        "ministry_of_tourism_tollfree": "1800-11-1363",
        "all_india_emergency": "112",
        "medical_emergency": "108",
        "support_email": "support@bharatconnect.ai",
        "whatsapp_concierge": "+91 98290 14820",
        "operational_hours": "24 Hours / 7 Days a Week",
        "supported_languages": ["English", "Hindi", "French", "German", "Spanish", "Japanese"]
    }

# AI Trip Planner Engine
def build_10_diverse_trip_options(req: TripPlannerRequest, days: int) -> list:
    guides = load_json("guides.json") or guides_db
    exps = load_json("experiences.json") or experiences_db

    archetypes = [
        {
            "opt_id": "opt-1",
            "title": f"{days}-Day Golden Triangle & Imperial Mughal Splendor",
            "destination": "New Delhi, Agra & Jaipur",
            "tagline": "Classic first-time exploration across monumental forts, Taj Mahal sunrise & Rajasthani palaces.",
            "hero_image": "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1200&auto=format&fit=crop&q=80",
            "theme": "Dynastic Monuments, Living Heritage & Royal Palaces",
            "cities": ["New Delhi", "Agra", "Jaipur"],
            "guide": guides[3] if len(guides) > 3 else (guides[0] if guides else None),
            "experiences": [exps[1], exps[0]] if len(exps) > 1 else exps,
            "best_for": "First-Time Visitors, History Enthusiasts & Photographers",
            "style": req.travel_style or "Cultural & Heritage",
            "budget_multiplier": 1.0,
            "day_base": [
                {"city": "New Delhi", "title": "Old Delhi Walled City & Spice Bazaar Rickshaw", "morning": "VIP airport greeting, transfer to The Imperial. Afternoon rickshaw glide through Shahjahanabad.", "afternoon": "Guided survey of Jama Masjid courtyard and Asia's largest spice market.", "evening": "Sunset at Humayun's Persian Garden Tomb; welcome tandoor dinner.", "stay": "The Imperial, New Delhi", "meals": "Mughlai specialties & artisan tandoor", "transit": "Private Luxury Sedan"},
                {"city": "Agra", "title": "Gatimaan Express & Twilight at Taj Mahal", "morning": "High-speed rail to Agra in executive class. Check-in to The Oberoi Amarvilas.", "afternoon": "Explore red sandstone bastions of Agra Fort.", "evening": "Sunset reflections of Taj Mahal from Mehtab Bagh riverside gardens.", "stay": "The Oberoi Amarvilas, Agra", "meals": "Agra Petha & royal dum biryani", "transit": "High-Speed Rail & Chauffeur"},
                {"city": "Jaipur", "title": "Taj Mahal Sunrise & Amber Fortress Bastions", "morning": "Dawn entry to Taj Mahal in quiet contemplation before crowds.", "afternoon": "Scenic drive to Pink City of Jaipur via Chand Baori stepwell.", "evening": "Check-in to 19th-century Samode Haveli; saffron tea in courtyards.", "stay": "Samode Haveli, Jaipur", "meals": "Rajasthani thali & saffron kulfi", "transit": "Private AC Coach"},
                {"city": "Jaipur", "title": "Amber Fort Sheesh Mahal & Johari Gem Cutters", "morning": "Ascend Amber Fort; marvel at mirror-inlaid halls & water cisterns.", "afternoon": "Private access to City Palace royal quarters & UNESCO Jantar Mantar.", "evening": "Walk the Johari bazaar with 4th generation gem artisans.", "stay": "Samode Haveli, Jaipur", "meals": "Dal Baati Churma & courtyard supper", "transit": "Private Chauffeur"},
                {"city": "Jaipur", "title": "Bagru Natural Dye Block Printing & Return", "morning": "Excursion to Bagru village; hand-block printing masterclass with Master Chippas.", "afternoon": "Blue pottery design house introductions for international collectors.", "evening": "Vande Bharat Express return to New Delhi DEL Airport for departure.", "stay": "Departure Lounge / Return", "meals": "Artisan farewell tasting lunch", "transit": "High-Speed Rail to Delhi"}
            ]
        },
        {
            "opt_id": "opt-2",
            "title": f"{days}-Day Emerald Backwaters & Spice Highlands",
            "destination": "Kochi, Munnar & Alleppey",
            "tagline": "Private solar houseboats, misty organic tea estates & authentic Ayurvedic rejuvenation.",
            "hero_image": "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1200&auto=format&fit=crop&q=80",
            "theme": "Serene Waterways, High Tea Mountains & Holistic Wellness",
            "cities": ["Kochi", "Munnar", "Alleppey"],
            "guide": guides[1] if len(guides) > 1 else (guides[0] if guides else None),
            "experiences": [exps[2], exps[0]] if len(exps) > 2 else exps,
            "best_for": "Couples, Wellness Seekers & Nature Lovers",
            "style": "Ayurveda & Nature Retreat",
            "budget_multiplier": 1.05,
            "day_base": [
                {"city": "Kochi", "title": "Historic Fort Kochi & Kathakali Classical Drama", "morning": "Airport greeting; check-in to Brunton Boatyard on the Arabian Sea.", "afternoon": "Mattancherry Dutch Palace, Jewish Synagogue & spice warehousing lanes.", "evening": "Sunset over Chinese Fishing Nets; evening Kathakali drama.", "stay": "Brunton Boatyard, Fort Kochi", "meals": "Malabar seafood & appam stew", "transit": "Private AC Chauffeur"},
                {"city": "Munnar", "title": "Ascent to Cloud-Kissed Tea Mountains", "morning": "Scenic drive winding through misty waterfalls of the Western Ghats.", "afternoon": "Private tea estate walking flight; hands-on orthodox leaf plucking.", "evening": "Fireplace herbal tea overlooking Anamudi Mountain peak.", "stay": "Windermere Estate, Munnar", "meals": "Mountain trout & warm parottas", "transit": "Scenic Mountain Chauffeur"},
                {"city": "Munnar", "title": "Eravikulam Wildlife Safari & Ayurvedic Spa", "morning": "Early safari to observe the endangered Nilgiri Tahr mountain goat.", "afternoon": "Cardamom & vanilla plantation tour with certified naturalist.", "evening": "Full Ayurvedic Abhyanga massage using estate-pressed sesame oils.", "stay": "Tea Valley Eco-Lodge", "meals": "Kerala red rice & moru curry", "transit": "4x4 Jeep transfer"},
                {"city": "Alleppey", "title": "Private Solar Houseboat on Silent Canals", "morning": "Descend to the Venice of the East; embark upon private Kettuvallam.", "afternoon": "Slow glide through palm-fringed channels; coir spinning village visit.", "evening": "Anchor in Punnamada Lake under starlit skies; candlelit chef dinner.", "stay": "Eco-Luxury Houseboat Suite", "meals": "Karimeen Pollichathu & tapioca", "transit": "Private Chauffeur to Jetty"},
                {"city": "Marari", "title": "Marari Golden Sands & International Departure", "morning": "Sunrise kayak through lotus lagoons; peaceful golden sand coastline.", "afternoon": "Late checkout and transfer to Cochin International Airport (COK).", "evening": "International departure flight back home.", "stay": "Departure Flight / Return", "meals": "Fresh coastal farewell banquet", "transit": "Private Airport Chauffeur"}
            ]
        },
        {
            "opt_id": "opt-3",
            "title": f"{days}-Day Sacred Ganges & Living Antiquity Odyssey",
            "destination": "Varanasi, Sarnath & Prayagraj",
            "tagline": "Dawn boat cruises along ancient ghats, classical sitar ragas & Silk Route handlooms.",
            "hero_image": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=1200&auto=format&fit=crop&q=80",
            "theme": "Sacred River Rhythms, Vedic Philosophy & Sarnath Sanctuaries",
            "cities": ["Varanasi", "Sarnath", "Prayagraj"],
            "guide": guides[2] if len(guides) > 2 else (guides[0] if guides else None),
            "experiences": [exps[3], exps[0]] if len(exps) > 3 else exps,
            "best_for": "Spiritual Seekers, Writers & Philosophy Travelers",
            "style": "Spiritual & Immersive",
            "budget_multiplier": 0.92,
            "day_base": [
                {"city": "Varanasi", "title": "Arrival in Kashi & Grand Ganga Aarti", "morning": "VIP airport reception; check-in to historic BrijRama Palace on the Ganges.", "afternoon": "Orientation walk through Vishwanath Gali; taste creamy Banarasi lassi.", "evening": "Reserved front-row boat seating for Dashashwamedh Ghat Ganga Aarti.", "stay": "BrijRama Palace, Varanasi", "meals": "Banarasi Tamatar Chaat & Saffron Thali", "transit": "Private Boat & Sedan"},
                {"city": "Varanasi", "title": "Subah-e-Banaras Sunrise Boat & Sitar Maestro", "morning": "Silent 5:30 AM dawn boat cruise witnessing morning prayers & mantras.", "afternoon": "Private sitar & tabla masterclass in Kabir Chaura music district.", "evening": "Manikarnika Ghat philosophical survey with Vedic scholar.", "stay": "BrijRama Palace Heritage Suite", "meals": "Kachori Jalebi & Sattvic feast", "transit": "Private Wooden Boat"},
                {"city": "Sarnath", "title": "Buddha's First Sermon & Royal Silk Looms", "morning": "Drive to Sarnath Deer Park and Dhamek Stupa where Buddha first taught.", "afternoon": "Private visit to master Banarasi silk weavers; gold zari brocade demonstrations.", "evening": "Twilight philosophical dialogue over spiced tea with resident monk.", "stay": "BrijRama Palace", "meals": "Awadhi vegetarian delicacies", "transit": "Private AC Sedan"},
                {"city": "Prayagraj", "title": "Triveni Sangam Confluence & Anand Bhavan", "morning": "Excursion to holy Triveni Sangam where three sacred rivers unite.", "afternoon": "Survey historic Anand Bhavan and Mughal Allahabad Fort.", "evening": "Return to Varanasi for rooftop flute concert overlooking Ganges.", "stay": "BrijRama Palace", "meals": "Allahabadi gujiya & riverbank dinner", "transit": "Private Chauffeur (2 hrs)"},
                {"city": "Varanasi", "title": "Morning Yoga on the Ghats & Departure", "morning": "Gentle dawn Pranayama meditation beside the holy river.", "afternoon": "Curated shopping for hand-carved sandalwood and silk stoles.", "evening": "Transfer to Varanasi Airport (VNS) for onward international flight.", "stay": "Departure / Return", "meals": "Organic vegetarian farewell lunch", "transit": "Private Airport Sedan"}
            ]
        },
        {
            "opt_id": "opt-4",
            "title": f"{days}-Day Royal Fortresses & Thar Desert Palaces",
            "destination": "Jaipur, Jodhpur & Udaipur",
            "tagline": "Golden sandstone bastions, candlelit Lake Pichola palaces & royal Rajasthani hospitality.",
            "hero_image": "https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?w=1200&auto=format&fit=crop&q=80",
            "theme": "Regal Architecture, Desert Caravans & Lakeside Elegance",
            "cities": ["Jaipur", "Jodhpur", "Udaipur"],
            "guide": guides[0] if guides else None,
            "experiences": [exps[0], exps[1]] if len(exps) > 1 else exps,
            "best_for": "Luxury Travelers, Architecture Buffs & Heritage Seekers",
            "style": "Royal Luxury & Heritage",
            "budget_multiplier": 1.15,
            "day_base": [
                {"city": "Jaipur", "title": "Pink City Palaces & Amber Fort Mirrors", "morning": "Arrival at Jaipur Airport; check-in to Rambagh Palace.", "afternoon": "Ascend Amber Fort; City Palace private museum tour.", "evening": "Dinner under starlit courtyard with classical Rajasthani folk music.", "stay": "Rambagh Palace, Jaipur", "meals": "Royal Rajputana cuisine & smoked meats", "transit": "Private Chauffeur"},
                {"city": "Jodhpur", "title": "The Blue City & Imposing Mehrangarh Fort", "morning": "Scenic drive to Jodhpur; check-in to Umaid Bhawan Palace.", "afternoon": "Private walk through towering Mehrangarh Fort museum.", "evening": "Walk the cobalt-blue painted lanes of Navchokiya; spice tasting.", "stay": "RAAS Jodhpur or Umaid Bhawan", "meals": "Mirchi Bada & Ker Sangri banquet", "transit": "Private AC Coach (5 hrs)"},
                {"city": "Ranakpur", "title": "1,444 Marble Pillars & Descent to Udaipur", "morning": "Drive to Udaipur via 15th-century Ranakpur Jain Marble Temple.", "afternoon": "Arrive in romantic City of Lakes; private boat to Taj Lake Palace.", "evening": "Sunset cruise on Lake Pichola with views of Jag Mandir.", "stay": "Taj Lake Palace, Udaipur", "meals": "Lakeside dining & Mewari specialties", "transit": "Private Chauffeur with stops"},
                {"city": "Udaipur", "title": "City Palace Courtyards & Miniature Painting", "morning": "Explore largest palace complex in Rajasthan overlooking the lake.", "afternoon": "Hands-on Rajput miniature painting masterclass with master artist.", "evening": "Lantern-lit rooftop dinner beside the illuminated waters.", "stay": "Taj Lake Palace, Udaipur", "meals": "Mewari thali & saffron desserts", "transit": "Private Sedan & Boat"},
                {"city": "Udaipur", "title": "Artisan Textile Walk & Farewell Flight", "morning": "Morning stroll through traditional brassware and textile bazaars.", "afternoon": "Late checkout and transfer to Maharana Pratap Airport (UDR).", "evening": "Connecting flight to Delhi/Mumbai for international departure.", "stay": "Departure / Return", "meals": "Farewell garden lunch", "transit": "Private Airport Transfer"}
            ]
        },
        {
            "opt_id": "opt-5",
            "title": f"{days}-Day Himalayan Serenity & Yoga Sanctuary",
            "destination": "Rishikesh, Haridwar & Dharamshala",
            "tagline": "Pure mountain air, holy Ganga river rafting, Tibetan monasteries & restorative yoga.",
            "hero_image": "https://images.unsplash.com/photo-1544717305-2782549b5136?w=1200&auto=format&fit=crop&q=80",
            "theme": "Mindfulness, Alpine Forests & Himalayan Foothills",
            "cities": ["Rishikesh", "Haridwar", "Dharamshala"],
            "guide": guides[3] if len(guides) > 3 else (guides[0] if guides else None),
            "experiences": [exps[3], exps[2]] if len(exps) > 3 else exps,
            "best_for": "Wellness Seekers, Trekking & Spiritual Solitude",
            "style": "Yoga & Mountain Escape",
            "budget_multiplier": 0.88,
            "day_base": [
                {"city": "Rishikesh", "title": "Yoga Capital of the World & Holy Ganga", "morning": "Fly into Dehradun DED; transfer to luxury foothills wellness estate.", "afternoon": "Gentle introductory Hatha yoga and guided breathwork session.", "evening": "Triveni Ghat evening Aarti with acoustic Vedic chanting.", "stay": "Ananda in the Himalayas / Aloha on the Ganges", "meals": "Organic Sattvic cuisine & herbal infusions", "transit": "Private Mountain Sedan"},
                {"city": "Rishikesh", "title": "Sacred Beatle Ashram & Himalayan Waterfalls", "morning": "Sunrise meditation at riverside; explore Maharishi Mahesh Yogi ashram.", "afternoon": "Guided gentle trek to hidden Neer Garh mountain waterfalls.", "evening": "Sound bowl healing and Ayurvedic pulse diagnosis consultation.", "stay": "Ananda in the Himalayas", "meals": "Farm-to-table Himalayan thali", "transit": "Private 4x4 Chauffeur"},
                {"city": "Haridwar", "title": "Har Ki Pauri Aarti & Ancient Temples", "morning": "Visit ancient Mansa Devi hilltop temple via scenic cable car.", "afternoon": "Walk the historic bazaar lanes of Haridwar sampling hot jalebis.", "evening": "Witness the spectacle of Har Ki Pauri illuminated by floating diyas.", "stay": "Haveli Hari Ganga, Haridwar", "meals": "Traditional Garhwali mountain meals", "transit": "Private AC Sedan"},
                {"city": "Dharamshala", "title": "Little Lhasa & Tibetan Monastery Walks", "morning": "Scenic flight/drive to Dharamshala in the shadow of Dhauladhar peaks.", "afternoon": "Visit Tsuglagkhang Complex, official residence of the Dalai Lama.", "evening": "Peaceful walk along mountain cedar trails in McLeod Ganj.", "stay": "Fortune Park Moksha, McLeod Ganj", "meals": "Tibetan momos, thukpa & butter tea", "transit": "Mountain Chauffeur"},
                {"city": "Dharamshala", "title": "Kangra Tea Estate & Departure", "morning": "Morning tea tasting at organic Kangra Valley green tea gardens.", "afternoon": "Transfer to Gaggal Airport (DHM) for connection to Delhi DEL.", "evening": "International departure flight home.", "stay": "Departure / Return", "meals": "Farewell mountain breakfast", "transit": "Airport Transfer"}
            ]
        },
        {
            "opt_id": "opt-6",
            "title": f"{days}-Day Coastal Heritage & Sunlit Sands",
            "destination": "Goa & UNESCO Hampi Ruins",
            "tagline": "Portuguese colonial villas, UNESCO Vijayanagara boulder temples & Arabian Sea sunsets.",
            "hero_image": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1200&auto=format&fit=crop&q=80",
            "theme": "Colonial Architecture, Ancient Stone Empires & Coastal Serenity",
            "cities": ["North Goa", "South Goa", "Hampi"],
            "guide": guides[1] if len(guides) > 1 else (guides[0] if guides else None),
            "experiences": [exps[0], exps[2]] if len(exps) > 2 else exps,
            "best_for": "Beach Enthusiasts, Archaeology Buffs & Relaxed Travelers",
            "style": "Coastal & Historical",
            "budget_multiplier": 0.98,
            "day_base": [
                {"city": "Goa", "title": "Fontainhas Latin Quarter & Portuguese Mansions", "morning": "Arrival at GOX/GOI Airport; check-in to restored 18th-century heritage villa.", "afternoon": "Guided walk through colorful Fontainhas heritage quarter in Panaji.", "evening": "Sunset cruise on Mandovi River with live Goan fado music.", "stay": "Ahilya by the Sea / Postcard Cuelim", "meals": "Goan Fish Curry & Bebinca dessert", "transit": "Private AC Chauffeur"},
                {"city": "Goa", "title": "Old Goa UNESCO Basilicas & Organic Spice Farm", "morning": "Survey Basilica of Bom Jesus and majestic Se Cathedral.", "afternoon": "Traditional organic spice farm tour; authentic clay-pot lunch.", "evening": "Relax on pristine white sands of South Goa coast.", "stay": "The Leela Goa / Alila Diwa", "meals": "Organic spice plantation lunch", "transit": "Private Chauffeur"},
                {"city": "Hampi", "title": "Vijayanagara Imperial Ruins & Boulder Landscapes", "morning": "Morning scenic transfer to UNESCO World Heritage site of Hampi.", "afternoon": "Explore majestic Virupaksha Temple and monolithic stone shrines.", "evening": "Sunset from Hemakuta Hill overlooking miles of ancient temple spires.", "stay": "Evolve Back Kamalapura Palace, Hampi", "meals": "Royal South Indian thali", "transit": "Private AC Coach (5 hrs)"},
                {"city": "Hampi", "title": "Vittala Temple Stone Chariot & Tungabhadra Coracle", "morning": "Marvel at iconic musical pillars and Stone Chariot of Vittala Temple.", "afternoon": "Coracle circular boat ride on holy Tungabhadra River.", "evening": "Zen twilight walk through Queen's Bath and Lotus Mahal.", "stay": "Evolve Back Kamalapura Palace", "meals": "Artisan Karnataka cuisine", "transit": "Private Chauffeur & Coracle"},
                {"city": "Goa / Return", "title": "Coastal Farewell & International Connection", "morning": "Return transfer to Goa; last-minute cashew & spice shopping.", "afternoon": "Late checkout and transfer to Goa International Airport.", "evening": "Departure flight with unforgettable memories.", "stay": "Departure Flight", "meals": "Coastal garden farewell lunch", "transit": "Airport Transfer"}
            ]
        },
        {
            "opt_id": "opt-7",
            "title": f"{days}-Day Dravidian Temple & Classical Arts Discovery",
            "destination": "Chennai, Madurai & Thanjavur",
            "tagline": "Towering gopuram gateways, Bronze Chola sculptures & millennia-old Carnatic traditions.",
            "hero_image": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1200&auto=format&fit=crop&q=80",
            "theme": "Sacred Architecture, Classical Music & Living Traditions",
            "cities": ["Chennai", "Mahabalipuram", "Thanjavur", "Madurai"],
            "guide": guides[1] if len(guides) > 1 else (guides[0] if guides else None),
            "experiences": [exps[2], exps[0]] if len(exps) > 2 else exps,
            "best_for": "Culture Connoisseurs, Sculptors & Anthropologists",
            "style": "Living Heritage & Art",
            "budget_multiplier": 0.95,
            "day_base": [
                {"city": "Chennai", "title": "Coromandel Coast & Mahabalipuram Rock Reliefs", "morning": "Arrival at Chennai MAA Airport; transfer along scenic East Coast Road.", "afternoon": "Explore UNESCO Shore Temple and Arjuna's Penance monolithic rock carvings.", "evening": "Traditional South Indian filter coffee in beachside heritage pavilion.", "stay": "Taj Fisherman's Cove Resort", "meals": "Fresh Chettinad specialties", "transit": "Private AC Sedan"},
                {"city": "Thanjavur", "title": "Great Living Chola Temples & Lost Wax Bronzes", "morning": "Drive to Thanjavur; check-in to heritage boutique estate.", "afternoon": "Survey 1,000-year-old Brihadisvara Temple engineering marvel.", "evening": "Meet 5th generation master bronze sculptors using lost-wax casting.", "stay": "Svatma Heritage Estate, Thanjavur", "meals": "Traditional banana leaf feast", "transit": "Private Chauffeur (4.5 hrs)"},
                {"city": "Chettinad", "title": "Palatial Mansions & Legendary Cuisine", "morning": "Drive through Chettinad merchant kingdom with 10,000 royal mansions.", "afternoon": "Tour thousand-windowed heritage haveli; learn Chettinad spice blending.", "evening": "Handmade Athangudi tile-making demonstration.", "stay": "Chidambara Vilas / Visalam", "meals": "Authentic 18-dish Chettinad dinner", "transit": "Private AC Sedan"},
                {"city": "Madurai", "title": "Meenakshi Amman Temple & Night Ceremony", "morning": "Transfer to ancient Athens of the East: Madurai.", "afternoon": "Survey 14 towering gopuram towers of Meenakshi Temple complex.", "evening": "Witness vibrant nighttime chariot ceremony of Lord Shiva & Goddess Meenakshi.", "stay": "Heritage Madurai", "meals": "Madurai Kari Dosa & Jigarthanda", "transit": "Private Chauffeur"},
                {"city": "Madurai", "title": "Jasmine Flower Market & Departure", "morning": "Sunrise visit to bustling Madurai GI-tagged jasmine wholesale market.", "afternoon": "Transfer to Madurai Airport (IXM) for connection to Chennai/Delhi.", "evening": "International departure flight.", "stay": "Departure / Return", "meals": "Artisan farewell breakfast", "transit": "Airport Transfer"}
            ]
        },
        {
            "opt_id": "opt-8",
            "title": f"{days}-Day Wild India: Royal Bengal Tiger Safari",
            "destination": "Ranthambore & Bandhavgarh National Parks",
            "tagline": "Open-top 4x4 safaris, ancient jungle ruins, wild leopards & magnificent apex predators.",
            "hero_image": "https://images.unsplash.com/photo-1577971132997-c10be9372519?w=1200&auto=format&fit=crop&q=80",
            "theme": "Apex Wildlife, Conservation Ecology & Jungle Fortresses",
            "cities": ["Sawai Madhopur", "Ranthambore", "Bandhavgarh"],
            "guide": guides[0] if guides else None,
            "experiences": [exps[0], exps[1]] if len(exps) > 1 else exps,
            "best_for": "Wildlife Enthusiasts, Photographers & Families",
            "style": "Eco-Wildlife Expedition",
            "budget_multiplier": 1.25,
            "day_base": [
                {"city": "Ranthambore", "title": "Arrival in Royal Hunting Grounds", "morning": "Executive train from Delhi to Sawai Madhopur; check-in to jungle lodge.", "afternoon": "Orientation with senior wildlife biologist; safety and track reading briefing.", "evening": "Bonfire discourse on project tiger conservation under the stars.", "stay": "The Oberoi Vanyavilas / Aman-i-Khás", "meals": "Organic farm-to-table wilderness dinner", "transit": "High-Speed Rail & 4x4 Jeep"},
                {"city": "Ranthambore", "title": "Dawn & Twilight Tiger Tracking Safaris", "morning": "Exclusive dawn 4x4 safari through Zone 3 lake territory; track tiger pugmarks.", "afternoon": "Survey 10th-century Ranthambore Fort looming high above the forest.", "evening": "Afternoon safari targeting marsh crocodiles, sloth bears & leopards.", "stay": "The Oberoi Vanyavilas", "meals": "Jungle brunch & Rajasthani grill", "transit": "Custom Open 4x4 Safari Jeep"},
                {"city": "Ranthambore", "title": "Deep Forest Habitats & Village Craft Walk", "morning": "Third safari exploring rocky ravines and banyan tree watering holes.", "afternoon": "Visit Dastkar village women's cooperative preserving tribal embroidery.", "evening": "Nature photography editing workshop with resident naturalist.", "stay": "The Oberoi Vanyavilas", "meals": "Campfire feast & smoked curries", "transit": "Custom 4x4 Safari Jeep"},
                {"city": "Bandhavgarh", "title": "Highest Tiger Density Valley Expedition", "morning": "Scenic transfer to legendary Bandhavgarh National Park.", "afternoon": "Check-in to luxury treehouse retreat; listen to evening alarm calls.", "evening": "Stargazing and night sky telescope session from private deck.", "stay": "Mahua Kothi (Taj Safari)", "meals": "Central Indian tribal thali", "transit": "Private Luxury Transfer"},
                {"city": "Departure", "title": "Final Morning Safari & Return Transfer", "morning": "Final dawn safari tracking cubs across sal forest grasslands.", "afternoon": "Transfer to Jabalpur Airport (JLR) for flight to Delhi.", "evening": "Connecting international flight back home.", "stay": "Departure / Return", "meals": "Bush farewell breakfast", "transit": "Airport Transfer"}
            ]
        },
        {
            "opt_id": "opt-9",
            "title": f"{days}-Day Kashmir Paradise & Himalayan Meadows",
            "destination": "Srinagar, Gulmarg & Pahalgam",
            "tagline": "Carved walnut houseboats on Dal Lake, alpine gondolas & saffron valleys.",
            "hero_image": "https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=1200&auto=format&fit=crop&q=80",
            "theme": "Floating Flower Markets, Snow Peaks & Kashmiri Hospitality",
            "cities": ["Srinagar", "Gulmarg", "Pahalgam"],
            "guide": guides[3] if len(guides) > 3 else (guides[0] if guides else None),
            "experiences": [exps[3], exps[1]] if len(exps) > 3 else exps,
            "best_for": "Nature Enthusiasts, Romantic Escapes & Scenic Splendor",
            "style": "Alpine & Luxury Retreat",
            "budget_multiplier": 1.10,
            "day_base": [
                {"city": "Srinagar", "title": "Dal Lake Heritage Houseboat & Shikara Ride", "morning": "Fly into Srinagar SXR; VIP transfer to cedarwood luxury houseboat on Nigeen Lake.", "afternoon": "Private Shikara boat glide through floating lotus gardens.", "evening": "Traditional Kashmiri Kahwa tea ceremony with saffron & crushed almonds.", "stay": "Sukoon Luxury Houseboat / Vivanta Dal View", "meals": "Traditional Wazwan multi-course dinner", "transit": "Private Shikara & Sedan"},
                {"city": "Srinagar", "title": "Floating Vegetable Market & Mughal Terraced Gardens", "morning": "5:00 AM silent Shikara through world-famous floating vegetable wholesale market.", "afternoon": "Walk Shalimar Bagh & Nishat Bagh terraced gardens designed by Emperor Jahangir.", "evening": "Visit master Pashmina shawl weavers & papier-mâché artisans.", "stay": "Sukoon Luxury Houseboat", "meals": "Rogan Josh & Dum Aloo feast", "transit": "Private Shikara & Chauffeur"},
                {"city": "Gulmarg", "title": "Meadow of Flowers & Highest Alpine Gondola", "morning": "Drive to Gulmarg; board world's highest cable car to Mount Apharwat (13,780 ft).", "afternoon": "Panoramic views over the Pir Panjal mountain range; alpine pine forest walk.", "evening": "Warm cider by the fireplace in high-altitude timber boutique lodge.", "stay": "The Khyber Himalayan Resort & Spa", "meals": "High-altitude gourmet supper", "transit": "Private Mountain 4x4 (2 hrs)"},
                {"city": "Pahalgam", "title": "Valley of Shepherds & Lidder River Cascades", "morning": "Scenic drive through Pampore saffron fields toward Betaab Valley.", "afternoon": "Horseback ride along crystal-clear glacial streams of Aru Valley.", "evening": "Riverside campfire with acoustic Kashmiri santoor melodies.", "stay": "Pahalgam Hotel / Pine N Peak", "meals": "Kashmiri Gushtaba & saffron pilaf", "transit": "Private Scenic Chauffeur"},
                {"city": "Srinagar / Return", "title": "Saffron Harvest Walk & Farewell Flight", "morning": "Shop for pure Kashmiri saffron, dried walnuts & hand-knotted silk carpets.", "afternoon": "Transfer to Srinagar Airport (SXR) for Delhi DEL connection.", "evening": "International flight back home.", "stay": "Departure / Return", "meals": "Artisan farewell Kashmiri brunch", "transit": "Airport Chauffeur"}
            ]
        },
        {
            "opt_id": "opt-10",
            "title": f"{days}-Day Eastern Splendor: Tea Estates & Kolkata Heritage",
            "destination": "Kolkata, Darjeeling & Gangtok",
            "tagline": "Colonial grand architecture, UNESCO Toy Train & sunrise over Kanchenjunga.",
            "hero_image": "https://images.unsplash.com/photo-1544717302-de2939b7ef71?w=1200&auto=format&fit=crop&q=80",
            "theme": "Literary Legacies, Champagne of Teas & Monastic Chants",
            "cities": ["Kolkata", "Darjeeling", "Gangtok"],
            "guide": guides[2] if len(guides) > 2 else (guides[0] if guides else None),
            "experiences": [exps[3], exps[0]] if len(exps) > 3 else exps,
            "best_for": "Art & Literature Buffs, Tea Connoisseurs & Explorers",
            "style": "Colonial & Monastic Discovery",
            "budget_multiplier": 0.96,
            "day_base": [
                {"city": "Kolkata", "title": "City of Joy, Victoria Memorial & Coffee House", "morning": "Arrival at Kolkata CCU; check-in to historic grand The Oberoi Grand.", "afternoon": "Survey marble splendor of Victoria Memorial & iconic Howrah Bridge.", "evening": "College Street book market stroll & adda discussion at Indian Coffee House.", "stay": "The Oberoi Grand, Kolkata", "meals": "Kolkata Biryani, Kosha Mangsho & Rosogolla", "transit": "Private AC Sedan"},
                {"city": "Darjeeling", "title": "Heritage Toy Train & Himalayan Mountain Views", "morning": "Flight to Bagdogra; scenic mountain drive to Darjeeling (6,700 ft).", "afternoon": "Board the UNESCO World Heritage Himalayan Railway Steam Toy Train.", "evening": "High tea at Glenary's bakery overlooking misty mountain ridges.", "stay": "Windamere Heritage Hotel / Mayfair", "meals": "Darjeeling First Flush tea & hill thali", "transit": "Scenic Chauffeur & Toy Train"},
                {"city": "Darjeeling", "title": "Tiger Hill Sunrise & Glenburn Tea Masterclass", "morning": "4:00 AM sunrise over Mount Kanchenjunga (world's 3rd highest peak).", "afternoon": "Private estate tour at Glenburn Tea Estate; learn orthodox tea crafting.", "evening": "Visit Himalayan Mountaineering Institute & Tibetan Refugee Center.", "stay": "Glenburn Tea Estate / Windamere", "meals": "Estate-to-table gourmet dining", "transit": "Private 4x4 Mountain Jeep"},
                {"city": "Gangtok", "title": "Sikkim Monasteries & Orchid Sanctuaries", "morning": "Drive across Teesta river into the Himalayan mountain kingdom of Sikkim.", "afternoon": "Visit Rumtek Monastery; witness Buddhist monks in deep debate & horn chanting.", "evening": "Walk the car-free MG Marg promenade; taste authentic steamed momos.", "stay": "The Elgin Nor-Khill, Gangtok", "meals": "Sikkimese Sel Roti & organic delicacies", "transit": "Private AC Mountain Sedan"},
                {"city": "Bagdogra / Return", "title": "Mountain Farewell & International Departure", "morning": "Morning visit to Himalayan Orchidarium; final curated tea purchases.", "afternoon": "Transfer to Bagdogra Airport (IXB) for connection to Delhi DEL/Kolkata.", "evening": "Departure flight back home.", "stay": "Departure / Return", "meals": "Farewell mountain breakfast", "transit": "Airport Transfer"}
            ]
        }
    ]

    # Calculate budgets and day itineraries for all 10 options
    options_output = []
    for arch in archetypes:
        opt_budget = int(req.budget_usd * arch["budget_multiplier"])
        lodging_est = int(opt_budget * 0.40)
        transit_est = int(opt_budget * 0.22)
        guides_exp_est = int(opt_budget * 0.20)
        dining_est = int(opt_budget * 0.12)
        buffer_est = opt_budget - (lodging_est + transit_est + guides_exp_est + dining_est)

        # Build day items matching requested duration
        days_list = []
        base_days = arch["day_base"]
        for d_num in range(1, days + 1):
            source_item = base_days[(d_num - 1) % len(base_days)]
            days_list.append({
                "day": d_num,
                "title": f"Day {d_num}: {source_item['title']}",
                "city": source_item["city"],
                "morning": source_item["morning"],
                "afternoon": source_item["afternoon"],
                "evening": source_item["evening"],
                "stay": source_item["stay"],
                "meals": source_item["meals"],
                "transit": source_item["transit"],
                "guide_ref": arch["guide"]["name"] if arch.get("guide") else "Verified Local Guide"
            })

        options_output.append({
            "id": arch["opt_id"],
            "title": arch["title"],
            "name": arch["title"],
            "destination": arch["destination"],
            "route": arch["destination"],
            "tagline": arch["tagline"],
            "short_description": arch["tagline"],
            "hero_image": arch["hero_image"],
            "image": arch["hero_image"],
            "theme": arch["theme"],
            "category": arch["style"],
            "cities": arch["cities"],
            "highlights": arch["cities"],
            "travel_style": arch["style"],
            "duration_days": days,
            "travelers_count": req.travelers_count,
            "traveler_type": req.traveler_type,
            "accommodation_preference": req.accommodation,
            "transportation_preference": req.transportation,
            "best_for": arch["best_for"],
            "total_budget_usd": opt_budget,
            "total_budget_inr": int(opt_budget * 83.0),
            "budget_breakdown": {
                "luxury_lodging_usd": lodging_est,
                "private_transport_usd": transit_est,
                "verified_guides_experiences_usd": guides_exp_est,
                "curated_dining_usd": dining_est,
                "contingency_buffer_usd": buffer_est
            },
            "matched_guides": [arch["guide"]] if arch.get("guide") else [],
            "matched_experiences": arch.get("experiences", []),
            "itinerary": days_list,
            "safety_and_cultural_tips": [
                "Hydration & Water: Drink only sealed bottled or UV-filtered water; all luxury havelis and verified guides provide purified mineral water.",
                "Footwear & Temples: Slip-on footwear is recommended for easy removal before entering sanctums and heritage courtyards.",
                "Digital Payments & Currency: BharatConnect provides seamless UPI traveler wallet setup; carry ₹2,000 for small artisan purchases.",
                "Dress Etiquette: Lightweight linen and breathable cottons covering knees and shoulders ensure comfort and respect at sacred sites.",
                "24/7 Concierge: Dedicated BharatConnect emergency support is active via WhatsApp and direct calling (Helpline 1363)."
            ]
        })

    # Sort so that the destination matching the user's input appears first
    dest_lower = (req.destination or "").lower()
    if "kerala" in dest_lower or "south" in dest_lower or "kochi" in dest_lower:
        match_idx = 1
    elif "varanasi" in dest_lower or "ganges" in dest_lower or "spiritual" in dest_lower:
        match_idx = 2
    elif "rajasthan" in dest_lower or "jaipur" in dest_lower or "jodhpur" in dest_lower or "udaipur" in dest_lower:
        match_idx = 3
    elif "himalay" in dest_lower or "rishikesh" in dest_lower or "yoga" in dest_lower:
        match_idx = 4
    elif "goa" in dest_lower or "hampi" in dest_lower or "beach" in dest_lower:
        match_idx = 5
    elif "tamil" in dest_lower or "chennai" in dest_lower or "madurai" in dest_lower:
        match_idx = 6
    elif "tiger" in dest_lower or "wildlife" in dest_lower or "safari" in dest_lower:
        match_idx = 7
    elif "kashmir" in dest_lower or "srinagar" in dest_lower:
        match_idx = 8
    elif "kolkata" in dest_lower or "darjeeling" in dest_lower or "east" in dest_lower:
        match_idx = 9
    else:
        match_idx = 0

    if match_idx > 0 and match_idx < len(options_output):
        matched_item = options_output.pop(match_idx)
        options_output.insert(0, matched_item)

    return options_output


# AI Trip Planner Engine
@app.post("/api/plan-trip")
def plan_trip(req: TripPlannerRequest):
    days = min(max(req.duration_days, 3), 14)
    all_10_options = build_10_diverse_trip_options(req, days)
    top_option = all_10_options[0]

    plan_id = f"plan-{uuid.uuid4().hex[:8]}"
    plan_output = dict(top_option)
    plan_output["id"] = plan_id
    plan_output["mode"] = "ai"
    plan_output["origin_country"] = req.origin_country
    plan_output["created_at"] = datetime.utcnow().isoformat() + "Z"
    plan_output["trip_options"] = all_10_options

    saved_itineraries[plan_id] = plan_output
    return plan_output

def schedule_trip_travel_notifications(user_id: str, target_trip: dict, session: dict):
    """
    Schedules automatic departure-based travel notifications for confirmed trips:
    1. Upcoming trip confirmation notification
    2. 2 days before departure
    3. 1 day before departure
    4. Departure day notification
    """
    from datetime import date, timedelta
    start_date_str = str(target_trip.get("start_date") or target_trip.get("travel_date") or "").strip()
    trip_id = str(target_trip.get("id") or "trip")
    trip_title = target_trip.get("title") or target_trip.get("name") or "Custom India Journey"
    destination = target_trip.get("destination") or target_trip.get("route") or "India"
    guide_name = target_trip.get("assigned_guide", {}).get("name") if isinstance(target_trip.get("assigned_guide"), dict) else "Assigned Local Guide"

    try:
        sd = date.fromisoformat(start_date_str)
    except Exception:
        sd = date.today() + timedelta(days=14)

    date_2days_before = (sd - timedelta(days=2)).isoformat()
    date_1day_before = (sd - timedelta(days=1)).isoformat()
    date_departure = sd.isoformat()
    now_iso = datetime.utcnow().isoformat() + "Z"
    clean_id = trip_id.replace("trip-", "").replace("plan-", "")[:6]

    global notifications_db
    existing_notif_ids = {n.get("id") for n in notifications_db}

    scheduled_items = [
        {
            "id": f"notif-upc-{clean_id}-{uuid.uuid4().hex[:4]}",
            "user_id": user_id,
            "trip_id": trip_id,
            "type": "trip_confirmed",
            "title": f"Trip Confirmed: {trip_title}",
            "message": f"Your customized journey to {destination} starting {start_date_str} is officially confirmed. Guide {guide_name} is assigned to your itinerary.",
            "read": False,
            "scheduled_date": date.today().isoformat(),
            "notification_stage": "upcoming",
            "created_at": now_iso
        },
        {
            "id": f"notif-2d-{clean_id}-{uuid.uuid4().hex[:4]}",
            "user_id": user_id,
            "trip_id": trip_id,
            "type": "trip_reminder_2days",
            "title": f"2 Days Before Departure: {destination}",
            "message": f"Only 2 days remaining until your trip to {destination}! Review your packing checklist, transit vouchers, and local advisory.",
            "read": False,
            "scheduled_date": date_2days_before,
            "notification_stage": "2_days_before",
            "created_at": now_iso
        },
        {
            "id": f"notif-1d-{clean_id}-{uuid.uuid4().hex[:4]}",
            "user_id": user_id,
            "trip_id": trip_id,
            "type": "trip_reminder_1day",
            "title": f"1 Day Before Departure: Tomorrow You Depart for {destination}!",
            "message": f"Tomorrow is departure day! Your assigned guide {guide_name} has finalized your reception. Check into your flights and have a safe journey.",
            "read": False,
            "scheduled_date": date_1day_before,
            "notification_stage": "1_day_before",
            "created_at": now_iso
        },
        {
            "id": f"notif-dep-{clean_id}-{uuid.uuid4().hex[:4]}",
            "user_id": user_id,
            "trip_id": trip_id,
            "type": "trip_departure_day",
            "title": f"Departure Day: Welcome to Your India Adventure!",
            "message": f"Today is the day! Welcome to India. Your local concierge support and guide {guide_name} are active. Enjoy Day 1 of your journey.",
            "read": False,
            "scheduled_date": date_departure,
            "notification_stage": "departure_day",
            "created_at": now_iso
        }
    ]

    target_trip["scheduled_notifications"] = [
        {"stage": item["notification_stage"], "scheduled_date": item["scheduled_date"], "title": item["title"]}
        for item in scheduled_items
    ]

    for notif in reversed(scheduled_items):
        if notif["id"] not in existing_notif_ids:
            notifications_db.insert(0, notif)
            existing_notif_ids.add(notif["id"])

    save_notifications()


@app.post("/api/trips/custom")
@app.post("/api/customize-plan")
def plan_custom_trip(req: CustomTripRequest, request: Request = None, token: Optional[str] = Query(None)):
    # 0. Session check (optional for preview, attached if available)
    session = None
    if request:
        sess_token = extract_token_from_request(request, token)
        if sess_token and sess_token in active_sessions:
            session = active_sessions[sess_token]

    # Destination resolution
    if req.destination:
        dest = req.destination
    elif req.destinations:
        dest = ", ".join(req.destinations) if isinstance(req.destinations, list) else str(req.destinations)
    else:
        dest = "Golden Triangle (Delhi, Agra, Jaipur)"

    days = min(max(req.duration_days, 1), 30)
    travel_date = req.travel_date or req.start_date
    
    end_date = None
    if travel_date:
        try:
            from datetime import date, timedelta
            sd = date.fromisoformat(str(travel_date).strip())
            end_date = (sd + timedelta(days=days - 1)).isoformat()
        except Exception:
            end_date = travel_date

    # 1. Match Guide
    curr_guides = load_json("guides.json") or guides_db
    matched_guides = []
    if req.guide_id:
        g = next((x for x in curr_guides if x["id"] == req.guide_id), None)
        if g:
            matched_guides.append(g)
    elif req.guide_name:
        g = next((x for x in curr_guides if req.guide_name.lower() in x["name"].lower()), None)
        if g:
            matched_guides.append(g)
    if not matched_guides:
        dest_lower = dest.lower()
        if "jaipur" in dest_lower or "rajasthan" in dest_lower:
            matched_guides = [curr_guides[0]]
        elif "kerala" in dest_lower or "kochi" in dest_lower:
            matched_guides = [curr_guides[1]]
        elif "varanasi" in dest_lower or "north" in dest_lower:
            matched_guides = [curr_guides[2]]
        elif "delhi" in dest_lower or "agra" in dest_lower:
            matched_guides = [curr_guides[3]]
        else:
            matched_guides = [curr_guides[0]] if curr_guides else []

    # 2. Match Experiences & Activities
    curr_exp = load_json("experiences.json") or experiences_db
    matched_exp = []
    
    all_requested_exp = list(req.experience_ids or [])
    if req.activities:
        all_requested_exp.extend(req.activities)

    if all_requested_exp:
        for eid in all_requested_exp:
            found = next((x for x in curr_exp if x["id"] == eid or eid.lower() in x["title"].lower()), None)
            if found and found not in matched_exp:
                matched_exp.append(found)
    if not matched_exp:
        matched_exp = curr_exp[:3] if len(curr_exp) >= 3 else curr_exp

    # 3. Build Day-by-Day Itinerary based on selections, places, interests, pace
    primary_guide_name = matched_guides[0]["name"] if matched_guides else "Certified Local Specialist"
    pace = req.daily_pace or "Balanced (2-3 Sights Daily)"
    places_list = req.places or []

    # Destination Image Resolver
    def get_dest_photo(city):
        cl = city.lower()
        if "jaipur" in cl: return "https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&auto=format&fit=crop&q=80"
        if "agra" in cl: return "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&auto=format&fit=crop&q=80"
        if "delhi" in cl: return "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&auto=format&fit=crop&q=80"
        if "varanasi" in cl or "kashi" in cl: return "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=800&auto=format&fit=crop&q=80"
        if "kochi" in cl or "kerala" in cl or "munnar" in cl or "alleppey" in cl: return "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&auto=format&fit=crop&q=80"
        if "goa" in cl: return "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&auto=format&fit=crop&q=80"
        if "udaipur" in cl: return "https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=800&auto=format&fit=crop&q=80"
        if "jodhpur" in cl: return "https://images.unsplash.com/photo-1585123388867-3bfe6dd4bdbf?w=800&auto=format&fit=crop&q=80"
        if "manali" in cl or "solang" in cl: return "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&auto=format&fit=crop&q=80"
        if "ladakh" in cl or "leh" in cl: return "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=800&auto=format&fit=crop&q=80"
        if "hampi" in cl: return "https://images.unsplash.com/photo-1600100397608-f010f443907a?w=800&auto=format&fit=crop&q=80"
        if "rishikesh" in cl: return "https://images.unsplash.com/photo-1603775020644-eb8decd79994?w=800&auto=format&fit=crop&q=80"
        return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&auto=format&fit=crop&q=80"

    selected_days = []
    for d in range(1, days + 1):
        curr_exp_obj = matched_exp[(d - 1) % len(matched_exp)] if matched_exp else {}
        curr_exp_title = curr_exp_obj.get("title", "Curated Local Heritage Discovery")
        curr_exp_badge = curr_exp_obj.get("subtitle", "Authentic Cultural Immersion")
        
        # Determine day's focal city / place
        if places_list and len(places_list) >= d:
            city_name = places_list[d - 1]
        elif places_list:
            city_name = places_list[(d - 1) % len(places_list)]
        else:
            city_name = dest.split('(')[0].replace('Golden Triangle', 'New Delhi').replace('Royal Rajasthan', 'Jaipur').replace('Kerala Backwaters', 'Kochi').replace('Varanasi & Sacred North', 'Varanasi').strip('() ')
            if "Delhi" in dest and d == 1:
                city_name = "New Delhi"
            elif "Agra" in dest and (d == 2 or d == 3):
                city_name = "Agra"
            elif "Jaipur" in dest and d >= 4:
                city_name = "Jaipur"

        if "relaxed" in pace.lower():
            morning_activity = f"Gentle morning exploration of iconic landmarks in {city_name} with {primary_guide_name}; unhurried photography and artisan introductions."
            afternoon_activity = f"Extended leisure lunch featuring royal cuisine, followed by private {curr_exp_title}."
            evening_activity = f"Serene twilight walk and sunset tea in historic courtyards. Free evening for relaxation."
        elif "active" in pace.lower():
            morning_activity = f"Dawn departure for sunrise photography in {city_name}; comprehensive guided architectural survey with {primary_guide_name}."
            afternoon_activity = f"Interactive masterclass session: {curr_exp_title} ({curr_exp_badge}); artisan workshop visit."
            evening_activity = f"Evening heritage bazaar exploration, traditional street culinary tastings, and cultural folklore performance."
        else:
            morning_activity = f"Morning guided visit to key dynastic monuments and secret courtyards in {city_name} with {primary_guide_name}."
            afternoon_activity = f"Curated afternoon experience: {curr_exp_title} with verified hosts."
            evening_activity = f"Sunset viewings at royal terraces, followed by curated dining and evening stroll."
        
        day_date_str = None
        if travel_date:
            try:
                from datetime import date, timedelta
                sd = date.fromisoformat(str(travel_date).strip())
                day_date_str = (sd + timedelta(days=d - 1)).isoformat()
            except Exception:
                pass

        selected_days.append({
            "day": d,
            "date": day_date_str,
            "title": f"Day {d}: {city_name} — {curr_exp_badge if d <= len(matched_exp) else 'Living Culture & Heritage'}",
            "city": city_name,
            "image": get_dest_photo(city_name),
            "morning": morning_activity,
            "afternoon": afternoon_activity,
            "evening": evening_activity,
            "stay": f"{req.accommodation} ({'Samode Haveli' if 'Jaipur' in city_name else 'Historic Palace Retreat'})",
            "meals": "Curated regional specialties and organic artisan thalis",
            "transit": req.transportation,
            "guide_ref": primary_guide_name
        })

    # 4. Service Allocation
    # A. Guide Allocation
    if matched_guides:
        mg = matched_guides[0]
        allocated_guide = {
            "status": "Allocated",
            "id": mg.get("id", "guide-1"),
            "name": mg.get("name", "Arjun Sharma"),
            "avatar": mg.get("avatar") or mg.get("image") or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80",
            "languages": mg.get("languages", ["English", "Hindi"]),
            "experience_years": f"{mg.get('experience_years', 9)} Years",
            "contact_number": mg.get("phone") or "+91 98290 14821",
            "city": mg.get("city", "Jaipur"),
            "rating": mg.get("rating", 4.96),
            "badge": "Platform Verified Cultural Specialist",
            "verified": True
        }
    else:
        allocated_guide = {
            "status": "Assignment pending",
            "name": "Local Specialist (Pending Dispatch)",
            "languages": ["English", "Hindi"],
            "experience_years": "5+ Years",
            "contact_number": "Provided upon arrival",
            "badge": "Pending Verification",
            "verified": False
        }

    # B. Cab & Transport Allocation
    cab_choice = req.cab_type or req.transportation or "Premium SUV"
    if "suv" in cab_choice.lower():
        v_model = "Toyota Innova Crysta (AC Premium)"
        v_num = "RJ 14 TA 8829"
        d_name = "Mahesh Chand Meena"
    elif "sedan" in cab_choice.lower():
        v_model = "Toyota Etios / Dzire (AC Chauffeur)"
        v_num = "DL 1Y B 4521"
        d_name = "Satish Kumar Sharma"
    elif "rail" in cab_choice.lower():
        v_model = "Vande Bharat Express & Local Chauffeur"
        v_num = "IR-20431"
        d_name = "Station Reception Team"
    else:
        v_model = "Executive Luxury Fleet (Mercedes / BMW)"
        v_num = "DL 1C Z 9001"
        d_name = "Rajeshwar Rao"

    allocated_cab = {
        "status": "Allocated",
        "vehicle_model": v_model,
        "vehicle_number": v_num,
        "driver_name": d_name,
        "driver_rating": "4.94 / 5.0 (380+ Verified Trips)",
        "driver_contact": "+91 94140 67123",
        "vehicle_type": cab_choice,
        "inclusions": "All Fuel, Tolls, State Border Permits & Parking Included"
    }

    # C. Photographer Allocation
    has_photo = bool(req.photographer_required or (req.photographer_tier and req.photographer_tier.lower() not in ("none", "no photographer", "")))
    photo_tier = req.photographer_tier if has_photo else "None"
    if has_photo:
        allocated_photo = {
            "status": "Allocated",
            "tier": photo_tier,
            "photographer_name": "Aman Mathur",
            "equipment_type": "Sony A7 IV with G-Master f/2.8 & DJI Ronin Gimbal",
            "portfolio_highlight": "Featured in Condé Nast Traveller India & NatGeo Heritage series",
            "contact_number": "+91 97841 55902",
            "deliverable": "120+ High-Resolution Curated & Retouched Photographs (Cloud Delivery within 72h)"
        }
    else:
        allocated_photo = {
            "status": "Not Requested",
            "tier": "None",
            "photographer_name": "Optional Service Available",
            "deliverable": "None"
        }

    allocated_services = {
        "guide_and_mentor": allocated_guide,
        "cab_and_driver": allocated_cab,
        "photographer": allocated_photo
    }

    # 5. Budget calculation with exact percentages
    b_total = max(int(req.budget_usd or 3500), 100)
    lodging_est = int(b_total * 0.35)
    transit_est = int(b_total * 0.25)
    guides_exp_est = int(b_total * 0.18)
    dining_est = int(b_total * 0.12)
    photo_est = int(b_total * 0.05) if has_photo else 0
    buffer_est = b_total - (lodging_est + transit_est + guides_exp_est + dining_est + photo_est)

    pct_lodging = round((lodging_est / b_total) * 100, 1)
    pct_transit = round((transit_est / b_total) * 100, 1)
    pct_guides = round((guides_exp_est / b_total) * 100, 1)
    pct_dining = round((dining_est / b_total) * 100, 1)
    pct_photo = round((photo_est / b_total) * 100, 1)
    pct_buffer = round((buffer_est / b_total) * 100, 1)

    # 6. Route Stops & Distance Estimation
    route_stops = []
    start_c = req.starting_city or (places_list[0] if places_list else "New Delhi")
    route_stops.append({"city": start_c, "role": "Origin / Reception Port"})
    for p in places_list:
        if p != start_c and not any(r["city"] == p for r in route_stops):
            route_stops.append({"city": p, "role": "Heritage Corridor Destination"})
    if len(route_stops) == 1 and "Golden Triangle" in dest:
        route_stops = [
            {"city": "New Delhi", "role": "Arrival Hub & Monument Quarter"},
            {"city": "Agra", "role": "Mughal Dynastic Architecture"},
            {"city": "Jaipur", "role": "Royal Rajputana Palaces"}
        ]

    plan_id = f"trip-custom-{uuid.uuid4().hex[:8]}"
    plan_output = {
        "id": plan_id,
        "mode": "custom",
        "status": "draft",
        "confirmation_status": "unconfirmed",
        "title": f"{days}-Day Bespoke Journey: {dest.split('(')[0].strip()}",
        "destination": dest,
        "destinations": req.destinations or [dest],
        "places": places_list,
        "starting_city": start_c,
        "start_date": travel_date,
        "travel_date": travel_date,
        "end_date": end_date,
        "origin_country": "Custom Profile",
        "travel_style": req.traveler_type or "Custom Curated",
        "traveler_type": req.traveler_type,
        "interests": req.interests or ["Heritage Architecture", "Culinary Culture"],
        "categories": req.categories or ["Heritage & Historical"],
        "daily_pace": pace,
        "duration_days": days,
        "travelers_count": req.travelers_count,
        "accommodation": req.accommodation,
        "accommodation_preference": req.accommodation_preference or req.accommodation,
        "transportation": req.transportation,
        "transportation_preference": req.transportation_preference or req.transportation,
        "cab_type": cab_choice,
        "photographer_required": has_photo,
        "photographer_tier": photo_tier,
        "custom_notes": req.custom_notes or "",
        "total_budget_usd": b_total,
        "total_budget_inr": int(b_total * 86.5),
        "budget_breakdown": {
            "luxury_lodging_usd": lodging_est,
            "private_transport_usd": transit_est,
            "verified_guides_experiences_usd": guides_exp_est,
            "curated_dining_usd": dining_est,
            "photographer_usd": photo_est,
            "contingency_buffer_usd": buffer_est,
            "percentages": {
                "lodging": pct_lodging,
                "transport": pct_transit,
                "guides": pct_guides,
                "dining": pct_dining,
                "photographer": pct_photo,
                "buffer": pct_buffer
            }
        },
        "allocated_services": allocated_services,
        "matched_guides": matched_guides,
        "assigned_guide": allocated_guide,
        "allocated_cab": allocated_cab,
        "allocated_photographer": allocated_photo,
        "matched_experiences": matched_exp,
        "activities": [e.get("title") for e in matched_exp],
        "itinerary": selected_days,
        "route_stops": route_stops,
        "safety_and_cultural_tips": [
            "Bespoke Coordination: Your assigned verified guide coordinates arrival and timing based on daily pace.",
            "Water & Dining: All booked heritage retreats and private chauffeurs provide sealed UV-filtered drinking water.",
            "Footwear: Slip-on footwear is recommended for effortless monument and temple courtyard access.",
            "Assistance Hotline: Dedicated 24/7 bilingual on-ground concierge support is linked to this plan."
        ],
        "package_inclusions": [
            f"Private AC {allocated_cab['vehicle_model']} with Professional Chauffeur (Fuel & Tolls Included)",
            f"Dedicated Verified Tour Specialist ({allocated_guide['name']})",
            f"Bespoke Accommodations: {req.accommodation}",
            "24/7 Dedicated On-Ground Safety & Concierge Dispatch Desk",
            "Monument Entry Coordination & Skip-the-Line Entry Vouchers"
        ] + ([f"Professional Travel Photographer ({allocated_photo['photographer_name']})"] if has_photo else []),
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    if session:
        plan_output["user_id"] = session["user_id"]
        plan_output["user_email"] = session["email"]

    saved_itineraries[plan_id] = plan_output
    return plan_output


@app.get("/api/trips/custom/{trip_id}")
def get_customized_trip(trip_id: str, request: Request = None, token: Optional[str] = Query(None)):
    """Retrieve a customized trip by ID from memory cache or persistent database."""
    trip = saved_itineraries.get(trip_id)
    if not trip:
        all_trips = load_trips()
        trip = next((t for t in all_trips if t.get("id") == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Customized trip not found.")
    return {"success": True, "trip": trip}


@app.patch("/api/trips/custom/{trip_id}")
@app.put("/api/trips/custom/{trip_id}")
def update_customized_trip(trip_id: str, body: dict = Body(...), request: Request = None, token: Optional[str] = Query(None)):
    """Update requirements of a customized trip prior to confirmation."""
    trip = saved_itineraries.get(trip_id)
    all_trips = load_trips()
    if not trip:
        trip = next((t for t in all_trips if t.get("id") == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Customized trip not found.")

    for k, v in body.items():
        if k in ("destination", "destinations", "places", "travel_date", "start_date", "end_date",
                 "duration_days", "travelers_count", "traveler_type", "budget_usd", "interests",
                 "accommodation", "accommodation_preference", "transportation", "transportation_preference",
                 "daily_pace", "custom_notes", "guide_id"):
            trip[k] = v

    # Recalculate dates if start_date or duration updated
    if "start_date" in body or "travel_date" in body or "duration_days" in body:
        sd_str = trip.get("start_date") or trip.get("travel_date")
        if sd_str:
            try:
                from datetime import date, timedelta
                sd = date.fromisoformat(str(sd_str).strip())
                dur = int(trip.get("duration_days") or len(trip.get("itinerary", [])) or 7)
                trip["start_date"] = str(sd_str).strip()
                trip["travel_date"] = str(sd_str).strip()
                trip["end_date"] = (sd + timedelta(days=dur - 1)).isoformat()
            except Exception:
                pass

    if "budget_usd" in body:
        b = int(body["budget_usd"])
        trip["total_budget_usd"] = b
        trip["total_budget_inr"] = int(b * 83.0)
        trip["budget_breakdown"] = {
            "luxury_lodging_usd": int(b * 0.40),
            "private_transport_usd": int(b * 0.22),
            "verified_guides_experiences_usd": int(b * 0.20),
            "curated_dining_usd": int(b * 0.12),
            "contingency_buffer_usd": b - int(b * 0.94)
        }

    trip["updated_at"] = datetime.utcnow().isoformat() + "Z"
    saved_itineraries[trip_id] = trip

    idx = next((i for i, t in enumerate(all_trips) if t.get("id") == trip_id), None)
    if idx is not None:
        all_trips[idx].update(trip)
        save_trips(all_trips)

    return {"success": True, "trip": trip, "message": "Customized trip updated successfully."}


@app.post("/api/trips/custom/{trip_id}/confirm")
def confirm_customized_trip(trip_id: str, request: Request, body: dict = Body(default={}), token: Optional[str] = Query(None)):
    """Confirm customized trip with validation, guide assignment, notification scheduling, and email dispatch."""
    session = require_authenticated_session(request, token)
    all_trips = load_trips()

    target_trip = saved_itineraries.get(trip_id)
    if not target_trip:
        target_trip = next((t for t in all_trips if t.get("id") == trip_id), None)

    if not target_trip:
        if body.get("trip"):
            target_trip = dict(body["trip"])
            target_trip["id"] = trip_id
        else:
            raise HTTPException(status_code=404, detail="Customized trip not found to confirm.")

    for k in ("start_date", "travel_date", "travelers_count", "end_date", "destination", "custom_notes", "places"):
        if k in body and body[k]:
            target_trip[k] = body[k]

    # Required validation
    start_date = target_trip.get("start_date") or target_trip.get("travel_date") or body.get("start_date") or body.get("travel_date")
    if not start_date or not str(start_date).strip():
        raise HTTPException(status_code=400, detail="Trip start date is required before confirming this trip.")

    start_date = str(start_date).strip()
    target_trip["start_date"] = start_date
    target_trip["travel_date"] = start_date

    duration = int(target_trip.get("duration_days") or len(target_trip.get("itinerary", [])) or 7)
    if duration < 1:
        raise HTTPException(status_code=400, detail="Duration must be at least 1 day.")

    travelers = int(target_trip.get("travelers_count") or 1)
    if travelers < 1:
        raise HTTPException(status_code=400, detail="Travelers count must be at least 1.")
    target_trip["travelers_count"] = travelers

    try:
        from datetime import date, timedelta
        sd = date.fromisoformat(start_date)
        target_trip["end_date"] = (sd + timedelta(days=duration - 1)).isoformat()
    except Exception:
        target_trip["end_date"] = target_trip.get("end_date") or start_date

    # Mark as CONFIRMED
    target_trip["status"] = "confirmed"
    target_trip["confirmation_status"] = "confirmed"
    target_trip["confirmed_at"] = datetime.utcnow().isoformat() + "Z"
    target_trip["user_id"] = session["user_id"]
    target_trip["user_email"] = session["email"]
    target_trip["is_selected"] = True

    # Assign local guide based on destination
    curr_guides = load_json("guides.json") or guides_db
    dest_lower = (target_trip.get("destination") or target_trip.get("title") or "").lower()
    assigned_guide = target_trip.get("assigned_guide")
    if not assigned_guide or not isinstance(assigned_guide, dict):
        if "jaipur" in dest_lower or "rajasthan" in dest_lower:
            assigned_guide = next((g for g in curr_guides if "jaipur" in g.get("city", "").lower()), curr_guides[0])
        elif "kerala" in dest_lower or "kochi" in dest_lower:
            assigned_guide = next((g for g in curr_guides if "kochi" in g.get("city", "").lower()), curr_guides[1])
        elif "varanasi" in dest_lower:
            assigned_guide = next((g for g in curr_guides if "varanasi" in g.get("city", "").lower()), curr_guides[2])
        elif "delhi" in dest_lower or "agra" in dest_lower:
            assigned_guide = next((g for g in curr_guides if "delhi" in g.get("city", "").lower()), curr_guides[3])
        else:
            assigned_guide = curr_guides[0] if curr_guides else None
        target_trip["assigned_guide"] = assigned_guide

    # Persist in data/trips.json
    existing_idx = next((i for i, t in enumerate(all_trips) if t.get("id") == trip_id and t.get("user_id") == session["user_id"]), None)
    if existing_idx is not None:
        all_trips[existing_idx] = target_trip
    else:
        all_trips.insert(0, target_trip)

    for t in all_trips:
        if t.get("user_id") == session["user_id"]:
            t["is_selected"] = (t.get("id") == trip_id)

    save_trips(all_trips)
    saved_itineraries[trip_id] = target_trip

    # Automatic travel notifications scheduling based on departure date
    schedule_trip_travel_notifications(session["user_id"], target_trip, session)

    # Dispatch confirmation email to verified email
    try:
        email_service.send_trip_confirmation_email(
            user_email=session.get("email"),
            user_name=session.get("full_name", "Traveler"),
            trip_data=target_trip,
            guide_data=assigned_guide if isinstance(assigned_guide, dict) else None
        )
    except Exception as email_err:
        print(f"[WARNING] Confirmation email dispatch failed: {email_err}")

    return {
        "success": True,
        "trip": target_trip,
        "message": f"Trip '{target_trip.get('title')}' successfully confirmed and scheduled."
    }

# User Trips Management APIs (Protected by Active Session)
@app.post("/api/trips")
def save_trip(request: Request, body: dict = Body(...), token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    trip_data = body.get("trip", body)
    
    trip_id = trip_data.get("id") or f"trip-{uuid.uuid4().hex[:8]}"
    trip_record = dict(trip_data)
    trip_record["id"] = trip_id
    trip_record["user_id"] = session["user_id"]
    trip_record["user_email"] = session["email"]
    trip_record["saved_at"] = datetime.utcnow().isoformat() + "Z"
    
    all_trips = load_trips()
    existing_idx = next((i for i, t in enumerate(all_trips) if t.get("id") == trip_id and t.get("user_id") == session["user_id"]), None)
    if existing_idx is not None:
        all_trips[existing_idx] = trip_record
    else:
        all_trips.insert(0, trip_record)
        
    save_trips(all_trips)
    saved_itineraries[trip_id] = trip_record

    # Admin notification for trip created/saved (Failure does not block trip save)
    try:
        if request.headers.get("X-Simulate-Email-Failure") == "1":
            raise Exception("Simulated SMTP Server Down via X-Simulate-Email-Failure header!")
        user_name = session.get("full_name") or session.get("email") or "Registered Traveler"
        user_email = session.get("email") or "Unknown"
        destination = trip_record.get("destination") or trip_record.get("title") or "India Journey"
        duration_days = trip_record.get("duration_days") or len(trip_record.get("itinerary", [])) or 1
        travelers_count = trip_record.get("travelers_count") or 1
        budget_usd = trip_record.get("total_budget_usd") or trip_record.get("budget_usd")
        budget_str = f"${budget_usd:,} USD" if budget_usd else None
        created_at = trip_record.get("saved_at") or trip_record.get("created_at")

        email_service.notify_trip_created(
            user_name=user_name,
            user_email=user_email,
            destination=destination,
            duration_days=duration_days,
            travelers_count=travelers_count,
            budget=budget_str,
            created_at=created_at
        )
    except Exception as notify_err:
        print(f"[WARNING] Admin trip email notification failed: {notify_err}")
    
    return {
        "success": True,
        "trip": trip_record,
        "message": "Trip plan saved to your account successfully."
    }

@app.get("/api/trips")
def get_user_trips(request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    all_trips = load_trips()
    user_trips = [t for t in all_trips if t.get("user_id") == session["user_id"]]
    return {
        "success": True,
        "trips": user_trips,
        "total": len(user_trips)
    }

@app.get("/api/trips/{trip_id}")
def get_single_trip(trip_id: str, request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    all_trips = load_trips()
    trip = next((t for t in all_trips if t.get("id") == trip_id), None)
    if not trip:
        trip = saved_itineraries.get(trip_id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found.")
            
    if trip.get("user_id") and trip.get("user_id") != session["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied. You do not have permission to access this trip.")
        
    return {"success": True, "trip": trip}

@app.delete("/api/trips/{trip_id}")
def delete_user_trip(trip_id: str, request: Request, token: Optional[str] = Query(None)):
    session = require_authenticated_session(request, token)
    all_trips = load_trips()
    trip = next((t for t in all_trips if t.get("id") == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
        
    if trip.get("user_id") != session["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied. You do not have permission to delete this trip.")
        
    new_trips = [t for t in all_trips if t.get("id") != trip_id]
    save_trips(new_trips)
    if trip_id in saved_itineraries:
        del saved_itineraries[trip_id]
        
    return {
        "success": True,
        "message": "Trip deleted successfully.",
        "deleted_trip_id": trip_id
    }

@app.patch("/api/trips/{trip_id}")
def patch_trip(trip_id: str, request: Request, body: dict = Body(...), token: Optional[str] = Query(None)):
    """Partial update a trip (e.g. set is_selected, update start_date/end_date, or confirm trip)."""
    session = require_authenticated_session(request, token)
    all_trips = load_trips()

    # Security: Check if trip exists and belongs to authenticated user
    trip_owner_check = next((t for t in all_trips if t.get("id") == trip_id), None)
    if trip_owner_check and trip_owner_check.get("user_id") and trip_owner_check.get("user_id") != session["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied. You do not have permission to modify this trip.")

    idx = next((i for i, t in enumerate(all_trips) if t.get("id") == trip_id and t.get("user_id") == session["user_id"]), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Trip not found.")

    target_trip = all_trips[idx]

    # Handle Trip Confirmation — accept action, confirmation_status, or status fields
    is_confirming = (
        body.get("action") == "confirm"
        or body.get("confirmation_status") == "confirmed"
        or body.get("status") == "confirmed"
    )
    if is_confirming:
        # Date Validation: start_date is strictly required
        start_date = body.get("start_date") or target_trip.get("start_date")
        if not start_date or not str(start_date).strip():
            raise HTTPException(status_code=400, detail="Trip start date is required before confirming this trip.")

        target_trip["start_date"] = str(start_date).strip()

        # Auto-compute end_date if not provided
        if body.get("end_date"):
            target_trip["end_date"] = str(body["end_date"]).strip()
        elif not target_trip.get("end_date"):
            try:
                from datetime import date, timedelta
                duration = int(target_trip.get("duration_days") or len(target_trip.get("itinerary", [])) or 7)
                sd = date.fromisoformat(str(start_date).strip())
                target_trip["end_date"] = (sd + timedelta(days=duration - 1)).isoformat()
            except Exception:
                target_trip["end_date"] = str(start_date).strip()

        target_trip["status"] = "confirmed"
        target_trip["confirmation_status"] = "confirmed"
        target_trip["confirmed_at"] = datetime.utcnow().isoformat() + "Z"
        target_trip["is_selected"] = True

        # Assign verified local guide based on destination if not present
        curr_guides = load_json("guides.json") or guides_db
        dest_lower = (target_trip.get("destination") or target_trip.get("title") or "").lower()
        assigned_guide = target_trip.get("assigned_guide")
        if not assigned_guide:
            if "jaipur" in dest_lower or "rajasthan" in dest_lower:
                assigned_guide = next((g for g in curr_guides if "jaipur" in g.get("city", "").lower()), curr_guides[0])
            elif "kerala" in dest_lower or "kochi" in dest_lower:
                assigned_guide = next((g for g in curr_guides if "kochi" in g.get("city", "").lower()), curr_guides[1])
            elif "varanasi" in dest_lower:
                assigned_guide = next((g for g in curr_guides if "varanasi" in g.get("city", "").lower()), curr_guides[2])
            elif "delhi" in dest_lower or "agra" in dest_lower:
                assigned_guide = next((g for g in curr_guides if "delhi" in g.get("city", "").lower()), curr_guides[3])
            else:
                assigned_guide = curr_guides[0] if curr_guides else None
            target_trip["assigned_guide"] = assigned_guide

        # Ensure only the confirmed trip is primary for this user
        for t in all_trips:
            if t.get("user_id") == session["user_id"]:
                t["is_selected"] = (t.get("id") == trip_id)

        # Dispatch confirmation email to traveler
        try:
            email_service.send_trip_confirmation_email(
                user_email=session.get("email"),
                user_name=session.get("full_name", "Traveler"),
                trip_data=target_trip,
                guide_data=assigned_guide if isinstance(assigned_guide, dict) else None
            )
        except Exception as email_err:
            print(f"[WARNING] Confirmation email dispatch failed: {email_err}")

        # Schedule travel notifications based on travel date
        schedule_trip_travel_notifications(session["user_id"], target_trip, session)

    # If setting this trip as selected outside confirmation
    elif body.get("is_selected") is True:
        for t in all_trips:
            if t.get("user_id") == session["user_id"]:
                t["is_selected"] = (t.get("id") == trip_id)

    # Apply the partial update fields
    ALLOWED_PATCH_FIELDS = {"is_selected", "start_date", "end_date", "trip_status", "confirmation_status", "confirmed_at", "notes", "assigned_guide"}
    for field in ALLOWED_PATCH_FIELDS:
        if field in body and field not in ("confirmation_status", "confirmed_at"):
            target_trip[field] = body[field]

    save_trips(all_trips)
    if trip_id in saved_itineraries:
        saved_itineraries[trip_id].update(target_trip)

    return {"success": True, "trip": target_trip}

@app.get("/api/itinerary/{plan_id}")
def get_itinerary(plan_id: str):
    if plan_id in saved_itineraries:
        return saved_itineraries[plan_id]
    all_trips = load_trips()
    found = next((t for t in all_trips if t.get("id") == plan_id), None)
    if found:
        return found
    raise HTTPException(status_code=404, detail="Itinerary not found")

# Serve static files
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        })
    return {"message": "BharatConnect AI Backend active. Static frontend initializing."}

@app.get("/index.html")
def serve_index_html():
    return serve_index()

@app.get("/home")
def serve_home():
    return serve_index()

@app.get("/journey.html")
def serve_journey():
    journey_file = os.path.join(STATIC_DIR, "journey.html")
    if os.path.exists(journey_file):
        return FileResponse(journey_file)
    root_journey = os.path.join(BASE_DIR, "journey.html")
    if os.path.exists(root_journey):
        return FileResponse(root_journey)
    raise HTTPException(status_code=404, detail="journey.html not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
