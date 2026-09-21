/**
 * BharatConnect AI - Core Application Logic
 */

// Application State
const state = {
  currency: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bc_currency')) || 'USD',
  exchangeRate: 86.5,
  pricingCycle: 'annual', // 'annual' | 'monthly'
  guides: [],
  experiences: [],
  partners: [],
  communityPosts: [],
  activeItinerary: null,
  savedItineraries: JSON.parse(localStorage.getItem('bharatconnect_saved_plans') || '[]'),
  chatHistory: {},
  isAuthenticated: false,
  currentUser: null,
  sessionToken: null,
  plannerMode: 'ai',
  tripOptions: [],
  userTrips: [],
  selectedTripId: null,
  currentPlanFilter: 'all',
  itineraryDayImages: {},
};
if (typeof window !== 'undefined') window.state = state;

// Purge any legacy persistent authentication keys from localStorage
try {
  localStorage.removeItem('bc_session_token');
  localStorage.removeItem('bc_current_user');
} catch (e) { }

// DOM Utilities
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notification Engine
function showToast(title, message, type = 'success') {
  const container = $('#toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const borderCol = type === 'success' ? 'border-[#D4AF37]' : type === 'info' ? 'border-blue-400' : 'border-red-400';
  const icon = type === 'success' ? 'check-circle' : type === 'info' ? 'info' : 'alert-triangle';

  toast.className = `flex items-start gap-3 p-4 rounded-xl bg-[#0B1F3A]/95 border ${borderCol} shadow-2xl backdrop-blur-md text-white transition-all transform duration-300 translate-y-2 opacity-0 max-w-md pointer-events-auto`;
  toast.innerHTML = `
    <div class="text-[#D4AF37] pt-0.5"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
    <div class="flex-1">
      <h4 class="font-semibold text-sm text-white">${title}</h4>
      <p class="text-xs text-slate-300 mt-0.5 leading-relaxed">${message}</p>
    </div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ========================================================
// Multi-Currency Converter & Exchange Service
// ========================================================
const CurrencyService = {
  baseCurrency: 'INR',
  supportedCurrencies: {
    INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', rateToInr: 1.0, flag: '🇮🇳' },
    USD: { code: 'USD', symbol: '$', name: 'US Dollar', rateToInr: 86.5, flag: '🇺🇸' },
    EUR: { code: 'EUR', symbol: '€', name: 'Euro', rateToInr: 93.5, flag: '🇪🇺' },
    GBP: { code: 'GBP', symbol: '£', name: 'British Pound', rateToInr: 111.0, flag: '🇬🇧' },
    JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rateToInr: 0.58, flag: '🇯🇵' },
    CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rateToInr: 61.5, flag: '🇨🇦' },
    AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rateToInr: 56.0, flag: '🇦🇺' },
    SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rateToInr: 65.0, flag: '🇸🇬' },
    AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', rateToInr: 23.5, flag: '🇦🇪' }
  },
  ratesToInr: {
    INR: 1.0,
    USD: 86.5,
    EUR: 93.5,
    GBP: 111.0,
    JPY: 0.58,
    CAD: 61.5,
    AUD: 56.0,
    SGD: 65.0,
    AED: 23.5
  },

  getCurrency() {
    try {
      return sessionStorage.getItem('bc_currency') || state.currency || 'USD';
    } catch (e) {
      return state.currency || 'USD';
    }
  },

  setCurrency(cur) {
    if (!this.supportedCurrencies[cur]) cur = 'USD';
    try {
      sessionStorage.setItem('bc_currency', cur);
    } catch (e) { }
    state.currency = cur;
    state.exchangeRate = this.ratesToInr[cur] || 86.5;

    // Sync dropdowns & selectors
    const desktopSelect = document.getElementById('global-currency-select');
    if (desktopSelect) desktopSelect.value = cur;
    const mobileSelect = document.getElementById('mobile-currency-select');
    if (mobileSelect) mobileSelect.value = cur;

    // Sync any legacy currency buttons
    document.querySelectorAll('.currency-btn').forEach(btn => {
      if (btn.dataset.currency === cur) {
        btn.classList.add('bg-[#D4AF37]', 'text-[#0B1F3A]', 'font-bold');
        btn.classList.remove('text-slate-300', 'hover:text-white');
      } else {
        btn.classList.remove('bg-[#D4AF37]', 'text-[#0B1F3A]', 'font-bold');
        btn.classList.add('text-slate-300', 'hover:text-white');
      }
    });

    // Re-render affected views & pricing
    if (typeof renderGuides === 'function') renderGuides();
    if (typeof renderExperiences === 'function') renderExperiences();
    if (typeof updatePricingCards === 'function') updatePricingCards();
    if (typeof updatePlannerContextStrip === 'function') updatePlannerContextStrip();
    if (state.activeItinerary && typeof renderItinerary === 'function') {
      renderItinerary(state.activeItinerary);
    }
    if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
  },

  async fetchRates() {
    try {
      const res = await fetch('/api/currency/rates');
      if (res.ok) {
        const data = await res.json();
        if (data.rates_to_inr) {
          this.ratesToInr = { ...this.ratesToInr, ...data.rates_to_inr };
          if (data.currencies) {
            this.supportedCurrencies = { ...this.supportedCurrencies, ...data.currencies };
          }
        }
      }
    } catch (e) {
      console.warn('CurrencyService: Using bundled live rate fallbacks', e);
    }
  },

  convertInrTo(amountInr, targetCurrency) {
    const cur = targetCurrency || this.getCurrency();
    const rate = this.ratesToInr[cur] || 86.5;
    return amountInr / rate;
  },

  format(amountUsd, amountInr = null) {
    const cur = this.getCurrency();
    const curMeta = this.supportedCurrencies[cur] || this.supportedCurrencies['USD'];
    const sym = curMeta.symbol || '$';

    // Determine base INR
    let baseInr = amountInr;
    if (baseInr === null || baseInr === undefined) {
      if (amountUsd !== null && amountUsd !== undefined) {
        baseInr = amountUsd * (this.ratesToInr['USD'] || 86.5);
      } else {
        return '₹0 INR';
      }
    }

    const roundedInr = Math.round(baseInr);
    const inrFormatted = roundedInr.toLocaleString('en-IN');

    // Case 1: Pure USD-specified price with NO amountInr provided (e.g. membership plans $15, $39, $99)
    if (amountInr === null && amountUsd !== null) {
      if (cur === 'USD') {
        return `${sym}${Math.round(amountUsd).toLocaleString('en-US')}`;
      }
      if (cur === 'INR') {
        return `₹${inrFormatted}`;
      }
      const targetVal = this.convertInrTo(baseInr, cur);
      const formatted = cur === 'JPY' ? Math.round(targetVal).toLocaleString('ja-JP') : Math.round(targetVal).toLocaleString('en-US');
      return `${sym}${formatted}`;
    }

    // Case 2: Standard traveler services (Guides, Experiences, Trip budgets) with base INR
    if (cur === 'INR') {
      return `₹${inrFormatted} INR`;
    }

    // Target foreign currency estimate (Dual pricing: Base INR + approx Foreign Currency)
    const targetVal = this.convertInrTo(baseInr, cur);
    const targetFormatted = cur === 'JPY' ? Math.round(targetVal).toLocaleString('ja-JP') : Math.round(targetVal).toLocaleString('en-US');
    return `₹${inrFormatted} INR ≈ ${sym}${targetFormatted} ${cur}`;
  }
};

// Global formatCurrency delegating to CurrencyService
function formatCurrency(amountUsd, amountInr = null) {
  return CurrencyService.format(amountUsd, amountInr);
}

// Global setCurrency delegating to CurrencyService
function setCurrency(cur) {
  CurrencyService.setCurrency(cur);
}

// Initial Embedded Datasets (Seamless Fallback for Offline & Direct Browser Previews)
const DEFAULT_GUIDES = [
  {
    "id": "guide-1",
    "name": "Arjun Sharma",
    "city": "Jaipur",
    "state": "Rajasthan",
    "avatar": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Hindi", "French"],
    "category": "Cultural Guides",
    "expertise": ["Rajput History", "Palace Architecture", "Gem & Jewelry Markets"],
    "experience_years": 9,
    "rating": 4.98,
    "trips_completed": 342,
    "verified": true,
    "badge": "Platform Verified Expert",
    "price_per_day_usd": 65,
    "price_per_day_inr": 5400,
    "availability": "Available This Week",
    "bio": "Licensed national guide with a master's in Ancient Indian History. Passionate about bringing the royal tales of the Pink City to life for global travelers.",
    "specialties": ["Amer Fort Night Walk", "Old City Artisan Haveli Walk", "Bespoke Royal Cuisine Trail"]
  },
  {
    "id": "guide-2",
    "name": "Priya Nair",
    "city": "Kochi",
    "state": "Kerala",
    "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Malayalam", "German"],
    "category": "Food Guides",
    "expertise": ["Spice Route History", "Backwater Ecology", "Ayurvedic Culinary Arts"],
    "experience_years": 7,
    "rating": 4.95,
    "trips_completed": 280,
    "verified": true,
    "badge": "Eco-Heritage Specialist",
    "price_per_day_usd": 55,
    "price_per_day_inr": 4600,
    "availability": "Available This Week",
    "bio": "Born in Fort Kochi, Priya spent years documenting spice farmer co-ops and colonial maritime heritage. Specializes in culinary journeys and farm-to-table cuisine.",
    "specialties": ["Mattancherry Spice Warehouse Walk", "Farm-to-Table Kerala Feasts", "Houseboat Ecology Tours"]
  },
  {
    "id": "guide-3",
    "name": "Vikramaditya Sengupta",
    "city": "Varanasi",
    "state": "Uttar Pradesh",
    "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Hindi", "Bengali", "Italian"],
    "category": "Spiritual Travel Guides",
    "expertise": ["Ghat Rituals & Philosophy", "Classical Music Traditions", "Dawn Light Photography"],
    "experience_years": 12,
    "rating": 5.0,
    "trips_completed": 510,
    "verified": true,
    "badge": "Master Cultural Storyteller",
    "price_per_day_usd": 75,
    "price_per_day_inr": 6200,
    "availability": "Available This Week",
    "bio": "Varanasi native and cultural archivist. Guides international scholars, photographers, and seekers through the sacred lanes and morning rituals of Kashi.",
    "specialties": ["Private Sunrise Boat Chants", "Subah-e-Banaras Heritage Walk", "Silk Weaver Colonies Tour"]
  },
  {
    "id": "guide-4",
    "name": "Kabir Khan",
    "city": "New Delhi",
    "state": "Delhi NCR",
    "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Hindi", "Urdu", "Spanish"],
    "category": "Cultural Guides",
    "expertise": ["Mughal Architecture", "Street Food Hygiene & History", "Sufi Music Trails"],
    "experience_years": 8,
    "rating": 4.92,
    "trips_completed": 395,
    "verified": true,
    "badge": "Delhi Heritage Guild Lead",
    "price_per_day_usd": 60,
    "price_per_day_inr": 5000,
    "availability": "Available This Week",
    "bio": "Food writer and architectural historian featured in international publications. Curates safe, immersive explorations of Old and New Delhi.",
    "specialties": ["Chandni Chowk Midnight Food Trail", "Humayun's Tomb Sunset Analysis", "Nizamuddin Sufi Qawwali Evening"]
  },
  {
    "id": "guide-5",
    "name": "Ananya Kulkarni",
    "city": "Mumbai",
    "state": "Maharashtra",
    "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Marathi", "Hindi", "Japanese"],
    "category": "Business Travel Assistants",
    "expertise": ["Financial District Dynamics", "Art Deco Heritage", "Contemporary Tech & Film"],
    "experience_years": 6,
    "rating": 4.96,
    "trips_completed": 215,
    "verified": true,
    "badge": "Business Delegation Host",
    "price_per_day_usd": 70,
    "price_per_day_inr": 5800,
    "availability": "Available This Week",
    "bio": "Former corporate consultant turned executive urban guide. Bridges global business travelers and investors with Mumbai's dynamic financial ecosystems.",
    "specialties": ["Bespoke Expat & Investor Briefings", "Marine Drive Art Deco Walk", "Dabbawala Logistics Discovery"]
  },
  {
    "id": "guide-6",
    "name": "Stanzin Dorje",
    "city": "Leh",
    "state": "Ladakh",
    "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Ladakhi", "Tibetan", "Hindi"],
    "category": "Adventure Guides",
    "expertise": ["High Altitude Trekking", "Buddhist Monasteries", "Snow Leopard Habitat"],
    "experience_years": 11,
    "rating": 4.99,
    "trips_completed": 190,
    "verified": true,
    "badge": "Himalayan Mountaineering Certified",
    "price_per_day_usd": 80,
    "price_per_day_inr": 6600,
    "availability": "Available This Week",
    "bio": "Native Ladakhi environmentalist and expedition leader. Specializes in responsible eco-tourism and mountain treks across remote Himalayan valleys.",
    "specialties": ["Pangong & Nubra Valley Transits", "Thiksey Monastery Morning Puja", "Stargazing at Hanle Reserve"]
  },
  {
    "id": "guide-7",
    "name": "Sunita Mehra",
    "city": "Agra",
    "state": "Uttar Pradesh",
    "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Hindi", "French"],
    "category": "Family Travel Guides",
    "expertise": ["Family Pacing", "Kid-Friendly Storytelling", "Taj Mahal Heritage"],
    "experience_years": 10,
    "rating": 4.97,
    "trips_completed": 320,
    "verified": true,
    "badge": "Certified Family Specialist",
    "price_per_day_usd": 62,
    "price_per_day_inr": 5100,
    "availability": "Available This Week",
    "bio": "Former educator and licensed heritage guide specializing in multigenerational family journeys. Makes history come alive with interactive storytelling for kids.",
    "specialties": ["Sunrise Taj Mahal Family Tour", "Fatehpur Sikri Scavenger Walk", "Marble Inlay Workshop for Children"]
  },
  {
    "id": "guide-8",
    "name": "Rohan Deshmukh",
    "city": "Bengaluru",
    "state": "Karnataka",
    "avatar": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80",
    "languages": ["English", "Kannada", "Hindi", "German"],
    "category": "Business Travel Assistants",
    "expertise": ["Tech Ecosystem Tours", "Craft Beer & Microbreweries", "Garden City History"],
    "experience_years": 5,
    "rating": 4.91,
    "trips_completed": 165,
    "verified": true,
    "badge": "Tech Tour Specialist",
    "price_per_day_usd": 65,
    "price_per_day_inr": 5400,
    "availability": "Available This Week",
    "bio": "Tech entrepreneur and startup community host. Connects international venture guests and corporate executives to India's Silicon Valley.",
    "specialties": ["Startup Incubator & Venture Walks", "Lalbagh Botanical Heritage Walk", "Indiranagar Craft Brewery Circuit"]
  }
];

const DEFAULT_EXPERIENCES = [
  {
    "id": "exp-1",
    "title": "Traditional Indian Cooking Experience",
    "subtitle": "Royal Rajasthani Haveli Masterclass & Courtyard Dinner",
    "category": "Cooking & Culinary",
    "city": "Jaipur",
    "state": "Rajasthan",
    "image": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80",
    "description": "Step inside a 200-year-old aristocratic haveli. Grind artisanal spices on traditional stone mills, learn family heirlooms like Laal Maas or Dal Baati Churma, and dine under candlelit courtyards.",
    "duration": "4.5 Hours",
    "rating": 4.98,
    "review_count": 196,
    "price_usd": 68,
    "price_inr": 5600,
    "verified": true,
    "badge": "Master Host Vetted",
    "includes": ["Organic Spices & Raw Ingredients", "Multi-course Royal Courtyard Feast", "Handbound Recipe Keepsake", "Chauffeur Pickup & Return"]
  },
  {
    "id": "exp-2",
    "title": "Heritage Walking Tour",
    "subtitle": "Old Delhi Mughal Citadel & Shahjahanabad Alleys",
    "category": "Heritage Walks",
    "city": "New Delhi",
    "state": "Delhi NCR",
    "image": "https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=600&auto=format&fit=crop&q=80",
    "description": "Navigate the secret alleys of Shahjahanabad with an acclaimed architectural historian. Discover hidden 17th-century haveli doorways, spice bazaars, and acoustic courtyards.",
    "duration": "3.5 Hours",
    "rating": 4.97,
    "review_count": 342,
    "price_usd": 50,
    "price_inr": 4150,
    "verified": true,
    "badge": "Heritage Guild Certified",
    "includes": ["Historic Site Permits", "Heritage Rickshaw Transit", "Specialist Historian Guide", "Artisan Chai & Mineral Water"]
  },
  {
    "id": "exp-3",
    "title": "Local Market Discovery",
    "subtitle": "Mattancherry Historic Spice Warehouse & Pepper Trading Walk",
    "category": "Market Discovery",
    "city": "Kochi",
    "state": "Kerala",
    "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&auto=format&fit=crop&q=80",
    "description": "Explore ancient maritime docks where Venetian, Arab, and Dutch merchants traded black pepper. Meet multigenerational pepper merchants and inspect over 20 single-origin spices.",
    "duration": "3 Hours",
    "rating": 4.95,
    "review_count": 168,
    "price_usd": 42,
    "price_inr": 3450,
    "verified": true,
    "badge": "Spice Council Approved",
    "includes": ["Live Pepper Tasting Session", "Botanical Spice Compendium", "Handmade Organic Spice Keepsake", "Traditional Ginger Coffee"]
  },
  {
    "id": "exp-4",
    "title": "Village Cultural Experience",
    "subtitle": "Alleppey Backwaters & Paddy Farming Hamlet Immersion",
    "category": "Village & Cultural",
    "city": "Alleppey",
    "state": "Kerala",
    "image": "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=600&auto=format&fit=crop&q=80",
    "description": "Glide through tranquil palm-fringed lagoons aboard a solar-hybrid luxury Kettuvallam. Disembark at an organic coir-weaving hamlet, meet paddy farmers, and enjoy a traditional banana leaf feast.",
    "duration": "Full Day (7 Hours)",
    "rating": 4.99,
    "review_count": 410,
    "price_usd": 135,
    "price_inr": 11200,
    "verified": true,
    "badge": "Responsible Tourism Certified",
    "includes": ["Private Eco-Cruiser", "Chef-prepared Banana Leaf Lunch", "Village Canoe Ride", "Tender Coconut Refreshments"]
  },
  {
    "id": "exp-5",
    "title": "Indian Handicraft Workshop",
    "subtitle": "Bagru Handcrafted Block Printing & Natural Indigo Dyeing",
    "category": "Handicrafts & Arts",
    "city": "Jaipur",
    "state": "Rajasthan",
    "image": "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
    "description": "Learn 500-year-old Bagru block printing directly from fifth-generation Chippa artisan families. Carve wooden motifs, mix natural vegetable pigments, and hand-print your own pure silk scarf.",
    "duration": "4 Hours",
    "rating": 4.98,
    "review_count": 235,
    "price_usd": 62,
    "price_inr": 5100,
    "verified": true,
    "badge": "Artisan Guild Partner",
    "includes": ["Pure Mulberry Silk Scarf", "Carved Wooden Stamp Keepsake", "Natural Dye Workshop Kit", "Private Studio Tour"]
  },
  {
    "id": "exp-6",
    "title": "Wildlife and Nature Experience",
    "subtitle": "Ranthambore Royal Bengal Tiger Sanctuary Jeep Expedition",
    "category": "Wildlife & Nature",
    "city": "Sawai Madhopur",
    "state": "Rajasthan",
    "image": "https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=600&auto=format&fit=crop&q=80",
    "description": "Customized 4x4 open-top safari through the ancient hunting grounds of Maharajas, punctuated by crumbling ruins and prime tiger territory with an elite naturalist tracker.",
    "duration": "5 Hours",
    "rating": 4.96,
    "review_count": 290,
    "price_usd": 125,
    "price_inr": 10300,
    "verified": true,
    "badge": "Naturalist Track Certified",
    "includes": ["VIP Forest Zone Permit", "Government Senior Naturalist", "High-clarity Nikon Binoculars", "Field Refreshment Hamper"]
  },
  {
    "id": "exp-7",
    "title": "Festival and Cultural Experience",
    "subtitle": "Varanasi Private Dawn Aarti & Sacred Ghats Boat Odyssey",
    "category": "Spiritual & Festivals",
    "city": "Varanasi",
    "state": "Uttar Pradesh",
    "image": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=600&auto=format&fit=crop&q=80",
    "description": "Witness the ethereal sunrise over the holy Ganges river from a hand-carved wooden boat. Listen to Vedic chants, witness sacred morning rituals at Dashashwamedh, and float flower diyas with priests.",
    "duration": "3 Hours",
    "rating": 4.99,
    "review_count": 435,
    "price_usd": 48,
    "price_inr": 3950,
    "verified": true,
    "badge": "Sacred Heritage Certified",
    "includes": ["Private Wooden Riverboat", "Vedic Diya Offering Ceremony", "Subah-e-Banaras Sitar Performance", "Artisan Clay-Cup Masala Chai"]
  },
  {
    "id": "exp-8",
    "title": "Local Food Trail",
    "subtitle": "Old Delhi Legendary Midnight Street Food & Mughal Sweets Trail",
    "category": "Food Trails",
    "city": "New Delhi",
    "state": "Delhi NCR",
    "image": "https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=600&auto=format&fit=crop&q=80",
    "description": "Taste your way through 7 legendary culinary institutions with a food scientist and historian. Enjoy hot jalebis, slow-cooked nihari, butter naan, and melt-in-mouth Daulat ki Chaat prepared with verified bottled water.",
    "duration": "3.5 Hours",
    "rating": 4.97,
    "review_count": 350,
    "price_usd": 52,
    "price_inr": 4300,
    "verified": true,
    "badge": "Culinary Guild Certified",
    "includes": ["All 7 Curated Tastings", "Hygienic Bottled Water & Lassi", "Cycle Rickshaw Logistics", "Culinary Guide & Food Scientist"]
  }
];

const DEFAULT_PARTNERS = [
  {
    "id": "partner-1",
    "name": "Malabar Organic Spice Guild",
    "country": "India",
    "city": "Wayanad, Kerala",
    "industry": "Spices and Food Products",
    "verification_status": "Govt of India Spices Board Certified",
    "description": "Consortium of 120 smallholder organic farmers harvesting single-origin Tellicherry black pepper, green cardamom, and high-curcumin Lakadong turmeric. Export-ready to North American organic food distributors.",
    "collaboration_interests": ["US Gourmet Food Retailers", "Organic Wholesale Importers", "Farm-to-Fork Brand Partnerships"],
    "contact_email": "connect@malabarorganics.in",
    "products": ["Single-Estate Tellicherry Pepper", "Sun-dried Ginger", "Organic Green Cardamom"],
    "collaboration_type": "Wholesale Export & Co-branding"
  },
  {
    "id": "partner-2",
    "name": "Jaipur Royal Weaves & Block Collective",
    "country": "India",
    "city": "Jaipur, Rajasthan",
    "industry": "Handicrafts and Textiles",
    "verification_status": "Fair Trade Certified Producer",
    "description": "Heritage artisanal enterprise employing 85 master dyers and block carvers. Specializes in organic hand-spun cotton, modal silk fabrics, and natural indigo home decor line tailored for luxury Western interior designers.",
    "collaboration_interests": ["US Boutique Fashion Labels", "Sustainable Home Furnishing Brands", "Ethical Design Studios"],
    "contact_email": "partners@jaipurweaves.org",
    "products": ["Hand-block Table Linens", "Artisanal Dabu Bedding", "Handwoven Cotton Kaftans"],
    "collaboration_type": "Custom Design Manufacturing"
  },
  {
    "id": "partner-3",
    "name": "Heritage Haveli Palaces Alliance",
    "country": "India",
    "city": "Udaipur, Rajasthan",
    "industry": "Hospitality",
    "verification_status": "Heritage Hotels of India Member",
    "description": "Network of 14 independently owned historic palaces, river retreats, and boutique havelis offering carbon-neutral, private buyouts for executive retreats, wellness sabbaticals, and bespoke private tours.",
    "collaboration_interests": ["US Luxury Travel Concierges (Virtuoso, Signature)", "Silicon Valley Executive Retreat Organizers", "Destination Wedding Planners"],
    "contact_email": "concierge@havelialliance.in",
    "products": ["Private Fort Buyouts", "Curated Wellness Sabbaticals", "Bespoke Royal Dinners"],
    "collaboration_type": "Direct Inbound Alliances"
  },
  {
    "id": "partner-4",
    "name": "Incredible India Heritage Expeditions",
    "country": "India",
    "city": "New Delhi, Delhi NCR",
    "industry": "Tourism Services",
    "verification_status": "Platform Verified Regional DMO",
    "description": "Inbound destination management company with nationwide private fleet and bilingual concierge desks. Specializes in turnkey ground logistics for US educational tours, VIP families, and cultural delegations.",
    "collaboration_interests": ["North American Tour Operators", "University Study-Abroad Programs", "Alumni Travel Associations"],
    "contact_email": "dispatch@heritageexpeditions.in",
    "products": ["Private Chauffeur Fleet Operations", "VIP Fast-Track Airport Assistance", "Emergency Response Coordination"],
    "collaboration_type": "Ground Operator Partnership"
  },
  {
    "id": "partner-5",
    "name": "Zenith AI Travel & Mobility Labs",
    "country": "India",
    "city": "Bengaluru, Karnataka",
    "industry": "Technology Services",
    "verification_status": "NASSCOM DeepTech Certified",
    "description": "B2B travel-tech software engineering studio building autonomous multi-modal routing APIs, dynamic bus/rail ticketing aggregators, and real-time transit telemetry for international travel agencies.",
    "collaboration_interests": ["Global Online Travel Agencies (OTAs)", "Corporate Travel Management Firms", "Cross-border Travel Insurance Tech"],
    "contact_email": "enterprise@zenithtraveltech.io",
    "products": ["India Transit SDK", "Dynamic Multi-modal Routing Engine", "Local Guide Scheduling API"],
    "collaboration_type": "Technology Integration & Licensing"
  },
  {
    "id": "partner-6",
    "name": "Himalayan Forest Botanical Co.",
    "country": "India",
    "city": "Dehradun, Uttarakhand",
    "industry": "Sustainable Products",
    "verification_status": "GMP & ISO 9001 Certified",
    "description": "Wild-harvested Himalayan essential oils, cold-pressed apricot kernel oil, and certified organic Ayurvedic botanical extracts sourced from high-altitude women's cooperatives.",
    "collaboration_interests": ["Clean Beauty Brands in North America & EU", "Luxury Spa Chains", "Aromatherapy Retailers"],
    "contact_email": "partnerships@himalayanbotanicals.com",
    "products": ["Himalayan Cedarwood Oil", "Apricot Kernel Serum", "Wild Lavender Hydrosol"],
    "collaboration_type": "Bulk Botanical Supply & Private Label"
  },
  {
    "id": "partner-7",
    "name": "Varanasi Silk Handloom Guild",
    "country": "India",
    "city": "Varanasi, Uttar Pradesh",
    "industry": "Cultural Products",
    "verification_status": "GI Tagged Certified Handloom Producer",
    "description": "Apex cooperative of 240 master weavers preserving authentic Katan and Kadhwa silk brocades. Directly connects certified handwoven sarees and bespoke scarves to international fashion curators.",
    "collaboration_interests": ["International Haute Couture Houses", "Textile Museum Curators", "Fair Trade Silk Retailers"],
    "contact_email": "heritage@varanasiweaves.org",
    "products": ["GI-Tagged Banarasi Silk", "Gold Zari Brocades", "Organic Mulberry Silk Stoles"],
    "collaboration_type": "Artisanal Commission & Consignment"
  },
  {
    "id": "partner-8",
    "name": "Indo-US Legal & Cross-Border Advisory",
    "country": "India",
    "city": "Mumbai, Maharashtra",
    "industry": "Other Verified Business Services",
    "verification_status": "Bar Council of India Registered / AmCham Member",
    "description": "Specialized boutique advisory assisting international founders, import-export pioneers, and hospitality investors with compliance, GST registration, contract localization, and cross-border vendor vetting.",
    "collaboration_interests": ["US SMEs Entering Indian Market", "Tourism Joint Ventures", "Foreign Direct Investment Facilitators"],
    "contact_email": "advisory@indouslegal.com",
    "products": ["Vendor Due Diligence Audits", "FDI & Regulatory Compliance Roadmap", "Cross-Border Contract Templates"],
    "collaboration_type": "Professional Retainer Advisory"
  }
];

const DEFAULT_COMMUNITY = [
  {
    "id": "post-1",
    "author_name": "Sarah Jenkins",
    "author_avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80",
    "author_origin": "San Francisco, CA, USA",
    "title": "My First Week in India: Golden Triangle as a Solo Female Traveler",
    "category": "Traveler Stories",
    "tags": ["SoloTravel", "GoldenTriangle", "SafetyTips", "Culture"],
    "date": "2 days ago",
    "content": "Before landing in New Delhi, I read every contradictory blog on the internet. BharatConnect AI matched me with Kabir Khan for Old Delhi and Arjun Sharma in Jaipur. Having verified local guides transformed what could have been overwhelming into the most welcoming, mind-opening week of my life. If you're coming from the US: get an Airtel e-SIM at the airport, keep cash in small denominations (₹100/₹200), and trust the BharatConnect verified network!",
    "likes": 142,
    "user_liked": false,
    "followers_count": 84,
    "is_following": false,
    "comments_count": 28,
    "comments": [
      { "author": "David Miller (Chicago)", "text": "Did you take the train between Delhi and Jaipur or hire a private chauffeur?", "time": "1 day ago" },
      { "author": "Sarah Jenkins (Author)", "text": "We booked the Vande Bharat Express! Super modern, punctuality was top notch, and breakfast was included.", "time": "18 hours ago" }
    ]
  },
  {
    "id": "post-2",
    "author_name": "Michael Chang",
    "author_avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80",
    "author_origin": "Austin, Texas, USA",
    "title": "Connecting with Local Communities: How a Kerala Spice Tour Turned into a Pepper Partnership",
    "category": "Business & Collaboration",
    "tags": ["CrossBorder", "SpiceTrade", "Kerala", "FairTrade"],
    "date": "4 days ago",
    "content": "As an artisan food maker in Austin, I went to Wayanad with Priya Nair to discover heirloom spices. During the tour, I was introduced to the Malabar Organic Spice Guild through the Global Collaboration Lounge. We've just completed a trial sample shipment of sun-dried Tellicherry peppercorns! It's incredible how travel can unlock real, ethical business bridges.",
    "likes": 204,
    "user_liked": false,
    "followers_count": 132,
    "is_following": false,
    "comments_count": 39,
    "comments": [
      { "author": "Elena Rostova (Berlin)", "text": "This is amazing! How was the customs & regulatory guidance process handled?", "time": "3 days ago" },
      { "author": "Michael Chang (Author)", "text": "The platform strictly handles discovery and introduction; they provided us with a list of verified trade advisory chambers which made the paperwork seamless.", "time": "2 days ago" }
    ]
  },
  {
    "id": "post-3",
    "author_name": "Dr. Marcus & Chloe Evans",
    "author_avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80",
    "author_origin": "Boston, MA, USA",
    "title": "Planning a Family Trip to India: What Worked & What Didn't Across Rajasthan",
    "category": "Family Travel",
    "tags": ["FamilyTravel", "Rajasthan", "KidsInIndia", "ItineraryTips"],
    "date": "1 week ago",
    "content": "Our tips for families visiting India: 1. Don't plan more than 2 major monuments per day. 2. Stay in heritage hotels with pools so kids can decompress in the afternoons. 3. The Block Printing workshop in Bagru was the biggest highlight—our kids created their own scarves and still talk about it every day!",
    "likes": 98,
    "user_liked": false,
    "followers_count": 56,
    "is_following": false,
    "comments_count": 17,
    "comments": [
      { "author": "Jennifer Walsh (Atlanta)", "text": "Which heritage havelis did you stay in with the kids?", "time": "5 days ago" }
    ]
  },
  {
    "id": "post-4",
    "author_name": "Chef Anthony Morel",
    "author_avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80",
    "author_origin": "New York, NY, USA",
    "title": "Best Local Food Experiences: From Chandni Chowk Jalebis to Royal Haveli Laal Maas",
    "category": "Traveler Stories",
    "tags": ["CulinaryTrail", "OldDelhi", "JaipurFood", "StreetEats"],
    "date": "5 days ago",
    "content": "I came to India expecting spice, but I discovered a symphony of regional culinary techniques. Old Delhi's Daulat ki Chaat melted like sweet cloud foam. In Jaipur, cooking with a royal haveli family taught me that true garam masala has 16 toasted spices balanced to the millimeter. Don't skip the curated food walks—our guide knew which vendors use pure filtered water and pristine hygiene!",
    "likes": 175,
    "user_liked": false,
    "followers_count": 210,
    "is_following": false,
    "comments_count": 31,
    "comments": [
      { "author": "Siddharth Verma (Delhi)", "text": "Spot on about Daulat ki Chaat! It is only made on winter mornings under the dew.", "time": "3 days ago" }
    ]
  },
  {
    "id": "post-5",
    "author_name": "Claire & Liam Hemsworth",
    "author_avatar": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80",
    "author_origin": "Seattle, WA, USA",
    "title": "How to Prepare for Your First Visit: e-Visa, Currency, Connectivity & Cultural Etiquette",
    "category": "Traveler Stories",
    "tags": ["FirstTimeIndia", "TravelPrep", "eVisa", "SIMCard", "Etiquette"],
    "date": "6 days ago",
    "content": "Top 5 checklist items for US travelers landing for the first time: 1. Apply for the Indian 30-Day or 1-Year Tourist e-Visa at least 10 days before flight. 2. Download BharatConnect AI offline guides. 3. Carry a mix of ₹2,000 cash in ₹100 notes for temple offerings and use international credit cards everywhere else. 4. Dress respectfully with shoulders and knees covered in holy sites. 5. Greet hosts with a gentle 'Namaste'—it opens every heart in India!",
    "likes": 230,
    "user_liked": false,
    "followers_count": 180,
    "is_following": false,
    "comments_count": 42,
    "comments": [
      { "author": "Robert Evans (Denver)", "text": "Invaluable advice. The e-Visa tip saved us from last minute panic.", "time": "4 days ago" }
    ]
  }
];

// Initial Data Fetch with Dual-Mode Offline Fallback
async function initData() {
  try {
    const [guidesRes, expRes, partnersRes, commRes] = await Promise.all([
      fetch('/api/guides').then(r => r.ok ? r.json() : null),
      fetch('/api/experiences').then(r => r.ok ? r.json() : null),
      fetch('/api/partners').then(r => r.ok ? r.json() : null),
      fetch('/api/community').then(r => r.ok ? r.json() : null)
    ]);

    state.guides = (guidesRes && guidesRes.guides && guidesRes.guides.length > 0) ? guidesRes.guides : DEFAULT_GUIDES;
    state.experiences = (expRes && expRes.experiences && expRes.experiences.length > 0) ? expRes.experiences : DEFAULT_EXPERIENCES;
    state.partners = (partnersRes && partnersRes.partners && partnersRes.partners.length > 0) ? partnersRes.partners : DEFAULT_PARTNERS;
    state.communityPosts = (commRes && commRes.posts && commRes.posts.length > 0) ? commRes.posts : DEFAULT_COMMUNITY;

    // Initialize rates and currency preference
    await CurrencyService.fetchRates();
    CurrencyService.setCurrency(CurrencyService.getCurrency());

    renderGuides();
    renderExperiences();
    renderPartners();
    renderCommunity();
    setupFilters();
  } catch (err) {
    console.warn('Backend API connection warning, activating embedded datasets:', err);
    state.guides = DEFAULT_GUIDES;
    state.experiences = DEFAULT_EXPERIENCES;
    state.partners = DEFAULT_PARTNERS;
    state.communityPosts = DEFAULT_COMMUNITY;

    // Initialize rates and currency preference
    await CurrencyService.fetchRates();
    CurrencyService.setCurrency(CurrencyService.getCurrency());

    renderGuides();
    renderExperiences();
    renderPartners();
    renderCommunity();
    setupFilters();
  }
}

// Pricing Cycle Switcher (Monthly / Annual)
function setPricingCycle(cycle) {
  state.pricingCycle = cycle;
  const toggleBtn = $('#pricing-toggle-knob');
  const annualLabel = $('#pricing-annual-label');
  const monthlyLabel = $('#pricing-monthly-label');

  if (cycle === 'annual') {
    toggleBtn.style.transform = 'translateX(24px)';
    annualLabel.classList.add('text-[#D4AF37]', 'font-bold');
    annualLabel.classList.remove('text-slate-400');
    monthlyLabel.classList.remove('text-[#D4AF37]', 'font-bold');
    monthlyLabel.classList.add('text-slate-400');
  } else {
    toggleBtn.style.transform = 'translateX(0px)';
    monthlyLabel.classList.add('text-[#D4AF37]', 'font-bold');
    monthlyLabel.classList.remove('text-slate-400');
    annualLabel.classList.remove('text-[#D4AF37]', 'font-bold');
    annualLabel.classList.add('text-slate-400');
  }
  updatePricingCards();
}

function updatePricingCards() {
  const isAnnual = state.pricingCycle === 'annual';
  const explorerPrice = $('#price-explorer');
  const premiumPrice = $('#price-premium');
  const partnerPrice = $('#price-partner');

  if (explorerPrice) {
    const usd = isAnnual ? 15 : 19;
    explorerPrice.textContent = formatCurrency(usd);
  }
  if (premiumPrice) {
    const usd = isAnnual ? 39 : 49;
    premiumPrice.textContent = formatCurrency(usd);
  }
  if (partnerPrice) {
    const usd = isAnnual ? 99 : 129;
    partnerPrice.textContent = formatCurrency(usd);
  }
}

// Switch Between Two Trip Planner Modes (Option 1: AI vs Option 2: Custom)
function switchPlannerMode(mode) {
  state.plannerMode = mode;

  const btnAi = $('#mode-btn-ai');
  const badgeAi = $('#mode-badge-ai');
  const btnCustom = $('#mode-btn-custom');
  const badgeCustom = $('#mode-badge-custom');
  const formAi = $('#ai-planner-form');
  const formCustom = $('#custom-planner-form');

  if (mode === 'custom') {
    // Activate Custom Mode
    if (btnCustom) {
      btnCustom.className = "relative p-5 rounded-2xl border-2 transition-all duration-300 text-left border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10 group cursor-pointer";
    }
    if (badgeCustom) badgeCustom.classList.remove('hidden');

    if (btnAi) {
      btnAi.className = "relative p-5 rounded-2xl border-2 transition-all duration-300 text-left border-slate-800 bg-slate-900/60 hover:border-gold-500/50 hover:bg-slate-900/90 group cursor-pointer";
    }
    if (badgeAi) badgeAi.classList.add('hidden');

    if (formAi) formAi.classList.add('hidden');
    if (formCustom) formCustom.classList.remove('hidden');

    // Set minimum date for travel date input to today
    const customDateInput = document.getElementById('custom-travel-date');
    if (customDateInput && !customDateInput.min) {
      customDateInput.min = new Date().toISOString().split('T')[0];
    }
  } else {
    // Activate AI Mode (Default)
    if (btnAi) {
      btnAi.className = "relative p-5 rounded-2xl border-2 transition-all duration-300 text-left border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10 group cursor-pointer";
    }
    if (badgeAi) badgeAi.classList.remove('hidden');

    if (btnCustom) {
      btnCustom.className = "relative p-5 rounded-2xl border-2 transition-all duration-300 text-left border-slate-800 bg-slate-900/60 hover:border-gold-500/50 hover:bg-slate-900/90 group cursor-pointer";
    }
    if (badgeCustom) badgeCustom.classList.add('hidden');

    if (formAi) formAi.classList.remove('hidden');
    if (formCustom) formCustom.classList.add('hidden');
  }

  lucide.createIcons();
}

// Category Selection Controller for Step 1
function selectTripCategory(btn, categoryName) {
  const input = $('#planner-category');
  if (input) input.value = categoryName;

  const cards = $$('.category-card');
  cards.forEach(card => {
    card.classList.remove('border-2', 'bg-[#0E2547]', 'border-gold-500', 'ring-2', 'ring-gold-500/40', 'shadow-lg', 'shadow-gold-500/10');
    card.classList.add('border', 'bg-slate-900/70', 'border-slate-800');
    const check = card.querySelector('.cat-check');
    if (check) check.classList.add('hidden');
  });

  if (btn) {
    btn.classList.remove('border', 'bg-slate-900/70', 'border-slate-800');
    btn.classList.add('border-2', 'bg-[#0E2547]', 'border-gold-500', 'ring-2', 'ring-gold-500/40', 'shadow-lg', 'shadow-gold-500/10');
    const check = btn.querySelector('.cat-check');
    if (check) check.classList.remove('hidden');
  }
}

// Quick Travel Style Shortcut Selector for Planner Dashboard
function selectQuickStyle(styleName) {
  const catMap = {
    'Heritage & Culture': 'Heritage & History',
    'Mountains & Nature': 'Mountains & Himalayas',
    'Beaches & Coast': 'Beaches & Islands',
    'Wildlife & Safari': 'Wildlife & Sanctuaries',
    'Food & Culinary': 'Food & Culture',
    'Wellness & Spiritual': 'Temples & Spiritual',
    'Adventure': 'Ladakh & Adventure',
    'Family': 'Heritage & History',
    'Luxury': 'Royal Rajasthan'
  };
  const targetCat = catMap[styleName] || styleName;
  const targetBtn = document.querySelector(`.category-card[data-cat="${targetCat}"]`);
  if (targetBtn) {
    selectTripCategory(targetBtn, targetCat);
  } else {
    const input = $('#planner-category');
    if (input) input.value = targetCat;
  }

  // Set travel style dropdown if available
  const styleSelect = $('#planner-style');
  if (styleSelect) {
    if (styleName.includes('Heritage') || styleName.includes('Culture')) styleSelect.value = 'Cultural';
    else if (styleName.includes('Adventure')) styleSelect.value = 'Adventure';
    else if (styleName.includes('Luxury')) styleSelect.value = 'Luxury';
    else if (styleName.includes('Family')) styleSelect.value = 'Family';
    else if (styleName.includes('Spiritual') || styleName.includes('Wellness')) styleSelect.value = 'Spiritual';
    else if (styleName.includes('Food')) styleSelect.value = 'Food and Experiences';
  }

  // Ensure AI mode is visible
  switchPlannerMode('ai');

  const formSec = document.getElementById('ai-planner-form-section') || document.getElementById('ai-planner-form');
  if (formSec) {
    formSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast('Style Selected', `Preferences updated for ${styleName}. Complete your details below.`, 'info');
}

// Use Popular Journey Idea Shortcut
function usePopularIdea(destination, duration, category) {
  if (category) {
    const targetBtn = document.querySelector(`.category-card[data-cat="${category}"]`);
    if (targetBtn) {
      selectTripCategory(targetBtn, category);
    } else {
      const input = $('#planner-category');
      if (input) input.value = category;
    }
  }

  const destInput = $('#planner-destination');
  if (destInput && destination) {
    let matched = false;
    for (const opt of destInput.options) {
      if (opt.value.toLowerCase().includes(destination.toLowerCase().slice(0, 8))) {
        destInput.value = opt.value;
        matched = true;
        break;
      }
    }
    if (!matched && destInput.options.length > 0) {
      destInput.value = destInput.options[0].value;
    }
  }

  const durInput = $('#planner-duration');
  if (durInput && duration) {
    durInput.value = String(duration);
  }

  // Ensure AI mode is active
  switchPlannerMode('ai');

  const formSec = document.getElementById('ai-planner-form-section') || document.getElementById('ai-planner-form');
  if (formSec) {
    formSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast('Journey Idea Loaded', `${destination} (${duration} Days) loaded into planner. Adjust details or click Generate!`, 'info');
}

// Update Planner Top Context Strip dynamically
function updatePlannerContextStrip() {
  const originEl = document.querySelector('#planner-ctx-origin .ctx-val');
  const travelersEl = document.querySelector('#planner-ctx-travelers .ctx-val');
  const currencyEl = document.querySelector('#planner-ctx-currency .ctx-val');

  if (originEl) {
    const userOrigin = state.currentUser?.country || $('#planner-origin')?.value || 'United States';
    originEl.textContent = userOrigin;
  }
  if (travelersEl) {
    const travelers = $('#planner-travelers')?.value || '2';
    travelersEl.textContent = `${travelers} Traveler${parseInt(travelers) > 1 ? 's' : ''}`;
  }
  if (currencyEl) {
    const cur = (typeof CurrencyService !== 'undefined' && CurrencyService.getCurrency()) || state.currency || 'USD';
    const sym = (typeof CurrencyService !== 'undefined' && CurrencyService.supportedCurrencies[cur]?.symbol) || '$';
    currencyEl.textContent = `${cur} (${sym})`;
  }
}

if (typeof window !== 'undefined') {
  window.selectQuickStyle = selectQuickStyle;
  window.usePopularIdea = usePopularIdea;
  window.updatePlannerContextStrip = updatePlannerContextStrip;
}

// Destination Image System - Curated Visuals for India Itineraries
function getDestinationImage(location) {
  if (!location || typeof location !== 'string') {
    return 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&auto=format&fit=crop&q=80';
  }

  const loc = location.toLowerCase().trim();

  // Curated destination imagery for Indian travel destinations
  const destinationMap = [
    { keys: ['solang valley', 'solang'], img: 'https://images.unsplash.com/photo-1596895111956-bf1cf0599ce5?w=800&auto=format&fit=crop&q=80' },
    { keys: ['rohtang pass', 'rohtang'], img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80' },
    { keys: ['kasol', 'parvati'], img: 'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=800&auto=format&fit=crop&q=80' },
    { keys: ['manali', 'kullu', 'hadimba'], img: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&auto=format&fit=crop&q=80' },
    { keys: ['pangong', 'nubra', 'leh', 'ladakh', 'khardung'], img: 'https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=800&auto=format&fit=crop&q=80' },
    { keys: ['gokarna', 'om beach'], img: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&auto=format&fit=crop&q=80' },
    { keys: ['goa', 'calangute', 'panaji', 'fontainhas', 'baga'], img: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&auto=format&fit=crop&q=80' },
    { keys: ['sarnath', 'ayodhya', 'prayagraj', 'varanasi', 'banaras', 'kashi', 'ghat'], img: 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=800&auto=format&fit=crop&q=80' },
    { keys: ['amber', 'amer', 'hawa mahal', 'jaipur', 'pink city'], img: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&auto=format&fit=crop&q=80' },
    { keys: ['agra', 'taj mahal', 'fatehpur'], img: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&auto=format&fit=crop&q=80' },
    { keys: ['munnar', 'wayanad', 'alleppey', 'alappuzha', 'kochi', 'cochin', 'kerala', 'kumarakom'], img: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&auto=format&fit=crop&q=80' },
    { keys: ['mumbai', 'bombay', 'marine drive', 'colaba'], img: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800&auto=format&fit=crop&q=80' },
    { keys: ['delhi', 'new delhi', 'qutub', 'red fort'], img: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&auto=format&fit=crop&q=80' },
    { keys: ['udaipur', 'pichola', 'city palace'], img: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=800&auto=format&fit=crop&q=80' },
    { keys: ['jodhpur', 'mehrangarh', 'blue city'], img: 'https://images.unsplash.com/photo-1585123388867-3bfe6dd4bdbf?w=800&auto=format&fit=crop&q=80' },
    { keys: ['jaisalmer', 'sam sand dunes', 'thar'], img: 'https://images.unsplash.com/photo-1577717903315-1691ae25ab3f?w=800&auto=format&fit=crop&q=80' },
    { keys: ['shimla', 'kufri', 'ridge', 'mall road'], img: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&auto=format&fit=crop&q=80' },
    { keys: ['rishikesh', 'haridwar', 'ganga', 'triveni'], img: 'https://images.unsplash.com/photo-1603775020644-eb8decd79994?w=800&auto=format&fit=crop&q=80' },
    { keys: ['amritsar', 'golden temple'], img: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&auto=format&fit=crop&q=80' },
    { keys: ['hampi', 'vijayanagara', 'tungabhadra'], img: 'https://images.unsplash.com/photo-1600100397608-f010f443907a?w=800&auto=format&fit=crop&q=80' },
    { keys: ['mysore', 'mysuru', 'chamundi'], img: 'https://images.unsplash.com/photo-1600100397843-09b936d5e975?w=800&auto=format&fit=crop&q=80' },
    { keys: ['darjeeling', 'ghoom', 'tiger hill'], img: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&auto=format&fit=crop&q=80' },
    { keys: ['srinagar', 'kashmir', 'dal lake', 'gulmarg', 'pahalgam'], img: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800&auto=format&fit=crop&q=80' },
    { keys: ['ooty', 'nilgiri', 'coonoor'], img: 'https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?w=800&auto=format&fit=crop&q=80' },
    { keys: ['pondicherry', 'puducherry', 'auroville'], img: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=800&auto=format&fit=crop&q=80' },
    { keys: ['kolkata', 'calcutta', 'howrah'], img: 'https://images.unsplash.com/photo-1558431382-27e303142255?w=800&auto=format&fit=crop&q=80' },
    { keys: ['hyderabad', 'charminar', 'golconda'], img: 'https://images.unsplash.com/photo-1605007493699-ce65834f8a00?w=800&auto=format&fit=crop&q=80' },
    { keys: ['bangalore', 'bengaluru', 'mysore road'], img: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=800&auto=format&fit=crop&q=80' },
    { keys: ['kaziranga', 'assam', 'rhino'], img: 'https://images.unsplash.com/photo-1549366021-9f761d450615?w=800&auto=format&fit=crop&q=80' },
    { keys: ['ranthambore', 'corbett', 'jim corbett', 'national park', 'safari'], img: 'https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=800&auto=format&fit=crop&q=80' },
    { keys: ['andaman', 'havelock', 'neil island', 'port blair'], img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop&q=80' },
    { keys: ['dharamshala', 'mcleod ganj', 'kangra', 'tsuglagkhang'], img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80' },
    { keys: ['pushkar', 'kutch', 'rann', 'bhuj', 'gujarat'], img: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop&q=80' },
    { keys: ['madurai', 'meenakshi', 'thanjavur'], img: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=800&auto=format&fit=crop&q=80' }
  ];

  for (const entry of destinationMap) {
    for (const key of entry.keys) {
      if (loc.includes(key) || key.includes(loc)) {
        return entry.img;
      }
    }
  }

  // Regional/Travel Fallback Image (Majestic Indian Heritage Landscape)
  return 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&auto=format&fit=crop&q=80';
}

// Update Day Location and synchronize default destination photo if not customized
function updateDayLocation(dayNumber, newLocation) {
  if (!state.activeItinerary || !state.activeItinerary.itinerary) return;
  const day = state.activeItinerary.itinerary.find(d => d.day === dayNumber);
  if (!day) return;
  day.city = newLocation;

  // If custom photo is not set, update image to new location's default image
  if (!state.itineraryDayImages || !state.itineraryDayImages[dayNumber]) {
    const imgEl = document.getElementById(`day-img-${dayNumber}`);
    if (imgEl) {
      imgEl.src = getDestinationImage(newLocation);
    }
  }
  const cityEl = document.getElementById(`day-city-${dayNumber}`);
  if (cityEl) {
    cityEl.textContent = newLocation;
  }
  showToast('Location Updated', `Day ${dayNumber} location changed to ${newLocation}`, 'info');
}

if (typeof window !== 'undefined') {
  window.getDestinationImage = getDestinationImage;
  window.updateDayLocation = updateDayLocation;
}

// 10 Distinct India Trip Options Generator (Mock Data Layer)
function generateTenTripOptions(params) {
  const {
    category = "Heritage & History",
    origin_country = "United States",
    duration_days = 7,
    travelers_count = 2,
    traveler_type = "Couple",
    budget_usd = 3500,
    travel_style = "Cultural",
    interests = ["Heritage Architecture", "Culinary Trails"],
    preferred_language = "English",
    accommodation = "Heritage Haveli & Boutique",
    transportation = "Private Chauffeur & High-speed Rail",
    pace = "Balanced (2-3 Sights Daily)"
  } = params;

  const rate = state.exchangeRate || 86.5;
  const baseBudget = Math.max(budget_usd || 3500, 1000);
  const baseDays = Math.min(Math.max(duration_days || 7, 4), 14);

  const matchedGuides = state.guides && state.guides.length > 0 ? state.guides : DEFAULT_GUIDES;
  const matchedExp = state.experiences && state.experiences.length > 0 ? state.experiences : DEFAULT_EXPERIENCES;

  const blueprints = [
    {
      id: "trip-opt-1",
      name: "Himalayan Serenity & Colonial Pine Heights",
      category: "Mountains & Himalayas",
      filterCategory: "Mountains",
      route: "Shimla → Manali → Dharamshala → Rishikesh",
      days: Math.max(baseDays, 7),
      budgetMultiplier: 0.95,
      popularityScore: 92,
      image: "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&auto=format&fit=crop&q=80",
      short_description: "Traverse towering pine ridges, Himalayan monasteries, apple orchards, and colonial hill retreats in northern India.",
      highlights: ["Private Solang Valley alpine excursions", "Dalai Lama monastery complex in McLeod Ganj", "Luxury alpine cottage stays with Himalayan vistas"],
      cities: ["Shimla", "Manali", "Dharamshala", "Rishikesh"],
      dayThemes: [
        { title: "Arrival in Shimla & Colonial Ridge Walk", morning: "Scenic toy train transit through pine hills; boutique alpine haveli check-in.", afternoon: "Guided walk along Mall Road, Christ Church, and Viceregal Lodge.", evening: "Fireside dinner featuring Himachali Dham delicacies and mountain herbal tea." },
        { title: "Cedar Forest Hikes & Himalayan Panorama", morning: "Private guided trail through pristine cedar forests of Jakhu Hill.", afternoon: "Local artisan wool weaving atelier visit and handloom demonstrations.", evening: "Sunset viewing over snow-dusted Shivalik peaks." },
        { title: "Scenic Valley Transit to Manali", morning: "Chauffeured transit along Beas River through lush Kullu apple orchards.", afternoon: "Visit Hadimba temple nestled in ancient cedar groves.", evening: "Riverside dinner with fresh Himalayan trout and orchard cider." },
        { title: "Solang Valley Alpine Discovery", morning: "High-altitude cable car ride and alpine meadow photography.", afternoon: "Thermal hot spring visit and wellness relaxation in Vashisht.", evening: "Stargazing and fireside dinner in traditional timber chalet." },
        { title: "Transit to Dharamshala & Tibetan Monasteries", morning: "Scenic private drive toward the Kangra Valley and McLeod Ganj.", afternoon: "Explore Tsuglagkhang Complex and peaceful Tibetan monastery grounds.", evening: "Tibetan herbal tasting and butter tea session with community elders." },
        { title: "Sacred Kangra Valley & Tea Gardens", morning: "Walk through Kangra tea estates with master tea blenders.", afternoon: "Artisan thangka painting studio tour and meditation session.", evening: "Traditional Himachali multi-course banquet." },
        { title: "Foothills Transition to Holy Rishikesh", morning: "Descent to Rishikesh along the sacred Ganga foothills.", afternoon: "Private sound healing and yoga session with Vedic master.", evening: "Reserved VIP platform access for Parmarth Niketan Ganga Aarti." }
      ]
    },
    {
      id: "trip-opt-2",
      name: "Ladakh High Passes & Pangong Frontier",
      category: "Ladakh & Adventure",
      filterCategory: "Adventure",
      route: "Leh → Nubra Valley → Pangong Tso → Khardung La",
      days: Math.max(baseDays, 7),
      budgetMultiplier: 1.06,
      popularityScore: 95,
      image: "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=600&auto=format&fit=crop&q=80",
      short_description: "Expedition through dramatic high-altitude desert canyons, Bactrian camel dunes, and turquoise glacial lakes.",
      highlights: ["Crossing Khardung La pass at 18,380 ft", "Stargazing luxury dome camp at Pangong Tso", "Historic Thiksey & Hemis Gompas with morning chants"],
      cities: ["Leh", "Nubra Valley", "Pangong Tso"],
      dayThemes: [
        { title: "Arrival in Leh & High-Altitude Acclimatization", morning: "VIP arrival at Kushok Bakula Rimpochee Airport; transfer to luxury heated haveli.", afternoon: "Gentle acclimatization rest with warm ginger-honey infusions.", evening: "Stroll through historic Leh Bazaar and Shanti Stupa at sunset." },
        { title: "Monasteries of the Indus Valley", morning: "Sunrise prayer ceremony at magnificent 12-story Thiksey Gompa.", afternoon: "Explore Hemis Monastery treasury museum and sacred fresco vaults.", evening: "Traditional Ladakhi apricot tasting and rooftop dinner." },
        { title: "Over Khardung La to Nubra Valley", morning: "Private 4x4 ascent over legendary Khardung La (18,380 ft).", afternoon: "Descent into Nubra Valley; ride double-humped Bactrian camels among Hunder sand dunes.", evening: "Overnight in luxury glamping tents beneath ultra-clear starry skies." },
        { title: "Diskit Monastery & Silk Road Oases", morning: "Visit 100-ft Maitreya Buddha statue and ancient Diskit Gompa.", afternoon: "Scenic village walk through Turtuk or Sumur fruit orchards.", evening: "Campfire dinner with authentic Ladakhi Thukpa and Momos." },
        { title: "Journey to Turquoise Pangong Lake", morning: "Off-road mountain drive along the rugged Shyok River corridor.", afternoon: "First glimpse of 134-km long turquoise Pangong Tso extending into Tibet.", evening: "Stargazing with professional astrophotographer at lake camp." },
        { title: "Pangong Dawn & Chang La Return to Leh", morning: "Spectacular sunrise reflections over turquoise waters of Pangong.", afternoon: "Return crossing over Chang La pass (17,590 ft) with scenic stops.", evening: "Relaxing wellness herbal foot massage and celebratory dinner." },
        { title: "Leh Farewell & Mountain Departure", morning: "Private souvenir shopping for pashmina shawls and sea buckthorn honey.", afternoon: "Final tea overlooking Stok Kangri mountain range.", evening: "Airport VIP escort for outbound flight." }
      ]
    },
    {
      id: "trip-opt-3",
      name: "Goan Coastlines & Tropical Malabar Shores",
      category: "Beaches & Islands",
      filterCategory: "Beaches",
      route: "North Goa → South Goa → Gokarna → Kochi",
      days: Math.min(baseDays, 7),
      budgetMultiplier: 0.88,
      popularityScore: 90,
      image: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600&auto=format&fit=crop&q=80",
      short_description: "Golden palm beaches, Portuguese heritage villas, private catamaran cruises, and coastal seafood trails.",
      highlights: ["Private sunset catamaran sailing in Arabian Sea", "Heritage Portuguese Latin Quarter heritage walk", "Beachfront boutique wellness resort relaxation"],
      cities: ["Goa", "Gokarna", "Kochi"],
      dayThemes: [
        { title: "Arrival in North Goa & Latin Quarter Charm", morning: "Arrival at Goa airport; private chauffeur to heritage Portuguese villa.", afternoon: "Walking tour of Fontainhas Latin Quarter with local architect.", evening: "Sunset cocktails and Goan-Portuguese fusion dinner by the Mandovi." },
        { title: "Private Catamaran & Secluded Coves", morning: "Private charter sailing along secluded Morjim and Ashvem coastline.", afternoon: "Fresh seafood barbecue and paddleboarding in tranquil bay.", evening: "Acoustic beachside dinner with fire lantern illumination." },
        { title: "South Goa Heritage & Spice Plantations", morning: "Visit UNESCO Basilica of Bom Jesus and Se Cathedral in Old Goa.", afternoon: "Private tour and organic lunch at Sahakari Spice Farm.", evening: "Check-in to luxury beachfront resort in serene South Goa." },
        { title: "Gokarna Sacred Beaches & Cliffside Vistas", morning: "Scenic coastal drive south across Karnataka border to Gokarna.", afternoon: "Trek to Om Beach and Half Moon Beach with stunning cliff views.", evening: "Temple town sunset prayer walk and coastal supper." },
        { title: "Coastal Wellness & Ayurvedic Massage", morning: "Sunrise beachfront yoga and fresh tender coconut refreshments.", afternoon: "Traditional coastal Ayurvedic massage with herbal oils.", evening: "Lantern-lit dinner with coconut curry and coastal fish thali." },
        { title: "Southbound Transit toward Malabar Coast", morning: "Executive coastal transit toward northern Kerala.", afternoon: "Explore historic coastal fort and traditional fishing harbors.", evening: "Malabar Biryani tasting dinner prepared by master culinary hosts." },
        { title: "Farewell Coastal Sunrise", morning: "Early morning beach stroll and artisanal spice market visit.", afternoon: "Private chauffeur transfer to airport for departure.", evening: "Departure with memories of golden sands and gentle seas." }
      ]
    },
    {
      id: "trip-opt-4",
      name: "Eternal Ghats & Sacred Ganga Pilgrimage",
      category: "Temples & Spiritual",
      filterCategory: "Spiritual",
      route: "Varanasi → Sarnath → Ayodhya → Prayagraj",
      days: Math.min(baseDays, 6),
      budgetMultiplier: 0.70,
      popularityScore: 89,
      isLowestBudget: true,
      image: "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=600&auto=format&fit=crop&q=80",
      short_description: "Immerse in thousands of years of living rituals along the holy Ganges, sacred aartis, and ancient shrines.",
      highlights: ["VIP sunrise wooden boat ride along Varanasi Ghats", "Private evening Ganga Aarti reserved platform viewing", "Guided excursion to sacred Deer Park in Sarnath"],
      cities: ["Varanasi", "Sarnath", "Ayodhya"],
      dayThemes: [
        { title: "Arrival in Varanasi: Living Antiquity", morning: "VIP greeting at Lal Bahadur Shastri Airport; transfer to riverfront heritage haveli.", afternoon: "Orientation stroll through ancient silk weaving alleys and spice quarters.", evening: "Reserved platform VIP seating for grand Dashashwamedh Ghat Ganga Aarti." },
        { title: "Dawn Boat on the Ganga & Silk Guilds", morning: "Sunrise wooden rowing boat ride witnessing bathing rituals and historic ghats.", afternoon: "Private visit to master Banarasi silk weaving looms.", evening: "Acoustic classical sitar performance in a royal courtyard." },
        { title: "Sarnath: The Buddha's First Sermon", morning: "Chauffeured trip to Sarnath; explore Dhamek Stupa and Ashoka Pillar.", afternoon: "Curated walkthrough of Sarnath Archaeological Museum.", evening: "Riverside philosophical discourse over Banarasi chai and sweets." },
        { title: "Transit to Sacred Ayodhya & Saryu Aarti", morning: "Private executive road transfer to sacred Ayodhya.", afternoon: "Visit historic temples and Ram Janmabhoomi complex.", evening: "Mesmerizing evening Aarti on the banks of holy Saryu River." },
        { title: "Prayagraj Triveni Sangam Confluence", morning: "Travel to Prayagraj to witness confluence of Ganga, Yamuna, and Saraswati.", afternoon: "Boat to the Sangam with private priest blessing.", evening: "Check-in to serene river retreat with vegetarian feast." },
        { title: "Spiritual Reflections & Departure", morning: "Morning meditation session and final blessings along the riverbank.", afternoon: "Transfer to airport with curated temple prasadam gift basket.", evening: "Inbound departure flight carrying sacred peace." }
      ]
    },
    {
      id: "trip-opt-5",
      name: "Imperial Golden Triangle & Royal Rajput Citadels",
      category: "Heritage & History",
      filterCategory: "Heritage",
      route: "Delhi → Agra → Jaipur → Jodhpur → Udaipur",
      days: baseDays,
      budgetMultiplier: 1.0,
      popularityScore: 98,
      image: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&auto=format&fit=crop&q=80",
      short_description: "Marvel at Mughal architecture at the Taj Mahal and immerse in majestic royal palaces and desert forts.",
      highlights: ["Private sunrise access to Taj Mahal before crowds", "Exclusive Amber Fort & City Palace tours", "Heritage Haveli stay with royal courtyard dining"],
      cities: ["Delhi", "Agra", "Jaipur", "Udaipur"],
      dayThemes: [
        { title: "Imperial Delhi Arrival & Old Delhi Walk", morning: "VIP arrival at Delhi airport; transfer to luxury heritage hotel.", afternoon: "Rickshaw exploration of Chandni Chowk and Jama Masjid with historian.", evening: "Welcome dinner featuring slow-cooked Mughlai cuisine." },
        { title: "Delhi Monuments & Sunset Drive to Agra", morning: "Private visit to Humayun's Tomb and Qutub Minar complex.", afternoon: "Executive chauffeur drive to Agra via Yamuna Expressway.", evening: "Mehtab Bagh sunset view of Taj Mahal across Yamuna river." },
        { title: "The Taj Mahal at Sunrise & Agra Fort", morning: "Private dawn access to Taj Mahal with architectural guide.", afternoon: "Tour of Emperor Akbar's massive red sandstone Agra Fort.", evening: "Mughal marble inlay artisan workshop visit and fine dining." },
        { title: "Fatehpur Sikri & Jaipur Pink City", morning: "Visit Emperor Akbar's abandoned ghost city of Fatehpur Sikri.", afternoon: "Transit to Jaipur; check-in to royal Rajput palace hotel.", evening: "Evening bazaars walk: gemstones, blue pottery, and textiles." },
        { title: "Amber Fort & Royal City Palace", morning: "Morning visit to hillside Amber Fort and Sheesh Mahal mirror palace.", afternoon: "Private tour of City Palace residence and Jantar Mantar observatory.", evening: "Courtyard dinner with Kalbelia folk dances and royal feast." },
        { title: "Blue City Jodhpur & Mehrangarh Fort", morning: "Chauffeured transit to Jodhpur; check-in to heritage haveli.", afternoon: "Ascend towering Mehrangarh Fort overlooking cobalt-blue houses.", evening: "Rooftop dinner overlooking illuminated fort ramparts." },
        { title: "Udaipur Lake Palace & Royal Farewell", morning: "Transit past Ranakpur Jain temple to Udaipur, City of Lakes.", afternoon: "Private royal boat cruise on Lake Pichola past Jag Mandir.", evening: "Farewell royal dinner overlooking illuminated lake palaces." }
      ]
    },
    {
      id: "trip-opt-6",
      name: "Royal Bengal Tiger Safaris & Kerala Backwaters",
      category: "Nature & Wildlife",
      filterCategory: "Wildlife",
      route: "Ranthambore → Periyar → Munnar → Kabini",
      days: Math.max(baseDays, 8),
      budgetMultiplier: 1.10,
      popularityScore: 91,
      image: "https://images.unsplash.com/photo-1575550959106-5a7defe28b56?w=600&auto=format&fit=crop&q=80",
      short_description: "Track elusive tigers in national parks, cruise misty jungle waterways, and trek through tea estates.",
      highlights: ["Private 4x4 naturalist safaris in tiger territory", "Luxury jungle lodge with naturalist escorts", "Cardamom & pepper spice estate immersion"],
      cities: ["Ranthambore", "Kabini", "Munnar"],
      dayThemes: [
        { title: "Arrival at Ranthambore Tiger Reserve", morning: "Chauffeur transfer to luxury jungle safari lodge bordering national park.", afternoon: "Naturalist briefing on tiger behavior and park topography.", evening: "Bush dinner under the stars with resident wildlife biologists." },
        { title: "Dawn & Dusk Tiger Tracking Safaris", morning: "Exclusive open-top 4x4 safari into primary tiger territory zone.", afternoon: "Poolside leisure, bird watching, and wildlife photography clinic.", evening: "Evening safari searching for leopards, sloth bears, and sambar deer." },
        { title: "Ranthambore Fort & Transit South", morning: "Explore 10th-century Ranthambore Fort towering above jungle canopy.", afternoon: "Flight transit to Southern India wilderness corridor.", evening: "Check-in to luxury riverside jungle lodge in Kabini." },
        { title: "Kabini River Safari & Elephant Herds", morning: "Boat safari on Kabini River observing Asiatic elephants and crocodiles.", afternoon: "Forest jeep track searching for black panthers and leopards.", evening: "Tribal Kuruba dance performance around campfire." },
        { title: "Ascent to Munnar Tea Highlands", morning: "Scenic climb into Western Ghats through mist-covered tea plantations.", afternoon: "Guided walk through organic tea estate and tea tasting session.", evening: "Highland cottage stay with fresh mountain produce." },
        { title: "Periyar Wildlife Sanctuary & Spice Trails", morning: "Bamboo rafting excursion inside Periyar Tiger Reserve.", afternoon: "Walking spice tour learning cardamom, pepper, and cinnamon harvesting.", evening: "Traditional Kalaripayattu martial arts demonstration." },
        { title: "Emerald Kerala Backwaters Cruise", morning: "Descent to Alleppey; board private luxury air-conditioned houseboat.", afternoon: "Meander through palm-fringed canals and tranquil lagoons.", evening: "Candlelight dinner on water with fresh Karimeen fish." },
        { title: "Departure with Wildlife Memories", morning: "Sunrise canoe ride through tranquil bird sanctuaries.", afternoon: "Chauffeured airport transfer for departure.", evening: "Flight home carrying rich memories of Indian wilderness." }
      ]
    },
    {
      id: "trip-opt-7",
      name: "Awadhi Nizami Gastronomy & Ancient Culinary Trails",
      category: "Food & Culture",
      filterCategory: "Food & Culture",
      route: "Old Delhi → Lucknow → Hyderabad → Mumbai",
      days: baseDays,
      budgetMultiplier: 0.85,
      popularityScore: 94,
      image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80",
      short_description: "A masterclass through India's royal kitchens: slow-cooked Awadhi dum biryanis, street food walks, and chef pairings.",
      highlights: ["Curated Old Delhi street food tasting walk", "Royal Dastarkhwan feast with master chefs in Lucknow", "Irani cafe & coastal seafood trail in Mumbai"],
      cities: ["Old Delhi", "Lucknow", "Hyderabad", "Mumbai"],
      dayThemes: [
        { title: "Old Delhi Street Food Odyssey", morning: "VIP arrival in Delhi; check-in to boutique culinary hotel.", afternoon: "Curated street food tasting in Chandni Chowk: parathas, chaat, and jalebis.", evening: "Dinner at iconic Karim's exploring ancient Mughlai gravies." },
        { title: "Spice Market Discovery & Royal Mughal Feast", morning: "Private tour of Khari Baoli, Asia's largest wholesale spice market.", afternoon: "Cooking masterclass with renowned master chef.", evening: "Multi-course modern Indian fine dining experience." },
        { title: "High-Speed Rail to Lucknow: City of Nawabs", morning: "Express train to Lucknow; check-in to heritage boutique haveli.", afternoon: "Visit Bara Imambara and historic Chowk bazaar.", evening: "Authentic Galouti and Kakori kebab degustation at iconic Tunday Kababi." },
        { title: "Royal Awadhi Dastarkhwan Masterclass", morning: "Explore fragrant perfume and embroidery lanes of Aminabad.", afternoon: "Private Dum Pukht culinary demonstration with nawabi descendants.", evening: "Royal Dastarkhwan feast with slow-cooked biryanis and breads." },
        { title: "Flight to Hyderabad: Nizami Legacy", morning: "Morning flight to Hyderabad, royal city of pearls and biryani.", afternoon: "Visit Charminar and historic Chowmahalla Palace.", evening: "Authentic Hyderabadi Dum Biryani and Mirchi ka Salan dinner." },
        { title: "Modern Coastal Flavors in Mumbai", morning: "Flight to coastal Mumbai; check-in overlooking Marine Drive.", afternoon: "Heritage Irani cafe and Parsi cuisine walking trail.", evening: "Celebrity chef coastal seafood supper at award-winning restaurant." },
        { title: "Culinary Souvenirs & Departure", morning: "Bespoke spice and tea procurement with culinary concierge.", afternoon: "High tea overlooking the Gateway of India.", evening: "VIP airport escort for international flight." }
      ]
    },
    {
      id: "trip-opt-8",
      name: "Modern Metropolises, Tech Corridors & Art Districts",
      category: "Cities & Modern India",
      filterCategory: "Heritage",
      route: "Mumbai → Bengaluru → Hyderabad → New Delhi",
      days: Math.min(baseDays, 5),
      budgetMultiplier: 0.78,
      popularityScore: 88,
      isShortestTrip: true,
      image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=600&auto=format&fit=crop&q=80",
      short_description: "Experience India's booming modern skyline, thriving contemporary art galleries, fintech hubs, and nightlife.",
      highlights: ["Kala Ghoda art walk & Marine Drive sunset", "India Silicon Valley innovation lounge pass", "Contemporary fusion dining with celebrity chefs"],
      cities: ["Mumbai", "Bengaluru", "Delhi"],
      dayThemes: [
        { title: "Mumbai Skyline & Contemporary Art", morning: "VIP arrival in Mumbai; check-in to waterfront luxury high-rise.", afternoon: "Curated art gallery walk through Kala Ghoda and Fort heritage district.", evening: "Sundowner cocktails overlooking Arabian Sea and Bandra-Worli Sea Link." },
        { title: "Bollywood Studio & Modern Gastronomy", morning: "Private behind-the-scenes Bollywood studio walkthrough.", afternoon: "Explore Bandra's trendy indie boutiques and cafes.", evening: "Tasting menu at progressive Indian molecular gastronomy restaurant." },
        { title: "Bengaluru: Silicon Valley of India", morning: "Morning flight to tech capital Bengaluru; executive check-in.", afternoon: "Visit modern innovation accelerators and Cubbon Park green lungs.", evening: "Craft brewery crawl and dinner in trendy Indiranagar district." },
        { title: "Modern Capital: Cyber Hub & Lutyens", morning: "Flight to New Delhi; executive chauffeur transit.", afternoon: "Walkthrough of National Gallery of Modern Art and India Habitat Centre.", evening: "Fine dining at Cyber Hub with top entrepreneurs and founders." },
        { title: "Executive Departure", morning: "Bespoke modern lifestyle shopping at curated luxury emporiums.", afternoon: "Executive lounge debrief and airport express transit.", evening: "International flight home with fresh contemporary perspectives." }
      ]
    },
    {
      id: "trip-opt-9",
      name: "Holistic Vedic Ayurveda & Mindful Ashrams",
      category: "Wellness & Ayurveda",
      filterCategory: "Spiritual",
      route: "Kochi → Kumarakom → Varkala → Rishikesh",
      days: baseDays,
      budgetMultiplier: 0.95,
      popularityScore: 93,
      image: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=600&auto=format&fit=crop&q=80",
      short_description: "Rejuvenate mind and body with authentic Ayurvedic Panchakarma, daily yoga masters, and organic vegetarian dining.",
      highlights: ["Personalized Ayurvedic doctor consultation & therapies", "Daily sunrise yoga & sound healing sessions", "Backwater sanctuary retreat stay with herbal meals"],
      cities: ["Kumarakom", "Varkala", "Rishikesh"],
      dayThemes: [
        { title: "Arrival in Kerala Wellness Sanctuary", morning: "Airport VIP greeting; transfer to serene Ayurvedic retreat in Kumarakom.", afternoon: "Initial diagnostic consultation with master Ayurvedic Vaidya (doctor).", evening: "Gentle meditation and dosha-balancing organic dinner." },
        { title: "Panchakarma & Rejuvenation Therapy", morning: "Sunrise Hatha yoga and guided pranayama breathwork on the lakefront.", afternoon: "Traditional full-body Abhyanga warm herbal oil massage.", evening: "Herbal botanical walk and sunset silent boat drift." },
        { title: "Shirodhara & Mindful Healing", morning: "Shirodhara therapy for mental clarity and deep nervous system restoration.", afternoon: "Ayurvedic cooking workshop: cooking with medicinal herbs.", evening: "Sound bath meditation with Tibetan singing bowls." },
        { title: "Varkala Cliffside Coastal Healing", morning: "Scenic private transit to dramatic red cliffs of Varkala Beach.", afternoon: "Oceanfront restorative yoga and natural mineral spring dip.", evening: "Nutritious farm-to-table coastal vegetarian meal." },
        { title: "Foothills Transition to Rishikesh Ashrams", morning: "Flight transit north to Rishikesh, world capital of yoga.", afternoon: "Check-in to tranquil luxury ashram retreat along the holy river.", evening: "Attend sacred evening chanting and lamp illumination ceremony." },
        { title: "Yoga Philosophy & Forest Meditation", morning: "Dawn Ashtanga yoga practice guided by Himalayan master teacher.", afternoon: "Forest walk along holy riverbanks and private philosophy discussion.", evening: "Wholesome satvik feast and candlelit reflection." },
        { title: "Renewed Departure Home", morning: "Final consultation and personalized wellness routine for home practice.", afternoon: "Private chauffeur transfer to Dehradun/Delhi airport.", evening: "Outbound flight rejuvenated in body, mind, and spirit." }
      ]
    },
    {
      id: "trip-opt-10",
      name: "Living Master Crafts, Textile Ateliers & Desert Fairs",
      category: "Arts, Crafts & Festivals",
      filterCategory: "Food & Culture",
      route: "Jaipur → Pushkar → Kutch → Raghurajpur",
      days: Math.max(baseDays, 8),
      budgetMultiplier: 0.90,
      popularityScore: 90,
      image: "https://images.unsplash.com/photo-1606293926075-69a00dbfde81?w=600&auto=format&fit=crop&q=80",
      short_description: "Connect with UNESCO-recognized master artisans: hand-block printing, blue pottery, tribal weaving, and folk music.",
      highlights: ["Hands-on master woodblock printing atelier", "Private folk music performance under desert stars", "Direct artisan procurement in craft villages"],
      cities: ["Jaipur", "Pushkar", "Kutch"],
      dayThemes: [
        { title: "Arrival in Jaipur & Blue Pottery Masters", morning: "VIP arrival in Jaipur; check-in to historic artisan-styled palace.", afternoon: "Private atelier visit with master craftsman of Jaipur blue pottery.", evening: "Rajasthani courtyard dinner with live puppet and folk performers." },
        { title: "Bagru Natural Dyeing & Block Printing", morning: "Hands-on woodblock printing workshop in artisan village of Bagru.", afternoon: "Create your own customized scarf using vegetable and mineral dyes.", evening: "Private tour of Anokhi Museum of Hand Printing." },
        { title: "Sacred Lake Pushkar & Camel Fair Grounds", morning: "Scenic drive through Aravalli hills to sacred Pushkar lake.", afternoon: "Explore vibrant leather, silver, and textile craft bazaars.", evening: "Sunset prayers along the sacred ghats with rose petal offerings." },
        { title: "Desert Transit toward Great Rann of Kutch", morning: "Executive transit toward Gujarat's master artisan heartland.", afternoon: "Arrive at luxury Bhunga desert resort in Kutch.", evening: "Evening desert campfire with Sufi and Kutchi folk musicians." },
        { title: "Tribal Embroidery & Rogan Art Masters", morning: "Exclusive visit to the last living master family of Rogan art painting.", afternoon: "Explore Rabari and Ahir tribal mirror-work embroidery villages.", evening: "Moonlit walk across the stark white salt desert of Rann." },
        { title: "Bandhani Tie-Dye & Bell Makers", morning: "Hands-on workshop learning ancient Bandhani resist-dyeing.", afternoon: "Visit copper bell craft artisans in Nirona village.", evening: "Traditional Gujarati Thali banquet with village elders." },
        { title: "Artisan Guild Procurement & Farewell", morning: "Direct procurement of authenticated GI-tagged masterworks.", afternoon: "Executive chauffeur transfer to Bhuj / Ahmedabad airport.", evening: "Outbound flight enriched with living cultural treasures." }
      ]
    }
  ];

  return blueprints.map((bp, idx) => {
    const isRecommended = (bp.category.toLowerCase() === category.toLowerCase()) ||
      (!blueprints.some(b => b.category.toLowerCase() === category.toLowerCase()) && bp.category === "Heritage & History");
    const tripDays = bp.days;
    const tripBudget = Math.round(baseBudget * bp.budgetMultiplier);
    const tripBudgetInr = Math.round(tripBudget * rate);

    const lodgingEst = Math.round(tripBudget * 0.40);
    const transitEst = Math.round(tripBudget * 0.22);
    const guidesExpEst = Math.round(tripBudget * 0.20);
    const diningEst = Math.round(tripBudget * 0.12);
    const bufferEst = tripBudget - (lodgingEst + transitEst + guidesExpEst + diningEst);

    const itinerary = [];
    for (let d = 1; d <= tripDays; d++) {
      const dayTheme = bp.dayThemes[(d - 1) % bp.dayThemes.length];
      const city = bp.cities[(d - 1) % bp.cities.length] || bp.cities[0];
      itinerary.push({
        day: d,
        title: dayTheme.title,
        city: city,
        morning: dayTheme.morning,
        afternoon: dayTheme.afternoon,
        evening: dayTheme.evening,
        stay: "Curated Heritage Palace or Boutique Sanctuary",
        meals: "Regional Organic Specialties & Artisan Tastings",
        transit: transportation || "Private AC Chauffeur",
        guide_ref: matchedGuides[idx % matchedGuides.length]?.name || "Verified Local Guide"
      });
    }

    return {
      id: bp.id,
      name: bp.name,
      title: `${tripDays}-Day ${bp.name}`,
      category: bp.category,
      filterCategory: bp.filterCategory,
      route: bp.route,
      destination: bp.route,
      duration_days: tripDays,
      travelers_count: travelers_count,
      traveler_type: traveler_type,
      travel_style: bp.category,
      origin_country: origin_country,
      total_budget_usd: tripBudget,
      total_budget_inr: tripBudgetInr,
      budget_breakdown: {
        luxury_lodging_usd: lodgingEst,
        private_transport_usd: transitEst,
        verified_guides_experiences_usd: guidesExpEst,
        curated_dining_usd: diningEst,
        contingency_buffer_usd: bufferEst
      },
      short_description: bp.short_description,
      highlights: bp.highlights,
      image: bp.image,
      isRecommended: isRecommended,
      isLowestBudget: bp.isLowestBudget || false,
      isShortestTrip: bp.isShortestTrip || false,
      popularityScore: bp.popularityScore || 85,
      itinerary: itinerary,
      matched_guides: matchedGuides.slice(0, 2),
      matched_experiences: matchedExp.slice(0, 2),
      safety_and_cultural_tips: [
        "Hydration & Bottled Water: Enjoy bottled or filtered mineral water provided complimentary in your private chauffeur vehicle.",
        "Modest Attire at Sacred Sites: Keep shoulders and knees covered when entering temples, gurdwaras, and heritage shrines.",
        "Photography Etiquette: Always ask permission before photographing resident artisans, sadhus, or inside inner temple sanctums.",
        "Footwear Protocol: Remove shoes before entering sanctums and haveli homes; soft shoe covers are provided where applicable."
      ]
    };
  });
}

// Option 1: AI Trip Planner Submission & Generation Workflow
async function handleTripPlanSubmit(e) {
  if (e) e.preventDefault();

  const form = $('#ai-planner-form');
  if (!form) return;

  const category = $('#planner-category')?.value || 'Heritage & History';
  const origin = $('#planner-origin')?.value || 'United States';
  const destination = $('#planner-destination')?.value || 'Golden Triangle (Delhi, Agra, Jaipur)';
  const duration = parseInt($('#planner-duration')?.value || '7');
  const travelers = parseInt($('#planner-travelers')?.value || '2');
  const travelerType = $('#planner-traveler-type')?.value || 'Couple';
  const budget = parseInt($('#planner-budget')?.value || '3500');
  const style = $('#planner-style')?.value || 'Cultural';
  const language = $('#planner-language')?.value || 'English';
  const lodging = $('#planner-lodging')?.value || 'Heritage Haveli & Boutique';
  const transport = $('#planner-transport')?.value || 'Private Chauffeur & High-speed Rail';
  const pace = $('#planner-pace')?.value || 'Balanced (2-3 Sights Daily)';

  // Gather interests
  const interests = [];
  form.querySelectorAll('input[name="interests"]:checked').forEach(cb => interests.push(cb.value));
  if (interests.length === 0) interests.push('Heritage Architecture', 'Culinary Trails');

  // Switch to loading state with step-by-step telemetry
  const loadingOverlay = $('#planner-loading-overlay');
  const optionsContainer = $('#planner-options-container');
  const resultContainer = $('#planner-result-container');
  const stepText = $('#planner-loading-step');
  const progressBar = $('#planner-progress-bar');

  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  if (optionsContainer) optionsContainer.classList.add('hidden');
  if (resultContainer) resultContainer.classList.add('hidden');

  const steps = [
    { text: `Analyzing regional seasonality & cultural festivals across India...`, progress: 20 },
    { text: `Curating 10 distinct trip options matching ${category} and travel styles...`, progress: 45 },
    { text: `Matching verified local guides fluent in ${language}...`, progress: 70 },
    { text: `Calculating optimal route corridors, logistics and safety contingencies...`, progress: 95 }
  ];

  for (let i = 0; i < steps.length; i++) {
    if (stepText) stepText.textContent = steps[i].text;
    if (progressBar) progressBar.style.width = `${steps[i].progress}%`;
    await new Promise(r => setTimeout(r, 400));
  }

  // Generate 10 distinct trip options
  const options = generateTenTripOptions({
    category,
    origin_country: origin,
    destination,
    duration_days: duration,
    travelers_count: travelers,
    traveler_type: travelerType,
    budget_usd: budget,
    travel_style: style,
    interests,
    preferred_language: language,
    accommodation: lodging,
    transportation: transport,
    pace
  });

  state.tripOptions = options;
  state.selectedCategory = category;

  if (loadingOverlay) loadingOverlay.classList.add('hidden');
  if (optionsContainer) {
    optionsContainer.classList.remove('hidden');
    renderTripOptions(options);
    optionsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('10 Trip Options Ready!', `Curated 10 bespoke itineraries for your review. Select any option to view full details.`);
}

// Render Trip Options (Step 4 & 5)
function renderTripOptions(trips) {
  if (!trips || trips.length === 0) return;

  const countEl = $('#options-count');
  if (countEl) countEl.textContent = `${trips.length} distinct trip options`;

  // STEP 5: AI Recommended Hero Banner
  const recommendedTrip = trips.find(t => t.isRecommended) || trips[0];
  const recTitle = $('#recommended-trip-title');
  const recRoute = $('#recommended-trip-route span');
  const recReason = $('#recommended-trip-reason');
  const recPrice = $('#recommended-trip-price');
  const recDaily = $('#recommended-trip-daily');
  const recViewBtn = $('#recommended-view-btn');
  const recCustomBtn = $('#recommended-custom-btn');
  const recSelectBtn = $('#recommended-select-btn');

  if (recTitle) recTitle.textContent = recommendedTrip.name;
  if (recRoute) recRoute.textContent = recommendedTrip.route;
  if (recReason) {
    recReason.textContent = `Optimized for your selected "${recommendedTrip.category}" focus. Tailored for a ${recommendedTrip.traveler_type} seeking scenic transitions, boutique haveli accommodations, and verified local escorts within your target budget.`;
  }
  if (recPrice) recPrice.textContent = formatCurrency(recommendedTrip.total_budget_usd, recommendedTrip.total_budget_inr);
  if (recDaily) recDaily.textContent = `${formatCurrency(Math.round(recommendedTrip.total_budget_usd / recommendedTrip.duration_days))} / day • ${recommendedTrip.duration_days} Days`;

  if (recViewBtn) recViewBtn.onclick = () => openTripPreview(recommendedTrip.id);
  if (recCustomBtn) recCustomBtn.onclick = () => customizeFromOption(recommendedTrip.id);
  if (recSelectBtn) recSelectBtn.onclick = () => selectTripAndShowDetails(recommendedTrip.id);

  // Render Grid Cards
  renderCardsGrid(trips);
}

// Render Trip Option Cards Grid
function renderCardsGrid(tripsToRender) {
  const grid = $('#trip-cards-grid');
  const emptyState = $('#trip-filter-empty');
  if (!grid) return;

  if (!tripsToRender || tripsToRender.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  grid.innerHTML = tripsToRender.map(trip => {
    const isRec = trip.isRecommended;
    const isLowest = trip.isLowestBudget;
    const isShortest = trip.isShortestTrip;

    let badgeHtml = '';
    if (isRec) {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-gold-500 text-navy-950 text-[10px] font-black shadow-md flex items-center gap-1">★ Recommended</span>`;
    } else if (isLowest) {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-emerald-500 text-navy-950 text-[10px] font-black shadow-md flex items-center gap-1">💎 Lowest Budget</span>`;
    } else if (isShortest) {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-cyan-400 text-navy-950 text-[10px] font-black shadow-md flex items-center gap-1">⚡ Shortest Trip</span>`;
    }

    return `
      <div class="trip-card relative rounded-2xl border ${isRec ? 'border-gold-500/80 bg-gradient-to-b from-[#0E2547] to-[#0B1F3A] ring-1 ring-gold-500/30 shadow-xl shadow-gold-500/10' : 'border-slate-800 bg-slate-900/70 hover:border-gold-500/40 hover:bg-slate-900/90'} transition-all duration-300 flex flex-col overflow-hidden group">
        <div class="relative w-full h-44 overflow-hidden">
          <img src="${trip.image}" alt="${trip.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-black/25 to-black/40"></div>
          
          <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 pointer-events-none">
            <span class="px-2.5 py-0.5 rounded-full bg-navy-950/85 backdrop-blur-md text-[11px] font-bold text-gold-300 border border-gold-500/30">
              ${trip.category}
            </span>
            <div class="flex items-center gap-1">
              ${badgeHtml}
            </div>
          </div>

          <div class="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs">
            <span class="font-bold text-white flex items-center gap-1 text-[11px]">
              <i data-lucide="clock" class="w-3.5 h-3.5 text-gold-400"></i> ${trip.duration_days} Days
            </span>
            <span class="font-extrabold text-gold-400 text-sm">
              ${formatCurrency(trip.total_budget_usd, trip.total_budget_inr)}
            </span>
          </div>
        </div>

        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
          <div class="space-y-2">
            <h4 class="font-bold text-white text-base group-hover:text-gold-300 transition-colors leading-snug">
              ${trip.name}
            </h4>
            <p class="text-xs text-gold-400/90 font-medium flex items-center gap-1.5 line-clamp-1">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 shrink-0 text-gold-400"></i>
              <span>${trip.route}</span>
            </p>
            <p class="text-xs text-slate-300 line-clamp-2 leading-relaxed">
              ${trip.short_description}
            </p>

            <div class="pt-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Key Highlights:</span>
              <ul class="space-y-1 text-[11px] text-slate-300">
                ${trip.highlights.slice(0, 3).map(h => `
                  <li class="flex items-start gap-1.5">
                    <i data-lucide="check" class="w-3 h-3 text-gold-400 shrink-0 mt-0.5"></i>
                    <span class="truncate">${h}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800/80 flex items-center gap-2">
            <button type="button" onclick="openTripPreview('${trip.id}')" class="flex-1 py-2 px-1 text-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer">
              View Plan
            </button>
            <button type="button" onclick="customizeFromOption('${trip.id}')" class="flex-1 py-2 px-1 text-center rounded-xl bg-slate-800 hover:bg-slate-700 text-gold-400 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer">
              Customize
            </button>
            <button type="button" onclick="selectTripAndShowDetails('${trip.id}')" class="flex-1 py-2 px-1 text-center rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-navy-950 text-xs font-bold hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-gold-500/10 truncate">
              Select This Trip
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// STEP 6: Category Filter Chips & Sort Controllers
let currentFilterTag = 'All';
let currentSortKey = 'recommended';

function filterTrips(tag, btn) {
  currentFilterTag = tag;
  const chipContainer = $('#trip-filter-chips');
  if (chipContainer) {
    const chips = chipContainer.querySelectorAll('button');
    chips.forEach(c => {
      c.className = 'trip-filter-btn px-3.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all cursor-pointer';
    });
  }
  if (btn) {
    btn.className = 'trip-filter-btn px-3.5 py-1.5 rounded-full bg-gold-500 text-navy-950 font-bold transition-all shadow-sm cursor-pointer';
  }

  applyFilterAndSort();
}

function sortTrips(key) {
  currentSortKey = key;
  applyFilterAndSort();
}

function applyFilterAndSort() {
  if (!state.tripOptions) return;
  let list = [...state.tripOptions];

  if (currentFilterTag !== 'All') {
    list = list.filter(t =>
      t.category.toLowerCase().includes(currentFilterTag.toLowerCase()) ||
      (t.filterCategory && t.filterCategory.toLowerCase().includes(currentFilterTag.toLowerCase()))
    );
  }

  if (currentSortKey === 'recommended') {
    list.sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));
  } else if (currentSortKey === 'lowest_budget') {
    list.sort((a, b) => a.total_budget_usd - b.total_budget_usd);
  } else if (currentSortKey === 'shortest_trip') {
    list.sort((a, b) => a.duration_days - b.duration_days);
  } else if (currentSortKey === 'most_popular') {
    list.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
  }

  renderCardsGrid(list);
}

