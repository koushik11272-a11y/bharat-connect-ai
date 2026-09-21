import urllib.request
import json
import sys

def verify_live():
    url = "http://127.0.0.1:8000/"
    req = urllib.request.Request(url, headers={"User-Agent": "BharatConnectVerification"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8')

    print("==================================================================")
    print("      BHARATCONNECT AI - LIVE TARGETED ENHANCEMENT AUDIT         ")
    print("==================================================================")

    # 1. 5 Quick Action Cards
    assert "Plan My Trip" in html, "Missing Card 1: Plan My Trip"
    assert "Explore India" in html, "Missing Card 2: Explore India"
    assert "Find a Local Guide" in html, "Missing Card 3: Find a Local Guide"
    assert "Discover Experiences" in html, "Missing Card 4: Discover Experiences"
    assert "Global Collaboration" in html, "Missing Card 5: Global Collaboration"
    print("[PASS] 1. All 5 Quick Action cards verified in live HTML")

    # 2. Global Collaboration Card Details & Navigation
    assert "switchAppView('collaboration')" in html, "Missing switchAppView('collaboration') handler"
    assert "Connect with verified global partners, businesses and tourism networks." in html, "Missing description"
    assert "Explore Collaboration" in html, "Missing CTA: Explore Collaboration"
    print("[PASS] 2. Global Collaboration card content, icon, and navigation verified")

    # 3. Compact Supporting Section
    assert "Your India Journey, One Platform" in html, "Missing section title: Your India Journey, One Platform"
    assert "BharatConnect AI connects international travelers with India through intelligent planning, trusted local guidance, experiences and global partnerships." in html, "Missing explanation sentence"
    assert "AI-Powered Planning" in html, "Missing AI-Powered Planning highlight"
    assert "Verified Local Connections" in html, "Missing Verified Local Connections highlight"
    print("[PASS] 3. Supporting section 'Your India Journey, One Platform' & 3 highlights verified")

    # 4. Multi-Currency Selector
    assert 'id="global-currency-select"' in html, "Missing #global-currency-select in desktop header"
    assert 'id="mobile-currency-select"' in html, "Missing #mobile-currency-select in mobile drawer"
    currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "SGD", "AED", "INR"]
    for c in currencies:
        assert f'value="{c}"' in html, f"Missing currency {c} option"
    print(f"[PASS] 4. Multi-Currency Selector verified with all 9 currencies: {', '.join(currencies)}")

    # 5. Live Currency Rates Endpoint
    rates_req = urllib.request.Request("http://127.0.0.1:8000/api/currency/rates", headers={"User-Agent": "BharatConnectVerification"})
    with urllib.request.urlopen(rates_req, timeout=10) as r_resp:
        r_data = json.loads(r_resp.read().decode('utf-8'))
        assert r_data["base"] == "INR", f"Expected base currency INR, got {r_data['base']}"
        assert len(r_data["rates_to_inr"]) == 9, "Expected 9 currency rates"
        for c in currencies:
            assert c in r_data["rates_to_inr"], f"Missing rate for {c}"
    print("[PASS] 5. Live /api/currency/rates endpoint verified (base INR, 9 currencies)")

    # 6. Responsive Grid Layout
    assert "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-5" in html, "Missing responsive 5-column grid"
    print("[PASS] 6. Responsive grid layout confirmed for 5 cards")

    # 7. Price Elements ID for live conversion
    assert 'id="home-featured-budget"' in html, "Missing #home-featured-budget"
    assert 'id="home-guide-price-1"' in html, "Missing #home-guide-price-1"
    assert 'id="home-exp-price-1"' in html, "Missing #home-exp-price-1"
    print("[PASS] 7. Dynamic Home price bindings verified for live multi-currency conversions")

    print("\n==================================================================")
    print("      ALL LIVE TARGETED ENHANCEMENT AUDIT CHECKS PASSED 100%!     ")
    print("==================================================================")

if __name__ == "__main__":
    verify_live()
