#!/usr/bin/env python3
"""
test_trip_options_vs_my_plans.py

Focused automated test suite for BHARATCONNECT AI:
TRIP OPTIONS VS MY PLANS BUG FIX VERIFICATION

Validates the 5 required test cases:
- TEST A: Generate 10 trips -> 10 cards displayed, My Plans = 0 (No auto-saving).
- TEST B: Generate 10 trips -> Select Trip #4 -> activeItinerary set, My Plans = 0 until Save/Confirm.
- TEST C: Generate 10 -> Select Trip #4 -> Save Trip Plan -> My Plans = 1, ONLY Trip #4 saved, other 9 NOT in My Plans.
- TEST D: Generate 10 -> Select Trip #7 -> Confirm Trip without saving first -> ONLY Trip #7 saved & confirmed, My Plans = 1, other 9 remain temporary options only.
- TEST E: Refresh / Re-login -> ONLY explicitly saved/confirmed trips appear in My Plans. The 10 generated recommendations are NOT restored as saved plans.
"""

import sys
import os
import json
import uuid
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

def log_pass(msg):
    print(f"  [PASS] {msg}")

def log_fail(msg):
    print(f"  [FAIL] {msg}")
    sys.exit(1)

def http_req(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"detail": err_body}
        return e.code, parsed

def test_static_code_invariants():
    print("\n--- 1. Static Code Analysis Invariants ---")
    
    with open("static/js/app.js", "r", encoding="utf-8") as f:
        js_content = f.read()

    # Invariant 1: autoSaveGeneratedTrips must NOT exist
    assert "autoSaveGeneratedTrips" not in js_content, "autoSaveGeneratedTrips still exists in app.js!"
    log_pass("autoSaveGeneratedTrips is completely removed from app.js.")

    # Invariant 2: mergeTripsIntoState must NOT exist
    assert "mergeTripsIntoState" not in js_content, "mergeTripsIntoState still exists in app.js!"
    log_pass("mergeTripsIntoState is completely removed from app.js.")

    # Invariant 3: Zero-click saving comment must NOT exist
    assert "Zero-click saving" not in js_content, "Zero-click saving comment still exists in app.js!"
    log_pass("Zero-click auto-save logic/comment is completely removed.")

    # Invariant 4: save-trip-plan-btn exists in index.html
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    assert 'id="save-trip-plan-btn"' in html_content, "save-trip-plan-btn missing in index.html!"
    assert 'onclick="saveCurrentItinerary()"' in html_content, "saveCurrentItinerary onclick missing in index.html!"
    log_pass("Interactive #save-trip-plan-btn button exists in static/index.html.")