// STEP 7: Select This Trip & Display Detailed Itinerary
function selectTripAndShowDetails(tripId) {
  const trip = state.tripOptions?.find(t => t.id === tripId);
  if (!trip) return;

  closeModal('trip-preview-modal');

  state.activeItinerary = trip;
  state.itineraryDayImages = Object.assign({}, trip.custom_day_images || {});
  renderItinerary(trip);

  const optionsContainer = $('#planner-options-container');
  const resultContainer = $('#planner-result-container');

  if (optionsContainer) optionsContainer.classList.add('hidden');
  if (resultContainer) {
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('Itinerary Selected!', `Reviewing day-by-day plan for "${trip.name}".`);
  lucide.createIcons();
}

// Navigation back from Detailed Itinerary to 10 Trip Options Grid
function backToTripOptions() {
  const resultContainer = $('#planner-result-container');
  const optionsContainer = $('#planner-options-container');

  if (resultContainer) resultContainer.classList.add('hidden');
  if (optionsContainer) {
    optionsContainer.classList.remove('hidden');
    optionsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Modify Trip Preferences from Options Header
function modifyTripPreferences() {
  const form = $('#ai-planner-form');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Open Quick Trip Plan Preview Modal
function openTripPreview(tripId) {
  const trip = state.tripOptions?.find(t => t.id === tripId);
  if (!trip) return;

  const catEl = $('#preview-trip-category');
  const badgeEl = $('#preview-trip-badge');
  const titleEl = $('#preview-trip-title');
  const routeEl = $('#preview-trip-route span');
  const imgEl = $('#preview-trip-image');
  const descEl = $('#preview-trip-desc');
  const daysEl = $('#preview-trip-days');
  const budgetEl = $('#preview-trip-budget');
  const highlightsEl = $('#preview-trip-highlights');
  const selectBtn = $('#preview-select-btn');

  if (catEl) catEl.textContent = trip.category;
  if (badgeEl) {
    if (trip.isRecommended) {
      badgeEl.textContent = '★ Recommended';
      badgeEl.className = 'px-2.5 py-0.5 rounded-full bg-gold-500 text-navy-950 text-xs font-black';
      badgeEl.classList.remove('hidden');
    } else if (trip.isLowestBudget) {
      badgeEl.textContent = '💎 Lowest Budget';
      badgeEl.className = 'px-2.5 py-0.5 rounded-full bg-emerald-500 text-navy-950 text-xs font-black';
      badgeEl.classList.remove('hidden');
    } else if (trip.isShortestTrip) {
      badgeEl.textContent = '⚡ Shortest Trip';
      badgeEl.className = 'px-2.5 py-0.5 rounded-full bg-cyan-400 text-navy-950 text-xs font-black';
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  if (titleEl) titleEl.textContent = trip.name;
  if (routeEl) routeEl.textContent = trip.route;
  if (imgEl) {
    imgEl.src = trip.image;
    imgEl.alt = trip.name;
  }
  if (descEl) descEl.textContent = trip.short_description;
  if (daysEl) daysEl.textContent = `${trip.duration_days} Days / ${trip.duration_days - 1} Nights`;
  if (budgetEl) budgetEl.textContent = formatCurrency(trip.total_budget_usd, trip.total_budget_inr);
  if (highlightsEl) {
    highlightsEl.innerHTML = trip.highlights.map(h => `
      <li class="flex items-start gap-2">
        <i data-lucide="check-circle" class="w-4 h-4 text-gold-400 shrink-0 mt-0.5"></i>
        <span>${h}</span>
      </li>
    `).join('');
  }

  if (selectBtn) {
    selectBtn.onclick = () => selectTripAndShowDetails(trip.id);
  }

  openModal('trip-preview-modal');
  lucide.createIcons();
}

// Customize from Trip Option
function customizeFromOption(tripId) {
  const trip = state.tripOptions?.find(t => t.id === tripId);
  if (!trip) return;

  closeModal('trip-preview-modal');

  const destInput = $('#planner-destination');
  const durInput = $('#planner-duration');
  if (destInput) destInput.value = trip.route;
  if (durInput) durInput.value = trip.duration_days;

  const form = $('#ai-planner-form');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('Trip Loaded for Customization', `Preferences updated with ${trip.name}. Fine-tune details and click "Generate My Trips".`, 'info');
}

// Open Customize Plan: navigate to planner view and activate custom form
function openCustomizePlan() {
  switchAppView('customize');
  // Wait briefly for the view to render before switching mode
  setTimeout(() => {
    switchPlannerMode('custom');
    const formEl = $('#custom-planner-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 120);
}

// Option 2: Bespoke Custom Trip Planner Submission & Generation Workflow
async function handleCustomPlanSubmit(e) {
  if (e) e.preventDefault();

  const form = $('#custom-planner-form');
  if (!form) return;

  const dest = $('#custom-destination')?.value || 'Golden Triangle (Delhi, Agra, Jaipur)';
  const duration = parseInt($('#custom-duration')?.value || '7');
  const travelers = parseInt($('#custom-travelers')?.value || '2');
  const travelerType = $('#custom-traveler-type')?.value || 'Couple';
  const budget = parseInt($('#custom-budget')?.value || '3500');
  const pace = $('#custom-pace')?.value || 'Balanced (2-3 Sights Daily)';
  const guideId = $('#custom-guide')?.value || null;
  const lodging = $('#custom-lodging')?.value || 'Heritage Haveli & Boutique';
  const transport = $('#custom-transport')?.value || 'Private Chauffeur & High-speed Rail';
  const notes = $('#custom-notes')?.value || '';
  const travelDate = $('#custom-travel-date')?.value || '';

  const expIds = [];
  form.querySelectorAll('input[name="custom_experiences"]:checked').forEach(cb => expIds.push(cb.value));

  // Switch to loading state with step-by-step telemetry
  const loadingOverlay = $('#planner-loading-overlay');
  const resultContainer = $('#planner-result-container');
  const stepText = $('#planner-loading-step');
  const progressBar = $('#planner-progress-bar');

  loadingOverlay.classList.remove('hidden');
  resultContainer.classList.add('hidden');

  const steps = [
    { text: `Configuring bespoke route corridor for ${dest}...`, progress: 25 },
    { text: `Assigning verified specialist guide & tailoring daily schedule...`, progress: 50 },
    { text: `Integrating ${expIds.length || 2} authentic hand-picked experiences & havelis...`, progress: 75 },
    { text: `Finalizing private chauffeur logistics & personalized pace...`, progress: 95 }
  ];

  for (let i = 0; i < steps.length; i++) {
    stepText.textContent = steps[i].text;
    progressBar.style.width = `${steps[i].progress}%`;
    await new Promise(r => setTimeout(r, 500));
  }

  try {
    const res = await fetch('/api/trips/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: dest,
        duration_days: duration,
        travelers_count: travelers,
        traveler_type: travelerType,
        budget_usd: budget,
        daily_pace: pace,
        guide_id: guideId,
        experience_ids: expIds,
        accommodation: lodging,
        transportation: transport,
        custom_notes: notes,
        travel_date: travelDate,
        start_date: travelDate
      })
    });

    const data = await res.json();
    state.activeItinerary = data;
    renderItinerary(data);

    // Reset save button state
    const saveBtn = $('#save-trip-plan-btn');
    const saveBtnText = $('#save-btn-text');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors";
    }
    if (saveBtnText) saveBtnText.textContent = "Save Trip Plan";

    loadingOverlay.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Custom Plan Ready!', `Assembled your tailored ${duration}-day journey for ${dest}.`, 'success');
  } catch (err) {
    console.warn('Custom trip plan API error, using client generator:', err);
    const fallbackData = generateClientSideItinerary({
      origin_country: "Custom Profile",
      destination: dest,
      duration_days: duration,
      travelers_count: travelers,
      traveler_type: travelerType,
      budget_usd: budget,
      travel_style: "Custom Curated",
      accommodation: lodging,
      transportation: transport
    });
    fallbackData.mode = "custom";
    fallbackData.title = `${duration}-Day Bespoke Journey: ${dest}`;
    if (travelDate) {
      fallbackData.start_date = travelDate;
      fallbackData.travel_date = travelDate;
    }
    state.activeItinerary = fallbackData;
    renderItinerary(fallbackData);

    const saveBtn = $('#save-trip-plan-btn');
    const saveBtnText = $('#save-btn-text');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors";
    }
    if (saveBtnText) saveBtnText.textContent = "Save Trip Plan";

    loadingOverlay.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Custom Plan Ready!', `Assembled your tailored ${duration}-day journey for ${dest}.`, 'success');
  }
}

// Client-side Bespoke Neural Itinerary Generator
function generateClientSideItinerary(params) {
  const { origin_country, destination, duration_days, travelers_count, traveler_type, budget_usd, travel_style, accommodation, transportation } = params;
  const days = Math.min(Math.max(duration_days || 7, 3), 14);
  const dest = destination || "Golden Triangle (Delhi, Agra, Jaipur)";
  const style = travel_style || "Cultural";
  const budget = budget_usd || 3500;
  const travelers = travelers_count || 2;
  const rate = state.exchangeRate || 83.0;

  let theme = "Imperial Dynasties, Royal Fortresses & Mughal Splendor";
  let primaryCities = ["New Delhi", "Agra", "Jaipur"];
  let matchedGuides = state.guides.slice(0, 2);
  let matchedExp = state.experiences.slice(0, 2);

  if (dest.toLowerCase().includes("kerala") || dest.toLowerCase().includes("south")) {
    theme = "Emerald Backwaters, Tea Highlands & Spice Aromas";
    primaryCities = ["Kochi", "Munnar", "Alleppey"];
    matchedGuides = state.guides.filter(g => g.city.includes("Kochi") || g.category.includes("Food")).slice(0, 2);
    matchedExp = state.experiences.filter(e => e.city.includes("Kochi") || e.city.includes("Alleppey")).slice(0, 2);
  } else if (dest.toLowerCase().includes("varanasi")) {
    theme = "Sacred River Rhythms, Philosophy & Living Antiquity";
    primaryCities = ["Varanasi", "Sarnath"];
    matchedGuides = state.guides.filter(g => g.city.includes("Varanasi") || g.category.includes("Spiritual")).slice(0, 2);
    matchedExp = state.experiences.filter(e => e.city.includes("Varanasi")).slice(0, 2);
  }

  const baseDays = [
    {
      day: 1,
      title: `Arrival in ${primaryCities[0]}: VIP Welcome & Orientation`,
      city: primaryCities[0],
      morning: `VIP greeting at international terminal; transfer via private chauffeur to luxury boutique haveli retreat.`,
      afternoon: `Orientation walk with your BharatConnect local ambassador through historic heritage quarters.`,
      evening: `Curated welcome dinner featuring regional slow-cooked delicacies and introduction to cultural etiquette.`,
      stay: "Curated Heritage Palace or Boutique Retreat",
      meals: "Welcome Thali & Traditional Masala Chai",
      transit: `Private Chauffeur Sedan (${transportation || 'Private Chauffeur'})`,
      guide_ref: matchedGuides[0]?.name || "Verified Local Guide"
    },
    {
      day: 2,
      title: `Living Traditions & Historic Architectural Marvels`,
      city: primaryCities[0],
      morning: `Private sunrise access to primary historic citadel before general admission opens.`,
      afternoon: `Specialist-led walk through ancient spice bazaars and artisan ateliers with tasting stops.`,
      evening: `Sunset acoustic recital or riverfront illumination ceremony with reserved VIP viewing.`,
      stay: "Curated Heritage Palace",
      meals: "Historic Street Food Tastings & Royal Courtyard Banquet",
      transit: "Private AC Transit & Guided Walking",
      guide_ref: matchedGuides[0]?.name || "Verified Local Guide"
    },
    {
      day: 3,
      title: `Scenic Transit to ${primaryCities[1] || primaryCities[0]} & Cultural Awakening`,
      city: primaryCities[1] || primaryCities[0],
      morning: `Scenic executive rail or private chauffeur transfer through the scenic countryside.`,
      afternoon: `Private workshop visit: observe traditional stone carving, hand-block printing, or spice grading.`,
      evening: `Rooftop sunset discourse over tea with an acclaimed local historian.`,
      stay: "Historic Riverside or Garden Retreat",
      meals: "Regional Organic Specialties & Artisan Desserts",
      transit: "Executive Rail / Chauffeur",
      guide_ref: matchedGuides[1]?.name || matchedGuides[0]?.name || "Verified Local Guide"
    },
    {
      day: 4,
      title: `World Wonder Discovery & Spiritual Resonance`,
      city: primaryCities[1] || primaryCities[0],
      morning: `Dawn photography walk at iconic architectural landmark with pristine morning reflections.`,
      afternoon: `Curated local experience: hands-on culinary masterclass or village craft immersion.`,
      evening: `Stroll through peaceful gardens and artisan guilds with fair-trade certified shopping.`,
      stay: "Boutique Heritage Sanctuary",
      meals: "Cooking Masterclass Creation & Claypot Delicacies",
      transit: "Private Chauffeur with Mineral Water & Cold Towels",
      guide_ref: matchedGuides[1]?.name || matchedGuides[0]?.name || "Verified Local Guide"
    },
    {
      day: 5,
      title: `Royal Fortresses & Astronomy Monuments`,
      city: primaryCities[2] || primaryCities[1] || primaryCities[0],
      morning: `Explore hill fortress ramparts and mirror-inlaid halls with a master architectural storyteller.`,
      afternoon: `Visit royal observatory and private collections inside the living royal residence.`,
      evening: `Lantern-lit courtyard dinner with live sitar ragas and local folk performances.`,
      stay: "Regal Heritage Haveli",
      meals: "Multi-course Royal Degustation Feast",
      transit: "Private Chauffeur",
      guide_ref: matchedGuides[0]?.name || "Verified Local Guide"
    },
    {
      day: 6,
      title: `Village Immersion & Global Collaboration Exchange`,
      city: primaryCities[2] || primaryCities[0],
      morning: `Hands-on artisan cooperative visit; learn centuries-old weaving, pottery, or botanical farming.`,
      afternoon: `Meet verified enterprise partners in the Global Collaboration Lounge network for trade dialogues.`,
      evening: `Sunset high tea overlooking tranquil lakes and hills.`,
      stay: "Regal Heritage Haveli",
      meals: "Organic Farm-to-Table Lunch & Rajasthani Delicacies",
      transit: "Private Chauffeur",
      guide_ref: matchedGuides[0]?.name || "Verified Local Guide"
    },
    {
      day: 7,
      title: `Celebratory Farewell & Seamless Airport Transfer`,
      city: primaryCities[0] + " / Return",
      morning: `Gentle morning yoga or sunrise walk; final bespoke shopping for GI-tagged spices and textiles.`,
      afternoon: `Executive lounge access and final debrief with your on-ground travel concierge.`,
      evening: `International flight departure back home with lifelong memories and ambassador credentials.`,
      stay: "Departure / Return Home",
      meals: "Executive Departure Refreshments",
      transit: "Private Airport VIP Transfer",
      guide_ref: "BharatConnect Concierge Desk"
    }
  ];

  let selectedDays = baseDays.slice(0, days);
  if (selectedDays.length < days) {
    for (let extra = selectedDays.length + 1; extra <= days; extra++) {
      selectedDays.push({
        day: extra,
        title: `Deeper Regional Immersion & Sustainable Community Discovery`,
        city: primaryCities[primaryCities.length - 1],
        morning: `Private visit to rural organic farming cooperative or artisan craft cluster.`,
        afternoon: `Leisure afternoon for wellness, spa therapies, and local conversation with community elders.`,
        evening: `Rooftop sunset discourse and farewell banquet with local hosts.`,
        stay: "Curated Boutique Retreat",
        meals: "Regional seasonal delicacies and artisanal herbal infusions",
        transit: "Private Chauffeur",
        guide_ref: matchedGuides[0]?.name || "Verified Local Guide"
      });
    }
  }

  const lodgingEst = Math.round(budget * 0.40);
  const transitEst = Math.round(budget * 0.22);
  const guidesExpEst = Math.round(budget * 0.20);
  const diningEst = Math.round(budget * 0.12);
  const bufferEst = budget - (lodgingEst + transitEst + guidesExpEst + diningEst);

  return {
    id: `plan-${Math.random().toString(36).substring(2, 9)}`,
    title: `${days}-Day ${style} Journey: ${theme}`,
    destination: dest,
    origin_country: origin_country || "United States",
    travel_style: style,
    duration_days: days,
    travelers_count: travelers,
    traveler_type: traveler_type || "Couple",
    accommodation_preference: accommodation || "Heritage Haveli & Boutique",
    transportation_preference: transportation || "Private Chauffeur & High-speed Rail",
    total_budget_usd: budget,
    total_budget_inr: Math.round(budget * rate),
    budget_breakdown: {
      luxury_lodging_usd: lodgingEst,
      private_transport_usd: transitEst,
      verified_guides_experiences_usd: guidesExpEst,
      curated_dining_usd: diningEst,
      contingency_buffer_usd: bufferEst
    },
    matched_guides: matchedGuides,
    matched_experiences: matchedExp,
    itinerary: selectedDays,
    safety_and_cultural_tips: [
      "Hydration & Water: Drink only sealed bottled or UV-filtered water; high-end hotels and our guides provide verified mineral water.",
      "Footwear & Temples: Remove shoes before entering sanctums and havelis; socks are welcome and recommended on sunny marble courtyards.",
      "Digital Payments & Cash: UPI is ubiquitous in India; as an international traveler, you can use BharatConnect's wallet partner or carry ₹2,000 in crisp currency notes for small artisan purchases.",
      "Clothing Etiquette: Breathable linen and light cotton covering shoulders and knees ensure comfort and respect at sacred sites.",
      "Emergency Support: 24/7 BharatConnect tourist concierge is available via WhatsApp or in-app calling, integrated with US Embassy hotline 011-2419-8000."
    ],
    created_at: new Date().toISOString()
  };
}

// Render Itinerary Output
function renderItinerary(plan) {
  const titleEl = $('#itinerary-title');
  const metaEl = $('#itinerary-meta');
  const totalCostEl = $('#itinerary-total-cost');
  const lodgingCostEl = $('#itinerary-lodging-cost');
  const transitCostEl = $('#itinerary-transit-cost');
  const guidesCostEl = $('#itinerary-guides-cost');
  const diningCostEl = $('#itinerary-dining-cost');
  const daysListEl = $('#itinerary-days-list');
  const matchedGuidesEl = $('#itinerary-matched-guides');
  const matchedExpEl = $('#itinerary-matched-exp');
  const safetyTipsEl = $('#itinerary-safety-tips');

  if (titleEl) titleEl.textContent = plan.title;
  if (metaEl) {
    metaEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0B1F3A] border border-[#D4AF37]/30 text-xs text-[#D4AF37]">
        <i data-lucide="map-pin" class="w-3.5 h-3.5"></i> ${plan.destination}
      </span>
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300">
        <i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${plan.duration_days} Days
      </span>
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300">
        <i data-lucide="users" class="w-3.5 h-3.5"></i> ${plan.travelers_count} Travelers (${plan.traveler_type})
      </span>
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300">
        <i data-lucide="compass" class="w-3.5 h-3.5"></i> ${plan.travel_style} Style
      </span>
    `;
  }

  if (totalCostEl) totalCostEl.textContent = formatCurrency(plan.total_budget_usd, plan.total_budget_inr);
  if (lodgingCostEl) lodgingCostEl.textContent = formatCurrency(plan.budget_breakdown.luxury_lodging_usd);
  if (transitCostEl) transitCostEl.textContent = formatCurrency(plan.budget_breakdown.private_transport_usd);
  if (guidesCostEl) guidesCostEl.textContent = formatCurrency(plan.budget_breakdown.verified_guides_experiences_usd);
  if (diningCostEl) diningCostEl.textContent = formatCurrency(plan.budget_breakdown.curated_dining_usd);

  // Update Itinerary Action Strip with Confirm Trip / Confirmed Badge (Feature 3A)
  const confirmBtnContainer = $('#itinerary-confirm-btn-container');
  if (confirmBtnContainer) {
    if (plan.confirmation_status === 'confirmed') {
      confirmBtnContainer.innerHTML = `
        <div class="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm select-none" title="This trip is officially confirmed and scheduled">
          <i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span>✓ Trip Confirmed</span>
        </div>
      `;
    } else {
      confirmBtnContainer.innerHTML = `
        <button type="button" onclick="initiateTripConfirmation('${plan.id}')"
          class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-300 hover:to-gold-500 text-navy-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer">
          <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
          <span>Confirm Trip</span>
        </button>
      `;
    }
  }

  // Update Save Trip Plan button state based on whether plan is already in My Plans
  const saveBtn = $('#save-trip-plan-btn');
  const isSaved = (state.userTrips || []).some(t => t.id === plan.id);
  if (saveBtn) {
    if (isSaved) {
      saveBtn.disabled = true;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-default select-none shadow-sm";
      saveBtn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i><span id="save-btn-text">Saved to My Plans ✓</span>`;
    } else {
      saveBtn.disabled = false;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer";
      saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-3.5 h-3.5 text-gold-400"></i><span id="save-btn-text">Save Trip Plan</span>`;
    }
  }

  // Render Days with Visual Destination Photos & Custom Photo Controls
  if (daysListEl) {
    daysListEl.innerHTML = plan.itinerary.map(d => {
      const customImg = state.itineraryDayImages && state.itineraryDayImages[d.day];
      const dayImg = customImg || d.image || getDestinationImage(d.city);
      const isCustom = Boolean(customImg);
      return `
      <div class="border border-slate-800 rounded-2xl p-5 bg-[#0E2547]/50 hover:border-[#D4AF37]/40 transition-all duration-300">
        <!-- Day Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div class="flex items-center gap-3">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-[#D4AF37] text-[#0B1F3A] font-bold text-xs">
              D${d.day}
            </span>
            <div>
              <h4 class="font-bold text-white text-base">${d.title}</h4>
              <p class="text-xs text-[#D4AF37] flex items-center gap-1 mt-0.5">
                <i data-lucide="map-pin" class="w-3 h-3"></i> <span id="day-city-${d.day}">${d.city}</span>
              </p>
            </div>
          </div>
          <span class="text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 self-start sm:self-auto">
            <i data-lucide="navigation" class="w-3 h-3 inline mr-1 text-[#D4AF37]"></i> ${d.transit}
          </span>
        </div>

        <!-- Visual Destination Photo Banner -->
        <div class="relative mt-4 rounded-xl overflow-hidden border border-slate-700/60 group">
          <img id="day-img-${d.day}" src="${dayImg}" alt="${d.city} - Day ${d.day}" loading="lazy" class="w-full h-44 sm:h-52 object-cover transition-transform duration-500 group-hover:scale-105" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none"></div>

          <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs text-white/90 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
              <i data-lucide="camera" class="w-3.5 h-3.5 text-[#D4AF37]"></i>
              <span class="font-medium">${d.city}</span>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" onclick="changeDayPhoto(${d.day})" class="px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md text-xs font-semibold text-[#D4AF37] hover:text-amber-300 border border-[#D4AF37]/40 hover:border-[#D4AF37]/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm">
                <span>📷 Change Photo</span>
              </button>
              <button type="button" id="reset-btn-${d.day}" onclick="resetDayPhoto(${d.day})" class="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer shadow-sm ${isCustom ? '' : 'hidden'}">
                <span>Reset Photo</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Activities Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs leading-relaxed">
          <div class="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
            <div class="font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
              <i data-lucide="sun" class="w-3.5 h-3.5"></i> Morning Flow
            </div>
            <p class="text-slate-300">${d.morning}</p>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
            <div class="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
              <i data-lucide="compass" class="w-3.5 h-3.5"></i> Afternoon Discovery
            </div>
            <p class="text-slate-300">${d.afternoon}</p>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
            <div class="font-semibold text-[#D4AF37] flex items-center gap-1.5 mb-1">
              <i data-lucide="moon" class="w-3.5 h-3.5"></i> Twilight & Evening
            </div>
            <p class="text-slate-300">${d.evening}</p>
          </div>
        </div>

        <!-- Lodging, Culinary & Guide Footer -->
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="text-slate-300 flex items-center gap-2">
            <span class="text-slate-400">Lodging:</span>
            <span class="font-medium text-white">${d.stay}</span>
          </div>
          <div class="text-slate-300 flex items-center gap-2">
            <span class="text-slate-400">Culinary:</span>
            <span class="font-medium text-amber-200">${d.meals}</span>
          </div>
          <div class="text-slate-400 flex items-center gap-1 text-[11px]">
            <i data-lucide="shield-check" class="w-3.5 h-3.5 text-[#D4AF37]"></i> Host: ${d.guide_ref}
          </div>
        </div>
      </div>
    `}).join('');
  }

  // Matched Guides in Itinerary
  if (matchedGuidesEl && plan.matched_guides) {
    matchedGuidesEl.innerHTML = plan.matched_guides.map(g => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-[#0B1F3A] border border-slate-800 hover:border-[#D4AF37]/50 transition-colors">
        <img src="${g.avatar}" alt="${g.name}" class="w-12 h-12 rounded-full object-cover border border-[#D4AF37]/40" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-sm text-white truncate">${g.name}</h5>
            <span class="text-xs font-semibold text-[#D4AF37] flex items-center gap-0.5">
              <i data-lucide="star" class="w-3 h-3 fill-[#D4AF37]"></i> ${g.rating}
            </span>
          </div>
          <p class="text-xs text-slate-400 truncate">${g.city} • ${g.category}</p>
          <div class="flex items-center justify-between mt-1 text-xs">
            <span class="text-slate-300 font-medium">${formatCurrency(g.price_per_day_usd, g.price_per_day_inr)}/day</span>
            <button onclick="openGuideChat('${g.id}')" class="text-[#D4AF37] hover:underline flex items-center gap-1 font-semibold">
              <i data-lucide="message-square" class="w-3 h-3"></i> Message
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Matched Experiences in Itinerary
  if (matchedExpEl && plan.matched_experiences) {
    matchedExpEl.innerHTML = plan.matched_experiences.map(e => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-[#0B1F3A] border border-slate-800 hover:border-[#D4AF37]/50 transition-colors">
        <img src="${e.image}" alt="${e.title}" class="w-14 h-14 rounded-lg object-cover border border-slate-700" />
        <div class="flex-1 min-w-0">
          <h5 class="font-bold text-xs text-white truncate">${e.title}</h5>
          <p class="text-[11px] text-slate-400 mt-0.5">${e.city} • ${e.duration}</p>
          <div class="flex items-center justify-between mt-1 text-xs">
            <span class="text-[#D4AF37] font-semibold">${formatCurrency(e.price_usd, e.price_inr)}</span>
            <button onclick="openBookExperience('${e.id}')" class="px-2 py-0.5 rounded bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B1F3A] text-[11px] font-medium transition-colors">
              Reserve
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Safety & Cultural Tips
  if (safetyTipsEl && plan.safety_and_cultural_tips) {
    safetyTipsEl.innerHTML = plan.safety_and_cultural_tips.map(tip => `
      <li class="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
        <i data-lucide="shield-alert" class="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5"></i>
        <span>${tip}</span>
      </li>
    `).join('');
  }

  lucide.createIcons();
}

// Client-Side Photo Customization & Optimization (Max 1200px, JPEG q=0.8)
function changeDayPhoto(dayIndex) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.onchange = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        // Client-side image resize & compression
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

        // Store custom photo per day - separate from trip saving
        if (!state.itineraryDayImages) state.itineraryDayImages = {};
        state.itineraryDayImages[dayIndex] = compressedDataUrl;

        // If activeItinerary exists, attach to custom_day_images for persistence on user save
        if (state.activeItinerary) {
          if (!state.activeItinerary.custom_day_images) {
            state.activeItinerary.custom_day_images = {};
          }
          state.activeItinerary.custom_day_images[dayIndex] = compressedDataUrl;
          const dayObj = (state.activeItinerary.itinerary || []).find(d => d.day === dayIndex);
          if (dayObj) {
            dayObj.image = compressedDataUrl;
          }
        }

        // Preview immediately on day card
        const imgEl = document.getElementById(`day-img-${dayIndex}`);
        if (imgEl) imgEl.src = compressedDataUrl;
        const resetBtn = document.getElementById(`reset-btn-${dayIndex}`);
        if (resetBtn) resetBtn.classList.remove('hidden');

        showToast('Photo Updated', `Custom photo applied to Day ${dayIndex}.`, 'success');
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  fileInput.click();
}

// Reset Custom Photo for Itinerary Day to Default Destination Image
function resetDayPhoto(dayIndex) {
  if (state.itineraryDayImages) {
    delete state.itineraryDayImages[dayIndex];
  }
  if (state.activeItinerary?.custom_day_images) {
    delete state.activeItinerary.custom_day_images[dayIndex];
  }

  let defaultUrl = '';
  if (state.activeItinerary && state.activeItinerary.itinerary) {
    const dayObj = state.activeItinerary.itinerary.find(d => d.day === dayIndex);
    if (dayObj) {
      delete dayObj.image;
      defaultUrl = getDestinationImage(dayObj.city);
    }
  }
  if (!defaultUrl) {
    defaultUrl = getDestinationImage('India');
  }

  const imgEl = document.getElementById(`day-img-${dayIndex}`);
  if (imgEl) imgEl.src = defaultUrl;
  const resetBtn = document.getElementById(`reset-btn-${dayIndex}`);
  if (resetBtn) resetBtn.classList.add('hidden');

  showToast('Photo Reset', `Restored destination image for Day ${dayIndex}.`, 'info');
}

if (typeof window !== 'undefined') {
  window.changeDayPhoto = changeDayPhoto;
  window.resetDayPhoto = resetDayPhoto;
}

// Save Itinerary Associated with Authenticated Session
async function saveCurrentItinerary() {
  if (!state.activeItinerary) {
    showToast('Notice', 'No active itinerary to save yet. Plan a trip first!', 'info');
    return;
  }

  // Prevent duplicate saves (Requirement 7)
  const alreadySaved = (state.userTrips || []).some(t => t.id === state.activeItinerary.id);
  if (alreadySaved) {
    showToast('Already Saved', 'This trip plan is already saved in your My Plans.', 'info');
    const saveBtn = $('#save-trip-plan-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-default select-none shadow-sm";
      saveBtn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i><span id="save-btn-text">Saved to My Plans ✓</span>`;
      lucide.createIcons();
    }
    return;
  }

  if (!state.isAuthenticated) {
    showToast('Sign In Required', 'Please sign in or register to save this trip plan to your account.', 'info');
    openModal('signin-modal');
    return;
  }

  const saveBtn = $('#save-trip-plan-btn');
  const saveBtnText = $('#save-btn-text');
  if (saveBtn) saveBtn.disabled = true;
  if (saveBtnText) saveBtnText.textContent = 'Saving Plan...';

  // Ensure custom day images are attached to the saved trip
  if (state.activeItinerary && state.itineraryDayImages && Object.keys(state.itineraryDayImages).length > 0) {
    state.activeItinerary.custom_day_images = Object.assign({}, state.itineraryDayImages);
  }

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');

  try {
    const res = await fetch(`/api/trips?token=${encodeURIComponent(token || '')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ trip: state.activeItinerary })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to save trip plan.');
    }

    const savedTrip = data.trip || state.activeItinerary;
    if (!state.userTrips) state.userTrips = [];
    const existingIdx = state.userTrips.findIndex(t => t.id === savedTrip.id);
    if (existingIdx >= 0) {
      state.userTrips[existingIdx] = savedTrip;
    } else {
      state.userTrips.unshift(savedTrip);
    }

    updateMyPlansBadge();
    renderUserTrips();

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-default select-none shadow-sm";
      saveBtn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i><span id="save-btn-text">Saved to My Plans ✓</span>`;
      lucide.createIcons();
    }

    showToast('Trip Plan Saved!', 'Your itinerary has been saved to your My Plans.', 'success');

  } catch (err) {
    console.error('Error saving trip plan:', err);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer";
      saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-3.5 h-3.5 text-gold-400"></i><span id="save-btn-text">Save Trip Plan</span>`;
      lucide.createIcons();
    }
    showToast('Save Error', err.message || 'Could not save trip plan. Please try again.', 'error');
  }
}

// Load Authenticated User's Saved Trips
async function loadUserTrips() {
  if (!state.isAuthenticated) {
    state.userTrips = [];
    renderUserTrips();
    updateMyPlansBadge();
    return;
  }

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  if (!token) return;

  try {
    const res = await fetch(`/api/trips?token=${encodeURIComponent(token)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      state.userTrips = data.trips || [];
      renderUserTrips();
      updateMyPlansBadge();
    }
  } catch (err) {
    console.warn('Could not load user trips from server:', err);
  }
}

// Render My Trips Dashboard
function renderUserTrips() {
  const emptyEl = $('#my-trips-empty');
  const gridEl = $('#my-trips-grid');
  const footerEl = $('#my-trips-footer');

  if (!gridEl || !emptyEl) return;

  const trips = state.userTrips || [];

  if (trips.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.classList.add('hidden');
    if (footerEl) footerEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  gridEl.classList.remove('hidden');
  if (footerEl) footerEl.classList.remove('hidden');

  gridEl.innerHTML = trips.map(trip => {
    const isCustom = trip.mode === 'custom';
    const modeBadge = isCustom
      ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1">✏️ Custom Plan</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gold-500/20 border border-gold-500/40 text-gold-300 flex items-center gap-1">🤖 AI Curated</span>`;

    const savedDateStr = trip.saved_at || trip.created_at;
    const dateFormatted = savedDateStr ? new Date(savedDateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';
    const guideName = trip.matched_guides?.[0]?.name || (isCustom ? "Custom Specialist" : "Verified Guide");
    const scheduleSummary = trip.itinerary && trip.itinerary.length > 0
      ? trip.itinerary.slice(0, 2).map(d => `<li class="truncate">• Day ${d.day}: ${d.title}</li>`).join('')
      : `<li>• ${trip.duration_days} Days across ${trip.destination}</li>`;

    return `
      <div class="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-gold-500/40 transition-all duration-300 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            ${modeBadge}
            <span class="text-[11px] text-slate-400 font-medium">${dateFormatted}</span>
          </div>

          <h3 class="font-serif-luxury text-lg font-bold text-white mb-1.5 leading-snug line-clamp-2">
            ${trip.title || `${trip.duration_days}-Day Journey to ${trip.destination}`}
          </h3>

          <div class="flex items-center gap-1.5 text-xs text-gold-400 mb-3">
            <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
            <span class="truncate">${trip.destination}</span>
          </div>

          <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs mb-4 space-y-1.5">
            <div class="flex items-center justify-between text-slate-300">
              <span class="text-slate-400">Duration:</span>
              <span class="font-semibold text-white">${trip.duration_days} Days (${trip.travelers_count || 2} Travelers)</span>
            </div>
            <div class="flex items-center justify-between text-slate-300">
              <span class="text-slate-400">Est. Budget:</span>
              <span class="font-bold text-gold-400">${formatCurrency(trip.total_budget_usd, trip.total_budget_inr)}</span>
            </div>
            <div class="flex items-center justify-between text-slate-300">
              <span class="text-slate-400">Assigned Guide:</span>
              <span class="font-medium text-slate-200 truncate max-w-[150px]">${guideName}</span>
            </div>
          </div>

          <div class="mb-4">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Itinerary Highlights:</span>
            <ul class="text-xs text-slate-300 space-y-1 leading-relaxed">
              ${scheduleSummary}
            </ul>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
          <button onclick="viewSavedTrip('${trip.id}')" class="flex-1 py-2 px-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-gold-500/10 transition-all cursor-pointer">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>View Itinerary</span>
          </button>
          <button onclick="deleteSavedTrip('${trip.id}')" class="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-semibold text-xs border border-red-500/20 transition-all flex items-center gap-1 cursor-pointer" title="Delete Saved Trip">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Open and View Full Saved Itinerary
async function viewSavedTrip(tripId) {
  let trip = (state.userTrips || []).find(t => t.id === tripId);

  if (!trip) {
    const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
    try {
      const res = await fetch(`/api/trips/${tripId}?token=${encodeURIComponent(token || '')}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        trip = data.trip;
      }
    } catch (e) {
      console.warn('Could not fetch single trip:', e);
    }
  }

  if (!trip) {
    showToast('Not Found', 'Could not locate the requested trip plan.', 'error');
    return;
  }

  state.activeItinerary = trip;
  state.itineraryDayImages = Object.assign({}, trip.custom_day_images || {});
  renderItinerary(trip);

  const saveBtn = $('#save-trip-plan-btn');
  const saveBtnText = $('#save-btn-text');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.className = "px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-default select-none shadow-sm";
  }
  if (saveBtnText) saveBtnText.textContent = 'Saved to My Plans ✓';

  const resultContainer = $('#planner-result-container');
  if (resultContainer) {
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('Itinerary Loaded', `Now viewing full itinerary for ${trip.title}`, 'info');
}

// Delete a Saved Trip Plan
async function deleteSavedTrip(tripId) {
  if (!confirm('Are you sure you want to delete this saved trip plan from your account?')) {
    return;
  }

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');

  try {
    const res = await fetch(`/api/trips/${tripId}?token=${encodeURIComponent(token || '')}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to delete trip plan.');
    }

    state.userTrips = (state.userTrips || []).filter(t => t.id !== tripId);
    renderUserTrips();

    // If deleting currently active itinerary, reset the save button state
    if (state.activeItinerary && state.activeItinerary.id === tripId) {
      const saveBtn = $('#save-trip-plan-btn');
      const saveBtnText = $('#save-btn-text');
      if (saveBtn) {
        saveBtn.className = "px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors";
      }
      if (saveBtnText) saveBtnText.textContent = "Save Trip Plan";
    }

    showToast('Trip Deleted', 'The saved trip plan has been removed from your account.', 'info');

  } catch (err) {
    console.error('Delete trip error:', err);
    showToast('Error', err.message || 'Could not delete trip plan.', 'error');
  }
}

/* ==========================================================================
   FEATURE 2: MY PLANS & AUTOMATIC TRIP SAVING SYSTEM
   ========================================================================== */

// Helper: Calculate Trip Start and End Dates based on duration
function calculateTripDates(startDateStr, durationDays) {
  if (!startDateStr) return { startDate: null, endDate: null };
  try {
    const parts = startDateStr.split('-');
    if (parts.length !== 3) return { startDate: null, endDate: null };
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const start = new Date(year, month, day);
    const days = Math.max(parseInt(durationDays, 10) || 1, 1);
    // End Date = Start Date + (days - 1)
    const end = new Date(year, month, day + days - 1);
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, '0');
    const dd = String(end.getDate()).padStart(2, '0');
    return {
      startDate: startDateStr,
      endDate: `${yyyy}-${mm}-${dd}`
    };
  } catch (e) {
    console.warn('calculateTripDates parsing error:', e);
    return { startDate: null, endDate: null };
  }
}

// Helper: Format long date (e.g. 15 November 2026)
function formatLongDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts.map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Helper: Calculate dynamic status (Upcoming / Ongoing / Completed) & countdown
function computeTripStatus(startDateStr, endDateStr, durationDays) {
  if (!startDateStr || !endDateStr) {
    return {
      status: 'planned',
      label: 'Planned',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
      dotClass: 'bg-slate-400',
      countdown: 'No travel date set',
      countdownClass: 'text-amber-400/90 font-medium'
    };
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const [sY, sM, sD] = startDateStr.split('-').map(Number);
    const start = new Date(sY, sM - 1, sD).getTime();

    const [eY, eM, eD] = endDateStr.split('-').map(Number);
    const end = new Date(eY, eM - 1, eD, 23, 59, 59, 999).getTime();

    const ONE_DAY_MS = 1000 * 60 * 60 * 24;

    if (today < start) {
      const diffDays = Math.ceil((start - today) / ONE_DAY_MS);
      let countdownText = `⏳ Starts in ${diffDays} days`;
      if (diffDays === 1) countdownText = '⏳ Starts tomorrow';
      else if (diffDays === 0) countdownText = '🟢 Your India Trip Starts Today!';

      return {
        status: 'upcoming',
        label: 'Upcoming',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        dotClass: 'bg-emerald-400',
        countdown: countdownText,
        countdownClass: 'text-emerald-400 font-semibold'
      };
    } else if (today <= end) {
      const dayOfTrip = Math.min(Math.floor((today - start) / ONE_DAY_MS) + 1, durationDays || 1);
      const totalDays = durationDays || Math.max(1, Math.round((end - start) / ONE_DAY_MS) + 1);
      return {
        status: 'ongoing',
        label: 'Ongoing',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        dotClass: 'bg-amber-400',
        countdown: `🟢 Trip in Progress • Day ${dayOfTrip} of ${totalDays}`,
        countdownClass: 'text-amber-400 font-semibold'
      };
    } else {
      return {
        status: 'completed',
        label: 'Completed',
        badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        dotClass: 'bg-blue-400',
        countdown: `✓ Trip Completed`,
        countdownClass: 'text-slate-400'
      };
    }
  } catch (e) {
    return {
      status: 'planned',
      label: 'Planned',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
      dotClass: 'bg-slate-400',
      countdown: 'Dates unavailable',
      countdownClass: 'text-slate-400'
    };
  }
}

// Helper: Format Date Range for Cards
function formatTripDateRange(startDateStr, endDateStr) {
  if (!startDateStr) return 'No travel date set';
  try {
    const parseD = (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const s = parseD(startDateStr);
    const sFormatted = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!endDateStr) return sFormatted;
    const e = parseD(endDateStr);
    const eFormatted = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `📅 ${sFormatted} → ${eFormatted}`;
  } catch (e) {
    return `${startDateStr} → ${endDateStr}`;
  }
}

// Update My Plans counter badge in top navigation
function updateMyPlansBadge() {
  const count = (state.userTrips || []).length;
  const badge = $('#nav-plans-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}
// Controller: Load and Render My Plans view
async function loadAndRenderMyPlans() {
  await loadUserTrips();
  renderMyPlans(state.currentPlanFilter || 'all');
}

// Filter Tabs Controller
function filterMyPlans(filterName) {
  state.currentPlanFilter = filterName;
  document.querySelectorAll('.plan-filter-btn').forEach(btn => {
    btn.className = 'plan-filter-btn px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer';
  });
  const activeBtn = document.getElementById(`plan-filter-${filterName}`);
  if (activeBtn) {
    activeBtn.className = 'plan-filter-btn px-4 py-2 rounded-lg text-xs font-semibold bg-gold-500 text-navy-950 transition-all cursor-pointer';
  }
  renderMyPlans(filterName);
}

// Render My Plans View
function renderMyPlans(activeFilter = 'all') {
  const gridEl = $('#my-plans-grid');
  const emptyEl = $('#my-plans-empty');
  if (!gridEl || !emptyEl) return;

  const allTrips = state.userTrips || [];

  // Calculate Dynamic Counts
  let upcomingCount = 0;
  let ongoingCount = 0;
  let completedCount = 0;

  allTrips.forEach(t => {
    const st = computeTripStatus(t.start_date, t.end_date, t.duration_days).status;
    if (st === 'upcoming') upcomingCount++;
    else if (st === 'ongoing') ongoingCount++;
    else if (st === 'completed') completedCount++;
  });

  // Update Summary Metric Strip
  const totalPlansEl = $('#summary-total-plans');
  const upcomingPlansEl = $('#summary-upcoming-plans');
  const ongoingPlansEl = $('#summary-ongoing-plans');
  const completedPlansEl = $('#summary-completed-plans');

  if (totalPlansEl) totalPlansEl.textContent = `${allTrips.length} Saved`;
  if (upcomingPlansEl) upcomingPlansEl.textContent = upcomingCount;
  if (ongoingPlansEl) ongoingPlansEl.textContent = ongoingCount;
  if (completedPlansEl) completedPlansEl.textContent = completedCount;

  // Update Filter Tab Counter Badges
  const fCountAll = $('#filter-count-all');
  const fCountUpcoming = $('#filter-count-upcoming');
  const fCountOngoing = $('#filter-count-ongoing');
  const fCountCompleted = $('#filter-count-completed');

  if (fCountAll) fCountAll.textContent = allTrips.length;
  if (fCountUpcoming) fCountUpcoming.textContent = upcomingCount;
  if (fCountOngoing) fCountOngoing.textContent = ongoingCount;
  if (fCountCompleted) fCountCompleted.textContent = completedCount;

  // Filter Trips
  let filteredTrips = allTrips;
  if (activeFilter === 'upcoming') {
    filteredTrips = allTrips.filter(t => computeTripStatus(t.start_date, t.end_date, t.duration_days).status === 'upcoming');
  } else if (activeFilter === 'ongoing') {
    filteredTrips = allTrips.filter(t => computeTripStatus(t.start_date, t.end_date, t.duration_days).status === 'ongoing');
  } else if (activeFilter === 'completed') {
    filteredTrips = allTrips.filter(t => computeTripStatus(t.start_date, t.end_date, t.duration_days).status === 'completed');
  }

  // Handle Empty State
  if (filteredTrips.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  gridEl.classList.remove('hidden');

  // Render Premium Amazon-Orders-style Trip Cards
  gridEl.innerHTML = filteredTrips.map(trip => {
    const isSelected = trip.is_selected || trip.id === state.selectedTripId;
    const isConfirmed = (trip.confirmation_status === 'confirmed');
    const statusInfo = computeTripStatus(trip.start_date, trip.end_date, trip.duration_days);
    const dateRangeFormatted = formatTripDateRange(trip.start_date, trip.end_date);
    const formattedBudget = formatCurrency(trip.total_budget_usd, trip.total_budget_inr);
    const tripImg = trip.image || 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=600&auto=format&fit=crop&q=80';
    const createdDateStr = trip.saved_at || trip.created_at;
    const createdDateFormatted = createdDateStr
      ? new Date(createdDateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Recently';

    return `
      <div class="glass-panel rounded-2xl overflow-hidden border ${isSelected ? 'border-gold-500 shadow-xl shadow-gold-500/10 ring-1 ring-gold-500/50' : 'border-slate-800 hover:border-slate-700'} transition-all duration-300 flex flex-col justify-between group bg-slate-900/70">
        
        <!-- Top Image & Overlay Badges -->
        <div class="relative h-48 overflow-hidden bg-slate-800">
          <img src="${tripImg}" alt="${trip.name || trip.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>

          <!-- Category & Selected / Confirmed Badges -->
          <div class="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-navy-950/80 backdrop-blur-md border border-gold-500/40 text-gold-300 flex items-center gap-1">
              <i data-lucide="tag" class="w-3 h-3"></i> ${trip.category || 'Curated Journey'}
            </span>
            ${isConfirmed ? `
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500 text-navy-950 flex items-center gap-1 shadow-md">
                ✓ CONFIRMED
              </span>
            ` : ''}
            ${isSelected ? `
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black ${isConfirmed ? 'bg-gold-400 text-navy-950' : 'bg-gold-500 text-navy-950 animate-pulse'} flex items-center gap-1 shadow-md">
                ⭐ ${isConfirmed ? 'Your Current Trip' : 'Selected Trip'}
              </span>
            ` : ''}
          </div>

          <!-- Status Pill -->
          <div class="absolute top-3 right-3">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md border ${statusInfo.badgeClass} flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full ${statusInfo.dotClass || 'bg-slate-400'}"></span>
              ${statusInfo.label}
            </span>
          </div>

          <!-- Duration & Budget on bottom of image -->
          <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900/90 text-white backdrop-blur-md border border-slate-700/60 flex items-center gap-1">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-gold-400"></i> ${trip.duration_days} Days
            </span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-gold-500/20 text-gold-300 backdrop-blur-md border border-gold-500/40 font-mono">
              ${formattedBudget}
            </span>
          </div>
        </div>

        <!-- Card Body -->
        <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Saved ${createdDateFormatted}</span>
              <span class="font-mono text-[10px] ${isConfirmed ? 'text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20' : 'text-slate-400'}">Trip ID: ${trip.id}</span>
            </div>

            <h3 class="font-serif-luxury text-lg font-bold text-white group-hover:text-gold-300 transition-colors leading-snug line-clamp-2">
              ${trip.name || trip.title}
            </h3>

            <!-- Route -->
            <div class="mt-2 text-xs text-slate-300 flex items-start gap-1.5 leading-relaxed">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-gold-400 shrink-0 mt-0.5"></i>
              <span class="font-medium">${trip.destination || trip.route || 'Custom Corridor'}</span>
            </div>

            <!-- Dates & Dynamic Countdown -->
            <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-slate-400 flex items-center gap-1">
                  <i data-lucide="calendar-range" class="w-3.5 h-3.5 text-gold-400"></i> Dates
                </span>
                <span class="font-semibold ${trip.start_date ? 'text-slate-200' : 'text-amber-400/90'}">
                  ${dateRangeFormatted}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-400 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-gold-400"></i> Countdown
                </span>
                <span class="${statusInfo.countdownClass}">
                  ${statusInfo.countdown}
                </span>
              </div>
            </div>
          </div>

          <!-- Actions Strip -->
          <div class="pt-3 border-t border-slate-800/80 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <button onclick="viewMyPlanTrip('${trip.id}')"
                class="w-full py-2 px-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                <span>View Plan</span>
              </button>

              <button onclick="customizeMyPlanTrip('${trip.id}')"
                class="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-colors border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
                <i data-lucide="sliders" class="w-3.5 h-3.5 text-gold-400"></i>
                <span>Customize</span>
              </button>
            </div>

            <!-- Confirm Trip Button or Confirmed Badge -->
            ${isConfirmed ? `
              <div class="w-full py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 select-none shadow-sm" title="This trip is officially confirmed">
                <i data-lucide="shield-check" class="w-4 h-4 text-emerald-400"></i>
                <span>✓ Trip Confirmed</span>
              </div>
            ` : `
              <button onclick="initiateTripConfirmation('${trip.id}')"
                class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-gold-400 via-gold-500 to-gold-600 hover:from-gold-300 hover:to-gold-500 text-navy-950 font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md hover:shadow-gold-500/20 cursor-pointer">
                <i data-lucide="check-circle" class="w-4 h-4"></i>
                <span>Confirm Trip</span>
              </button>
            `}

            <div class="flex items-center justify-between gap-2 pt-1">
              ${isSelected ? `
                <span class="text-[11px] font-bold text-gold-400 flex items-center gap-1">
                  <i data-lucide="check" class="w-3.5 h-3.5"></i> ⭐ Primary Planned Journey
                </span>
              ` : `
                <button onclick="selectTripAsPrimary('${trip.id}')"
                  class="text-[11px] text-slate-400 hover:text-gold-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer">
                  <i data-lucide="star" class="w-3.5 h-3.5"></i> Make Primary
                </button>
              `}

              <button onclick="deleteMyPlanTrip('${trip.id}')"
                class="text-[11px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer ml-auto" title="Delete this plan">
                <i data-lucide="trash-2" class="w-3 h-3"></i> Delete
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Mark Trip as Primary Journey
async function selectTripAsPrimary(tripId) {
  state.selectedTripId = tripId;
  (state.userTrips || []).forEach(t => {
    t.is_selected = (t.id === tripId);
  });

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  if (state.isAuthenticated && token) {
    try {
      await fetch(`/api/trips/${encodeURIComponent(tripId)}?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_selected: true })
      });
    } catch (e) {
      console.warn('Could not persist primary selection to server:', e);
    }
  } else {
    try {
      localStorage.setItem('bc_my_plans', JSON.stringify(state.userTrips));
    } catch (e) { }
  }

  renderMyPlans(state.currentPlanFilter || 'all');
  const selectedTrip = (state.userTrips || []).find(t => t.id === tripId);
  showToast('Primary Trip Selected', `"${selectedTrip?.name || selectedTrip?.title || 'Trip'}" is now your primary journey.`, 'success');
}

// View Plan Itinerary in Planner View
async function viewMyPlanTrip(tripId) {
  let trip = (state.userTrips || []).find(t => t.id === tripId);
  if (!trip) {
    await loadUserTrips();
    trip = (state.userTrips || []).find(t => t.id === tripId);
  }

  if (!trip) {
    showToast('Plan Not Found', 'Could not locate the requested trip itinerary.', 'error');
    return;
  }

  state.activeItinerary = trip;
  state.itineraryDayImages = Object.assign({}, trip.custom_day_images || {});
  switchAppView('planner');
  renderItinerary(trip);

  const saveBtn = $('#save-trip-plan-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.className = "px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-default select-none shadow-sm";
    saveBtn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i><span id="save-btn-text">Saved to My Plans ✓</span>`;
    lucide.createIcons();
  }

  const resultContainer = $('#planner-result-container');
  if (resultContainer) {
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('Viewing Plan', `Loaded full itinerary for ${trip.name || trip.title}`, 'info');
}

// Customize from My Plans
function customizeMyPlanTrip(tripId) {
  const trip = (state.userTrips || []).find(t => t.id === tripId) || (state.tripOptions || []).find(t => t.id === tripId);
  if (!trip) return;

  switchAppView('planner');

  const destInput = $('#planner-destination');
  const durInput = $('#planner-duration');
  const startDateInput = $('#planner-start-date');

  if (destInput) destInput.value = trip.destination || trip.route || '';
  if (durInput) durInput.value = trip.duration_days || 7;
  if (startDateInput && trip.start_date) startDateInput.value = trip.start_date;

  const form = $('#ai-planner-form');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('Trip Loaded for Customization', `Preferences pre-filled for ${trip.name || trip.title}. Fine-tune details and click "Generate My Trips".`, 'info');
}

// Delete a Plan from My Plans
async function deleteMyPlanTrip(tripId) {
  const trip = (state.userTrips || []).find(t => t.id === tripId);
  const tripName = trip?.name || trip?.title || 'this trip plan';

  if (!confirm(`Are you sure you want to delete "${tripName}" from My Plans?`)) {
    return;
  }

  state.userTrips = (state.userTrips || []).filter(t => t.id !== tripId);
  if (state.selectedTripId === tripId) {
    state.selectedTripId = state.userTrips[0]?.id || null;
    if (state.userTrips[0]) state.userTrips[0].is_selected = true;
  }

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  if (state.isAuthenticated && token) {
    try {
      await fetch(`/api/trips/${encodeURIComponent(tripId)}?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.warn('Could not delete trip from backend:', e);
    }
  } else {
    try {
      localStorage.setItem('bc_my_plans', JSON.stringify(state.userTrips));
    } catch (e) { }
  }

  // If deleting currently active itinerary, reset the save button state
  if (state.activeItinerary && state.activeItinerary.id === tripId) {
    const saveBtn = $('#save-trip-plan-btn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.className = "px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer";
      saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-3.5 h-3.5 text-gold-400"></i><span id="save-btn-text">Save Trip Plan</span>`;
      lucide.createIcons();
    }
  }

  renderMyPlans(state.currentPlanFilter || 'all');
  renderUserTrips();
  updateMyPlansBadge();
  showToast('Plan Deleted', `"${tripName}" has been removed.`, 'info');
}

// ==========================================================================
// FEATURE 3A: TRIP CONFIRMATION CONTROLLERS
// ==========================================================================

// Helper: Focus and scroll to planner travel start date input
function focusPlannerStartDate() {
  const dateInput = $('#planner-start-date');
  if (dateInput) {
    dateInput.focus();
    dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Initiate Trip Confirmation Modal
function initiateTripConfirmation(tripId) {
  // 1. Authentication Check (Requirement 11)
  if (!state.isAuthenticated) {
    showToast('Sign In Required', 'Please sign in to confirm your trip.', 'info');
    openModal('signin-modal');
    return;
  }

  // 2. Locate Trip
  let trip = (state.userTrips || []).find(t => t.id === tripId);
  if (!trip && state.activeItinerary && state.activeItinerary.id === tripId) {
    trip = state.activeItinerary;
  }
  if (!trip && state.tripOptions) {
    trip = state.tripOptions.find(t => t.id === tripId);
  }
  if (!trip) {
    showToast('Trip Not Found', 'Could not locate the requested trip to confirm.', 'error');
    return;
  }

  // Prevent duplicate confirmation (Requirement 1)
  if (trip.confirmation_status === 'confirmed') {
    showToast('Already Confirmed', 'This trip is already confirmed and scheduled.', 'info');
    return;
  }

  // 3. Date Validation & Start Date Resolution (Requirements 3 & 4)
  let startDate = trip.start_date;
  if (!startDate) {
    const plannerInput = $('#planner-start-date');
    if (plannerInput && plannerInput.value) {
      startDate = plannerInput.value.trim();
      trip.start_date = startDate;
    }
  }

  const durationDays = parseInt(trip.duration_days || trip.days || 7, 10);

  if (!startDate) {
    showToast('Travel Date Required', 'Please choose your travel date before confirming this trip.', 'warning');
    switchAppView('planner');
    focusPlannerStartDate();
    return;
  }

  // Calculate End Date from duration
  const dates = calculateTripDates(startDate, durationDays);
  const endDate = trip.end_date || dates.endDate || startDate;
  trip.end_date = endDate;

  // Stash in state for confirmation action
  state.confirmingTripId = tripId;
  state.confirmingTrip = trip;

  // Populate Modal Fields (Requirement 2)
  const catEl = $('#confirm-modal-category');
  const titleEl = $('#confirm-modal-trip-name');
  const routeEl = $('#confirm-modal-route');
  const startEl = $('#confirm-modal-start-date');
  const endEl = $('#confirm-modal-end-date');
  const durEl = $('#confirm-modal-duration');
  const budgetEl = $('#confirm-modal-budget');
  const submitBtn = $('#confirm-modal-submit-btn');

  if (catEl) catEl.textContent = trip.category || 'Curated Journey';
  if (titleEl) titleEl.textContent = trip.name || trip.title || 'India Journey';
  if (routeEl) routeEl.textContent = trip.destination || trip.route || 'Delhi → Agra → Jaipur';
  if (startEl) startEl.textContent = formatLongDate(startDate);
  if (endEl) endEl.textContent = formatLongDate(endDate);
  if (durEl) durEl.textContent = `${durationDays} Days`;
  if (budgetEl) budgetEl.textContent = formatCurrency(trip.total_budget_usd, trip.total_budget_inr);
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Confirm Trip</span>';
  }

  // Ensure review view is displayed and success view is hidden
  const reviewView = $('#confirm-trip-view-review');
  const successView = $('#confirm-trip-view-success');
  if (reviewView) reviewView.classList.remove('hidden');
  if (successView) successView.classList.add('hidden');

  openModal('confirm-trip-modal');
  lucide.createIcons();
}

// Execute Trip Confirmation (Requirement 2 & 10)
async function executeTripConfirmation() {
  const trip = state.confirmingTrip;
  const tripId = state.confirmingTripId;
  if (!trip || !tripId) return;

  const submitBtn = $('#confirm-modal-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> <span>Confirming...</span>';
  }

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  const startDate = trip.start_date;
  const durationDays = parseInt(trip.duration_days || 7, 10);
  const dates = calculateTripDates(startDate, durationDays);
  const endDate = trip.end_date || dates.endDate;

  // If the selected trip has not been saved yet, save ONLY that selected trip first (Requirement 8)
  const isAlreadySaved = (state.userTrips || []).some(t => t.id === tripId);
  if (!isAlreadySaved) {
    if (state.itineraryDayImages && Object.keys(state.itineraryDayImages).length > 0) {
      trip.custom_day_images = Object.assign({}, state.itineraryDayImages);
    }
    if (state.isAuthenticated && token) {
      try {
        const saveRes = await fetch(`/api/trips?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ trip })
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData.detail || 'Could not save trip prior to confirmation.');
        }
        if (saveData.trip) {
          if (!state.userTrips) state.userTrips = [];
          state.userTrips.unshift(saveData.trip);
          updateMyPlansBadge();
        }
      } catch (saveErr) {
        console.error('Error saving trip prior to confirmation:', saveErr);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Confirm Trip</span>';
        }
        showToast('Confirmation Error', saveErr.message || 'Could not save trip plan before confirming.', 'error');
        lucide.createIcons();
        return;
      }
    } else {
      // Guest mode
      if (!state.userTrips) state.userTrips = [];
      state.userTrips.unshift({ ...trip });
      try {
        localStorage.setItem('bc_my_plans', JSON.stringify(state.userTrips));
      } catch (e) { }
      updateMyPlansBadge();
    }
  }

  try {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}?token=${encodeURIComponent(token || '')}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        action: 'confirm',
        confirmation_status: 'confirmed',
        start_date: startDate,
        end_date: endDate,
        duration_days: durationDays
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Confirm Trip</span>';
      }
      showToast('Confirmation Error', data.detail || data.message || 'Could not confirm trip.', 'error');
      lucide.createIcons();
      return;
    }

    const updatedTrip = data.trip;

    // Update in-memory user trips (Requirements 5, 7, 10)
    if (!state.userTrips) state.userTrips = [];
    const idx = state.userTrips.findIndex(t => t.id === tripId);
    if (idx >= 0) {
      state.userTrips[idx] = updatedTrip;
    } else {
      state.userTrips.unshift(updatedTrip);
    }

    // Mark confirmed trip as primary
    state.userTrips.forEach(t => {
      t.is_selected = (t.id === tripId);
    });
    state.selectedTripId = tripId;
    if (state.activeItinerary && state.activeItinerary.id === tripId) {
      state.activeItinerary = updatedTrip;
    }

    try {
      localStorage.setItem('bc_my_plans', JSON.stringify(state.userTrips));
    } catch (e) { }

    // Render Success Screen (Requirement 9)
    const reviewView = $('#confirm-trip-view-review');
    const successView = $('#confirm-trip-view-success');

    const sTitle = $('#success-modal-trip-name');
    const sId = $('#success-modal-trip-id');
    const sStart = $('#success-modal-start-date');
    const sEnd = $('#success-modal-end-date');
    const sDur = $('#success-modal-duration');
    const sStatus = $('#success-modal-status');
    const sMsg = $('#success-modal-journey-message');

    const statusInfo = computeTripStatus(updatedTrip.start_date, updatedTrip.end_date, updatedTrip.duration_days);

    if (sTitle) sTitle.textContent = updatedTrip.name || updatedTrip.title;
    if (sId) sId.textContent = updatedTrip.id;
    if (sStart) sStart.textContent = formatLongDate(updatedTrip.start_date);
    if (sEnd) sEnd.textContent = formatLongDate(updatedTrip.end_date);
    if (sDur) sDur.textContent = `${updatedTrip.duration_days} Days`;
    if (sStatus) sStatus.textContent = `Confirmed • ${statusInfo.label}`;
    if (sMsg) sMsg.textContent = `"Your journey will begin on ${formatLongDate(updatedTrip.start_date)}."`;

    if (reviewView) reviewView.classList.add('hidden');
    if (successView) successView.classList.remove('hidden');

    // Update My Plans and badges
    renderMyPlans(state.currentPlanFilter || 'all');
    updateMyPlansBadge();
    if (state.activeItinerary && state.activeItinerary.id === tripId) {
      renderItinerary(state.activeItinerary);
    }
    showToast('Trip Confirmed!', `"${updatedTrip.name || updatedTrip.title}" is now scheduled.`, 'success');
    lucide.createIcons();

  } catch (err) {
    console.error('Confirmation request error:', err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Confirm Trip</span>';
    }
    showToast('Network Error', 'Failed to connect to server. Please try again.', 'error');
    lucide.createIcons();
  }
}

// View Confirmed Trip from Modal (Requirement 9)
function viewConfirmedTripFromModal() {
  closeModal('confirm-trip-modal');
  switchAppView('plans');
  renderMyPlans('all');
}

// Reset and Focus Planner for Creating Another Trip
function resetAndFocusPlanner() {
  const plannerSec = $('#ai-trip-planner');
  if (plannerSec) {
    plannerSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  switchPlannerMode('ai');
}

// Share Itinerary
function shareCurrentItinerary() {
  if (!state.activeItinerary) return;
  const shareUrl = `${window.location.origin}/#itinerary-${state.activeItinerary.id}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Share Link Copied', 'Private itinerary URL copied to clipboard!', 'success');
  }).catch(() => {
    prompt('Copy this private itinerary link:', shareUrl);
  });
}

// Print Itinerary
function printCurrentItinerary() {
  window.print();
}

// Render Verified Guides
function renderGuides() {
  const container = $('#guides-grid');
  if (!container) return;

  const banner = $('#assigned-guide-banner');
  if (banner) {
    const confirmedTrip = (state.userTrips || []).find(t => t.status === 'confirmed');
    if (confirmedTrip) {
      const guide = confirmedTrip.assigned_guide || state.guides?.[0] || {
        name: 'Rajesh Sharma',
        city: confirmedTrip.destination || 'Jaipur',
        phone: '+91 98290 14820',
        badge: 'Ministry Licensed Level 4',
        rating: 4.98
      };

      banner.innerHTML = `
        <div class="p-6 rounded-3xl bg-gradient-to-r from-[#0D264C] via-[#103160] to-[#0A1E3B] border-2 border-gold-500/60 shadow-2xl relative overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gold-500/30">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
              <span class="text-xs font-bold uppercase tracking-widest text-gold-300">Your Assigned Local Guide • Confirmed Trip</span>
            </div>
            <span class="px-3 py-1 rounded-full bg-gold-500/20 text-gold-300 border border-gold-500/40 text-xs font-bold">
              ${escapeHtml(confirmedTrip.name || 'India Journey')} (${confirmedTrip.start_date || 'Upcoming'})
            </span>
          </div>

          <div class="mt-4 flex flex-col md:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-2xl bg-gold-500/20 text-gold-400 border border-gold-500/50 flex items-center justify-center text-3xl font-black shrink-0">
                👨‍💼
              </div>
              <div>
                <h4 class="text-xl font-bold text-white flex items-center gap-2">
                  ${escapeHtml(guide.name)}
                  <span class="text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">✓ Active Escort</span>
                </h4>
                <p class="text-xs text-gold-400 mt-0.5">
                  <i data-lucide="shield-check" class="w-3.5 h-3.5 inline mr-1"></i>${escapeHtml(guide.badge || 'Govt. Certified Regional Guide')} • ${escapeHtml(guide.city || 'India')}
                </p>
                <p class="text-[11px] text-slate-300 mt-1">
                  Assigned for on-ground guidance, heritage interpretation, and 24/7 journey safety.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3 w-full md:w-auto">
              <a href="https://wa.me/${(guide.phone || '919829014820').replace(/\D/g, '')}?text=${encodeURIComponent('Hello ' + (guide.name || 'Guide') + ', I am traveling on BharatConnect AI confirmed trip ' + (confirmedTrip.id || ''))}" target="_blank"
                class="flex-1 md:flex-initial px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer">
                <span>💬 WhatsApp Direct</span>
              </a>
              <button onclick="openGuideChat('${guide.id || 'guide-1'}')"
                class="flex-1 md:flex-initial px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20 transition-all cursor-pointer">
                <i data-lucide="message-square" class="w-4 h-4"></i>
                <span>In-App Chat</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div class="p-4 rounded-2xl bg-navy-950/80 border border-slate-700/80 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gold-500/20 text-gold-400 flex items-center justify-center text-lg shrink-0">
              🔒
            </div>
            <div>
              <span class="font-bold text-white block">Official Local Guide Assignment</span>
              <span class="text-slate-300 text-[11px]">Confirm your planned trip itinerary with travel start dates to automatically unlock your assigned Ministry-certified guide with direct chat.</span>
            </div>
          </div>
          <button onclick="switchAppView('planner')" class="px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs shrink-0 cursor-pointer">
            Plan / Confirm Trip
          </button>
        </div>
      `;
    }
  }

  const cityFilter = $('#guide-filter-city')?.value || 'all';
  const langFilter = $('#guide-filter-lang')?.value || 'all';
  const categoryFilter = $('#guide-filter-category')?.value || 'all';
  const priceFilter = $('#guide-filter-price')?.value || 'all';
  const ratingFilter = $('#guide-filter-rating')?.value || 'all';
  const availFilter = $('#guide-filter-avail')?.value || 'all';
  const search = $('#guide-search')?.value?.toLowerCase().trim() || '';

  let filtered = state.guides;
  if (cityFilter !== 'all') {
    filtered = filtered.filter(g => g.city.toLowerCase().includes(cityFilter.toLowerCase()));
  }
  if (langFilter !== 'all') {
    filtered = filtered.filter(g => g.languages.some(l => l.toLowerCase() === langFilter.toLowerCase()));
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(g => g.category.toLowerCase().includes(categoryFilter.toLowerCase()));
  }
  if (priceFilter !== 'all') {
    if (priceFilter === 'under50') {
      filtered = filtered.filter(g => g.price_per_day_usd < 50);
    } else if (priceFilter === '50to75') {
      filtered = filtered.filter(g => g.price_per_day_usd >= 50 && g.price_per_day_usd <= 75);
    } else if (priceFilter === 'above75') {
      filtered = filtered.filter(g => g.price_per_day_usd > 75);
    }
  }
  if (ratingFilter !== 'all') {
    const minRating = parseFloat(ratingFilter);
    if (!isNaN(minRating)) {
      filtered = filtered.filter(g => g.rating >= minRating);
    }
  }
  if (availFilter !== 'all') {
    if (availFilter === 'today') {
      filtered = filtered.filter(g => g.availability.toLowerCase().includes('today'));
    } else if (availFilter === 'this-week') {
      filtered = filtered.filter(g => g.availability.toLowerCase().includes('week') || g.availability.toLowerCase().includes('today'));
    }
  }
  if (search) {
    filtered = filtered.filter(g =>
      g.name.toLowerCase().includes(search) ||
      g.city.toLowerCase().includes(search) ||
      g.bio.toLowerCase().includes(search) ||
      (g.expertise && g.expertise.some(e => e.toLowerCase().includes(search))) ||
      (g.specialties && g.specialties.some(s => s.toLowerCase().includes(search)))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 px-4 rounded-2xl border border-dashed border-slate-700 bg-[#0E2547]/30">
        <i data-lucide="user-x" class="w-12 h-12 text-slate-500 mx-auto mb-3"></i>
        <h4 class="text-lg font-bold text-white">No Verified Guides Match Your Criteria</h4>
        <p class="text-sm text-slate-400 mt-1 max-w-md mx-auto">Try clearing one or more filters to discover more licensed local experts across India.</p>
        <button onclick="clearGuideFilters()" class="mt-4 px-4 py-2 rounded-xl bg-gold-500 text-navy-950 font-semibold text-xs">
          Reset Guide Filters
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(g => `
    <div class="glass-card rounded-2xl overflow-hidden flex flex-col group hover:border-gold-500/50 transition-all duration-300">
      <div class="relative h-56 overflow-hidden">
        <img src="${g.avatar}" alt="${g.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div class="absolute inset-0 bg-gradient-to-t from-navy-950 via-transparent to-transparent"></div>
        <div class="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-navy-950/90 border border-gold-500/40 text-xs font-semibold text-gold-400 backdrop-blur-md">
          <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> ${g.badge}
        </div>
        <div class="absolute top-3 right-3 px-2 py-1 rounded-full bg-slate-900/90 text-xs font-bold text-emerald-400 backdrop-blur-md flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ${g.availability}
        </div>
        <div class="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div>
            <h4 class="text-xl font-bold text-white flex items-center gap-2">
              ${g.name}
            </h4>
            <p class="text-xs text-gold-400 flex items-center gap-1 mt-0.5">
              <i data-lucide="map-pin" class="w-3 h-3"></i> ${g.city}, ${g.state}
            </p>
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-400 block">Starting from</span>
            <span class="text-lg font-extrabold text-white">${formatCurrency(g.price_per_day_usd, g.price_per_day_inr)}<span class="text-xs font-normal text-slate-400">/day</span></span>
          </div>
        </div>
      </div>

      <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-center justify-between text-xs text-slate-400 pb-3 border-b border-slate-800">
            <span class="flex items-center gap-1 text-amber-300 font-bold">
              <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-300"></i> ${g.rating} (${g.trips_completed} trips)
            </span>
            <span><i data-lucide="award" class="w-3 h-3 inline mr-1 text-gold-400"></i> ${g.experience_years} yrs experience</span>
          </div>

          <p class="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">
            ${g.bio}
          </p>

          <div class="mt-3 flex flex-wrap gap-1.5">
            ${g.languages.map(l => `<span class="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-300">${l}</span>`).join('')}
            <span class="px-2 py-0.5 rounded-md bg-gold-500/15 text-gold-400 text-[11px] font-medium">${g.category}</span>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2">
          <button onclick="openGuideProfile('${g.id}')" class="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors text-center">
            Profile
          </button>
          <button onclick="openGuideChat('${g.id}')" class="px-2.5 py-2 rounded-xl bg-navy-950 border border-gold-500/40 hover:border-gold-500 text-xs font-semibold text-gold-400 transition-colors flex items-center justify-center gap-1">
            <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Chat
          </button>
          <button onclick="openGuideRequestModal('${g.id}')" class="px-2.5 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-xs font-bold text-navy-950 transition-colors text-center shadow-sm">
            Hire
          </button>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function clearGuideFilters() {
  const c = $('#guide-filter-city');
  const l = $('#guide-filter-lang');
  const cat = $('#guide-filter-category');
  const p = $('#guide-filter-price');
  const r = $('#guide-filter-rating');
  const a = $('#guide-filter-avail');
  const s = $('#guide-search');
  if (c) c.value = 'all';
  if (l) l.value = 'all';
  if (cat) cat.value = 'all';
  if (p) p.value = 'all';
  if (r) r.value = 'all';
  if (a) a.value = 'all';
  if (s) s.value = '';
  renderGuides();
}

// Render Experiences
function renderExperiences() {
  const container = $('#experiences-grid');
  if (!container) return;

  const activeCategory = window.activeExpCategory || 'all';
  const activeCity = $('#exp-filter-city')?.value || 'all';
  const durationFilter = $('#exp-filter-duration')?.value || 'all';
  const budgetFilter = $('#exp-filter-budget')?.value || 'all';
  const typeFilter = $('#exp-filter-type')?.value || 'all';

  let filtered = state.experiences;
  if (activeCategory !== 'all') {
    filtered = filtered.filter(e => e.category.toLowerCase().includes(activeCategory.toLowerCase()));
  }
  if (activeCity !== 'all') {
    filtered = filtered.filter(e => e.city.toLowerCase().includes(activeCity.toLowerCase()));
  }
  if (durationFilter !== 'all') {
    if (durationFilter === 'short') {
      filtered = filtered.filter(e => {
        const d = e.duration.toLowerCase();
        return d.includes('2') || d.includes('3') || d.includes('short') || (parseFloat(d) && parseFloat(d) <= 3.5);
      });
    } else if (durationFilter === 'half') {
      filtered = filtered.filter(e => {
        const d = e.duration.toLowerCase();
        return d.includes('4') || d.includes('5') || d.includes('half');
      });
    } else if (durationFilter === 'full') {
      filtered = filtered.filter(e => {
        const d = e.duration.toLowerCase();
        return d.includes('6') || d.includes('7') || d.includes('8') || d.includes('full') || d.includes('day');
      });
    }
  }
  if (budgetFilter !== 'all') {
    if (budgetFilter === 'under50') {
      filtered = filtered.filter(e => e.price_usd < 50);
    } else if (budgetFilter === '50to100') {
      filtered = filtered.filter(e => e.price_usd >= 50 && e.price_usd <= 100);
    } else if (budgetFilter === 'above100') {
      filtered = filtered.filter(e => e.price_usd > 100);
    }
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(e =>
      e.category.toLowerCase().includes(typeFilter.toLowerCase()) ||
      e.title.toLowerCase().includes(typeFilter.toLowerCase()) ||
      e.description.toLowerCase().includes(typeFilter.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 px-4 rounded-2xl border border-dashed border-slate-700 bg-navy-900/30">
        <i data-lucide="compass" class="w-12 h-12 text-slate-500 mx-auto mb-3"></i>
        <h4 class="text-lg font-bold text-white">No Experiences Match Your Selected Filters</h4>
        <p class="text-sm text-slate-400 mt-1 max-w-md mx-auto">Try selecting "All Experiences" or choosing another destination.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(e => `
    <div class="glass-card rounded-2xl overflow-hidden flex flex-col group hover:border-gold-500/50 transition-all duration-300">
      <div class="relative h-48 overflow-hidden">
        <img src="${e.image}" alt="${e.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div class="absolute inset-0 bg-gradient-to-t from-navy-950 via-transparent to-transparent"></div>
        <div class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-navy-950/90 border border-gold-500/40 text-xs font-semibold text-gold-400 backdrop-blur-md flex items-center gap-1">
          <i data-lucide="check-circle" class="w-3 h-3"></i> ${e.badge}
        </div>
        <div class="absolute top-3 right-3 px-2 py-1 rounded-md bg-slate-900/90 text-[11px] font-bold text-slate-200">
          <i data-lucide="clock" class="w-3 h-3 inline mr-1 text-gold-400"></i> ${e.duration}
        </div>
        <div class="absolute bottom-2 left-4 text-xs font-medium text-gold-400 flex items-center gap-1">
          <i data-lucide="map-pin" class="w-3 h-3"></i> ${e.city}, ${e.state}
        </div>
      </div>

      <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span class="text-[11px] uppercase tracking-wider text-amber-400 font-semibold">${e.category}</span>
            <span class="flex items-center gap-1 font-bold text-amber-300">
              <i data-lucide="star" class="w-3 h-3 fill-amber-300"></i> ${e.rating} (${e.review_count})
            </span>
          </div>

          <h4 class="font-bold text-white text-base leading-snug group-hover:text-gold-400 transition-colors">
            ${e.title}
          </h4>

          <p class="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">
            ${e.description}
          </p>

          <div class="mt-3 flex flex-wrap gap-1">
            ${e.includes.slice(0, 2).map(inc => `<span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">${inc}</span>`).join('')}
            ${e.includes.length > 2 ? `<span class="px-1.5 py-0.5 text-[10px] text-slate-400">+${e.includes.length - 2} more</span>` : ''}
          </div>
        </div>

        <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
          <div>
            <span class="text-[11px] text-slate-400 block">Price per guest</span>
            <span class="text-lg font-bold text-white">${formatCurrency(e.price_usd, e.price_inr)}</span>
          </div>
          <button onclick="openBookExperience('${e.id}')" class="px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-navy-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-gold-500/10">
            <span>Book Experience</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function setExpCategory(cat, el) {
  window.activeExpCategory = cat;
  $$('.exp-category-tab').forEach(t => {
    t.classList.remove('bg-gold-500', 'text-navy-950', 'font-bold');
    t.classList.add('bg-slate-800/80', 'text-slate-300');
  });
  if (el) {
    el.classList.add('bg-gold-500', 'text-navy-950', 'font-bold');
    el.classList.remove('bg-slate-800/80', 'text-slate-300');
  }
  renderExperiences();
}

// Render Global Collaboration Business Partners
function renderPartners() {
  const container = $('#partners-grid');
  if (!container) return;

  const countryFilter = $('#partner-filter-country')?.value || 'all';
  const industryFilter = $('#partner-filter-industry')?.value || 'all';
  const verifyFilter = $('#partner-filter-verify')?.value || 'all';
  const collabFilter = $('#partner-filter-collab')?.value || 'all';
  const search = $('#partner-search')?.value?.toLowerCase().trim() || '';

  let filtered = state.partners;
  if (countryFilter !== 'all') {
    filtered = filtered.filter(p => p.country.toLowerCase().includes(countryFilter.toLowerCase()));
  }
  if (industryFilter !== 'all') {
    const ind = industryFilter.toLowerCase();
    filtered = filtered.filter(p => {
      const pInd = (p.industry || '').toLowerCase();
      if (ind.includes('tourism') || ind.includes('hospitality')) {
        return pInd.includes('hospitality') || pInd.includes('tourism') || pInd.includes('travel');
      }
      if (ind.includes('food') || ind.includes('spice')) {
        return pInd.includes('spice') || pInd.includes('food');
      }
      if (ind.includes('handicraft') || ind.includes('textile')) {
        return pInd.includes('handicraft') || pInd.includes('textile') || pInd.includes('weave');
      }
      if (ind.includes('technology')) {
        return pInd.includes('tech');
      }
      if (ind.includes('sustainable')) {
        return pInd.includes('sustainable') || pInd.includes('botanical') || pInd.includes('eco');
      }
      if (ind.includes('travel services')) {
        return pInd.includes('travel') || pInd.includes('tourism') || pInd.includes('transport');
      }
      if (ind.includes('cultural')) {
        return pInd.includes('cultural') || pInd.includes('heritage') || pInd.includes('silk');
      }
      if (ind.includes('business')) {
        return pInd.includes('business') || pInd.includes('advisory') || pInd.includes('legal');
      }
      if (ind.includes('other')) {
        return pInd.includes('other') || pInd.includes('advisory') || pInd.includes('service');
      }
      return pInd.includes(ind);
    });
  }
  if (verifyFilter !== 'all') {
    filtered = filtered.filter(p => p.verification_status.toLowerCase().includes(verifyFilter.toLowerCase()));
  }
  if (collabFilter !== 'all') {
    filtered = filtered.filter(p => p.collaboration_interests.some(ci => ci.toLowerCase().includes(collabFilter.toLowerCase())));
  }
  if (search) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.description.toLowerCase().includes(search) ||
      p.city.toLowerCase().includes(search) ||
      p.products.some(pr => pr.toLowerCase().includes(search)) ||
      p.collaboration_interests.some(ci => ci.toLowerCase().includes(search))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 px-4 rounded-2xl border border-dashed border-slate-700 bg-navy-900/30">
        <i data-lucide="building-2" class="w-12 h-12 text-slate-500 mx-auto mb-3"></i>
        <h4 class="text-lg font-bold text-white">No Business Partners Match Your Filters</h4>
        <p class="text-sm text-slate-400 mt-1 max-w-md mx-auto">Try clearing filters or searching for spices, textiles, or wellness partners.</p>
        <button onclick="clearPartnerFilters()" class="mt-4 px-4 py-2 rounded-xl bg-gold-500 text-navy-950 font-semibold text-xs">
          Reset Partner Filters
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="glass-card rounded-2xl p-6 flex flex-col justify-between hover:border-gold-500/50 transition-all duration-300 space-y-4">
      <div>
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="inline-block px-2.5 py-0.5 rounded-full bg-gold-500/15 text-gold-400 text-[11px] font-semibold mb-2">
              ${p.industry}
            </span>
            <h4 class="text-lg font-bold text-white">${p.name}</h4>
            <p class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <i data-lucide="map-pin" class="w-3 h-3 text-gold-400"></i> ${p.city}, ${p.country}
            </p>
          </div>
          <span class="p-2 rounded-xl bg-slate-800/80 text-emerald-400 shrink-0" title="${p.verification_status}">
            <i data-lucide="badge-check" class="w-5 h-5"></i>
          </span>
        </div>

        <p class="text-xs text-slate-300 mt-3 leading-relaxed">
          ${p.description}
        </p>

        <div class="mt-4">
          <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Focus Products & Offerings:</span>
          <div class="flex flex-wrap gap-1.5">
            ${p.products.map(pr => `<span class="px-2 py-0.5 rounded bg-navy-950 border border-slate-700 text-[11px] text-amber-200">${pr}</span>`).join('')}
          </div>
        </div>

        <div class="mt-3">
          <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Seeking Alliances With:</span>
          <ul class="text-xs text-slate-300 space-y-1">
            ${p.collaboration_interests.map(ci => `
              <li class="flex items-center gap-1.5">
                <i data-lucide="handshake" class="w-3.5 h-3.5 text-gold-400"></i> ${ci}
              </li>
            `).join('')}
          </ul>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
        <div class="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
          <i data-lucide="shield" class="w-3 h-3"></i> ${p.verification_status}
        </div>
        <button onclick="openCollabModal('${p.id}', '${p.name}', '${p.industry}')" class="px-4 py-2 rounded-xl bg-navy-950 border border-gold-500 text-gold-400 hover:bg-gold-500 hover:text-navy-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md">
          <span>Request Collaboration</span>
          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function clearPartnerFilters() {
  const c = $('#partner-filter-country');
  const i = $('#partner-filter-industry');
  const v = $('#partner-filter-verify');
  const col = $('#partner-filter-collab');
  const s = $('#partner-search');
  if (c) c.value = 'all';
  if (i) i.value = 'all';
  if (v) v.value = 'all';
  if (col) col.value = 'all';
  if (s) s.value = '';
  renderPartners();
}

// Render Global Community
function renderCommunity() {
  const container = $('#community-posts-container');
  if (!container) return;

  const categoryFilter = window.activeCommunityCategory || 'all';
  let filtered = state.communityPosts;
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(c => c.category.toLowerCase().includes(categoryFilter.toLowerCase()));
  }

  container.innerHTML = filtered.map(post => `
    <div class="glass-card rounded-2xl p-6 hover:border-[#D4AF37]/40 transition-all duration-300 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="${post.author_avatar}" alt="${post.author_name}" class="w-11 h-11 rounded-full object-cover border border-[#D4AF37]/40" />
          <div>
            <div class="flex items-center gap-2">
              <h5 class="font-bold text-white text-sm">${post.author_name}</h5>
              <span class="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                ${post.author_origin}
              </span>
            </div>
            <span class="text-[11px] text-slate-400">${post.date} • in <span class="text-[#D4AF37]">${post.category}</span></span>
          </div>
        </div>
        <button onclick="toggleFollowAuthor(this, '${post.author_name}')" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors">
          + Follow
        </button>
      </div>

      <div>
        <h4 class="text-base font-bold text-white mb-2 leading-snug">${post.title}</h4>
        <p class="text-xs text-slate-300 leading-relaxed">${post.content}</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${post.tags.map(t => `<span class="px-2 py-0.5 rounded-md bg-[#0B1F3A] border border-slate-800 text-[11px] text-[#D4AF37]">#${t}</span>`).join('')}
        </div>
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div class="flex items-center gap-4">
          <button onclick="toggleLikePost('${post.id}', this)" class="flex items-center gap-1.5 ${post.user_liked ? 'text-red-400 font-bold' : 'hover:text-white'} transition-colors">
            <i data-lucide="heart" class="w-4 h-4 ${post.user_liked ? 'fill-red-400' : ''}"></i>
            <span>${post.likes}</span>
          </button>
          <button onclick="toggleCommentsSection('${post.id}')" class="flex items-center gap-1.5 hover:text-white transition-colors">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            <span>${post.comments_count || (post.comments ? post.comments.length : 0)} replies</span>
          </button>
          <button onclick="sharePost('${post.title}')" class="hover:text-white transition-colors">
            <i data-lucide="share-2" class="w-4 h-4"></i>
          </button>
        </div>
        <span class="text-[11px] text-emerald-400 flex items-center gap-1">
          <i data-lucide="badge-check" class="w-3.5 h-3.5"></i> Verified Traveler
        </span>
      </div>

      <!-- Expandable Comments -->
      <div id="comments-${post.id}" class="hidden pt-3 border-t border-slate-800/60 space-y-2">
        <div class="space-y-2">
          ${(post.comments || []).map(c => `
            <div class="p-2.5 rounded-xl bg-slate-900/60 text-xs border border-slate-800">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="font-bold text-amber-300">${c.author}</span>
                <span class="text-slate-500">${c.time}</span>
              </div>
              <p class="text-slate-300">${c.text}</p>
            </div>
          `).join('')}
        </div>
        <div class="flex items-center gap-2 mt-2">
          <input type="text" id="reply-input-${post.id}" placeholder="Write a response..." class="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#D4AF37]" />
          <button onclick="submitReply('${post.id}')" class="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#0B1F3A] font-bold text-xs">
            Reply
          </button>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function setCommunityCategory(cat, el) {
  window.activeCommunityCategory = cat;
  $$('.community-category-tab').forEach(t => {
    t.classList.remove('bg-[#D4AF37]', 'text-[#0B1F3A]', 'font-bold');
    t.classList.add('bg-slate-800/80', 'text-slate-300');
  });
  if (el) {
    el.classList.add('bg-[#D4AF37]', 'text-[#0B1F3A]', 'font-bold');
    el.classList.remove('bg-slate-800/80', 'text-slate-300');
  }
  renderCommunity();
}

async function toggleLikePost(postId, btn) {
  try {
    const res = await fetch('/api/community/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId })
    });
    const data = await res.json();
    if (data.success) {
      const post = state.communityPosts.find(p => p.id === postId);
      if (post) {
        post.likes = data.likes;
        post.user_liked = data.user_liked;
      }
      renderCommunity();
    }
  } catch (err) {
    // fallback toggle
    const post = state.communityPosts.find(p => p.id === postId);
    if (post) {
      post.user_liked = !post.user_liked;
      post.likes += post.user_liked ? 1 : -1;
      renderCommunity();
    }
  }
}

function toggleCommentsSection(postId) {
  const el = $(`#comments-${postId}`);
  if (el) el.classList.toggle('hidden');
}

function submitReply(postId) {
  const input = $(`#reply-input-${postId}`);
  if (!input || !input.value.trim()) return;

  const post = state.communityPosts.find(p => p.id === postId);
  if (post) {
    if (!post.comments) post.comments = [];
    post.comments.push({
      author: 'You (Traveler)',
      text: input.value.trim(),
      time: 'Just now'
    });
    post.comments_count = post.comments.length;
    renderCommunity();
    showToast('Reply Added', 'Your contribution is now live on the traveler feed.');
  }
}

async function toggleFollowAuthor(btn, author) {
  try {
    const res = await fetch('/api/community/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: author })
    });
    const data = await res.json();
    if (data.is_following) {
      btn.textContent = '✓ Following';
      btn.classList.add('bg-gold-500', 'text-navy-950', 'font-bold');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      showToast('Following Traveler', data.message || `You are now following ${author}.`, 'success');
    } else {
      btn.textContent = '+ Follow';
      btn.classList.remove('bg-gold-500', 'text-navy-950', 'font-bold');
      btn.classList.add('bg-slate-800', 'text-slate-300');
      showToast('Unfollowed', `You have unfollowed ${author}.`, 'info');
    }
  } catch (err) {
    if (btn.textContent.includes('Following')) {
      btn.textContent = '+ Follow';
      btn.classList.remove('bg-gold-500', 'text-navy-950', 'font-bold');
      btn.classList.add('bg-slate-800', 'text-slate-300');
      showToast('Unfollowed', `You have unfollowed ${author}.`, 'info');
    } else {
      btn.textContent = '✓ Following';
      btn.classList.add('bg-gold-500', 'text-navy-950', 'font-bold');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      showToast('Following', `You will now receive updates from ${author}.`, 'success');
    }
  }
}

function toggleFollowTraveler(author, btn) {
  if (typeof author === 'object' && btn === undefined) {
    return toggleFollowAuthor(author, btn);
  }
  return toggleFollowAuthor(btn, author);
}

// Explore India circuit helpers
function selectDestinationAndPlan(destName) {
  const destInput = $('#planner-destination');
  if (destInput) {
    destInput.value = destName;
  }
  const plannerSection = $('#ai-trip-planner');
  if (plannerSection) {
    plannerSection.scrollIntoView({ behavior: 'smooth' });
  }
  showToast('Destination Selected', `Customizing AI planner for ${destName}. Adjust travelers or budget and click Generate!`, 'info');
  setTimeout(() => {
    destInput?.focus();
  }, 400);
}

function filterGuidesByCity(cityName) {
  const citySelect = $('#guide-filter-city');
  if (citySelect) {
    citySelect.value = cityName;
  }
  renderGuides();
  const guidesSection = $('#local-guides');
  if (guidesSection) {
    guidesSection.scrollIntoView({ behavior: 'smooth' });
  }
  showToast('Guides Filtered', `Displaying verified local guides in ${cityName}.`, 'info');
}

function editTripPlan() {
  const formEl = $('#ai-planner-form') || $('#ai-trip-planner');
  if (formEl) {
    formEl.scrollIntoView({ behavior: 'smooth' });
  }
  const destInput = $('#planner-destination');
  if (destInput) {
    destInput.focus();
    destInput.classList.add('ring-2', 'ring-gold-500');
    setTimeout(() => destInput.classList.remove('ring-2', 'ring-gold-500'), 1500);
  }
  showToast('Edit Plan Preferences', 'Modify your destination, duration, budget, or travel style and click Regenerate.', 'info');
}

// Live Collaboration Inquiry Tracking
async function trackCollaborationInquiry() {
  const query = $('#collab-track-input')?.value?.trim() || '';
  const listContainer = $('#tracked-collab-list');
  if (!listContainer) return;

  try {
    const res = await fetch(`/api/collaborate/track?query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const records = data.records || [];

    if (records.length === 0) {
      listContainer.innerHTML = `
        <div class="col-span-full text-center py-8 p-4 rounded-xl bg-slate-900/60 border border-dashed border-slate-700">
          <p class="text-xs text-slate-400">No active inquiry records found matching "${query}". Try searching for "BC-9041", "Spice", or "Indigo".</p>
        </div>
      `;
      showToast('No Records Found', `No collaboration inquiry matches "${query}".`, 'info');
      return;
    }

    listContainer.innerHTML = records.map(r => `
      <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-gold-500/40 transition-all flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-xs font-mono font-bold text-gold-400">${r.tracking_id}</span>
            <span class="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span> Step ${r.status_step || 5}/8: ${r.status}
            </span>
          </div>
          <h5 class="font-bold text-white text-sm mb-1">${r.company} & ${r.partner_name}</h5>
          <p class="text-xs text-slate-400 mb-3">${r.category} collaboration inquiry.</p>
          <div class="p-2.5 rounded-xl bg-navy-950/80 text-[11px] text-slate-300 border border-slate-800/80">
            <strong class="text-gold-400">Status Update:</strong> ${r.note}
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
          <span>${r.date_updated}</span>
          <button onclick="showToast('Inquiry ${r.tracking_id}', 'Trade concierge status details confirmed.', 'info')" class="text-gold-400 font-semibold hover:underline">View Details</button>
        </div>
      </div>
    `).join('');

    showToast('Inquiries Retrieved', `Displaying ${records.length} tracked partnership status updates.`, 'success');
  } catch (err) {
    showToast('Lookup Error', 'Unable to fetch status. Please try again.', 'error');
  }
}

// Password Visibility Toggle
function togglePasswordVisibility(fieldId, btn) {
  const input = $(`#${fieldId}`);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>`;
  lucide.createIcons();
}

// Live Password Strength Evaluator
function evaluatePasswordStrength(pwd) {
  const m1 = $('#pwd-meter-1');
  const m2 = $('#pwd-meter-2');
  const m3 = $('#pwd-meter-3');
  const m4 = $('#pwd-meter-4');
  const label = $('#pwd-strength-text');
  if (!m1 || !label) return;

  // Reset meters
  [m1, m2, m3, m4].forEach(el => {
    el.className = 'h-full w-1/4 rounded-full bg-slate-700 transition-all duration-300';
  });

  if (!pwd) {
    label.textContent = 'Enter password';
    label.className = 'text-slate-500 font-medium';
    return;
  }

  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  else if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score = Math.max(score, 1);

  if (score <= 1) {
    m1.className = 'h-full w-1/4 rounded-full bg-red-500 transition-all duration-300';
    label.textContent = 'Weak';
    label.className = 'text-red-400 font-semibold';
  } else if (score === 2) {
    m1.className = 'h-full w-1/4 rounded-full bg-amber-500 transition-all duration-300';
    m2.className = 'h-full w-1/4 rounded-full bg-amber-500 transition-all duration-300';
    label.textContent = 'Fair';
    label.className = 'text-amber-400 font-semibold';
  } else if (score === 3) {
    m1.className = 'h-full w-1/4 rounded-full bg-gold-500 transition-all duration-300';
    m2.className = 'h-full w-1/4 rounded-full bg-gold-500 transition-all duration-300';
    m3.className = 'h-full w-1/4 rounded-full bg-gold-500 transition-all duration-300';
    label.textContent = 'Good';
    label.className = 'text-gold-400 font-semibold';
  } else {
    [m1, m2, m3, m4].forEach(el => {
      el.className = 'h-full w-1/4 rounded-full bg-emerald-500 transition-all duration-300';
    });
    label.textContent = 'Strong';
    label.className = 'text-emerald-400 font-semibold';
  }

  checkPasswordMatch();
}

// Password Match Checker
function checkPasswordMatch() {
  const pwd = $('#signup-password')?.value || '';
  const confirm = $('#signup-confirm-password')?.value || '';
  const matchEl = $('#signup-confirm-match');
  const errorEl = $('#signup-confirm-error');
  if (!matchEl || !errorEl) return;

  if (!confirm) {
    matchEl.classList.add('hidden');
    matchEl.classList.remove('flex');
    errorEl.classList.add('hidden');
    return;
  }

  if (pwd === confirm) {
    matchEl.classList.remove('hidden');
    matchEl.classList.add('flex');
    errorEl.classList.add('hidden');
    $('#signup-confirm-password').classList.remove('border-red-500');
    $('#signup-confirm-password').classList.add('border-emerald-500');
  } else {
    matchEl.classList.add('hidden');
    matchEl.classList.remove('flex');
    $('#signup-confirm-password').classList.remove('border-emerald-500');
  }
}

// ========================================================
// OTP Verification, Authentication & User Management Flow
// ========================================================

state.pendingOtpEmail = '';
let otpTimerInterval = null;

// Initialize 6-digit OTP Box Inputs (Auto-Advance, Backspace, Paste)
function initOtpInputs() {
  const boxes = [
    $('#otp-1'), $('#otp-2'), $('#otp-3'),
    $('#otp-4'), $('#otp-5'), $('#otp-6')
  ];

  boxes.forEach((box, idx) => {
    if (!box) return;

    // Reset input
    box.value = '';

    box.oninput = (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      box.value = val ? val.slice(-1) : '';

      if (box.value && idx < 5 && boxes[idx + 1]) {
        boxes[idx + 1].focus();
        boxes[idx + 1].select();
      }
    };

    box.onkeydown = (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0 && boxes[idx - 1]) {
        boxes[idx - 1].focus();
        boxes[idx - 1].select();
      }
    };

    box.onpaste = (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/[^0-9]/g, '');
      if (pasteData.length >= 6) {
        for (let i = 0; i < 6; i++) {
          if (boxes[i]) boxes[i].value = pasteData[i] || '';
        }
        if (boxes[5]) boxes[5].focus();
      }
    };
  });

  if (boxes[0]) {
    setTimeout(() => {
      boxes[0].focus();
    }, 150);
  }
}

// Start / Restart 60-Second OTP Countdown Timer
function startOtpTimer(durationSeconds = 60) {
  if (otpTimerInterval) clearInterval(otpTimerInterval);

  let remaining = durationSeconds;
  const timerCountEl = $('#otp-timer-count');
  const resendBtn = $('#otp-resend-btn');

  if (resendBtn) resendBtn.disabled = true;
  if (timerCountEl) timerCountEl.textContent = remaining;

  otpTimerInterval = setInterval(() => {
    remaining -= 1;
    if (timerCountEl) timerCountEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(otpTimerInterval);
      otpTimerInterval = null;
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.innerHTML = `Resend Code Now`;
      }
    }
  }, 1000);
}

// User Sign Up & 6-Digit OTP Request Handler
async function handleSignupSubmit(e) {
  if (e) e.preventDefault();

  // Reset error alert
  const errorAlert = $('#signup-error-alert');
  const errorMessage = $('#signup-error-message');
  if (errorAlert) errorAlert.classList.add('hidden');

  const fields = ['name', 'email', 'phone', 'password', 'confirm', 'terms'];
  fields.forEach(f => {
    const errSpan = $(`#signup-${f}-error`);
    if (errSpan) {
      errSpan.textContent = '';
      errSpan.classList.add('hidden');
    }
    const input = $(`#signup-${f === 'confirm' ? 'confirm-password' : f}`);
    if (input) {
      input.classList.remove('border-red-500', 'border-emerald-500');
      input.classList.add('border-slate-700');
    }
  });

  const name = $('#signup-name')?.value.trim() || '';
  const email = $('#signup-email')?.value.trim() || '';
  const phone = $('#signup-phone')?.value.trim() || '';
  const country = $('#signup-country')?.value || 'United States';
  const password = $('#signup-password')?.value || '';
  const confirmPassword = $('#signup-confirm-password')?.value || '';
  const termsAccepted = $('#signup-terms')?.checked || false;
  const role = $('#signup-role')?.value || 'International Traveler';

  const showError = (fieldKey, inputId, msg) => {
    const errSpan = $(`#signup-${fieldKey}-error`);
    if (errSpan) {
      errSpan.textContent = msg;
      errSpan.classList.remove('hidden');
    }
    const input = $(`#${inputId}`);
    if (input) {
      input.classList.remove('border-slate-700');
      input.classList.add('border-red-500');
      input.focus();
    }
    if (errorAlert && errorMessage) {
      errorMessage.textContent = msg;
      errorAlert.classList.remove('hidden');
    }
  };

  // Frontend validations
  if (!name || name.length < 2) {
    showError('name', 'signup-name', 'Please enter your full name (minimum 2 characters).');
    return;
  }

  const emailRegex = /^[\w\.\+\-]+@[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+$/;
  if (!email || !emailRegex.test(email)) {
    showError('email', 'signup-email', 'Please enter a valid email address (e.g. name@domain.com).');
    return;
  }

  const phoneRegex = /^\+?[0-9\s\-\(\)]{7,20}$/;
  const digitsOnly = phone.replace(/\D/g, '');
  if (!phone || !phoneRegex.test(phone) || digitsOnly.length < 7) {
    showError('phone', 'signup-phone', 'Please enter a valid mobile or WhatsApp number (minimum 7 digits).');
    return;
  }

  if (!password || password.length < 8) {
    showError('password', 'signup-password', 'Password must be at least 8 characters long.');
    return;
  }

  if (password !== confirmPassword) {
    showError('confirm', 'signup-confirm-password', 'Passwords do not match. Please verify.');
    return;
  }

  if (!termsAccepted) {
    showError('terms', 'signup-terms', 'Please review and accept the Terms of Service & Privacy Policy.');
    return;
  }

  // Loading state
  const submitBtn = $('#signup-submit-btn');
  const btnText = $('#signup-btn-text');
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Sending Verification Code...';

  try {
    const res = await fetch('/api/auth/register-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name,
        email: email,
        phone: phone,
        country: country,
        password: password,
        confirm_password: confirmPassword,
        terms_accepted: termsAccepted,
        traveler_type: role
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorDetail = data.detail || data.message || 'Registration request failed.';
      showError('email', 'signup-email', errorDetail);
      showToast('Registration Notice', errorDetail, 'error');
      return;
    }

    // Success: store pending email and launch 6-digit OTP verification modal
    state.pendingOtpEmail = email;

    const otpTarget = $('#otp-target-email');
    if (otpTarget) otpTarget.textContent = email;

    closeModal('signup-modal');
    openModal('otp-verify-modal');
    initOtpInputs();
    startOtpTimer(60);

    showToast('Verification Code Dispatched', `A 6-digit verification OTP was sent to ${email}.`, 'success');

  } catch (err) {
    console.error('Registration request error:', err);
    showToast('Connection Error', 'Could not reach server. Please try again.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Register';
    lucide.createIcons();
  }
}

// 6-Digit OTP Submission & Account Activation Handler
async function handleOtpSubmit(e) {
  if (e) e.preventDefault();

  const boxes = [
    $('#otp-1')?.value || '',
    $('#otp-2')?.value || '',
    $('#otp-3')?.value || '',
    $('#otp-4')?.value || '',
    $('#otp-5')?.value || '',
    $('#otp-6')?.value || ''
  ];

  const otpCode = boxes.join('').trim();
  const errorAlert = $('#otp-error-alert');
  const errorMessage = $('#otp-error-message');
  if (errorAlert) errorAlert.classList.add('hidden');

  if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
    if (errorAlert && errorMessage) {
      errorMessage.textContent = 'Please enter all 6 digits of the verification code.';
      errorAlert.classList.remove('hidden');
    }
    showToast('Incomplete Code', 'Please enter the full 6-digit verification code.', 'error');
    return;
  }

  const submitBtn = $('#otp-verify-submit-btn');
  const btnText = $('#otp-verify-btn-text');
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: state.pendingOtpEmail,
        otp_code: otpCode
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail || 'Invalid or expired verification code.';
      if (errorAlert && errorMessage) {
        errorMessage.textContent = detail;
        errorAlert.classList.remove('hidden');
      }
      showToast('Verification Failed', detail, 'error');
      return;
    }

    // Success! Account activated & verified
    if (otpTimerInterval) clearInterval(otpTimerInterval);
    closeModal('otp-verify-modal');

    showToast('Account Verified!', `Welcome to BharatConnect AI, ${data.user?.full_name || 'Traveler'}!`, 'success');

    // Unlock session and navigate into platform
    unlockMainApp(data.user, data.session_token);

  } catch (err) {
    console.error('OTP verification error:', err);
    showToast('Connection Error', 'Could not verify code with server. Please try again.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Verify & Activate Account';
    lucide.createIcons();
  }
}

// Resend OTP Code Handler
async function handleResendOtp() {
  if (!state.pendingOtpEmail) {
    showToast('Notice', 'No pending registration email found. Please register again.', 'info');
    closeModal('otp-verify-modal');
    openModal('signup-modal');
    return;
  }

  try {
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: state.pendingOtpEmail,
        purpose: 'registration'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('Resend Error', data.detail || 'Could not resend OTP.', 'error');
      return;
    }

    startOtpTimer(60);
    initOtpInputs();
    showToast('New Code Sent!', `A fresh 6-digit OTP has been dispatched to ${state.pendingOtpEmail}.`, 'success');

  } catch (err) {
    showToast('Error', 'Failed to resend code. Please check connection.', 'error');
  }
}

// Forgot Password Flow Handlers
async function handleForgotPasswordRequest(e) {
  if (e) e.preventDefault();

  const email = $('#forgot-email')?.value.trim();
  if (!email) {
    showToast('Notice', 'Please enter your registered email address.', 'info');
    return;
  }

  const sendBtn = $('#forgot-send-btn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending 6-Digit Code...';
  }

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('Reset Error', data.detail || 'Could not send reset code.', 'error');
      return;
    }

    state.pendingResetEmail = email;
    $('#forgot-step-1-form')?.classList.add('hidden');
    $('#forgot-step-2-form')?.classList.remove('hidden');
    showToast('Reset Code Sent', `Enter the 6-digit code sent to ${email} to set a new password.`, 'success');

  } catch (err) {
    showToast('Error', 'Connection error. Please try again.', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send 6-Digit Reset Code';
    }
  }
}

async function handleResetPasswordSubmit(e) {
  if (e) e.preventDefault();

  const email = state.pendingResetEmail || $('#forgot-email')?.value.trim();
  const otpCode = $('#reset-code')?.value.trim();
  const newPassword = $('#reset-new-password')?.value || '';

  if (!email || !otpCode || !newPassword) {
    showToast('Notice', 'Please fill in all reset fields.', 'info');
    return;
  }

  if (newPassword.length < 8) {
    showToast('Weak Password', 'New password must be at least 8 characters.', 'error');
    return;
  }

  const confirmBtn = $('#forgot-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Updating Password...';
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        otp_code: otpCode,
        new_password: newPassword,
        confirm_password: newPassword
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('Reset Failed', data.detail || 'Could not reset password.', 'error');
      return;
    }

    closeModal('forgot-password-modal');
    $('#forgot-step-1-form')?.classList.remove('hidden');
    $('#forgot-step-2-form')?.classList.add('hidden');
    $('#forgot-password-modal form')?.reset();

    showToast('Password Updated!', 'Your password has been reset successfully. Please sign in.', 'success');
    openModal('signin-modal');

  } catch (err) {
    showToast('Error', 'Connection error. Please try again.', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Reset Password & Sign In';
    }
  }
}

// ========================================================
// Traveler Profile & Account Settings Management
// ========================================================

function openUserProfileModal() {
  if (!state.isAuthenticated) {
    openModal('signin-modal');
    return;
  }

  const u = state.currentUser || {};
  const fullName = u.full_name || u.name || 'Traveler';

  if ($('#profile-name')) $('#profile-name').value = fullName;
  if ($('#profile-country')) $('#profile-country').value = u.country || u.origin_country || 'United States';
  if ($('#profile-phone')) $('#profile-phone').value = u.phone || '';
  if ($('#profile-style')) $('#profile-style').value = u.traveler_type || 'Cultural Immersion';
  if ($('#profile-em-name')) $('#profile-em-name').value = u.emergency_contact_name || '';
  if ($('#profile-em-phone')) $('#profile-em-phone').value = u.emergency_contact_phone || '';
  if ($('#profile-bio')) $('#profile-bio').value = u.bio || '';

  if ($('#profile-display-name')) $('#profile-display-name').textContent = fullName;
  if ($('#profile-display-email')) $('#profile-display-email').textContent = u.email || 'user@example.com';

  const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'TR';
  if ($('#profile-avatar-initials')) $('#profile-avatar-initials').textContent = initials;

  openModal('profile-modal');
  lucide.createIcons();
}

async function handleProfileUpdateSubmit(e) {
  if (e) e.preventDefault();

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  const name = $('#profile-name')?.value.trim() || '';
  const country = $('#profile-country')?.value.trim() || '';
  const phone = $('#profile-phone')?.value.trim() || '';
  const style = $('#profile-style')?.value || '';
  const emName = $('#profile-em-name')?.value.trim() || '';
  const emPhone = $('#profile-em-phone')?.value.trim() || '';
  const bio = $('#profile-bio')?.value.trim() || '';

  const saveBtn = $('#profile-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await fetch(`/api/user/profile?token=${encodeURIComponent(token || '')}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        full_name: name,
        country: country,
        phone: phone,
        traveler_type: style,
        emergency_contact_name: emName,
        emergency_contact_phone: emPhone,
        bio: bio
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('Profile Error', data.detail || 'Could not update profile.', 'error');
      return;
    }

    state.currentUser = Object.assign({}, state.currentUser, data.user || {});
    sessionStorage.setItem('bc_current_user', JSON.stringify(state.currentUser));

    const firstName = (name || 'Traveler').split(' ')[0];
    const navName = $('#nav-user-name');
    if (navName) navName.textContent = firstName;

    closeModal('profile-modal');
    renderProfileView();
    showToast('Profile Updated!', 'Your traveler details and emergency contacts were saved.', 'success');

  } catch (err) {
    showToast('Error', 'Failed to save profile. Please try again.', 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function openUserSettingsModal() {
  if (!state.isAuthenticated) {
    openModal('signin-modal');
    return;
  }

  const u = state.currentUser || {};
  const settings = u.settings || {};

  if ($('#settings-notif-trip')) $('#settings-notif-trip').checked = settings.notif_trip !== false;
  if ($('#settings-notif-guide')) $('#settings-notif-guide').checked = settings.notif_guide !== false;
  if ($('#settings-notif-platform')) $('#settings-notif-platform').checked = settings.notif_platform !== false;
  if ($('#settings-currency')) $('#settings-currency').value = settings.preferred_currency || state.currency || 'USD';

  openModal('settings-modal');
  lucide.createIcons();
}

async function handleSettingsUpdateSubmit(e) {
  if (e) e.preventDefault();

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  const notifTrip = $('#settings-notif-trip')?.checked ?? true;
  const notifGuide = $('#settings-notif-guide')?.checked ?? true;
  const notifPlatform = $('#settings-notif-platform')?.checked ?? true;
  const preferredCurrency = $('#settings-currency')?.value || 'USD';

  try {
    const res = await fetch(`/api/user/settings?token=${encodeURIComponent(token || '')}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        notif_trip: notifTrip,
        notif_guide: notifGuide,
        notif_platform: notifPlatform,
        preferred_currency: preferredCurrency
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('Settings Error', data.detail || 'Could not update settings.', 'error');
      return;
    }

    if (preferredCurrency !== state.currency) {
      setCurrency(preferredCurrency);
    }

    closeModal('settings-modal');
    showToast('Preferences Saved!', 'Your notification and currency preferences are active.', 'success');

  } catch (err) {
    showToast('Error', 'Failed to save settings.', 'error');
  }
}

async function handleChangePasswordSubmit(e) {
  if (e) e.preventDefault();

  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  const currentPassword = $('#change-curr-pwd')?.value || '';
  const newPassword = $('#change-new-pwd')?.value || '';

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    showToast('Invalid Password', 'New password must be at least 8 characters.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/user/change-password?token=${encodeURIComponent(token || '')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('Password Change Failed', data.detail || 'Incorrect current password.', 'error');
      return;
    }

    $('#change-pwd-form')?.reset();
    closeModal('settings-modal');
    showToast('Password Changed!', 'Your password has been securely updated.', 'success');

  } catch (err) {
    showToast('Error', 'Failed to change password.', 'error');
  }
}

// ========================================================
// AI Travel Companion & Concierge Support
// ========================================================

function toggleCompanionDrawer() {
  const drawer = $('#companion-drawer');
  if (drawer) {
    drawer.classList.toggle('hidden');
    lucide.createIcons();
    if (!drawer.classList.contains('hidden')) {
      setTimeout(() => $('#companion-input')?.focus(), 150);
    }
  }
}

function sendCompanionQuick(question) {
  const input = $('#companion-input');
  if (input) {
    input.value = question;
    handleCompanionSubmit();
  }
}

async function handleCompanionSubmit(e) {
  if (e) e.preventDefault();

  const input = $('#companion-input');
  const query = input?.value.trim();
  if (!query) return;

  const container = $('#companion-messages');
  if (!container) return;

  // Append user message
  const userMsg = document.createElement('div');
  userMsg.className = 'p-3 rounded-2xl bg-gold-500/20 text-gold-200 border border-gold-500/30 text-right ml-8';
  userMsg.textContent = query;
  container.appendChild(userMsg);

  input.value = '';

  // Append AI loading bubble
  const aiMsg = document.createElement('div');
  aiMsg.className = 'p-3 rounded-2xl bg-slate-900/90 text-slate-200 border border-slate-800 mr-8 flex items-center gap-2';
  aiMsg.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin text-gold-400"></i><span class="text-xs text-slate-400">AI Companion is thinking...</span>`;
  container.appendChild(aiMsg);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();

  try {
    // Generate context-aware response
    await new Promise(r => setTimeout(r, 600));

    let reply = '';
    const qLower = query.toLowerCase();

    // Context-aware confirmed trip resolution
    const confirmedTrip = (state.userTrips || []).find(t => t.confirmation_status === 'confirmed' || t.status === 'confirmed') || state.activeItinerary;
    const tripName = confirmedTrip ? (confirmedTrip.name || confirmedTrip.title || confirmedTrip.destination) : null;
    const guideName = confirmedTrip?.assigned_guide?.name || confirmedTrip?.matched_guides?.[0]?.name;
    const tripDest = confirmedTrip?.destination || confirmedTrip?.route || 'India';
    const tripDates = confirmedTrip?.start_date ? ` (${formatTripDateRange(confirmedTrip.start_date, confirmedTrip.end_date)})` : '';

    if (qLower.includes('my trip') || qLower.includes('my plan') || qLower.includes('itinerary') || qLower.includes('my guide') || qLower.includes('schedule') || qLower.includes('booking') || qLower.includes('confirmed')) {
      if (confirmedTrip) {
        reply = `✈️ Your Confirmed Journey: "${tripName}"${tripDates}\n• Route: ${tripDest}\n• Duration: ${confirmedTrip.duration_days || 7} Days (${confirmedTrip.travelers_count || 2} Travelers)\n• Assigned Guide: ${guideName ? `${guideName} (Verified Local Guide)` : 'Assigned upon confirmation'}\n• Daily Flow: ${confirmedTrip.itinerary?.[0]?.title || 'Day 1: Arrival & Heritage Orientation'}\n\nLet me know if you need specific advice for any day of your journey!`;
      } else {
        reply = '✈️ You currently have no confirmed trip selected. Head to the AI Trip Planner or My Plans to select and confirm your custom India journey!';
      }
    } else if (qLower.includes('water')) {
      reply = `💧 Water & Beverage Safety: Always drink sealed bottled water (Bisleri, Kinley, Aquafina) or UV-filtered water provided in your private vehicle${confirmedTrip ? ` across ${tripDest}` : ''}. High-end heritage hotels provide complimentary mineral water.`;
    } else if (qLower.includes('temple') || qLower.includes('dress') || qLower.includes('cloth')) {
      reply = `👗 Cultural Dress Etiquette: Modest, breathable cottons and linens covering shoulders and knees are recommended for all heritage and temple visits${confirmedTrip ? ` along your ${tripDest} route` : ''}. Slip-on footwear is ideal as shoes are removed before entering sanctums.`;
    } else if (qLower.includes('tip') || qLower.includes('upi') || qLower.includes('payment') || qLower.includes('money') || qLower.includes('card')) {
      reply = '💳 Payments & Currency: International credit cards are accepted at all fine-dining restaurants and hotels. For local street markets and artisan bazaars, carry ₹2,000–₹5,000 in cash notes. Standard restaurant tipping is 7–10%.';
    } else if (qLower.includes('emergency') || qLower.includes('safety') || qLower.includes('police') || qLower.includes('help')) {
      reply = `🚨 Emergency & Concierge: Dial 1363 (24/7 Ministry of Tourism Multi-lingual Infoline) or 112 (All-India Emergency).${guideName ? ` You can also reach your assigned guide ${guideName} or our 24/7 on-ground concierge directly.` : ' Our 24/7 support ombudsman is also reachable via in-app Emergency Report.'}`;
    } else if (qLower.includes('food') || qLower.includes('dish') || qLower.includes('eat') || qLower.includes('restaurant')) {
      reply = `🍛 Culinary Recommendations: Sample regional thalis, tandoori specialties, and fresh flatbreads. In Delhi/Rajasthan try Dal Baati Churma and Butter Chicken; in the South try Appam and Kerala Fish Curry. Always ask for "mild spice" if preferred.`;
    } else {
      if (confirmedTrip) {
        reply = `✨ Travel Concierge Tip for "${tripName}"${tripDates}: Your journey across ${tripDest} is fully scheduled with verified accommodations and dedicated local guidance${guideName ? ` (${guideName})` : ''}. Ask me about day-by-day schedules, local etiquette, currency, or dining!`;
      } else {
        reply = `✨ Travel Tip: BharatConnect AI pairs you with certified local guides for all destinations. Keep your itinerary offline, carry a power bank (Type D/C/M plugs), and stay hydrated. Let me know if you need specific advice for your current route!`;
      }
    }

    aiMsg.innerHTML = escapeHtml(reply);
    container.scrollTop = container.scrollHeight;

  } catch (err) {
    aiMsg.textContent = "I'm available to answer your India travel questions anytime!";
  }
}

function openPlanChoiceModal() {
  openModal('plan-choice-modal');
}

function openSupportDrawer() {
  openModal('support-drawer');
}

// Global exposes
window.initOtpInputs = initOtpInputs;
window.handleOtpSubmit = handleOtpSubmit;
window.handleResendOtp = handleResendOtp;
window.handleForgotPasswordRequest = handleForgotPasswordRequest;
window.handleResetPasswordSubmit = handleResetPasswordSubmit;
window.openUserProfileModal = openUserProfileModal;
window.handleProfileUpdateSubmit = handleProfileUpdateSubmit;
window.openUserSettingsModal = openUserSettingsModal;
window.handleSettingsUpdateSubmit = handleSettingsUpdateSubmit;
window.handleChangePasswordSubmit = handleChangePasswordSubmit;
window.toggleCompanionDrawer = toggleCompanionDrawer;
window.sendCompanionQuick = sendCompanionQuick;
window.handleCompanionSubmit = handleCompanionSubmit;
window.openPlanChoiceModal = openPlanChoiceModal;
window.openSupportDrawer = openSupportDrawer;


// Safety & Incident Report Handler
async function handleReportSubmit(e) {
  e.preventDefault();
  const name = $('#report-name')?.value || '';
  const email = $('#report-email')?.value || '';
  const category = $('#report-category')?.value || 'General Inquiry';
  const desc = $('#report-description')?.value || '';
  const urgent = $('#report-urgent')?.checked || false;

  try {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporter_name: name,
        email: email,
        category: category,
        description: desc,
        urgent_callback: urgent
      })
    });
    const data = await res.json();
    closeModal('report-modal');
    $('#report-form')?.reset();
    showToast(
      'Report Submitted',
      data.message || 'Ticket recorded. Our bilingual traveler safety ombudsman will respond within 2 hours.',
      'success'
    );
  } catch (err) {
    closeModal('report-modal');
    showToast('Report Logged', 'Your report has been dispatched to our safety ombudsman.', 'info');
  }
}

// Join Traveler Community Circle Handler
function handleJoinCommunitySubmit(e) {
  e.preventDefault();
  const name = $('#community-name')?.value || 'Traveler';
  const circle = $('#community-circle')?.value || 'Traveler Circle';
  closeModal('join-community-modal');
  $('#join-community-form')?.reset();
  showToast('Welcome to the Circle!', `You have joined the "${circle}". Welcome to the community, ${name}!`, 'success');
}

function sharePost(title) {
  navigator.clipboard.writeText(window.location.href);
  showToast('Link Copied', `Copied link to discussion: "${title}"`);
}

// =======================================================
// Step 1C: Authentication, Session & Access Control Engine
// =======================================================

// =======================================================
// =======================================================
// Step 4: Cinematic 3D WebGL World Journey & Final Arrival Engine
// =======================================================

const COUNTRY_COORDINATES = {
  "india": { lat: 21.0, lng: 78.0, name: "India", code: "IN" },
  "japan": { lat: 36.2, lng: 138.2, name: "Japan", code: "JP" },
  "france": { lat: 46.6, lng: 2.2, name: "France", code: "FR" },
  "germany": { lat: 51.1, lng: 10.4, name: "Germany", code: "DE" },
  "united states": { lat: 39.8, lng: -98.5, name: "United States", code: "US" },
  "usa": { lat: 39.8, lng: -98.5, name: "United States", code: "US" },
  "united kingdom": { lat: 54.0, lng: -2.0, name: "United Kingdom", code: "GB" },
  "uk": { lat: 54.0, lng: -2.0, name: "United Kingdom", code: "GB" },
  "canada": { lat: 56.1, lng: -106.3, name: "Canada", code: "CA" },
  "australia": { lat: -25.2, lng: 133.7, name: "Australia", code: "AU" },
  "italy": { lat: 42.5, lng: 12.5, name: "Italy", code: "IT" },
  "spain": { lat: 40.4, lng: -3.7, name: "Spain", code: "ES" },
  "singapore": { lat: 1.35, lng: 103.8, name: "Singapore", code: "SG" },
  "united arab emirates": { lat: 23.4, lng: 53.8, name: "United Arab Emirates", code: "AE" },
  "uae": { lat: 23.4, lng: 53.8, name: "United Arab Emirates", code: "AE" },
  "brazil": { lat: -14.2, lng: -51.9, name: "Brazil", code: "BR" },
  "south africa": { lat: -30.5, lng: 22.9, name: "South Africa", code: "ZA" }
};

function resolveCountryCoords(countryName) {
  if (!countryName) return COUNTRY_COORDINATES["japan"];
  const key = countryName.toLowerCase().trim();
  if (COUNTRY_COORDINATES[key]) return COUNTRY_COORDINATES[key];
  for (const k in COUNTRY_COORDINATES) {
    if (key.includes(k) || k.includes(key)) {
      return COUNTRY_COORDINATES[k];
    }
  }
  // Safe geographic default
  return COUNTRY_COORDINATES["japan"];
}

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// -------------------------------------------------------
// 3D Realistic Earth Texture Generator (Procedural WebGL)
// -------------------------------------------------------
function createRealisticEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep Blue Oceanic Space Background
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGrad.addColorStop(0, '#040d1c');
  oceanGrad.addColorStop(0.3, '#071836');
  oceanGrad.addColorStop(0.7, '#09214a');
  oceanGrad.addColorStop(1, '#040e21');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft Bathymetric Continental Shelves & Coastal Glow
  ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
  ctx.filter = 'blur(8px)';
  drawWorldContinentsPath(ctx, canvas.width, canvas.height, 1.05);
  ctx.filter = 'none';

  // Realistic Bluish-Green Landmasses
  const landGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  landGrad.addColorStop(0, '#064e3b');
  landGrad.addColorStop(0.3, '#047857');
  landGrad.addColorStop(0.6, '#0f766e');
  landGrad.addColorStop(1, '#10b981');
  ctx.fillStyle = landGrad;
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  drawWorldContinentsPath(ctx, canvas.width, canvas.height, 1.0);

  // Night City Lights Clustered on Populated Continents
  ctx.fillStyle = '#fef08a';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 4;
  drawCityLights(ctx, canvas.width, canvas.height);
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function drawWorldContinentsPath(ctx, w, h, scale) {
  // Equirectangular projection coordinates (X: -180 to 180 -> 0 to w, Y: 90 to -90 -> 0 to h)
  const mapX = (lng) => ((lng + 180) / 360) * w;
  const mapY = (lat) => ((90 - lat) / 180) * h;

  ctx.beginPath();
  // North America
  ctx.moveTo(mapX(-165), mapY(65));
  ctx.bezierCurveTo(mapX(-140), mapY(70), mapX(-80), mapY(70), mapX(-60), mapY(55));
  ctx.bezierCurveTo(mapX(-70), mapY(35), mapX(-80), mapY(25), mapX(-95), mapY(20));
  ctx.bezierCurveTo(mapX(-105), mapY(15), mapX(-120), mapY(30), mapX(-125), mapY(45));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // South America
  ctx.beginPath();
  ctx.moveTo(mapX(-80), mapY(10));
  ctx.bezierCurveTo(mapX(-50), mapY(5), mapX(-35), mapY(-5), mapX(-40), mapY(-25));
  ctx.bezierCurveTo(mapX(-55), mapY(-45), mapX(-65), mapY(-55), mapX(-75), mapY(-50));
  ctx.bezierCurveTo(mapX(-75), mapY(-30), mapX(-80), mapY(-10), mapX(-80), mapY(10));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Europe & Western Asia
  ctx.beginPath();
  ctx.moveTo(mapX(-10), mapY(60));
  ctx.bezierCurveTo(mapX(15), mapY(65), mapX(40), mapY(68), mapX(60), mapY(60));
  ctx.bezierCurveTo(mapX(45), mapY(45), mapX(30), mapY(35), mapX(10), mapY(36));
  ctx.bezierCurveTo(mapX(-5), mapY(36), mapX(-10), mapY(45), mapX(-10), mapY(60));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Africa
  ctx.beginPath();
  ctx.moveTo(mapX(-15), mapY(35));
  ctx.bezierCurveTo(mapX(20), mapY(35), mapX(45), mapY(30), mapX(50), mapY(12));
  ctx.bezierCurveTo(mapX(45), mapY(-5), mapX(35), mapY(-35), mapX(20), mapY(-35));
  ctx.bezierCurveTo(mapX(10), mapY(-20), mapX(0), mapY(5), mapX(-15), mapY(15));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Asia & Siberia
  ctx.beginPath();
  ctx.moveTo(mapX(60), mapY(60));
  ctx.bezierCurveTo(mapX(100), mapY(72), mapX(160), mapY(70), mapX(170), mapY(60));
  ctx.bezierCurveTo(mapX(145), mapY(40), mapX(120), mapY(30), mapX(105), mapY(20));
  ctx.bezierCurveTo(mapX(85), mapY(25), mapX(70), mapY(35), mapX(60), mapY(60));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Distinct Indian Subcontinent (Peninsula triangular focus)
  ctx.beginPath();
  ctx.moveTo(mapX(68), mapY(32));
  ctx.bezierCurveTo(mapX(75), mapY(36), mapX(88), mapY(34), mapX(92), mapY(26));
  ctx.bezierCurveTo(mapX(88), mapY(20), mapX(82), mapY(14), mapX(78), mapY(8));
  ctx.bezierCurveTo(mapX(75), mapY(12), mapX(72), mapY(18), mapX(68), mapY(24));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Japan (Curved Archipelago)
  ctx.beginPath();
  ctx.moveTo(mapX(130), mapY(32));
  ctx.bezierCurveTo(mapX(134), mapY(34), mapX(138), mapY(37), mapX(142), mapY(43));
  ctx.bezierCurveTo(mapX(143), mapY(45), mapX(145), mapY(44), mapX(141), mapY(40));
  ctx.bezierCurveTo(mapX(137), mapY(35), mapX(133), mapY(31), mapX(130), mapY(32));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Australia
  ctx.beginPath();
  ctx.moveTo(mapX(115), mapY(-20));
  ctx.bezierCurveTo(mapX(135), mapY(-12), mapX(150), mapY(-22), mapX(152), mapY(-36));
  ctx.bezierCurveTo(mapX(140), mapY(-40), mapX(125), mapY(-38), mapX(114), mapY(-32));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // United Kingdom & Ireland
  ctx.beginPath();
  ctx.arc(mapX(-3), mapY(54), 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawCityLights(ctx, w, h) {
  const mapX = (lng) => ((lng + 180) / 360) * w;
  const mapY = (lat) => ((90 - lat) / 180) * h;

  const lightClusters = [
    // India (New Delhi, Mumbai, Bengaluru, Kolkata, Chennai)
    { lat: 28.6, lng: 77.2, r: 6 }, { lat: 19.0, lng: 72.8, r: 7 }, { lat: 12.9, lng: 77.5, r: 5 },
    { lat: 22.5, lng: 88.3, r: 5 }, { lat: 13.0, lng: 80.2, r: 4 }, { lat: 26.8, lng: 80.9, r: 4 },
    // Japan (Tokyo, Osaka, Nagoya)
    { lat: 35.6, lng: 139.6, r: 8 }, { lat: 34.6, lng: 135.5, r: 6 }, { lat: 35.1, lng: 136.9, r: 5 },
    // Europe (London, Paris, Berlin, Rome, Madrid)
    { lat: 51.5, lng: -0.1, r: 8 }, { lat: 48.8, lng: 2.3, r: 7 }, { lat: 52.5, lng: 13.4, r: 6 },
    { lat: 41.9, lng: 12.5, r: 5 }, { lat: 40.4, lng: -3.7, r: 5 },
    // US & Americas (NYC, LA, Chicago, Toronto, SF)
    { lat: 40.7, lng: -74.0, r: 9 }, { lat: 34.0, lng: -118.2, r: 8 }, { lat: 41.8, lng: -87.6, r: 6 },
    { lat: 37.7, lng: -122.4, r: 6 }, { lat: 43.6, lng: -79.3, r: 6 },
    // Middle East & SE Asia (Dubai, Singapore, Sydney)
    { lat: 25.2, lng: 55.3, r: 6 }, { lat: 1.35, lng: 103.8, r: 6 }, { lat: -33.8, lng: 151.2, r: 6 }
  ];

  lightClusters.forEach(pt => {
    const x = mapX(pt.lng);
    const y = mapY(pt.lat);
    ctx.beginPath();
    ctx.arc(x, y, pt.r, 0, Math.PI * 2);
    ctx.fill();

    // Secondary dispersed micro lights
    for (let i = 0; i < 4; i++) {
      const offsetX = (Math.random() - 0.5) * pt.r * 3;
      const offsetY = (Math.random() - 0.5) * pt.r * 3;
      ctx.beginPath();
      ctx.arc(x + offsetX, y + offsetY, Math.random() * 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// -------------------------------------------------------
// 3D Procedural Airplane Model
// -------------------------------------------------------
function createAirplaneModel() {
  const plane = new THREE.Group();

  // 1. Sleek Fuselage
  const bodyGeo = new THREE.CylinderGeometry(0.7, 1.4, 13, 16);
  bodyGeo.rotateX(Math.PI / 2);
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.45
  });
  const body = new THREE.Mesh(bodyGeo, whiteMat);
  plane.add(body);

  // Nose Cone
  const noseGeo = new THREE.ConeGeometry(1.4, 4.5, 16);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, whiteMat);
  nose.position.z = 8.75;
  plane.add(nose);

  // Cockpit Tinted Window
  const glassGeo = new THREE.BoxGeometry(1.6, 0.8, 2.2);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 0.9, 6.2);
  plane.add(glass);

  // 2. Swept Main Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 2);
  wingShape.lineTo(11, -4);
  wingShape.lineTo(10.5, -6);
  wingShape.lineTo(0, -2);
  wingShape.closePath();

  const wingExtrude = new THREE.ExtrudeGeometry(wingShape, { depth: 0.35, bevelEnabled: false });
  wingExtrude.rotateX(Math.PI / 2);
  const rightWing = new THREE.Mesh(wingExtrude, whiteMat);
  rightWing.position.set(0, 0, 1.5);
  plane.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  plane.add(leftWing);

  // Wingtips (Cyan navigation light beacons)
  const tipGeo = new THREE.SphereGeometry(0.3, 8, 8);
  const navLightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const rTip = new THREE.Mesh(tipGeo, navLightMat);
  rTip.position.set(11, 0, -3.5);
  plane.add(rTip);
  const lTip = new THREE.Mesh(tipGeo, navLightMat);
  lTip.position.set(-11, 0, -3.5);
  plane.add(lTip);

  // 3. Vertical Tail Fin & Stabilizers
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0, 3.8);
  finShape.lineTo(-2.2, 4.0);
  finShape.lineTo(-3.8, 0);
  finShape.closePath();

  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.25, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);
  const tailFin = new THREE.Mesh(finGeo, new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.2 }));
  tailFin.position.set(0.12, 0.8, -3.5);
  plane.add(tailFin);

  const hStabGeo = new THREE.BoxGeometry(7, 0.25, 2);
  const hStab = new THREE.Mesh(hStabGeo, whiteMat);
  hStab.position.set(0, 0.6, -5.5);
  plane.add(hStab);

  // 4. Twin Jet Engines with Glowing Nozzles
  const engineGeo = new THREE.CylinderGeometry(0.65, 0.65, 3.2, 12);
  engineGeo.rotateX(Math.PI / 2);
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.2 });
  const rEngine = new THREE.Mesh(engineGeo, engineMat);
  rEngine.position.set(3.8, -0.7, 0.5);
  plane.add(rEngine);

  const lEngine = rEngine.clone();
  lEngine.position.x = -3.8;
  plane.add(lEngine);

  // Jet Exhaust Glows
  const exhaustGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const exhaustMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const rExhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  rExhaust.position.set(3.8, -0.7, -1.2);
  plane.add(rExhaust);
  const lExhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  lExhaust.position.set(-3.8, -0.7, -1.2);
  plane.add(lExhaust);

  plane.scale.set(0.65, 0.65, 0.65);
  return plane;
}

// -------------------------------------------------------
// GlobeJourney3D Master Engine Class
// -------------------------------------------------------
class GlobeJourney3D {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.globe = null;
    this.atmosphere = null;
    this.clouds = null;
    this.airplane = null;
    this.routeCore = null;
    this.routeGlow = null;
    this.originPin = null;
    this.indiaPin = null;
    this.starfield = null;
    this.curvePoints = [];
    this.animId = null;
    this.currentProgress = 0;
    this.targetProgress = 0;
    this.originCoords = COUNTRY_COORDINATES["japan"];
    this.indiaCoords = COUNTRY_COORDINATES["india"];
    this.isDomestic = false;
    this.initialized = false;
  }

  init(countryName = "Japan") {
    if (!this.container) return;
    this.originCoords = resolveCountryCoords(countryName);
    this.isDomestic = (this.originCoords.code === "IN");
    if (this.isDomestic) {
      this.originCoords = { lat: 12.97, lng: 77.59, name: "Bengaluru, India", code: "IN" };
      this.indiaCoords = { lat: 28.61, lng: 77.20, name: "New Delhi, India", code: "IN" };
    } else {
      this.indiaCoords = COUNTRY_COORDINATES["india"];
    }

    // Clean any prior canvas
    this.container.innerHTML = '';
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene & Wide Perspective Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);

    // Initial Wide Space Perspective: Entire Globe is Visible!
    this.camera.position.set(0, 45, 340);
    this.camera.lookAt(0, 0, 0);

    // 2. WebGL Renderer
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.container.appendChild(this.renderer.domElement);
    } catch (err) {
      console.warn("WebGL unavailable; defaulting to graceful fallback:", err);
      return false;
    }

    // 3. Deep Space Starfield
    this.createStarfield();

    // 4. Lighting (Sunlight in deep space + ambient + destination point light)
    const ambientLight = new THREE.AmbientLight(0x0a1c38, 1.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(250, 120, 200);
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    rimLight.position.set(-200, -80, -150);
    this.scene.add(rimLight);

    // 5. Realistic 3D Earth Globe
    const globeGeo = new THREE.SphereGeometry(100, 64, 64);
    const earthTexture = createRealisticEarthTexture();
    const globeMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.65,
      metalness: 0.15
    });
    this.globe = new THREE.Mesh(globeGeo, globeMat);
    this.scene.add(this.globe);

    // Atmospheric Blue Glow Shell
    const atmoGeo = new THREE.SphereGeometry(103, 64, 64);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    this.atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    this.scene.add(this.atmosphere);

    // Subtle Cloud Veil
    const cloudGeo = new THREE.SphereGeometry(101.4, 48, 48);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending
    });
    this.clouds = new THREE.Mesh(cloudGeo, cloudMat);
    this.scene.add(this.clouds);

    // 6. Build Great-Circle Light-Blue Flight Trajectory
    this.buildFlightTrajectory();

    // 7. 3D Airplane Model
    this.airplane = createAirplaneModel();
    this.scene.add(this.airplane);

    // 8. Surface Location Pins
    this.createSurfacePins();

    // 9. Position Initially (Stationary at progress 0%)
    this.currentProgress = 0;
    this.targetProgress = 0;
    this.updatePosition(0);

    // Resize listener
    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.initialized = true;
    this.startLoop();
    return true;
  }

  createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 800;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 1400;
      positions[i + 1] = (Math.random() - 0.5) * 1400;
      positions[i + 2] = (Math.random() - 0.5) * 1400;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xc7d2fe, size: 1.5, transparent: true, opacity: 0.7 });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfield);
  }

  buildFlightTrajectory() {
    const startVec = latLngToVector3(this.originCoords.lat, this.originCoords.lng, 100);
    const endVec = latLngToVector3(this.indiaCoords.lat, this.indiaCoords.lng, 100);

    this.curvePoints = [];
    const N = 120;
    const omega = startVec.angleTo(endVec);
    const sinOmega = Math.sin(omega);

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let pt;
      if (sinOmega < 0.0001) {
        pt = startVec.clone().lerp(endVec, t);
      } else {
        const a = Math.sin((1 - t) * omega) / sinOmega;
        const b = Math.sin(t * omega) / sinOmega;
        pt = startVec.clone().multiplyScalar(a).add(endVec.clone().multiplyScalar(b));
      }
      // Altitude boost curve (peak at midpoint, touches down at ends)
      const altitude = Math.sin(t * Math.PI) * 26;
      pt.normalize().multiplyScalar(100 + altitude);
      this.curvePoints.push(pt);
    }

    // Core Light-Blue Route
    const lineGeo = new THREE.BufferGeometry().setFromPoints(this.curvePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });
    this.routeCore = new THREE.Line(lineGeo, lineMat);
    this.routeCore.geometry.setDrawRange(0, 0); // starts at 0%
    this.scene.add(this.routeCore);

    // Glowing Light-Blue Route Tube
    try {
      const curve = new THREE.CatmullRomCurve3(this.curvePoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 100, 1.3, 8, false);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending
      });
      this.routeGlow = new THREE.Mesh(tubeGeo, glowMat);
      this.routeGlow.geometry.setDrawRange(0, 0);
      this.scene.add(this.routeGlow);
    } catch (e) { }
  }

  createSurfacePins() {
    const startVec = latLngToVector3(this.originCoords.lat, this.originCoords.lng, 100.5);
    const endVec = latLngToVector3(this.indiaCoords.lat, this.indiaCoords.lng, 100.5);

    // Origin Beacon (Cyan)
    const originPinGeo = new THREE.RingGeometry(1.5, 4.0, 24);
    const originPinMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
    this.originPin = new THREE.Mesh(originPinGeo, originPinMat);
    this.originPin.position.copy(startVec);
    this.originPin.lookAt(startVec.clone().multiplyScalar(2));
    this.scene.add(this.originPin);

    // India Beacon (Gold / Amber)
    const indiaPinGeo = new THREE.RingGeometry(2.0, 5.5, 24);
    const indiaPinMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
    this.indiaPin = new THREE.Mesh(indiaPinGeo, indiaPinMat);
    this.indiaPin.position.copy(endVec);
    this.indiaPin.lookAt(endVec.clone().multiplyScalar(2));
    this.scene.add(this.indiaPin);
  }

  updatePosition(progress) {
    if (!this.curvePoints.length) return;
    const N = this.curvePoints.length - 1;
    const floatIdx = Math.max(0, Math.min(N, progress * N));
    const idx = Math.min(Math.floor(floatIdx), N - 1);
    const frac = floatIdx - idx;

    const p1 = this.curvePoints[idx];
    const p2 = this.curvePoints[Math.min(idx + 1, N)];
    const curPos = p1.clone().lerp(p2, frac);

    // 1. Move Airplane
    if (this.airplane) {
      this.airplane.position.copy(curPos);

      // Natural 3D Orientation
      const forward = p2.clone().sub(p1).normalize();
      const up = curPos.clone().normalize();
      const right = new THREE.Vector3().crossVectors(forward, up).normalize();
      const correctedUp = new THREE.Vector3().crossVectors(right, forward).normalize();

      const rotMatrix = new THREE.Matrix4().makeBasis(right, correctedUp, forward.negate());
      this.airplane.quaternion.setFromRotationMatrix(rotMatrix);
    }

    // 2. Progressively Illuminate Glowing Light-Blue Path
    const visiblePoints = Math.max(0, Math.min(N + 1, Math.round(progress * (N + 1))));
    if (this.routeCore) {
      this.routeCore.geometry.setDrawRange(0, visiblePoints);
    }
    if (this.routeGlow) {
      // TubeGeometry draws 6 indices per segment
      this.routeGlow.geometry.setDrawRange(0, Math.round(progress * 100 * 6 * 8));
    }

    // 3. Smooth Cinematic Camera Interpolation
    // Wide space view (progress 0) -> Mid-flight tracking (progress 0.5) -> Focused India view (progress 1.0)
    const startVec = this.curvePoints[0];
    const endVec = this.curvePoints[N];
    const midVec = this.curvePoints[Math.round(N / 2)];

    let targetCamPos;
    let targetLookAt;

    if (progress <= 0.01) {
      // WIDE CINEMATIC SPACE VIEW — Entire Globe Visible
      const midDirection = startVec.clone().add(endVec).normalize();
      targetCamPos = midDirection.clone().multiplyScalar(345).add(new THREE.Vector3(0, 35, 0));
      targetLookAt = new THREE.Vector3(0, 0, 0);
    } else if (progress < 0.70) {
      // Transcontinental cruise tracking
      const t = progress / 0.70;
      const camOrbit = curPos.clone().normalize();
      targetCamPos = camOrbit.clone().multiplyScalar(285).add(new THREE.Vector3(0, 25, 0));
      targetLookAt = curPos.clone().lerp(new THREE.Vector3(0, 0, 0), 0.4);
    } else {
      // Approach & Touchdown into India
      const t = (progress - 0.70) / 0.30;
      const indiaFocus = endVec.clone().normalize();
      targetCamPos = indiaFocus.clone().multiplyScalar(215).add(new THREE.Vector3(0, 20, 0));
      targetLookAt = endVec.clone();
    }

    // Smooth Lerp Camera
    this.camera.position.lerp(targetCamPos, 0.08);
    this.camera.lookAt(targetLookAt);

    // Project 3D Billboard Screen Badges
    this.updateScreenBadges();
  }

  updateScreenBadges() {
    if (!this.container || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    const projectPin = (pinMesh, badgeEl) => {
      if (!pinMesh || !badgeEl) return;
      const worldPos = pinMesh.position.clone();
      const screenPos = worldPos.clone().project(this.camera);

      // Check if facing the camera
      const camDir = this.camera.position.clone().sub(worldPos).normalize();
      const normal = worldPos.clone().normalize();
      const dot = normal.dot(camDir);

      if (screenPos.z < 1.0 && dot > 0.05) {
        const x = (screenPos.x * 0.5 + 0.5) * width;
        const y = (-screenPos.y * 0.5 + 0.5) * height;
        badgeEl.style.transform = `translate(${x}px, ${y}px)`;
        badgeEl.classList.remove('hidden');
        badgeEl.style.opacity = Math.min(1, dot * 2);
      } else {
        badgeEl.classList.add('hidden');
      }
    };

    projectPin(this.originPin, document.getElementById('marker-origin-badge'));
    projectPin(this.indiaPin, document.getElementById('marker-destination-badge'));
  }

  startLoop() {
    if (this.animId) cancelAnimationFrame(this.animId);

    const render = () => {
      if (!flightJourneyState.isActive) return;

      // Smooth Lerp Interpolation
      const diff = this.targetProgress - this.currentProgress;
      if (Math.abs(diff) > 0.0001) {
        this.currentProgress += diff * 0.08;
      } else {
        this.currentProgress = this.targetProgress;
      }

      this.updatePosition(this.currentProgress);

      // Subtle slow cloud rotation for realism
      if (this.clouds) {
        this.clouds.rotation.y += 0.0004;
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      this.animId = requestAnimationFrame(render);
    };

    this.animId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

let globe3DInstance = null;

// =======================================================
// Flight Journey Controller & Final Arrival State Machine
// =======================================================

const flightJourneyState = {
  isActive: false,
  progress: 0,
  hasArrived: false,
  arrivalTimer: null,
  currentUser: null,
  sessionToken: null,
  isPreview: false,
  originCountry: "Japan"
};

function startFlightJourney(user = null, token = null, isPreview = false) {
  flightJourneyState.isActive = true;
  flightJourneyState.progress = 0;
  flightJourneyState.hasArrived = false;
  flightJourneyState.isPreview = isPreview;
  flightJourneyState.currentUser = user || state.currentUser;
  flightJourneyState.sessionToken = token || state.sessionToken;

  // Resolve country dynamically from user registration
  const userCountry = flightJourneyState.currentUser?.country || "Japan";
  flightJourneyState.originCountry = userCountry;

  if (flightJourneyState.arrivalTimer) {
    clearTimeout(flightJourneyState.arrivalTimer);
    flightJourneyState.arrivalTimer = null;
  }

  // Ensure Main Website is locked and hidden before reaching India
  const mainContent = $('#main-app-content');
  if (mainContent) {
    mainContent.classList.add('hidden');
    mainContent.style.setProperty('display', 'none', 'important');
  }

  // Hide Landing Screen
  const landing = $('#auth-landing-screen');
  if (landing) {
    landing.classList.add('hidden');
    landing.style.setProperty('display', 'none', 'important');
  }

  // Close any open auth modals
  closeModal('signin-modal');
  closeModal('signup-modal');

  // Display Flight Journey Screen
  const journeyScreen = $('#flight-journey-screen');
  if (journeyScreen) {
    journeyScreen.classList.remove('hidden', 'journey-exit');
    journeyScreen.style.setProperty('display', 'block', 'important');
  }

  // Update Dynamic Origin Badges & Subtitles
  const originBadgeCountry = $('#origin-badge-country');
  if (originBadgeCountry) originBadgeCountry.textContent = userCountry;
  const journeyStoryRoute = $('#journey-story-route');
  if (journeyStoryRoute) journeyStoryRoute.textContent = `From ${userCountry} to India`;

  // Reset visual effects
  $('#india-map-highlight')?.classList.remove('india-glow-active');
  $('#india-beacon-ripples')?.classList.add('hidden');
  const arrivalCard = $('#journey-arrival-card');
  if (arrivalCard) {
    arrivalCard.classList.add('hidden');
    arrivalCard.classList.remove('animate-arrival-pop');
  }
  const holdBar = $('#arrival-hold-progress');
  if (holdBar) {
    holdBar.style.transition = 'none';
    holdBar.style.width = '0%';
  }

  // Reset virtual scroll container
  const track = $('#journey-scroll-track');
  if (track) {
    track.scrollTop = 0;
  }

  // Initialize Real 3D WebGL Globe
  const globeContainer = $('#globe-3d-canvas-container');
  if (globeContainer && typeof THREE !== 'undefined') {
    if (!globe3DInstance) {
      globe3DInstance = new GlobeJourney3D(globeContainer);
    }
    globe3DInstance.init(userCountry);
  }

  // Update initial 0% progress (Stationary, No Autoplay)
  updateFlightProgress(0);
  lucide.createIcons();
}

function updateFlightProgress(progress) {
  // Clamp progress between 0 and 1
  progress = Math.max(0, Math.min(1, progress));
  flightJourneyState.progress = progress;

  // Pass progress to 3D Globe Engine
  if (globe3DInstance && globe3DInstance.initialized) {
    globe3DInstance.targetProgress = progress;
  }

  // Synchronize 2D SVG elements for graceful fallback & DOM assertions
  const path = $('#flight-trajectory-path');
  const airplaneWrapper = $('#journey-airplane-wrapper');
  if (path) {
    try {
      const totalLen = (typeof path.getTotalLength === 'function') ? path.getTotalLength() : 1000;
      const currentLen = progress * totalLen;
      path.style.strokeDasharray = totalLen;
      path.style.strokeDashoffset = totalLen - currentLen;

      if (airplaneWrapper && typeof path.getPointAtLength === 'function') {
        const pt = path.getPointAtLength(Math.min(currentLen, totalLen - 0.5));
        const nextPt = path.getPointAtLength(Math.min(currentLen + 2, totalLen));
        const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) * (180 / Math.PI);
        airplaneWrapper.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angle})`);
      }
    } catch (e) {
      if (airplaneWrapper) {
        airplaneWrapper.setAttribute('transform', `translate(${120 + 830 * progress}, ${280 + 150 * progress}) rotate(15)`);
      }
    }
  }

  // Update Telemetry HUD metrics
  const distKm = Math.round(7240 * (1 - progress));
  const distEl = $('#telemetry-distance');
  if (distEl) distEl.textContent = `${distKm.toLocaleString('en-US')} km`;

  const percentEl = $('#telemetry-percent');
  if (percentEl) percentEl.textContent = `${Math.round(progress * 100)}%`;

  const barEl = $('#journey-progress-bar');
  if (barEl) barEl.style.width = `${(progress * 100).toFixed(1)}%`;
  const flightBar = $('#flight-progress-bar');
  if (flightBar) flightBar.style.width = `${(progress * 100).toFixed(1)}%`;

  const altEl = $('#telemetry-altitude');
  if (altEl) {
    if (progress >= 0.99) {
      altEl.textContent = 'Touchdown (0 ft)';
    } else if (progress < 0.7) {
      altEl.textContent = '38,000 ft';
    } else {
      const descAlt = Math.round(38000 * ((1 - progress) / 0.3));
      altEl.textContent = `${descAlt.toLocaleString('en-US')} ft`;
    }
  }

  const stageEl = $('#telemetry-stage');
  const storySubtitle = $('#journey-story-subtitle');
  const userCountry = flightJourneyState.originCountry || "Your Country";

  if (progress < 0.25) {
    if (stageEl) stageEl.textContent = `Departure: ${userCountry}`;
    if (storySubtitle) storySubtitle.innerHTML = `<span class="text-gold-400 font-serif-luxury font-bold">Your journey across the world</span><span class="text-slate-500 text-xs">•</span><span class="text-slate-300 text-xs font-medium">From ${userCountry} to India</span>`;
  } else if (progress < 0.70) {
    if (stageEl) stageEl.textContent = 'Transcontinental Flight (FL380)';
    if (storySubtitle) storySubtitle.innerHTML = `<span class="text-sky-300 font-serif-luxury font-bold">Your journey begins...</span><span class="text-slate-500 text-xs">•</span><span class="text-slate-300 text-xs font-medium">Cruising Stratosphere</span>`;
  } else if (progress < 0.95) {
    if (stageEl) stageEl.textContent = 'Descent over Indian Ocean';
    if (storySubtitle) storySubtitle.innerHTML = `<span class="text-amber-300 font-serif-luxury font-bold">Across the world...</span><span class="text-slate-500 text-xs">•</span><span class="text-slate-300 text-xs font-medium">Approaching Indian Airspace</span>`;
  } else {
    if (stageEl) stageEl.textContent = 'Final Approach & Touchdown: India';
    if (storySubtitle) storySubtitle.innerHTML = `<span class="text-emerald-300 font-serif-luxury font-bold">Almost there...</span><span class="text-slate-500 text-xs">•</span><span class="text-slate-300 text-xs font-medium">Welcome to India 🇮🇳</span>`;
  }

  // Arrival Trigger when user scrolls through 100% and airplane reaches India
  if (progress >= 0.99 && !flightJourneyState.hasArrived) {
    triggerArrivalSequence();
  }
}

function triggerArrivalSequence() {
  if (flightJourneyState.hasArrived) return;
  flightJourneyState.hasArrived = true;

  // 1. Complete the flight animation (airplane reaches India touchdown point)
  if (globe3DInstance) {
    globe3DInstance.targetProgress = 1.0;
  }
  const path = $('#flight-trajectory-path');
  const airplaneWrapper = $('#journey-airplane-wrapper');
  if (path && airplaneWrapper) {
    try {
      const totalLen = (typeof path.getTotalLength === 'function') ? path.getTotalLength() : 1000;
      path.style.strokeDashoffset = '0';
      if (typeof path.getPointAtLength === 'function') {
        const pt = path.getPointAtLength(totalLen);
        const prevPt = path.getPointAtLength(totalLen - 2);
        const angle = Math.atan2(pt.y - prevPt.y, pt.x - prevPt.x) * (180 / Math.PI);
        airplaneWrapper.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angle})`);
      }
    } catch (e) { }
  }

  const stageEl = $('#telemetry-stage');
  if (stageEl) stageEl.textContent = 'Touchdown: New Delhi / Mumbai, India';
  const altEl = $('#telemetry-altitude');
  if (altEl) altEl.textContent = 'Touchdown (0 ft)';
  const distEl = $('#telemetry-distance');
  if (distEl) distEl.textContent = '0 km';
  const percentEl = $('#telemetry-percent');
  if (percentEl) percentEl.textContent = '100%';
  const barEl = $('#journey-progress-bar');
  if (barEl) barEl.style.width = '100%';
  const flightBar = $('#flight-progress-bar');
  if (flightBar) flightBar.style.width = '100%';

  // 2. Highlight India with glowing visual effect and pulsing beacon ripples
  const indiaMap = $('#india-map-highlight');
  if (indiaMap) indiaMap.classList.add('india-glow-active');

  const ripples = $('#india-beacon-ripples');
  if (ripples) ripples.classList.remove('hidden');

  // 3. Show Arrival Card with exact required copy:
  //    "Welcome to India 🇮🇳"
  //    "Your BharatConnect journey begins here."
  //    (or domestic celebratory greeting for Indian travelers)
  const arrivalCard = $('#journey-arrival-card');
  if (arrivalCard) {
    const titleEl = arrivalCard.querySelector('h3');
    const descEl = arrivalCard.querySelector('p');
    if (flightJourneyState.originCountry?.toLowerCase() === 'india') {
      if (titleEl) titleEl.textContent = 'Welcome Home to Bharat 🇮🇳';
      if (descEl) descEl.textContent = 'Explore Your Incredible India with BharatConnect AI.';
    } else {
      if (titleEl) titleEl.textContent = 'Welcome to India 🇮🇳';
      if (descEl) descEl.textContent = 'Your BharatConnect journey begins here.';
    }
    arrivalCard.classList.remove('hidden');
    arrivalCard.classList.add('animate-arrival-pop');
  }

  // 4. Hold this arrival state briefly for approximately 1-2 seconds (1.6s)
  const holdBar = $('#arrival-hold-progress');
  if (holdBar) {
    holdBar.style.transition = 'width 1.6s cubic-bezier(0.25, 1, 0.5, 1)';
    void holdBar.offsetWidth; // force DOM reflow
    holdBar.style.width = '100%';
  }

  // 5. Then automatically transition/open the MAIN BharatConnect AI WEBSITE
  // The user should NOT need to click another button after reaching India.
  flightJourneyState.arrivalTimer = setTimeout(() => {
    transitionToMainApp(false);
  }, 1600);
}

