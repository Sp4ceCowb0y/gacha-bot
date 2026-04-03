// ==UserScript==
// @name         GachaBot (Beta)
// @namespace    http://tampermonkey.net/
// @version      1.34-beta
// @description  Auto-open packs + collection filter panel for gacha.miz.to
// @author       Sp4ceCowb0y
// @match        https://gacha.miz.to/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Sp4ceCowb0y/gacha-bot/dev/gacha-bot.user.js
// @downloadURL  https://raw.githubusercontent.com/Sp4ceCowb0y/gacha-bot/dev/gacha-bot.user.js
// ==/UserScript==

// ───────────────────────────────────────────────────────────────────
//  CHANGELOG
// ───────────────────────────────────────────────────────────────────
//  v1.34 Add: clicking anywhere outside the history panel now closes it.
//        Add: "Remember Deleted" blacklist in the Auto-Delete panel. When enabled,
//        deleted cards matching the configured rarities (default: legendary + epic)
//        are stored in gcb-blacklist and auto-deleted whenever they are repulled,
//        independently of the rarity/nationality rules.
//
//  v1.33 Bump version to trigger Tampermonkey auto-update (v1.32 shipped without
//        a version increment so existing installs did not detect the update).
//
//  v1.32 Fix: rename "Auto Open" label to "Auto-Open" for consistency with
//        Auto-Delete. Add README with feature overview and installation guide.
//
//  v1.31 Fix: auto-deleted cards not showing DELETED banner in real-time history
//        updates. Root cause: runAutoDelete was fire-and-forget so the deletion
//        API calls and saveDeletedInstance hadn't finished by the time
//        prependPackToHistory built the tiles. tryScrapePack is now async and
//        awaits runAutoDelete before rendering the live tile.
//
//  v1.30 History window is now a draggable floating panel (like the main panel)
//        instead of a full-screen overlay, so both can be visible at the same time.
//  v1.29 Fix: auto-delete not firing. Three bugs: (1) rarity mode button never
//        initialized its text from saved config — always showed "Include" on
//        reload. (2) textarea saves used "change" (fires on blur only) — if the
//        user typed a country/name and opened a pack before clicking away, the
//        config was stale. Changed to "input" so config saves on every keystroke.
//        (3) inline onclick="stopPropagation()" on the toggle label was likely
//        blocked by site CSP — replaced with a JS addEventListener. Added
//        console.log to runAutoDelete showing the live config per pack.
//
//  v1.28 Fix: auto-deleted cards now show DELETED banner in pack history tiles.
//        runAutoDelete now receives the pack timestamp and calls
//        saveDeletedInstance so buildCardTile renders the banner correctly.
//
//  v1.27 Add: Auto-Delete panel (collapsible). Configure which rarities and
//        nationalities to auto-delete on pull, with a name whitelist that
//        always takes precedence. Deletions fire via API immediately after
//        pack cards are scraped, and are stamped into gcb-collection-deleted.
//
//  v1.26 Fix: "Favourites: hide" still showed natively-favourited cards. data-gcb-fav
//        is only stamped by our localStorage, so cards favourited through the site
//        itself were invisible to the filter. isFav now also checks the native fav
//        button class (bg-[#78350f]) as the authoritative source of truth.
//
//  v1.25 Add: Favourites filter now cycles off → ♥ Only → ✕ Hide via a single
//        button. favsMode replaces favsOnly (values: 'off'|'only'|'hide').
//
//  v1.24 Add: "♥ Favourites only" toggle in collection filter panel. Works
//        independently of rarity, country, and shiny filters. Uses the existing
//        data-gcb-fav attribute stamped by applyCollectionFavStates().
//
//  v1.23 Fix: clearing the native search filter in Collection tab showed "Load
//        more" instead of auto-expanding. collectionTabWasSeen was a one-time
//        gate so loadAllCards() never re-ran mid-session. Now also triggers when
//        a "Load more" button reappears while the tab is already active.
//
//  v1.22 Fix: deleted card briefly flashing when switching to Collection tab or
//        using the native search filter. Root cause: data-gcb-deleted is stamped
//        by JS after React paints, so the card is visible for one render frame.
//        Fix: inject a <style> with CSS :has() rules for each deleted player ID
//        immediately when markCollectionDeleted() is called, and restore them
//        on boot. CSS is applied by the browser before paint, so deleted cards
//        are never visible even for a single frame.
//
//  v1.21 Fix: deleted cards briefly flashing on Collection tab switch (removed
//        unnecessary requestAnimationFrame from v1.19 — no longer needed since
//        v1.20 stamps attributes instead of removing nodes). Fix: filter count
//        included deleted cards ("Showing 1 of 1") — applyFilters now skips
//        [data-gcb-deleted="true"] wrappers entirely.
//
//  v1.20 Fix: crash "Node.removeChild: The node to be removed is not a child of
//        this node" — root cause was that calling w.remove() on a React-managed
//        node lets React crash when its fiber later tries removeChild on the same
//        node. requestAnimationFrame (v1.19) wasn't enough. Fix: never remove
//        nodes from React's DOM. Instead stamp data-gcb-deleted="true" on the
//        wrapper and hide it with CSS, identical to the data-gcb-fav approach.
//
//  v1.18 Fix: deleted cards reappearing when switching to Collection tab after
//        deleting from the Pull/history screen. Radix unmounts the inactive tab,
//        so DOM removal was a no-op. Now persists deleted player IDs in
//        gcb-collection-deleted and purges them every time the Collection tab
//        activates, before filters run.
//
//  v1.17 Fav/delete in history panel now click the native collection card buttons
//        (❤️/🤍 and 🗑) so React handles the API call and collection state update
//        itself. No more page reloads. Removed dead router-finding code
//        (findNextRouter, refreshCollectionData, _nextRouter, _routerRefreshKey).
//
//  v1.16 findNextRouter uses structural heuristics (4–8 fn props, ≤10 keys) to
//        find the router even with minified method names. Falls back to
//        window.location.reload() if router still not found. gachaRouterScan()
//        added to dump context providers with function properties for diagnosis.
//
//  v1.15 Collection refresh now uses Next.js router.refresh() (RSC soft-refresh)
//        instead of React Query invalidation. The collection is a Server Component
//        so client-side invalidation had no effect. router.refresh() re-fetches
//        server components for the current route without a full page reload.
//        DOM removal still runs immediately for instant visual feedback on delete.
//
//  v1.14 Collection tab now updates immediately after fav/delete — direct DOM
//        manipulation removes the deleted card and toggles the heart icon without
//        relying on React Query re-rendering. React Query invalidation is still
//        called as a background reconciliation step.
//
//  v1.13 Deleted state persists per pack-card instance (gcb-deleted-instances
//        keyed by `${packTimestamp}_${cardId}`). Same player in a different pack
//        opens un-deleted. invalidateCollectionCache clears cached client ref on
//        error so stale references don't silently block future invalidations.
//
//  v1.12 React Query cache invalidation fixed — site uses Next.js App Router
//        so React renders into <body>, not #__next. findQueryClient now falls
//        back to document.body. Collection tab updates after fav/delete from
//        the history modal without a page reload. Deleted state is now
//        per-tile-instance so the same player in another pack is unaffected.
//
//  v1.11 History tiles — country flag next to player name, full-opacity 2 px
//        rarity border (was 25% dim). Collection refresh after fav/delete now
//        clicks away and back to the collection tab so React re-fetches server
//        state rather than just running loadAllCards again.
//
//  v1.10 Card tiles — 160 px wide (matching collection), 2 px red border and
//        18 px heart badge when favourited. apiToggleFavourite uses POST
//        (toggle endpoint) so unfav works correctly. Refreshes collection tab
//        after fav/delete via refreshCollectionIfVisible().
//
//  v1.9  Card tiles — larger, matching collection card size. Fav button red,
//        toggles to Unfav, persists via gcb-card-states. Deleted cards stay
//        greyed out on reopen. All API calls log status to console.
//
//  v1.8  Card actions — Fav now logs the API response to console on failure
//        so the actual error is visible. Heart badge (♥) appears on the tile
//        after a successful favourite. Deleted cards dim to 0.3 opacity with
//        pointer-events disabled and no longer show the action overlay.
//
//  v1.7  History scraping reliability — cards animate in one-by-one and React
//        briefly remounts .z-1000 during state updates, making simple time- or
//        button-based dedup fire repeatedly for the same overlay. Final design:
//        in-memory content fingerprint (sorted card IDs); saves as soon as 5
//        cards are present in .z-1000; fingerprint resets only after .z-1000
//        has been continuously absent for 2 s so React remounts don't trigger
//        a spurious reset and re-save.
//
//  v1.6  Shiny filter fix — legendary cards have a 4s shimmer overlay; shiny
//        cards use a 3s shimmer with rounded-md. isShiny() now keys on the
//        rounded-md class so legendaries no longer appear in "Shiny only".
//        Footer fix — site footer is position:absolute;bottom:0 inside a
//        positioned container; enforcing min-height:100vh on that container
//        keeps the footer anchored when filtered cards shrink the page.
//        Pack history now captured via MutationObserver (handles manual opens
//        too) with a 10s dedup guard.
//
//  v1.5  Pack history modal — auto-captures cards from every auto-opened
//        pack, shown via the 🕓 button in the panel header. Per-card
//        Favourite (POST /api/favorites) and Delete (DELETE /api/collection)
//        actions wired to the site API. Up to 500 packs stored in
//        localStorage.
//
//  v1.4  Auto-open from overlay — enabling Auto Open while the result
//        overlay is already visible now starts the bot immediately.
//        Panel always opens top-right under the site header (no saved
//        position restore). Window resize re-clamps panel on-screen.
//
//  v1.3  Min-packs threshold — "Open only if ≥ X packs" stepper added
//        to the panel. Bot goes back to home when threshold drops below
//        X mid-session. Fixed readPackCount() to use a 3-class specific
//        selector so overlay card-rarity labels no longer fool it.
//
//  v1.2  Smooth incremental loading — CSS opacity override injected
//        before the load loop so each batch becomes visible as it
//        arrives. Country list and filters update after every batch.
//        All countries ticked by default; All / None buttons added.
//        Removed the "COLLECTION FILTER" label.
//
//  v1.1  Collection filter panel — rarity buttons, shiny-only toggle,
//        per-country checkboxes with flag icons. Auto-clicks "Load more"
//        until the full collection is loaded. MutationObserver debounced
//        to 300 ms to prevent cascade loops.
//
//  v1.0  Initial release — auto-open packs bot with toggleable panel,
//        random delays, overlay detection, draggable floating panel,
//        pack counter display, and FAB collapse button.
// ───────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════
  //  CONFIG
  // ═══════════════════════════════════════════════════════════════
  const RESULT_VIEW_DELAY_MS = 10 * 1000;
  const POLL_RATE_MS = 300;
  const FALLBACK_CHECK_MS = 5 * 1000;

  const RARITIES = ["mythic", "legendary", "epic", "rare", "uncommon", "common"];
  const RARITY_COLORS = {
    mythic: "#ef4444",
    legendary: "#fcd34d",
    epic: "#c084fc",
    rare: "#60a5fa",
    uncommon: "#4ade80",
    common: "#9ca3af",
  };

  // ═══════════════════════════════════════════════════════════════
  //  PERSISTED STATE
  // ═══════════════════════════════════════════════════════════════
  const prefs = {
    get autoOpen() {
      return localStorage.getItem("gcb-auto-open") !== "false";
    },
    set autoOpen(v) {
      localStorage.setItem("gcb-auto-open", v);
    },
    get minPacks() {
      return parseInt(localStorage.getItem("gcb-min-packs") || "1");
    },
    set minPacks(v) {
      localStorage.setItem("gcb-min-packs", v);
    },
  };

  // ═══════════════════════════════════════════════════════════════
  //  AUTO-OPEN — helpers
  // ═══════════════════════════════════════════════════════════════
  let running = false;

  function findButton(text) {
    const lower = text.toLowerCase();
    for (const btn of document.querySelectorAll("button")) {
      if (!btn.disabled && (btn.innerText || "").trim().toLowerCase() === lower)
        return btn;
    }
    return null;
  }

  function waitForButton(text, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const id = setInterval(() => {
        const btn = findButton(text);
        if (btn) {
          clearInterval(id);
          resolve(btn);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(id);
          reject(new Error(`Timeout: "${text}"`));
        }
      }, POLL_RATE_MS);
    });
  }

  function isResultOverlayVisible() {
    return (
      !!document.querySelector(".z-1000") ||
      !!(findButton("Back to home") || findButton("Open next pack"))
    );
  }

  function waitForOverlay(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const id = setInterval(() => {
        if (isResultOverlayVisible()) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(id);
          reject(new Error("Overlay timeout"));
        }
      }, POLL_RATE_MS);
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function randomDelay(min = 800, max = 2500) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return sleep(ms);
  }

  function readPackCount() {
    // Target the header pack counter specifically: <p class="font-bold font-mono text-[#60A5FA]">
    const el = document.querySelector(
      "p.font-bold.font-mono.text-\\[\\#60A5FA\\], p.font-bold.font-mono.text-\\[\\#60a5fa\\]",
    );
    if (el) {
      const n = parseInt(el.textContent);
      if (!isNaN(n)) return n;
    }
    return -1;
  }

  function setStatus(msg, color = "#6b7280") {
    const el = document.getElementById("gcb-status");
    if (el) {
      el.textContent = msg;
      el.style.color = color;
    }
  }

  async function openAllPacks() {
    if (running) return;
    running = true;
    setStatus("Opening packs...", "#60a5fa");
    try {
      while (true) {
        const openBtn = findButton("Open Pack") || findButton("Open next pack");
        if (!openBtn) {
          // Already on result overlay with no more packs — go back home
          if (isResultOverlayVisible()) {
            try {
              const back = await waitForButton("Back to home", 3000);
              await randomDelay();
              back.click();
            } catch {
              /* ignore */
            }
          }
          break;
        }

        await randomDelay();
        openBtn.click();

        try {
          await waitForOverlay(12000);
        } catch {
          setStatus("Overlay not found", "#ef4444");
          break;
        }

        setStatus(`Viewing cards...`, "#a78bfa");
        // Poll for pack cards during the viewing window instead of relying solely
        // on the MutationObserver debounce, which may not fire if the overlay has
        // continuous DOM activity that keeps resetting the 300ms quiet window.
        const scrapeInterval = setInterval(tryScrapePack, 500);
        await sleep(RESULT_VIEW_DELAY_MS);
        clearInterval(scrapeInterval);

        if (findButton("Open next pack")) {
          const count = readPackCount();
          if (count !== -1 && count < prefs.minPacks) {
            // Threshold no longer met — go home instead of opening next
            try {
              const back = await waitForButton("Back to home", 5000);
              await randomDelay();
              back.click();
            } catch {
              /* ignore */
            }
            break;
          }
          continue;
        }

        try {
          const back = await waitForButton("Back to home", 5000);
          await randomDelay();
          back.click();
        } catch {
          /* ignore */
        }
        break;
      }
    } catch (err) {
      console.warn("[GachaBot]", err.message);
    } finally {
      running = false;
      const count = readPackCount();
      setStatus(
        count === 0 ? "Waiting for packs..." : "Watching...",
        count === 0 ? "#4b5563" : "#4ade80",
      );
      updatePackDisplay();
    }
  }

  function tryStart() {
    if (!prefs.autoOpen) return;
    if (running) return;
    const count = readPackCount();
    if (count !== -1 && count < prefs.minPacks) return; // below threshold
    if (findButton("Open Pack") || isResultOverlayVisible()) openAllPacks();
  }

  // ═══════════════════════════════════════════════════════════════
  //  COLLECTION FILTER — helpers
  // ═══════════════════════════════════════════════════════════════
  const filterState = {
    countries: new Set(),
    rarities: new Set(),
    shinyOnly: false,
    favsMode: "off", // 'off' | 'only' | 'hide'
  };

  function isCollectionTabActive() {
    const t = document.querySelector("#tabs-content-collection");
    return t && t.dataset.state === "active";
  }

  function getCardWrappers() {
    return document.querySelectorAll(
      "#tabs-content-collection .grid > .relative",
    );
  }

  function getCountryCode(card) {
    const img = card.querySelector('img[src*="flag-icons/flags/4x3/"]');
    if (!img) return null;
    const m = img.src.match(/flags\/4x3\/([a-z]+)\.svg/);
    return m ? m[1] : null;
  }

  function getRarity(card) {
    const p = card.querySelector(
      'a > div > p[class*="font-semibold"][class*="uppercase"]',
    );
    return p ? p.textContent.trim().toLowerCase() : null;
  }

  function isShiny(card) {
    // Legendary rarity shimmer: animate-[shimmer_4s_...] — no rounded-md
    // Shiny card shimmer:       animate-[shimmer_3s_...] rounded-md  ← unique marker
    return !!card.querySelector('[class*="shimmer"][class*="rounded-md"]');
  }

  function applyFilters() {
    const wrappers = getCardWrappers();
    let visible = 0;
    let total = 0;
    for (const w of wrappers) {
      // Cards hidden by our delete stamp are excluded from count and filtering.
      // CSS handles their display:none via [data-gcb-deleted="true"] { display:none !important }.
      if (w.dataset.gcbDeleted === "true") continue;
      total++;
      const country = getCountryCode(w);
      const rarity = getRarity(w);
      const shiny = isShiny(w);
      const countryOk = !country || filterState.countries.has(country);
      const rarityOk =
        filterState.rarities.size === 0 ||
        (rarity && filterState.rarities.has(rarity));
      const shinyOk = !filterState.shinyOnly || shiny;
      const isFav = w.dataset.gcbFav === "true" || !!w.querySelector('button[class*="78350f"]');
      const favOk =
        filterState.favsMode === "only" ? isFav :
        filterState.favsMode === "hide" ? !isFav :
        true;
      const show = countryOk && rarityOk && shinyOk && favOk;
      w.style.display = show ? "" : "none";
      if (show) visible++;
    }
    if (!loadingAllCards) {
      const el = document.getElementById("gcb-filter-count");
      if (el) el.textContent = `Showing ${visible} of ${total} cards`;
    }
  }

  function collectCountries() {
    const map = new Map();
    for (const w of getCardWrappers()) {
      const img = w.querySelector('img[src*="flag-icons/flags/4x3/"]');
      if (!img) continue;
      const m = img.src.match(/flags\/4x3\/([a-z]+)\.svg/);
      if (m) map.set(m[1], img.src);
    }
    return map;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PACK HISTORY
  // ═══════════════════════════════════════════════════════════════
  const MAX_HISTORY_PACKS = 500;
  const PACK_SIZE = 5; // cards per pack on this site

  // In-memory fingerprint of the overlay currently displayed.
  // null = no overlay has been saved yet / overlay is confirmed closed.
  let currentPackFp = null;
  let overlayGoneTimer = null; // debounce for overlay-close detection
  let historyWindowOpen = false; // tracks whether the history panel is visible
  let mythicWindowOpen = false;  // tracks whether the mythic pulls panel is visible

  function packFingerprint(cards) {
    return cards
      .map((c) => c.id)
      .sort()
      .join(",");
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem("gcb-history") || "[]");
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    if (history.length > MAX_HISTORY_PACKS)
      history = history.slice(-MAX_HISTORY_PACKS);
    localStorage.setItem("gcb-history", JSON.stringify(history));
  }

  // Called from the MutationObserver (300 ms debounce).
  //
  // Gate: .z-1000 (the overlay container) must be present.
  // Reset: currentPackFp is cleared only after .z-1000 has been
  //   continuously absent for 2 s — React may briefly remount the element
  //   during state updates, which would otherwise cause a spurious reset
  //   and re-save of the same pack.
  // Save: fires as soon as PACK_SIZE cards are found; no need to wait for
  //   action buttons.
  async function tryScrapePack() {
    if (!document.querySelector(".z-1000")) {
      // Defer the reset in case .z-1000 flickers during a React re-render
      if (!overlayGoneTimer) {
        overlayGoneTimer = setTimeout(() => {
          currentPackFp = null;
          overlayGoneTimer = null;
        }, 2000);
      }
      return;
    }

    // Overlay is present — cancel any pending reset
    clearTimeout(overlayGoneTimer);
    overlayGoneTimer = null;

    const cards = scrapeOverlayCards();
    if (cards.length < PACK_SIZE) return; // still animating in

    const fp = packFingerprint(cards);
    if (fp === currentPackFp) return; // already saved this overlay

    currentPackFp = fp;
    const packTs = Date.now();
    const hist = loadHistory();
    hist.push({ timestamp: packTs, cards });
    saveHistory(hist);
    await runAutoDelete(cards, packTs); // wait so deleted state is stamped before building tiles
    if (historyWindowOpen) prependPackToHistory({ timestamp: packTs, cards });
    const mythics = cards.filter(c => c.rarity === "mythic");
    if (mythics.length) {
      showMythicNotification(mythics);
      if (mythicWindowOpen) prependMythicCards(mythics);
    }
  }

  function scrapeOverlayCards() {
    const cards = [];
    // Look inside the overlay container first; fall back to whole page
    const root = document.querySelector(".z-1000") || document.body;
    const links = root.querySelectorAll('a[href*="/users/"]');
    const seen = new Set();
    for (const a of links) {
      const m = a.href.match(/users\/(\d+)/);
      if (!m) continue;
      const id = parseInt(m[1]);
      if (seen.has(id)) continue;
      seen.add(id);

      const nameEl = a.querySelector("p.font-bold:not(.font-mono)");
      const rarityEl = a.querySelector(
        'p[class*="font-semibold"][class*="uppercase"]',
      );
      const flagEl = a.querySelector('img[src*="flags/4x3/"]');
      const flagM = flagEl
        ? flagEl.src.match(/flags\/4x3\/([a-z]+)\.svg/)
        : null;

      const name = nameEl ? nameEl.textContent.trim() : "";
      const rarity = rarityEl ? rarityEl.textContent.trim().toLowerCase() : "";
      const country = flagM ? flagM[1] : "";
      const shiny = !!a.querySelector(
        '[class*="shimmer"][class*="rounded-md"]',
      );
      const avatar = `https://a.ppy.sh/${id}`;

      if (name) {
        const card = { id, name, rarity, country, avatar, shiny };
        cacheCardMeta(card);
        cards.push(card);
      }
    }
    return cards;
  }

  // POST /api/favorites is a toggle — returns { isFavorite: bool }.
  // Call it once to fav, call it again to unfav.
  async function apiToggleFavourite(playerId) {
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const text = await res.text().catch(() => "");
      console.log(`[GachaBot] apiToggleFavourite ${res.status}:`, text);
      if (!res.ok) return null;
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    } catch (err) {
      console.warn("[GachaBot] apiToggleFavourite error:", err);
      return null;
    }
  }

  async function apiDelete(playerId) {
    try {
      const res = await fetch("/api/collection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: [playerId] }),
      });
      const text = await res.text().catch(() => "");
      console.log(`[GachaBot] apiDelete ${res.status}:`, text);
      return res.ok;
    } catch (err) {
      console.warn("[GachaBot] apiDelete error:", err);
      return false;
    }
  }

  // Per-card state (favourited) persisted across modal reopens — keyed by player ID.
  function loadCardStates() {
    try {
      return JSON.parse(localStorage.getItem("gcb-card-states") || "{}");
    } catch {
      return {};
    }
  }
  function saveCardState(id, patch) {
    const all = loadCardStates();
    all[id] = Object.assign(all[id] || {}, patch);
    localStorage.setItem("gcb-card-states", JSON.stringify(all));
  }

  // Per-pack-card deleted state — keyed by `${packTimestamp}_${cardId}`.
  // This lets the same player appear un-deleted in a different pack.
  function loadDeletedInstances() {
    try {
      return JSON.parse(localStorage.getItem("gcb-deleted-instances") || "{}");
    } catch {
      return {};
    }
  }
  function saveDeletedInstance(packTs, cardId) {
    const all = loadDeletedInstances();
    all[`${packTs}_${cardId}`] = true;
    localStorage.setItem("gcb-deleted-instances", JSON.stringify(all));
  }

  // Collection-level deleted IDs — keyed by player ID, checked on every Collection tab activation.
  // Handles the case where the tab was inactive (unmounted) at deletion time so DOM removal was a no-op.
  function loadCollectionDeleted() {
    try {
      return new Set(
        JSON.parse(localStorage.getItem("gcb-collection-deleted") || "[]"),
      );
    } catch {
      return new Set();
    }
  }
  function saveCollectionDeleted(ids) {
    localStorage.setItem(
      "gcb-collection-deleted",
      JSON.stringify([...ids]),
    );
  }
  function markCollectionDeleted(playerId) {
    const ids = loadCollectionDeleted();
    ids.add(playerId);
    saveCollectionDeleted(ids);
    updateDeletedCssRules(ids);
  }

  // ─── Auto-delete config ────────────────────────────────────────────────────
  const AD_KEY = "gcb-auto-delete";
  const BL_KEY = "gcb-blacklist";
  const BL_CFG_KEY = "gcb-blacklist-cfg";

  function loadBlacklist() {
    try { return JSON.parse(localStorage.getItem(BL_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveBlacklist(bl) {
    localStorage.setItem(BL_KEY, JSON.stringify(bl));
  }

  function loadBlacklistConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(BL_CFG_KEY) || "{}");
      return {
        enabled:  !!raw.enabled,
        rarities: new Set(raw.rarities || ["legendary", "epic"]),
      };
    } catch {
      return { enabled: false, rarities: new Set(["legendary", "epic"]) };
    }
  }
  function saveBlacklistConfig(cfg) {
    localStorage.setItem(BL_CFG_KEY, JSON.stringify({
      enabled:  cfg.enabled,
      rarities: [...cfg.rarities],
    }));
  }

  // Add a card to the blacklist if blacklisting is enabled and the card's
  // rarity is in the configured set. Safe to call on every delete.
  function addToBlacklist(card) {
    const cfg = loadBlacklistConfig();
    if (!cfg.enabled) return;
    if (!cfg.rarities.has(card.rarity)) return;
    const bl = loadBlacklist();
    bl[card.id] = { name: card.name, rarity: card.rarity, country: card.country };
    saveBlacklist(bl);
  }

  // ─── Card metadata cache ───────────────────────────────────────────────────
  // Persists { name, rarity, country } keyed by player ID so the fetch hook can
  // look up card details when a native deletion is intercepted.
  const CARD_META_KEY = "gcb-card-meta";
  function loadCardMeta() {
    try { return JSON.parse(localStorage.getItem(CARD_META_KEY) || "{}"); }
    catch { return {}; }
  }
  function cacheCardMeta(card) {
    if (!card.id || !card.name) return;
    const meta = loadCardMeta();
    meta[card.id] = { name: card.name, rarity: card.rarity, country: card.country };
    localStorage.setItem(CARD_META_KEY, JSON.stringify(meta));
  }
  function lookupCardMeta(playerId) {
    return loadCardMeta()[playerId] || null;
  }

  function removeFromBlacklist(id) {
    const bl = loadBlacklist();
    delete bl[id];
    saveBlacklist(bl);
  }

  // Returns true if this card ID is in the blacklist AND blacklisting is enabled.
  function isBlacklisted(cardId) {
    if (!loadBlacklistConfig().enabled) return false;
    return !!loadBlacklist()[cardId];
  }

  function loadAutoDeleteConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(AD_KEY) || "{}");
      return {
        enabled:    !!raw.enabled,
        rarityMode: raw.rarityMode || "include",
        rarities:   new Set(raw.rarities || []),
        natMode:    raw.natMode    || "include",
        nations:    new Set(raw.nations   || []),
        whitelist:  new Set((raw.whitelist || []).map(n => n.toLowerCase().normalize("NFC"))),
      };
    } catch {
      return {
        enabled: false, rarityMode: "include", rarities: new Set(),
        natMode: "include", nations: new Set(), whitelist: new Set(),
      };
    }
  }

  function saveAutoDeleteConfig(cfg) {
    localStorage.setItem(AD_KEY, JSON.stringify({
      enabled:    cfg.enabled,
      rarityMode: cfg.rarityMode,
      rarities:   [...cfg.rarities],
      natMode:    cfg.natMode,
      nations:    [...cfg.nations],
      whitelist:  [...cfg.whitelist],
    }));
  }

  // Returns true if the card should be auto-deleted given the config.
  // Whitelist always wins. If no rarity or nationality filters are configured,
  // nothing is deleted (safe default). When only one dimension is configured,
  // the other is ignored (passes freely).
  function shouldAutoDelete(card, cfg) {
    if (!cfg.enabled) return false;
    if (cfg.whitelist.has((card.name || "").toLowerCase().normalize("NFC"))) return false;

    const hasRarityFilter = cfg.rarities.size > 0;
    const hasNatFilter    = cfg.nations.size  > 0;
    if (!hasRarityFilter && !hasNatFilter) return false; // nothing configured → do nothing

    if (hasRarityFilter) {
      const match = cfg.rarities.has(card.rarity);
      if (cfg.rarityMode === "include" ? !match : match) return false;
    }
    if (hasNatFilter) {
      const match = cfg.nations.has(card.country);
      if (cfg.natMode === "include" ? !match : match) return false;
    }
    return true;
  }

  // Fire-and-forget: delete all cards from a newly scraped pack that match the
  // auto-delete rules. Runs in the background so it doesn't block the observer.
  async function runAutoDelete(cards, packTs) {
    const cfg = loadAutoDeleteConfig();
    console.log(`[GachaBot] runAutoDelete: enabled=${cfg.enabled}, rarities=[${[...cfg.rarities]}], natMode=${cfg.natMode}, nations=[${[...cfg.nations]}], cards=${cards.map(c => `${c.name}(${c.rarity},${c.country})`).join(", ")}`);
    if (!cfg.enabled) return;
    for (const card of cards) {
      if (!shouldAutoDelete(card, cfg) && !isBlacklisted(card.id)) continue;
      const ok = await apiDelete(card.id);
      if (ok) {
        markCollectionDeleted(card.id);
        if (packTs) saveDeletedInstance(packTs, card.id);
        addToBlacklist(card);
        console.log(`[GachaBot] Auto-deleted: ${card.name} (${card.rarity}, ${card.country})`);
      }
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Intercept native DELETE /api/collection requests so that cards deleted
  // through the site's own UI are still marked and blacklisted by our script.
  function installFetchHook() {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const [input, init] = args;
        const url = typeof input === "string" ? input : input?.url || "";
        const method = (init?.method || (input?.method) || "GET").toUpperCase();
        if (method === "DELETE" && url.includes("/api/collection") && res.ok) {
          const body = init?.body || input?.body;
          if (body) {
            const parsed = JSON.parse(typeof body === "string" ? body : await new Response(body).text());
            for (const id of parsed.playerIds || []) {
              markCollectionDeleted(id);
              const meta = lookupCardMeta(id);
              if (meta) addToBlacklist({ id, ...meta });
            }
          }
        }
      } catch {
        // never break the original request
      }
      return res;
    };
  }
  installFetchHook();

  // Injects/updates a <style> with :has() rules for every deleted player ID.
  // CSS is applied by the browser before paint, so cards are never visible even
  // for a single frame when React renders the collection tab from RSC cache.
  function updateDeletedCssRules(ids) {
    if (!ids) ids = loadCollectionDeleted();
    let el = document.getElementById("gcb-deleted-rules");
    if (!el) {
      el = document.createElement("style");
      el.id = "gcb-deleted-rules";
      document.head.appendChild(el);
    }
    if (!ids.size) { el.textContent = ""; return; }
    el.textContent = [...ids].map(id =>
      `#tabs-content-collection .grid > .relative:has(a[href*="/users/${id}"]) { display: none !important; }`
    ).join("\n");
  }

  // Called every time the Collection tab activates — stamps data-gcb-deleted on
  // cards whose player IDs were recorded as deleted via the history panel.
  // We stamp an attribute instead of calling remove() because remove() lets React
  // crash when it later tries to reconcile (removeChild) the same node from its fiber.
  // CSS hides the card; React ignores unknown data-* attributes on its own elements.
  function applyCollectionDeletions() {
    const deleted = loadCollectionDeleted();
    if (!deleted.size) return;
    for (const w of document.querySelectorAll(
      "#tabs-content-collection .grid > .relative",
    )) {
      const a = w.querySelector("a[href]");
      if (!a) continue;
      const m = a.href.match(/\/users\/(\d+)/);
      if (m && deleted.has(parseInt(m[1]))) {
        w.dataset.gcbDeleted = "true";
      }
    }
  }

  // Called every time the Collection tab activates — stamps data-gcb-fav on each
  // wrapper so the injected CSS can visually correct the fav button state without
  // making an API call. React controls the button class; we control the wrapper
  // attribute, which React ignores.
  function applyCollectionFavStates() {
    const states = loadCardStates();
    for (const w of document.querySelectorAll(
      "#tabs-content-collection .grid > .relative",
    )) {
      const a = w.querySelector("a[href]");
      if (!a) continue;
      const m = a.href.match(/\/users\/(\d+)/);
      if (!m) continue;
      const stored = states[parseInt(m[1])];
      if (stored?.fav === true) w.dataset.gcbFav = "true";
      else if (stored?.fav === false) w.dataset.gcbFav = "false";
    }
  }

  // Hide a player's card in the collection grid for instant visual feedback on delete.
  // Stamps data-gcb-deleted instead of calling remove() — see applyCollectionDeletions
  // for why removing from React's managed DOM causes crashes.
  function removeCardFromCollectionDom(playerId) {
    const wrappers = document.querySelectorAll(
      "#tabs-content-collection .grid > .relative",
    );
    for (const w of wrappers) {
      if (w.querySelector(`a[href*="/users/${playerId}"]`)) {
        w.dataset.gcbDeleted = "true";
      }
    }
  }

  // Return the collection grid wrapper for a given player ID, or null if not loaded.
  function findCollectionCard(playerId) {
    for (const w of document.querySelectorAll(
      "#tabs-content-collection .grid > .relative",
    )) {
      if (w.querySelector(`a[href*="/users/${playerId}"]`)) return w;
    }
    return null;
  }

  // Wait for a confirmation button with the given text and click it.
  // Searches inside [role="alertdialog"] / [role="dialog"] portals first;
  // falls back to the full document so Radix UI portals without explicit ARIA
  // roles are also found. "Yes" is specific enough to be safe as a full-page search.
  async function clickDialogButton(text, timeoutMs = 3000) {
    const lower = text.toLowerCase();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // 1. Prefer scoped search inside known dialog containers
      const dialogs = document.querySelectorAll(
        '[role="alertdialog"], [role="dialog"]',
      );
      for (const dialog of dialogs) {
        for (const btn of dialog.querySelectorAll("button")) {
          if (
            (btn.innerText || "").trim().toLowerCase() === lower &&
            !btn.disabled
          ) {
            btn.click();
            return true;
          }
        }
      }
      // 2. Fallback: search the full document (covers Radix portals without ARIA roles)
      for (const btn of document.querySelectorAll("button")) {
        if (
          (btn.innerText || "").trim().toLowerCase() === lower &&
          !btn.disabled
        ) {
          btn.click();
          return true;
        }
      }
      await sleep(100);
    }
    return false;
  }

  function buildCardTile(card, packTs) {
    cacheCardMeta(card);
    const rarityColor = RARITY_COLORS[card.rarity] || "#9ca3af";
    // fav is shared per player ID; deleted is per pack-card instance so the same
    // player in a different pack is not affected.
    const state = {
      fav: loadCardStates()[card.id]?.fav || false,
      deleted: packTs
        ? !!loadDeletedInstances()[`${packTs}_${card.id}`]
        : false,
    };

    const tile = document.createElement("div");
    tile.dataset.playerId = card.id;
    tile.style.cssText = `
      position:relative; width:160px; background:#0d1525;
      border:${state.fav ? "2px solid #ef4444" : "2px solid " + rarityColor}; border-radius:8px;
      overflow:hidden; transition:border-color 0.15s;
    `;

    const img = document.createElement("img");
    img.src = card.avatar;
    img.alt = card.name;
    img.style.cssText =
      "width:100%;aspect-ratio:1;object-fit:cover;display:block;";
    img.onerror = () => {
      img.style.background = "#1f2937";
      img.src = "";
    };

    const info = document.createElement("div");
    info.style.cssText = "padding:6px 6px 7px;text-align:center;";
    const flagHtml = card.country
      ? `<img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${card.country}.svg"
              style="height:10px;vertical-align:middle;margin-right:3px;border-radius:1px;"
              onerror="this.style.display='none'">`
      : "";
    info.innerHTML = `
      <div style="font-size:10px;color:${rarityColor};text-transform:uppercase;letter-spacing:1.5px;
           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${card.rarity || "—"}</div>
      <div style="font-size:12px;color:#f9fafb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;"
           title="${card.name}">${flagHtml}${card.name}</div>
      ${card.shiny ? '<div style="font-size:11px;line-height:1.4;">✨</div>' : ""}
    `;

    // Heart badge — shown when favourited
    const heart = document.createElement("div");
    heart.textContent = "♥";
    heart.style.cssText = `
      display:${state.fav ? "block" : "none"}; position:absolute; top:4px; right:5px;
      font-size:28px; color:#ef4444; line-height:1;
      text-shadow:0 0 10px #ef444499; pointer-events:none;
    `;

    // Deleted label — full-width banner across the card
    const deletedLabel = document.createElement("div");
    deletedLabel.textContent = "DELETED";
    deletedLabel.style.cssText = `
      display:${state.deleted ? "flex" : "none"}; position:absolute;
      left:0; right:0; top:50%; transform:translateY(-50%);
      align-items:center; justify-content:center;
      padding:6px 0; background:rgba(0,0,0,0.72);
      font-size:15px; font-weight:900; letter-spacing:4px; color:#ffffff;
      text-shadow:0 1px 4px #000; pointer-events:none;
    `;

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      display:none; position:absolute; inset:0;
      background:rgba(0,0,0,0.78); flex-direction:column;
      align-items:center; justify-content:center; gap:8px;
    `;

    const favBtn = document.createElement("button");
    favBtn.textContent = state.fav ? "♥ Unfav" : "♥ Fav";
    favBtn.style.cssText = `font-size:11px;padding:5px 14px;border-radius:20px;cursor:pointer;
      background:${state.fav ? "#ef444433" : "#ef444422"};border:1px solid #ef444480;color:#ef4444;`;

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕ Del";
    delBtn.style.cssText = `font-size:11px;padding:5px 14px;border-radius:20px;cursor:pointer;
      background:#37415122;border:1px solid #37415180;color:#9ca3af;`;

    overlay.appendChild(favBtn);
    overlay.appendChild(delBtn);
    tile.appendChild(img);
    tile.appendChild(info);
    tile.appendChild(heart);
    tile.appendChild(deletedLabel);
    tile.appendChild(overlay);

    tile.addEventListener("mouseenter", () => {
      if (!state.deleted) overlay.style.display = "flex";
    });
    tile.addEventListener("mouseleave", () => {
      overlay.style.display = "none";
    });

    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      favBtn.textContent = "...";
      favBtn.disabled = true;
      const wantFav = !state.fav;

      // Prefer clicking the native ❤️/🤍 button so React handles the API call and
      // updates the collection card state itself — no page reload needed.
      // Native fav button: left-positioned, bg-[#78350f] when favourited.
      const collCard = findCollectionCard(card.id);
      const nativeBtn = collCard?.querySelector('button[class*="left-0.5"]');
      if (nativeBtn) {
        // Only click if the button's current state doesn't already match wantFav
        const isFav = nativeBtn.className.includes("78350f");
        if (isFav !== wantFav) nativeBtn.click();
      } else {
        // Card not loaded in collection tab — fall back to direct API call
        await apiToggleFavourite(card.id);
      }

      // Update history tile optimistically (toggle is deterministic)
      state.fav = wantFav;
      saveCardState(card.id, { fav: wantFav });
      heart.style.display = wantFav ? "block" : "none";
      tile.style.border = wantFav
        ? "2px solid #ef4444"
        : "2px solid " + rarityColor;
      favBtn.textContent = wantFav ? "♥ Unfav" : "♥ Fav";
      favBtn.style.background = wantFav ? "#ef444433" : "#ef444422";
      favBtn.disabled = false;
    });

    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      delBtn.textContent = "...";
      delBtn.disabled = true;

      // Prefer clicking the native 🗑 button so React handles the API call and
      // collection state update. The native button triggers a Yes/No dialog.
      // Native delete button: right-positioned (right-0.5 in class).
      const collCard = findCollectionCard(card.id);
      const nativeDelBtn = collCard?.querySelector('button[class*="right-0.5"]');
      let ok = false;
      if (nativeDelBtn) {
        nativeDelBtn.click();
        ok = await clickDialogButton("Yes");
        if (!ok) {
          // Dialog didn't appear or user path failed — abort without changing state
          delBtn.textContent = "✕ Del";
          delBtn.disabled = false;
          return;
        }
      } else {
        // Card not loaded in collection tab — fall back to direct API call
        ok = await apiDelete(card.id);
      }

      if (ok) {
        state.deleted = true;
        if (packTs) saveDeletedInstance(packTs, card.id);
        markCollectionDeleted(card.id);
        addToBlacklist(card);
        overlay.style.display = "none";
        deletedLabel.style.display = "flex";
        removeCardFromCollectionDom(card.id);
      } else {
        delBtn.textContent = "✕ Err";
        delBtn.disabled = false;
      }
    });

    return tile;
  }

  function buildPackSection(pack) {
    const section = document.createElement("div");
    section.style.cssText =
      "margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid #1f2937;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";
    const hasMythic = pack.cards.some(c => c.rarity === "mythic");
    header.innerHTML = `
              <span style="font-size:11px;color:#6b7280;">${new Date(pack.timestamp).toLocaleString()}</span>
              <span style="display:flex;align-items:center;gap:8px;">
                ${hasMythic ? `<button class="gcb-mythic-badge" id="gcb-hist-mythic-${pack.timestamp}">✦ MYTHIC</button>` : ""}
                <span style="font-size:10px;color:#374151;font-family:monospace;">${pack.cards.length} card${pack.cards.length !== 1 ? "s" : ""}</span>
              </span>
          `;
    if (hasMythic) {
      header.querySelector(`#gcb-hist-mythic-${pack.timestamp}`).addEventListener("click", () => {
        const modal = document.getElementById("gcb-mythic-modal");
        if (modal) { modal.style.display = "flex"; mythicWindowOpen = true; renderMythicWindow(); }
      });
    }

    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    for (const card of pack.cards) {
      grid.appendChild(buildCardTile(card, pack.timestamp));
    }

    section.appendChild(header);
    section.appendChild(grid);
    return section;
  }

  function renderHistory() {
    const body = document.getElementById("gcb-hist-body");
    if (!body) return;
    const history = loadHistory();

    if (!history.length) {
      body.innerHTML =
        '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:13px;">No history yet. Open some packs with Auto Open!</p>';
      return;
    }

    body.innerHTML = "";
    for (let i = history.length - 1; i >= 0; i--) {
      body.appendChild(buildPackSection(history[i]));
    }
  }

  // Prepend a single newly-scraped pack to the history body without
  // re-rendering the whole list. Preserves the user's scroll position.
  function prependPackToHistory(pack) {
    const body = document.getElementById("gcb-hist-body");
    if (!body) return;
    // Remove "No history yet" placeholder if present
    const placeholder = body.querySelector("p");
    if (placeholder) body.innerHTML = "";
    body.insertBefore(buildPackSection(pack), body.firstChild);
  }

  function showMythicNotification(mythicCards) {
    const existing = document.getElementById("gcb-mythic-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "gcb-mythic-toast";
    toast.style.cssText = `
      position:fixed; top:60px; left:50%; transform:translateX(-50%);
      z-index:99999; background:linear-gradient(135deg,#1a0505 0%,#2d0a0a 100%);
      border:2px solid rgba(239,68,68,0.8); border-radius:16px;
      padding:18px 28px; min-width:260px; max-width:480px;
      text-align:center; cursor:pointer;
    `;
    const names = mythicCards.map(c => `<span style="color:#f9fafb;font-weight:700;">${c.name}</span>`).join(", ");
    toast.innerHTML = `
      <div id="gcb-mythic-toast-title" style="font-size:20px;font-weight:900;letter-spacing:4px;
           text-transform:uppercase;color:#ef4444;margin-bottom:8px;">
        ⚠ MYTHIC PULL ⚠
      </div>
      <div style="font-size:13px;color:#9ca3af;line-height:1.6;">${names}</div>
      <div style="margin-top:10px;font-size:10px;color:#4b5563;letter-spacing:1px;">Click to dismiss</div>
    `;

    function dismiss() {
      toast.classList.add("gcb-closing");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }
    toast.addEventListener("click", dismiss);
    const timer = setTimeout(dismiss, 6000);
    toast.addEventListener("click", () => clearTimeout(timer), { once: true });

    document.body.appendChild(toast);
  }

  function buildMythicModal() {
    const modal = document.createElement("div");
    modal.id = "gcb-mythic-modal";
    modal.style.cssText = `
      display:none; position:fixed; right:302px; top:160px; z-index:20000;
      width:780px; max-height:80vh;
      background:#0a0f1a; border:1px solid rgba(239,68,68,0.35); border-radius:16px;
      overflow:hidden; flex-direction:column;
      box-shadow:0 8px 32px rgba(239,68,68,0.15), 0 4px 16px rgba(0,0,0,0.7);
    `;
    modal.innerHTML = `
      <div id="gcb-mythic-header" style="display:flex;align-items:center;justify-content:space-between;
           padding:14px 20px;background:#0d1525;border-bottom:1px solid rgba(239,68,68,0.2);
           cursor:grab;user-select:none;flex-shrink:0;">
        <span style="font-weight:800;font-size:12px;letter-spacing:3px;
             color:#ef4444;text-transform:uppercase;">Mythic Pulls</span>
        <button id="gcb-mythic-close" style="background:none;border:none;
            color:#4b5563;cursor:pointer;font-size:15px;line-height:1;padding:0;">✕</button>
      </div>
      <div id="gcb-mythic-body" style="padding:18px 20px;overflow-y:auto;flex:1;"></div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#gcb-mythic-close").addEventListener("click", () => {
      modal.style.display = "none";
      mythicWindowOpen = false;
    });
    document.addEventListener("mousedown", (e) => {
      if (mythicWindowOpen && !modal.contains(e.target)) {
        const mainPanel = document.getElementById("gcb-panel");
        if (!mainPanel?.contains(e.target)) {
          modal.style.display = "none";
          mythicWindowOpen = false;
        }
      }
    });
    makeDraggable(modal, modal.querySelector("#gcb-mythic-header"));
    return modal;
  }

  function renderMythicWindow() {
    const body = document.getElementById("gcb-mythic-body");
    if (!body) return;
    const history = loadHistory();
    const mythics = history.flatMap(pack =>
      pack.cards.filter(c => c.rarity === "mythic").map(c => ({ ...c, packTs: pack.timestamp }))
    ).reverse();
    if (!mythics.length) {
      body.innerHTML = '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:13px;">No mythic cards pulled yet.</p>';
      return;
    }
    body.innerHTML = "";
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    for (const card of mythics) grid.appendChild(buildCardTile(card, card.packTs));
    body.appendChild(grid);
  }

  function prependMythicCards(cards) {
    const body = document.getElementById("gcb-mythic-body");
    if (!body) return;
    const placeholder = body.querySelector("p");
    if (placeholder) placeholder.remove();
    let grid = body.querySelector(".gcb-mythic-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "gcb-mythic-grid";
      grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      body.prepend(grid);
    }
    for (const card of cards) grid.prepend(buildCardTile(card, Date.now()));
  }

  function buildBlacklistModal() {
    const modal = document.createElement("div");
    modal.id = "gcb-bl-modal";
    modal.style.cssText = `
      display:none; position:fixed; right:302px; top:260px; z-index:20001;
      width:320px; max-height:70vh;
      background:#0a0f1a; border:1px solid #1f2937; border-radius:14px;
      overflow:hidden; flex-direction:column;
      box-shadow:0 8px 32px rgba(0,0,0,0.7);
    `;
    modal.innerHTML = `
      <div id="gcb-bl-modal-header" style="display:flex;align-items:center;justify-content:space-between;
           padding:12px 16px;background:#0d1525;border-bottom:1px solid #1f2937;
           cursor:grab;user-select:none;flex-shrink:0;">
        <span style="font-weight:800;font-size:11px;letter-spacing:2.5px;color:#9ca3af;text-transform:uppercase;">Blacklist</span>
        <button id="gcb-bl-modal-close" style="background:none;border:none;
            color:#4b5563;cursor:pointer;font-size:15px;line-height:1;padding:0;">✕</button>
      </div>
      <div id="gcb-bl-modal-body" style="padding:10px 14px;overflow-y:auto;flex:1;"></div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#gcb-bl-modal-close").addEventListener("click", () => {
      modal.style.display = "none";
    });
    makeDraggable(modal, modal.querySelector("#gcb-bl-modal-header"));
    return modal;
  }

  function renderBlacklistModal(onChangeCallback) {
    const body = document.getElementById("gcb-bl-modal-body");
    if (!body) return;
    const bl = loadBlacklist();
    const entries = Object.entries(bl);
    if (!entries.length) {
      body.innerHTML = '<p style="color:#4b5563;text-align:center;padding:24px 0;font-size:12px;">Blacklist is empty.</p>';
      return;
    }
    body.innerHTML = "";
    for (const [id, data] of entries) {
      const color = RARITY_COLORS[data.rarity] || "#9ca3af";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:5px 4px;border-bottom:1px solid #111827;";
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
          <span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
          <span style="font-size:12px;color:#d1d5db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${data.name}">${data.name}</span>
        </div>
        <button data-id="${id}" style="font-size:10px;color:#ef4444;background:none;border:1px solid #ef444430;
            border-radius:5px;padding:1px 7px;cursor:pointer;flex-shrink:0;margin-left:8px;">✕</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        removeFromBlacklist(id);
        row.remove();
        if (!body.children.length) {
          body.innerHTML = '<p style="color:#4b5563;text-align:center;padding:24px 0;font-size:12px;">Blacklist is empty.</p>';
        }
        if (onChangeCallback) onChangeCallback();
      });
      body.appendChild(row);
    }
  }

  function buildHistoryModal() {
    const modal = document.createElement("div");
    modal.id = "gcb-history-modal";
    modal.style.cssText = `
            display:none; position:fixed; right:302px; top:64px; z-index:20000;
            width:900px; max-height:85vh;
            background:#0a0f1a; border:1px solid #1f2937; border-radius:16px;
            overflow:hidden; flex-direction:column;
            box-shadow:0 8px 32px rgba(0,0,0,0.7);
        `;

    modal.innerHTML = `
            <div id="gcb-hist-header" style="display:flex;align-items:center;justify-content:space-between;
                 padding:14px 20px;background:#0d1525;border-bottom:1px solid #1f2937;
                 cursor:grab;user-select:none;flex-shrink:0;">
                <span style="font-weight:800;font-size:12px;letter-spacing:3px;
                     color:#3b82f6;text-transform:uppercase;">Pack History</span>
                <div style="display:flex;gap:10px;align-items:center;">
                    <button id="gcb-hist-clear" style="font-size:11px;color:#ef4444;background:none;
                        border:1px solid #ef444440;border-radius:6px;padding:3px 10px;cursor:pointer;">
                        Clear All
                    </button>
                    <button id="gcb-hist-close" style="background:none;border:none;
                        color:#4b5563;cursor:pointer;font-size:15px;line-height:1;padding:0;">✕</button>
                </div>
            </div>
            <div id="gcb-hist-body" style="padding:18px 20px;overflow-y:auto;flex:1;"></div>
        `;

    document.body.appendChild(modal);

    modal.querySelector("#gcb-hist-close").addEventListener("click", () => {
      modal.style.display = "none";
      historyWindowOpen = false;
    });
    modal.querySelector("#gcb-hist-clear").addEventListener("click", () => {
      if (confirm("Clear all pack history? This cannot be undone.")) {
        saveHistory([]);
        renderHistory();
      }
    });

    makeDraggable(modal, modal.querySelector("#gcb-hist-header"));

    // Close when clicking outside the modal
    document.addEventListener("mousedown", (e) => {
      if (historyWindowOpen && !modal.contains(e.target)) {
        modal.style.display = "none";
        historyWindowOpen = false;
      }
    });

    return modal;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL UI
  // ═══════════════════════════════════════════════════════════════

  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
            #gcb-panel * { box-sizing: border-box; }
            .gcb-toggle-wrap { display:flex; align-items:center; gap:10px; }
            .gcb-toggle { position:relative; display:inline-block; width:40px; height:22px; flex-shrink:0; }
            .gcb-toggle input { opacity:0; width:0; height:0; }
            .gcb-slider {
                position:absolute; cursor:pointer; inset:0;
                background:#1f2937; border-radius:22px;
                transition: background 0.2s;
            }
            .gcb-slider:before {
                content:""; position:absolute;
                width:16px; height:16px; left:3px; bottom:3px;
                background:#6b7280; border-radius:50%;
                transition: transform 0.2s, background 0.2s;
            }
            .gcb-toggle input:checked + .gcb-slider { background:#1d4ed8; }
            .gcb-toggle input:checked + .gcb-slider:before { transform:translateX(18px); background:#60a5fa; }
            .gcb-section { border-top:1px solid #1f2937; margin-top:12px; padding-top:12px; }
            .gcb-label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#6b7280; margin-bottom:6px; }
            .gcb-rarity-btn {
                padding:3px 10px; border-radius:20px; font-size:11px; cursor:pointer;
                transition:background 0.15s, font-weight 0.1s; background:transparent;
            }
            .gcb-country-row {
                display:flex; align-items:center; gap:8px; padding:3px 4px;
                border-radius:5px; cursor:pointer; transition:background 0.1s;
            }
            .gcb-country-row:hover { background:#1f2937; }
            #gcb-panel::-webkit-scrollbar { width:4px; }
            #gcb-panel::-webkit-scrollbar-track { background:transparent; }
            #gcb-panel::-webkit-scrollbar-thumb { background:#1f2937; border-radius:4px; }

            /* Hide cards deleted via the history panel.
               We stamp data-gcb-deleted on the wrapper instead of calling remove(),
               because remove() lets React crash when it tries to reconcile the same node. */
            #tabs-content-collection .grid > .relative[data-gcb-deleted="true"] {
                display: none !important;
            }

            @keyframes gcb-mythic-in {
                from { opacity:0; transform:scale(0.85) translateY(-20px); }
                to   { opacity:1; transform:scale(1) translateY(0); }
            }
            @keyframes gcb-mythic-out {
                from { opacity:1; transform:scale(1); }
                to   { opacity:0; transform:scale(0.9) translateY(-10px); }
            }
            @keyframes gcb-mythic-glow {
                0%,100% { box-shadow: 0 0 30px 8px rgba(239,68,68,0.55), 0 0 80px 20px rgba(239,68,68,0.2); }
                50%      { box-shadow: 0 0 50px 16px rgba(239,68,68,0.8), 0 0 120px 40px rgba(239,68,68,0.35); }
            }
            @keyframes gcb-mythic-text {
                0%,100% { text-shadow: 0 0 12px #ef4444, 0 0 30px #ef4444; }
                50%      { text-shadow: 0 0 24px #fff, 0 0 60px #ef4444; }
            }
            #gcb-mythic-toast {
                animation: gcb-mythic-in 0.35s cubic-bezier(0.23,1,0.32,1) forwards,
                           gcb-mythic-glow 1.4s ease-in-out infinite;
            }
            #gcb-mythic-toast.gcb-closing {
                animation: gcb-mythic-out 0.3s ease-in forwards !important;
            }
            #gcb-mythic-toast-title {
                animation: gcb-mythic-text 1.4s ease-in-out infinite;
            }
            @keyframes gcb-mythic-badge-pulse {
                0%,100% { box-shadow: 0 0 6px 1px rgba(239,68,68,0.7); opacity:1; }
                50%      { box-shadow: 0 0 14px 4px rgba(239,68,68,1); opacity:0.8; }
            }
            .gcb-mythic-badge {
                display:inline-flex; align-items:center; gap:4px;
                padding:2px 7px; border-radius:10px; font-size:10px; font-weight:800;
                letter-spacing:1.5px; text-transform:uppercase; cursor:pointer;
                background:#7f1d1d; color:#fca5a5; border:1px solid #ef4444;
                animation: gcb-mythic-badge-pulse 1.2s ease-in-out infinite;
            }
            .gcb-mythic-badge:hover { background:#991b1b; }

            /* Correct fav button appearance when collection tab remounts from RSC cache.
               React controls button classes; we set data-gcb-fav on the wrapper, which
               React ignores, so these overrides survive re-renders. */
            #tabs-content-collection .grid > .relative[data-gcb-fav="true"] button[class*="left-0.5"] {
                background-color: #78350f !important;
                border-color: #fcd34d !important;
            }
            #tabs-content-collection .grid > .relative[data-gcb-fav="false"] button[class*="left-0.5"] {
                background-color: #111827 !important;
                border-color: #374151 !important;
            }

            /* Site footer uses position:absolute;bottom:0 which anchors it to the
               bottom of its containing block. That containing block grows and shrinks
               with card content, so the footer drifts. Pull it back into normal flow. */
            footer[class*="absolute"][class*="bottom-0"] {
                position: relative !important;
                right: auto !important;
                left: auto !important;
                bottom: auto !important;
                width: 100% !important;
            }
        `;
    document.head.appendChild(s);
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "gcb-panel";
    panel.style.cssText = `
            position:fixed; z-index:10000;
            width:270px; max-height:85vh; overflow-y:auto;
            background:#0a0f1a; border:1px solid #1f2937; border-radius:12px;
            font-family:inherit; font-size:13px; color:#f9fafb;
            box-shadow:0 8px 32px rgba(0,0,0,0.6);
            user-select:none;
        `;

    panel.style.right = "16px";
    panel.style.top = "64px"; // just below the 56px (h-14) site header

    panel.innerHTML = `
            <!-- Header (drag handle) -->
            <div id="gcb-header" style="
                display:flex; align-items:center; justify-content:space-between;
                padding:10px 14px; background:#0d1525; border-radius:12px 12px 0 0;
                border-bottom:1px solid #1f2937; cursor:grab;
            ">
                <span style="font-weight:800;font-size:12px;letter-spacing:3px;color:#3b82f6;text-transform:uppercase;">osu<span style="color:#f9fafb">!</span>gacha</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button id="gcb-mythic-open" style="background:none;border:none;color:#ef444480;cursor:pointer;font-size:14px;line-height:1;padding:0;" title="Mythic Pulls">⬤</button>
                    <button id="gcb-hist-open" style="background:none;border:none;color:#4b5563;cursor:pointer;font-size:14px;line-height:1;padding:0;" title="Pack History">🕓</button>
                    <button id="gcb-close" style="background:none;border:none;color:#4b5563;cursor:pointer;font-size:15px;line-height:1;padding:0;" title="Close">✕</button>
                </div>
            </div>

            <div style="padding:12px 14px;">

                <!-- Auto-Open section -->
                <div class="gcb-label">Auto-Open</div>
                <div class="gcb-toggle-wrap" style="margin-bottom:8px;">
                    <label class="gcb-toggle">
                        <input type="checkbox" id="gcb-ao-toggle" ${prefs.autoOpen ? "checked" : ""}>
                        <span class="gcb-slider"></span>
                    </label>
                    <span id="gcb-ao-label" style="font-size:12px;font-weight:600;color:${prefs.autoOpen ? "#60a5fa" : "#4b5563"};">
                        ${prefs.autoOpen ? "ON" : "OFF"}
                    </span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <p id="gcb-status" style="font-size:11px;color:#4b5563;">Initializing...</p>
                    <p id="gcb-packs" style="font-size:11px;color:#374151;font-family:monospace;"></p>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-size:11px;color:#6b7280;">Open only if ≥</span>
                    <div style="display:flex;align-items:center;gap:0;">
                        <button id="gcb-min-dec" style="width:22px;height:22px;background:#1f2937;border:1px solid #374151;
                            border-radius:5px 0 0 5px;color:#9ca3af;font-size:14px;line-height:1;cursor:pointer;
                            display:flex;align-items:center;justify-content:center;padding:0;">−</button>
                        <span id="gcb-min-val" style="min-width:26px;text-align:center;background:#111827;
                            border-top:1px solid #374151;border-bottom:1px solid #374151;
                            font-size:11px;color:#f9fafb;padding:3px 4px;line-height:16px;">${prefs.minPacks}</span>
                        <button id="gcb-min-inc" style="width:22px;height:22px;background:#1f2937;border:1px solid #374151;
                            border-radius:0 5px 5px 0;color:#9ca3af;font-size:14px;line-height:1;cursor:pointer;
                            display:flex;align-items:center;justify-content:center;padding:0;">+</button>
                        <span style="font-size:11px;color:#6b7280;margin-left:5px;">packs</span>
                    </div>
                </div>

                <!-- Collection Filter section (shown only on collection tab) -->
                <div id="gcb-filter-section" class="gcb-section" style="display:none;">
                    <p id="gcb-filter-count" style="font-size:11px;color:#4b5563;margin-bottom:8px;"></p>

                    <!-- Rarity -->
                    <p class="gcb-label" style="margin-top:0;">Rarity</p>
                    <div id="gcb-rarities" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;"></div>

                    <!-- Shiny -->
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#fcd34d;font-size:12px;margin-bottom:6px;">
                        <input type="checkbox" id="gcb-shiny" style="cursor:pointer;">
                        ✨ Shiny only
                    </label>

                    <!-- Favourites -->
                    <button id="gcb-favs" style="display:flex;align-items:center;gap:6px;cursor:pointer;background:transparent;border:1px solid #555;border-radius:6px;padding:3px 8px;font-size:12px;color:#aaa;margin-bottom:10px;width:100%;text-align:left;">
                        ♥ Favourites: off
                    </button>

                    <!-- Countries -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <p class="gcb-label" style="margin:0;">Country</p>
                        <div style="display:flex;gap:8px;">
                            <button id="gcb-c-all" style="font-size:10px;color:#3b82f6;background:none;border:none;cursor:pointer;padding:0;">All</button>
                            <button id="gcb-c-none" style="font-size:10px;color:#6b7280;background:none;border:none;cursor:pointer;padding:0;">None</button>
                        </div>
                    </div>
                    <div id="gcb-countries" style="display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto;"></div>
                </div>

                <!-- Auto-Delete section -->
                <div class="gcb-section">
                    <div id="gcb-ad-header" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
                        <span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">Auto-Delete</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="gcb-toggle" style="margin:0;" id="gcb-ad-toggle-label">
                                <input type="checkbox" id="gcb-ad-enabled">
                                <span class="gcb-slider"></span>
                            </label>
                            <span id="gcb-ad-arrow" style="color:#4b5563;font-size:10px;line-height:1;transition:transform 0.2s;display:inline-block;">▶</span>
                        </div>
                    </div>
                    <div id="gcb-ad-body" style="display:none;margin-top:10px;">
                        <!-- Rarity -->
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                            <p class="gcb-label" style="margin:0;">Rarity</p>
                            <button id="gcb-ad-rarity-mode" style="font-size:10px;padding:2px 8px;border-radius:20px;cursor:pointer;background:#1f2937;border:1px solid #374151;color:#9ca3af;">Include</button>
                        </div>
                        <div id="gcb-ad-rarities" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;"></div>
                        <!-- Country -->
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <p class="gcb-label" style="margin:0;">Country</p>
                            <button id="gcb-ad-nat-mode" style="font-size:10px;padding:2px 8px;border-radius:20px;cursor:pointer;background:#1f2937;border:1px solid #374151;color:#9ca3af;">Include</button>
                        </div>
                        <textarea id="gcb-ad-nations" rows="3" placeholder="2-letter codes, one per line&#10;e.g.&#10;us&#10;jp" style="width:100%;background:#111827;border:1px solid #374151;border-radius:6px;color:#d1d5db;font-size:11px;padding:6px;resize:vertical;font-family:monospace;margin-bottom:10px;line-height:1.5;"></textarea>
                        <!-- Whitelist -->
                        <p class="gcb-label">Whitelist (never delete)</p>
                        <textarea id="gcb-ad-whitelist" rows="3" placeholder="Player names, one per line" style="width:100%;background:#111827;border:1px solid #374151;border-radius:6px;color:#d1d5db;font-size:11px;padding:6px;resize:vertical;font-family:monospace;margin-bottom:4px;line-height:1.5;"></textarea>
                        <p style="font-size:10px;color:#4b5563;margin:0;">Whitelisted names are never auto-deleted.</p>
                        <!-- Blacklist -->
                        <div style="border-top:1px solid #1f2937;margin-top:12px;padding-top:10px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                                <p class="gcb-label" style="margin:0;">Remember Deleted</p>
                                <label class="gcb-toggle" style="margin:0;" id="gcb-bl-toggle-label">
                                    <input type="checkbox" id="gcb-bl-enabled">
                                    <span class="gcb-slider"></span>
                                </label>
                            </div>
                            <p style="font-size:10px;color:#4b5563;margin:0 0 6px;">Repulled cards matching these rarities are auto-deleted:</p>
                            <div id="gcb-bl-rarities" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;"></div>
                            <div style="display:flex;align-items:center;justify-content:space-between;">
                                <span id="gcb-bl-count" style="font-size:10px;color:#4b5563;">0 remembered</span>
                                <div style="display:flex;gap:5px;">
                                    <button id="gcb-bl-view" style="font-size:10px;color:#60a5fa;background:none;border:1px solid #60a5fa40;border-radius:6px;padding:2px 8px;cursor:pointer;">View</button>
                                    <button id="gcb-bl-clear" style="font-size:10px;color:#ef4444;background:none;border:1px solid #ef444440;border-radius:6px;padding:2px 8px;cursor:pointer;">Clear</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;

    document.body.appendChild(panel);

    // ── Close ──
    panel.querySelector("#gcb-close").addEventListener("click", () => {
      panel.style.display = "none";
      document.getElementById("gcb-fab").style.display = "flex";
    });

    // ── Mythic window ──
    panel.querySelector("#gcb-mythic-open").addEventListener("click", () => {
      const modal = document.getElementById("gcb-mythic-modal");
      if (!modal) return;
      renderMythicWindow();
      modal.style.display = "flex";
      mythicWindowOpen = true;
    });

    // ── History ──
    panel.querySelector("#gcb-hist-open").addEventListener("click", () => {
      const modal = document.getElementById("gcb-history-modal");
      if (!modal) return;
      renderHistory();
      modal.style.display = "flex";
      historyWindowOpen = true;
    });

    // ── Auto-open toggle ──
    const aoToggle = panel.querySelector("#gcb-ao-toggle");
    const aoLabel = panel.querySelector("#gcb-ao-label");
    aoToggle.addEventListener("change", () => {
      prefs.autoOpen = aoToggle.checked;
      aoLabel.textContent = aoToggle.checked ? "ON" : "OFF";
      aoLabel.style.color = aoToggle.checked ? "#60a5fa" : "#4b5563";
      if (aoToggle.checked) {
        setStatus("Watching...", "#4ade80");
        tryStart();
      } else {
        setStatus("Disabled", "#4b5563");
      }
    });

    // ── Min packs threshold ──
    const minVal = panel.querySelector("#gcb-min-val");
    panel.querySelector("#gcb-min-dec").addEventListener("click", () => {
      const v = Math.max(1, prefs.minPacks - 1);
      prefs.minPacks = v;
      minVal.textContent = v;
    });
    panel.querySelector("#gcb-min-inc").addEventListener("click", () => {
      const v = Math.min(10, prefs.minPacks + 1);
      prefs.minPacks = v;
      minVal.textContent = v;
    });

    // ── Rarity buttons ──
    const rarityContainer = panel.querySelector("#gcb-rarities");
    for (const r of RARITIES) {
      const btn = document.createElement("button");
      btn.className = "gcb-rarity-btn";
      btn.dataset.rarity = r;
      btn.textContent = r[0].toUpperCase() + r.slice(1);
      btn.style.border = `1px solid ${RARITY_COLORS[r]}40`;
      btn.style.color = RARITY_COLORS[r];
      btn.addEventListener("click", () => {
        if (filterState.rarities.has(r)) {
          filterState.rarities.delete(r);
          btn.style.background = "transparent";
          btn.style.fontWeight = "400";
        } else {
          filterState.rarities.add(r);
          btn.style.background = RARITY_COLORS[r] + "22";
          btn.style.fontWeight = "700";
        }
        applyFilters();
      });
      rarityContainer.appendChild(btn);
    }

    // ── Shiny ──
    panel.querySelector("#gcb-shiny").addEventListener("change", (e) => {
      filterState.shinyOnly = e.target.checked;
      applyFilters();
    });

    // ── Favourites cycle: off → only → hide → off ──
    panel.querySelector("#gcb-favs").addEventListener("click", () => {
      const btn = panel.querySelector("#gcb-favs");
      if (filterState.favsMode === "off") {
        filterState.favsMode = "only";
        btn.textContent = "♥ Favourites: show only";
        btn.style.color = "#ef4444";
        btn.style.borderColor = "#ef4444";
      } else if (filterState.favsMode === "only") {
        filterState.favsMode = "hide";
        btn.textContent = "♥ Favourites: hide";
        btn.style.color = "#888";
        btn.style.borderColor = "#888";
      } else {
        filterState.favsMode = "off";
        btn.textContent = "♥ Favourites: off";
        btn.style.color = "#aaa";
        btn.style.borderColor = "#555";
      }
      applyFilters();
    });

    // ── Country All / None ──
    // "All" = select every country, show everything
    panel.querySelector("#gcb-c-all").addEventListener("click", () => {
      collectCountries().forEach((_, code) => filterState.countries.add(code));
      panel
        .querySelectorAll("#gcb-countries input")
        .forEach((cb) => (cb.checked = true));
      applyFilters();
    });
    // "None" = no country selected → hide all flagged cards
    panel.querySelector("#gcb-c-none").addEventListener("click", () => {
      filterState.countries.clear();
      panel
        .querySelectorAll("#gcb-countries input")
        .forEach((cb) => (cb.checked = false));
      applyFilters();
    });

    // ── Auto-Delete section ──
    (function () {
      const cfg = loadAutoDeleteConfig();

      // Fold toggle (clicking the header row expands/collapses the body)
      const adHeader = panel.querySelector("#gcb-ad-header");
      const adBody   = panel.querySelector("#gcb-ad-body");
      const adArrow  = panel.querySelector("#gcb-ad-arrow");
      adHeader.addEventListener("click", () => {
        const open = adBody.style.display === "none";
        adBody.style.display    = open ? "block" : "none";
        adArrow.style.transform = open ? "rotate(90deg)" : "";
      });
      // Stop the toggle label from bubbling up to the fold header
      panel.querySelector("#gcb-ad-toggle-label").addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Master enable toggle
      const adEnabled = panel.querySelector("#gcb-ad-enabled");
      adEnabled.checked = cfg.enabled;
      adEnabled.addEventListener("change", () => {
        cfg.enabled = adEnabled.checked;
        saveAutoDeleteConfig(cfg);
      });

      // Rarity mode pill — initialize text from saved config
      const adRarityModeBtn = panel.querySelector("#gcb-ad-rarity-mode");
      adRarityModeBtn.textContent = cfg.rarityMode === "include" ? "Include" : "Exclude";
      adRarityModeBtn.addEventListener("click", () => {
        cfg.rarityMode = cfg.rarityMode === "include" ? "exclude" : "include";
        adRarityModeBtn.textContent = cfg.rarityMode === "include" ? "Include" : "Exclude";
        saveAutoDeleteConfig(cfg);
      });

      // Rarity buttons
      const adRaritiesEl = panel.querySelector("#gcb-ad-rarities");
      for (const r of RARITIES) {
        const btn = document.createElement("button");
        btn.className = "gcb-rarity-btn";
        btn.textContent = r[0].toUpperCase() + r.slice(1);
        btn.style.border = `1px solid ${RARITY_COLORS[r]}40`;
        btn.style.color  = RARITY_COLORS[r];
        if (cfg.rarities.has(r)) {
          btn.style.background = RARITY_COLORS[r] + "22";
          btn.style.fontWeight = "700";
        }
        btn.addEventListener("click", () => {
          if (cfg.rarities.has(r)) {
            cfg.rarities.delete(r);
            btn.style.background = "transparent";
            btn.style.fontWeight = "400";
          } else {
            cfg.rarities.add(r);
            btn.style.background = RARITY_COLORS[r] + "22";
            btn.style.fontWeight = "700";
          }
          saveAutoDeleteConfig(cfg);
        });
        adRaritiesEl.appendChild(btn);
      }

      // Nationality mode pill
      const adNatModeBtn = panel.querySelector("#gcb-ad-nat-mode");
      adNatModeBtn.textContent = cfg.natMode === "include" ? "Include" : "Exclude";
      adNatModeBtn.addEventListener("click", () => {
        cfg.natMode = cfg.natMode === "include" ? "exclude" : "include";
        adNatModeBtn.textContent = cfg.natMode === "include" ? "Include" : "Exclude";
        saveAutoDeleteConfig(cfg);
      });

      // Nationality textarea
      const adNationsEl = panel.querySelector("#gcb-ad-nations");
      adNationsEl.value = [...cfg.nations].join("\n");
      // Use "input" so the config is saved on every keystroke, not only on blur.
      // This prevents stale config if the user types a country code and then
      // immediately triggers a pack open without clicking away first.
      adNationsEl.addEventListener("input", () => {
        cfg.nations = new Set(
          adNationsEl.value.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
        );
        saveAutoDeleteConfig(cfg);
      });

      // Whitelist textarea
      const adWhitelistEl = panel.querySelector("#gcb-ad-whitelist");
      adWhitelistEl.value = [...cfg.whitelist].join("\n");
      adWhitelistEl.addEventListener("input", () => {
        cfg.whitelist = new Set(
          adWhitelistEl.value.split("\n").map(s => s.trim().toLowerCase().normalize("NFC")).filter(Boolean)
        );
        saveAutoDeleteConfig(cfg);
      });

      // ── Blacklist sub-section ──
      const blCfg = loadBlacklistConfig();

      const blEnabled = panel.querySelector("#gcb-bl-enabled");
      blEnabled.checked = blCfg.enabled;
      panel.querySelector("#gcb-bl-toggle-label").addEventListener("click", (e) => {
        e.stopPropagation();
      });
      blEnabled.addEventListener("change", () => {
        blCfg.enabled = blEnabled.checked;
        saveBlacklistConfig(blCfg);
      });

      const blCountEl = panel.querySelector("#gcb-bl-count");
      function refreshBlCount() {
        const n = Object.keys(loadBlacklist()).length;
        blCountEl.textContent = `${n} remembered`;
      }
      refreshBlCount();

      const blRaritiesEl = panel.querySelector("#gcb-bl-rarities");
      for (const r of RARITIES) {
        const btn = document.createElement("button");
        btn.className = "gcb-rarity-btn";
        btn.textContent = r[0].toUpperCase() + r.slice(1);
        btn.style.border = `1px solid ${RARITY_COLORS[r]}40`;
        btn.style.color  = RARITY_COLORS[r];
        if (blCfg.rarities.has(r)) {
          btn.style.background = RARITY_COLORS[r] + "22";
          btn.style.fontWeight = "700";
        }
        btn.addEventListener("click", () => {
          if (blCfg.rarities.has(r)) {
            blCfg.rarities.delete(r);
            btn.style.background = "transparent";
            btn.style.fontWeight = "400";
          } else {
            blCfg.rarities.add(r);
            btn.style.background = RARITY_COLORS[r] + "22";
            btn.style.fontWeight = "700";
          }
          saveBlacklistConfig(blCfg);
        });
        blRaritiesEl.appendChild(btn);
      }

      panel.querySelector("#gcb-bl-view").addEventListener("click", () => {
        const blModal = document.getElementById("gcb-bl-modal");
        if (!blModal) return;
        renderBlacklistModal(refreshBlCount);
        blModal.style.display = "flex";
      });

      panel.querySelector("#gcb-bl-clear").addEventListener("click", () => {
        if (confirm("Clear the blacklist? Repulled cards will no longer be auto-deleted.")) {
          saveBlacklist({});
          refreshBlCount();
          const blModal = document.getElementById("gcb-bl-modal");
          if (blModal && blModal.style.display !== "none") renderBlacklistModal(refreshBlCount);
        }
      });
    })();

    // ── Drag ──
    makeDraggable(panel, panel.querySelector("#gcb-header"));

    return panel;
  }

  function findLoadMoreButton() {
    for (const el of document.querySelectorAll("button")) {
      if (el.closest("#gcb-panel") || el.disabled) continue;
      const t = (el.innerText || "").trim().toLowerCase();
      if (t.startsWith("load more")) return el;
    }
    return null;
  }

  let loadingAllCards = false;

  function setFilterStatus(msg, color = "#4b5563") {
    const el = document.getElementById("gcb-filter-count");
    if (el) {
      el.textContent = msg;
      el.style.color = color;
    }
  }

  async function loadAllCards() {
    if (loadingAllCards) return;
    loadingAllCards = true;
    setFilterStatus("Waiting for cards...", "#60a5fa");
    try {
      // Wait up to 8s for the first "Load more" button to appear (cards may still be rendering)
      let loadMore = null;
      const waitDeadline = Date.now() + 8000;
      while (!loadMore && Date.now() < waitDeadline) {
        loadMore = findLoadMoreButton();
        if (!loadMore) await sleep(300);
      }

      // Inject opacity override early so each batch of cards becomes visible as it loads,
      // not all at once at the end. !important beats React's inline style="opacity:0".
      if (!document.getElementById("gcb-card-visible")) {
        const s = document.createElement("style");
        s.id = "gcb-card-visible";
        s.textContent =
          "#tabs-content-collection .grid > .relative { opacity: 1 !important; transform: none !important; }";
        document.head.appendChild(s);
      }

      if (!loadMore) {
        console.warn(
          '[GachaBot] No "Load more" button found in collection tab after 8s. Run gachaDebug() to inspect buttons.',
        );
      }

      while (loadMore) {
        const before = getCardWrappers().length;
        const remaining = loadMore.innerText.match(/\d+/);
        const total = remaining ? before + parseInt(remaining[0]) : "?";
        setFilterStatus(`Loading… ${before} / ${total}`, "#60a5fa");
        loadMore.click();

        // Wait up to 5s for new cards to appear
        await new Promise((resolve) => {
          const deadline = Date.now() + 5000;
          const id = setInterval(() => {
            if (getCardWrappers().length > before || Date.now() > deadline) {
              clearInterval(id);
              resolve();
            }
          }, 200);
        });

        if (getCardWrappers().length === before) break;
        await sleep(200);
        refreshCountryList();
        applyFilters();
        loadMore = findLoadMoreButton();
      }
    } finally {
      loadingAllCards = false;
      refreshCountryList();
      applyFilters();
    }
  }

  function makeDraggable(el, handle) {
    let ox = 0,
      oy = 0;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      handle.style.cursor = "grabbing";
      // Normalise to left/top so dragging works regardless of initial right/top positioning
      const rect = el.getBoundingClientRect();
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.left = rect.left + "px";
      el.style.top = rect.top + "px";
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;

      const onMove = (e) => {
        const x = Math.max(
          0,
          Math.min(window.innerWidth - el.offsetWidth, e.clientX - ox),
        );
        const y = Math.max(
          0,
          Math.min(window.innerHeight - el.offsetHeight, e.clientY - oy),
        );
        el.style.left = x + "px";
        el.style.top = y + "px";
      };
      const onUp = () => {
        handle.style.cursor = "grab";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function buildFab() {
    const btn = document.createElement("button");
    btn.id = "gcb-fab";
    btn.textContent = "⚙";
    btn.title = "GachaBot";
    btn.style.cssText = `
            position:fixed; top:64px; right:16px; z-index:10001;
            width:36px; height:36px; border-radius:50%;
            border:1px solid #3b82f640; background:#0d1525;
            font-size:17px; cursor:pointer; display:none;
            align-items:center; justify-content:center;
            box-shadow:0 2px 8px rgba(0,0,0,0.5);
            transition:border-color 0.2s;
        `;
    btn.addEventListener(
      "mouseenter",
      () => (btn.style.borderColor = "#3b82f6"),
    );
    btn.addEventListener(
      "mouseleave",
      () => (btn.style.borderColor = "#3b82f640"),
    );
    btn.addEventListener("click", () => {
      const panel = document.getElementById("gcb-panel");
      panel.style.display = "block";
      btn.style.display = "none";
    });
    document.body.appendChild(btn);
    return btn;
  }

  function updatePackDisplay() {
    const count = readPackCount();
    const el = document.getElementById("gcb-packs");
    if (!el) return;
    if (count >= 0) {
      el.textContent = `🃏 ${count}/10`;
      el.style.color = count > 0 ? "#60a5fa" : "#374151";
    }
  }

  function refreshCountryList() {
    const container = document.getElementById("gcb-countries");
    if (!container) return;
    const countryMap = collectCountries();

    for (const [code, src] of countryMap) {
      if (container.querySelector(`[data-code="${code}"]`)) continue;

      const row = document.createElement("label");
      row.className = "gcb-country-row";
      row.dataset.code = code;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.style.cursor = "pointer";
      cb.checked = true;
      filterState.countries.add(code);
      cb.addEventListener("change", () => {
        if (cb.checked) filterState.countries.add(code);
        else filterState.countries.delete(code);
        applyFilters();
      });

      const flag = document.createElement("img");
      flag.src = src;
      flag.style.cssText =
        "width:20px;height:13.5px;border-radius:2px;object-fit:cover;flex-shrink:0;";

      const lbl = document.createElement("span");
      lbl.textContent = code.toUpperCase();
      lbl.style.cssText = "font-size:12px;font-family:monospace;color:#d1d5db;";

      row.appendChild(cb);
      row.appendChild(flag);
      row.appendChild(lbl);
      container.appendChild(row);
    }

    // Sort alphabetically — only move nodes if the order actually changed
    const rows = [...container.querySelectorAll("[data-code]")];
    const sorted = [...rows].sort((a, b) =>
      a.dataset.code.localeCompare(b.dataset.code),
    );
    if (rows.some((r, i) => r !== sorted[i])) {
      sorted.forEach((r) => container.appendChild(r));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT & OBSERVERS
  // ═══════════════════════════════════════════════════════════════

  injectStyles();
  updateDeletedCssRules(); // restore :has() hide rules from localStorage immediately
  const panel = buildPanel();
  buildFab();
  buildHistoryModal();
  buildMythicModal();
  buildBlacklistModal();

  let collectionTabWasSeen = false;

  // Update collection filter section visibility when tabs change
  function syncFilterSection() {
    const section = document.getElementById("gcb-filter-section");
    if (!section) return;
    if (isCollectionTabActive()) {
      section.style.display = "block";
      applyCollectionDeletions();
      applyCollectionFavStates();
      refreshCountryList();
      applyFilters();

      if (!collectionTabWasSeen) {
        collectionTabWasSeen = true;
        loadAllCards();
      } else if (!loadingAllCards && findLoadMoreButton()) {
        // Native search/filter was cleared and the site reset to page 1 —
        // re-run loadAllCards to expand the collection again.
        loadAllCards();
      }
    } else {
      section.style.display = "none";
      collectionTabWasSeen = false;
    }
  }

  // Update pack count and status display periodically
  function syncStatus() {
    updatePackDisplay();
    if (prefs.autoOpen && !running) {
      const count = readPackCount();
      setStatus(
        count === 0 ? "Waiting for packs..." : "Watching...",
        count === 0 ? "#4b5563" : "#4ade80",
      );
    }
  }

  // MutationObserver — debounced so rapid DOM mutations during page load don't cascade
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      tryStart();
      updatePackDisplay();
      syncFilterSection();
      tryScrapePack();
    }, 300);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "data-state"],
  });

  // Re-clamp panel position on window resize so it can't go off-screen
  window.addEventListener("resize", () => {
    const p = document.getElementById("gcb-panel");
    if (!p || p.style.display === "none") return;
    const rect = p.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(rect.left, window.innerWidth - p.offsetWidth),
    );
    const y = Math.max(
      0,
      Math.min(rect.top, window.innerHeight - p.offsetHeight),
    );
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.right = "auto";
  });

  // Periodic fallback
  setInterval(() => {
    tryStart();
    syncStatus();
  }, FALLBACK_CHECK_MS);

  // Initial boot
  setTimeout(() => {
    syncFilterSection();
    syncStatus();
    if (prefs.autoOpen) {
      setStatus("Watching...", "#4ade80");
      tryStart();
    } else {
      setStatus("Disabled", "#4b5563");
    }
  }, 2000);

  // Debug helper
  window.gachaDebug = () => {
    console.table(
      [...document.querySelectorAll("button")].map((b) => ({
        text: b.innerText.trim(),
        disabled: b.disabled,
      })),
    );
    console.log(
      "running:",
      running,
      "| autoOpen:",
      prefs.autoOpen,
      "| overlay:",
      isResultOverlayVisible(),
    );
  };

  // Manual API testers — call from browser console:
  //   gachaFiberScan()    — dump fiber nodes with value/client props (diagnosis)
  //   gachaTestFav(12345) — toggle favourite for player ID 12345
  //   gachaTestDel(12345) — delete player ID 12345 from collection
  window.gachaFiberScan = () => {
    const rootEl = document.getElementById("__next") || document.body;
    const fiberKey = Object.keys(rootEl).find((k) =>
      k.startsWith("__reactFiber"),
    );
    console.log(
      "[GachaBot] root element:",
      rootEl.id || rootEl.tagName,
      "| fiberKey:",
      fiberKey,
    );
    if (!fiberKey) {
      console.error("No fiber key found");
      return;
    }
    const seen = new WeakSet();
    const queue = [rootEl[fiberKey]];
    let count = 0;
    while (queue.length && count < 2000) {
      const node = queue.shift();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      count++;
      const mp = node.memoizedProps;
      const name = node.type?.displayName || node.type?.name || node.type;
      if (mp && (mp.value !== undefined || mp.client !== undefined)) {
        const hasInvalidate =
          typeof mp.value?.invalidateQueries === "function" ||
          typeof mp.client?.invalidateQueries === "function";
        console.log(
          `[${count}]`,
          name,
          "| props:",
          Object.keys(mp).join(","),
          hasInvalidate ? " ← QueryClient!" : "",
        );
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    console.log("[GachaBot] Scanned", count, "fiber nodes");
  };
  window.gachaTestFav = async (playerId) => {
    console.log(
      `[GachaBot] Testing POST /api/favorites with playerId=${playerId}`,
    );
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    const text = await res.text();
    console.log(
      `[GachaBot] gachaTestFav → status ${res.status} ${res.statusText}`,
    );
    console.log(
      `[GachaBot] response headers:`,
      Object.fromEntries(res.headers),
    );
    console.log(`[GachaBot] response body:`, text);
    return text;
  };

  window.gachaTestDel = async (playerId) => {
    console.log(
      `[GachaBot] Testing DELETE /api/collection with playerId=${playerId}`,
    );
    const res = await fetch("/api/collection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerIds: [playerId] }),
    });
    const text = await res.text();
    console.log(
      `[GachaBot] gachaTestDel → status ${res.status} ${res.statusText}`,
    );
    console.log(
      `[GachaBot] response headers:`,
      Object.fromEntries(res.headers),
    );
    console.log(`[GachaBot] response body:`, text);
    return text;
  };
})();

