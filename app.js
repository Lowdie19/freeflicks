/* ==========================================================================
   CONFIG & GLOBAL STATE
   ========================================================================== */
const TMDB_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";

let activeItem = null;
let currentServer = "videasy";
let currentSeason = 1;
let currentEpisode = 1;

// STREAMING PLATFORMS STATE & PROVIDER MAPPINGS (Region: PH)
const PLATFORMS_CONFIG = [
  { id: "netflix", name: "Netflix", providerId: 8, color: "#000000", iconImg: "assets/netflix.png" },
  { id: "disney", name: "Disney+", providerId: 337, color: "#113CCF", iconImg: "assets/disney.png" },
  { id: "prime", name: "Prime Video", providerId: 119, color: "#00A8E1", iconImg: "assets/primevideo.png" },
  { id: "hbo", name: "HBO Max", providerId: 1899, color: "#9e86ff", iconImg: "assets/hbomax.png" },
  { id: "viu", name: "Viu", providerId: 158, color: "#F5B919", iconImg: "assets/viu.png" },
  { id: "crunchyroll", name: "Crunchyroll", providerId: 283, color: "#F47521", iconImg: "assets/crunchyroll.png" },
  { id: "vivamax", name: "VivaMax", providerId: 1618, color: "#000000", iconImg: "assets/vivamax.png" }
];

let selectedPlatform = null;
let platformMediaType = "all"; // 'all', 'movie', 'tv'
let platformCurrentPage = 1;
let platformTotalPages = 1;
let isPlatformLoadingMore = false;
let displayedPlatformIds = new Set();
let latestPlatformRequestId = 0;

// HERO CAROUSEL STATE
let heroItems = [];
let currentHeroIndex = 0;
let heroTimer = null;
let heroTransitionLock = false;

// WATCHLIST STATE
let watchlist = [];
try {
  watchlist = JSON.parse(localStorage.getItem("popcornWatchlist")) || [];
} catch (e) {
  watchlist = [];
}

// REQUEST CACHING & RACE CONDITION CONTROL
const apiCache = new Map();
let latestSearchRequestId = 0;

// PAGINATION / LOAD MORE / SEE MORE STATE
let currentSearchQuery = "";
let searchCurrentPage = 1;
let searchTotalPages = 1;
let isSearchLoadingMore = false;
let displayedMovieSearchIds = new Set();

let movieRelatedCurrentPage = 1;
let movieRelatedTotalPages = 1;
let isMovieRelatedLoadingMore = false;
let displayedMovieRelatedIds = new Set();
let currentMovieRelatedMovieId = null;

// MOVIES PAGE PAGINATION STATE
let moviesCurrentPage = 1;
let moviesTotalPages = 1;
let isMoviesLoadingMore = false;
let displayedMoviesIds = new Set();

// TV SERIES PAGE PAGINATION STATE
let tvCurrentPage = 1;
let tvTotalPages = 1;
let isTvLoadingMore = false;
let displayedTvIds = new Set();

// PWA INSTALL STATE
let deferredPrompt = null;
let isInstalled = false;

// SPA HISTORY STATE LOCK
let isNavigatingHistory = false;

// TMDB GENRE MAP
const GENRE_MAP = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics"
};

/* ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  fetchHomeData();
  setupSearch();
  setupCatalogFilters();
  setupPlatformFilters();
  updateWatchlistBadge();
  setupMobileDrawerEvents();
  setupHeroSwipe();
  initPWA();
  initSpaNavigation();
  initBackToTopButton();
});


/* ==========================================================================
   MOBILE FLOATING BACK-TO-TOP BUTTON (INSIDE BOTTOM NAV)
   ========================================================================== */
function initBackToTopButton() {
  const navContainer = document.getElementById("mobileBottomNav");
  const btn = document.getElementById("mobileBackToTop");
  if (!navContainer || !btn) return;

  let ticking = false;

  const checkScrollPosition = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    
    // Lumitaw kapag umabot sa 45% ng page o lumampas ng 500px scroll
    const shouldShow = docHeight > 0 && (scrollTop / docHeight >= 0.45 || scrollTop > 500);

    if (shouldShow) {
      navContainer.classList.add("has-top-btn");
    } else {
      navContainer.classList.remove("has-top-btn");
    }
    
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(checkScrollPosition);
      ticking = true;
    }
  }, { passive: true });

  btn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}

/* ==========================================================================
   PWA SERVICE WORKER & INSTALLATION
   ========================================================================== */
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .catch(err => console.error('ServiceWorker registration failed: ', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButtonState();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    isInstalled = true;
    updateInstallButtonState();
  });

  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    isInstalled = true;
  }
  updateInstallButtonState();
}

function updateInstallButtonState() {
  const btn = document.getElementById("drawer-nav-install");
  const btnText = document.getElementById("installBtnText");
  if (!btn || !btnText) return;

  if (isInstalled) {
    btnText.innerText = "Installed";
    btn.disabled = true;
    btn.classList.add("opacity-40", "cursor-not-allowed", "pointer-events-none");
    btn.classList.remove("hover:text-secondary", "hover:bg-zinc-900");
  } else {
    btnText.innerText = "Install App";
    btn.disabled = false;
    btn.classList.remove("opacity-40", "cursor-not-allowed", "pointer-events-none");
    btn.classList.add("hover:text-secondary", "hover:bg-zinc-900");
  }
}

function handleInstallAppClick() {
  if (isInstalled) return;

  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        isInstalled = true;
        updateInstallButtonState();
      }
      deferredPrompt = null;
    });
  } else {
    alert("To install PopcornHUB, use your browser menu and select 'Add to Home Screen' or 'Install'.");
  }
}

/* ==========================================================================
   SPA HISTORY & PHYSICAL BACK BUTTON HANDLING
   ========================================================================== */
function initSpaNavigation() {
  history.replaceState({ pageId: "home" }, "", "#home");

  window.addEventListener("popstate", (event) => {
    isNavigatingHistory = true;
    if (event.state && event.state.pageId) {
      if (event.state.pageId === "detail" && event.state.item) {
        openCardDetail(event.state.item, true);
      } else if (event.state.pageId === "moviePlayer" && event.state.item) {
        setupMoviePlayer(event.state.item, true);
      } else if (event.state.pageId === "tvPlayer" && event.state.item) {
        setupTvPlayer(event.state.item, true);
      } else if (event.state.pageId === "platformCatalog" && event.state.platform) {
        openPlatformCatalog(event.state.platform, true);
      } else {
        switchPage(event.state.pageId, true);
      }
    } else {
      switchPage("home", true);
    }
    isNavigatingHistory = false;
  });
}

function pushSpaState(pageId, extraData = null) {
  if (isNavigatingHistory) return;
  const stateData = typeof extraData === "string" ? { pageId, platform: extraData } : { pageId, item: extraData };
  history.pushState(stateData, "", `#${pageId}`);
}

/* ==========================================================================
   MOBILE DRAWER & BOTTOM NAV HELPERS
   ========================================================================== */
function setupMobileDrawerEvents() {
  const overlay = document.getElementById("mobileDrawerOverlay");
  const closeBtn = document.getElementById("closeMobileDrawer");

  if (overlay) overlay.addEventListener("click", () => toggleMobileDrawer(false));
  if (closeBtn) closeBtn.addEventListener("click", () => toggleMobileDrawer(false));
}

function toggleMobileDrawer(open) {
  const drawer = document.getElementById("mobileDrawer");
  const overlay = document.getElementById("mobileDrawerOverlay");
  if (!drawer || !overlay) return;

  if (open) {
    drawer.classList.remove("-translate-x-full");
    overlay.classList.remove("opacity-0", "pointer-events-none");
    overlay.classList.add("opacity-100");
  } else {
    drawer.classList.add("-translate-x-full");
    overlay.classList.remove("opacity-100");
    overlay.classList.add("opacity-0", "pointer-events-none");
  }
}

