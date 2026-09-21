import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TestClient"})
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode("utf-8"))

def post(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "TestClient"}
    )
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode("utf-8"))

def test_endpoints():
    print("Testing BharatConnect AI API endpoints...")
    
    # 1. Health
    status, data = get(f"{BASE_URL}/api/health")
    assert status == 200, f"Health failed: {data}"
    print("[PASS] /api/health passed:", data["app"])

    # 2. Guides
    status, data = get(f"{BASE_URL}/api/guides?city=Jaipur")
    assert status == 200, f"Guides failed: {data}"
    guides = data["guides"]
    assert len(guides) > 0, "No guides returned for Jaipur"
    print(f"[PASS] /api/guides passed: {len(guides)} guide(s) found in Jaipur")

    # 3. Experiences
    status, data = get(f"{BASE_URL}/api/experiences")
    assert status == 200, f"Experiences failed: {data}"
    exp = data["experiences"]
    assert len(exp) > 0, "No experiences returned"
    print(f"[PASS] /api/experiences passed: {len(exp)} experiences listed")

    # 4. Partners
    status, data = get(f"{BASE_URL}/api/partners")
    assert status == 200, f"Partners failed: {data}"
    partners = data["partners"]
    assert len(partners) > 0, "No partners returned"
    print(f"[PASS] /api/partners passed: {len(partners)} verified partners listed")

    # 5. Plan Trip (AI Engine)
    payload = {
        "origin_country": "United States",
        "destination": "Golden Triangle (Delhi, Agra, Jaipur)",
        "duration_days": 7,
        "travelers_count": 2,
        "traveler_type": "Couple",
        "budget_usd": 3500,
        "travel_style": "Cultural",
        "interests": ["Heritage Architecture", "Street & Royal Food"],
        "preferred_language": "English",
        "accommodation": "Heritage Haveli & Boutique",
        "transportation": "Private Chauffeur & High-speed Rail"
    }
    status, plan = post(f"{BASE_URL}/api/plan-trip", payload)
    assert status == 200, f"Trip plan failed: {plan}"
    assert plan["duration_days"] == 7, "Duration mismatch"
    assert len(plan["itinerary"]) == 7, "Itinerary days mismatch"
    assert plan["total_budget_usd"] > 0 and abs(plan["total_budget_usd"] - 3500) < 1000, "Budget mismatch"
    print(f"[PASS] /api/plan-trip passed: '{plan['title']}' generated successfully with {len(plan['itinerary'])} days (Budget: ${plan['total_budget_usd']})")

    # 6. Collaboration Request
    collab_payload = {
        "partner_id": "partner-1",
        "partner_name": "Malabar Organic Spice Guild",
        "applicant_name": "Michael Chang",
        "applicant_email": "michael@test.com",
        "applicant_company": "Austin Artisan Foods LLC",
        "applicant_country": "United States",
        "category": "Cross-border Trade & Sourcing",
        "message": "Interested in importing Tellicherry black pepper.",
        "proposed_date": "2026-10-20"
    }
    status, collab_res = post(f"{BASE_URL}/api/collaborate", collab_payload)
    assert status == 200, f"Collab failed: {collab_res}"
    print("[PASS] /api/collaborate passed:", collab_res["message"])

    # 7. Community Post & Like
    post_payload = {
        "author_name": "Test Traveler",
        "author_origin": "New York, USA",
        "title": "Testing India Trip Highlights",
        "category": "Traveler Stories",
        "tags": ["TestTag", "India"],
        "content": "A fantastic journey across Rajasthan!"
    }
    status, post_res = post(f"{BASE_URL}/api/community/posts", post_payload)
    assert status == 200, f"Community post failed: {post_res}"
    new_post = post_res["post"]
    print("[PASS] /api/community/posts passed: created post", new_post["id"])

    status, like_res = post(f"{BASE_URL}/api/community/like", {"post_id": new_post["id"]})
    assert status == 200, f"Like failed: {like_res}"
    print("[PASS] /api/community/like passed: toggled like")

    # 8. Community Follow
    status, follow_res = post(f"{BASE_URL}/api/community/follow", {"author_name": "Marcus Vance"})
    assert status == 200, f"Follow failed: {follow_res}"
    print(f"[PASS] /api/community/follow passed: is_following={follow_res['is_following']}")

    # 9. Collaboration Inquiry Tracking
    status, track_res = get(f"{BASE_URL}/api/collaborate/track?query=BC-9041")
    assert status == 200, f"Track failed: {track_res}"
    assert len(track_res["records"]) > 0, "No tracking records for BC-9041"
    print(f"[PASS] /api/collaborate/track passed: found {len(track_res['records'])} record for BC-9041")

    # 10. Safety / Incident Report
    report_payload = {
        "reporter_name": "Sarah Jenkins",
        "email": "sarah.jenkins@example.com",
        "category": "General Inquiry / Feedback",
        "description": "Checking concierge availability for private chauffeur booking in Jaipur.",
        "urgent_callback": True
    }
    status, report_res = post(f"{BASE_URL}/api/report", report_payload)
    assert status == 200, f"Report failed: {report_res}"
    print(f"[PASS] /api/report passed: {report_res['report_id']} created")

    # 11. Auth Sign Up
    signup_payload = {
        "full_name": "David Miller",
        "email": f"david.miller_{int(time.time())}@chicago.edu",
        "password": "SecretPassword123",
        "origin_country": "United States",
        "traveler_type": "Traveler"
    }
    status, signup_res = post(f"{BASE_URL}/api/auth/signup", signup_payload)
    assert status == 200, f"Signup failed: {signup_res}"
    print(f"[PASS] /api/auth/signup passed: user {signup_res['full_name']} registered")

    # 12. Test static frontend serving
    req = urllib.request.Request(f"{BASE_URL}/", headers={"User-Agent": "TestClient"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        html_content = resp.read().decode("utf-8")
        assert "BharatConnect AI" in html_content
    print("[PASS] Static frontend / root served with status 200 and valid HTML")

    print("\n=======================================================")
    print("ALL AUTOMATED TESTS PASSED CLEANLY & SUCCESSFULLY!")
    print("=======================================================\n")

if __name__ == "__main__":
    test_endpoints()
