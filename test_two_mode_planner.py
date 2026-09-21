#!/usr/bin/env python3
"""
test_two_mode_planner.py

Comprehensive Test Suite for STEP 2 (Two-Mode AI Trip Planner & My Trips) using stdlib urllib:
1. Automated AI Plan generation (POST /api/plan-trip)
2. Bespoke Custom Plan generation (POST /api/trips/custom)
3. Unauthenticated access protection (HTTP 401 on /api/trips)
4. User trip saving (POST /api/trips)
5. User trip retrieval (GET /api/trips)
6. User data isolation (User B cannot see or delete User A's trips)
7. Full itinerary viewing (GET /api/trips/{id} and GET /api/itinerary/{id})
8. Trip deletion (DELETE /api/trips/{id})
9. Frontend static asset inspection (index.html, app.js)
"""

import sys
import json
import uuid
import urllib.request
import urllib.error
import urllib.parse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"

def request_json(method, path, body=None, headers=None):
    url = f"{BASE_URL}{path}"
    h = {"User-Agent": "BharatConnectTest/2.0"}
    if headers:
        h.update(headers)
    
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h["Content-Type"] = "application/json"
        
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"detail": raw}

def test_automated_ai_planner():
    print("\n--- 1. Testing Option 1: Automated AI Trip Planner (/api/plan-trip) ---")
    payload = {
        "origin_country": "United States",
        "destination": "Golden Triangle (Delhi, Agra, Jaipur)",
        "duration_days": 5,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "budget_usd": 3000,
        "travel_style": "Cultural",
        "interests": ["Heritage Architecture", "Royal Food"],
        "preferred_language": "English",
        "accommodation": "Heritage Haveli & Boutique",
        "transportation": "Private Chauffeur & High-speed Rail"
    }
    status, data = request_json("POST", "/api/plan-trip", payload)
    assert status == 200, f"Expected 200, got {status}: {data}"
    assert data.get("id"), "Plan missing ID"
    assert data.get("mode") == "ai", f"Expected mode 'ai', got {data.get('mode')}"
    assert data.get("duration_days") == 5, f"Expected 5 days, got {data.get('duration_days')}"
    assert len(data.get("itinerary", [])) == 5, f"Expected 5 itinerary days, got {len(data.get('itinerary', []))}"
    assert "budget_breakdown" in data, "Missing budget_breakdown"
    assert "matched_guides" in data, "Missing matched_guides"
    assert "safety_and_cultural_tips" in data, "Missing safety_and_cultural_tips"
    print(f"✓ AI Plan successfully generated: '{data.get('title')}' with {len(data['itinerary'])} days.")
    return data

def test_custom_planner():
    print("\n--- 2. Testing Option 2: Bespoke Custom Trip Planner (/api/trips/custom) ---")
    payload = {
        "destination": "Kerala Backwaters & Spice Coast",
        "duration_days": 4,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "budget_usd": 2800,
        "guide_id": "guide-2", # Priya Nair
        "experience_ids": ["exp-3", "exp-4"],
        "accommodation": "Eco-Resorts & Tea Estates",
        "transportation": "Private Chauffeur Luxury SUV",
        "daily_pace": "Relaxed & Mindful (1-2 Key Highlights)",
        "custom_notes": "Must include traditional ayurvedic consultation and organic pepper harvest tour."
    }
    status, data = request_json("POST", "/api/trips/custom", payload)
    assert status == 200, f"Expected 200, got {status}: {data}"
    assert data.get("id"), "Custom plan missing ID"
    assert data.get("mode") == "custom", f"Expected mode 'custom', got {data.get('mode')}"
    assert data.get("duration_days") == 4, f"Expected 4 days, got {data.get('duration_days')}"
    assert len(data.get("itinerary", [])) == 4, f"Expected 4 itinerary days, got {len(data.get('itinerary', []))}"
    assert data.get("daily_pace") == "Relaxed & Mindful (1-2 Key Highlights)"
    assert "Priya Nair" in [g.get("name") for g in data.get("matched_guides", [])], "Priya Nair not matched"
    print(f"✓ Custom Plan successfully generated: '{data.get('title')}' with guide {data['matched_guides'][0]['name']}.")
    return data