function focusMobileSearch() {
  const input = document.getElementById("searchInput");
  if (input) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // May kaunting delay para umabot sa mata mo ang click animation bago sumulpot ang keyboard
    setTimeout(() => {
      input.focus();
    }, 100);
  }
}

/* ==========================================================================
   ROUTING & NAVIGATION
   ========================================================================== */
function switchPage(pageId, isBackEvent = false) {
  toggleMobileDrawer(false);

  document.querySelectorAll(".page-view").forEach(el => el.classList.add("hidden"));
  document.getElementById("searchView").classList.add("hidden");

  const targetView = document.getElementById(`${pageId}View`);
  if (targetView) targetView.classList.remove("hidden");

  if (!isBackEvent) {
    pushSpaState(pageId);
  }

  // Reset Desktop Nav highlight
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("text-brand"));
  const activeNav = document.getElementById(`nav-${pageId}`);
  if (activeNav) activeNav.classList.add("text-brand");

  // Reset Drawer Nav highlight
  document.querySelectorAll(".drawer-nav-btn").forEach(btn => {
    btn.classList.remove("text-brand", "bg-zinc-900/80");
    btn.classList.add("text-zinc-300");
  });
  const activeDrawerNav = document.getElementById(`drawer-nav-${pageId}`);
  if (activeDrawerNav) {
    activeDrawerNav.classList.add("text-brand", "bg-zinc-900/80");
    activeDrawerNav.classList.remove("text-zinc-300");
  }

  // Reset Bottom Nav highlight
  document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
    btn.classList.remove("text-brand");
    btn.classList.add("text-zinc-400");
  });
  const activeBottomHome = document.getElementById("bottom-nav-home");
  if (pageId === "home" && activeBottomHome) {
    activeBottomHome.classList.add("text-brand");
    activeBottomHome.classList.remove("text-zinc-400");
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (pageId === "movies") fetchMoviesCatalog(1);
  if (pageId === "tv") fetchTvCatalog(1);
  if (pageId === "platforms") renderPlatformsSelectionPage();
  if (pageId === "watchlist") renderWatchlistPage();
}

/* ==========================================================================
   IMAGE & DATA HELPERS
   ========================================================================== */
function createFallbackSVG(text) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
    <rect width="100%" height="100%" fill="#18181b"/>
    <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="#b5f818" font-family="sans-serif" font-size="28" font-weight="bold">PopcornHUB</text>
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="16">${text || 'No Poster Available'}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getTMDBImage(path, size = "w500", fallbackText = "No Image") {
  if (!path || path === "null" || path === "undefined") {
    return createFallbackSVG(fallbackText);
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

async function fetchTMDB(endpoint) {
  if (apiCache.has(endpoint)) {
    return apiCache.get(endpoint);
  }
  const url = `https://api.themoviedb.org/3/${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB error status: ${res.status}`);
    const data = await res.json();
    apiCache.set(endpoint, data);
    return data;
  } catch (err) {
    console.error("Fetch API Error:", err);
    return null;
  }
}

function formatTMDB(list, defaultType) {
  if (!Array.isArray(list)) return [];
  return list.map(i => {
    let resolvedType = i.media_type || defaultType || "movie";
    if (resolvedType !== "movie" && resolvedType !== "tv") {
      resolvedType = i.title ? "movie" : "tv";
    }

    let genreIds = Array.isArray(i.genre_ids) ? i.genre_ids : (Array.isArray(i.genres) ? i.genres.map(g => g.id) : []);

    let genreNames = [];
    if (Array.isArray(i.genre_ids)) {
      genreNames = i.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean);
    } else if (Array.isArray(i.genres)) {
      genreNames = i.genres.map(g => g.name).filter(Boolean);
    }

    return {
      id: i.id,
      title: i.title || i.name || "Untitled",
      poster: getTMDBImage(i.poster_path, "w500", i.title || i.name),
      backdrop: i.backdrop_path ? getTMDBImage(i.backdrop_path, "w1280", "Hero") : null,
      overview: i.overview || "No overview available.",
      type: resolvedType,
      rating: typeof i.vote_average === "number" && i.vote_average > 0 ? i.vote_average.toFixed(1) : "N/A",
      year: (i.release_date || i.first_air_date || "").split("-")[0] || "2026",
      genres: genreNames,
      genre_ids: genreIds
    };
  });
}

function getPlayNowGenreTypeString(item) {
  const typeLabel = item.type === "movie" ? "Movie" : "TV Series";
  if (item.genres && item.genres.length > 0) {
    return `${item.genres.join(" • ")} · ${typeLabel}`;
  }
  return typeLabel;
}

/* ==========================================================================
   DYNAMIC GENRE FILTER HELPER
   ========================================================================== */
function updateDynamicGenreOptions(selectElementId, rawItems) {
  const selectEl = document.getElementById(selectElementId);
  if (!selectEl) return;

  const currentSelected = selectEl.value;
  const presentGenreIds = new Set();

  if (Array.isArray(rawItems)) {
    rawItems.forEach(item => {
      if (Array.isArray(item.genre_ids)) {
        item.genre_ids.forEach(id => presentGenreIds.add(Number(id)));
      }
    });
  }

  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "ALL GENRES";
  selectEl.appendChild(defaultOption);

  const sortedGenreIds = Array.from(presentGenreIds)
    .filter(id => GENRE_MAP[id])
    .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));

  let selectedStillExists = false;

  sortedGenreIds.forEach(id => {
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = GENRE_MAP[id];

    if (String(id) === String(currentSelected)) {
      option.selected = true;
      selectedStillExists = true;
    }

    selectEl.appendChild(option);
  });

  if (selectedStillExists) {
    selectEl.value = currentSelected;
  } else {
    selectEl.value = "";
  }
}

/* ==========================================================================
   GRID RENDERING & CARDS
   ========================================================================== */
