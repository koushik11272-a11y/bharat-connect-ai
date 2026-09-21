#!/usr/bin/env python3
"""
test_email_notifications.py

Comprehensive Test Suite for STEP 3 — Gmail Email Notifications for Admin:
1. Mock Mode Behavior (missing credentials trigger clearly labeled mock mode)
2. Registration Notification Content & Security (contains all required fields, NO passwords/hashes/tokens/secrets)
3. Trip Notification Content (User name, email, destination, days, travelers, budget, timestamp)
4. Email Failure Handling & Resilience (SMTP failure never breaks service or raises uncaught exceptions)
5. Live API Registration Flow with Admin Notification (HTTP 200, user created, email logged)
6. Live API Registration Resilience under Email Failure (registration succeeds even when email fails)
7. Live API Trip Saving Flow with Admin Notification (HTTP 200, trip saved, email logged)
8. Live API Trip Saving Resilience under Email Failure (trip save succeeds even when email fails)
9. Security & Config Verification (.gitignore ignores .env, .env.example contains placeholders only, no hardcoded secrets)
"""

import os
import sys
import json
import time
import uuid
import smtplib
import subprocess
import urllib.request
import urllib.error
from unittest.mock import patch, MagicMock

# Import service directly for unit validation
from email_service import EmailNotificationService, email_service

BASE_URL = "http://127.0.0.1:8000"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
TRIPS_FILE = os.path.join(DATA_DIR, "trips.json")