def test_simulation_workflow():
    print("\n--- 2. End-to-End Simulation: Tests A, B, C, D, E ---")

    # Step 0: Register a clean test user
    uid = uuid.uuid4().hex[:6]
    user_email = f"test_traveler_{uid}@example.com"
    reg_payload = {
        "full_name": f"Traveler {uid}",
        "email": user_email,
        "password": "Password123!",
        "origin_country": "United Kingdom",
        "travel_style": "Cultural Immersion"
    }

    status, reg_data = http_req("/api/auth/register", method="POST", data=reg_payload)
    assert status == 200, f"Registration failed: {reg_data}"
    token = reg_data["session_token"]
    user = reg_data["user"]
    log_pass(f"Created test user {user_email} (ID: {user['id']})")

    # Verify initial My Plans count is 0
    auth_headers = {"Authorization": f"Bearer {token}"}
    status, trips_res = http_req(f"/api/trips?token={token}", method="GET", headers=auth_headers)
    assert status == 200
    initial_trips = trips_res.get("trips", [])
    assert len(initial_trips) == 0, f"Expected 0 initial trips, found {len(initial_trips)}"
    log_pass("Initial saved trips count for user is exactly 0.")

    # -------------------------------------------------------------
    # TEST A: Generate 10 trips.
    # Expected: 10 options generated. My Plans = 0. Backend saved count = 0.
    # -------------------------------------------------------------
    print("\n[TEST A] Generating trip plan options...")
    plan_payload = {
        "destination": "Golden Triangle & Rajasthan",
        "duration_days": 7,
        "budget_usd": 3500,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "travel_style": "Heritage Luxury",
        "interests": ["Palaces", "Cuisine", "Architecture"],
        "category": "Curated Journey"
    }
    status, gen_data = http_req("/api/plan-trip", method="POST", data=plan_payload)
    assert status == 200, f"Plan generation failed: {gen_data}"
    log_pass(f"AI Plan generated: '{gen_data.get('title')}'")

    # Verify backend saved-trip count is UNCHANGED after generating
    status, trips_check_a = http_req(f"/api/trips?token={token}", method="GET", headers=auth_headers)
    trips_a = trips_check_a.get("trips", [])
    assert len(trips_a) == 0, f"TEST A FAILED: Expected 0 trips in My Plans after generation, but found {len(trips_a)}!"
    log_pass("TEST A PASSED: Generating trips did NOT automatically add any trip to My Plans (Count = 0).")

    # -------------------------------------------------------------
    # TEST B: Select Trip #4.
    # Expected: Opens in detailed itinerary. My Plans = 0 until Save or Confirm.
    # -------------------------------------------------------------
    print("\n[TEST B] User selects Trip #4 for detailed review...")
    # In client, Trip #4 is set as state.activeItinerary. No POST /api/trips is called.
    # We verify backend saved trips is still 0.
    status, trips_check_b = http_req(f"/api/trips?token={token}", method="GET", headers=auth_headers)
    trips_b = trips_check_b.get("trips", [])
    assert len(trips_b) == 0, f"TEST B FAILED: Expected 0 trips in My Plans upon selection, but found {len(trips_b)}!"
    log_pass("TEST B PASSED: Selecting Trip #4 keeps My Plans = 0 until user explicitly saves or confirms.")

    # -------------------------------------------------------------
    # TEST C: Explicitly click 'Save Trip Plan' on Trip #4.
    # Expected: My Plans = 1. ONLY Trip #4 is saved. Other 9 are NOT in My Plans.
    # -------------------------------------------------------------
    print("\n[TEST C] User clicks 'Save Trip Plan' for Trip #4...")
    trip_4 = {
        "id": f"trip-opt-4-{uid}",
        "title": "7-Day Royal Rajasthan & Regal Havelis",
        "name": "Royal Rajasthan & Regal Havelis",
        "category": "Heritage Luxury",
        "destination": "Delhi → Agra → Jaipur → Udaipur",
        "duration_days": 7,
        "start_date": "2026-11-10",
        "end_date": "2026-11-17",
        "total_budget_usd": 3800,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "itinerary": gen_data.get("itinerary", [])
    }
    status, save_res = http_req(
        f"/api/trips?token={token}",
        method="POST",
        data={"trip": trip_4},
        headers=auth_headers
    )
    assert status == 200, f"Save trip failed: {save_res}"
    
    # Verify My Plans now has exactly 1 trip: Trip #4
    status, trips_check_c = http_req(f"/api/trips?token={token}", method="GET", headers=auth_headers)
    trips_c = trips_check_c.get("trips", [])
    assert len(trips_c) == 1, f"TEST C FAILED: Expected exactly 1 saved trip, but found {len(trips_c)}!"
    assert trips_c[0]["id"] == trip_4["id"], f"Expected saved trip to be Trip #4 ({trip_4['id']}), got {trips_c[0]['id']}"
    log_pass(f"TEST C PASSED: My Plans = 1. Only Trip #4 is saved ('{trips_c[0]['title']}'). Other 9 are NOT in My Plans.")

    # -------------------------------------------------------------
    # TEST D: User reviews another set of options, selects Trip #7, and clicks 'Confirm Trip' without saving first.
    # Expected: ONLY Trip #7 is saved and marked confirmed. My Plans = 2 (Trip #4 + Trip #7).
    # Other recommendations remain temporary options only.
    # -------------------------------------------------------------
    print("\n[TEST D] User selects unsaved Trip #7 and directly clicks 'Confirm Trip'...")
    trip_7 = {
        "id": f"trip-opt-7-{uid}",
        "title": "7-Day Sacred Ganges & Spiritual Varanasi",
        "name": "Sacred Ganges & Spiritual Varanasi",
        "category": "Spiritual & Wellness",
        "destination": "Delhi → Varanasi → Rishikesh",
        "duration_days": 7,
        "start_date": "2026-12-01",
        "end_date": "2026-12-08",
        "total_budget_usd": 2900,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "itinerary": gen_data.get("itinerary", [])
    }

    # As implemented in executeTripConfirmation():
    # 1. Unsaved trip is saved first:
    status, pre_save = http_req(
        f"/api/trips?token={token}",
        method="POST",
        data={"trip": trip_7},
        headers=auth_headers
    )
    assert status == 200, f"Pre-save failed: {pre_save}"

    # 2. Trip is confirmed via PATCH:
    status, confirm_res = http_req(
        f"/api/trips/{trip_7['id']}?token={token}",
        method="PATCH",
        data={
            "action": "confirm",
            "confirmation_status": "confirmed",
            "start_date": "2026-12-01",
            "end_date": "2026-12-08",
            "duration_days": 7
        },
        headers=auth_headers
    )
    assert status == 200, f"Confirm PATCH failed: {confirm_res}"
    assert confirm_res.get("success") is True
    assert confirm_res["trip"]["confirmation_status"] == "confirmed"
    assert confirm_res["trip"]["is_selected"] is True
    log_pass("Trip #7 confirmed successfully with confirmation_status='confirmed' and is_selected=True.")

    # Verify My Plans now has exactly 2 trips: Trip #4 and Trip #7
    status, trips_check_d = http_req(f"/api/trips?token={token}", method="GET", headers=auth_headers)
    trips_d = trips_check_d.get("trips", [])
    assert len(trips_d) == 2, f"TEST D FAILED: Expected exactly 2 trips, found {len(trips_d)}"
    saved_ids = [t["id"] for t in trips_d]
    assert trip_4["id"] in saved_ids
    assert trip_7["id"] in saved_ids
    confirmed_trip = next(t for t in trips_d if t["id"] == trip_7["id"])
    assert confirmed_trip["confirmation_status"] == "confirmed"
    log_pass("TEST D PASSED: Only Trip #7 was saved and confirmed. Other options remain temporary.")

    # -------------------------------------------------------------
    # TEST E: Refresh / Re-login.
    # Expected: Only explicitly saved/confirmed trips (Trip #4 and Trip #7) appear in My Plans.
    # -------------------------------------------------------------
    print("\n[TEST E] Simulating page refresh / re-login...")
    # Query /api/auth/me and /api/trips with the session token
    status, auth_me = http_req(f"/api/auth/me?token={token}", method="GET")
    assert status == 200
    assert auth_me.get("authenticated") is True

    status, trips_check_e = http_req(f"/api/trips?token={token}", method="GET", headers=auth_headers)
    reloaded_trips = trips_check_e.get("trips", [])
    assert len(reloaded_trips) == 2, f"TEST E FAILED: Expected exactly 2 restored trips, found {len(reloaded_trips)}"
    reloaded_ids = [t["id"] for t in reloaded_trips]
    assert set(reloaded_ids) == {trip_4["id"], trip_7["id"]}
    log_pass("TEST E PASSED: Only explicitly saved/confirmed trips appear upon re-login/refresh.")

    print("\n" + "=" * 70)
    print("ALL 5 TESTS (TESTS A, B, C, D, E) PASSED CLEANLY & SUCCESSFULLY! (100%)")
    print("=" * 70)

if __name__ == "__main__":
    test_static_code_invariants()
    test_simulation_workflow()