function renderGrid(containerId, items, append = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!append) {
    container.innerHTML = "";
  }

  if (!items || items.length === 0) {
    if (!append) {
      container.innerHTML = `<div class="col-span-full py-12 text-center text-zinc-500 text-sm">No titles found.</div>`;
    }
    return;
  }

  const isWatchlistPage = containerId === "watchlistGrid";
  const isTrendingRow = containerId === "homeTrendingTodayGrid" || containerId === "homeTrendingWeekGrid";

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "group bg-zinc-900 rounded-xl overflow-hidden cursor-pointer hover:-translate-y-1.5 transition duration-300 border border-zinc-800/80 hover:border-brand/50 flex flex-col min-w-[140px] sm:min-w-0 amber-glow";
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `${item.title} (${item.year})`);
    
    card.onclick = () => openCardDetail(item);
    card.onkeydown = (e) => { if (e.key === 'Enter') openCardDetail(item); };

    const isBookmarked = watchlist.some(i => i.id === item.id && i.type === item.type);

    let bookmarkIconClass = isBookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    let bookmarkTitle = isBookmarked ? 'Remove from Watchlist' : 'Add to Watchlist';

    if (isWatchlistPage) {
      bookmarkIconClass = 'fa-solid fa-trash';
      bookmarkTitle = 'Remove from Watchlist';
    }

    card.innerHTML = `
      <div class="aspect-[2/3] w-full bg-zinc-800 relative overflow-hidden">
        <img loading="lazy" 
             src="${item.poster}" 
             alt="${item.title}"
             onerror="this.onerror=null; this.src='${createFallbackSVG(item.title)}';"
             class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
        
        <!-- Attached Ribbon Bookmark at Upper-Left (Icon Only) -->
        <button class="bookmark-btn absolute card-bookmark-ribbon z-10 ${isBookmarked && !isWatchlistPage ? 'text-secondary' : ''}" 
                aria-label="${bookmarkTitle}"
                title="${bookmarkTitle}">
          <i class="${bookmarkIconClass}"></i>
        </button>

        <!-- Rating Star Badge at Upper-Right -->
        <div class="absolute top-2 right-2 z-10">
          <span class="bg-black/80 backdrop-blur-sm text-brand text-[10px] font-bold px-1.5 py-0.5 rounded border border-brand/30">★ ${item.rating}</span>
        </div>
      </div>
      <div class="p-2.5 flex flex-col justify-between flex-grow">
        <h3 class="font-semibold truncate group-hover:text-brand transition trending-card-title ${isTrendingRow ? 'text-sm' : 'text-xs'}" title="${item.title}">${item.title}</h3>
        <p class="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider trending-card-info">${item.year} • ${item.type}</p>
      </div>
    `;

    const bookmarkBtn = card.querySelector(".bookmark-btn");
    if (bookmarkBtn) {
      bookmarkBtn.onclick = (e) => {
        e.stopPropagation();
        if (isWatchlistPage) {
          card.classList.add("card-watchlist-removing");
          setTimeout(() => {
            toggleWatchlist(item);
          }, 250);
        } else {
          toggleWatchlist(item);
          const nowBookmarked = watchlist.some(i => i.id === item.id && i.type === item.type);
          bookmarkBtn.innerHTML = `<i class="${nowBookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}"></i>`;
          bookmarkBtn.className = `bookmark-btn absolute card-bookmark-ribbon z-10 ${nowBookmarked ? 'text-secondary' : ''}`;
          bookmarkBtn.title = nowBookmarked ? 'Remove from Watchlist' : 'Add to Watchlist';
        }
      };
    }

    container.appendChild(card);
  });
}

function renderGridLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const dummy = document.createElement("div");
    dummy.className = "bg-zinc-900/60 rounded-xl overflow-hidden border border-zinc-800/50 animate-pulse-bg aspect-[2/3] min-w-[140px] sm:min-w-0";
    container.appendChild(dummy);
  }
}

/* ==========================================================================
   MINIMALIST "LOAD MORE" & "SEE MORE" BUTTON UI GENERATOR
   ========================================================================== */