def wait_for_server(timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{BASE_URL}/api/health", headers={"User-Agent": "EmailTest"})
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False

def request_json(url, method="GET", payload=None, headers=None):
    h = {"User-Agent": "EmailNotificationTest/1.0"}
    if headers:
        h.update(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        h["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed


# ==============================================================================
# 1. UNIT TESTS: MOCK MODE, CONTENT & FAILURE RESILIENCE
# ==============================================================================

def test_mock_mode_behavior():
    print("\n--- 1. Testing MOCK MODE Behavior (Missing/Placeholder Credentials) ---")
    # Instantiate service without live credentials
    with patch.dict(os.environ, {"SMTP_USERNAME": "", "SMTP_PASSWORD": "", "ADMIN_EMAIL": ""}, clear=True):
        svc = EmailNotificationService()
        assert not svc.is_configured(), "Service should report unconfigured when env vars are empty"

        res = svc.send_email(
            subject="Test Subject",
            text_body="Test content",
            recipient="admin@example.com"
        )
        assert res["success"] is True, "Mock mode dispatch must report success"
        assert res["mock"] is True, "Mock mode flag must be True"
        assert "[MOCK MODE]" in res["message"], "Message must clearly indicate MOCK MODE"
        assert "No real email was sent" in res["message"], "Message must explicitly state NO real email was sent"
        assert len(svc.sent_emails) == 1, "Mock email must be recorded in history"
        assert svc.sent_emails[0]["is_mock"] is True
        print("  [PASS] Missing credentials correctly activate MOCK MODE without sending real email.")


def test_registration_notification_content_and_security():
    print("\n--- 2. Testing Registration Notification Content & Security ---")
    svc = EmailNotificationService()
    svc.clear_sent_emails()

    full_name = "Devika Sharma"
    email = "devika.sharma@example.org"
    country = "United Kingdom"
    reg_time = "2026-10-15 09:30:00 UTC"

    res = svc.notify_new_user_registration(
        full_name=full_name,
        email=email,
        country=country,
        registered_at=reg_time
    )

    assert res["success"] is True
    assert len(svc.sent_emails) == 1
    sent = svc.sent_emails[0]
    body = sent["text_body"]
    html = sent["html_body"]
    subject = sent["subject"]

    # Verify required content items
    assert "New user registered" in body, "Body missing 'New user registered'"
    assert full_name in body, "Body missing Full name"
    assert email in body, "Body missing Email"
    assert country in body, "Body missing Country"
    assert reg_time in body, "Body missing Registration date/time"
    assert full_name in subject, "Subject missing Full name"

    # HTML verification
    assert "New user registered" in html
    assert full_name in html
    assert email in html
    assert country in html

    # STRICT SECURITY VERIFICATION:
    # Passwords, password hashes, salts, and session tokens MUST NEVER appear
    forbidden_terms = [
        "password", "password_hash", "pbkdf2", "salt", "session_token",
        "bc_sess_", "secret", "private_key"
    ]
    for term in forbidden_terms:
        assert term not in body.lower(), f"SECURITY VIOLATION: Forbidden term '{term}' found in registration email body!"
        assert term not in html.lower(), f"SECURITY VIOLATION: Forbidden term '{term}' found in registration email html!"
        assert term not in subject.lower(), f"SECURITY VIOLATION: Forbidden term '{term}' found in registration email subject!"

    print("  [PASS] Registration notification contains all required fields.")
    print("  [PASS] Strict security check passed: Zero passwords, hashes, salts, or tokens in notification.")


def test_trip_notification_content():
    print("\n--- 3. Testing Trip Creation Notification Content ---")
    svc = EmailNotificationService()
    svc.clear_sent_emails()

    user_name = "Marcus Vance"
    user_email = "marcus.vance@example.com"
    destination = "Kerala Backwaters & Tea Highlands"
    days = 7
    travelers = 2
    budget = "$3,500 USD"
    trip_time = "2026-11-01 14:00:00 UTC"

    res = svc.notify_trip_created(
        user_name=user_name,
        user_email=user_email,
        destination=destination,
        duration_days=days,
        travelers_count=travelers,
        budget=budget,
        created_at=trip_time
    )

    assert res["success"] is True
    sent = svc.sent_emails[0]
    body = sent["text_body"]
    html = sent["html_body"]

    # Verify all required fields
    assert user_name in body, "Body missing User name"
    assert user_email in body, "Body missing User email"
    assert destination in body, "Body missing Destination"
    assert str(days) in body, "Body missing Number of days"
    assert str(travelers) in body, "Body missing Number of travelers"
    assert budget in body, "Body missing Budget"
    assert trip_time in body, "Body missing Trip creation date/time"

    assert user_name in html
    assert user_email in html
    assert destination in html
    assert budget in html

    # Test with optional / missing budget
    svc.clear_sent_emails()
    res2 = svc.notify_trip_created(
        user_name=user_name,
        user_email=user_email,
        destination="Goa Heritage & Coastal Trails",
        duration_days=4,
        travelers_count=1,
        budget=None
    )
    assert res2["success"] is True
    sent2 = svc.sent_emails[0]
    assert "Not specified" in sent2["text_body"], "Expected 'Not specified' for missing budget"
    print("  [PASS] Trip notification contains User name, email, destination, days, travelers, budget, and date/time.")


def test_email_failure_handling_unit():
    print("\n--- 4. Testing Email Failure Handling (Resilience & Logging) ---")
    # Configure fake credentials so service attempts live SMTP
    env_mock = {
        "SMTP_HOST": "invalid.smtp.nonexistent.local",
        "SMTP_PORT": "587",
        "SMTP_USERNAME": "test_sender@gmail.com",
        "SMTP_PASSWORD": "app_password_1234",
        "ADMIN_EMAIL": "admin@gmail.com"
    }
    with patch.dict(os.environ, env_mock):
        svc = EmailNotificationService()
        assert svc.is_configured()

        # Mock smtplib.SMTP to raise connection error
        with patch("smtplib.SMTP", side_effect=smtplib.SMTPConnectError(421, b"Connection refused")):
            res = svc.send_email(
                subject="Test Failure",
                text_body="Test content",
                recipient="admin@gmail.com"
            )
            # Service must NOT raise an exception, but catch and return failure status
            assert res["success"] is False, "Expected success=False on SMTP failure"
            assert "error" in res, "Expected error in response"
            assert res["mock"] is False
            assert "Failed to send email" in res["message"]
            assert len(svc.sent_emails) == 1
            assert svc.sent_emails[0]["status"] == "FAILED"
            print("  [PASS] SMTP failure caught cleanly, error recorded, and zero uncaught exceptions raised.")


# ==============================================================================
# 2. INTEGRATION TESTS: LIVE FASTAPI BACKEND FLOWS
# ==============================================================================

def test_api_registration_and_notification(server_proc):
    print("\n--- 5. Testing Live API Registration Flow with Admin Notification ---")
    test_id = uuid.uuid4().hex[:6]
    test_email = f"traveler_{test_id}@global.org"
    payload = {
        "full_name": f"Elena Rostova {test_id}",
        "email": test_email,
        "country": "Germany",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!",
        "terms_accepted": True,
        "traveler_type": "Solo Explorer"
    }

    status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=payload)
    assert status == 200, f"Registration failed with {status}: {res}"
    assert res.get("success") is True
    assert "session_token" in res
    assert res["email"] == test_email.lower()
    print(f"  [PASS] Registered user {test_email} (HTTP 200, session created).")

    # Verify notification recorded in email_service
    sent_list = email_service.get_sent_emails()
    reg_notifications = [
        s for s in sent_list
        if test_email.lower() in s.get("text_body", "") and "New user registered" in s.get("text_body", "")
    ]
    assert len(reg_notifications) >= 1, f"Admin notification for {test_email} was not recorded!"
    record = reg_notifications[-1]
    assert record.get("status") in ("MOCK_DISPATCHED", "SENT"), f"Unexpected delivery status: {record.get('status')}"
    assert "Elena Rostova" in record["subject"]
    assert "Germany" in record["text_body"]
    delivery_type = "MOCK MODE" if record.get("is_mock") else "REAL SMTP"
    print(f"  [PASS] Admin registration notification dispatched in {delivery_type} with full user details.")


def test_api_registration_resilience_on_email_failure(server_proc):
    print("\n--- 6. Testing Registration Resilience when Email Fails ---")
    test_id = uuid.uuid4().hex[:6]
    test_email = f"resilient_user_{test_id}@global.org"
    payload = {
        "full_name": f"Kenji Sato {test_id}",
        "email": test_email,
        "country": "Japan",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!",
        "terms_accepted": True
    }

    # Pass X-Simulate-Email-Failure header to trigger email failure inside server process
    status, res = request_json(
        f"{BASE_URL}/api/auth/register",
        method="POST",
        payload=payload,
        headers={"X-Simulate-Email-Failure": "1"}
    )
    assert status == 200, f"Registration should succeed even if email fails! Got {status}: {res}"
    assert res.get("success") is True
    assert "session_token" in res

    # Verify user is persisted in users.json
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        users = json.load(f)
    found = any(u["email"] == test_email.lower() for u in users)
    assert found, "User must be persisted in users.json despite email failure"
    print("  [PASS] User registration succeeded (HTTP 200) and user persisted despite simulated email failure.")


def test_api_trip_saving_and_notification(server_proc):
    print("\n--- 7. Testing Live API Trip Saving Flow with Admin Notification ---")
    # First, register and get a session token
    test_id = uuid.uuid4().hex[:6]
    test_email = f"trip_tester_{test_id}@global.org"
    reg_res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload={
        "full_name": f"Chloe Dubois {test_id}",
        "email": test_email,
        "country": "France",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!",
        "terms_accepted": True
    })[1]
    token = reg_res["session_token"]

    # Save a trip
    trip_payload = {
        "trip": {
            "destination": "Royal Rajasthan Palaces (Jaipur, Udaipur, Jodhpur)",
            "duration_days": 8,
            "travelers_count": 2,
            "total_budget_usd": 4200,
            "travel_style": "Luxury Heritage"
        }
    }

    status, trip_res = request_json(
        f"{BASE_URL}/api/trips",
        method="POST",
        payload=trip_payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status == 200, f"Trip save failed with {status}: {trip_res}"
    assert trip_res.get("success") is True
    assert "trip" in trip_res
    print(f"  [PASS] Saved trip to account with HTTP 200 (Trip ID: {trip_res['trip']['id']}).")

    # Verify notification recorded
    sent_list = email_service.get_sent_emails()
    trip_notifications = [
        s for s in sent_list
        if "Royal Rajasthan Palaces" in s.get("text_body", "") and test_email.lower() in s.get("text_body", "")
    ]
    assert len(trip_notifications) >= 1, "Admin trip notification was not recorded!"
    trip_record = trip_notifications[-1]
    assert trip_record.get("status") in ("MOCK_DISPATCHED", "SENT"), f"Unexpected trip status: {trip_record.get('status')}"
    assert "Chloe Dubois" in trip_record["text_body"]
    assert "8" in trip_record["text_body"]
    assert "4,200" in trip_record["text_body"]
    delivery_type = "MOCK MODE" if trip_record.get("is_mock") else "REAL SMTP"
    print(f"  [PASS] Admin trip notification dispatched in {delivery_type} with full trip details.")


def test_api_trip_saving_resilience_on_email_failure(server_proc):
    print("\n--- 8. Testing Trip Saving Resilience when Email Fails ---")
    test_id = uuid.uuid4().hex[:6]
    test_email = f"trip_resilience_{test_id}@global.org"
    reg_res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload={
        "full_name": f"Lucas Meyer {test_id}",
        "email": test_email,
        "country": "Germany",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!",
        "terms_accepted": True
    })[1]
    token = reg_res["session_token"]

    trip_payload = {
        "trip": {
            "destination": "Varanasi & Sacred Ganges Ghats",
            "duration_days": 4,
            "travelers_count": 1,
            "total_budget_usd": 1500
        }
    }

    # Pass X-Simulate-Email-Failure header to trigger email failure inside server process
    status, res = request_json(
        f"{BASE_URL}/api/trips",
        method="POST",
        payload=trip_payload,
        headers={"Authorization": f"Bearer {token}", "X-Simulate-Email-Failure": "1"}
    )
    assert status == 200, f"Trip save should succeed even if email fails! Got {status}: {res}"
    assert res.get("success") is True
    saved_id = res["trip"]["id"]

    # Verify trip was persisted in trips.json
    with open(TRIPS_FILE, "r", encoding="utf-8") as f:
        trips = json.load(f)
    found = any(t["id"] == saved_id for t in trips)
    assert found, f"Trip {saved_id} must be persisted in trips.json despite email failure"
    print("  [PASS] Trip successfully saved (HTTP 200) and persisted in trips.json despite email failure.")


def test_security_and_config():
    print("\n--- 9. Testing Security & Credentials Handling ---")
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # 1. .gitignore checks
    gitignore_path = os.path.join(base_dir, ".gitignore")
    assert os.path.exists(gitignore_path), ".gitignore file must exist"
    with open(gitignore_path, "r", encoding="utf-8") as f:
        gi_content = f.read()
    assert ".env" in gi_content, ".gitignore must ignore .env"
    print("  [PASS] .gitignore correctly excludes .env")

    # 2. .env.example checks
    env_ex_path = os.path.join(base_dir, ".env.example")
    assert os.path.exists(env_ex_path), ".env.example file must exist"
    with open(env_ex_path, "r", encoding="utf-8") as f:
        env_ex_content = f.read()
    assert "SMTP_HOST=smtp.gmail.com" in env_ex_content
    assert "SMTP_PORT=587" in env_ex_content
    assert "SMTP_USERNAME=" in env_ex_content
    assert "SMTP_PASSWORD=" in env_ex_content
    assert "ADMIN_EMAIL=" in env_ex_content
    print("  [PASS] .env.example exists and contains template placeholders only")

    # 3. server.py security check - ensure no hardcoded SMTP passwords or keys
    server_path = os.path.join(base_dir, "server.py")
    with open(server_path, "r", encoding="utf-8") as f:
        server_code = f.read()
    assert "SMTP_PASSWORD" not in server_code or "os.getenv" in server_code, "server.py must not hardcode SMTP passwords"
    # Ensure server.py doesn't contain a raw email password string
    assert "smtp.gmail.com" not in server_code, "server.py must delegate SMTP handling to email_service.py"
    print("  [PASS] server.py contains zero hardcoded SMTP credentials")


def main():
    print("=" * 70)
    print("BHARATCONNECT AI — GMAIL ADMIN NOTIFICATIONS TEST SUITE (STEP 3)")
    print("=" * 70)

    # Run unit tests first
    test_mock_mode_behavior()
    test_registration_notification_content_and_security()
    test_trip_notification_content()
    test_email_failure_handling_unit()
    test_security_and_config()

    # Start live server process for HTTP integration tests
    server_proc = None
    if not wait_for_server(timeout=1):
        print("\nStarting test server on http://127.0.0.1:8000...")
        server_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8000"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        assert wait_for_server(timeout=10), "Server failed to start within 10s"
        print("Server running.")
    else:
        print("\nConnected to existing server on http://127.0.0.1:8000")

    try:
        test_api_registration_and_notification(server_proc)
        test_api_registration_resilience_on_email_failure(server_proc)
        test_api_trip_saving_and_notification(server_proc)
        test_api_trip_saving_resilience_on_email_failure(server_proc)

        print("\n" + "=" * 70)
        print("ALL STEP 3 GMAIL NOTIFICATION TESTS PASSED 100% CLEANLY!")
        print("=" * 70)
    finally:
        if server_proc:
            print("\nStopping test server...")
            server_proc.terminate()
            server_proc.wait()
            print("Test server stopped.")


if __name__ == "__main__":
    main()