def test_unauthenticated_protection():
    print("\n--- 3. Testing Unauthenticated Protection on /api/trips ---")
    
    # 3a. GET /api/trips without auth
    status, data = request_json("GET", "/api/trips")
    assert status == 401, f"Expected 401 for unauthenticated GET, got {status}: {data}"
    print("✓ Unauthenticated GET /api/trips correctly rejected with HTTP 401.")

    # 3b. POST /api/trips without auth
    status, data = request_json("POST", "/api/trips", {"trip": {"title": "Unauthorized Trip"}})
    assert status == 401, f"Expected 401 for unauthenticated POST, got {status}: {data}"
    print("✓ Unauthenticated POST /api/trips correctly rejected with HTTP 401.")

    # 3c. DELETE /api/trips/xyz without auth
    status, data = request_json("DELETE", "/api/trips/fake-trip-id")
    assert status == 401, f"Expected 401 for unauthenticated DELETE, got {status}: {data}"
    print("✓ Unauthenticated DELETE /api/trips/xyz correctly rejected with HTTP 401.")

def test_user_saving_and_isolation(ai_trip, custom_trip):
    print("\n--- 4. Testing User Trip Saving & Data Isolation ---")
    
    # Create User A
    user_a_email = f"user_a_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "SecurePassword123!"
    status, reg_a = request_json("POST", "/api/auth/register", {
        "full_name": "Traveler Alice",
        "email": user_a_email,
        "phone": "+1 415 555 0101",
        "country": "United States",
        "password": pwd,
        "confirm_password": pwd
    })
    assert status == 200, f"User A registration failed: {reg_a}"
    token_a = reg_a["session_token"]
    user_a_id = reg_a["user"]["id"]
    print(f"✓ Registered User A ({user_a_email}, ID: {user_a_id})")

    # Create User B
    user_b_email = f"user_b_{uuid.uuid4().hex[:6]}@example.com"
    status, reg_b = request_json("POST", "/api/auth/register", {
        "full_name": "Traveler Bob",
        "email": user_b_email,
        "phone": "+1 415 555 0202",
        "country": "United Kingdom",
        "password": pwd,
        "confirm_password": pwd
    })
    assert status == 200, f"User B registration failed: {reg_b}"
    token_b = reg_b["session_token"]
    user_b_id = reg_b["user"]["id"]
    print(f"✓ Registered User B ({user_b_email}, ID: {user_b_id})")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 4a. User A saves AI trip
    status, save_res_1 = request_json("POST", "/api/trips", {"trip": ai_trip}, headers_a)
    assert status == 200, f"User A save AI trip failed: {save_res_1}"
    saved_ai_trip = save_res_1["trip"]
    trip_1_id = saved_ai_trip["id"]
    assert saved_ai_trip["user_id"] == user_a_id
    print(f"✓ User A saved AI trip '{saved_ai_trip['title']}' (ID: {trip_1_id})")

    # 4b. User A saves Custom trip
    status, save_res_2 = request_json("POST", "/api/trips", {"trip": custom_trip}, headers_a)
    assert status == 200, f"User A save Custom trip failed: {save_res_2}"
    saved_custom_trip = save_res_2["trip"]
    trip_2_id = saved_custom_trip["id"]
    assert saved_custom_trip["user_id"] == user_a_id
    print(f"✓ User A saved Custom trip '{saved_custom_trip['title']}' (ID: {trip_2_id})")

    # 4c. User A retrieves their trips
    status, get_res_a = request_json("GET", "/api/trips", headers=headers_a)
    assert status == 200
    trips_a = get_res_a["trips"]
    assert len(trips_a) == 2, f"Expected 2 trips for User A, found {len(trips_a)}"
    print(f"✓ User A successfully retrieved {len(trips_a)} saved trips.")

    # 4d. User B retrieves their trips (must be 0!)
    status, get_res_b = request_json("GET", "/api/trips", headers=headers_b)
    assert status == 200
    trips_b = get_res_b["trips"]
    assert len(trips_b) == 0, f"Expected 0 trips for User B, found {len(trips_b)}"
    print("✓ User B cannot see User A's trips (User B trip count is 0).")

    # 4e. User B tries to view User A's single trip
    status, res_b_view = request_json("GET", f"/api/trips/{trip_1_id}", headers=headers_b)
    assert status == 403, f"Expected 403 for unauthorized trip view, got {status}: {res_b_view}"
    print(f"✓ User B prevented from viewing User A's trip (HTTP 403 Forbidden).")

    # 4f. User B tries to delete User A's trip
    status, res_b_del = request_json("DELETE", f"/api/trips/{trip_1_id}", headers=headers_b)
    assert status == 403, f"Expected 403 for unauthorized trip deletion, got {status}: {res_b_del}"
    print(f"✓ User B prevented from deleting User A's trip (HTTP 403 Forbidden).")

    # 4g. User A views single trip
    status, res_a_view = request_json("GET", f"/api/trips/{trip_1_id}", headers=headers_a)
    assert status == 200
    assert res_a_view["trip"]["id"] == trip_1_id
    print(f"✓ User A successfully viewed full details of trip '{trip_1_id}'.")

    # 4h. Public /api/itinerary/{id} route check
    status, itin_res = request_json("GET", f"/api/itinerary/{trip_1_id}")
    assert status == 200
    assert itin_res["id"] == trip_1_id
    print(f"✓ Itinerary resolver GET /api/itinerary/{trip_1_id} returns full plan.")

    # 4i. User A deletes one trip
    status, del_res = request_json("DELETE", f"/api/trips/{trip_1_id}", headers=headers_a)
    assert status == 200
    print(f"✓ User A deleted trip '{trip_1_id}' successfully.")

    # 4j. Verify User A now has only 1 trip remaining
    status, get_res_a2 = request_json("GET", "/api/trips", headers=headers_a)
    trips_a2 = get_res_a2["trips"]
    assert len(trips_a2) == 1, f"Expected 1 trip remaining, found {len(trips_a2)}"
    assert trips_a2[0]["id"] == trip_2_id
    print(f"✓ User A has exactly 1 trip remaining ('{trips_a2[0]['title']}').")

