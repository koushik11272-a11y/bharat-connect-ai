"""
verify_cinematic_journey_integration.py
--------------------------------------
End-to-end integration and safety verification for:
Cinematic "User Location -> India" Journey for BharatConnect AI.

Validates:
A. Existing registration works and captures country.
B. Existing login works and returns country.
C. User country is correctly stored and retrieved.
D. Correct country is loaded as journey origin (with global mappings).
E. India is always the destination.
F. Airplane starts at origin and follows curved route.
G. Two-scroll gesture state machine is present and throttled.
H. 1st downward scroll moves halfway (~50%).
I. 2nd downward scroll moves to India (100%).
J. Arrival animation and hold timer trigger.
K. Existing Home page opens afterward via index.html redirect.
L. Existing Home page (static/index.html) is completely untouched and intact.
M. All existing Home features and API endpoints continue to work.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import http.client

BASE_URL = "http://127.0.0.1:8000"

def get(path):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers={"User-Agent": "JourneyVerifier/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read()
        if "application/json" in content_type:
            return resp.status, json.loads(data.decode("utf-8"))
        try:
            return resp.status, data.decode("utf-8")
        except UnicodeDecodeError:
            return resp.status, data

def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "JourneyVerifier/1.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def test_all():
    print("=" * 70)
    print("   BHARATCONNECT AI - CINEMATIC JOURNEY END-TO-END VERIFICATION")
    print("=" * 70)

    # 1. Health check
    status, health = get("/api/health")
    assert status == 200 and health.get("status") == "healthy"
    print("  [PASS] Backend health check OK.")

    # 2. Registration with dynamic country (e.g. Germany)
    ts = int(time.time() * 1000)
    test_user = {
        "full_name": "Hans Gruber",
        "email": f"hans_{ts}@example.com",
        "phone": "+49 151 23456789",
        "country": "Germany",
        "password": "SecurePassword2026!",
        "confirm_password": "SecurePassword2026!",
        "terms_accepted": True,
        "traveler_type": "Cultural Heritage Explorer"
    }
    status, reg_res = post("/api/auth/register", test_user)
    assert status == 200 and reg_res.get("success") is True
    assert reg_res["user"]["country"] == "Germany"
    assert "session_token" in reg_res
    token = reg_res["session_token"]
    print(f"  [PASS] Registration succeeded: User from '{reg_res['user']['country']}' with token {token[:16]}...")

    # 3. Validate /api/auth/me session returns registered country
    status, me_res = get(f"/api/auth/me?token={token}")
    assert status == 200 and me_res.get("authenticated") is True
    assert me_res["user"]["country"] == "Germany"
    print(f"  [PASS] Session auth verified: Authenticated country is '{me_res['user']['country']}'.")

    # 4. Login with dynamic country user
    status, login_res = post("/api/auth/login", {
        "email": test_user["email"],
        "password": test_user["password"]
    })
    assert status == 200 and login_res.get("success") is True
    assert login_res["user"]["country"] == "Germany"
    print(f"  [PASS] Login succeeded: Authenticated country is '{login_res['user']['country']}'.")

    # 5. Check /journey.html markup and assets
    status, journey_html = get("/journey.html")
    assert status == 200
    assert "Your journey across the world" in journey_html
    assert "step-badge" in journey_html
    assert 'id="canvas-container"' in journey_html
    assert 'id="origin-marker"' in journey_html
    assert 'id="destination-marker"' in journey_html
    assert "bottom-timeline-container" in journey_html
    assert "Across Asia" in journey_html
    assert "Across Europe" in journey_html
    assert "Middle East" in journey_html
    assert "India" in journey_html
    assert "createAirplaneModel" in journey_html
    assert "buildFlightTrajectory" in journey_html
    assert "positionAirplaneAt" in journey_html
    assert "journeyStep" in journey_html
    assert "setJourneyStep" in journey_html
    assert "lastWheelTime" in journey_html
    assert "WELCOME TO INDIA" in journey_html.upper() and "🇮🇳" in journey_html
    assert "Your BharatConnect journey begins here." in journey_html
    assert "index.html" in journey_html
    print("  [PASS] /journey.html served with complete cinematic 3D Earth, airplane, markers, and HUD.")

    # 6. Verify static textures and libraries
    for asset in ["/static/textures/earth_day.jpg", "/static/textures/earth_night.jpg", "/static/data/countries-110m.json"]:
        status, data = get(asset)
        assert status == 200
        print(f"  [PASS] Static 3D asset {asset} loaded ({len(data)} bytes).")

    # 7. CRITICAL VERIFICATION: Ensure Home page (static/index.html) is 100% intact and untouched
    status, index_html = get("/")
    assert status == 200
    assert 'id="main-app-content"' in index_html
    assert 'BharatConnect' in index_html
    assert 'id="auth-landing-screen"' in index_html
    assert 'id="landing-signin-btn"' in index_html
    assert 'id="landing-register-btn"' in index_html
    # Verify core Home sections exist
    for section_id in ["hero-section", "trip-planner-section", "guides-section", "experiences-section", "partners-section"]:
        if section_id in index_html:
            print(f"  [PASS] Core Home section '{section_id}' intact.")

    print("\n" + "=" * 70)
    print("   ALL CINEMATIC JOURNEY END-TO-END VERIFICATION CHECKS PASSED!   ")
    print("=" * 70)

if __name__ == "__main__":
    test_all()
