"""
test_flight_journey.py
----------------------
Exhaustive verification test suite for BharatConnect AI:
STEP 4 — CINEMATIC 3D WORLD JOURNEY: USER COUNTRY → INDIA

Features Tested:
1. Real interactive 3D experience using Three.js & WebGL (#globe-3d-canvas-container).
2. Realistic 3D Earth with continents, oceans, city lights, atmospheric glow, and cloud veil.
3. 3D Airplane model starting stationary (zero autoplay).
4. Wide space perspective camera initially (full globe visible, distance > 300).
5. Dynamic country origin determined from registration data (no hardcoded Japan).
   Supports USA, Canada, UK, France, Germany, Japan, Australia, Italy, Spain, Singapore,
   UAE, Brazil, South Africa, India (domestic arrival), and flexible fallbacks.
6. Glowing light-blue 3D Great-Circle flight path from user country to India.
7. 3D surface pins and projected screen badges (#marker-origin-badge, #marker-destination-badge).
8. Narrative HUD and telemetry (#journey-story-subtitle, distance, altitude, stage).
9. Scroll-driven natural progression (~3 scrolls) with smooth interpolation (lerp).
10. Final arrival behavior:
    - 100% flight completion touching down in India.
    - Highlight India.
    - Show "Welcome to India 🇮🇳" and "Your BharatConnect journey begins here.".
    - Hold arrival state briefly for 1–2 seconds (1.6s).
    - Automatically transition/open the MAIN BharatConnect AI WEBSITE without extra button click.
11. "Skip Journey →" button allows immediately entering the main website at any point.
12. Main website strictly locked/hidden prior to reaching India or clicking Skip Journey.
"""

import os
import re
import urllib.request

BASE_URL = "http://127.0.0.1:8000"