function renderLoadMoreButton(containerId, onClickHandler, buttonText = "LOAD MORE") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <button type="button" class="load-more-btn" aria-label="${buttonText}">
      <div class="load-more-circle">
        <i class="fa-solid fa-chevron-down text-xs"></i>
      </div>
      <span class="load-more-text">${buttonText}</span>
    </button>
  `;

  const btn = container.querySelector(".load-more-btn");
  if (btn) {
    btn.onclick = onClickHandler;
  }
}

function removeLoadMoreButton(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = "";
  }
}

function setLoadMoreState(containerId, isLoading, defaultText = "LOAD MORE") {
  const container = document.getElementById(containerId);
  if (!container) return;
  const btn = container.querySelector(".load-more-btn");
  if (!btn) return;

  const icon = btn.querySelector(".load-more-circle i");
  const text = btn.querySelector(".load-more-text");

  if (isLoading) {
    btn.disabled = true;
    btn.classList.add("is-loading");
    if (icon) icon.className = "fa-solid fa-spinner fa-spin text-xs";
    if (text) text.innerText = "Loading..";
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (icon) icon.className = "fa-solid fa-chevron-down text-xs";
    if (text) text.innerText = defaultText;
  }
}

/* ==========================================================================
   STREAMING PLATFORMS FEATURE
   ========================================================================== */
function renderPlatformsSelectionPage() {
  const container = document.getElementById("platformsSelectionGrid");
  if (!container) return;
  container.innerHTML = "";

  PLATFORMS_CONFIG.forEach(platform => {
    const card = document.createElement("div");
    card.className = "bg-zinc-900/90 rounded-xl p-5 border border-zinc-800/80 hover:border-brand/60 cursor-pointer transition duration-300 flex flex-col items-center justify-center space-y-3 platform-card-glow group";
    card.onclick = () => openPlatformCatalog(platform.id);

    card.innerHTML = `
      <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-110 transition duration-300" style="background-color: ${platform.color}">
        <img src="${platform.iconImg}" alt="${platform.name}" class="w-full h-full object-contain p-2">
      </div>
      <div class="text-center">
        <h3 class="font-bold text-sm text-white group-hover:text-brand transition">${platform.name}</h3>
        <p class="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Catalog</p>
      </div>
    `;

    container.appendChild(card);
  });
}

function openPlatformCatalog(platformId, isBackEvent = false) {
  selectedPlatform = PLATFORMS_CONFIG.find(p => p.id === platformId) || PLATFORMS_CONFIG[0];
  platformMediaType = "all";
  platformCurrentPage = 1;
  platformTotalPages = 1;
  displayedPlatformIds.clear();

  switchPage("platformCatalog", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("platformCatalog", platformId);
  }

  document.getElementById("platformCatalogTitle").innerText = selectedPlatform.name;
  document.getElementById("platformSearchFilter").value = "";
  document.getElementById("platformGenreFilter").value = "";
  document.getElementById("platformSortFilter").value = "popularity.desc";

  updatePlatformTypeButtonsUI();
  fetchPlatformCatalog(1);
}

function setPlatformTypeFilter(type) {
  platformMediaType = type;
  updatePlatformTypeButtonsUI();
  fetchPlatformCatalog(1);
}

function updatePlatformTypeButtonsUI() {
  const allBtn = document.getElementById("platformTypeAll");
  const movieBtn = document.getElementById("platformTypeMovies");
  const tvBtn = document.getElementById("platformTypeTv");

  [allBtn, movieBtn, tvBtn].forEach(btn => {
    if (btn) {
      btn.className = "px-3 py-1 text-xs font-bold rounded-md text-zinc-400 hover:text-white transition";
    }
  });

  if (platformMediaType === "all" && allBtn) {
    allBtn.className = "px-3 py-1 text-xs font-bold rounded-md bg-brand text-black transition";
  } else if (platformMediaType === "movie" && movieBtn) {
    movieBtn.className = "px-3 py-1 text-xs font-bold rounded-md bg-brand text-black transition";
  } else if (platformMediaType === "tv" && tvBtn) {
    tvBtn.className = "px-3 py-1 text-xs font-bold rounded-md bg-brand text-black transition";
  }
}

async function fetchPlatformCatalog(page = 1) {
  if (!selectedPlatform) return;
  
  const currentReqId = ++latestPlatformRequestId;

  if (page === 1) {
    renderGridLoading("platformCatalogGrid");
    removeLoadMoreButton("platformLoadMoreContainer");
    platformCurrentPage = 1;
    platformTotalPages = 1;
    displayedPlatformIds.clear();
  }

  const sort = document.getElementById("platformSortFilter").value;
  const query = document.getElementById("platformSearchFilter").value.trim();

  // 1. Search Mode Inside Platform
  if (query) {
    const data = await fetchTMDB(`search/multi?query=${encodeURIComponent(query)}&page=${page}`);
    if (currentReqId !== latestPlatformRequestId) return;

    if (data && data.results && data.results.length > 0) {
      platformTotalPages = data.total_pages || 1;
      let filtered = data.results.filter(r => r.media_type === "movie" || r.media_type === "tv");
      if (platformMediaType !== "all") {
        filtered = filtered.filter(r => r.media_type === platformMediaType);
      }

      if (page === 1) {
        updateDynamicGenreOptions("platformGenreFilter", filtered);
      }

      const activeGenreAfterUpdate = document.getElementById("platformGenreFilter").value;
      if (activeGenreAfterUpdate) {
        filtered = filtered.filter(r => {
          const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
          return ids.includes(Number(activeGenreAfterUpdate));
        });
      }

      const formatted = formatTMDB(filtered);
      const uniqueItems = formatted.filter(item => {
        const itemKey = `${item.type}_${item.id}`;
        if (displayedPlatformIds.has(itemKey)) return false;
        displayedPlatformIds.add(itemKey);
        return true;
      });

      renderGrid("platformCatalogGrid", uniqueItems, page > 1);

      if (page < platformTotalPages && uniqueItems.length > 0) {
        renderLoadMoreButton("platformLoadMoreContainer", handleLoadMorePlatform, "LOAD MORE");
      } else {
        removeLoadMoreButton("platformLoadMoreContainer");
      }
    } else {
      if (page === 1) {
        updateDynamicGenreOptions("platformGenreFilter", []);
        renderGrid("platformCatalogGrid", []);
      }
      removeLoadMoreButton("platformLoadMoreContainer");
    }
    return;
  }

  // 2. Discover Mode (ALL / MOVIES / TV SERIES)
  const pId = selectedPlatform.providerId;
  let rawItems = [];
  let maxPages = 1;

  try {
    if (page === 1) {
      let rawGenreSourceList = [];
      if (platformMediaType === "movie" || platformMediaType === "all") {
        const mBase = await fetchTMDB(`discover/movie?with_watch_providers=${pId}&watch_region=PH&sort_by=popularity.desc&page=1`);
        if (mBase && mBase.results) rawGenreSourceList = rawGenreSourceList.concat(mBase.results);
      }
      if (platformMediaType === "tv" || platformMediaType === "all") {
        const tBase = await fetchTMDB(`discover/tv?with_watch_providers=${pId}&watch_region=PH&sort_by=popularity.desc&page=1`);
        if (tBase && tBase.results) rawGenreSourceList = rawGenreSourceList.concat(tBase.results);
      }
      updateDynamicGenreOptions("platformGenreFilter", rawGenreSourceList);
    }

    const activeGenreFilter = document.getElementById("platformGenreFilter").value;

    if (platformMediaType === "movie" || platformMediaType === "all") {
      let movieEndpoint = `discover/movie?with_watch_providers=${pId}&watch_region=PH&sort_by=${sort}&page=${page}`;
      if (activeGenreFilter) movieEndpoint += `&with_genres=${activeGenreFilter}`;
      const mData = await fetchTMDB(movieEndpoint);
      if (mData && mData.results) {
        if (mData.total_pages > maxPages) maxPages = mData.total_pages;
        rawItems = rawItems.concat(formatTMDB(mData.results, "movie"));
      }
    }

    if (platformMediaType === "tv" || platformMediaType === "all") {
      let tvEndpoint = `discover/tv?with_watch_providers=${pId}&watch_region=PH&sort_by=${sort}&page=${page}`;
      if (activeGenreFilter) tvEndpoint += `&with_genres=${activeGenreFilter}`;
      const tData = await fetchTMDB(tvEndpoint);
      if (tData && tData.results) {
        if (tData.total_pages > maxPages) maxPages = tData.total_pages;
        rawItems = rawItems.concat(formatTMDB(tData.results, "tv"));
      }
    }

    if (currentReqId !== latestPlatformRequestId) return;

    platformTotalPages = maxPages;

    const uniqueItems = rawItems.filter(item => {
      const itemKey = `${item.type}_${item.id}`;
      if (displayedPlatformIds.has(itemKey)) return false;
      displayedPlatformIds.add(itemKey);
      return true;
    });

    renderGrid("platformCatalogGrid", uniqueItems, page > 1);

    if (page < platformTotalPages && uniqueItems.length > 0) {
      renderLoadMoreButton("platformLoadMoreContainer", handleLoadMorePlatform, "LOAD MORE");
    } else {
      removeLoadMoreButton("platformLoadMoreContainer");
    }
  } catch (e) {
    if (page === 1) renderGrid("platformCatalogGrid", []);
    removeLoadMoreButton("platformLoadMoreContainer");
  }
}

async function handleLoadMorePlatform() {
  if (isPlatformLoadingMore || platformCurrentPage >= platformTotalPages) return;

  isPlatformLoadingMore = true;
  setLoadMoreState("platformLoadMoreContainer", true, "LOAD MORE");

  const nextPage = platformCurrentPage + 1;
  await fetchPlatformCatalog(nextPage);
  platformCurrentPage = nextPage;

  isPlatformLoadingMore = false;
  if (platformCurrentPage < platformTotalPages) {
    setLoadMoreState("platformLoadMoreContainer", false, "LOAD MORE");
  }
}

function setupPlatformFilters() {
  const btn = document.getElementById("platformFilterBtn");
  if (btn) {
    btn.onclick = () => fetchPlatformCatalog(1);
  }

  const genreSelect = document.getElementById("platformGenreFilter");
  if (genreSelect) {
    genreSelect.addEventListener("change", () => fetchPlatformCatalog(1));
  }

  const sortSelect = document.getElementById("platformSortFilter");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => fetchPlatformCatalog(1));
  }

  const searchInput = document.getElementById("platformSearchFilter");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchPlatformCatalog(1), 350);
    });
  }
}

/* ==========================================================================
   HERO CAROUSEL SYSTEM
   ========================================================================== */
function initHeroCarousel() {
  if (!heroItems || heroItems.length === 0) return;
  renderHeroDots();
  renderHeroThumbnails();
  setHeroSlide(0);
  startHeroTimer();
}

function startHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    nextHeroSlide();
  }, 6000);
}

function nextHeroSlide() {
  if (!heroItems || heroItems.length === 0) return;
  const nextIdx = (currentHeroIndex + 1) % heroItems.length;
  setHeroSlide(nextIdx);
}

function previousHeroSlide() {
  if (!heroItems || heroItems.length === 0) return;
  const prevIdx = (currentHeroIndex - 1 + heroItems.length) % heroItems.length;
  setHeroSlide(prevIdx);
}

function setHeroSlide(index) {
  if (heroTransitionLock) return;
  heroTransitionLock = true;
  currentHeroIndex = index;
  const item = heroItems[index];

  const container = document.getElementById("heroContainer");
  const bg = document.getElementById("heroBg");

  container.classList.remove("hero-active");

  const backdropUrl = item.backdrop || item.poster || createFallbackSVG("PopcornHUB");
  const imgLoader = new Image();
  imgLoader.src = backdropUrl;

  const applySlide = () => {
    bg.classList.remove("loaded");
    setTimeout(() => {
      bg.style.backgroundImage = `url('${backdropUrl}')`;
      bg.classList.add("loaded");

      document.getElementById("heroTitle").innerText = item.title;
      document.getElementById("heroOverview").innerText = item.overview;
      document.getElementById("heroBadgeYear").innerText = `${item.type.toUpperCase()} • ${item.year}`;

      document.getElementById("heroPlayBtn").onclick = () => openCardDetail(item);

      updateHeroWatchlistBtn(item);
      document.getElementById("heroWatchlistBtn").onclick = () => {
        toggleWatchlist(item);
        updateHeroWatchlistBtn(item);
      };

      updateDotsUI();
      updateThumbnailsUI();

      container.classList.add("hero-active");
      heroTransitionLock = false;
    }, 150);
  };

  imgLoader.onload = applySlide;
  imgLoader.onerror = () => {
    bg.style.backgroundImage = `url('${createFallbackSVG("PopcornHUB")}')`;
    applySlide();
  };
}

function setupHeroSwipe() {
  const heroBanner = document.getElementById("heroBanner");
  if (!heroBanner) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  const minSwipeDistance = 40;

  heroBanner.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    deltaX = 0;
    deltaY = 0;
  }, { passive: true });

  heroBanner.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1) return;
    deltaX = e.touches[0].clientX - startX;
    deltaY = e.touches[0].clientY - startY;
  }, { passive: true });

  heroBanner.addEventListener("touchend", (e) => {
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        nextHeroSlide();
      } else {
        previousHeroSlide();
      }
      startHeroTimer();
    }
    startX = 0;
    startY = 0;
    deltaX = 0;
    deltaY = 0;
  }, { passive: true });
}

function updateHeroWatchlistBtn(item) {
  const btn = document.getElementById("heroWatchlistBtn");
  if (!btn) return;
  const isSaved = watchlist.some(i => i.id === item.id && i.type === item.type);
  if (isSaved) {
    btn.innerHTML = `<i class="fa-solid fa-check text-secondary"></i> WATCHLIST`;
    btn.className = "bg-secondary/20 border border-secondary text-secondary font-extrabold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl flex items-center gap-2 text-xs sm:text-sm transition active:scale-95";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-plus mr-1"></i> WATCHLIST`;
    btn.className = "glass-btn text-white font-extrabold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl flex items-center gap-2 text-xs sm:text-sm transition active:scale-95";
  }
}

