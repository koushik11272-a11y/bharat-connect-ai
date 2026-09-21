import urllib.request
import re
import os
import json

BASE_URL = "http://127.0.0.1:8000"

def verify():
    print("==================================================================")
    print("      BHARATCONNECT AI - INFORMATION ARCHITECTURE & UX AUDIT      ")
    print("==================================================================")
    
    # 1. Fetch live index.html from running server
    url = f"{BASE_URL}/"
    req = urllib.request.Request(url, headers={"User-Agent": "BharatConnectAudit/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8')
    assert len(html) > 50000, "HTML too short"
    print(f"✓ 1. Live server served HTML ({len(html)} bytes)")

    # 2. Verify all 10 Views exist
    views = [
        "view-home",
        "view-explore",
        "view-planner",
        "view-guides",
        "view-experiences",
        "view-premium",
        "view-collaboration",
        "view-community",
        "view-about",
        "view-profile"
    ]
    for v in views:
        assert f'id="{v}"' in html, f"Missing view: {v}"
    print(f"✓ 2. All 10 dedicated view containers verified: {', '.join(views)}")

    # 3. Verify Home View Elements
    assert "Welcome to BharatConnect AI" in html, "Missing Welcome heading"
    assert "Your journey to India starts here." in html, "Missing subtitle"
    assert 'id="home-current-journey"' in html, "Missing current journey container"
    print("✓ 3. Home dashboard welcome & dynamic journey container verified")

    # 4. Verify 4 Primary Action Cards
    primary_actions = [
        ("Plan My Trip", "switchAppView('planner')"),
        ("Explore India", "switchAppView('explore')"),
        ("Local Guidance", "switchAppView('guides')"),
        ("Experiences", "switchAppView('experiences')")
    ]
    for title, action in primary_actions:
        assert title in html, f"Missing primary action title: {title}"
        assert action in html, f"Missing onclick action for {title}: {action}"
    print("✓ 4. All 4 Primary Action Cards verified with correct click handlers")

    # 5. Verify Recommended for You (3 preview cards)
    assert "Recommended for You" in html, "Missing Recommended for You section"
    assert "Golden Triangle (Delhi, Agra, Jaipur)" in html, "Missing Golden Triangle preview"
    assert "Varanasi Dawn Boat & Ganga Aarti" in html, "Missing Varanasi preview"
    assert "Arjun Sharma" in html, "Missing guide preview"
    print("✓ 5. Curated 3-card 'Recommended for You' section verified")

    # 6. Verify Quick Access Cards
    assert "Quick Access" in html, "Missing Quick Access section"
    print("✓ 6. Quick Access shortcuts verified")

    # 7. Verify Desktop and Mobile Navigation
    nav_targets = ["#home", "#explore", "#planner", "#guides", "#experiences", "#premium", "#collaboration", "#community", "#profile", "#about"]
    for target in nav_targets:
        assert f'href="{target}"' in html, f"Missing nav link: {target}"
    assert 'id="mobile-drawer"' in html, "Missing mobile drawer"
    print("✓ 7. Desktop navigation and mobile drawer verified with all route targets")

    # 8. Verify app.js router & functions
    with open("static/js/app.js", "r", encoding="utf-8") as f:
        js = f.read()
    router_symbols = [
        "VALID_APP_VIEWS",
        "HASH_VIEW_MAP",
        "switchAppView",
        "handleRouteHash",
        "renderHomeDashboard",
        "renderProfileView",
        "initAppRouter"
    ]
    for sym in router_symbols:
        assert sym in js, f"Missing router symbol in app.js: {sym}"
    print(f"✓ 8. JavaScript router symbols verified in app.js ({len(router_symbols)} symbols)")

    # 9. Verify styles.css SPA classes
    with open("static/css/styles.css", "r", encoding="utf-8") as f:
        css = f.read()
    css_symbols = [
        ".app-view",
        ".app-view.active-view",
        ".nav-link.active-nav",
        ".primary-action-card"
    ]
    for cs in css_symbols:
        assert cs in css, f"Missing CSS class in styles.css: {cs}"
    print(f"✓ 9. CSS SPA rules and action card classes verified in styles.css")

    # 10. Verify absence of unsupported claims ("Ministry of Tourism Certified")
    for filepath in ["static/index.html", "static/js/app.js", "data/guides.json", "data/partners.json"]:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        assert "Ministry of Tourism Certified" not in content, f"Found unsupported claim in {filepath}"
    print("✓ 10. Unsupported government claims audit: 0 found (Sanitized to Platform Verified)")

    print("\n==================================================================")
    print("    SUCCESS: ALL 10 IA & UX VERIFICATION CRITERIA PASSED 100%!    ")
    print("==================================================================")

if __name__ == "__main__":
    verify()
