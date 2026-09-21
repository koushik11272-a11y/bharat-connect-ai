import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error
import urllib.parse

BASE_URL = "http://127.0.0.1:8000"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")

def wait_for_server(timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{BASE_URL}/api/health", headers={"User-Agent": "RegTest"})
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False

def request_json(url, method="GET", payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json", "User-Agent": "RegTest"} if payload is not None else {"User-Agent": "RegTest"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed

def run_tests():
    server_process = None
    try:
        # Check if server is already running
        if not wait_for_server(timeout=1):
            print("Starting server process for automated testing...")
            server_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8000"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            assert wait_for_server(timeout=15), "Server failed to start within timeout"
            print("Server successfully started on http://127.0.0.1:8000")
        else:
            print("Connected to already running server on http://127.0.0.1:8000")

        print("\n=======================================================")
        print("   BHARATCONNECT AI — USER REGISTRATION TEST SUITE     ")
        print("=======================================================\n")

        test_ts = int(time.time())
        valid_email = f"test_user_{test_ts}@example.com"
        valid_user = {
            "full_name": "Aarav Patel",
            "email": valid_email,
            "phone": "+91 98765 43210",
            "country": "India",
            "password": "SecurePassword123!",
            "confirm_password": "SecurePassword123!",
            "terms_accepted": True,
            "traveler_type": "International Traveler"
        }

        # 1. Successful Registration (/api/auth/register)
        print("Test 1: Successful registration with all valid fields")
        status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=valid_user)
        assert status == 200, f"Expected 200, got {status}: {res}"
        assert res["success"] is True, f"Expected success: True, got {res}"
        assert "user_id" in res, "Missing user_id in response"
        assert res["email"] == valid_email.lower(), "Email mismatch in response"
        assert res["full_name"] == "Aarav Patel", "Name mismatch in response"
        assert res["phone"] == "+91 98765 43210", "Phone mismatch in response"
        assert res["country"] == "India", "Country mismatch in response"
        print(f"  [PASS] Successfully registered user: {res['user_id']} ({res['email']})")

        # 2. Never return passwords or hashes in response
        print("Test 2: Security check - Verify password and hash are never returned")
        assert "password" not in res, "CRITICAL: Plaintext password was returned in API response!"
        assert "password_hash" not in res, "CRITICAL: Password hash was returned in API response!"
        assert "salt" not in res, "CRITICAL: Salt was returned in API response!"
        print("  [PASS] Password, hash, and salt are safely omitted from response")

        # 3. Verify user is stored in data/users.json
        print("Test 3: Verify persistence in data/users.json")
        assert os.path.exists(USERS_FILE), f"users.json does not exist at {USERS_FILE}"
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            stored_users = json.load(f)
        matched = [u for u in stored_users if u["email"] == valid_email.lower()]
        assert len(matched) == 1, f"User {valid_email} not found in users.json"
        stored = matched[0]
        assert stored["full_name"] == "Aarav Patel", "Stored full_name mismatch"
        assert stored["phone"] == "+91 98765 43210", "Stored phone mismatch"
        assert stored["country"] == "India", "Stored country mismatch"
        assert "password" not in stored, "CRITICAL: Stored plaintext password in users.json!"
        assert "password_hash" in stored and len(stored["password_hash"]) == 64, "Missing or invalid password_hash in users.json"
        assert "salt" in stored and len(stored["salt"]) == 32, "Missing or invalid salt in users.json"
        assert stored["status"] == "active", "Stored status mismatch"
        print(f"  [PASS] User correctly persisted in data/users.json with secure PBKDF2 hash (total users: {len(stored_users)})")

        # 4. Prevent Duplicate Email Registration
        print("Test 4: Duplicate email prevention")
        dup_user = dict(valid_user)
        dup_user["full_name"] = "Different Name"
        # Test case-insensitive duplicate check
        dup_user["email"] = valid_email.upper()
        status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=dup_user)
        assert status == 400, f"Expected 400 Bad Request for duplicate email, got {status}: {res}"
        detail = res.get("detail", "")
        assert "already exists" in detail.lower() or "duplicate" in detail.lower(), f"Unexpected error message: {detail}"
        print(f"  [PASS] Rejected duplicate registration with HTTP 400: '{detail}'")

        # 5. Reject Invalid Email Format
        print("Test 5: Invalid email format rejection")
        invalid_emails = ["not-an-email", "user@", "user@domain", "user@.com", "@domain.com"]
        for bad_email in invalid_emails:
            bad_payload = dict(valid_user)
            bad_payload["email"] = bad_email
            status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=bad_payload)
            assert status == 400, f"Expected 400 for bad email '{bad_email}', got {status}: {res}"
        print(f"  [PASS] All {len(invalid_emails)} malformed email test cases rejected with HTTP 400")

        # 6. Reject Password Mismatch
        print("Test 6: Password mismatch rejection")
        mismatch_payload = dict(valid_user)
        mismatch_payload["email"] = f"mismatch_{test_ts}@example.com"
        mismatch_payload["password"] = "SecurePassword123!"
        mismatch_payload["confirm_password"] = "CompletelyDifferentPassword456!"
        status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=mismatch_payload)
        assert status == 400, f"Expected 400 for password mismatch, got {status}: {res}"
        assert "match" in res.get("detail", "").lower(), f"Unexpected error detail: {res}"
        print(f"  [PASS] Password mismatch rejected with HTTP 400: '{res.get('detail')}'")

        # 7. Reject Weak Password
        print("Test 7: Weak password rejection")
        weak_passwords = ["short", "1234567", "alllettersonly", "1234567890"]
        for weak_pwd in weak_passwords:
            weak_payload = dict(valid_user)
            weak_payload["email"] = f"weak_{weak_pwd}_{test_ts}@example.com"
            weak_payload["password"] = weak_pwd
            weak_payload["confirm_password"] = weak_pwd
            status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=weak_payload)
            assert status == 400, f"Expected 400 for weak password '{weak_pwd}', got {status}: {res}"
        print(f"  [PASS] Weak passwords rejected with HTTP 400")

        # 8. Reject Missing / Invalid Required Fields
        print("Test 8: Missing / Invalid required fields")
        # Empty full name
        bad_name_payload = dict(valid_user)
        bad_name_payload["email"] = f"noname_{test_ts}@example.com"
        bad_name_payload["full_name"] = " "
        status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=bad_name_payload)
        assert status in [400, 422], f"Expected 400/422 for empty name, got {status}: {res}"

        # Invalid phone
        bad_phone_payload = dict(valid_user)
        bad_phone_payload["email"] = f"nophone_{test_ts}@example.com"
        bad_phone_payload["phone"] = "abc12"
        status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=bad_phone_payload)
        assert status == 400, f"Expected 400 for invalid phone, got {status}: {res}"

        # Terms not accepted
        no_terms_payload = dict(valid_user)
        no_terms_payload["email"] = f"noterms_{test_ts}@example.com"
        no_terms_payload["terms_accepted"] = False
        status, res = request_json(f"{BASE_URL}/api/auth/register", method="POST", payload=no_terms_payload)
        assert status == 400, f"Expected 400 for unaccepted terms, got {status}: {res}"
        print("  [PASS] Empty name, invalid phone, and unaccepted terms properly rejected with HTTP 400")

        # 9. Verify /api/auth/signup backward compatibility endpoint
        print("Test 9: Backward compatibility endpoint /api/auth/signup")
        compat_email = f"compat_{test_ts}@example.com"
        compat_user = {
            "full_name": "Elena Rostova",
            "email": compat_email,
            "password": "SecurePassword123!",
            "origin_country": "United States",
            "traveler_type": "Heritage Explorer"
        }
        status, res = request_json(f"{BASE_URL}/api/auth/signup", method="POST", payload=compat_user)
        assert status == 200, f"Expected 200 on /api/auth/signup, got {status}: {res}"
        assert res["success"] is True, f"Expected success: True, got {res}"
        assert res["full_name"] == "Elena Rostova"
        print(f"  [PASS] /api/auth/signup backward compatibility verified: {res['user_id']}")

        print("\n=======================================================")
        print("   ALL REGISTRATION TESTS COMPLETED & PASSED CLEANLY!  ")
        print("=======================================================\n")

    finally:
        if server_process:
            print("Terminating test server process...")
            server_process.terminate()
            try:
                server_process.wait(timeout=3)
            except Exception:
                server_process.kill()
            print("Test server stopped.")

if __name__ == "__main__":
    run_tests()