function renderHeroDots() {
  const dotsContainer = document.getElementById("heroDots");
  if (!dotsContainer) return;
  dotsContainer.innerHTML = "";

  heroItems.forEach((_, idx) => {
    const dot = document.createElement("button");
    dot.setAttribute("aria-label", `Slide ${idx + 1}`);
    dot.className = `h-1.5 rounded-full transition-all duration-300 ${idx === currentHeroIndex ? 'w-8 bg-brand' : 'w-2 bg-white/30 hover:bg-white/60'}`;
    dot.onclick = () => {
      setHeroSlide(idx);
      startHeroTimer();
    };
    dotsContainer.appendChild(dot);
  });
}

function updateDotsUI() {
  const dots = document.querySelectorAll("#heroDots button");
  dots.forEach((dot, idx) => {
    dot.className = idx === currentHeroIndex 
      ? "h-1.5 w-8 bg-brand rounded-full transition-all duration-300"
      : "h-1.5 w-2 bg-white/30 hover:bg-white/60 rounded-full transition-all duration-300";
  });
}

function renderHeroThumbnails() {
  const thumbsContainer = document.getElementById("heroThumbnails");
  if (!thumbsContainer) return;
  thumbsContainer.innerHTML = "";

  heroItems.forEach((item, idx) => {
    const thumb = document.createElement("div");
    thumb.className = `w-12 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-300 ${idx === currentHeroIndex ? 'border-brand scale-110 shadow-lg shadow-brand/20' : 'border-transparent opacity-50 hover:opacity-100'}`;
    thumb.onclick = () => {
      setHeroSlide(idx);
      startHeroTimer();
    };
    thumb.innerHTML = `<img src="${item.poster}" alt="${item.title}" class="w-full h-full object-cover">`;
    thumbsContainer.appendChild(thumb);
  });
}

function updateThumbnailsUI() {
  const thumbs = document.querySelectorAll("#heroThumbnails > div");
  thumbs.forEach((thumb, idx) => {
    thumb.className = idx === currentHeroIndex
      ? "w-12 h-16 rounded-lg overflow-hidden cursor-pointer border-2 border-brand scale-110 shadow-lg shadow-brand/20 transition-all duration-300"
      : "w-12 h-16 rounded-lg overflow-hidden cursor-pointer border-2 border-transparent opacity-50 hover:opacity-100 transition-all duration-300";
  });
}

/* ==========================================================================
   FETCH HOME & CATALOG DATA
   ========================================================================== */
async function fetchHomeData() {
  renderGridLoading("homeTrendingTodayGrid");
  renderGridLoading("homeTrendingWeekGrid");
  renderGridLoading("homePopularMoviesGrid");
  renderGridLoading("homePopularTvGrid");

  try {
    const dataToday = await fetchTMDB("trending/all/day");
    if (dataToday && dataToday.results) {
      const itemsToday = formatTMDB(dataToday.results);
      if (itemsToday.length > 0) {
        heroItems = itemsToday.slice(0, 5);
        initHeroCarousel();
      }
      renderGrid("homeTrendingTodayGrid", itemsToday);
    } else {
      renderRowError("homeTrendingTodayGrid", "Unable to load today's trending titles.");
    }
  } catch (err) {
    renderRowError("homeTrendingTodayGrid", "Unable to load today's trending titles.");
  }

  try {
    const dataWeek = await fetchTMDB("trending/all/week");
    if (dataWeek && dataWeek.results) {
      renderGrid("homeTrendingWeekGrid", formatTMDB(dataWeek.results));
    } else {
      renderRowError("homeTrendingWeekGrid", "Unable to load weekly trending titles.");
    }
  } catch (err) {
    renderRowError("homeTrendingWeekGrid", "Unable to load weekly trending titles.");
  }

  try {
    const dataPopM = await fetchTMDB("movie/popular");
    if (dataPopM && dataPopM.results) {
      renderGrid("homePopularMoviesGrid", formatTMDB(dataPopM.results, "movie"));
    } else {
      renderRowError("homePopularMoviesGrid", "Unable to load popular movies.");
    }
  } catch (err) {
    renderRowError("homePopularMoviesGrid", "Unable to load popular movies.");
  }

  try {
    const dataPopTv = await fetchTMDB("tv/popular");
    if (dataPopTv && dataPopTv.results) {
      renderGrid("homePopularTvGrid", formatTMDB(dataPopTv.results, "tv"));
    } else {
      renderRowError("homePopularTvGrid", "Unable to load popular TV series.");
    }
  } catch (err) {
    renderRowError("homePopularTvGrid", "Unable to load popular TV series.");
  }
}

function renderRowError(containerId, message) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">${message}</p>`;
  }
}

async function fetchMoviesCatalog(page = 1) {
  if (page === 1) {
    renderGridLoading("moviesCatalogGrid");
    moviesCurrentPage = 1;
    moviesTotalPages = 1;
    displayedMoviesIds.clear();
    removeLoadMoreButton("moviesSeeMoreContainer");
  }

  const sort = document.getElementById("movieSortFilter") ? document.getElementById("movieSortFilter").value : "popularity.desc";
  const query = document.getElementById("movieSearchFilter") ? document.getElementById("movieSearchFilter").value.trim() : "";

  if (page === 1) {
    let rawGenreSourceEndpoint = `discover/movie?sort_by=popularity.desc&page=1`;
    if (query) rawGenreSourceEndpoint = `search/movie?query=${encodeURIComponent(query)}&page=1`;
    const genreSourceData = await fetchTMDB(rawGenreSourceEndpoint);
    if (genreSourceData && genreSourceData.results) {
      updateDynamicGenreOptions("movieGenreFilter", genreSourceData.results);
    }
  }

  const activeGenreFilter = document.getElementById("movieGenreFilter") ? document.getElementById("movieGenreFilter").value : "";

  let endpoint = `discover/movie?sort_by=${sort}&page=${page}`;
  if (activeGenreFilter) endpoint += `&with_genres=${activeGenreFilter}`;
  if (query) endpoint = `search/movie?query=${encodeURIComponent(query)}&page=${page}`;

  const data = await fetchTMDB(endpoint);

  if (data && data.results && data.results.length > 0) {
    moviesTotalPages = data.total_pages || 1;
    let resultsList = data.results;

    if (query && activeGenreFilter) {
      resultsList = resultsList.filter(r => {
        const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
        return ids.includes(Number(activeGenreFilter));
      });
    }

    const formatted = formatTMDB(resultsList, "movie");
    const uniqueItems = formatted.filter(item => !displayedMoviesIds.has(item.id));
    uniqueItems.forEach(item => displayedMoviesIds.add(item.id));

    renderGrid("moviesCatalogGrid", uniqueItems, page > 1);

    if (page < moviesTotalPages && uniqueItems.length > 0) {
      renderLoadMoreButton("moviesSeeMoreContainer", handleSeeMoreMovies, "SEE MORE");
    } else {
      removeLoadMoreButton("moviesSeeMoreContainer");
    }
  } else {
    if (page === 1) {
      document.getElementById("moviesCatalogGrid").innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">Unable to load movie catalog.</p>`;
    }
    removeLoadMoreButton("moviesSeeMoreContainer");
  }
}