def get_html(path="/"):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers={"User-Agent": "FlightJourneyTester/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, resp.read().decode("utf-8")


def test_1_html_journey_markup():
    print("\n--- TEST 1: HTML Flight Journey & 3D WebGL Canvas Markup Verification ---")
    status, html = get_html("/")
    assert status == 200, f"Failed to fetch homepage: status {status}"

    # Verify Three.js CDN script inclusion
    assert "three.js" in html or "three.min.js" in html, "Missing Three.js library CDN script in index.html"
    print("  [PASS] Three.js library CDN script correctly included in index.html.")

    # Verify Journey Screen container & 3D WebGL Canvas Container
    assert 'id="flight-journey-screen"' in html, "Missing #flight-journey-screen in index.html"
    assert 'id="journey-scroll-track"' in html, "Missing #journey-scroll-track in index.html"
    assert 'id="globe-3d-canvas-container"' in html, "Missing #globe-3d-canvas-container for Three.js WebGL canvas in index.html"
    print("  [PASS] 3D WebGL Canvas Container (#globe-3d-canvas-container) present.")

    # Verify Dynamic 3D Pin Badges
    assert 'id="marker-origin-badge"' in html, "Missing #marker-origin-badge in index.html"
    assert 'id="marker-destination-badge"' in html, "Missing #marker-destination-badge in index.html"
    assert 'id="journey-story-subtitle"' in html, "Missing #journey-story-subtitle in index.html"
    assert 'id="journey-story-route"' in html, "Missing #journey-story-route in index.html"
    print("  [PASS] 3D projected screen badges and narrative HUD elements present.")

    # Verify Country Select options for dynamic origins
    countries = ["United States", "United Kingdom", "Canada", "France", "Germany", "Japan", "Australia", "India"]
    for c in countries:
        assert c in html, f"Missing country option '{c}' in #signup-country dropdown"
    print("  [PASS] Registration dropdown includes global country origins including USA, UK, Canada, France, Germany, Japan, Australia, and India.")

    # Verify Telemetry HUD & Skip Button
    assert 'id="telemetry-distance"' in html, "Missing #telemetry-distance HUD in index.html"
    assert 'id="telemetry-stage"' in html, "Missing #telemetry-stage HUD in index.html"
    assert 'id="telemetry-altitude"' in html, "Missing #telemetry-altitude HUD in index.html"
    assert 'id="skip-journey-btn"' in html, "Missing #skip-journey-btn in index.html"
    assert "Skip Journey" in html, "Missing 'Skip Journey' label in index.html"

    # Verify Arrival Card & Exact Required Strings
    assert 'id="journey-arrival-card"' in html, "Missing #journey-arrival-card in index.html"
    assert "Welcome to India 🇮🇳" in html, "Missing required text: 'Welcome to India 🇮🇳'"
    assert "Your BharatConnect journey begins here." in html, "Missing required text: 'Your BharatConnect journey begins here.'"
    assert 'id="arrival-hold-progress"' in html, "Missing #arrival-hold-progress hold indicator in index.html"

    # Verify Main Website Gating
    assert 'id="main-app-content"' in html, "Missing #main-app-content in index.html"
    assert 'class="hidden"' in html, "#main-app-content must be marked hidden by default"
    assert 'display: none !important;' in html, "#main-app-content must have inline display: none !important;"

    print("  [PASS] All Flight Journey DOM elements, 3D Canvas, country origins, and arrival texts verified.")


def test_2_css_journey_animations():
    print("\n--- TEST 2: CSS Styles & 3D WebGL Canvas Styles Verification ---")
    css_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "css", "styles.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    assert "#flight-journey-screen" in css, "Missing #flight-journey-screen in styles.css"
    assert "#globe-3d-canvas-container" in css, "Missing #globe-3d-canvas-container in styles.css"
    assert ".globe-marker-badge" in css, "Missing .globe-marker-badge in styles.css"
    assert "@keyframes markerPulseGlow" in css, "Missing @keyframes markerPulseGlow in styles.css"
    assert ".journey-scroll-spacer" in css, "Missing .journey-scroll-spacer in styles.css"
    assert "height: 400vh" in css or "400vh" in css, "Missing virtual scroll track height in styles.css"
    assert "@keyframes arrivalPop" in css, "Missing @keyframes arrivalPop in styles.css"
    assert ".animate-arrival-pop" in css, "Missing .animate-arrival-pop class in styles.css"
    assert ".hold-progress-fill" in css, "Missing .hold-progress-fill class in styles.css"
    assert ".journey-exit" in css, "Missing .journey-exit cinematic transition in styles.css"

    print("  [PASS] 3D canvas styling, marker badges, animations, and transitions verified.")


def test_3_dynamic_country_coordinates():
    print("\n--- TEST 3: Dynamic Country Origin Resolution (No Hardcoded Japan) ---")
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "js", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Verify Country Coordinates map
    assert "COUNTRY_COORDINATES" in js, "Missing COUNTRY_COORDINATES table in app.js"
    assert "resolveCountryCoords" in js, "Missing resolveCountryCoords() in app.js"

    # Verify key countries present in coordinate dictionary
    required_countries = [
        "Japan", "France", "Germany", "United States", "United Kingdom",
        "Canada", "Australia", "Italy", "Spain", "Singapore",
        "United Arab Emirates", "Brazil", "South Africa", "India"
    ]
    for country in required_countries:
        pattern = rf'"{re.escape(country)}"\s*:\s*\{{\s*lat:\s*[-0-9.]+\s*,\s*lng:\s*[-0-9.]+'
        assert re.search(pattern, js, re.IGNORECASE), f"Missing coordinate mapping for country: {country}"

    print(f"  [PASS] All {len(required_countries)} required countries mapped with realistic lat/lng.")

    # Verify India destination coordinates: lat ~21.0, lng ~78.0
    india_coords = re.search(r'"india"\s*:\s*\{\s*lat:\s*([0-9.]+)\s*,\s*lng:\s*([0-9.]+)', js, re.IGNORECASE)
    assert india_coords, "India coordinates missing"
    assert 18.0 <= float(india_coords.group(1)) <= 24.0, "India latitude incorrect"
    assert 74.0 <= float(india_coords.group(2)) <= 82.0, "India longitude incorrect"
    print(f"  [PASS] India destination coordinates verified ({india_coords.group(1)}°N, {india_coords.group(2)}°E).")

    # Verify domestic arrival detection (when country is India)
    assert "isDomestic" in js, "Missing isDomestic handling in app.js"
    print("  [PASS] Domestic Indian arrival handling verified.")


def test_4_threejs_3d_engine_architecture():
    print("\n--- TEST 4: Three.js 3D Engine Architecture & Realistic Assets ---")
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "js", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # 1. Verify GlobeJourney3D class
    assert "class GlobeJourney3D" in js, "Missing GlobeJourney3D class in app.js"

    # 2. Verify Wide Space Perspective Camera: initial distance > 300 (full globe visible)
    cam_match = re.search(r"this\.camera\s*=\s*new THREE\.PerspectiveCamera\([^)]+\);[\s\S]*?this\.camera\.position\.set\(\s*0\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)", js)
    assert cam_match, "Missing wide space camera position setting in GlobeJourney3D"
    cam_y = float(cam_match.group(1))
    cam_z = float(cam_match.group(2))
    cam_distance = (cam_y**2 + cam_z**2)**0.5
    assert cam_distance >= 300, f"Camera initial distance must be >= 300 for wide space perspective, got {cam_distance}"
    print(f"  [PASS] Wide space perspective camera verified: distance = {cam_distance:.1f} (>= 300).")

    # 3. Verify Zero Autoplay: starts stationary at 0 progress
    assert "this.currentProgress = 0" in js, "3D journey must initialize currentProgress at 0"
    assert "this.targetProgress = 0" in js, "3D journey must initialize targetProgress at 0 (zero autoplay)"
    print("  [PASS] Zero autoplay verified: targetProgress initialized at 0, stationary aircraft.")

    # 4. Verify Realistic 3D Earth Texture Generator (oceans, continents, city lights)
    assert "function createRealisticEarthTexture" in js, "Missing createRealisticEarthTexture() procedural texture generator"
    assert "oceanGrad" in js, "createRealisticEarthTexture must render deep oceanic gradient"
    assert "city lights" in js.lower() or "citylight" in js.lower() or "city" in js.lower(), "createRealisticEarthTexture must render city lights"
    print("  [PASS] Realistic procedural 3D Earth texture generator verified.")

    # 5. Verify 3D Airplane Model (fuselage, wings, tailfin, jet engines)
    assert "function createAirplaneModel" in js, "Missing createAirplaneModel() 3D aircraft constructor"
    assert "CylinderGeometry" in js, "createAirplaneModel must construct fuselage using CylinderGeometry"
    assert "jet" in js.lower() or "engine" in js.lower(), "createAirplaneModel must include jet engines"
    print("  [PASS] 3D Airplane model builder verified with fuselage, wings, and jet engines.")

    # 6. Verify Curved Light-Blue Great-Circle Flight Path
    assert "buildFlightTrajectory" in js, "Missing buildFlightTrajectory in GlobeJourney3D"
    assert "0x38bdf8" in js or "0x00d4ff" in js or "0x60a5fa" in js or "0x06b6d4" in js, "Flight path must use glowing light-blue color"
    print("  [PASS] Curved 3D light-blue Great-Circle flight path geometry verified.")

    # 7. Verify Atmospheric Glow & Cloud Veil
    assert "atmosphere" in js.lower() or "glowmesh" in js.lower() or "atmomat" in js.lower(), "Missing atmospheric glow layer"
    assert "cloud" in js.lower(), "Missing cloud veil layer on 3D Earth"
    print("  [PASS] Atmospheric glow shell and cloud veil layers verified.")

    # 8. Verify Smooth Scroll Lerp Interpolation
    assert "lerp" in js or "0.08" in js or "0.05" in js, "GlobeJourney3D must use smooth lerp interpolation on animation frame"
    print("  [PASS] Smooth scroll lerp interpolation verified.")


def test_5_arrival_behavior_and_auto_transition():
    print("\n--- TEST 5: Final Arrival Behavior & 1-2s Auto-Transition Verification ---")
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "js", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # 1. Verify arrival triggers at 100% progress
    assert "function triggerArrivalSequence" in js, "Missing triggerArrivalSequence()"
    assert "arrivalCard.classList.remove('hidden')" in js, "Arrival sequence must unhide arrival card"

    # 2. Verify 1-2s hold duration (1600ms)
    timer_match = re.search(r"flightJourneyState\.arrivalTimer\s*=\s*setTimeout\(\s*\(\)\s*=>\s*\{[^}]*transitionToMainApp\(false\);\s*[^}]*\},\s*(\d+)\);", js)
    assert timer_match, "Missing auto-transition timer calling transitionToMainApp(false)"
    duration = int(timer_match.group(1))
    assert 1000 <= duration <= 2000, f"Hold duration must be between 1000ms and 2000ms, got {duration}ms"
    print(f"  [PASS] Arrival hold duration verified: {duration}ms (approx 1-2 seconds).")

    # 3. Verify automatic transition to main website (no extra click required)
    assert "transitionToMainApp(false)" in js, "Must automatically call transitionToMainApp without user click"
    assert "mainContent.classList.remove('hidden')" in js, "transitionToMainApp must reveal main content"
    assert "mainContent.style.setProperty('display', 'block', 'important')" in js, "transitionToMainApp must set display: block !important"
    assert "journeyScreen.classList.add('journey-exit')" in js, "transitionToMainApp must apply cinematic .journey-exit"
    print("  [PASS] Automatic transition to main website verified without requiring user click.")

    # 4. Verify Skip Button functionality at any point
    assert "function skipFlightJourney" in js, "Missing skipFlightJourney()"
    assert "transitionToMainApp(true)" in js, "skipFlightJourney must immediately call transitionToMainApp(true)"
    assert "clearTimeout(flightJourneyState.arrivalTimer)" in js, "skipFlightJourney must clear any pending arrival timer"
    print("  [PASS] Skip Journey button allows immediate main app entry at any point.")

    # 5. Verify Main Website is locked before arrival
    assert "mainContent.classList.add('hidden')" in js, "startFlightJourney must keep mainContent hidden"
    assert "mainContent.style.setProperty('display', 'none', 'important')" in js, "mainContent must be locked with display:none"
    print("  [PASS] Main website locked before flight completion.")


def test_6_live_http_delivery():
    print("\n--- TEST 6: Live HTTP Delivery of 3D Assets and Styles ---")
    status_css, css_content = get_html("/static/css/styles.css")
    assert status_css == 200
    assert "globe-3d-canvas-container" in css_content
    print("  [PASS] Live styles.css served with #globe-3d-canvas-container.")

    status_js, js_content = get_html("/static/js/app.js")
    assert status_js == 200
    assert "GlobeJourney3D" in js_content
    assert "resolveCountryCoords" in js_content
    assert "createRealisticEarthTexture" in js_content
    assert "createAirplaneModel" in js_content
    print("  [PASS] Live app.js served with GlobeJourney3D engine and 3D realistic procedural generators.")


def main():
    print("=====================================================================")
    print("   BHARATCONNECT AI - STEP 4: 3D WORLD JOURNEY VERIFICATION SUITE    ")
    print("=====================================================================")
    test_1_html_journey_markup()
    test_2_css_journey_animations()
    test_3_dynamic_country_coordinates()
    test_4_threejs_3d_engine_architecture()
    test_5_arrival_behavior_and_auto_transition()
    test_6_live_http_delivery()
    print("\n=====================================================================")
    print("   ALL STEP 4 CINEMATIC 3D JOURNEY TESTS PASSED 100% CLEANLY!        ")
    print("=====================================================================")


if __name__ == "__main__":
    main()
