import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def get(path):
    url = f"{BASE_URL}{urllib.parse.quote(path, safe='/?=&')}"
    req = urllib.request.Request(url, headers={"User-Agent": "BharatConnectTest/2.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

def post(path, data):
    url = f"{BASE_URL}{path}"
    encoded = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=encoded, headers={
        "Content-Type": "application/json",
        "User-Agent": "BharatConnectTest/2.0"
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

def test_ai_planner_matrix():
    print("\n--- 1. Testing AI Trip Planner Matrix & Heuristics ---")
    test_cases = [
        {"destination": "Golden Triangle (Delhi, Agra, Jaipur)", "duration_days": 3, "travel_style": "Cultural", "budget_usd": 1500, "traveler_type": "Solo Traveler"},
        {"destination": "Kerala Backwaters & Spice Coast", "duration_days": 7, "travel_style": "Wellness & Nature", "budget_usd": 3200, "traveler_type": "Couple"},
        {"destination": "Varanasi & Sacred North", "duration_days": 5, "travel_style": "Spiritual & Heritage", "budget_usd": 1800, "traveler_type": "Family"},
        {"destination": "Royal Rajasthan Palaces", "duration_days": 10, "travel_style": "Luxury & Heritage", "budget_usd": 6500, "traveler_type": "Couple"},
        {"destination": "Himalayan Ladakh & Nubra", "duration_days": 7, "travel_style": "Adventure & High Altitude", "budget_usd": 2800, "traveler_type": "Friends"},
    ]
    
    for idx, tc in enumerate(test_cases, 1):
        status, res = post("/api/plan-trip", tc)
        assert status == 200, f"Expected 200, got {status}"
        assert "itinerary" in res, "Missing itinerary field"
        days_list = res["itinerary"]
        assert len(days_list) == tc["duration_days"], f"Day count mismatch: expected {tc['duration_days']}, got {len(days_list)}"
        assert "budget_breakdown" in res, "Missing budget_breakdown"
        assert "matched_guides" in res, "Missing matched_guides"
        assert "safety_and_cultural_tips" in res, "Missing safety_and_cultural_tips"
        assert "id" in res, "Missing plan id"
        print(f"  [PASS] Matrix #{idx}: {tc['destination']} ({tc['duration_days']} days, {tc['travel_style']}) -> '{res.get('title')}'")

def test_guides_filtering():
    print("\n--- 2. Testing Guides Directory Multi-Dimensional Filtering ---")
    # All guides
    status, data = get("/api/guides")
    assert status == 200 and "guides" in data
    all_guides = data["guides"]
    assert len(all_guides) >= 6, f"Expected >= 6 guides, got {len(all_guides)}"
    print(f"  [PASS] Retrieved all {len(all_guides)} guides")

    # Filter by city
    for city in ["Jaipur", "Delhi", "Varanasi", "Kochi", "Mumbai", "Agra"]:
        status, res = get(f"/api/guides?city={city}")
        assert status == 200, f"City query for {city} failed"
        guides = res["guides"]
        for g in guides:
            assert city.lower() in g["city"].lower(), f"City mismatch: {g['city']} vs {city}"
        print(f"  [PASS] City filter '{city}': {len(guides)} guide(s)")

    # Filter by language
    status, res = get("/api/guides?language=English")
    assert status == 200 and len(res["guides"]) >= 5, "Expected English guides"
    print(f"  [PASS] Language filter 'English': {len(res['guides'])} guide(s)")

def test_experiences_filtering():
    print("\n--- 3. Testing Experiences Multi-Category Queries ---")
    status, data = get("/api/experiences")
    assert status == 200 and "experiences" in data
    exps = data["experiences"]
    assert len(exps) >= 8, f"Expected >= 8 experiences, got {len(exps)}"
    print(f"  [PASS] Retrieved all {len(exps)} experiences")

    # Filter by category
    for cat in ["heritage", "culinary", "spiritual", "artisan", "nature"]:
        status, res = get(f"/api/experiences?category={cat}")
        assert status == 200, f"Category {cat} failed"
        cat_exps = res["experiences"]
        for e in cat_exps:
            assert cat in e["category"].lower() or e["category"] == "all", f"Category mismatch: {e['category']}"
        print(f"  [PASS] Category filter '{cat}': {len(cat_exps)} experience(s)")

def test_partners_and_collaboration_lifecycle():
    print("\n--- 4. Testing Business Partners & Collaboration Lifecycle ---")
    status, data = get("/api/partners")
    assert status == 200 and "partners" in data
    partners = data["partners"]
    assert len(partners) >= 6, f"Expected >= 6 partners, got {len(partners)}"
    print(f"  [PASS] Retrieved {len(partners)} verified enterprise partners")

    # Filter by industry
    status, res = get("/api/partners?industry=Spices")
    assert status == 200 and len(res["partners"]) >= 1
    print(f"  [PASS] Industry filter 'Spices': {len(res['partners'])} partner(s)")

    # Submit collaboration inquiry
    inquiry_data = {
        "partner_id": partners[0]["id"],
        "partner_name": partners[0]["name"],
        "applicant_name": "Elena Rostova",
        "applicant_email": "elena@sfbotanicals.com",
        "applicant_company": "San Francisco Botanical Imports LLC",
        "applicant_country": "United States",
        "category": "Organic Spices & Single-Estate Tea",
        "message": "Seeking certified fair-trade organic black pepper, cardamom, and cinnamon for US retail distribution.",
        "proposed_date": "2026-11-15"
    }
    status, inq_res = post("/api/collaborate", inquiry_data)
    assert status == 200, f"Inquiry submission failed: {status}"
    req_id = inq_res["request_id"]
    print(f"  [PASS] Created collaboration inquiry with ID: {req_id}")

    # Track collaboration inquiry
    status, track_res = get(f"/api/collaborate/track?query={partners[0]['name']}")
    assert status == 200 and track_res["total"] >= 1, f"Tracking failed"
    print(f"  [PASS] Verified tracking status lookup: found {track_res['total']} matching records")

def test_community_and_social_actions():
    print("\n--- 5. Testing Community Posts, Reactions, and Followers ---")
    # Fetch posts
    status, data = get("/api/community")
    assert status == 200 and "posts" in data
    posts = data["posts"]
    assert len(posts) >= 5, f"Expected >= 5 posts, got {len(posts)}"
    post_id = posts[0]["id"]
    initial_likes = posts[0]["likes"]

    # Toggle like
    status, like_res = post("/api/community/like", {"post_id": post_id})
    assert status == 200 and like_res["success"] is True
    print(f"  [PASS] Toggled like on {post_id}: new likes={like_res['likes']}, user_liked={like_res['user_liked']}")

    # Untoggle like
    status, unlike_res = post("/api/community/like", {"post_id": post_id})
    assert status == 200 and unlike_res["success"] is True
    print(f"  [PASS] Untoggled like on {post_id}: new likes={unlike_res['likes']}, user_liked={unlike_res['user_liked']}")

    # Follow author
    author = posts[0]["author_name"]
    status, follow_res = post("/api/community/follow", {"author_name": author})
    assert status == 200 and follow_res["success"] is True
    print(f"  [PASS] Toggled follow on author '{author}': is_following={follow_res['is_following']}, count={follow_res['followers_count']}")

    # Create new community post
    new_post_payload = {
        "title": "First Time Exploring the Old City of Udaipur",
        "author_name": "Marcus Thorne",
        "author_origin": "San Francisco, USA",
        "category": "Traveler Stories",
        "tags": ["Culture", "Heritage", "Photography"],
        "content": "Wandering the winding stone alleys of Udaipur with our guide Vikram Singh was the absolute highlight of our 2-week trip. Authentic miniature painting studios, serene sunset boat rides on Lake Pichola, and genuine hospitality."
    }
    status, post_res = post("/api/community/posts", new_post_payload)
    assert status == 200 and post_res["success"] is True
    print(f"  [PASS] Created community post: {post_res['post']['id']} by {post_res['post']['author_name']}")

def test_trust_safety_and_auth():
    print("\n--- 6. Testing Trust & Safety Incident Reporting & Auth ---")
    # Submit incident report
    rep_payload = {
        "reporter_name": "Sarah Jenkins",
        "email": "sarah.j@example.com",
        "category": "Billing Discrepancy",
        "target_entity": "Cab Service Jaipur",
        "description": "Taxi driver attempted to charge outside the agreed digital voucher rate.",
        "urgent_callback": True
    }
    status, rep_res = post("/api/report", rep_payload)
    assert status == 200 and "report_id" in rep_res
    print(f"  [PASS] Incident report submitted: Ticket ID {rep_res['report_id']}")

    # Signup test
    user_payload = {
        "full_name": "Alexander Hamilton",
        "email": f"alexander_{int(time.time())}@nytravelers.org",
        "password": "SecurePassword123!",
        "origin_country": "United States",
        "traveler_type": "Heritage Explorer"
    }
    status, signup_res = post("/api/auth/signup", user_payload)
    assert status == 200 and signup_res["success"] is True
    print(f"  [PASS] User onboarded: {signup_res['full_name']} ({signup_res['user_id']})")

def test_static_assets_integrity():
    print("\n--- 7. Testing Static Assets Integrity & Markup Standards ---")
    url = f"{BASE_URL}/"
    req = urllib.request.Request(url, headers={"User-Agent": "BharatConnectTest/2.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8')
        assert resp.status == 200
        
        # Verify required critical sections exist
        required_sections = [
            'id="explore-india"',
            'id="ai-trip-planner"',
            'id="local-guides"',
            'id="experiences"',
            'id="premium-pass"',
            'id="global-collaboration"',
            'id="community"',
            'id="about-us"'
        ]
        for sec in required_sections:
            assert sec in html, f"Missing section in HTML: {sec}"
        print("  [PASS] All 8 primary section anchor IDs confirmed in index.html")

        # Verify key modals exist
        required_modals = [
            'id="guide-profile-modal"',
            'id="guide-request-modal"',
            'id="guide-chat-modal"',
            'id="book-experience-modal"',
            'id="collaboration-modal"',
            'id="partner-apply-modal"',
            'id="create-post-modal"',
            'id="global-search-modal"',
            'id="signin-modal"',
            'id="signup-modal"',
            'id="report-modal"',
            'id="join-community-modal"'
        ]
        for m in required_modals:
            assert m in html, f"Missing modal in HTML: {m}"
        print(f"  [PASS] All {len(required_modals)} interactive modal IDs verified in index.html")

        # Verify scripts & styles
        assert 'css/styles.css' in html
        assert 'js/app.js' in html
        assert 'lucide' in html
        print("  [PASS] External dependencies, icons, and stylesheets properly linked")

if __name__ == "__main__":
    print("==================================================================")
    print("      BHARATCONNECT AI COMPREHENSIVE INTEGRATION TEST SUITE       ")
    print("==================================================================")
    try:
        test_ai_planner_matrix()
        test_guides_filtering()
        test_experiences_filtering()
        test_partners_and_collaboration_lifecycle()
        test_community_and_social_actions()
        test_trust_safety_and_auth()
        test_static_assets_integrity()
        print("\n==================================================================")
        print("    SUCCESS: ALL 7 DEEP INTEGRATION TEST SUITES PASSED CLEANLY!   ")
        print("==================================================================")
    except AssertionError as e:
        print(f"\n[FAIL] Assertion Error: {e}")
        exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected Exception: {e}")
        exit(1)