async function handleSeeMoreMovies() {
  if (isMoviesLoadingMore || moviesCurrentPage >= moviesTotalPages) return;

  isMoviesLoadingMore = true;
  setLoadMoreState("moviesSeeMoreContainer", true, "SEE MORE");

  const nextPage = moviesCurrentPage + 1;
  await fetchMoviesCatalog(nextPage);
  moviesCurrentPage = nextPage;

  isMoviesLoadingMore = false;
  if (moviesCurrentPage < moviesTotalPages) {
    setLoadMoreState("moviesSeeMoreContainer", false, "SEE MORE");
  }
}

async function fetchTvCatalog(page = 1) {
  if (page === 1) {
    renderGridLoading("tvCatalogGrid");
    tvCurrentPage = 1;
    tvTotalPages = 1;
    displayedTvIds.clear();
    removeLoadMoreButton("tvSeeMoreContainer");
  }

  const sort = document.getElementById("tvSortFilter") ? document.getElementById("tvSortFilter").value : "popularity.desc";
  const query = document.getElementById("tvSearchFilter") ? document.getElementById("tvSearchFilter").value.trim() : "";

  if (page === 1) {
    let rawGenreSourceEndpoint = `discover/tv?sort_by=popularity.desc&page=1`;
    if (query) rawGenreSourceEndpoint = `search/tv?query=${encodeURIComponent(query)}&page=1`;
    const genreSourceData = await fetchTMDB(rawGenreSourceEndpoint);
    if (genreSourceData && genreSourceData.results) {
      updateDynamicGenreOptions("tvGenreFilter", genreSourceData.results);
    }
  }

  const activeGenreFilter = document.getElementById("tvGenreFilter") ? document.getElementById("tvGenreFilter").value : "";

  let endpoint = `discover/tv?sort_by=${sort}&page=${page}`;
  if (activeGenreFilter) endpoint += `&with_genres=${activeGenreFilter}`;
  if (query) endpoint = `search/tv?query=${encodeURIComponent(query)}&page=${page}`;

  const data = await fetchTMDB(endpoint);

  if (data && data.results && data.results.length > 0) {
    tvTotalPages = data.total_pages || 1;
    let resultsList = data.results;

    if (query && activeGenreFilter) {
      resultsList = resultsList.filter(r => {
        const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
        return ids.includes(Number(activeGenreFilter));
      });
    }

    const formatted = formatTMDB(resultsList, "tv");
    const uniqueItems = formatted.filter(item => !displayedTvIds.has(item.id));
    uniqueItems.forEach(item => displayedTvIds.add(item.id));

    renderGrid("tvCatalogGrid", uniqueItems, page > 1);

    if (page < tvTotalPages && uniqueItems.length > 0) {
      renderLoadMoreButton("tvSeeMoreContainer", handleSeeMoreTv, "SEE MORE");
    } else {
      removeLoadMoreButton("tvSeeMoreContainer");
    }
  } else {
    if (page === 1) {
      document.getElementById("tvCatalogGrid").innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">Unable to load TV series catalog.</p>`;
    }
    removeLoadMoreButton("tvSeeMoreContainer");
  }
}

async function handleSeeMoreTv() {
  if (isTvLoadingMore || tvCurrentPage >= tvTotalPages) return;

  isTvLoadingMore = true;
  setLoadMoreState("tvSeeMoreContainer", true, "SEE MORE");

  const nextPage = tvCurrentPage + 1;
  await fetchTvCatalog(nextPage);
  tvCurrentPage = nextPage;

  isTvLoadingMore = false;
  if (tvCurrentPage < tvTotalPages) {
    setLoadMoreState("tvSeeMoreContainer", false, "SEE MORE");
  }
}

function setupCatalogFilters() {
  const movieFilterBtn = document.getElementById("movieFilterBtn");
  if (movieFilterBtn) {
    movieFilterBtn.onclick = () => fetchMoviesCatalog(1);
  }

  const movieGenreSelect = document.getElementById("movieGenreFilter");
  if (movieGenreSelect) {
    movieGenreSelect.addEventListener("change", () => fetchMoviesCatalog(1));
  }

  const movieSortSelect = document.getElementById("movieSortFilter");
  if (movieSortSelect) {
    movieSortSelect.addEventListener("change", () => fetchMoviesCatalog(1));
  }

  const movieSearchFilter = document.getElementById("movieSearchFilter");
  if (movieSearchFilter) {
    let timer;
    movieSearchFilter.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchMoviesCatalog(1), 350);
    });
  }

  const tvFilterBtn = document.getElementById("tvFilterBtn");
  if (tvFilterBtn) {
    tvFilterBtn.onclick = () => fetchTvCatalog(1);
  }

  const tvGenreSelect = document.getElementById("tvGenreFilter");
  if (tvGenreSelect) {
    tvGenreSelect.addEventListener("change", () => fetchTvCatalog(1));
  }

  const tvSortSelect = document.getElementById("tvSortFilter");
  if (tvSortSelect) {
    tvSortSelect.addEventListener("change", () => fetchTvCatalog(1));
  }

  const tvSearchFilter = document.getElementById("tvSearchFilter");
  if (tvSearchFilter) {
    let timer;
    tvSearchFilter.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchTvCatalog(1), 350);
    });
  }
}

/* ==========================================================================
   DETAIL VIEW & TRAILERS
   ========================================================================== */
async function openCardDetail(item, isBackEvent = false) {
  activeItem = item;
  switchPage("detail", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("detail", item);
  }

  document.getElementById("detailTitle").innerText = item.title;
  document.getElementById("detailOverview").innerText = item.overview;
  
  const detailPoster = document.getElementById("detailPoster");
  detailPoster.src = item.poster;
  detailPoster.onerror = () => { detailPoster.src = createFallbackSVG(item.title); };

  document.getElementById("detailBadgeType").innerText = item.type === "movie" ? "MOVIE" : "TV SERIES";
  document.getElementById("detailBadgeRating").innerText = `★ ${item.rating}`;
  document.getElementById("detailBadgeYear").innerText = item.year;

  const genresEl = document.getElementById("detailGenres");
  if (genresEl) {
    genresEl.innerText = (item.genres && item.genres.length > 0) ? item.genres.join(" • ") : "";
  }

  updateDetailWatchlistButton();
  document.getElementById("detailWatchlistBtn").onclick = () => toggleWatchlist(item);
  document.getElementById("detailPlayNowBtn").onclick = () => launchPlayer(item);

  const trailerFrame = document.getElementById("trailerFrame");
  const trailerFallback = document.getElementById("trailerFallback");
  trailerFrame.src = "";
  trailerFrame.classList.add("hidden");
  trailerFallback.classList.remove("hidden");

  const videoData = await fetchTMDB(`${item.type}/${item.id}/videos`);
  if (videoData && videoData.results) {
    const trailer = videoData.results.find(v => (v.type === "Trailer" || v.type === "Teaser") && v.site === "YouTube");
    if (trailer) {
      trailerFrame.src = `https://www.youtube.com/embed/${trailer.key}`;
      trailerFrame.classList.remove("hidden");
      trailerFallback.classList.add("hidden");
    }
  }
}

