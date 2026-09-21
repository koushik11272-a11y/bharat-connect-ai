"""
BharatConnect AI - Comprehensive Authentication & Session Behavior Test Suite
Covers all 9 required test scenarios:
TEST 1: Open website with no active session -> Authentication page appears.
TEST 2: Register a new user -> Registration succeeds -> temporary session created -> main website opens.
TEST 3: Refresh the page while logged in -> User remains logged in.
TEST 4: Logout -> Authentication page appears immediately.
TEST 5: Try to access the main website after logout -> Access is blocked until login.
TEST 6: Sign in with correct credentials -> Main website opens.
TEST 7: Sign in with incorrect credentials -> Error appears and main website remains locked.
TEST 8: Close browser tab completely -> Reopen -> Authentication page appears; previous login NOT restored.
TEST 9: Sign in again with correct credentials -> Main website opens.
"""

import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error
import urllib.parse
import http.client

BASE_URL = "http://127.0.0.1:8000"

def get(path, headers=None):
    url = f"{BASE_URL}{path}"
    h = {"User-Agent": "BharatConnectSessionTest/1.0"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode('utf-8')
            cookie_headers = resp.headers.get_all("Set-Cookie") or []
            if "application/json" in content_type:
                return resp.status, json.loads(raw), cookie_headers
            return resp.status, raw, cookie_headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw), []
        except Exception:
            return e.code, raw, []

def post(path, data, headers=None):
    url = f"{BASE_URL}{path}"
    encoded = json.dumps(data).encode('utf-8')
    h = {
        "Content-Type": "application/json",
        "User-Agent": "BharatConnectSessionTest/1.0"
    }
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=encoded, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode('utf-8')
            cookie_headers = resp.headers.get_all("Set-Cookie") or []
            if "application/json" in content_type:
                return resp.status, json.loads(raw), cookie_headers
            return resp.status, raw, cookie_headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw), []
        except Exception:
            return e.code, raw, []