def test_frontend_markup_and_js():
    print("\n--- 5. Testing Frontend Markup and JS Integration ---")
    
    # Check index.html
    with open("static/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    required_html_elements = [
        "mode-btn-ai",
        "mode-btn-custom",
        "ai-planner-form",
        "custom-planner-form",
        "save-trip-plan-btn",
        "my-trips",
        "my-trips-empty",
        "my-trips-grid",
        "nav-my-trips-link"
    ]
    for el in required_html_elements:
        assert el in html, f"Missing required element '{el}' in static/index.html"
        print(f"  ✓ Found '{el}' in index.html")

    # Check app.js
    with open("static/js/app.js", "r", encoding="utf-8") as f:
        js = f.read()

    required_js_functions = [
        "switchPlannerMode",
        "handleTripPlanSubmit",
        "handleCustomPlanSubmit",
        "saveCurrentItinerary",
        "loadUserTrips",
        "renderUserTrips",
        "viewSavedTrip",
        "deleteSavedTrip",
        "resetAndFocusPlanner"
    ]
    for fn in required_js_functions:
        assert fn in js, f"Missing required function '{fn}' in static/js/app.js"
        print(f"  ✓ Found '{fn}' in app.js")

def main():
    print("=" * 70)
    print("BHARATCONNECT AI - STEP 2 TWO-MODE PLANNER & MY TRIPS TEST SUITE")
    print("=" * 70)

    try:
        ai_trip = test_automated_ai_planner()
        custom_trip = test_custom_planner()
        test_unauthenticated_protection()
        test_user_saving_and_isolation(ai_trip, custom_trip)
        test_frontend_markup_and_js()
        print("\n" + "=" * 70)
        print("ALL STEP 2 TWO-MODE PLANNER & MY TRIPS TESTS PASSED CLEANLY! (100%)")
        print("=" * 70)
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
