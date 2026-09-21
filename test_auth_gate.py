import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def get(path):
    url = f"{BASE_URL}{urllib.parse.quote(path, safe='/?=&')}"
    req = urllib.request.Request(url, headers={"User-Agent": "BharatConnectAuthTest/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def post(path, data):
    url = f"{BASE_URL}{path}"
    encoded = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=encoded, headers={
        "Content-Type": "application/json",
        "User-Agent": "BharatConnectAuthTest/1.0"
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def get_html(path="/"):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "BharatConnectAuthTest/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.read().decode('utf-8')

def run_all_auth_tests():
    print("\n=======================================================")
    print("   BHARATCONNECT AI - STEP 1C AUTHENTICATION GATE TESTS")
    print("=======================================================\n")

    # Test 1: HTML Landing Screen and Gated Main Content
    print("Test 1: Verification of Landing Screen and Locked Main Content Markup")
    status, html = get_html("/")
    assert status == 200, f"Expected 200, got {status}"
    assert 'id="auth-landing-screen"' in html, "Missing #auth-landing-screen in index.html"
    assert 'id="main-app-content"' in html, "Missing #main-app-content in index.html"
    assert 'id="main-app-content" class="hidden"' in html, "#main-app-content must be hidden by default"
    assert 'display: none !important' in html, "#main-app-content must have display: none !important"
    assert 'Welcome to' in html and 'BharatConnect AI' in html, "Missing 'Welcome to BharatConnect AI' headline"
    assert 'id="landing-signin-btn"' in html, "Missing #landing-signin-btn"
    assert 'id="landing-register-btn"' in html, "Missing #landing-register-btn"
    assert 'Register' in html, "Missing 'Register' button text"
    assert 'id="signin-modal"' in html, "Missing #signin-modal"
    assert 'id="signin-form"' in html, "Missing #signin-form"
    assert 'id="signin-email"' in html, "Missing #signin-email"
    assert 'id="signin-password"' in html, "Missing #signin-password"
    assert 'id="signin-error-alert"' in html, "Missing #signin-error-alert"
    assert 'id="nav-guest-actions"' in html, "Missing #nav-guest-actions"
    assert 'id="nav-user-actions"' in html, "Missing #nav-user-actions"
    assert 'id="nav-logout-btn"' in html, "Missing #nav-logout-btn"
    print("  [PASS] Landing screen present, Welcome to BharatConnect AI verified, main app locked with display:none !important, and all auth elements verified.")

    # Test 2: Login with unregistered email returns 401
    print("\nTest 2: Login rejection with nonexistent email")
    status, res = post("/api/auth/login", {
        "email": "nonexistent_traveler_999@example.com",
        "password": "Password123!"
    })
    assert status == 401, f"Expected HTTP 401, got {status}"
    assert "Invalid email or password" in res.get("detail", ""), f"Unexpected error message: {res}"
    print(f"  [PASS] Correctly rejected with HTTP 401: '{res.get('detail')}'")

    # Test 3: Register a fresh user and verify immediate session token generation
    print("\nTest 3: New user registration and automatic session issuance")
    timestamp = int(time.time() * 1000)
    test_email = f"authed_traveler_{timestamp}@example.com"
    reg_payload = {
        "full_name": "Eleanor Vance",
        "email": test_email,
        "phone": "+1 555 342 9871",
        "country": "United Kingdom",
        "password": "RoyalSafari2026!",
        "confirm_password": "RoyalSafari2026!",
        "terms_accepted": True,
        "traveler_type": "Solo Traveler"
    }
    status, reg_res = post("/api/auth/register", reg_payload)
    assert status == 200, f"Registration failed with status {status}: {reg_res}"
    assert reg_res.get("success") is True, "Registration success flag is not True"
    assert "session_token" in reg_res, "Registration must return session_token"
    assert reg_res["session_token"].startswith("bc_sess_"), f"Unexpected token prefix: {reg_res['session_token']}"
    assert "user" in reg_res, "Registration must return user object"
    assert "password" not in reg_res["user"], "SECURITY ERROR: Password leaked in user object"
    assert "password_hash" not in reg_res["user"], "SECURITY ERROR: Password hash leaked in user object"
    assert "salt" not in reg_res["user"], "SECURITY ERROR: Salt leaked in user object"
    session_token = reg_res["session_token"]
    print(f"  [PASS] Registered successfully. Session token generated: {session_token[:16]}... Password omitted.")

    # Test 4: Verify Session via GET /api/auth/me
    print("\nTest 4: Session validation via GET /api/auth/me")
    status, me_res = get(f"/api/auth/me?token={session_token}")
    assert status == 200, f"Session verification failed with status {status}: {me_res}"
    assert me_res.get("authenticated") is True, "Expected authenticated == True"
    assert me_res["user"]["email"] == test_email.lower(), "User email mismatch"
    assert me_res["user"]["full_name"] == "Eleanor Vance", "User full_name mismatch"
    print(f"  [PASS] Valid session verified for: {me_res['user']['full_name']} ({me_res['user']['email']})")

    # Test 5: Login with valid registered credentials
    print("\nTest 5: Sign In with valid registered credentials")
    status, login_res = post("/api/auth/login", {
        "email": test_email,
        "password": "RoyalSafari2026!"
    })
    assert status == 200, f"Expected HTTP 200, got {status}: {login_res}"
    assert login_res.get("success") is True, "Expected success == True"
    assert "session_token" in login_res, "Missing session_token in login response"
    assert login_res["user"]["email"] == test_email.lower(), "Email mismatch in user object"
    assert "password" not in login_res["user"], "SECURITY ERROR: Password leaked in login response"
    new_token = login_res["session_token"]
    print(f"  [PASS] Sign In succeeded. New session token: {new_token[:16]}...")

    # Test 6: Login with wrong password
    print("\nTest 6: Sign In rejection with incorrect password")
    status, bad_res = post("/api/auth/login", {
        "email": test_email,
        "password": "WrongPassword999!"
    })
    assert status == 401, f"Expected HTTP 401, got {status}"
    assert "Invalid email or password" in bad_res.get("detail", ""), f"Unexpected error message: {bad_res}"
    print(f"  [PASS] Rejected invalid password with HTTP 401: '{bad_res.get('detail')}'")

    # Test 7: Logout functionality via POST /api/auth/logout
    print("\nTest 7: Logout and session destruction via POST /api/auth/logout")
    status, logout_res = post("/api/auth/logout", {"token": new_token})
    assert status == 200, f"Expected HTTP 200, got {status}: {logout_res}"
    assert logout_res.get("success") is True, "Expected logout success == True"
    print("  [PASS] Logout endpoint responded with success.")

    # Test 8: Validating destroyed token returns 401
    print("\nTest 8: Confirm destroyed token is now invalid")
    status, invalid_me = get(f"/api/auth/me?token={new_token}")
    assert status == 401, f"Expected HTTP 401 for invalidated session, got {status}"
    print(f"  [PASS] Destroyed session properly rejected with HTTP 401: '{invalid_me.get('detail')}'")

    # Test 9: GET /api/auth/me without token returns 401
    print("\nTest 9: Accessing /api/auth/me without token")
    status, no_token_res = get("/api/auth/me")
    assert status == 401, f"Expected HTTP 401 when no token provided, got {status}"
    print("  [PASS] Correctly rejected unauthenticated call with HTTP 401.")

    print("\n=======================================================")
    print("   ALL STEP 1C AUTHENTICATION GATE TESTS PASSED 100%!  ")
    print("=======================================================\n")

if __name__ == "__main__":
    run_all_auth_tests()