/* ==========================================================================
   WATCHLIST MANAGEMENT
   ========================================================================== */
function toggleWatchlist(item) {
  const index = watchlist.findIndex(i => i.id === item.id && i.type === item.type);
  if (index > -1) {
    watchlist.splice(index, 1);
  } else {
    watchlist.push(item);
  }
  
  try {
    localStorage.setItem("popcornWatchlist", JSON.stringify(watchlist));
  } catch (e) {
    console.error("LocalStorage error:", e);
  }

  updateDetailWatchlistButton();
  updateWatchlistBadge();

  if (!document.getElementById("watchlistView").classList.contains("hidden")) {
    renderWatchlistPage();
  }
}

function updateDetailWatchlistButton() {
  const btn = document.getElementById("detailWatchlistBtn");
  if (!activeItem || !btn) return;

  const isSaved = watchlist.some(i => i.id === activeItem.id && i.type === activeItem.type);
  if (isSaved) {
    btn.innerHTML = `<i class="fa-solid fa-check text-secondary"></i> WATCHLIST`;
    btn.className = "bg-secondary/20 border border-secondary text-secondary font-extrabold px-6 py-3 rounded-xl flex items-center gap-2 text-sm transition";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-plus mr-1"></i> WATCHLIST`;
    btn.className = "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 font-extrabold px-6 py-3 rounded-xl flex items-center gap-2 text-sm transition";
  }
}

function updateWatchlistBadge() {
  const badge = document.getElementById("watchlistBadgeCount");
  const drawerBadge = document.getElementById("drawerWatchlistBadgeCount");

  const count = watchlist.length;
  [badge, drawerBadge].forEach(b => {
    if (!b) return;
    if (count > 0) {
      b.innerText = count;
      b.classList.remove("hidden");
    } else {
      b.classList.add("hidden");
    }
  });
}

function renderWatchlistPage() {
  renderGrid("watchlistGrid", watchlist);
}

/* ==========================================================================
   PLAYERS & SERVER SELECTION
   ========================================================================== */
function launchPlayer(item) {
  if (item.type === "movie") {
    setupMoviePlayer(item);
  } else {
    setupTvPlayer(item);
  }
}

function setupMoviePlayer(item, isBackEvent = false) {
  switchPage("moviePlayer", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("moviePlayer", item);
  }

  document.getElementById("moviePlayerTitle").innerText = item.title;
  
  const movieContextTitle = document.getElementById("moviePlayerContextTitle");
  if (movieContextTitle) {
    movieContextTitle.innerText = item.title;
  }

  renderServers("movieServerList", (srv) => {
    currentServer = srv;
    loadMovieIframe(item.id);
  });

  loadMovieIframe(item.id);
  fetchRelated(item.type, item.id, "movieRelatedGrid");
}

function loadMovieIframe(id) {
  let url = `https://player.videasy.to/movie/${id}`;
  if (currentServer === "vidlink") url = `https://vidlink.pro/movie/${id}`;
  document.getElementById("movieIframe").src = url;
}

async function setupTvPlayer(item, isBackEvent = false) {
  switchPage("tvPlayer", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("tvPlayer", item);
  }

  document.getElementById("tvPlayerTitle").innerText = item.title;

  currentSeason = 1;
  currentEpisode = 1;

  const tvContextDetail = document.getElementById("tvPlayerContextDetail");
  if (tvContextDetail) {
    tvContextDetail.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;
  }

  renderServers("tvServerList", (srv) => {
    currentServer = srv;
    loadTvIframe(item.id);
  });

  const seasonTabs = document.getElementById("seasonTabs");
  const epGrid = document.getElementById("episodesGrid");
  seasonTabs.innerHTML = `<span class="text-xs text-zinc-500">Loading seasons...</span>`;
  epGrid.innerHTML = "";

  const tvData = await fetchTMDB(`tv/${item.id}`);
  const seasons = (tvData && tvData.seasons) ? tvData.seasons.filter(s => s.season_number > 0) : [];

  seasonTabs.innerHTML = "";
  if (seasons.length === 0) {
    seasonTabs.innerHTML = `<span class="text-xs text-zinc-500">No season data available.</span>`;
    return;
  }

  seasons.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = `px-4 py-2 rounded-lg font-bold text-xs transition ${s.season_number === currentSeason ? 'bg-brand text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`;
    btn.innerText = `Season ${s.season_number}`;
    btn.onclick = () => {
      currentSeason = s.season_number;
      currentEpisode = 1;

      if (tvContextDetail) {
        tvContextDetail.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;
      }
      
      document.querySelectorAll("#seasonTabs button").forEach(b => {
        b.className = "px-4 py-2 rounded-lg font-bold text-xs transition bg-zinc-800 text-zinc-300 hover:bg-zinc-700";
      });
      btn.className = "px-4 py-2 rounded-lg font-bold text-xs transition bg-brand text-black";

      renderTvEpisodes(item.id, s.episode_count);
      loadTvIframe(item.id);
    };
    seasonTabs.appendChild(btn);
  });

  renderTvEpisodes(item.id, seasons[0].episode_count);
  loadTvIframe(item.id);
  fetchRelated(item.type, item.id, "tvRelatedGrid");
}

function renderTvEpisodes(tvId, episodeCount) {
  const epGrid = document.getElementById("episodesGrid");
  epGrid.innerHTML = "";

  const count = episodeCount || 10;
  for (let e = 1; e <= count; e++) {
    const epBtn = document.createElement("button");
    epBtn.className = `p-3 rounded-xl text-left flex items-center gap-3 transition border ${e === currentEpisode ? 'bg-zinc-800 border-brand' : 'bg-zinc-900 border-zinc-800 hover:border-brand/50'}`;
    epBtn.onclick = () => {
      currentEpisode = e;
      const tvContextDetail = document.getElementById("tvPlayerContextDetail");
      if (tvContextDetail) {
        tvContextDetail.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;
      }
      document.querySelectorAll("#episodesGrid button").forEach(b => {
        b.className = "bg-zinc-900 border border-zinc-800 hover:border-brand/50 p-3 rounded-xl text-left flex items-center gap-3 transition";
      });
      epBtn.className = "bg-zinc-800 border border-brand p-3 rounded-xl text-left flex items-center gap-3 transition";
      loadTvIframe(tvId);
    };

    epBtn.innerHTML = `
      <div class="bg-brand/20 text-brand p-2 rounded-lg font-extrabold text-xs">E${e}</div>
      <div>
        <p class="text-xs font-bold text-zinc-200">Episode ${e}</p>
        <p class="text-[10px] text-zinc-500">Season ${currentSeason}</p>
      </div>
    `;
    epGrid.appendChild(epBtn);
  }
}

function loadTvIframe(id) {
  let url = `https://player.videasy.to/tv/${id}/${currentSeason}/${currentEpisode}`;
  if (currentServer === "vidlink") url = `https://vidlink.pro/tv/${id}/${currentSeason}/${currentEpisode}`;
  document.getElementById("tvIframe").src = url;
}

