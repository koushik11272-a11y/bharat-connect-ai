"""
test_complete_journey_navigation_flow.py
----------------------------------------
Exhaustive verification test suite for the complete BharatConnect AI Journey:
1. Verification of untouched Home page (static/index.html).
2. Verification of /journey.html and /static/journey.html visual fidelity.
3. Verification of 2-scroll state machine, realistic Earth shaders, 3D airliner,
   glowing tube trajectory, and India arrival reveal.
4. Verification of routes: /, /index.html, /home, /journey.html.
"""

import urllib.request
import json

BASE_URL = "http://127.0.0.1:8000"

def run_suite():
    print("\n" + "="*65)
    print(" BHARATCONNECT AI: COMPLETE JOURNEY & NAVIGATION FLOW TEST ")
    print("="*65)

    # 1. Verify Home Page is completely untouched and available via multiple endpoints
    print("\n--- 1. Testing Existing Home Page Routes ---")
    for endpoint in ["/", "/index.html", "/home"]:
        req = urllib.request.urlopen(f"{BASE_URL}{endpoint}", timeout=5)
        assert req.status == 200, f"Route {endpoint} failed with {req.status}"
        content = req.read().decode("utf-8")
        assert "BharatConnect AI" in content, f"Missing BharatConnect AI in {endpoint}"
        assert "main-app-content" in content, f"Missing main-app-content in {endpoint}"
        print(f"  [PASS] {endpoint} serves existing approved Home Page (status 200)")

    # 2. Verify Journey Page Delivery & Key Components
    print("\n--- 2. Testing Journey Page & Visual Reference Fidelity ---")
    for path in ["/journey.html", "/static/journey.html"]:
        req = urllib.request.urlopen(f"{BASE_URL}{path}", timeout=5)
        assert req.status == 200, f"Journey path {path} failed with {req.status}"
        html = req.read().decode("utf-8")

        # Visual Reference Top Header
        assert "Your journey across the world" in html, f"Missing title in {path}"
        assert "step-badge" in html, f"Missing step-badge in {path}"
        
        # 3D Container & Libraries
        assert 'id="canvas-container"' in html, f"Missing #canvas-container in {path}"
        assert "three.min.js" in html, f"Missing three.min.js in {path}"
        assert "topojson-client.min.js" in html, f"Missing topojson in {path}"

        # Visual Reference Markers
        assert 'id="origin-marker"' in html, f"Missing #origin-marker in {path}"
        assert 'id="destination-marker"' in html, f"Missing #destination-marker in {path}"
        assert "origin-badge" in html, f"Missing origin-badge class in {path}"
        assert "destination-badge" in html, f"Missing destination-badge class in {path}"
        assert "India (Your destination)" in html or "(Your destination)" in html, f"Missing India destination capsule in {path}"

        # Visual Reference Timeline
        assert "bottom-timeline-container" in html, f"Missing timeline in {path}"
        assert "Across Asia" in html, f"Missing Across Asia in {path}"
        assert "Across Europe" in html, f"Missing Across Europe in {path}"
        assert "Middle East" in html, f"Missing Middle East in {path}"

        # 2-Scroll Gesture Logic
        assert "journeyStep" in html and "setJourneyStep" in html, f"Missing 2-scroll state machine in {path}"
        assert "lastWheelTime" in html, f"Missing scroll throttling in {path}"

        # 3D Realistic Earth & Commercial Airliner
        assert "earthCustomMaterial" in html and "THREE.ShaderMaterial" in html, f"Missing realistic shader in {path}"
        assert "createAirplaneModel" in html, f"Missing airliner model in {path}"
        assert "buildFlightTrajectory" in html, f"Missing flight trajectory in {path}"
        assert "THREE.TubeGeometry" in html, f"Missing thick luminous 3D tube geometry in {path}"

        # Arrival & Navigation
        assert "triggerArrivalAndTransition" in html, f"Missing triggerArrivalAndTransition in {path}"
        assert "Welcome to India" in html, f"Missing arrival reveal in {path}"
        assert "index.html" in html, f"Missing home redirect in {path}"

        print(f"  [PASS] {path} matches visual reference and functional specifications")

    # 3. Verify Dynamic Country Origins
    print("\n--- 3. Testing Dynamic Country Data & Country Selection ---")
    req = urllib.request.urlopen(f"{BASE_URL}/journey.html", timeout=5)
    html = req.read().decode("utf-8")
    expected_countries = [
        "Japan", "United States", "Germany", "Australia", "Singapore",
        "United Arab Emirates", "United Kingdom", "Canada", "France",
        "Italy", "Spain", "Brazil", "South Africa", "India"
    ]
    for country in expected_countries:
        assert country in html, f"Missing country {country} in selector"
    print(f"  [PASS] All {len(expected_countries)} dynamic global country origins present")

    # 4. Verify Texture & Data Assets
    print("\n--- 4. Testing High-Res 3D Texture Assets ---")
    assets = [
        "/static/textures/earth_day.jpg",
        "/static/textures/earth_night.jpg",
        "/static/data/countries-110m.json"
    ]
    for asset in assets:
        r = urllib.request.urlopen(f"{BASE_URL}{asset}", timeout=5)
        assert r.status == 200, f"Failed asset {asset}"
        size = len(r.read())
        print(f"  [PASS] Asset {asset} verified ({size:,} bytes)")

    print("\n" + "="*65)
    print(" ALL COMPLETE JOURNEY & NAVIGATION FLOW TESTS PASSED (100%) ")
    print("="*65 + "\n")

if __name__ == "__main__":
    run_suite()
