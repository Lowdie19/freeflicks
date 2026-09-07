/* ==========================================================================
   CONFIG & GLOBAL STATE
   ========================================================================== */
const TMDB_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";

let activeItem = null;
let currentServer = "videasy";
let currentSeason = 1;
let currentEpisode = 1;

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
  updateWatchlistBadge();
  setupMobileDrawerEvents();
  setupHeroSwipe();
  initPWA();
  initSpaNavigation();
});

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
      } else {
        switchPage(event.state.pageId, true);
      }
    } else {
      switchPage("home", true);
    }
    isNavigatingHistory = false;
  });
}

function pushSpaState(pageId, item = null) {
  if (isNavigatingHistory) return;
  const stateData = { pageId, item };
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
    input.focus();
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

  if (pageId === "movies") fetchCatalog("movie", "moviesCatalogGrid");
  if (pageId === "tv") fetchCatalog("tv", "tvCatalogGrid");
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
      genres: genreNames
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
   GRID RENDERING & CARDS
   ========================================================================== */
function renderGrid(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-zinc-500 text-sm">Your watchlist is empty.</div>`;
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
  }, 6000); // Balanced timer for smooth viewing
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

  // ROW 1: TRENDING TODAY (/trending/all/day)
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

  // ROW 2: TRENDING THIS WEEK (/trending/all/week)
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

  // ROW 3: POPULAR MOVIES (/movie/popular)
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

  // ROW 4: POPULAR TV SERIES (/tv/popular)
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

async function fetchCatalog(type, targetId) {
  renderGridLoading(targetId);
  const endpoint = type === "movie" ? "movie/popular" : "tv/popular";
  const data = await fetchTMDB(endpoint);
  if (data && data.results) {
    renderGrid(targetId, formatTMDB(data.results, type));
  } else {
    document.getElementById(targetId).innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">Unable to load content catalog.</p>`;
  }
}

function setupCatalogFilters() {
  const movieFilterBtn = document.getElementById("movieFilterBtn");
  if (movieFilterBtn) {
    movieFilterBtn.onclick = async () => {
      renderGridLoading("moviesCatalogGrid");
      const genre = document.getElementById("movieGenreFilter").value;
      const sort = document.getElementById("movieSortFilter").value;
      const query = document.getElementById("movieSearchFilter").value.trim();

      let endpoint = `discover/movie?sort_by=${sort}`;
      if (genre) endpoint += `&with_genres=${genre}`;
      if (query) endpoint = `search/movie?query=${encodeURIComponent(query)}`;

      const data = await fetchTMDB(endpoint);
      renderGrid("moviesCatalogGrid", formatTMDB(data ? data.results : [], "movie"));
    };
  }

  const tvFilterBtn = document.getElementById("tvFilterBtn");
  if (tvFilterBtn) {
    tvFilterBtn.onclick = async () => {
      renderGridLoading("tvCatalogGrid");
      const genre = document.getElementById("tvGenreFilter").value;
      const sort = document.getElementById("tvSortFilter").value;
      const query = document.getElementById("tvSearchFilter").value.trim();

      let endpoint = `discover/tv?sort_by=${sort}`;
      if (genre) endpoint += `&with_genres=${genre}`;
      if (query) endpoint = `search/tv?query=${encodeURIComponent(query)}`;

      const data = await fetchTMDB(endpoint);
      renderGrid("tvCatalogGrid", formatTMDB(data ? data.results : [], "tv"));
    };
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
    { id: "videasy", name: "Videasy" },
    { id: "vidlink", name: "VidLink" }
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
  
  let data = await fetchTMDB(`${type}/${id}/recommendations`);
  if (!data || !data.results || data.results.length === 0) {
    data = await fetchTMDB(`${type}/${id}/similar`);
  }

  if (data && data.results && data.results.length > 0) {
    const filtered = data.results.filter(i => i.id !== id);
    renderGrid(targetId, formatTMDB(filtered.slice(0, 5), type));
  } else {
    const fallback = await fetchTMDB(`trending/${type}/week`);
    if (fallback && fallback.results) {
      renderGrid(targetId, formatTMDB(fallback.results.slice(0, 5), type));
    } else {
      document.getElementById(targetId).innerHTML = `<p class="text-zinc-500 text-xs col-span-full">No recommendations found.</p>`;
    }
  }
}

/* ==========================================================================
   GLOBAL SEARCH SYSTEM
   ========================================================================== */
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  let timer;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length > 1) {
      timer = setTimeout(() => executeSearch(q), 350);
    } else if (q === "") {
      clearSearch();
    }
  });
}

async function executeSearch(query) {
  const currentRequestId = ++latestSearchRequestId;
  document.getElementById("clearSearch").classList.remove("hidden");
  document.querySelectorAll(".page-view").forEach(el => el.classList.add("hidden"));
  document.getElementById("searchView").classList.remove("hidden");

  renderGridLoading("searchResultsGrid");

  const data = await fetchTMDB(`search/multi?query=${encodeURIComponent(query)}`);
  
  if (currentRequestId !== latestSearchRequestId) return;

  if (data && data.results) {
    const results = data.results.filter(r => r.media_type === "movie" || r.media_type === "tv");
    renderGrid("searchResultsGrid", formatTMDB(results));
  } else {
    document.getElementById("searchResultsGrid").innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">No matching titles found.</p>`;
  }
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  document.getElementById("clearSearch").classList.add("hidden");
  switchPage("home");
}