function skipFlightJourney() {
  if (flightJourneyState.arrivalTimer) {
    clearTimeout(flightJourneyState.arrivalTimer);
    flightJourneyState.arrivalTimer = null;
  }
  transitionToMainApp(true);
}

function transitionToMainApp(isSkipped = false) {
  flightJourneyState.isActive = false;

  // Stop 3D WebGL loop
  if (globe3DInstance) {
    globe3DInstance.stop();
  }

  // Mark flight journey as completed in this session
  sessionStorage.setItem('bc_journey_completed', 'true');

  // Smooth cinematic exit transition
  const journeyScreen = $('#flight-journey-screen');
  if (journeyScreen) {
    journeyScreen.classList.add('journey-exit');
    setTimeout(() => {
      journeyScreen.classList.add('hidden');
      journeyScreen.style.setProperty('display', 'none', 'important');
      journeyScreen.classList.remove('journey-exit');
    }, 650);
  }

  // Open the MAIN BharatConnect AI WEBSITE
  const mainContent = $('#main-app-content');
  if (mainContent) {
    mainContent.classList.remove('hidden');
    mainContent.style.setProperty('display', 'block', 'important');
  }

  // Ensure landing screen is hidden
  const landing = $('#auth-landing-screen');
  if (landing) {
    landing.classList.add('hidden');
    landing.style.setProperty('display', 'none', 'important');
  }

  // Restore or set user auth UI if user exists
  const activeUser = flightJourneyState.currentUser || state.currentUser;
  if (activeUser) {
    state.currentUser = activeUser;
    state.isAuthenticated = true;

    $('#nav-guest-actions')?.classList.add('hidden');
    $('#nav-user-actions')?.classList.remove('hidden');
    $('#mobile-nav-guest-actions')?.classList.add('hidden');
    $('#mobile-nav-user-actions')?.classList.remove('hidden');

    const fullName = activeUser?.full_name || activeUser?.name || activeUser?.email?.split('@')[0] || 'Traveler';
    const firstName = fullName.split(' ')[0];
    const desktopUserName = $('#nav-user-name');
    if (desktopUserName) desktopUserName.textContent = firstName;
    const mobileUserName = $('#mobile-nav-user-name');
    if (mobileUserName) mobileUserName.textContent = fullName;

    loadUserTrips();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  lucide.createIcons();

  if (!isSkipped) {
    showToast('Namaste & Welcome to India! 🇮🇳', 'Your journey with BharatConnect AI has officially begun.', 'success');
  }
}

function setupFlightJourneyListeners() {
  const track = $('#journey-scroll-track');
  if (track) {
    track.addEventListener('scroll', () => {
      if (!flightJourneyState.isActive || flightJourneyState.hasArrived) return;
      const maxScroll = track.scrollHeight - track.clientHeight;
      if (maxScroll <= 0) return;
      const progress = Math.min(1, Math.max(0, track.scrollTop / maxScroll));
      updateFlightProgress(progress);
    });

    // Also support smooth wheel scrolling on the journey screen
    const screen = $('#flight-journey-screen');
    if (screen) {
      screen.addEventListener('wheel', (e) => {
        if (!flightJourneyState.isActive || flightJourneyState.hasArrived) return;
        track.scrollTop += e.deltaY;
      }, { passive: true });
    }
  }

  // Hook up Skip Journey buttons
  $('#skip-journey-btn')?.addEventListener('click', skipFlightJourney);
  $('#skip-journey-floating-btn')?.addEventListener('click', skipFlightJourney);

  // Hook up Landing Screen preview button
  $('#landing-journey-btn')?.addEventListener('click', () => {
    startFlightJourney(null, null, true);
  });
}

// Expose flight journey methods to global window
window.startFlightJourney = startFlightJourney;
window.updateFlightProgress = updateFlightProgress;
window.triggerArrivalSequence = triggerArrivalSequence;
window.skipFlightJourney = skipFlightJourney;
window.transitionToMainApp = transitionToMainApp;
window.flightJourneyState = flightJourneyState;
window.COUNTRY_COORDINATES = COUNTRY_COORDINATES;
window.resolveCountryCoords = resolveCountryCoords;
window.GlobeJourney3D = GlobeJourney3D;

// =======================================================
// Step 1C: Authentication, Session & Access Control Engine
// =======================================================

// Unlock Main Application for Authenticated User
function unlockMainApp(user, token, skipJourney = false) {
  state.isAuthenticated = true;
  state.currentUser = user;
  state.sessionToken = token;

  // Use sessionStorage for temporary browser-session authentication
  if (token) sessionStorage.setItem('bc_session_token', token);
  if (user) sessionStorage.setItem('bc_current_user', JSON.stringify(user));

  // Ensure persistent localStorage does NOT hold session state
  try {
    localStorage.removeItem('bc_session_token');
    localStorage.removeItem('bc_current_user');
  } catch (e) { }

  // Update Navigation Bar States (Desktop & Mobile)
  $('#nav-guest-actions')?.classList.add('hidden');
  $('#nav-user-actions')?.classList.remove('hidden');
  $('#mobile-nav-guest-actions')?.classList.add('hidden');
  $('#mobile-nav-user-actions')?.classList.remove('hidden');

  const fullName = user?.full_name || user?.name || user?.email?.split('@')[0] || 'Traveler';
  const firstName = fullName.split(' ')[0];

  const desktopUserName = $('#nav-user-name');
  if (desktopUserName) desktopUserName.textContent = firstName;

  const mobileUserName = $('#mobile-nav-user-name');
  if (mobileUserName) mobileUserName.textContent = fullName;

  // Close modals
  closeModal('signin-modal');
  closeModal('signup-modal');

  // Load authenticated user's saved trips
  loadUserTrips();

  const journeyAlreadyDone = sessionStorage.getItem('bc_journey_completed') === 'true';

  if (skipJourney || journeyAlreadyDone) {
    // Hide Landing Screen & Unlock Main App Content directly
    const landing = $('#auth-landing-screen');
    if (landing) {
      landing.classList.add('hidden');
      landing.style.setProperty('display', 'none', 'important');
    }

    const mainContent = $('#main-app-content');
    if (mainContent) {
      mainContent.classList.remove('hidden');
      mainContent.style.setProperty('display', 'block', 'important');
    }
  } else {
    // Launch dedicated cinematic 3D Journey experience to India
    const userCountry = user?.country || 'Japan';
    sessionStorage.setItem('bc_user_country', userCountry);
    window.location.href = '/journey.html';
  }

  lucide.createIcons();
}

// Lock Main Application for Unauthenticated Visitors
function lockMainApp() {
  state.isAuthenticated = false;
  state.currentUser = null;
  state.sessionToken = null;
  state.userTrips = [];
  renderUserTrips();

  try {
    sessionStorage.removeItem('bc_session_token');
    sessionStorage.removeItem('bc_current_user');
    sessionStorage.removeItem('bc_journey_completed');
    localStorage.removeItem('bc_session_token');
    localStorage.removeItem('bc_current_user');
  } catch (e) { }

  if (flightJourneyState.arrivalTimer) {
    clearTimeout(flightJourneyState.arrivalTimer);
    flightJourneyState.arrivalTimer = null;
  }
  flightJourneyState.isActive = false;
  flightJourneyState.hasArrived = false;

  const journeyScreen = $('#flight-journey-screen');
  if (journeyScreen) {
    journeyScreen.classList.add('hidden');
    journeyScreen.style.setProperty('display', 'none', 'important');
  }

  // Show Landing Screen & Lock Main App Content
  const landing = $('#auth-landing-screen');
  if (landing) {
    landing.classList.remove('hidden');
    landing.style.setProperty('display', 'flex', 'important');
  }

  const mainContent = $('#main-app-content');
  if (mainContent) {
    mainContent.classList.add('hidden');
    mainContent.style.setProperty('display', 'none', 'important');
  }

  // Update Navigation Bar States (Desktop & Mobile)
  $('#nav-guest-actions')?.classList.remove('hidden');
  $('#nav-user-actions')?.classList.add('hidden');
  $('#mobile-nav-guest-actions')?.classList.remove('hidden');
  $('#mobile-nav-user-actions')?.classList.add('hidden');

  // Close modals
  closeModal('signin-modal');
  closeModal('signup-modal');

  window.scrollTo({ top: 0, behavior: 'instant' });
  lucide.createIcons();
}

// Check Initial Authentication on Page Load
async function checkInitialAuth() {
  // Ensure legacy localStorage keys cannot bypass authentication
  try {
    localStorage.removeItem('bc_session_token');
    localStorage.removeItem('bc_current_user');
  } catch (e) { }

  const token = sessionStorage.getItem('bc_session_token');
  if (!token) {
    lockMainApp();
    return;
  }

  try {
    const res = await fetch(`/api/auth/me?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        unlockMainApp(data.user, token);
        return;
      }
    }
    // Token is invalid or expired
    lockMainApp();
  } catch (err) {
    // If backend is unreachable or error occurs, lock the app - NEVER bypass auth
    lockMainApp();
  }
}

// User Sign In Form Handler
async function handleSigninSubmit(e) {
  e.preventDefault();

  const errorAlert = $('#signin-error-alert');
  const errorMessage = $('#signin-error-message');
  if (errorAlert) errorAlert.classList.add('hidden');

  const emailInput = $('#signin-email');
  const passwordInput = $('#signin-password');
  const email = emailInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  const showError = (msg) => {
    if (errorAlert && errorMessage) {
      errorMessage.textContent = msg;
      errorAlert.classList.remove('hidden');
    }
    showToast('Sign In Failed', msg, 'error');
  };

  if (!email || !password) {
    showError('Please enter both your email address and password.');
    if (!email && emailInput) emailInput.focus();
    else if (passwordInput) passwordInput.focus();
    return;
  }

  const submitBtn = $('#signin-submit-btn');
  const btnText = $('#signin-btn-text');
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Signing In...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.detail || 'Invalid email or password. Please try again.';
      showError(errMsg);
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
      return;
    }

    // Success flow: authenticate session and unlock application
    unlockMainApp(data.user, data.session_token);
    $('#signin-form')?.reset();
    showToast('Welcome Back!', `Signed in successfully as ${data.user?.full_name || 'Traveler'}.`, 'success');

  } catch (err) {
    showError('Connection error. Unable to reach server. Please try again.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Sign In';
    lucide.createIcons();
  }
}

// User Logout Handler
async function handleLogout() {
  const token = state.sessionToken || sessionStorage.getItem('bc_session_token');
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      });
    } catch (err) {
      console.warn('Logout network notification failed:', err);
    }
  }

  lockMainApp();
  showToast('Logged Out', 'You have been signed out safely. Welcome back anytime!', 'info');
}

// Protected Action Guard
function requireAuth(actionCallback, actionName = 'access this feature') {
  if (!state.isAuthenticated) {
    showToast('Sign In Required', `Please sign in or create an account to ${actionName}.`, 'info');
    openModal('signin-modal');
    return false;
  }
  if (typeof actionCallback === 'function') {
    actionCallback();
  }
  return true;
}

// Modal Controllers
function closeModal(id) {
  const modal = $(`#${id}`);
  if (modal) modal.classList.add('hidden');
  if (id === 'signup-modal') {
    $('#signup-error-alert')?.classList.add('hidden');
  }
  if (id === 'signin-modal') {
    $('#signin-error-alert')?.classList.add('hidden');
  }
}

function openModal(id) {
  const modal = $(`#${id}`);
  if (modal) {
    modal.classList.remove('hidden');
    if (id === 'signup-modal') {
      $('#signup-form')?.classList.remove('hidden');
      $('#signup-success-view')?.classList.add('hidden');
      $('#signup-error-alert')?.classList.add('hidden');
    }
    if (id === 'signin-modal') {
      $('#signin-error-alert')?.classList.add('hidden');
    }
  }
  lucide.createIcons();
}

// Guide Modals
function openGuideProfile(guideId) {
  const guide = state.guides.find(g => g.id === guideId);
  if (!guide) return;

  $('#guide-modal-name').textContent = guide.name;
  $('#guide-modal-city').textContent = `${guide.city}, ${guide.state}`;
  $('#guide-modal-avatar').src = guide.avatar;
  $('#guide-modal-badge').textContent = guide.badge;
  $('#guide-modal-rating').textContent = `${guide.rating} (${guide.trips_completed} completed journeys)`;
  $('#guide-modal-exp').textContent = `${guide.experience_years} Years Experience`;
  $('#guide-modal-price').textContent = `${formatCurrency(guide.price_per_day_usd, guide.price_per_day_inr)} / day`;
  $('#guide-modal-bio').textContent = guide.bio;

  const specialtiesEl = $('#guide-modal-specialties');
  if (specialtiesEl) {
    specialtiesEl.innerHTML = (guide.specialties || []).map(s => `
      <li class="flex items-center gap-2 text-xs text-slate-300">
        <i data-lucide="check" class="w-3.5 h-3.5 text-[#D4AF37]"></i> ${s}
      </li>
    `).join('');
  }

  const hireBtn = $('#guide-modal-hire-btn');
  if (hireBtn) {
    hireBtn.onclick = () => {
      closeModal('guide-profile-modal');
      openGuideRequestModal(guide.id);
    };
  }

  const chatBtn = $('#guide-modal-chat-btn');
  if (chatBtn) {
    chatBtn.onclick = () => {
      closeModal('guide-profile-modal');
      openGuideChat(guide.id);
    };
  }

  openModal('guide-profile-modal');
}

function openGuideRequestModal(guideId) {
  const guide = state.guides.find(g => g.id === guideId);
  if (!guide) return;

  $('#guide-req-name').textContent = `Hire ${guide.name}`;
  $('#guide-req-city').textContent = `${guide.city} • ${formatCurrency(guide.price_per_day_usd, guide.price_per_day_inr)}/day`;
  $('#guide-req-guide-id').value = guide.id;

  openModal('guide-request-modal');
}

function handleGuideRequestSubmit(e) {
  e.preventDefault();
  closeModal('guide-request-modal');
  showToast('Booking Request Received', 'Your verified guide has been notified and will confirm availability within 2 hours.', 'success');
}

// Live Guide Simulated Chat
function openGuideChat(guideId) {
  const guide = state.guides.find(g => g.id === guideId);
  if (!guide) return;

  $('#chat-guide-name').textContent = guide.name;
  $('#chat-guide-avatar').src = guide.avatar;
  $('#chat-guide-status').textContent = `Active • Speaks ${guide.languages.join(', ')}`;
  $('#chat-guide-id').value = guide.id;

  const messagesContainer = $('#chat-messages-container');
  if (!state.chatHistory[guide.id]) {
    state.chatHistory[guide.id] = [
      {
        sender: 'guide',
        text: `Namaste! I'm ${guide.name}, your verified guide in ${guide.city}. How can I assist you with your upcoming journey or special requirements?`,
        time: 'Just now'
      }
    ];
  }

  renderChatMessages(guide.id);
  openModal('guide-chat-modal');
}

function renderChatMessages(guideId) {
  const container = $('#chat-messages-container');
  if (!container) return;

  const messages = state.chatHistory[guideId] || [];
  container.innerHTML = messages.map(m => `
    <div class="flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}">
      <div class="max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed ${m.sender === 'user'
      ? 'bg-[#D4AF37] text-[#0B1F3A] font-medium rounded-br-none'
      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
    }">
        <p>${m.text}</p>
        <span class="text-[10px] block mt-1 text-right ${m.sender === 'user' ? 'text-[#0B1F3A]/70' : 'text-slate-400'}">${m.time}</span>
      </div>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

function sendChatMessage(e) {
  if (e) e.preventDefault();
  const input = $('#chat-input');
  const guideId = $('#chat-guide-id')?.value;
  if (!input || !input.value.trim() || !guideId) return;

  const userText = input.value.trim();
  input.value = '';

  state.chatHistory[guideId].push({
    sender: 'user',
    text: userText,
    time: 'Just now'
  });
  renderChatMessages(guideId);

  // Simulated intelligent response
  setTimeout(() => {
    const guide = state.guides.find(g => g.id === guideId);
    const responses = [
      `That sounds wonderful! For ${guide.city}, I can certainly arrange private skip-the-line access and recommend pristine havelis.`,
      `Rest assured, all my recommended transport is vetted with experienced chauffeurs and chilled mineral water.`,
      `I would be delighted to guide your party! I'll reserve these dates on my calendar and keep you updated.`
    ];
    const reply = responses[Math.floor(Math.random() * responses.length)];

    state.chatHistory[guideId].push({
      sender: 'guide',
      text: reply,
      time: 'Just now'
    });
    renderChatMessages(guideId);
  }, 1000);
}

// Experience Booking Modal
function openBookExperience(expId) {
  const exp = state.experiences.find(e => e.id === expId);
  if (!exp) return;

  $('#book-exp-title').textContent = exp.title;
  $('#book-exp-city').textContent = `${exp.city} • ${exp.duration}`;
  $('#book-exp-price').textContent = `${formatCurrency(exp.price_usd, exp.price_inr)} per guest`;
  $('#book-exp-id').value = exp.id;

  openModal('book-experience-modal');
}

function handleBookExperienceSubmit(e) {
  e.preventDefault();
  closeModal('book-experience-modal');
  showToast('Experience Reserved!', 'Your booking confirmation has been issued. Payment is protected under BharatConnect Escrow guarantee.', 'success');
}

// Global Collaboration Modal
function openCollabModal(partnerId, partnerName, industry) {
  $('#collab-partner-name').textContent = partnerName;
  $('#collab-partner-industry').textContent = industry;
  $('#collab-partner-id').value = partnerId;
  openModal('collaboration-modal');
}

async function handleCollaborationSubmit(e) {
  e.preventDefault();
  const partnerId = $('#collab-partner-id')?.value;
  const partnerName = $('#collab-partner-name')?.textContent;
  const name = $('#collab-name')?.value;
  const email = $('#collab-email')?.value;
  const company = $('#collab-company')?.value;
  const country = $('#collab-country')?.value;
  const message = $('#collab-message')?.value;
  const date = $('#collab-date')?.value;

  try {
    const res = await fetch('/api/collaborate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: partnerId,
        partner_name: partnerName,
        applicant_name: name,
        applicant_email: email,
        applicant_company: company,
        applicant_country: country,
        category: 'Cross-border Trade & Sourcing',
        message: message,
        proposed_date: date
      })
    });
    const data = await res.json();
    closeModal('collaboration-modal');
    showToast('Partnership Request Sent', data.message || 'Our concierge will initiate introductory communications.', 'success');
  } catch (err) {
    closeModal('collaboration-modal');
    showToast('Request Recorded', 'Thank you! Your verified partnership interest has been queued for concierge review.', 'success');
  }
}