function renderServers(containerId, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const servers = [
    { id: "videasy", name: "Nova" },
    { id: "vidlink", name: "Vortex" }
  ];

  container.innerHTML = "";
  servers.forEach(s => {
    const btn = document.createElement("button");
    btn.className = `px-4 py-2 rounded-lg text-xs font-bold transition border ${currentServer === s.id ? 'bg-brand text-black border-brand' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`;
    btn.innerText = s.name;
    btn.onclick = () => {
      document.querySelectorAll(`#${containerId} button`).forEach(b => {
        b.className = "px-4 py-2 rounded-lg text-xs font-bold transition border bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700";
      });
      btn.className = "px-4 py-2 rounded-lg text-xs font-bold transition border bg-brand text-black border-brand";
      onClick(s.id);
    };
    container.appendChild(btn);
  });
}

/* ==========================================================================
   RELATED & SIMILAR CONTENT
   ========================================================================== */
async function fetchRelated(type, id, targetId) {
  renderGridLoading(targetId);
  removeLoadMoreButton("movieRelatedLoadMoreContainer");

  if (type === "movie") {
    currentMovieRelatedMovieId = id;
    movieRelatedCurrentPage = 1;
    movieRelatedTotalPages = 1;
    displayedMovieRelatedIds.clear();

    const data = await fetchTMDB(`movie/${id}/recommendations?page=1`);
    if (data && data.results && data.results.length > 0) {
      movieRelatedTotalPages = data.total_pages || 1;
      const filtered = formatTMDB(data.results.filter(i => i.id !== id), "movie");
      filtered.forEach(item => displayedMovieRelatedIds.add(item.id));

      renderGrid(targetId, filtered);

      if (movieRelatedCurrentPage < movieRelatedTotalPages && filtered.length > 0) {
        renderLoadMoreButton("movieRelatedLoadMoreContainer", handleLoadMoreMovieRelated, "LOAD MORE");
      } else {
        removeLoadMoreButton("movieRelatedLoadMoreContainer");
      }
    } else {
      const fallback = await fetchTMDB(`movie/${id}/similar?page=1`);
      if (fallback && fallback.results && fallback.results.length > 0) {
        movieRelatedTotalPages = fallback.total_pages || 1;
        const filtered = formatTMDB(fallback.results.filter(i => i.id !== id), "movie");
        filtered.forEach(item => displayedMovieRelatedIds.add(item.id));

        renderGrid(targetId, filtered);

        if (movieRelatedCurrentPage < movieRelatedTotalPages && filtered.length > 0) {
          renderLoadMoreButton("movieRelatedLoadMoreContainer", handleLoadMoreMovieRelated, "LOAD MORE");
        } else {
          removeLoadMoreButton("movieRelatedLoadMoreContainer");
        }
      } else {
        renderGrid(targetId, []);
        removeLoadMoreButton("movieRelatedLoadMoreContainer");
      }
    }
  } else {
    const data = await fetchTMDB(`tv/${id}/recommendations?page=1`);
    if (data && data.results && data.results.length > 0) {
      renderGrid(targetId, formatTMDB(data.results.filter(i => i.id !== id), "tv"));
    } else {
      const fallback = await fetchTMDB(`tv/${id}/similar?page=1`);
      if (fallback && fallback.results) {
        renderGrid(targetId, formatTMDB(fallback.results.filter(i => i.id !== id), "tv"));
      } else {
        renderGrid(targetId, []);
      }
    }
  }
}

async function handleLoadMoreMovieRelated() {
  if (isMovieRelatedLoadingMore || movieRelatedCurrentPage >= movieRelatedTotalPages || !currentMovieRelatedMovieId) return;

  isMovieRelatedLoadingMore = true;
  setLoadMoreState("movieRelatedLoadMoreContainer", true, "LOAD MORE");

  const nextPage = movieRelatedCurrentPage + 1;
  const data = await fetchTMDB(`movie/${currentMovieRelatedMovieId}/recommendations?page=${nextPage}`);

  if (data && data.results && data.results.length > 0) {
    movieRelatedCurrentPage = nextPage;
    const formatted = formatTMDB(data.results.filter(i => i.id !== currentMovieRelatedMovieId), "movie");
    const uniqueItems = formatted.filter(item => !displayedMovieRelatedIds.has(item.id));
    uniqueItems.forEach(item => displayedMovieRelatedIds.add(item.id));

    renderGrid("movieRelatedGrid", uniqueItems, true);

    if (movieRelatedCurrentPage < movieRelatedTotalPages && uniqueItems.length > 0) {
      setLoadMoreState("movieRelatedLoadMoreContainer", false, "LOAD MORE");
    } else {
      removeLoadMoreButton("movieRelatedLoadMoreContainer");
    }
  } else {
    removeLoadMoreButton("movieRelatedLoadMoreContainer");
  }

  isMovieRelatedLoadingMore = false;
}

/* ==========================================================================
   GLOBAL NAVBAR SEARCH & PAGINATION
   ========================================================================== */
function setupSearch() {
  const input = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  let timer;

  input.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      clearBtn.classList.remove("hidden");
    } else {
      clearBtn.classList.add("hidden");
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      if (query.length >= 2) {
        currentSearchQuery = query;
        performSearch(query, 1);
      } else if (query.length === 0) {
        clearSearch();
      }
    }, 400);
  });
}

function clearSearch() {
  const input = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("hidden");

  currentSearchQuery = "";
  searchCurrentPage = 1;
  searchTotalPages = 1;
  displayedMovieSearchIds.clear();

  document.getElementById("searchView").classList.add("hidden");
  switchPage("home");
}

async function performSearch(query, page = 1) {
  const currentReqId = ++latestSearchRequestId;

  if (page === 1) {
    document.querySelectorAll(".page-view").forEach(el => el.classList.add("hidden"));
    document.getElementById("searchView").classList.remove("hidden");
    renderGridLoading("searchResultsGrid");
    removeLoadMoreButton("searchLoadMoreContainer");
    searchCurrentPage = 1;
    searchTotalPages = 1;
    displayedMovieSearchIds.clear();
  }

  const data = await fetchTMDB(`search/multi?query=${encodeURIComponent(query)}&page=${page}`);

  if (currentReqId !== latestSearchRequestId) return;

  if (data && data.results && data.results.length > 0) {
    searchTotalPages = data.total_pages || 1;
    const filtered = data.results.filter(r => r.media_type === "movie" || r.media_type === "tv");
    const formatted = formatTMDB(filtered);

    const uniqueItems = formatted.filter(item => {
      const itemKey = `${item.type}_${item.id}`;
      if (displayedMovieSearchIds.has(itemKey)) return false;
      displayedMovieSearchIds.add(itemKey);
      return true;
    });

    renderGrid("searchResultsGrid", uniqueItems, page > 1);

    if (page < searchTotalPages && uniqueItems.length > 0) {
      renderLoadMoreButton("searchLoadMoreContainer", handleLoadMoreSearch, "LOAD MORE");
    } else {
      removeLoadMoreButton("searchLoadMoreContainer");
    }
  } else {
    if (page === 1) renderGrid("searchResultsGrid", []);
    removeLoadMoreButton("searchLoadMoreContainer");
  }
}

async function handleLoadMoreSearch() {
  if (isSearchLoadingMore || searchCurrentPage >= searchTotalPages || !currentSearchQuery) return;

  isSearchLoadingMore = true;
  setLoadMoreState("searchLoadMoreContainer", true, "LOAD MORE");

  const nextPage = searchCurrentPage + 1;
  await performSearch(currentSearchQuery, nextPage);
  searchCurrentPage = nextPage;

  isSearchLoadingMore = false;
  if (searchCurrentPage < searchTotalPages) {
    setLoadMoreState("searchLoadMoreContainer", false, "LOAD MORE");
  }
}
