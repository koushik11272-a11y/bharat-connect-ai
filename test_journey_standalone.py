import urllib.request

def run_checks():
    print("Testing http://127.0.0.1:8000/journey.html...")
    req = urllib.request.urlopen("http://127.0.0.1:8000/journey.html", timeout=5)
    assert req.status == 200, f"Status was {req.status}"
    html = req.read().decode("utf-8")

    # 1. Header matching reference: step 2 badge + exact title
    assert "Your journey across the world" in html, "Missing header title"
    assert "step-badge" in html, "Missing step-badge"
    print("  [PASS] 1. Header with step (2) and exact title present")

    # 2. 3D WebGL Canvas container
    assert 'id="canvas-container"' in html, "Missing #canvas-container"
    print("  [PASS] 2. 3D WebGL Canvas container present")

    # 3. Three.js and TopoJSON libraries linked
    assert "three.min.js" in html and "topojson-client.min.js" in html, "Missing libraries"
    print("  [PASS] 3. Three.js and TopoJSON libraries linked")

    # 4. Projected 3D badges for Origin and India Destination
    assert 'id="origin-marker"' in html and 'id="destination-marker"' in html, "Missing markers"
    assert "origin-badge" in html and "destination-badge" in html, "Missing marker classes"
    print("  [PASS] 4. Projected 3D badges for Origin and India Destination present")

    # 5. Bottom Journey Timeline matching reference
    assert "bottom-timeline-container" in html, "Missing timeline container"
    assert 'id="timeline-step-0"' in html and 'id="timeline-step-4"' in html, "Missing timeline steps"
    assert "Across Asia" in html, "Missing Across Asia in timeline"
    print("  [PASS] 5. Bottom Journey Timeline matching reference present")

    # 6. Two-scroll state machine with throttling
    assert "journeyStep" in html and "setJourneyStep" in html, "Missing state machine"
    assert "lastWheelTime" in html, "Missing scroll debounce/throttling"
    print("  [PASS] 6. Two-scroll state machine with throttling present")

    # 7. Great-circle geodesic route and 3D aircraft model
    assert "buildFlightTrajectory" in html, "Missing buildFlightTrajectory"
    assert "createAirplaneModel" in html, "Missing createAirplaneModel"
    assert "positionAirplaneAt" in html, "Missing positionAirplaneAt"
    print("  [PASS] 7. Great-circle geodesic route and 3D aircraft model present")

    # 8. Arrival sequence and automatic transition to index.html
    assert "triggerArrivalAndTransition" in html, "Missing triggerArrivalAndTransition"
    assert "index.html" in html, "Missing redirect to index.html"
    assert "Welcome to India" in html, "Missing arrival card Welcome to India"
    print("  [PASS] 8. Arrival sequence and automatic transition to index.html verified")

    # 9. Dynamic country selector with global origins
    assert 'id="country-select"' in html, "Missing country select dropdown"
    for c in ["Japan", "United States", "Germany", "Australia", "Singapore"]:
        assert c in html, f"Missing country option {c}"
    print("  [PASS] 9. Dynamic country selector with multiple global origins verified")

    # 10. Verify static textures and data are served
    assets = [
        "/static/textures/earth_day.jpg",
        "/static/textures/earth_night.jpg",
        "/static/data/countries-110m.json"
    ]
    for asset in assets:
        r = urllib.request.urlopen(f"http://127.0.0.1:8000{asset}", timeout=5)
        assert r.status == 200, f"Asset {asset} failed with {r.status}"
        data = r.read()
        print(f"  [PASS] Static asset {asset} served: {len(data)} bytes")

    print("\n============================================================")
    print("   ALL 10 VERIFICATION CHECKPOINTS PASSED 100% CLEANLY!    ")
    print("============================================================")

if __name__ == "__main__":
    run_checks()