// Partner Application
async function handlePartnerApplicationSubmit(e) {
  e.preventDefault();
  const businessName = $('#partner-apply-biz').value;
  const person = $('#partner-apply-person').value;
  const email = $('#partner-apply-email').value;
  const phone = $('#partner-apply-phone').value;
  const city = $('#partner-apply-city').value;
  const industry = $('#partner-apply-industry').value;
  const description = $('#partner-apply-desc').value;

  try {
    await fetch('/api/partner/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: businessName,
        contact_person: person,
        email: email,
        phone: phone,
        city: city,
        industry: industry,
        products_services: description
      })
    });
    closeModal('partner-apply-modal');
    showToast('Application Submitted', 'Our verification audit team will inspect your documentation within 3 business days.', 'success');
  } catch (err) {
    closeModal('partner-apply-modal');
    showToast('Application Queued', 'Application recorded. Our verification audit team will follow up shortly.', 'info');
  }
}

// Community Post Create
async function handleCreatePostSubmit(e) {
  e.preventDefault();
  const title = $('#new-post-title').value;
  const category = $('#new-post-category').value;
  const origin = $('#new-post-origin').value || 'United States';
  const tagsStr = $('#new-post-tags').value;
  const content = $('#new-post-content').value;

  const tags = tagsStr.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);

  try {
    const res = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'You (International Traveler)',
        author_origin: origin,
        title: title,
        category: category,
        tags: tags.length ? tags : ['IndiaTravel', 'Community'],
        content: content
      })
    });
    const data = await res.json();
    if (data.success) {
      state.communityPosts.unshift(data.post);
      renderCommunity();
      closeModal('create-post-modal');
      showToast('Story Published!', 'Your post has been shared with the global BharatConnect travel network.', 'success');
    }
  } catch (err) {
    const fallbackPost = {
      id: `post-${Date.now()}`,
      author_name: 'You (International Traveler)',
      author_avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      author_origin: origin,
      title: title,
      category: category,
      tags: tags,
      date: 'Just now',
      content: content,
      likes: 1,
      user_liked: true,
      comments_count: 0,
      comments: []
    };
    state.communityPosts.unshift(fallbackPost);
    renderCommunity();
    closeModal('create-post-modal');
    showToast('Story Published!', 'Your post is now active on the global traveler feed.', 'success');
  }
}