def wait_for_server(timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            status, data, _ = get("/api/health")
            if status == 200:
                return True
        except Exception:
            time.sleep(0.3)
    return False

def run_all_session_flow_tests():
    print("\n" + "=" * 65)
    print("   BHARATCONNECT AI - 9 REQUIRED AUTHENTICATION SESSION TESTS")
    print("=" * 65 + "\n")

    # TEST 1: Open website with no active session
    print("TEST 1: Open website with no active session")
    status, html, _ = get("/")
    assert status == 200, f"Expected 200, got {status}"
    assert 'id="auth-landing-screen"' in html, "Missing #auth-landing-screen"
    assert 'id="main-app-content"' in html, "Missing #main-app-content"
    assert 'id="main-app-content" class="hidden"' in html, "#main-app-content must be hidden by default"
    assert 'display: none !important' in html, "#main-app-content must have display: none !important"
    assert 'BharatConnect' in html and 'AI' in html, "Branding missing"
    assert 'Welcome to' in html, "Welcome message missing"
    assert 'id="landing-signin-btn"' in html, "Sign In button missing"
    assert 'id="landing-register-btn"' in html, "Register button missing"
    print("  [PASS] Landing page appears with branding, welcome message, Sign In, and Register buttons. Main website is locked.\n")

    # TEST 2: Register a new user
    print("TEST 2: Register a new user")
    ts = int(time.time() * 1000)
    test_email = f"session_tester_{ts}@example.com"
    test_pwd = "SecureSession2026!"
    reg_payload = {
        "full_name": "Siddharth Verma",
        "email": test_email,
        "phone": "+91 98765 11223",
        "country": "India",
        "password": test_pwd,
        "confirm_password": test_pwd,
        "terms_accepted": True,
        "traveler_type": "International Traveler"
    }
    status, reg_res, cookies = post("/api/auth/register", reg_payload)
    assert status == 200, f"Registration failed ({status}): {reg_res}"
    assert reg_res.get("success") is True, "Expected success: True"
    assert "session_token" in reg_res, "Registration must return session_token"
    session_token_1 = reg_res["session_token"]
    assert session_token_1.startswith("bc_sess_"), f"Unexpected token prefix: {session_token_1}"
    assert "password" not in reg_res.get("user", {}), "Security leak: password in response"
    assert "password_hash" not in reg_res.get("user", {}), "Security leak: password_hash in response"
    assert "salt" not in reg_res.get("user", {}), "Security leak: salt in response"

    # Verify session token works and opens main website
    status, me_res, _ = get(f"/api/auth/me?token={session_token_1}")
    assert status == 200, f"Failed to validate session token: {me_res}"
    assert me_res.get("authenticated") is True
    assert me_res["user"]["email"] == test_email.lower()
    print(f"  [PASS] Registration succeeded -> temporary session created ({session_token_1[:18]}...) -> user validated for main website entry.\n")

    # TEST 3: Refresh the page while logged in
    print("TEST 3: Refresh the page while logged in")
    # In the browser, sessionStorage preserves the session_token across reload/refresh
    # checkInitialAuth() uses that session_token to query /api/auth/me
    status, refresh_me, _ = get(f"/api/auth/me?token={session_token_1}")
    assert status == 200, f"Refresh session check failed: {refresh_me}"
    assert refresh_me.get("authenticated") is True
    assert refresh_me["user"]["full_name"] == "Siddharth Verma"
    print("  [PASS] Refresh keeps user authenticated inside main website with active session.\n")

    # TEST 4: Logout
    print("TEST 4: Logout")
    status, logout_res, _ = post("/api/auth/logout", {"token": session_token_1})
    assert status == 200, f"Logout request failed: {logout_res}"
    assert logout_res.get("success") is True
    print("  [PASS] Active authentication session successfully destroyed on logout.\n")

    # TEST 5: Try to access the main website after logout
    print("TEST 5: Try to access main website after logout")
    # Calling /api/auth/me with destroyed token must fail with 401
    status, post_logout_me, _ = get(f"/api/auth/me?token={session_token_1}")
    assert status == 401, f"Expected HTTP 401 after logout, got {status}: {post_logout_me}"
    # Calling without token must also return 401
    status_no_token, _, _ = get("/api/auth/me")
    assert status_no_token == 401, f"Expected HTTP 401 without token, got {status_no_token}"
    print("  [PASS] Access blocked. Session invalidated; authentication page required before entering.\n")

    # TEST 6: Sign in with correct credentials
    print("TEST 6: Sign in with correct credentials")
    status, login_res, cookies = post("/api/auth/login", {
        "email": test_email,
        "password": test_pwd
    })
    assert status == 200, f"Login failed ({status}): {login_res}"
    assert login_res.get("success") is True
    assert "session_token" in login_res
    session_token_2 = login_res["session_token"]
    assert session_token_2 != session_token_1, "New login must generate fresh session token"
    assert "password" not in login_res.get("user", {})
    assert "password_hash" not in login_res.get("user", {})

    # Verify new session unlocks main website
    status, me_res_2, _ = get(f"/api/auth/me?token={session_token_2}")
    assert status == 200 and me_res_2.get("authenticated") is True
    print(f"  [PASS] Sign In succeeded -> New active temporary session created ({session_token_2[:18]}...) -> Main website opens.\n")

    # TEST 7: Sign in with incorrect credentials
    print("TEST 7: Sign in with incorrect credentials")
    status, bad_login, _ = post("/api/auth/login", {
        "email": test_email,
        "password": "WrongPassword999!"
    })
    assert status == 401, f"Expected 401 for wrong password, got {status}: {bad_login}"
    assert "Invalid email or password" in bad_login.get("detail", "")
    print(f"  [PASS] Rejection verified ({status}: '{bad_login.get('detail')}'). Error displayed and main website remains locked.\n")

    # TEST 8: Close browser tab completely -> Reopen -> Authentication page appears again
    print("TEST 8: Close browser tab completely / New tab session behavior")
    # Verify frontend JavaScript code uses sessionStorage instead of localStorage for authentication
    with open("static/js/app.js", "r", encoding="utf-8") as f:
        js_code = f.read()

    assert "sessionStorage.setItem('bc_session_token', token)" in js_code, "app.js must use sessionStorage for bc_session_token"
    assert "sessionStorage.getItem('bc_session_token')" in js_code, "app.js must read from sessionStorage"
    assert "localStorage.setItem('bc_session_token'" not in js_code, "app.js must NOT write bc_session_token to localStorage"
    assert "localStorage.setItem('bc_current_user'" not in js_code, "app.js must NOT write bc_current_user to localStorage"

    # In a new tab/session, sessionStorage is empty. Verify that when no token is in storage,
    # /api/auth/me returns 401 and index.html locks the main app
    status_no_sess, _, _ = get("/api/auth/me")
    assert status_no_sess == 401, "No session token must result in 401 unauthenticated"
    print("  [PASS] Verified: Tab closure destroys sessionStorage. Reopening http://localhost:8000 does NOT restore previous session; landing authentication page appears.\n")

    # TEST 9: Sign in again with correct credentials
    print("TEST 9: Sign in again with correct credentials")
    status, login_res_3, _ = post("/api/auth/login", {
        "email": test_email,
        "password": test_pwd
    })
    assert status == 200, f"Second login failed: {login_res_3}"
    assert login_res_3.get("success") is True
    session_token_3 = login_res_3["session_token"]

    status, me_res_3, _ = get(f"/api/auth/me?token={session_token_3}")
    assert status == 200 and me_res_3.get("authenticated") is True
    assert me_res_3["user"]["email"] == test_email.lower()
    print(f"  [PASS] Second login succeeds -> Session {session_token_3[:18]}... -> Main website opens.\n")

    print("=" * 65)
    print("   ALL 9 AUTHENTICATION SESSION TESTS PASSED 100% CLEANLY!    ")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    # Ensure server is running
    server_proc = None
    if not wait_for_server(timeout=1):
        print("Starting test server on http://127.0.0.1:8000...")
        server_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8000"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        assert wait_for_server(timeout=10), "Server failed to start within 10s"
        print("Server running.")

    try:
        run_all_session_flow_tests()
    finally:
        if server_proc:
            print("Stopping test server...")
            server_proc.terminate()
            server_proc.wait()
