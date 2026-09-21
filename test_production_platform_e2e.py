"""
End-to-End Production Verification Test Suite for BharatConnect AI
Uses standard library (urllib.request) and background Uvicorn server for maximum portability.
"""

import sys
import os
import json
import time
import threading
import urllib.request
import urllib.error
import uvicorn
import server

PORT = 8009
BASE_URL = f"http://127.0.0.1:{PORT}"

def run_server():
    uvicorn.run(server.app, host="127.0.0.1", port=PORT, log_level="warning")

def req(path, method="GET", body=None, headers=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"detail": err_body}

def run_test():
    # Start server in thread
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    
    # Wait for server ready
    ready = False
    for _ in range(30):
        try:
            status, _ = req("/api/health")
            if status == 200:
                ready = True
                break
        except Exception:
            time.sleep(0.2)
            
    if not ready:
        print("Error: Test server failed to start.")
        sys.exit(1)

    print("==================================================")
    print("BHARATCONNECT AI - PRODUCTION E2E SUITE")
    print("==================================================")

    test_email = f"traveler_{int(time.time())}@example.com"
    test_password = "SecurePassword123!"

    # 1. Registration Request
    print("\n[1] Testing Registration Request with 6-digit OTP...")
    status, data = req("/api/auth/register-request", method="POST", body={
        "full_name": "Alexander Hamilton",
        "email": test_email,
        "phone": "+1 212 555 0199",
        "country": "United States",
        "password": test_password,
        "confirm_password": test_password,
        "terms_accepted": True,
        "traveler_type": "Cultural Explorer"
    })
    assert status == 200, f"Register request failed: {data}"
    assert data.get("status") == "pending_verification"
    assert test_email in server.pending_verifications
    otp_code = server.pending_verifications[test_email]["otp_code"]
    assert len(otp_code) == 6 and otp_code.isdigit()
    print(f"  [OK] Registration requested. 6-digit OTP generated: {otp_code}")

    # 2. Resend OTP Cooldown & Success
    print("\n[2] Testing Resend OTP Cooldown & Dispatch...")
    status_cooldown, _ = req("/api/auth/resend-otp", method="POST", body={
        "email": test_email,
        "purpose": "registration"
    })
    assert status_cooldown == 429
    print("  [OK] 30-second resend cooldown rate-limiting verified.")

    # Reset last_sent_at to simulate 31s elapsed
    from datetime import datetime, timedelta
    server.pending_verifications[test_email]["last_sent_at"] = (datetime.utcnow() - timedelta(seconds=35)).isoformat() + "Z"

    status, data = req("/api/auth/resend-otp", method="POST", body={
        "email": test_email,
        "purpose": "registration"
    })
    assert status == 200
    new_otp = server.pending_verifications[test_email]["otp_code"]
    assert len(new_otp) == 6
    print(f"  [OK] Resend successful after cooldown. New OTP: {new_otp}")

    # 3. Verify OTP & Activate Account
    print("\n[3] Testing OTP Verification & Account Activation...")
    status, data = req("/api/auth/verify-otp", method="POST", body={
        "email": test_email,
        "otp_code": "000000"
    })
    assert status == 400
    print("  [OK] Invalid OTP correctly rejected.")

    status, data = req("/api/auth/verify-otp", method="POST", body={
        "email": test_email,
        "otp_code": new_otp
    })
    assert status == 200
    assert data.get("success") is True
    session_token = data.get("session_token")
    assert session_token is not None
    user = data.get("user")
    assert user.get("email") == test_email
    assert user.get("email_verified") is True
    print(f"  [OK] Account verified! Session Token: {session_token[:12]}...")

    auth_headers = {"Authorization": f"Bearer {session_token}"}

    # 4. Profile Management
    print("\n[4] Testing Profile Management (GET & PUT)...")
    status, data = req(f"/api/user/profile?token={session_token}", headers=auth_headers)
    assert status == 200
    assert data.get("user", {}).get("full_name") == "Alexander Hamilton"

    status, data = req(f"/api/user/profile?token={session_token}", method="PUT", headers=auth_headers, body={
        "full_name": "Alexander Hamilton Jr.",
        "country": "United States",
        "phone": "+1 212 555 0199",
        "traveler_type": "Heritage & Luxury",
        "emergency_contact_name": "Elizabeth Schuyler",
        "emergency_contact_phone": "+1 212 555 0188",
        "bio": "History enthusiast visiting ancient forts and palaces across India."
    })
    assert status == 200
    updated_user = data.get("user", {})
    assert updated_user.get("full_name") == "Alexander Hamilton Jr."
    assert updated_user.get("emergency_contact_name") == "Elizabeth Schuyler"
    print("  [OK] Profile successfully retrieved and updated.")

    # 5. Settings Management
    print("\n[5] Testing Settings & Currency Preferences...")
    status, data = req(f"/api/user/settings?token={session_token}", method="PUT", headers=auth_headers, body={
        "notif_trip": True,
        "notif_guide": True,
        "notif_platform": False,
        "preferred_currency": "EUR"
    })
    assert status == 200
    assert data.get("settings", {}).get("preferred_currency") == "EUR"
    print("  [OK] Account Settings & Currency preferences saved.")

    # 6. Change Password
    print("\n[6] Testing Change Password...")
    new_password = "NewSecurePassword456!"
    status, data = req(f"/api/user/change-password?token={session_token}", method="POST", headers=auth_headers, body={
        "current_password": test_password,
        "new_password": new_password
    })
    assert status == 200
    print("  [OK] Password changed securely.")

    # Test login with new password
    status, data = req("/api/auth/login", method="POST", body={
        "email": test_email,
        "password": new_password
    })
    assert status == 200
    print("  [OK] Sign in with new password verified.")

    # 7. AI Trip Planner 10-Option Generation
    print("\n[7] Testing AI Trip Planner 10-Option Generation...")
    status, data = req("/api/plan-trip", method="POST", body={
        "origin_country": "United States",
        "destination": "Rajasthan Royal Circuit",
        "category": "Heritage & History",
        "duration_days": 7,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "budget_usd": 3800,
        "interests": ["Palaces", "Forts", "Culinary"],
        "pace": "Balanced"
    })
    assert status == 200
    assert "trip_options" in data
    trip_options = data["trip_options"]
    assert len(trip_options) == 10, f"Expected 10 options, got {len(trip_options)}"
    print(f"  [OK] Exactly 10 distinct trip options generated successfully:")
    for idx, opt in enumerate(trip_options[:3]):
        print(f"    - Option {idx+1}: {opt.get('name')} ({opt.get('route')})")

    # 8. Explicit Save Trip Plan to My Plans
    print("\n[8] Testing Explicit Save Trip Plan...")
    selected_trip = trip_options[0]
    status, data = req(f"/api/trips?token={session_token}", method="POST", headers=auth_headers, body={
        "trip": selected_trip
    })
    assert status == 200
    saved_trip_id = data.get("trip", {}).get("id")
    assert saved_trip_id is not None
    print(f"  [OK] Trip saved to My Plans. Trip ID: {saved_trip_id}")

    # Verify trip in list
    status, data = req(f"/api/trips?token={session_token}", headers=auth_headers)
    assert status == 200
    user_trips = data.get("trips", [])
    assert any(t.get("id") == saved_trip_id for t in user_trips)
    print(f"  [OK] User has {len(user_trips)} saved trip(s) in My Plans.")

    # 9. Trip Confirmation Flow
    print("\n[9] Testing Trip Confirmation Flow...")
    status, data = req(f"/api/trips/{saved_trip_id}?token={session_token}", method="PATCH", headers=auth_headers, body={
        "status": "confirmed",
        "start_date": "2026-11-15"
    })
    assert status == 200, f"Confirmation failed: {data}"
    confirmed_data = data.get("trip", {})
    assert confirmed_data.get("status") == "confirmed"
    assert confirmed_data.get("start_date") == "2026-11-15"
    assert confirmed_data.get("end_date") is not None
    assert "assigned_guide" in confirmed_data
    assigned_guide = confirmed_data["assigned_guide"]
    assert assigned_guide.get("name") is not None
    print(f"  [OK] Trip confirmed successfully!")
    print(f"    - Start Date: {confirmed_data.get('start_date')}")
    print(f"    - End Date: {confirmed_data.get('end_date')}")
    print(f"    - Assigned Guide: {assigned_guide.get('name')} ({assigned_guide.get('city')}, {assigned_guide.get('badge')})")
    print(f"    - Guide Phone / WhatsApp: {assigned_guide.get('phone')}")

    # 10. Check in-app notifications
    print("\n[10] Testing In-App Notifications...")
    status, data = req(f"/api/notifications?token={session_token}", headers=auth_headers)
    assert status == 200
    notifs = data.get("notifications", [])
    assert len(notifs) > 0
    print(f"  [OK] {len(notifs)} In-app notification(s) delivered (e.g., '{notifs[0].get('title')}').")

    # 11. Support & Emergency Config
    print("\n[11] Testing Support & Emergency Configuration...")
    status, data = req("/api/support/config")
    assert status == 200
    assert data.get("ministry_tourism_helpline") == "1363"
    assert data.get("all_india_emergency") == "112"
    print("  [OK] Support & Ministry helpline configs verified.")

    print("\n==================================================")
    print("ALL PRODUCTION E2E INTEGRATION TESTS PASSED! (100%)")
    print("==================================================")

if __name__ == "__main__":
    run_test()
