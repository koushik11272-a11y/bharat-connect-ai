# BharatConnect AI 🇮🇳

> **“Plan with AI. Navigate with locals. Experience India.”**

A premium, production-ready, AI-powered tourism and global collaboration ecosystem connecting international travelers—especially from the United States—with India's cultural destinations, verified local guides, hospitality businesses, authentic local experiences, and a trusted cross-border business network.

---

## 🌟 Executive Summary

BharatConnect AI is not just a flight or hotel booking site. It is an end-to-end travel ecosystem that supports users before, during, and after their journey, while also creating long-term opportunities for business networking and verified cross-border collaboration (spices, textiles, handicrafts, tourism services, and technology).

---

## 🎨 Brand Identity & Design System

- **Primary Colors**:
  - Dark Navy Blue: `#0B1F3A`
  - Royal Gold: `#D4AF37`
  - Deep Charcoal: `#111827`
  - Soft Gray: `#F5F7FA`
  - White: `#FFFFFF`
- **Aesthetic**: Premium, international startup aesthetic with glassmorphism cards, subtle gold foil accents, high contrast, clean typography (Inter / Plus Jakarta Sans / Playfair Display), and responsive layouts.

---

## 🚀 Key Feature Breakdown

### 1. AI Trip Planner Engine
- Dynamic multi-preference intake: Starting country (USA, UK, etc.), Destination in India (Golden Triangle, Kerala, Varanasi, Rajasthan, etc.), duration, party size, travel styles (Cultural, Adventure, Luxury, Family, Spiritual, Food, Business), interests tags, and budget in USD / INR.
- Step-by-step neural assembly animation.
- Comprehensive itemized Day-by-Day schedule (Morning, Afternoon, Evening, Lodging, Private Transit, Curated Dining, and Guide references).
- Budget itemization visualizer (Lodging, Transit, Guides, Dining, Contingency Reserve).
- Actions: Save Itinerary, Share Itinerary link, Print / Export to PDF, and Request Local On-Ground Assistance.

### 2. 3-Stage Connected Journey (Before, During, After)
- **Before Travel**: AI planning, budget optimizer, visa checklist, and packing list generator.
- **During Travel**: Verified local guides, 24/7 AI cultural/language concierge, transport telemetry, and Emergency SOS helpline integration.
- **After Travel**: Community reviews, guide ratings, traveler stories, and the India Travel Ambassador program.

### 3. Verified Local Guides Directory
- Search & filter by City, Language (English, French, Spanish, German), Experience Category, and price.
- Detailed Guide Cards with Ministry of Tourism verification badges, ratings, completed journeys, and daily rates.
- **Interactive Modals**:
  - Full Guide Profile with bio & signature walks.
  - Live Simulated Chat: Real-time dialogue simulation with guides.
  - Instant Hire / Booking request flow.

### 4. Curated Local Experiences Catalog
- Filter by category (Cooking, Heritage Walks, Sacred & Spiritual, Wildlife, Handicrafts, Spice Docks).
- Real-time price conversion between USD ($) and INR (₹).
- One-click reservation modal with dietary and guest options.

### 5. BharatConnect Premium Pass
- Three membership tiers: **Explorer**, **Premium** (Most Popular), and **Global Partner**.
- Interactive Monthly vs. Annual toggle (25% discount).
- Clear legal compliance disclosure (membership & networking service).

### 6. Global Collaboration Lounge & Verified Business Directory
- Connects US & global travelers and entrepreneurs with vetted Indian enterprises (Organic Spice Guilds, Handloom & Block Print Guilds, Heritage Haveli Palaces, Deep-Tech Travel Labs).
- 8-Step Verified Collaboration flow.
- Interactive "Request Collaboration" modal.
- "Become a Partner" business application modal.
- Explicit regulatory due diligence disclosures.

### 7. Global Traveler Community Feed
- Real traveler stories (e.g. Solo travel in Rajasthan, US spice sourcing in Kerala, family travel tips).
- Interactive Like counter, expandable replies/comments thread, follow author toggle, and "Share Your Story" creation modal.

### 8. Trust & Safety & Emergency SOS Hub
- Floating and menu-accessible Emergency SOS hub.
- Direct quick-dial buttons for US Embassy in New Delhi, National Tourist Helpline (1363), and 112 Emergency dispatch.

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Python 3.13 + **FastAPI** + **Uvicorn**
  - Fully asynchronous REST API.
  - Endpoints for trip planning, guides directory, experiences, collaboration requests, community feed, and static delivery.
- **Frontend**: Responsive Single-Page Application (HTML5, Tailwind CSS, Lucide Icons, Vanilla ES6+ JavaScript).
  - Fast, modular, zero-build needed, instant reload.
  - Works on Desktop (1440px), Tablet (768px), and Mobile (375px).
- **Data Layer**: Clean JSON datasets in `data/` (`guides.json`, `experiences.json`, `partners.json`, `community.json`).

---

## ⚡ Quick Start & Running the Project

### Option A: Direct Command Line
```bash
# Start the FastAPI server
python server.py
```
Open your browser and navigate to:
```
http://localhost:8000
```

### Option B: Windows One-Click
Double-click `run.bat` in the project root directory.

---

## 🧪 Automated Testing

Run the automated endpoint verification suite:
```bash
python test_api.py
```
All API tests will execute and report test passes for `/api/health`, `/api/guides`, `/api/experiences`, `/api/partners`, `/api/plan-trip`, `/api/collaborate`, and `/api/community`.