// Setup Event Listeners
function setupFilters() {
  $('#guide-filter-city')?.addEventListener('change', renderGuides);
  $('#guide-filter-lang')?.addEventListener('change', renderGuides);
  $('#guide-filter-category')?.addEventListener('change', renderGuides);
  $('#guide-filter-price')?.addEventListener('change', renderGuides);
  $('#guide-filter-rating')?.addEventListener('change', renderGuides);
  $('#guide-filter-avail')?.addEventListener('change', renderGuides);
  $('#guide-search')?.addEventListener('input', renderGuides);

  $('#exp-filter-city')?.addEventListener('change', renderExperiences);
  $('#exp-filter-duration')?.addEventListener('change', renderExperiences);
  $('#exp-filter-budget')?.addEventListener('change', renderExperiences);
  $('#exp-filter-type')?.addEventListener('change', renderExperiences);

  $('#partner-filter-country')?.addEventListener('change', renderPartners);
  $('#partner-filter-industry')?.addEventListener('change', renderPartners);
  $('#partner-filter-verify')?.addEventListener('change', renderPartners);
  $('#partner-filter-collab')?.addEventListener('change', renderPartners);
  $('#partner-search')?.addEventListener('input', renderPartners);

  $('#collab-track-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trackCollaborationInquiry();
    }
  });
}

