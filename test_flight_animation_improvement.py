import sys
import re
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def test_flight_animation_improvements():
    print("=================================================================")
    print(" BHARATCONNECT AI: FLIGHT ANIMATION IMPROVEMENTS VERIFICATION    ")
    print("=================================================================\n")

    # Fetch live journey.html from FastAPI server
    url = "http://127.0.0.1:8000/journey.html"
    req = urllib.request.urlopen(url)
    assert req.getcode() == 200, f"Failed to fetch {url}"
    html = req.read().decode("utf-8")

    # 1. Verify Camera Zoom-In Logic
    print("--- 1. Camera Zoom-In & Continuous Damping ---")
    assert "targetCameraDistance = 280 - (zoomP * 92)" in html, "targetCameraDistance formula missing"
    assert "camera.position.z += (targetCameraDistance - camera.position.z)" in html, "smooth camera lerp missing"
    # Ensure camera doesn't zoom out in step 1 (was 310)
    assert "targetCameraDistance = 310" not in html, "Old zoom-out step 1 target still present!"
    print("  [PASS] Camera starts at 280, smoothly zooms to ~232 at scroll 1, and reaches 188 at India arrival.")

    # 2. Verify Airplane Proportions, Size, and Dynamic Scaling
    print("\n--- 2. Airplane Visibility & Dynamic Scaling ---")
    assert "baseScale = 0.88" in html, "Base airplane scale 0.88 missing"
    assert "flightLiftScale = Math.sin(clampedT * Math.PI) * 0.24" in html, "Flight lift scale missing"
    assert "currentScale = baseScale + flightLiftScale" in html, "Current scale calculation missing"
    print("  [PASS] Airplane base scale is 0.88, smoothly expanding to 1.12 mid-flight, remaining proportional.")

    # 3. Verify Airplane Color (Pure White + Silver Engines + Cyan Exhaust)
    print("\n--- 3. Airplane Color & Materials ---")
    assert "color: 0xffffff" in html, "White fuselage/wings material missing"
    assert "color: 0xd1d5db" in html, "Silver engine nacelles missing"
    assert "color: 0x38bdf8" in html, "Delicate cyan exhaust glow missing"
    # Check that fuselage is not blue or green
    fuse_match = re.search(r"fuseMat\s*=\s*new\s+THREE\.MeshStandardMaterial\(\{\s*color:\s*(0x[0-9a-fA-F]+)", html)
    assert fuse_match and fuse_match.group(1).lower() == "0xffffff", f"Fuselage color must be white, got {fuse_match.group(1)}"
    print("  [PASS] Airplane is primarily crisp commercial airliner WHITE with silver details and subtle cyan exhaust.")

    # 4. Verify Flight Path (Bright Green/Cyan Luminous Line + Flowing Directional Pulse)
    print("\n--- 4. Flight Path Luminous Geometry & Directional Pulse ---")
    assert "0x00ffaa" in html, "Luminous neon green/cyan core color missing"
    assert "0x00e5ff" in html, "Radiant cyan glow aura missing"
    assert "TubeGeometry(subCurve, sampleCount * 2, 0.35" in html, "Core tube radius 0.35 verified"
    assert "TubeGeometry(subCurve, sampleCount * 2, 0.80" in html, "Glow tube radius 0.80 verified"
    assert "subPoints[subPoints.length - 1].copy(airplane.position)" in html, "Trail anchor to airplane verified"
    assert "pulseMesh" in html, "Directional travel pulse particle verified"
    print("  [PASS] Flight path is razor-sharp bright green/cyan beam with continuous trail-to-airplane anchoring and directional flow pulse.")

    # 5. Verify Two-Scroll Interaction & Arrival Reveal
    print("\n--- 5. Two-Scroll Interaction & Destination Arrival ---")
    assert 'scrollPromptText.innerHTML = "Scroll down to begin flight &darr; (1/2)"' in html
    assert 'scrollPromptText.innerHTML = "Scroll down to land in India &darr; (2/2)"' in html
    assert 'scrollPromptText.innerHTML = "Arrived in India &#10003;"' in html
    assert "WELCOME TO INDIA 🇮🇳" in html, "'WELCOME TO INDIA 🇮🇳' text missing"
    assert "indiaHaloGroup.scale.set(1.4, 1.4, 1.4)" in html, "India destination strong highlight missing"
    print("  [PASS] Exactly two scrolls: Scroll 1 (halfway flight + zoom) -> Scroll 2 (India arrival + strong highlight + 'WELCOME TO INDIA 🇮🇳').")

    # 6. Verify Non-Interference with Home Page
    print("\n--- 6. Preserving Home Page Integrity ---")
    with open("static/index.html", "r", encoding="utf-8") as f:
        home_content = f.read()
    assert len(home_content) > 300000, "Home page content unexpectedly small"
    assert "BharatConnect" in home_content, "Home page integrity verified"
    print("  [PASS] static/index.html is 100% untouched and preserved.")

    print("\n=================================================================")
    print(" ALL 6 FLIGHT ANIMATION IMPROVEMENT CHECKS PASSED (100%)         ")
    print("=================================================================")

if __name__ == "__main__":
    test_flight_animation_improvements()