// Emergency SOS Drawer Toggle
function toggleEmergencyDrawer() {
  const drawer = $('#emergency-sos-drawer');
  if (drawer) drawer.classList.toggle('hidden');
}

// Global Quick Search (Ctrl+K)
function toggleSearchModal() {
  const modal = $('#global-search-modal');
  if (modal) {
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
      setTimeout(() => $('#global-search-input')?.focus(), 50);
    }
  }
}

function handleGlobalSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const resultsContainer = $('#global-search-results');
  if (!resultsContainer) return;

  if (!query) {
    resultsContainer.innerHTML = '<p class="text-xs text-slate-500 py-4 text-center">Type a destination, guide name, spice, or craft to search...</p>';
    return;
  }

  const matchedG = state.guides.filter(g => g.name.toLowerCase().includes(query) || g.city.toLowerCase().includes(query));
  const matchedE = state.experiences.filter(e => e.title.toLowerCase().includes(query) || e.city.toLowerCase().includes(query));
  const matchedP = state.partners.filter(p => p.name.toLowerCase().includes(query) || p.industry.toLowerCase().includes(query));

  let html = '';
  if (matchedG.length) {
    html += '<div class="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider mb-1 mt-2">Verified Guides</div>';
    html += matchedG.map(g => `
      <div onclick="toggleSearchModal(); openGuideProfile('${g.id}')" class="p-2 rounded-lg hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs text-slate-300">
        <span>${g.name} (${g.city})</span>
        <span class="text-[#D4AF37]">${formatCurrency(g.price_per_day_usd)}/day</span>
      </div>
    `).join('');
  }

  if (matchedE.length) {
    html += '<div class="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider mb-1 mt-3">Curated Experiences</div>';
    html += matchedE.map(e => `
      <div onclick="toggleSearchModal(); openBookExperience('${e.id}')" class="p-2 rounded-lg hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs text-slate-300">
        <span>${e.title}</span>
        <span class="text-[#D4AF37]">${formatCurrency(e.price_usd)}</span>
      </div>
    `).join('');
  }

  if (matchedP.length) {
    html += '<div class="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider mb-1 mt-3">Business Partners</div>';
    html += matchedP.map(p => `
      <div onclick="toggleSearchModal(); openCollabModal('${p.id}', '${p.name}', '${p.industry}')" class="p-2 rounded-lg hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs text-slate-300">
        <span>${p.name} (${p.city})</span>
        <span class="text-emerald-400">Verified Partner</span>
      </div>
    `).join('');
  }

  if (!matchedG.length && !matchedE.length && !matchedP.length) {
    html = `<p class="text-xs text-slate-400 py-4 text-center">No exact matches found for "${query}". Try searching for Delhi, Jaipur, Spices, or Textiles.</p>`;
  }

  resultsContainer.innerHTML = html;
}

// Keyboard shortcuts (Cmd+K / Ctrl+K, Escape)
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    toggleSearchModal();
  }
  if (e.key === 'Escape') {
    $$('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  }
});

/* ==========================================================================
   APPLICATION VIEW ROUTING & INFORMATION ARCHITECTURE CONTROLLER
   ========================================================================== */
const VALID_APP_VIEWS = [
  'home',
  'explore',
  'planner',
  'my-plans',
  'guides',
  'experiences',
  'premium',
  'collaboration',
  'community',
  'about',
  'profile',
  'customize'
];

const HASH_VIEW_MAP = {
  '': 'home',
  'home': 'home',
  'explore': 'explore',
  'explore-india': 'explore',
  'planner': 'planner',
  'ai-trip-planner': 'planner',
  'my-trips': 'my-plans',
  'my-plans': 'my-plans',
  'guides': 'guides',
  'local-guides': 'guides',
  'experiences': 'experiences',
  'premium': 'premium',
  'premium-pass': 'premium',
  'collaboration': 'collaboration',
  'global-collaboration': 'collaboration',
  'community': 'community',
  'about': 'about',
  'about-us': 'about',
  'profile': 'profile',
  'customize': 'customize',
  'customize-plan': 'customize'
};

function switchAppView(viewName, updateHash = true) {
  const normalized = HASH_VIEW_MAP[viewName] || 'home';

  // Feature 2: Load and refresh My Plans view when switching to it
  if (normalized === 'my-plans') {
    if (typeof loadAndRenderMyPlans === 'function') {
      loadAndRenderMyPlans();
    }
  }

  // 1. Hide all views and reveal active view
  VALID_APP_VIEWS.forEach(v => {
    const viewEl = document.getElementById(`view-${v}`);
    if (viewEl) {
      if (v === normalized) {
        viewEl.classList.add('active-view');
      } else {
        viewEl.classList.remove('active-view');
      }
    }
  });

  // 2. Update active nav link styling in desktop and mobile menus
  document.querySelectorAll('.nav-link').forEach(link => {
    const target = link.getAttribute('data-view');
    if (target === normalized) {
      link.classList.add('active-nav');
    } else {
      link.classList.remove('active-nav');
    }
  });

  // 3. Update hash without jarring jump
  if (updateHash) {
    if (window.location.hash !== `#${normalized}`) {
      window.history.pushState(null, '', `#${normalized}`);
    }
  }

  // 4. Scroll smoothly to top of main content
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 5. Trigger view-specific data refresh
  if (normalized === 'home') {
    renderHomeDashboard();
  } else if (normalized === 'profile') {
    renderProfileView();
  } else if (normalized === 'planner') {
    renderUserTrips();
    if (typeof updatePlannerContextStrip === 'function') {
      updatePlannerContextStrip();
    }
  } else if (normalized === 'customize') {
    if (typeof initCustomizePlanView === 'function') {
      initCustomizePlanView();
    }
  }

  // Close mobile drawer if open
  const drawer = document.getElementById('mobile-drawer');
  if (drawer) drawer.classList.remove('open');
  const oldMobileDrawer = document.getElementById('mobile-menu-drawer');
  if (oldMobileDrawer) oldMobileDrawer.classList.add('hidden');

  lucide.createIcons();
}

function handleRouteHash(hashStr) {
  const clean = (hashStr || window.location.hash || '').replace('#', '').trim();
  const targetView = HASH_VIEW_MAP[clean] || 'home';
  switchAppView(targetView, false);
}

function initAppRouter() {
  window.addEventListener('hashchange', () => {
    handleRouteHash(window.location.hash);
  });

  // Initial routing
  const initialHash = window.location.hash;
  if (initialHash) {
    handleRouteHash(initialHash);
  } else {
    switchAppView('home', false);
  }
}

// Render Home Dashboard Components (Active journey + Curated Recommendations)
function renderHomeDashboard() {
  const userCountry = state.currentUser?.origin_country || state.currentUser?.country || 'United States';
  const originEl = document.getElementById('home-journey-origin');
  if (originEl) originEl.textContent = userCountry;

  const currentJourneyContainer = document.getElementById('home-current-journey');
  if (!currentJourneyContainer) return;

  const trips = state.userTrips || [];

  if (trips.length > 0) {
    const trip = trips[0];
    const destination = trip.destination || 'India';
    const days = trip.duration_days || 5;
    const travelers = trip.travelers_count ? `${trip.travelers_count} Travelers (${trip.traveler_type || 'Traveler'})` : (trip.traveler_type || '2 Travelers');
    const budget = trip.total_budget_inr ? formatCurrency(trip.total_budget_usd, trip.total_budget_inr) : (trip.budget_usd ? formatCurrency(trip.budget_usd) : (trip.budget || 'Standard'));
    const nextActivity = trip.itinerary && trip.itinerary[0] && trip.itinerary[0].title ? `Day 1: ${trip.itinerary[0].title}` : 'Arrive and check in';
    const guideName = trip.matched_guides?.[0]?.name || (trip.mode === 'custom' ? 'Local Specialist Assigned' : 'Platform Verified Guide');

    currentJourneyContainer.innerHTML = `
      <div class="glass-panel rounded-2xl p-6 sm:p-8 border border-gold-500/30 shadow-2xl relative overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400">
              <i data-lucide="plane-takeoff" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-gold-400">Active Journey</span>
              <h3 class="text-xl sm:text-2xl font-bold text-white font-serif-luxury">${trip.title || `${days}-Day Journey to ${destination}`}</h3>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Confirmed Trip
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-xs">
          <div class="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
            <span class="text-slate-400 block mb-1">Destination</span>
            <span class="font-bold text-white text-sm truncate block">${destination}</span>
          </div>
          <div class="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
            <span class="text-slate-400 block mb-1">Duration & Party</span>
            <span class="font-bold text-white text-sm block">${days} Days • ${travelers}</span>
          </div>
          <div class="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
            <span class="text-slate-400 block mb-1">Estimated Budget</span>
            <span class="font-bold text-gold-400 text-sm block">${budget}</span>
          </div>
          <div class="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
            <span class="text-slate-400 block mb-1">Local Guide</span>
            <span class="font-bold text-cyan-300 text-sm truncate block">${guideName}</span>
          </div>
        </div>

        <div class="p-4 rounded-xl bg-gradient-to-r from-navy-900/80 to-navy-950/90 border border-slate-800/80 mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <i data-lucide="clock" class="w-4 h-4 text-gold-400"></i>
            <div>
              <span class="text-[11px] text-slate-400 uppercase tracking-wider block">Upcoming Itinerary Milestone</span>
              <span class="text-sm font-semibold text-white">${nextActivity}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button onclick="switchAppView('planner')" class="px-5 py-2.5 rounded-xl bg-gold-gradient text-navy-950 font-bold text-xs shadow-lg hover:scale-105 transition-transform flex items-center gap-2 cursor-pointer">
            <i data-lucide="map" class="w-4 h-4"></i>
            <span>View Full Itinerary</span>
          </button>
          <button onclick="resetAndFocusPlanner(); switchAppView('planner');" class="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold hover:border-slate-500 transition-colors flex items-center gap-2 cursor-pointer">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Plan Another Trip</span>
          </button>
        </div>
      </div>
    `;
  } else {
    // No active trip -> Start your India Journey card
    currentJourneyContainer.innerHTML = `
      <div class="glass-panel rounded-2xl p-8 border border-slate-800 hover:border-gold-500/30 transition-all text-center max-w-2xl mx-auto">
        <div class="w-14 h-14 rounded-2xl bg-gold-500/10 border border-gold-500/30 text-gold-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gold-500/10">
          <i data-lucide="sparkles" class="w-7 h-7"></i>
        </div>
        <h3 class="text-xl font-bold text-white mb-2 font-serif-luxury">Start Your India Journey</h3>
        <p class="text-xs text-slate-300 max-w-md mx-auto mb-6 leading-relaxed">
          Create an intelligent day-by-day India itinerary curated by AI, tailored to your travel style, budget, and matched with verified local experts.
        </p>
        <button onclick="switchAppView('planner')" class="px-6 py-3 rounded-xl bg-gold-gradient text-navy-950 font-bold text-xs shadow-lg shadow-gold-500/20 hover:scale-105 transition-transform inline-flex items-center gap-2 cursor-pointer">
          <i data-lucide="compass" class="w-4 h-4"></i>
          <span>Plan My Trip</span>
        </button>
      </div>
    `;
  }

  // Update Featured Itinerary Budget on Home Page
  const featuredBudgetEl = document.getElementById('home-featured-budget');
  if (featuredBudgetEl) {
    featuredBudgetEl.innerHTML = `${formatCurrency(3500, 290500)} <span class="text-[10px] font-normal text-slate-400">total</span>`;
  }

  // Update static preview guide prices on home dashboard
  const homeGuidePrices = [
    { id: 'home-guide-price-1', usd: 65, inr: 5400 },
    { id: 'home-guide-price-2', usd: 70, inr: 5800 },
    { id: 'home-guide-price-3', usd: 55, inr: 4600 },
    { id: 'home-guide-price-4', usd: 60, inr: 5000 }
  ];
  homeGuidePrices.forEach(g => {
    const el = document.getElementById(g.id);
    if (el) el.innerHTML = `${formatCurrency(g.usd, g.inr)} <span class="text-[10px] font-normal text-slate-400">/ day</span>`;
  });

  // Update static preview experience prices on home dashboard
  const homeExpPrices = [
    { id: 'home-exp-price-1', usd: 45, inr: 3700 },
    { id: 'home-exp-price-2', usd: 40, inr: 3300 },
    { id: 'home-exp-price-3', usd: 35, inr: 2900 },
    { id: 'home-exp-price-4', usd: 50, inr: 4100 }
  ];
  homeExpPrices.forEach(e => {
    const el = document.getElementById(e.id);
    if (el) el.innerHTML = `${formatCurrency(e.usd, e.inr)} <span class="text-[10px] font-normal text-slate-400">/ person</span>`;
  });

  lucide.createIcons();
}

// Render Profile View
function renderProfileView() {
  const user = state.currentUser;
  const fullName = user?.full_name || user?.name || 'Traveler';
  const email = user?.email || 'traveler@bharatconnect.ai';
  const country = user?.origin_country || user?.country || 'Japan';
  const travelerType = user?.traveler_type || 'Cultural Explorer';

  const nameEl = document.getElementById('profile-display-name');
  if (nameEl) nameEl.textContent = fullName;
  const emailEl = document.getElementById('profile-display-email');
  if (emailEl) emailEl.textContent = email;
  const countryEl = document.getElementById('profile-display-country');
  if (countryEl) countryEl.textContent = country;
  const typeEl = document.getElementById('profile-display-type');
  if (typeEl) typeEl.textContent = travelerType;

  const tripCountEl = document.getElementById('profile-trips-count');
  if (tripCountEl) tripCountEl.textContent = (state.userTrips || []).length;
  lucide.createIcons();
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // Check session token and gate main application
  checkInitialAuth();

  // Setup flight journey scroll, telemetry and arrival listeners
  setupFlightJourneyListeners();

  initData();
  initAppRouter();
  lucide.createIcons();

  // Initial pricing cycle
  setPricingCycle('annual');

  // Mobile menu toggle
  $('#mobile-menu-btn')?.addEventListener('click', () => {
    const drawer = $('#mobile-drawer');
    if (drawer) {
      drawer.classList.toggle('open');
    } else {
      $('#mobile-menu-drawer')?.classList.toggle('hidden');
    }
    lucide.createIcons();
  });

  // Auto-close mobile menu on link click
  $$('#mobile-menu-drawer a, #mobile-drawer a')?.forEach(link => {
    link.addEventListener('click', () => {
      $('#mobile-drawer')?.classList.remove('open');
      $('#mobile-menu-drawer')?.classList.add('hidden');
    });
  });

  // Global search input listener
  $('#global-search-input')?.addEventListener('input', handleGlobalSearch);
});

// ==============================================================
// CUSTOMIZE PLAN MODULE
// ==============================================================

const CP_STATE = {
  currentStep: 1,
  totalSteps: 6,
  startDate: '',
  duration: 7,
  travelers: 2,
  pace: 'Balanced (2-3 Sights Daily)',
  budget: 3500,
  startingCity: 'New Delhi',
  notes: '',
  selectedCategories: [],
  selectedDestinations: [],
  selectedGuide: null,
  transport: 'Private Chauffeur & High-speed Rail',
  accommodation: 'Heritage Haveli & Boutique',
  photographer: 'None',
  meals: [],
  generatedTrip: null,
};

const CP_STEP_NAMES = [
  'Travel Requirements',
  'Experience Categories',
  'Choose Destinations',
  'Local Guide',
  'Transport & Services',
  'Review & Confirm'
];

const CP_CATEGORIES = [
  { id: 'heritage', label: 'Heritage & History', icon: 'landmark', color: 'gold' },
  { id: 'spiritual', label: 'Spiritual & Wellness', icon: 'sun', color: 'amber' },
  { id: 'nature', label: 'Nature & Wildlife', icon: 'tree-pine', color: 'emerald' },
  { id: 'adventure', label: 'Adventure & Trekking', icon: 'mountain', color: 'blue' },
  { id: 'culinary', label: 'Food & Culinary', icon: 'utensils', color: 'orange' },
  { id: 'arts', label: 'Arts & Crafts', icon: 'palette', color: 'purple' },
  { id: 'beach', label: 'Beaches & Backwaters', icon: 'waves', color: 'cyan' },
  { id: 'luxury', label: 'Luxury & Palaces', icon: 'crown', color: 'gold' },
  { id: 'photography', label: 'Photography Tours', icon: 'camera', color: 'rose' },
];

const CP_DESTINATIONS = [
  { id: 'delhi', name: 'New Delhi', region: 'North India', emoji: '🏛️', categories: ['heritage', 'culinary'] },
  { id: 'agra', name: 'Agra', region: 'North India', emoji: '🕌', categories: ['heritage', 'photography'] },
  { id: 'jaipur', name: 'Jaipur', region: 'Rajasthan', emoji: '🏰', categories: ['heritage', 'arts', 'luxury'] },
  { id: 'udaipur', name: 'Udaipur', region: 'Rajasthan', emoji: '🏯', categories: ['luxury', 'heritage', 'photography'] },
  { id: 'jodhpur', name: 'Jodhpur', region: 'Rajasthan', emoji: '🔵', categories: ['heritage', 'arts'] },
  { id: 'varanasi', name: 'Varanasi', region: 'UP', emoji: '🪔', categories: ['spiritual', 'photography'] },
  { id: 'rishikesh', name: 'Rishikesh', region: 'Uttarakhand', emoji: '🧘', categories: ['spiritual', 'adventure'] },
  { id: 'manali', name: 'Manali', region: 'Himachal', emoji: '⛰️', categories: ['adventure', 'nature'] },
  { id: 'ladakh', name: 'Leh Ladakh', region: 'J&K', emoji: '🏔️', categories: ['adventure', 'photography', 'nature'] },
  { id: 'kochi', name: 'Kochi', region: 'Kerala', emoji: '⛵', categories: ['heritage', 'beach', 'culinary'] },
  { id: 'munnar', name: 'Munnar', region: 'Kerala', emoji: '🍃', categories: ['nature', 'wellness'] },
  { id: 'alleppey', name: 'Alleppey', region: 'Kerala', emoji: '🛶', categories: ['beach', 'nature'] },
  { id: 'goa', name: 'Goa', region: 'Goa', emoji: '🏖️', categories: ['beach', 'culinary', 'photography'] },
  { id: 'hampi', name: 'Hampi', region: 'Karnataka', emoji: '🗿', categories: ['heritage', 'photography'] },
  { id: 'mysore', name: 'Mysore', region: 'Karnataka', emoji: '👑', categories: ['heritage', 'luxury'] },
  { id: 'darjeeling', name: 'Darjeeling', region: 'West Bengal', emoji: '🍵', categories: ['nature', 'photography'] },
  { id: 'amritsar', name: 'Amritsar', region: 'Punjab', emoji: '✨', categories: ['spiritual', 'culinary'] },
  { id: 'ranthambore', name: 'Ranthambore', region: 'Rajasthan', emoji: '🐯', categories: ['nature', 'adventure'] },
];

const CP_TRANSPORT_OPTIONS = [
  { id: 'Private Chauffeur & High-speed Rail', label: 'Private Chauffeur + Train', desc: 'Best of both worlds', cost: 450 },
  { id: 'Private Chauffeur Sedan', label: 'Private Chauffeur Sedan', desc: 'Door-to-door luxury', cost: 380 },
  { id: 'Shared Cab + Rail', label: 'Shared Cab + Rail', desc: 'Budget-friendly', cost: 120 },
  { id: 'Self-Drive + Rail', label: 'Self-Drive + Rail', desc: 'Full freedom', cost: 200 },
];

const CP_ACCOMMODATION_OPTIONS = [
  { id: 'Heritage Haveli & Boutique', label: 'Heritage Haveli', desc: 'Authentic royal experience', cost: 280 },
  { id: 'Luxury 5-Star Hotels', label: '5-Star Hotels', desc: 'World-class amenities', cost: 450 },
  { id: 'Boutique Guesthouses', label: 'Boutique Guesthouses', desc: 'Local charm, great value', cost: 120 },
  { id: 'Eco Lodges & Camps', label: 'Eco Lodges', desc: 'Sustainable & scenic', cost: 150 },
];

function initCustomizePlanView() {
  // Reset to step 1
  CP_STATE.currentStep = 1;

  // Set default start date to +30 days
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 30);
  const dateStr = defaultDate.toISOString().split('T')[0];
  const startDateEl = document.getElementById('cp-start-date');
  if (startDateEl && !startDateEl.value) startDateEl.value = dateStr;

  cpRenderStep(1);
  cpRenderCategories();
  cpRenderDestinations('');
  cpRenderGuides();
  cpRenderTransportOptions();
  cpRenderAccommodationOptions();
  lucide.createIcons();
}

function cpRenderStep(step) {
  const total = CP_STATE.totalSteps;
  CP_STATE.currentStep = step;

  // Show/hide panels
  for (let i = 1; i <= total; i++) {
    const panel = document.getElementById(`cp-step-${i}`);
    if (panel) panel.classList.toggle('hidden', i !== step);
  }

  // Update progress bar
  const pct = (step / total) * 100;
  const bar = document.getElementById('cp-progress-bar');
  if (bar) bar.style.width = `${pct}%`;

  // Update step label
  const labelEl = document.getElementById('cp-step-label');
  const nameEl = document.getElementById('cp-step-name');
  if (labelEl) labelEl.textContent = `Step ${step} of ${total}`;
  if (nameEl) nameEl.textContent = CP_STEP_NAMES[step - 1] || '';

  // Update dots
  for (let i = 1; i <= total; i++) {
    const dot = document.getElementById(`cp-dot-${i}`);
    if (dot) {
      dot.classList.toggle('bg-gold-500', i <= step);
      dot.classList.toggle('bg-slate-700', i > step);
      dot.style.width = i === step ? '24px' : '8px';
      dot.style.borderRadius = '999px';
    }
  }

  // Show/hide back button
  const backBtn = document.getElementById('cp-back-btn');
  if (backBtn) backBtn.classList.toggle('hidden', step === 1);

  // Change next button on last step
  const nextBtn = document.getElementById('cp-next-btn');
  if (nextBtn) {
    if (step === total) {
      nextBtn.classList.add('hidden');
    } else {
      nextBtn.classList.remove('hidden');
    }
  }

  // If on summary step, build summary
  if (step === total) {
    cpBuildSummary();
    cpFetchItineraryPreview();
  }

  lucide.createIcons();
}

function cpNavigateStep(direction) {
  const next = CP_STATE.currentStep + direction;
  if (next < 1 || next > CP_STATE.totalSteps) return;

  // Save current step values
  if (CP_STATE.currentStep === 1) {
    CP_STATE.startingCity = document.getElementById('cp-starting-city')?.value || 'New Delhi';
    CP_STATE.startDate = document.getElementById('cp-start-date')?.value || '';
    CP_STATE.duration = parseInt(document.getElementById('cp-duration')?.value) || 7;
    CP_STATE.travelers = parseInt(document.getElementById('cp-travelers')?.value) || 2;
    CP_STATE.pace = document.getElementById('cp-pace')?.value || 'Balanced (2-3 Sights Daily)';
    CP_STATE.budget = parseInt(document.getElementById('cp-budget-slider')?.value) || 3500;
    CP_STATE.notes = document.getElementById('cp-notes')?.value || '';
  }

  cpRenderStep(next);
}

// ---- CATEGORIES ----
function cpRenderCategories() {
  const grid = document.getElementById('cp-categories-grid');
  if (!grid) return;

  grid.innerHTML = CP_CATEGORIES.map(cat => `
    <div id="cp-cat-${cat.id}" onclick="cpToggleCategory('${cat.id}')"
      class="cp-cat-card flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-700 cursor-pointer transition-all hover:border-gold-500/60 select-none">
      <i data-lucide="${cat.icon}" class="w-5 h-5 text-slate-400 shrink-0"></i>
      <span class="text-xs font-semibold text-slate-300">${cat.label}</span>
    </div>
  `).join('');
  lucide.createIcons();
}

function cpToggleCategory(id) {
  const idx = CP_STATE.selectedCategories.indexOf(id);
  const card = document.getElementById(`cp-cat-${id}`);
  if (idx >= 0) {
    CP_STATE.selectedCategories.splice(idx, 1);
    if (card) {
      card.classList.remove('border-gold-500', 'bg-gold-500/10');
      card.classList.add('border-slate-700');
    }
  } else {
    if (CP_STATE.selectedCategories.length >= 4) {
      showToast('Category Limit', 'You can select up to 4 categories.', 'warning');
      return;
    }
    CP_STATE.selectedCategories.push(id);
    if (card) {
      card.classList.add('border-gold-500', 'bg-gold-500/10');
      card.classList.remove('border-slate-700');
    }
  }
}

// ---- DESTINATIONS ----
function cpRenderDestinations(filter) {
  const grid = document.getElementById('cp-destinations-grid');
  if (!grid) return;

  const filtered = filter
    ? CP_DESTINATIONS.filter(d => d.name.toLowerCase().includes(filter.toLowerCase()) || d.region.toLowerCase().includes(filter.toLowerCase()))
    : CP_DESTINATIONS;

  grid.innerHTML = filtered.map(dest => {
    const isSelected = CP_STATE.selectedDestinations.includes(dest.id);
    return `
    <div id="cp-dest-${dest.id}" onclick="cpToggleDestination('${dest.id}', '${dest.name}')"
      class="p-3 rounded-2xl border-2 ${isSelected ? 'border-gold-500 bg-gold-500/10' : 'border-slate-700'} cursor-pointer transition-all hover:border-gold-500/60 select-none text-center">
      <div class="text-xl mb-1">${dest.emoji}</div>
      <p class="text-xs font-bold text-white">${dest.name}</p>
      <p class="text-[10px] text-slate-400">${dest.region}</p>
    </div>`;
  }).join('');
  lucide.createIcons();
}

function filterCPDestinations(query) {
  cpRenderDestinations(query);
}

function cpToggleDestination(id, name) {
  const idx = CP_STATE.selectedDestinations.indexOf(id);
  const card = document.getElementById(`cp-dest-${id}`);
  if (idx >= 0) {
    CP_STATE.selectedDestinations.splice(idx, 1);
    if (card) {
      card.classList.remove('border-gold-500', 'bg-gold-500/10');
      card.classList.add('border-slate-700');
    }
  } else {
    CP_STATE.selectedDestinations.push(id);
    if (card) {
      card.classList.add('border-gold-500', 'bg-gold-500/10');
      card.classList.remove('border-slate-700');
    }
  }
  cpRenderDestinationChips();
}

function cpRenderDestinationChips() {
  const container = document.getElementById('cp-selected-dests-chips');
  const msg = document.getElementById('cp-no-dest-msg');
  if (!container) return;

  if (CP_STATE.selectedDestinations.length === 0) {
    if (msg) msg.classList.remove('hidden');
    // Remove all chips
    container.querySelectorAll('.cp-dest-chip').forEach(c => c.remove());
    return;
  }
  if (msg) msg.classList.add('hidden');

  // Clear and re-render
  container.querySelectorAll('.cp-dest-chip').forEach(c => c.remove());
  CP_STATE.selectedDestinations.forEach(id => {
    const dest = CP_DESTINATIONS.find(d => d.id === id);
    if (!dest) return;
    const chip = document.createElement('span');
    chip.className = 'cp-dest-chip inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500/15 border border-gold-500/40 text-gold-300 text-xs font-semibold';
    chip.innerHTML = `${dest.emoji} ${dest.name} <button onclick="cpToggleDestination('${id}', '${dest.name}')" class="ml-1 text-slate-400 hover:text-white"><i data-lucide="x" class="w-3 h-3"></i></button>`;
    container.appendChild(chip);
  });
  lucide.createIcons();
}

// ---- GUIDES ----
function cpRenderGuides() {
  const grid = document.getElementById('cp-guides-grid');
  if (!grid) return;

  const guides = (typeof guides_db !== 'undefined' ? guides_db : []).slice(0, 6);
  if (!guides.length) {
    grid.innerHTML = '<p class="text-xs text-slate-400 col-span-2">Loading guides...</p>';
    return;
  }

  grid.innerHTML = guides.map(guide => `
    <div id="cp-guide-${guide.id}" onclick="cpToggleGuide('${guide.id}')"
      class="cp-guide-card flex items-start gap-4 p-4 rounded-2xl border-2 border-slate-700 cursor-pointer transition-all hover:border-gold-500/60 select-none">
      <img src="${guide.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(guide.name) + '&background=D4AF37&color=0A0F1E'}"
        alt="${guide.name}" class="w-12 h-12 rounded-xl object-cover border border-gold-500/30 shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-sm font-bold text-white">${guide.name}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓ Verified</span>
        </div>
        <p class="text-[11px] text-gold-400 mt-0.5">${guide.city || guide.region || ''}</p>
        <div class="flex items-center gap-2 mt-1.5 flex-wrap">
          <span class="text-[11px] text-slate-400">⭐ ${guide.rating || '4.9'}</span>
          <span class="text-[11px] text-slate-400">• ${guide.experience || '8+ yrs'}</span>
          <span class="text-[11px] text-gold-400 font-semibold">$${guide.daily_rate_usd || guide.price_per_day || 95}/day</span>
        </div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function cpToggleGuide(guideId) {
  // Deselect all
  document.querySelectorAll('[id^="cp-guide-"]').forEach(el => {
    el.classList.remove('border-gold-500', 'bg-gold-500/10');
    el.classList.add('border-slate-700');
  });
  document.querySelector('.cp-guide-skip')?.classList.remove('bg-gold-500/10', 'border-gold-500', 'text-gold-400');

  if (guideId === null) {
    CP_STATE.selectedGuide = null;
    const skip = document.querySelector('.cp-guide-skip');
    if (skip) {
      skip.classList.add('bg-gold-500/10', 'border-gold-500', 'text-gold-400');
    }
    return;
  }

  CP_STATE.selectedGuide = guideId;
  const card = document.getElementById(`cp-guide-${guideId}`);
  if (card) {
    card.classList.add('border-gold-500', 'bg-gold-500/10');
    card.classList.remove('border-slate-700');
  }
}

// ---- TRANSPORT & ACCOMMODATION ----
function cpRenderTransportOptions() {
  const container = document.getElementById('cp-transport-options');
  if (!container) return;
  container.innerHTML = CP_TRANSPORT_OPTIONS.map(opt => `
    <div id="cp-tr-${opt.id.replace(/\s+/g, '-')}" onclick="cpSelectTransport('${opt.id}')"
      class="cp-option-card p-4 rounded-2xl border-2 ${opt.id === CP_STATE.transport ? 'border-gold-500 bg-gold-500/10' : 'border-slate-700'} cursor-pointer transition-all hover:border-gold-500/60 select-none">
      <p class="text-xs font-bold text-white">${opt.label}</p>
      <p class="text-[11px] text-slate-400 mt-0.5">${opt.desc}</p>
      <p class="text-[11px] text-gold-400 font-semibold mt-1">+$${opt.cost}/trip</p>
    </div>
  `).join('');
}

function cpSelectTransport(id) {
  CP_STATE.transport = id;
  document.querySelectorAll('[id^="cp-tr-"]').forEach(el => {
    el.classList.remove('border-gold-500', 'bg-gold-500/10');
    el.classList.add('border-slate-700');
  });
  const safeId = id.replace(/\s+/g, '-');
  const card = document.getElementById(`cp-tr-${safeId}`);
  if (card) {
    card.classList.add('border-gold-500', 'bg-gold-500/10');
    card.classList.remove('border-slate-700');
  }
}

function cpRenderAccommodationOptions() {
  const container = document.getElementById('cp-accommodation-options');
  if (!container) return;
  container.innerHTML = CP_ACCOMMODATION_OPTIONS.map(opt => `
    <div id="cp-ac-${opt.id.replace(/\s+/g, '-')}" onclick="cpSelectAccommodation('${opt.id}')"
      class="cp-option-card p-4 rounded-2xl border-2 ${opt.id === CP_STATE.accommodation ? 'border-gold-500 bg-gold-500/10' : 'border-slate-700'} cursor-pointer transition-all hover:border-gold-500/60 select-none">
      <p class="text-xs font-bold text-white">${opt.label}</p>
      <p class="text-[11px] text-slate-400 mt-0.5">${opt.desc}</p>
      <p class="text-[11px] text-gold-400 font-semibold mt-1">~$${opt.cost}/night</p>
    </div>
  `).join('');
}

function cpSelectAccommodation(id) {
  CP_STATE.accommodation = id;
  document.querySelectorAll('[id^="cp-ac-"]').forEach(el => {
    el.classList.remove('border-gold-500', 'bg-gold-500/10');
    el.classList.add('border-slate-700');
  });
  const safeId = id.replace(/\s+/g, '-');
  const card = document.getElementById(`cp-ac-${safeId}`);
  if (card) {
    card.classList.add('border-gold-500', 'bg-gold-500/10');
    card.classList.remove('border-slate-700');
  }
}

function cpSelectPhotographer(tier) {
  CP_STATE.photographer = tier;
  ['None', 'Standard', 'Professional'].forEach(t => {
    const el = document.getElementById(`cp-photo-${t.toLowerCase()}`);
    if (!el) return;
    if (t === tier) {
      el.classList.add('border-gold-500', 'bg-gold-500/10');
      el.classList.remove('border-slate-700');
    } else {
      el.classList.remove('border-gold-500', 'bg-gold-500/10');
      el.classList.add('border-slate-700');
    }
  });
}

// ---- BUDGET ENGINE ----
function cpCalculateBudget() {
  const days = CP_STATE.duration;
  const travelers = CP_STATE.travelers;

  const accOpt = CP_ACCOMMODATION_OPTIONS.find(o => o.id === CP_STATE.accommodation) || CP_ACCOMMODATION_OPTIONS[0];
  const trOpt = CP_TRANSPORT_OPTIONS.find(o => o.id === CP_STATE.transport) || CP_TRANSPORT_OPTIONS[0];

  const guideObj = CP_STATE.selectedGuide && typeof guides_db !== 'undefined'
    ? guides_db.find(g => g.id === CP_STATE.selectedGuide)
    : null;
  const guideCost = guideObj ? (guideObj.daily_rate_usd || 95) * days : 0;
  const accCost = accOpt.cost * days * Math.ceil(travelers / 2);
  const trCost = trOpt.cost;
  const photoCost = CP_STATE.photographer === 'Professional' ? 180 * days
    : CP_STATE.photographer === 'Standard' ? 80 * days : 0;
  const foodCost = 60 * days * travelers;
  const activitiesCost = 40 * days * travelers;
  const total = guideCost + accCost + trCost + photoCost + foodCost + activitiesCost;

  return { guideCost, accCost, trCost, photoCost, foodCost, activitiesCost, total };
}

// ---- SUMMARY STEP ----
function cpBuildSummary() {
  const budget = cpCalculateBudget();
  const destNames = CP_STATE.selectedDestinations
    .map(id => CP_DESTINATIONS.find(d => d.id === id)?.name || id)
    .join(', ') || 'Golden Triangle (Delhi, Agra, Jaipur)';

  const guideObj = CP_STATE.selectedGuide && typeof guides_db !== 'undefined'
    ? guides_db.find(g => g.id === CP_STATE.selectedGuide)
    : null;
  const guideName = guideObj ? guideObj.name : 'No Guide (Independent)';

  const summaryEl = document.getElementById('cp-summary-content');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Destinations</span>
          <span class="font-bold text-white">${destNames || 'TBD'}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Duration</span>
          <span class="font-bold text-white">${CP_STATE.duration} Days</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Start Date</span>
          <span class="font-bold text-white">${CP_STATE.startDate || 'TBD'}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Travelers</span>
          <span class="font-bold text-white">${CP_STATE.travelers}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Local Guide</span>
          <span class="font-bold text-white">${guideName}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Transport</span>
          <span class="font-bold text-white">${CP_STATE.transport}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Stay</span>
          <span class="font-bold text-white">${CP_STATE.accommodation}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Photographer</span>
          <span class="font-bold text-white">${CP_STATE.photographer}</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span class="text-slate-400 block text-[11px] uppercase tracking-wider mb-1">Travel Pace</span>
          <span class="font-bold text-white">${CP_STATE.pace.split('(')[0].trim()}</span>
        </div>
      </div>`;
  }

  const budgetEl = document.getElementById('cp-budget-breakdown');
  if (budgetEl) {
    const rows = [
      { label: 'Accommodation', value: budget.accCost },
      { label: 'Transport & Transfers', value: budget.trCost },
      { label: 'Local Guide', value: budget.guideCost },
      { label: 'Meals & Dining', value: budget.foodCost },
      { label: 'Activities & Experiences', value: budget.activitiesCost },
      { label: 'Photographer', value: budget.photoCost },
    ].filter(r => r.value > 0);

    const overBudget = budget.total > CP_STATE.budget;
    budgetEl.innerHTML = `
      <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <i data-lucide="wallet" class="w-3.5 h-3.5 text-gold-400"></i> Estimated Budget Breakdown
      </h4>
      <div class="space-y-2">
        ${rows.map(r => `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-400">${r.label}</span>
            <span class="font-semibold text-white">$${r.value.toLocaleString()}</span>
          </div>`).join('')}
      </div>
      <div class="pt-3 mt-3 border-t border-slate-700 flex items-center justify-between">
        <span class="text-sm font-bold text-white">Total Estimate</span>
        <span class="text-lg font-extrabold ${overBudget ? 'text-red-400' : 'text-gold-400'}">$${budget.total.toLocaleString()}</span>
      </div>
      ${overBudget ? `<p class="text-[11px] text-red-400 mt-2 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Slightly over your $${CP_STATE.budget.toLocaleString()} budget. Consider adjusting accommodation or transport.</p>` : `<p class="text-[11px] text-emerald-400 mt-2 flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> Within your $${CP_STATE.budget.toLocaleString()} budget.</p>`}
    `;
    lucide.createIcons();
  }
}

async function cpFetchItineraryPreview() {
  const daysContainer = document.getElementById('cp-itinerary-days');
  if (!daysContainer) return;

  daysContainer.innerHTML = `<div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 text-center"><i data-lucide="loader" class="w-4 h-4 animate-spin inline-block mr-2"></i> Generating AI itinerary preview...</div>`;
  lucide.createIcons();

  const destNames = CP_STATE.selectedDestinations
    .map(id => CP_DESTINATIONS.find(d => d.id === id)?.name)
    .filter(Boolean);
  const destStr = destNames.join(', ') || 'Golden Triangle (Delhi, Agra, Jaipur)';

  try {
    const token = localStorage.getItem('token') || '';
    const payload = {
      destination: destStr,
      destinations: destNames,
      places: destNames,
      travel_date: CP_STATE.startDate,
      start_date: CP_STATE.startDate,
      duration_days: CP_STATE.duration,
      travelers_count: CP_STATE.travelers,
      budget_usd: CP_STATE.budget,
      interests: CP_STATE.selectedCategories,
      guide_id: CP_STATE.selectedGuide || '',
      accommodation: CP_STATE.accommodation,
      transportation: CP_STATE.transport,
      daily_pace: CP_STATE.pace,
      photographer_required: CP_STATE.photographer !== 'None',
      photographer_tier: CP_STATE.photographer,
      custom_notes: CP_STATE.notes,
      starting_city: CP_STATE.startingCity,
      categories: CP_STATE.selectedCategories,
    };

    const url = token ? `/api/trips/custom?token=${token}` : '/api/trips/custom';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    CP_STATE.generatedTrip = data;

    const days = data.days || data.itinerary || [];
    if (!days.length) throw new Error('No itinerary');

    daysContainer.innerHTML = days.slice(0, CP_STATE.duration).map((day, i) => `
      <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-lg bg-gold-500/20 text-gold-400 flex items-center justify-center text-[10px] font-bold shrink-0">${i + 1}</span>
          <span class="font-bold text-white">${day.location || day.city || day.destination || destStr}</span>
        </div>
        <div class="space-y-1 pl-8 text-slate-400">
          ${day.morning ? `<p><span class="text-[10px] text-gold-400 uppercase tracking-wider">Morning:</span> ${day.morning}</p>` : ''}
          ${day.afternoon ? `<p><span class="text-[10px] text-gold-400 uppercase tracking-wider">Afternoon:</span> ${day.afternoon}</p>` : ''}
          ${day.evening ? `<p><span class="text-[10px] text-gold-400 uppercase tracking-wider">Evening:</span> ${day.evening}</p>` : ''}
          ${day.experience_title ? `<p class="mt-1 text-emerald-400 text-[10px] flex items-center gap-1">✦ ${day.experience_title}</p>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    // Fallback: generate a simple preview client-side
    const destNames2 = CP_STATE.selectedDestinations
      .map(id => CP_DESTINATIONS.find(d => d.id === id)?.name)
      .filter(Boolean);
    const previewDays = Array.from({ length: Math.min(CP_STATE.duration, 5) }, (_, i) => {
      const city = destNames2[i % (destNames2.length || 1)] || 'Destination TBD';
      return `
        <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="w-6 h-6 rounded-lg bg-gold-500/20 text-gold-400 flex items-center justify-center text-[10px] font-bold">${i + 1}</span>
            <span class="font-bold text-white">Day ${i + 1} — ${city}</span>
          </div>
          <p class="text-slate-400 pl-8 text-[11px]">Curated local experiences, guided cultural immersion, and authentic culinary discovery.</p>
        </div>`;
    });
    daysContainer.innerHTML = previewDays.join('') +
      (CP_STATE.duration > 5 ? `<p class="text-xs text-slate-500 text-center italic">+ ${CP_STATE.duration - 5} more days will be detailed in your confirmation email.</p>` : '');
  }
  lucide.createIcons();
}

// ---- SUBMIT ----
async function submitCustomizePlan() {
  const btn = document.getElementById('cp-confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> <span>Confirming your journey...</span>';
    lucide.createIcons();
  }

  try {
    const token = localStorage.getItem('token') || '';
    const tripId = CP_STATE.generatedTrip?.id || CP_STATE.generatedTrip?.trip_id;
    let finalTrip;

    if (tripId) {
      // Confirm the already-generated trip
      const url = token ? `/api/trips/custom/${tripId}/confirm?token=${token}` : `/api/trips/custom/${tripId}/confirm`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!resp.ok) throw new Error('Confirm API failed');
      finalTrip = await resp.json();
    } else {
      // Direct save
      const destNames = CP_STATE.selectedDestinations
        .map(id => CP_DESTINATIONS.find(d => d.id === id)?.name)
        .filter(Boolean);
      const payload = {
        destination: destNames.join(', ') || 'Golden Triangle (Delhi, Agra, Jaipur)',
        destinations: destNames,
        places: destNames,
        travel_date: CP_STATE.startDate,
        start_date: CP_STATE.startDate,
        duration_days: CP_STATE.duration,
        travelers_count: CP_STATE.travelers,
        budget_usd: CP_STATE.budget,
        interests: CP_STATE.selectedCategories,
        guide_id: CP_STATE.selectedGuide || '',
        accommodation: CP_STATE.accommodation,
        transportation: CP_STATE.transport,
        daily_pace: CP_STATE.pace,
        photographer_required: CP_STATE.photographer !== 'None',
        photographer_tier: CP_STATE.photographer,
        custom_notes: CP_STATE.notes,
        starting_city: CP_STATE.startingCity,
        categories: CP_STATE.selectedCategories,
      };
      const url = token ? `/api/trips/custom?token=${token}` : '/api/trips/custom';
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error('Save API failed');
      finalTrip = await resp.json();

      // Now confirm it
      const tid = finalTrip?.id || finalTrip?.trip_id;
      if (tid) {
        const url2 = token ? `/api/trips/custom/${tid}/confirm?token=${token}` : `/api/trips/custom/${tid}/confirm`;
        await fetch(url2, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
      }
    }

    // Show success
    const destDisplay = CP_STATE.selectedDestinations
      .map(id => CP_DESTINATIONS.find(d => d.id === id)?.name)
      .filter(Boolean).join(', ') || finalTrip?.destination || 'Your Bespoke Journey';

    // Update success modal
    const successDest = document.getElementById('success-modal-dest');
    const successDates = document.getElementById('success-modal-dates');
    const successDuration = document.getElementById('success-modal-duration');
    const successStatus = document.getElementById('success-modal-status');
    const successMsg = document.getElementById('success-modal-journey-message');

    if (successDest) successDest.textContent = destDisplay;
    if (successDates) successDates.textContent = CP_STATE.startDate ? `Starting ${CP_STATE.startDate}` : 'Dates TBD';
    if (successDuration) successDuration.textContent = `${CP_STATE.duration} Days`;
    if (successStatus) successStatus.textContent = 'Confirmed • Upcoming';
    if (successMsg) successMsg.textContent = `"Your bespoke ${CP_STATE.duration}-day journey begins ${CP_STATE.startDate || 'soon'}."`;

    openModal('trip-success-modal');
    showToast('Journey Confirmed! 🎉', `Your ${CP_STATE.duration}-day trip to ${destDisplay} has been saved to My Plans.`, 'success');

    // Refresh My Plans in background
    if (typeof loadAndRenderMyPlans === 'function') loadAndRenderMyPlans();

    // Reset state
    CP_STATE.currentStep = 1;
    CP_STATE.selectedCategories = [];
    CP_STATE.selectedDestinations = [];
    CP_STATE.selectedGuide = null;
    CP_STATE.generatedTrip = null;

  } catch (err) {
    showToast('Error', 'Could not confirm your trip. Please try again.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5"></i><span>Confirm & Save My Bespoke Journey</span>';
      lucide.createIcons();
    }
  }
}

