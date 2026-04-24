// ==UserScript==
// @name         GachaBot
// @namespace    http://tampermonkey.net/
// @version      1.38
// @description  Auto-open packs + collection filter panel for gacha.miz.to
// @author       Sp4ceCowb0y
// @match        https://gacha.miz.to/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Sp4ceCowb0y/gacha-bot/master/gacha-bot.user.js
// @downloadURL  https://raw.githubusercontent.com/Sp4ceCowb0y/gacha-bot/master/gacha-bot.user.js
// ==/UserScript==

// ───────────────────────────────────────────────────────────────────
//  CHANGELOG
// ───────────────────────────────────────────────────────────────────
//  v1.38 Fix: Shiny cards in Collection Panel now replicate the original site image
//        color effect — animated hue-rotate (8s linear) + saturate(1.5) + brightness(1.1)
//        on the card image, gold diagonal shimmer overlay, and ✨ inline in header.
//        Fix: Shiny card tiles now use rarity border color — removed silver #e2e8f0
//        override and gcb-shiny-glow animation (original site has no silver border).
//        Fix: Fav/delete event payloads now carry isShiny so filter sync correctly
//        targets the shiny or non-shiny copy when both exist in collectionCache.
//        Refactor: Removed native collection tab filter section (rarity/shiny/favs/
//        country buttons, loadAllCards auto-pagination) — superseded by Collection Panel.
//        Perf: card meta and history now cached in memory — avoids 5 localStorage
//        read+write cycles per pack; card meta writes debounced to 200 ms.
//        feat: Card tiles now match native site style — rarity gradient header, shiny
//        badge moved inside image area (no longer obscures player name), parallax tilt
//        on hover (perspective rotateX/Y + scale), persistent circular fav/delete
//        buttons at tile bottom, flag moved inside image, follower/rank stats bar, and
//        card link opens player profile in new tab. Fetches /api/me once at boot to
//        derive the logged-in player ID needed for card profile URLs.
//        feat: Collection Panel — full-screen overlay (📋 button) with rarity/shiny/
//        favs/name/country filters and pagination-aware card grid.
//        feat: Country filter in Collection Panel — native <select> dropdown with full
//        hardcoded country list (matches site's own list); ✕ Clear button to reset.
//        (Replaces chip bar that only populated after card data loaded.)
//        feat: Shiny cards displayed as separate tiles from non-shiny copies, with
//        animated golden border glow and shimmer sweep effect.
//        Fix: /api/collection cursor pagination uses individual query params
//        cursorPlayerId/cursorSortRank/cursorVariantSort from nextCursor object —
//        offset and JSON cursor string are both silently ignored by the server.
//        Fix: API aggregates copies per template; entry.count is the real copy count.
//        No client-side grouping needed; use entry.count directly for ×N badge.
//        Fix: rarity stored lowercase in collectionCache so RARITY_COLORS lookup and
//        rarity filter buttons both match correctly.
//        Fix: DELETE /api/collection payload changed from {playerIds:[N]} to
//        {deleteTargets:[{playerId,isShiny,isSigned,quantity:1}]}. Updated apiDelete()
//        to use new format; both auto-delete and history-panel fallback paths updated.
//        Fix: POST /api/favorites requires {playerId,isShiny,isSigned,isFavorite} —
//        old payload {playerId} returned 400. apiToggleFavourite now passes the full
//        payload; fav/unfav in Collection Panel now persists correctly.
//        Fix: Shiny card border/glow changed from amber (#fbbf24) to silver (#e2e8f0)
//        so shiny cards are visually distinct from legendary cards.
//        Fix: Fav/delete in Collection Panel tiles now syncs filter state live — unfaving
//        a card removes it when "♥ Only" is active; deleting removes it immediately.
//        Fix: Collection Panel loads cards progressively — tiles appear as each page of
//        60 cards arrives instead of waiting for the full collection to load.
//
//  v1.37 Fix: fav yellow border not visible after clicking ♥ Fav in history panel.
//        Root cause: CSS override used stale data-gcb-fav on the wrapper, fighting
//        React's class update. Fixed by syncing wrapper attribute immediately after
//        native button click, and updating CSS selectors from button[class*="left-0.5"]
//        to button[title="Favorite/Unfavorite"] (stable, title-based).
//        Fix: site changed card URLs from /users/{id} to /view/{ownerId}/{id}-{copy}.
//        Updated scrapeOverlayCards(), applyCollectionDeletions(), startDeletionObserver(),
//        applyCollectionFavStates(), removeCardFromCollectionDom(), and findCollectionCard()
//        to use the new URL format — fixes empty history panel, missing deleted-card
//        stamps, and "Remember Deleted" blacklist not triggering.
//        Fix: cards deleted from collection tab not added to Remember Deleted blacklist.
//        Root cause: gcb-card-meta cache was never populated for collection cards, so
//        lookupCardMeta returned null and addToBlacklist was skipped. Fix: added
//        cacheCollectionCardMeta() called on every collection tab activation.
//
//  v1.36 Fix: replace positional class selectors (left-0.5, right-0.5) for native
//        fav/delete buttons — those Tailwind classes were removed from the compiled
//        stylesheet in a site update, breaking both selectors. Fav button now found
//        via button[title="Favorite"] / button[title="Unfavorite"] (title attributes
//        are stable across layout changes). Delete fallback selector removed; relies
//        solely on button[title="Delete"] which remains present.
//        Fix: isFav class check now case-insensitive (.toLowerCase()) to handle both
//        bg-[#78350f] and bg-[#78350F] variants the site may emit.
//
//  v1.35 Fix: detect renamed "Show next N" pagination button (was "Load more").
//        Fix: isShiny() now also detects the ✨ badge div added outside the <a>
//        tag in the new site card layout.
//        Fix: history-panel delete now handles the new inline "Delete 1 copy / No"
//        confirm overlay (replaced the old Yes/No Radix portal). Native delete
//        button lookup updated to prefer button[title="Delete"].
//        Improve: blacklist modal now shows card tiles with avatar image, rarity
//        border, flag and name — matching the history window style. Each tile has
//        a ✕ button to remove that card from the blacklist. Avatar is now stored
//        in both the blacklist entry and the card meta cache so tiles display
//        correctly for cards deleted via the site's native UI.
//
//  v1.34 Perf: remove CSS :has() rules injected by updateDeletedCssRules(). Firefox's
//        relative selector invalidation re-evaluated every :has() rule on every DOM
//        mutation, causing 5 × ~10-second LongTasks during loadAllCards() (confirmed
//        via Firefox profiler: ~70% CPU in style::invalidation::element::relative_selector::*).
//        Fix: rely solely on the existing [data-gcb-deleted="true"] { display:none }
//        attribute selector in injectStyles() — no relative-selector invalidation cost.
//        Flash prevention (v1.22) is replaced by: (a) hiding the collection grid while
//        applyCollectionDeletions() runs synchronously on tab activation, and (b) a
//        MutationObserver that pre-stamps data-gcb-deleted on cards React adds to the
//        grid while the tab is active (MutationObserver callbacks fire before paint).
//        Perf: history window now opens immediately — modal is shown before DOM is
//        built, first 5 packs render synchronously, remaining packs render in async
//        batches of 8. All card images (avatar + flag) use loading="lazy" so only
//        visible images load on open, eliminating the ~75k parallel image loads.
//        Add: clicking anywhere outside the history panel now closes it.
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
//        blocked by site CSP — replaced with a JS addEventListener.
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

  const RARITIES = [
    "mythic",
    "legendary",
    "epic",
    "rare",
    "uncommon",
    "common",
  ];
  const RARITY_COLORS = {
    mythic: "#ef4444",
    legendary: "#fcd34d",
    epic: "#c084fc",
    rare: "#60a5fa",
    uncommon: "#4ade80",
    common: "#9ca3af",
  };
  const RARITY_GRADIENTS = {
    mythic:    "linear-gradient(rgb(127,29,29) 0%,rgb(26,5,5) 100%)",
    legendary: "linear-gradient(rgb(120,83,0) 0%,rgb(26,18,0) 100%)",
    epic:      "linear-gradient(rgb(76,29,149) 0%,rgb(20,5,38) 100%)",
    rare:      "linear-gradient(rgb(29,78,216) 0%,rgb(5,15,50) 100%)",
    uncommon:  "linear-gradient(rgb(20,83,45) 0%,rgb(5,20,12) 100%)",
    common:    "linear-gradient(rgb(55,65,81) 0%,rgb(13,17,23) 100%)",
  };

  // Logged-in user's player ID — fetched once at boot, used for card profile links.
  let gcbMyPlayerId = null;

  // ═══════════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════════

  // Thin wrapper around localStorage JSON read/write.
  // getJSON returns `fallback` when the key is absent or the stored value is
  // unparseable, so callers never need their own try/catch.
  const StorageUtils = {
    getJSON(key, fallback = {}) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    setJSON(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
  };

  // Memoises getElementById results and re-fetches automatically if the cached
  // element has been removed from the document (e.g. after a page navigation).
  const DOMCache = {
    _c: {},
    get(id) {
      const el = this._c[id];
      if (el && document.contains(el)) return el;
      return (this._c[id] = document.getElementById(id));
    },
    clear() {
      this._c = {};
    },
  };

  // Returns a debounced wrapper that delays fn until ms ms after the last call.
  // Replaces manual clearTimeout/setTimeout + timer variable patterns.
  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Schedules fn to run during browser idle time (with a 200 ms forced timeout).
  // Falls back to setTimeout(50) in browsers without requestIdleCallback.
  // Returns a handle that can be passed to cancelIdle().
  function scheduleIdle(fn) {
    return typeof requestIdleCallback === "function"
      ? requestIdleCallback(fn, { timeout: 200 })
      : setTimeout(fn, 50);
  }
  function cancelIdle(handle) {
    if (typeof cancelIdleCallback === "function") cancelIdleCallback(handle);
    else clearTimeout(handle);
  }

  // Resolves when the card grid has more children than countBefore, or after timeoutMs.
  // Uses MutationObserver instead of setInterval polling — zero CPU cost between DOM events.
  function waitForNewCards(grid, countBefore, timeoutMs) {
    return new Promise((resolve) => {
      if (!grid) {
        // Grid not found (tab switched away?) — fall back to a plain sleep.
        setTimeout(resolve, Math.min(timeoutMs, 500));
        return;
      }
      let timer = null;
      const obs = new MutationObserver(() => {
        if (getCardWrappers().length > countBefore) {
          obs.disconnect();
          clearTimeout(timer);
          resolve();
        }
      });
      obs.observe(grid, { childList: true });
      timer = setTimeout(() => {
        obs.disconnect();
        resolve();
      }, timeoutMs);
    });
  }

  // Yields to the browser for at least minDelayMs.
  // Races requestIdleCallback against a minimum sleep so React always gets
  // at least minDelayMs to reconcile before the next "Load more" click,
  // but the browser can process input / paint while we wait.
  function waitForIdle(minDelayMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      // Minimum floor — ensures React has time to reconcile even if idle fires early.
      const minTimer = setTimeout(finish, minDelayMs);
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(
          () => {
            clearTimeout(minTimer);
            finish();
          },
          { timeout: minDelayMs },
        );
      }
      // If no rIC support, minTimer alone resolves after minDelayMs.
    });
  }

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
    const el = DOMCache.get("gcb-status");
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

  function isCollectionTabActive() {
    const t = document.querySelector("#tabs-content-collection");
    return t && t.dataset.state === "active";
  }

  function getCardWrappers() {
    return document.querySelectorAll(
      "#tabs-content-collection .grid > .relative",
    );
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
  let mythicWindowOpen = false; // tracks whether the mythic pulls panel is visible

  function packFingerprint(cards) {
    return cards
      .map((c) => c.id)
      .sort()
      .join(",");
  }

  let _historyCache = null;
  function loadHistory() {
    if (_historyCache !== null) return _historyCache;
    _historyCache = StorageUtils.getJSON("gcb-history", []);
    return _historyCache;
  }
  function saveHistory(history) {
    if (history.length > MAX_HISTORY_PACKS)
      history = history.slice(-MAX_HISTORY_PACKS);
    _historyCache = history;
    StorageUtils.setJSON("gcb-history", history);
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
    const mythics = cards.filter((c) => c.rarity === "mythic");
    if (mythics.length) {
      showMythicNotification(mythics);
      if (mythicWindowOpen) prependMythicCards(mythics);
      const mythicBtn = DOMCache.get("gcb-hist-mythic-btn");
      if (mythicBtn) mythicBtn.style.display = "inline-flex";
    }
  }

  function scrapeOverlayCards() {
    const cards = [];
    // Look inside the overlay container first; fall back to whole page
    const root = document.querySelector(".z-1000") || document.body;
    const links = root.querySelectorAll('a[href*="/view/"]');
    const seen = new Set();
    for (const a of links) {
      const m = a.href.match(/\/view\/\d+\/(\d+)-\d+/);
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

  async function fetchMyPlayerId() {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      gcbMyPlayerId = data?.user?.id ? String(data.user.id) : null;
    } catch {}
  }

  // POST /api/favorites — sets favourite state explicitly via { playerId, isShiny, isSigned, isFavorite }.
  // isFavorite is the desired target state (true = fav, false = unfav). Returns { isFavorite: bool }.
  async function apiToggleFavourite(playerId, isShiny = false, isSigned = false, isFavorite = true) {
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, isShiny, isSigned, isFavorite }),
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

  async function apiDelete(playerId, isShiny = false, isSigned = false) {
    try {
      const res = await fetch("/api/collection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteTargets: [{ playerId, isShiny, isSigned, quantity: 1 }] }),
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
  // _cardStatesCache avoids repeated JSON.parse on every buildCardTile call.
  let _cardStatesCache = null;
  function loadCardStates() {
    if (_cardStatesCache !== null) return _cardStatesCache;
    _cardStatesCache = StorageUtils.getJSON("gcb-card-states");
    return _cardStatesCache;
  }
  function saveCardState(id, patch) {
    _cardStatesCache = null; // invalidate so loadCardStates re-reads from storage
    const all = loadCardStates();
    all[id] = Object.assign(all[id] || {}, patch);
    StorageUtils.setJSON("gcb-card-states", all);
    _cardStatesCache = all;
  }

  // Per-pack-card deleted state — keyed by `${packTimestamp}_${cardId}`.
  // This lets the same player appear un-deleted in a different pack.
  function loadDeletedInstances() {
    return StorageUtils.getJSON("gcb-deleted-instances");
  }
  function saveDeletedInstance(packTs, cardId) {
    const all = loadDeletedInstances();
    all[`${packTs}_${cardId}`] = true;
    StorageUtils.setJSON("gcb-deleted-instances", all);
  }

  // Collection-level deleted IDs — keyed by player ID, checked on every Collection tab activation.
  // Handles the case where the tab was inactive (unmounted) at deletion time so DOM removal was a no-op.
  function loadCollectionDeleted() {
    return new Set(StorageUtils.getJSON("gcb-collection-deleted", []));
  }
  function saveCollectionDeleted(ids) {
    StorageUtils.setJSON("gcb-collection-deleted", [...ids]);
  }
  function markCollectionDeleted(playerId) {
    const ids = loadCollectionDeleted();
    ids.add(playerId);
    saveCollectionDeleted(ids);
    removeCardFromCollectionDom(playerId);
  }

  // ─── Auto-delete config ────────────────────────────────────────────────────
  const AD_KEY = "gcb-auto-delete";
  const BL_KEY = "gcb-blacklist";
  const BL_CFG_KEY = "gcb-blacklist-cfg";

  function loadBlacklist() {
    return StorageUtils.getJSON(BL_KEY);
  }
  function saveBlacklist(bl) {
    StorageUtils.setJSON(BL_KEY, bl);
  }

  function loadBlacklistConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(BL_CFG_KEY) || "{}");
      return {
        enabled: !!raw.enabled,
        rarities: new Set(raw.rarities || ["legendary", "epic"]),
      };
    } catch {
      return { enabled: false, rarities: new Set(["legendary", "epic"]) };
    }
  }
  function saveBlacklistConfig(cfg) {
    localStorage.setItem(
      BL_CFG_KEY,
      JSON.stringify({
        enabled: cfg.enabled,
        rarities: [...cfg.rarities],
      }),
    );
  }

  // Add a card to the blacklist if blacklisting is enabled and the card's
  // rarity is in the configured set. Safe to call on every delete.
  function addToBlacklist(card) {
    const cfg = loadBlacklistConfig();
    if (!cfg.enabled) return;
    if (!cfg.rarities.has(card.rarity)) return;
    const bl = loadBlacklist();
    bl[card.id] = {
      name: card.name,
      rarity: card.rarity,
      country: card.country,
      avatar: card.avatar || "",
    };
    saveBlacklist(bl);
  }

  // ─── Card metadata cache ───────────────────────────────────────────────────
  // Persists { name, rarity, country, avatar } keyed by player ID so the fetch
  // hook can look up card details when a native deletion is intercepted.
  const CARD_META_KEY = "gcb-card-meta";
  let _cardMetaCache = null;
  let _cardMetaFlushTimer = null;
  function loadCardMeta() {
    if (_cardMetaCache !== null) return _cardMetaCache;
    _cardMetaCache = StorageUtils.getJSON(CARD_META_KEY);
    return _cardMetaCache;
  }
  function cacheCardMeta(card) {
    if (!card.id || !card.name) return;
    const meta = loadCardMeta();
    meta[card.id] = {
      name: card.name,
      rarity: card.rarity,
      country: card.country,
      avatar: card.avatar || "",
    };
    clearTimeout(_cardMetaFlushTimer);
    _cardMetaFlushTimer = setTimeout(() => StorageUtils.setJSON(CARD_META_KEY, _cardMetaCache), 200);
  }
  function lookupCardMeta(playerId) {
    return loadCardMeta()[playerId] || null;
  }

  // Scrape all currently visible collection card wrappers and populate the card
  // meta cache. Called on every collection tab activation so that fetch-hook
  // interceptions of DELETE /api/collection can look up name/rarity/country for
  // blacklisting — those fields are unavailable from the API response alone.
  function cacheCollectionCardMeta() {
    for (const w of getCardWrappers()) {
      const a = w.querySelector("a[href]");
      if (!a) continue;
      const m = a.href.match(/\/view\/\d+\/(\d+)-\d+/);
      if (!m) continue;
      const id = parseInt(m[1]);
      const nameEl = a.querySelector("p.font-bold:not(.font-mono)");
      const rarityEl = a.querySelector(
        'p[class*="font-semibold"][class*="uppercase"]',
      );
      const flagEl = a.querySelector('img[src*="flags/4x3/"]');
      const flagM = flagEl ? flagEl.src.match(/flags\/4x3\/([a-z]+)\.svg/) : null;
      const name = nameEl ? nameEl.textContent.trim() : "";
      const rarity = rarityEl ? rarityEl.textContent.trim().toLowerCase() : "";
      const country = flagM ? flagM[1] : "";
      const avatar = `https://a.ppy.sh/${id}`;
      if (name) cacheCardMeta({ id, name, rarity, country, avatar });
    }
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
        enabled: !!raw.enabled,
        rarityMode: raw.rarityMode || "include",
        rarities: new Set(raw.rarities || []),
        natMode: raw.natMode || "include",
        nations: new Set(raw.nations || []),
        whitelist: new Set(
          (raw.whitelist || []).map((n) => n.toLowerCase().normalize("NFC")),
        ),
      };
    } catch {
      return {
        enabled: false,
        rarityMode: "include",
        rarities: new Set(),
        natMode: "include",
        nations: new Set(),
        whitelist: new Set(),
      };
    }
  }

  function saveAutoDeleteConfig(cfg) {
    localStorage.setItem(
      AD_KEY,
      JSON.stringify({
        enabled: cfg.enabled,
        rarityMode: cfg.rarityMode,
        rarities: [...cfg.rarities],
        natMode: cfg.natMode,
        nations: [...cfg.nations],
        whitelist: [...cfg.whitelist],
      }),
    );
  }

  // Returns true if the card should be auto-deleted given the config.
  // Whitelist always wins. If no rarity or nationality filters are configured,
  // nothing is deleted (safe default). When only one dimension is configured,
  // the other is ignored (passes freely).
  function shouldAutoDelete(card, cfg) {
    if (!cfg.enabled) return false;
    if (cfg.whitelist.has((card.name || "").toLowerCase().normalize("NFC")))
      return false;

    const hasRarityFilter = cfg.rarities.size > 0;
    const hasNatFilter = cfg.nations.size > 0;
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
    if (!cfg.enabled) return;
    for (const card of cards) {
      if (!shouldAutoDelete(card, cfg) && !isBlacklisted(card.id)) continue;
      const ok = await apiDelete(card.id, card.isShiny, card.isSigned);
      if (ok) {
        markCollectionDeleted(card.id);
        if (packTs) saveDeletedInstance(packTs, card.id);
        addToBlacklist(card);
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
        const method = (init?.method || input?.method || "GET").toUpperCase();
        if (method === "DELETE" && url.includes("/api/collection") && res.ok) {
          const body = init?.body || input?.body;
          if (body) {
            const parsed = JSON.parse(
              typeof body === "string" ? body : await new Response(body).text(),
            );
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

  // updateDeletedCssRules() was removed in v1.34.
  // It injected per-ID CSS :has() rules that caused Firefox to spend ~70% of CPU in
  // style::invalidation::element::relative_selector::* on every DOM mutation, producing
  // five ~10-second LongTasks during loadAllCards(). Flash prevention is now handled
  // by hiding the collection grid while applyCollectionDeletions() runs synchronously,
  // and by startDeletionObserver() which pre-stamps data-gcb-deleted before paint.
  function updateDeletedCssRules() {
    /* removed in v1.34 — see changelog */
  }

  // Called every time the Collection tab activates — stamps data-gcb-deleted on
  // cards whose player IDs were recorded as deleted via the history panel.
  // We stamp an attribute instead of calling remove() because remove() lets React
  // crash when it later tries to reconcile (removeChild) the same node from its fiber.
  // CSS hides the card; React ignores unknown data-* attributes on its own elements.
  function applyCollectionDeletions() {
    const deleted = loadCollectionDeleted();
    if (!deleted.size) return;
    for (const w of getCardWrappers()) {
      const a = w.querySelector("a[href]");
      if (!a) continue;
      const m = a.href.match(/\/view\/\d+\/(\d+)-\d+/);
      if (!m) continue;
      const id = parseInt(m[1]);
      if (!deleted.has(id)) continue;
      // Re-stamp the attribute — React re-renders lose it on each DOM refresh.
      w.dataset.gcbDeleted = "true";
    }
  }

  // Watches the collection grid and pre-stamps data-gcb-deleted on any card React
  // adds while the tab is active. MutationObserver callbacks fire after DOM mutations
  // but before the browser's next paint, so deleted cards are never visible.
  let _deletionObserver = null;
  function startDeletionObserver() {
    if (_deletionObserver) return;
    const grid = document.querySelector("#tabs-content-collection .grid");
    if (!grid) return;
    _deletionObserver = new MutationObserver((mutations) => {
      const deleted = loadCollectionDeleted();
      if (!deleted.size) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const a = node.querySelector("a[href]");
          if (!a) continue;
          const m = a.href.match(/\/view\/\d+\/(\d+)-\d+/);
          if (m && deleted.has(parseInt(m[1]))) {
            node.dataset.gcbDeleted = "true";
          }
        }
      }
    });
    _deletionObserver.observe(grid, { childList: true });
  }
  function stopDeletionObserver() {
    if (!_deletionObserver) return;
    _deletionObserver.disconnect();
    _deletionObserver = null;
  }

  // Called every time the Collection tab activates — stamps data-gcb-fav on each
  // wrapper so the injected CSS can visually correct the fav button state without
  // making an API call. React controls the button class; we control the wrapper
  // attribute, which React ignores.
  function applyCollectionFavStates() {
    const states = loadCardStates();
    for (const w of getCardWrappers()) {
      const a = w.querySelector("a[href]");
      if (!a) continue;
      const m = a.href.match(/\/view\/\d+\/(\d+)-\d+/);
      if (!m) continue;
      const id = parseInt(m[1]);
      const stored = states[id];
      // Native button title is "Unfavorite" when the card is actually favourited.
      const nativeFav = !!w.querySelector('button[title="Unfavorite"]');
      // If our stored state disagrees with the site, trust the site and heal the record.
      if (stored?.fav === false && nativeFav) {
        saveCardState(id, { fav: true });
        w.dataset.gcbFav = "true";
      } else if (stored?.fav === true) {
        w.dataset.gcbFav = "true";
      } else if (stored?.fav === false) {
        w.dataset.gcbFav = "false";
      } else {
        // No stored record — derive from native button and stamp so filters can rely on the attribute.
        w.dataset.gcbFav = nativeFav ? "true" : "false";
      }
    }
  }

  // Hide a player's card in the collection grid for instant visual feedback on delete.
  // Stamps data-gcb-deleted instead of calling remove() — see applyCollectionDeletions
  // for why removing from React's managed DOM causes crashes.
  function removeCardFromCollectionDom(playerId) {
    for (const w of getCardWrappers()) {
      if (w.querySelector(`a[href*="/${playerId}-"]`)) {
        w.dataset.gcbDeleted = "true";
      }
    }
  }

  // Return the collection grid wrapper for a given player ID, or null if not loaded.
  function findCollectionCard(playerId) {
    for (const w of getCardWrappers()) {
      if (w.querySelector(`a[href*="/${playerId}-"]`)) return w;
    }
    return null;
  }

  // Wait for the inline delete-copy confirm overlay to appear inside cardEl and
  // click the confirm button ("Delete 1 copy" / "Delete N copies").
  // Falls back to a document-wide "Yes" search for any older Radix portal dialog.
  async function clickDeleteConfirm(cardEl, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const scope = cardEl || document;
      for (const btn of scope.querySelectorAll("button")) {
        const t = (btn.innerText || "").trim().toLowerCase();
        if (t.startsWith("delete ") && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      // Old fallback: Radix "Yes" portal
      for (const btn of document.querySelectorAll("button")) {
        if ((btn.innerText || "").trim().toLowerCase() === "yes" && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      await sleep(100);
    }
    return false;
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

  function buildCardTile(card, packTs, _preloadedStates) {
    if (!_preloadedStates) cacheCardMeta(card);
    const rarityColor = RARITY_COLORS[card.rarity] || "#9ca3af";
    const rarityGrad = RARITY_GRADIENTS[card.rarity] || RARITY_GRADIENTS.common;
    const isShiny = card.shiny || card.isShiny || false;
    const borderColor = rarityColor;
    const states = _preloadedStates || loadCardStates();
    const state = {
      fav: card.isFavorited ?? states[card.id]?.fav ?? false,
      deleted: packTs ? !!loadDeletedInstances()[`${packTs}_${card.id}`] : false,
    };

    // Outer tile — overflow:visible so count badge can bleed outside
    const tile = document.createElement("div");
    tile.dataset.playerId = card.id;
    tile.style.cssText = `
      position:relative; width:160px; flex-shrink:0;
      padding-bottom:14px;
      transition:transform 0.45s cubic-bezier(0.23,1,0.32,1);
    `;

    // Parallax tilt on mousemove
    tile.addEventListener("mousemove", (e) => {
      if (state.deleted) return;
      const r = tile.getBoundingClientRect();
      const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
      tile.style.transform = `perspective(900px) rotateX(${-dy * 8}deg) rotateY(${dx * 8}deg) scale(1.04)`;
    });
    tile.addEventListener("mouseleave", () => { tile.style.transform = ""; });

    // Card link — wraps the visual card; navigates to player profile
    const cardLink = document.createElement("a");
    const profilePath = gcbMyPlayerId ? `/view/${gcbMyPlayerId}/${card.id}-0` : null;
    if (profilePath) {
      cardLink.href = profilePath;
      cardLink.target = "_blank";
      cardLink.rel = "noopener noreferrer";
    }
    cardLink.style.cssText = `
      display:flex; flex-direction:column; position:relative;
      border:2px solid ${borderColor}; border-radius:8px; overflow:hidden;
      box-shadow:0 0 6px ${borderColor}44;
      text-decoration:none; color:inherit;
    `;

    // Header: rarity gradient background, player name, rarity label
    const header = document.createElement("div");
    header.style.cssText = `padding:6px 8px 4px; background:${rarityGrad};`;
    const safeName = card.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:4px;">
        <div style="font-size:12px;color:#f9fafb;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px ${rarityColor}88;min-width:0;" title="${safeName}">${safeName}</div>
        ${isShiny ? '<span style="font-size:9px;color:#fcd34d;font-weight:700;flex-shrink:0;">✨</span>' : ""}
      </div>
      <div style="font-size:9px;color:${rarityColor};font-weight:600;letter-spacing:1.5px;text-transform:uppercase;opacity:0.9;">${card.rarity || "—"}</div>
    `;

    // Image section
    const imgSection = document.createElement("div");
    imgSection.style.cssText = "position:relative; flex:1;";

    const img = document.createElement("img");
    img.src = card.avatar;
    img.alt = card.name;
    img.loading = "lazy";
    img.style.cssText = `width:100%;aspect-ratio:1;object-fit:cover;display:block;${isShiny ? "animation:gcb-hue-cycle 8s linear infinite;" : ""}`;
    img.onerror = () => { img.style.background = "#1f2937"; img.src = ""; };

    // Bottom gradient vignette inside image
    const imgVignette = document.createElement("div");
    imgVignette.style.cssText = "position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(transparent,rgba(0,0,0,0.55));pointer-events:none;";

    imgSection.appendChild(img);
    imgSection.appendChild(imgVignette);

    // Flag — bottom-right inside image
    if (card.country) {
      const flag = document.createElement("img");
      flag.src = `https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${card.country}.svg`;
      flag.loading = "lazy";
      flag.style.cssText = "position:absolute;bottom:4px;right:4px;height:12px;border-radius:2px;z-index:2;pointer-events:none;";
      flag.onerror = () => { flag.style.display = "none"; };
      imgSection.appendChild(flag);
    }

    // Shiny overlay — diagonal gold shimmer matching the original site's shiny effect
    if (isShiny) {
      const shimmerOverlay = document.createElement("div");
      shimmerOverlay.style.cssText = `
        position:absolute;inset:0;pointer-events:none;z-index:2;
        background:linear-gradient(135deg,transparent 0%,rgba(252,211,77,0.2) 30%,transparent 50%,rgba(252,211,77,0.2) 70%,transparent 100%);
        background-size:200% 200%;
        animation:gcb-shiny-shimmer 3s ease-in-out infinite;
      `;
      imgSection.appendChild(shimmerOverlay);
    }

    // Stats bar — followers / rank (only when the API provided them)
    let statsBar = null;
    if (card.followerCount !== undefined) {
      const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
      statsBar = document.createElement("div");
      statsBar.style.cssText = `
        display:flex; justify-content:space-between; align-items:center;
        padding:3px 6px; background:#0d1525;
        font-size:9px; font-family:monospace; color:#6b7280;
      `;
      statsBar.innerHTML = `
        <span>FLWR <span style="color:#d1d5db;">${fmt(card.followerCount)}</span></span>
        <span>RANK <span style="color:#d1d5db;">#${fmt(card.followerRank ?? 0)}</span></span>
      `;
    }

    // Deleted label — absolute within cardLink
    const deletedLabel = document.createElement("div");
    deletedLabel.textContent = "DELETED";
    deletedLabel.style.cssText = `
      display:${state.deleted ? "flex" : "none"}; position:absolute;
      left:0; right:0; top:50%; transform:translateY(-50%);
      align-items:center; justify-content:center;
      padding:6px 0; background:rgba(0,0,0,0.72);
      font-size:15px; font-weight:900; letter-spacing:4px; color:#ffffff;
      text-shadow:0 1px 4px #000; pointer-events:none; z-index:7;
    `;

    // Count badge — blue circle, bleeds outside top-right corner of tile
    if (card.count > 1) {
      const badge = document.createElement("div");
      badge.textContent = card.count;
      badge.style.cssText = `
        position:absolute; top:-6px; right:-6px;
        background:#1D4ED8; border:1px solid #3B82F6;
        color:#fff; font-size:10px; font-weight:700;
        width:22px; height:22px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        z-index:6; line-height:1;
      `;
      tile.appendChild(badge);
    }

    // Persistent fav button — circular, bottom-left of tile
    const favBtn = document.createElement("button");
    favBtn.textContent = state.fav ? "♥" : "♡";
    favBtn.title = state.fav ? "Unfav" : "Fav";
    favBtn.style.cssText = `
      position:absolute; bottom:0; left:2px;
      width:26px; height:26px; border-radius:50%; cursor:pointer;
      border:1px solid ${state.fav ? "#fcd34d" : "#4b5563"};
      background:${state.fav ? "#78350f" : "#1f2937"};
      color:${state.fav ? "#fcd34d" : "#9ca3af"};
      font-size:13px; display:flex; align-items:center; justify-content:center;
      z-index:5; padding:0; line-height:1;
      transition:background 0.15s, border-color 0.15s, color 0.15s;
    `;

    // Persistent del button — circular, bottom-right of tile
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Delete";
    delBtn.style.cssText = `
      position:absolute; bottom:0; right:2px;
      width:26px; height:26px; border-radius:50%; cursor:pointer;
      border:1px solid #374151; background:#1f2937; color:#6b7280;
      font-size:11px; display:flex; align-items:center; justify-content:center;
      z-index:5; padding:0; line-height:1;
      transition:background 0.15s, border-color 0.15s, color 0.15s;
    `;

    // Assemble
    cardLink.appendChild(header);
    cardLink.appendChild(imgSection);
    if (statsBar) cardLink.appendChild(statsBar);
    cardLink.appendChild(deletedLabel);

    tile.appendChild(cardLink);
    tile.appendChild(favBtn);
    tile.appendChild(delBtn);

    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      favBtn.textContent = "…";
      favBtn.disabled = true;
      const wantFav = !state.fav;

      const collCard = findCollectionCard(card.id);
      const nativeBtn = collCard?.querySelector('button[title="Favorite"], button[title="Unfavorite"]');
      if (nativeBtn) {
        const isFav = nativeBtn.className.toLowerCase().includes("78350f");
        if (isFav !== wantFav) nativeBtn.click();
        if (collCard) collCard.dataset.gcbFav = wantFav ? "true" : "false";
      } else {
        await apiToggleFavourite(card.id, card.isShiny || false, card.isSigned || false, wantFav);
      }

      state.fav = wantFav;
      saveCardState(card.id, { fav: wantFav });
      favBtn.textContent = wantFav ? "♥" : "♡";
      favBtn.title = wantFav ? "Unfav" : "Fav";
      favBtn.style.borderColor = wantFav ? "#fcd34d" : "#4b5563";
      favBtn.style.background = wantFav ? "#78350f" : "#1f2937";
      favBtn.style.color = wantFav ? "#fcd34d" : "#9ca3af";
      favBtn.disabled = false;
      document.dispatchEvent(new CustomEvent("gcb:favchange", { detail: { cardId: card.id, isShiny: !!(card.isShiny || card.shiny), isFavorited: wantFav } }));
    });

    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      delBtn.textContent = "…";
      delBtn.disabled = true;

      const collCard = findCollectionCard(card.id);
      const nativeDelBtn = collCard?.querySelector('button[title="Delete"]');
      let ok = false;
      if (nativeDelBtn) {
        nativeDelBtn.click();
        ok = await clickDeleteConfirm(collCard);
        if (!ok) {
          delBtn.textContent = "✕";
          delBtn.disabled = false;
          return;
        }
      } else {
        ok = await apiDelete(card.id, card.isShiny, card.isSigned);
      }

      if (ok) {
        state.deleted = true;
        if (packTs) saveDeletedInstance(packTs, card.id);
        markCollectionDeleted(card.id);
        addToBlacklist(card);
        deletedLabel.style.display = "flex";
        removeCardFromCollectionDom(card.id);
        document.dispatchEvent(new CustomEvent("gcb:carddeleted", { detail: { cardId: card.id, isShiny: !!(card.isShiny || card.shiny) } }));
      } else {
        delBtn.textContent = "✕";
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
    header.innerHTML = `
              <span style="font-size:11px;color:#6b7280;">${new Date(pack.timestamp).toLocaleString()}</span>
              <span style="font-size:10px;color:#374151;font-family:monospace;">${pack.cards.length} card${pack.cards.length !== 1 ? "s" : ""}</span>
          `;

    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    for (const card of pack.cards) {
      grid.appendChild(buildCardTile(card, pack.timestamp));
    }

    section.appendChild(header);
    section.appendChild(grid);
    return section;
  }

  // Generation counter — incremented on each renderHistory() call so that
  // deferred batches from a previous render don't append to a re-cleared body.
  let _histRenderGen = 0;

  function _renderHistoryBatch(body, history, startIdx, gen) {
    if (gen !== _histRenderGen) return; // stale batch — body was cleared since
    const BATCH_SIZE = 8;
    const end = Math.max(-1, startIdx - BATCH_SIZE);
    for (let i = startIdx; i > end; i--) {
      body.appendChild(buildPackSection(history[i]));
    }
    if (end >= 0) {
      setTimeout(() => _renderHistoryBatch(body, history, end, gen), 0);
    }
  }

  function renderHistory() {
    const body = DOMCache.get("gcb-hist-body");
    if (!body) return [];
    const history = loadHistory();
    const gen = ++_histRenderGen;

    if (!history.length) {
      body.innerHTML =
        '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:13px;">No history yet. Open some packs with Auto Open!</p>';
      return history;
    }

    body.innerHTML = "";
    const last = history.length - 1;
    // Render the 5 newest packs synchronously so the modal appears immediately
    // with visible content, then defer the rest in batches.
    const INITIAL = 5;
    const syncEnd = Math.max(-1, last - INITIAL);
    for (let i = last; i > syncEnd; i--) {
      body.appendChild(buildPackSection(history[i]));
    }
    if (syncEnd >= 0) {
      setTimeout(() => _renderHistoryBatch(body, history, syncEnd, gen), 0);
    }
    return history;
  }

  // Prepend a single newly-scraped pack to the history body without
  // re-rendering the whole list. Preserves the user's scroll position.
  function prependPackToHistory(pack) {
    const body = DOMCache.get("gcb-hist-body");
    if (!body) return;
    // Remove "No history yet" placeholder if present
    const placeholder = body.querySelector("p");
    if (placeholder) body.innerHTML = "";
    body.insertBefore(buildPackSection(pack), body.firstChild);
  }

  function showMythicNotification(mythicCards) {
    const existing = DOMCache.get("gcb-mythic-toast");
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
    toast.innerHTML = `
      <div id="gcb-mythic-toast-title" style="font-size:20px;font-weight:900;letter-spacing:4px;
           text-transform:uppercase;color:#ef4444;margin-bottom:8px;">
        ⚠ MYTHIC PULL ⚠
      </div>
      <div id="gcb-mythic-toast-names" style="font-size:13px;color:#9ca3af;line-height:1.6;"></div>
      <div style="margin-top:10px;font-size:10px;color:#4b5563;letter-spacing:1px;">Click to dismiss</div>
    `;
    const namesEl = toast.querySelector("#gcb-mythic-toast-names");
    mythicCards.forEach((c, i) => {
      if (i > 0) namesEl.appendChild(document.createTextNode(", "));
      const span = document.createElement("span");
      span.style.cssText = "color:#f9fafb;font-weight:700;";
      span.textContent = c.name;
      namesEl.appendChild(span);
    });

    function dismiss() {
      toast.classList.add("gcb-closing");
      toast.addEventListener("animationend", () => toast.remove(), {
        once: true,
      });
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
        const mainPanel = DOMCache.get("gcb-panel");
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
    const body = DOMCache.get("gcb-mythic-body");
    if (!body) return;
    const history = loadHistory();
    const mythics = history
      .flatMap((pack) =>
        pack.cards
          .filter((c) => c.rarity === "mythic")
          .map((c) => ({ ...c, packTs: pack.timestamp })),
      )
      .reverse();
    if (!mythics.length) {
      body.innerHTML =
        '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:13px;">No mythic cards pulled yet.</p>';
      return;
    }
    body.innerHTML = "";
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    for (const card of mythics)
      grid.appendChild(buildCardTile(card, card.packTs));
    body.appendChild(grid);
  }

  function prependMythicCards(cards) {
    const body = DOMCache.get("gcb-mythic-body");
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
      display:none; position:fixed; right:302px; top:64px; z-index:20001;
      width:900px; max-height:85vh;
      background:#0a0f1a; border:1px solid #1f2937; border-radius:16px;
      overflow:hidden; flex-direction:column;
      box-shadow:0 8px 32px rgba(0,0,0,0.7);
    `;
    modal.innerHTML = `
      <div id="gcb-bl-modal-header" style="display:flex;align-items:center;justify-content:space-between;
           padding:14px 20px;background:#0d1525;border-bottom:1px solid #1f2937;
           cursor:grab;user-select:none;flex-shrink:0;">
        <span style="font-weight:800;font-size:11px;letter-spacing:2.5px;color:#9ca3af;text-transform:uppercase;">Blacklist</span>
        <button id="gcb-bl-modal-close" style="background:none;border:none;
            color:#4b5563;cursor:pointer;font-size:15px;line-height:1;padding:0;">✕</button>
      </div>
      <div id="gcb-bl-modal-body" style="padding:18px 20px;overflow-y:auto;flex:1;"></div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#gcb-bl-modal-close").addEventListener("click", () => {
      modal.style.display = "none";
    });
    makeDraggable(modal, modal.querySelector("#gcb-bl-modal-header"));

    // Close when clicking outside the modal
    document.addEventListener("mousedown", (e) => {
      if (modal.style.display !== "none" && !modal.contains(e.target)) {
        modal.style.display = "none";
      }
    });

    return modal;
  }

  function buildBlacklistCardTile(id, data, onRemove) {
    const rarityColor = RARITY_COLORS[data.rarity] || "#9ca3af";

    const tile = document.createElement("div");
    tile.style.cssText = `
      position:relative; width:160px; background:#0d1525;
      border:2px solid ${rarityColor}; border-radius:8px;
      overflow:hidden;
    `;

    const img = document.createElement("img");
    img.src = data.avatar || "";
    img.alt = data.name;
    img.loading = "lazy";
    img.style.cssText =
      "width:100%;aspect-ratio:1;object-fit:cover;display:block;";
    img.onerror = () => {
      img.style.background = "#1f2937";
      img.src = "";
    };

    const flagHtml = data.country
      ? `<img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${data.country}.svg"
              loading="lazy"
              style="height:10px;vertical-align:middle;margin-right:3px;border-radius:1px;"
              onerror="this.style.display='none'">`
      : "";

    const info = document.createElement("div");
    info.style.cssText = "padding:6px 6px 7px;text-align:center;";
    info.innerHTML = `
      <div style="font-size:10px;color:${rarityColor};text-transform:uppercase;letter-spacing:1.5px;
           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.rarity || "—"}</div>
      <div style="font-size:12px;color:#f9fafb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;"
           title="${data.name}">${flagHtml}${data.name}</div>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove from blacklist";
    removeBtn.style.cssText = `
      position:absolute; top:4px; right:4px;
      background:rgba(0,0,0,0.65); border:1px solid #ef444460;
      border-radius:50%; width:20px; height:20px;
      font-size:10px; color:#ef4444; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      line-height:1; padding:0;
    `;
    removeBtn.addEventListener("click", () => onRemove(id, tile));

    tile.appendChild(img);
    tile.appendChild(info);
    tile.appendChild(removeBtn);
    return tile;
  }

  function renderBlacklistModal(onChangeCallback) {
    const body = DOMCache.get("gcb-bl-modal-body");
    if (!body) return;
    const bl = loadBlacklist();
    const entries = Object.entries(bl);
    if (!entries.length) {
      body.innerHTML =
        '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:13px;">Blacklist is empty.</p>';
      return;
    }

    body.innerHTML = "";
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";

    for (const [id, data] of entries) {
      const tile = buildBlacklistCardTile(id, data, (removedId, el) => {
        removeFromBlacklist(removedId);
        el.remove();
        if (!grid.children.length) {
          body.innerHTML =
            '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:13px;">Blacklist is empty.</p>';
        }
        if (onChangeCallback) onChangeCallback();
      });
      grid.appendChild(tile);
    }

    body.appendChild(grid);
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
                <button id="gcb-hist-mythic-btn" class="gcb-mythic-badge" style="display:none;">✦ Mythic Pulls</button>
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
    modal
      .querySelector("#gcb-hist-mythic-btn")
      .addEventListener("click", () => {
        const mythicModal = DOMCache.get("gcb-mythic-modal");
        if (mythicModal) {
          mythicModal.style.display = "flex";
          mythicWindowOpen = true;
          renderMythicWindow();
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

            @keyframes gcb-shiny-shimmer {
                0%,100% { background-position: 0% 0%; }
                50%      { background-position: 100% 100%; }
            }
            @keyframes gcb-hue-cycle {
                0%   { filter: hue-rotate(0deg)   saturate(1.5) brightness(1.1); }
                100% { filter: hue-rotate(360deg) saturate(1.5) brightness(1.1); }
            }

            /* Correct fav button appearance when collection tab remounts from RSC cache.
               React controls button classes; we set data-gcb-fav on the wrapper, which
               React ignores, so these overrides survive re-renders. */
            #tabs-content-collection .grid > .relative[data-gcb-fav="true"] button[title="Unfavorite"],
            #tabs-content-collection .grid > .relative[data-gcb-fav="true"] button[title="Favorite"] {
                background-color: #78350f !important;
                border-color: #fcd34d !important;
            }
            #tabs-content-collection .grid > .relative[data-gcb-fav="false"] button[title="Favorite"] {
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
                    <button id="gcb-coll-open" style="background:none;border:none;color:#4b5563;cursor:pointer;font-size:14px;line-height:1;padding:0;" title="Collection">📋</button>
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
      DOMCache.get("gcb-fab").style.display = "flex";
    });

    // ── Collection ──
    panel.querySelector("#gcb-coll-open").addEventListener("click", () => {
      document.getElementById("gcb-coll-panel")?._open();
    });

    // ── History ──
    panel.querySelector("#gcb-hist-open").addEventListener("click", () => {
      const modal = DOMCache.get("gcb-history-modal");
      if (!modal) return;
      // Show the modal before rendering so it appears immediately; renderHistory
      // renders the first few packs synchronously then defers the rest.
      modal.style.display = "flex";
      historyWindowOpen = true;
      const history = renderHistory();
      const hasMythics = history.some((p) =>
        p.cards.some((c) => c.rarity === "mythic"),
      );
      const mythicBtn = modal.querySelector("#gcb-hist-mythic-btn");
      if (mythicBtn)
        mythicBtn.style.display = hasMythics ? "inline-flex" : "none";
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

    // ── Auto-Delete section ──
    (function () {
      const cfg = loadAutoDeleteConfig();

      // Fold toggle (clicking the header row expands/collapses the body)
      const adHeader = panel.querySelector("#gcb-ad-header");
      const adBody = panel.querySelector("#gcb-ad-body");
      const adArrow = panel.querySelector("#gcb-ad-arrow");
      adHeader.addEventListener("click", () => {
        const open = adBody.style.display === "none";
        adBody.style.display = open ? "block" : "none";
        adArrow.style.transform = open ? "rotate(90deg)" : "";
      });
      // Stop the toggle label from bubbling up to the fold header
      panel
        .querySelector("#gcb-ad-toggle-label")
        .addEventListener("click", (e) => {
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
      adRarityModeBtn.textContent =
        cfg.rarityMode === "include" ? "Include" : "Exclude";
      adRarityModeBtn.addEventListener("click", () => {
        cfg.rarityMode = cfg.rarityMode === "include" ? "exclude" : "include";
        adRarityModeBtn.textContent =
          cfg.rarityMode === "include" ? "Include" : "Exclude";
        saveAutoDeleteConfig(cfg);
      });

      // Rarity buttons
      const adRaritiesEl = panel.querySelector("#gcb-ad-rarities");
      for (const r of RARITIES) {
        const btn = document.createElement("button");
        btn.className = "gcb-rarity-btn";
        btn.textContent = r[0].toUpperCase() + r.slice(1);
        btn.style.border = `1px solid ${RARITY_COLORS[r]}40`;
        btn.style.color = RARITY_COLORS[r];
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
      adNatModeBtn.textContent =
        cfg.natMode === "include" ? "Include" : "Exclude";
      adNatModeBtn.addEventListener("click", () => {
        cfg.natMode = cfg.natMode === "include" ? "exclude" : "include";
        adNatModeBtn.textContent =
          cfg.natMode === "include" ? "Include" : "Exclude";
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
          adNationsEl.value
            .split(/[\n,]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        );
        saveAutoDeleteConfig(cfg);
      });

      // Whitelist textarea
      const adWhitelistEl = panel.querySelector("#gcb-ad-whitelist");
      adWhitelistEl.value = [...cfg.whitelist].join("\n");
      adWhitelistEl.addEventListener("input", () => {
        cfg.whitelist = new Set(
          adWhitelistEl.value
            .split("\n")
            .map((s) => s.trim().toLowerCase().normalize("NFC"))
            .filter(Boolean),
        );
        saveAutoDeleteConfig(cfg);
      });

      // ── Blacklist sub-section ──
      const blCfg = loadBlacklistConfig();

      const blEnabled = panel.querySelector("#gcb-bl-enabled");
      blEnabled.checked = blCfg.enabled;
      panel
        .querySelector("#gcb-bl-toggle-label")
        .addEventListener("click", (e) => {
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
        btn.style.color = RARITY_COLORS[r];
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
        const blModal = DOMCache.get("gcb-bl-modal");
        if (!blModal) return;
        renderBlacklistModal(refreshBlCount);
        blModal.style.display = "flex";
      });

      panel.querySelector("#gcb-bl-clear").addEventListener("click", () => {
        if (
          confirm(
            "Clear the blacklist? Repulled cards will no longer be auto-deleted.",
          )
        ) {
          saveBlacklist({});
          refreshBlCount();
          const blModal = DOMCache.get("gcb-bl-modal");
          if (blModal && blModal.style.display !== "none")
            renderBlacklistModal(refreshBlCount);
        }
      });
    })();

    // ── Drag ──
    makeDraggable(panel, panel.querySelector("#gcb-header"));

    return panel;
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
      const panel = DOMCache.get("gcb-panel");
      panel.style.display = "block";
      btn.style.display = "none";
    });
    document.body.appendChild(btn);
    return btn;
  }

  function updatePackDisplay() {
    const count = readPackCount();
    const el = DOMCache.get("gcb-packs");
    if (!el) return;
    if (count >= 0) {
      el.textContent = `🃏 ${count}/10`;
      el.style.color = count > 0 ? "#60a5fa" : "#374151";
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  COLLECTION PANEL
  // ═══════════════════════════════════════════════════════════════

  function normalizeApiCard(c) {
    return {
      ...c,
      name: c.name || c.username || "",
      avatar: `https://a.ppy.sh/${c.id}`,
      country: (c.countryCode || c.nationality || "").toLowerCase(),
      rarity: (c.rarity || "").toLowerCase(),
      shiny: c.isShiny,
    };
  }

  function syncFavStatesFromApi(cards) {
    _cardStatesCache = null;
    const states = loadCardStates();
    for (const c of cards) {
      if (!states[c.id]) states[c.id] = {};
      states[c.id].fav = c.isFavorited;
    }
    StorageUtils.setJSON("gcb-card-states", states);
    _cardStatesCache = states;
  }

  async function fetchCollection(onProgress, onPage) {
    const cardMap = new Map();
    const meta = loadCardMeta();
    let favSet = null;
    let totalMatching = 0;
    let cursor = null;
    do {
      if (cardMap.size > 0) await new Promise((r) => setTimeout(r, 300));
      let url = "/api/collection?limit=60";
      if (cursor) {
        url += `&cursorPlayerId=${cursor.playerId}&cursorSortRank=${cursor.sortRank}&cursorVariantSort=${cursor.variantSort}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`/api/collection ${res.status}`);
      const data = await res.json();
      if (!favSet) {
        favSet = new Set(data.favorites || []);
        totalMatching = data.totalMatching || 0;
      }
      const entries = data.entries || [];
      if (entries.length === 0) break;
      const newCards = [];
      for (const entry of entries) {
        const c = entry.card;
        const rarity = (c.rarity || "").toLowerCase();
        const isFavorited = favSet.has(c.instanceId.replace("collection:", ""));
        const norm = normalizeApiCard({ ...c, name: c.username });
        meta[c.id] = { name: c.username, rarity, country: norm.country, avatar: norm.avatar };
        const mapKey = `${c.id}_${c.isShiny ? 1 : 0}`;
        if (cardMap.has(mapKey)) {
          cardMap.get(mapKey).count += entry.count || 1;
        } else {
          const cardObj = { ...c, name: c.username, rarity, isFavorited, count: entry.count || 1 };
          cardMap.set(mapKey, cardObj);
          newCards.push(cardObj);
        }
      }
      if (onProgress) onProgress(cardMap.size, totalMatching);
      if (onPage) onPage(newCards, totalMatching);
      cursor = data.nextCursor || null;
      if (!cursor) break;
    } while (true);
    clearTimeout(_cardMetaFlushTimer);
    _cardMetaCache = meta;
    StorageUtils.setJSON(CARD_META_KEY, meta);
    return { cards: [...cardMap.values()], totalMatching };
  }

  let collectionCache = null;

  function buildCollectionPanel() {
    let cpFilter = {
      rarities: new Set(),
      shinyOnly: false,
      favsMode: "off",
      query: "",
      country: "",
    };

    const overlay = document.createElement("div");
    overlay.id = "gcb-coll-panel";
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:30000;
      background:#080f1e; display:none;
      flex-direction:column; overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      flex-shrink:0; display:flex; align-items:center; gap:12px;
      padding:12px 18px; background:#0d1525;
      border-bottom:1px solid #1f2937;
    `;

    const titleEl = document.createElement("span");
    titleEl.style.cssText = "font-weight:800;font-size:13px;letter-spacing:3px;color:#3b82f6;text-transform:uppercase;flex-shrink:0;";
    titleEl.textContent = "Collection";

    const countEl = document.createElement("span");
    countEl.style.cssText = "font-size:11px;color:#6b7280;flex-shrink:0;";

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.title = "Reload collection from server";
    refreshBtn.style.cssText = "background:none;border:1px solid #1f2937;border-radius:12px;color:#6b7280;cursor:pointer;font-size:11px;padding:2px 10px;flex-shrink:0;";
    refreshBtn.addEventListener("click", () => {
      collectionCache = null;
      loadCollection();
    });

    const headerSpacer = document.createElement("div");
    headerSpacer.style.cssText = "flex:1;";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "background:none;border:none;color:#6b7280;cursor:pointer;font-size:16px;line-height:1;padding:0;flex-shrink:0;";
    closeBtn.addEventListener("click", closePanel);

    header.appendChild(titleEl);
    header.appendChild(countEl);
    header.appendChild(refreshBtn);
    header.appendChild(headerSpacer);
    header.appendChild(closeBtn);

    const filterBar = document.createElement("div");
    filterBar.style.cssText = `
      flex-shrink:0; display:flex; flex-wrap:wrap; align-items:center; gap:8px;
      padding:10px 18px; background:#0d1525; border-bottom:1px solid #1f2937;
    `;

    for (const r of RARITIES) {
      const color = RARITY_COLORS[r] || "#9ca3af";
      const btn = document.createElement("button");
      btn.textContent = r.charAt(0).toUpperCase() + r.slice(1);
      btn.dataset.rarity = r;
      btn.style.cssText = `
        padding:3px 10px; border-radius:20px; font-size:11px; cursor:pointer;
        border:1px solid ${color}40; background:transparent; color:${color};
        transition:background 0.15s;
      `;
      btn.addEventListener("click", () => {
        if (cpFilter.rarities.has(r)) {
          cpFilter.rarities.delete(r);
          btn.style.background = "transparent";
          btn.style.fontWeight = "";
        } else {
          cpFilter.rarities.add(r);
          btn.style.background = color + "33";
          btn.style.fontWeight = "700";
        }
        renderGrid();
      });
      filterBar.appendChild(btn);
    }

    const shinyBtn = document.createElement("button");
    shinyBtn.textContent = "✨ Shiny";
    shinyBtn.style.cssText = `
      padding:3px 10px; border-radius:20px; font-size:11px; cursor:pointer;
      border:1px solid #fbbf2440; background:transparent; color:#fbbf24;
      transition:background 0.15s;
    `;
    shinyBtn.addEventListener("click", () => {
      cpFilter.shinyOnly = !cpFilter.shinyOnly;
      shinyBtn.style.background = cpFilter.shinyOnly ? "#fbbf2433" : "transparent";
      shinyBtn.style.fontWeight = cpFilter.shinyOnly ? "700" : "";
      renderGrid();
    });
    filterBar.appendChild(shinyBtn);

    const FAVS_MODES = ["off", "only", "hide"];
    const FAVS_LABELS = { off: "♥ Favs", only: "♥ Only", hide: "✕ Favs" };
    const favsBtn = document.createElement("button");
    favsBtn.style.cssText = `
      padding:3px 10px; border-radius:20px; font-size:11px; cursor:pointer;
      border:1px solid #ef444440; background:transparent; color:#ef4444;
      transition:background 0.15s;
    `;
    const syncFavsBtn = () => {
      favsBtn.textContent = FAVS_LABELS[cpFilter.favsMode];
      favsBtn.style.fontWeight = cpFilter.favsMode !== "off" ? "700" : "";
      favsBtn.style.background = cpFilter.favsMode !== "off" ? "#ef444433" : "transparent";
    };
    syncFavsBtn();
    favsBtn.addEventListener("click", () => {
      const i = FAVS_MODES.indexOf(cpFilter.favsMode);
      cpFilter.favsMode = FAVS_MODES[(i + 1) % FAVS_MODES.length];
      syncFavsBtn();
      renderGrid();
    });
    filterBar.appendChild(favsBtn);

    const COUNTRY_CODES = ["AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BG","BH","BN","BO","BR","BW","BY","BZ","CA","CH","CK","CL","CN","CO","CR","CU","CV","CW","CY","CZ","DE","DK","DO","DZ","EC","EE","EG","ES","FI","FJ","FO","FR","GB","GE","GG","GH","GI","GL","GP","GR","GT","GU","GY","HK","HM","HN","HR","HU","ID","IE","IL","IM","IN","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KR","KW","KZ","LA","LB","LK","LT","LU","LV","LY","MA","MD","ME","MF","MK","MM","MN","MO","MP","MQ","MT","MU","MV","MX","MY","NC","NG","NI","NL","NO","NP","NZ","OM","PA","PE","PF","PH","PK","PL","PR","PS","PT","PY","QA","RE","RO","RS","RU","SA","SC","SD","SE","SG","SH","SI","SJ","SK","SM","SR","SV","SY","TH","TN","TR","TT","TW","UA","US","UY","UZ","VA","VE","VN","YE","ZA"];

    const countrySelect = document.createElement("select");
    countrySelect.style.cssText = `
      height:26px; border-radius:20px; font-size:11px; cursor:pointer;
      border:1px solid #1f293740; background:#080f1e; color:#9ca3af;
      padding:0 8px; outline:none;
    `;
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "🌍 All";
    countrySelect.appendChild(allOpt);
    for (const cc of COUNTRY_CODES) {
      const opt = document.createElement("option");
      opt.value = cc.toLowerCase();
      opt.textContent = `${String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))} ${cc}`;
      countrySelect.appendChild(opt);
    }
    countrySelect.addEventListener("change", () => {
      cpFilter.country = countrySelect.value;
      countrySelect.style.color = cpFilter.country ? "#60a5fa" : "#9ca3af";
      countrySelect.style.borderColor = cpFilter.country ? "#3b82f640" : "#1f293740";
      clearCountryBtn.style.display = cpFilter.country ? "inline-flex" : "none";
      renderGrid();
    });
    filterBar.appendChild(countrySelect);

    const clearCountryBtn = document.createElement("button");
    clearCountryBtn.textContent = "✕";
    clearCountryBtn.title = "Clear country filter";
    clearCountryBtn.style.cssText = `
      display:none; align-items:center; justify-content:center;
      padding:3px 8px; border-radius:20px; font-size:11px; cursor:pointer;
      border:1px solid #3b82f640; background:#3b82f622; color:#60a5fa;
    `;
    clearCountryBtn.addEventListener("click", () => {
      cpFilter.country = "";
      countrySelect.value = "";
      countrySelect.style.color = "#9ca3af";
      countrySelect.style.borderColor = "#1f293740";
      clearCountryBtn.style.display = "none";
      renderGrid();
    });
    filterBar.appendChild(clearCountryBtn);

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search name…";
    searchInput.style.cssText = `
      margin-left:auto; padding:3px 10px; border-radius:20px; font-size:11px;
      border:1px solid #1f2937; background:#080f1e; color:#f9fafb;
      outline:none; width:180px;
    `;
    searchInput.addEventListener("input", () => {
      cpFilter.query = searchInput.value.trim().toLowerCase();
      renderGrid();
    });
    filterBar.appendChild(searchInput);

    const statusBar = document.createElement("div");
    statusBar.style.cssText = `
      flex-shrink:0; padding:6px 18px; font-size:11px; color:#60a5fa;
      background:#0d1525; border-bottom:1px solid #1f2937; display:none;
    `;

    const gridWrap = document.createElement("div");
    gridWrap.style.cssText = "flex:1; overflow-y:auto; padding:16px 18px;";

    const grid = document.createElement("div");
    grid.style.cssText = "display:flex; flex-wrap:wrap; gap:12px;";
    gridWrap.appendChild(grid);

    overlay.appendChild(header);
    overlay.appendChild(filterBar);
    overlay.appendChild(statusBar);
    overlay.appendChild(gridWrap);
    document.body.appendChild(overlay);

    function setStatus(msg) {
      statusBar.textContent = msg;
      statusBar.style.display = msg ? "block" : "none";
    }

    function passesFilter(card) {
      if (cpFilter.rarities.size > 0 && !cpFilter.rarities.has(card.rarity))
        return false;
      if (cpFilter.shinyOnly && !card.isShiny) return false;
      if (cpFilter.favsMode === "only" && !card.isFavorited) return false;
      if (cpFilter.favsMode === "hide" && card.isFavorited) return false;
      if (cpFilter.query && !card.name.toLowerCase().includes(cpFilter.query))
        return false;
      if (cpFilter.country) {
        const code = (card.countryCode || card.nationality || "").toLowerCase();
        if (code !== cpFilter.country) return false;
      }
      return true;
    }

    function renderGrid() {
      const visible = collectionCache ? collectionCache.filter(passesFilter) : [];
      countEl.textContent = collectionCache ? ` ${visible.length} / ${collectionCache.length}` : "";
      grid.innerHTML = "";
      if (visible.length === 0) return;
      const preloadedStates = loadCardStates();
      let i = 0;
      function batch() {
        const frag = document.createDocumentFragment();
        const end = Math.min(i + 50, visible.length);
        while (i < end) {
          frag.appendChild(buildCardTile(normalizeApiCard(visible[i]), null, preloadedStates));
          i++;
        }
        grid.appendChild(frag);
        if (i < visible.length) requestAnimationFrame(batch);
      }
      requestAnimationFrame(batch);
    }

    async function loadCollection() {
      setStatus("Loading collection…");
      grid.innerHTML = "";
      countEl.textContent = "";
      collectionCache = [];
      try {
        const preloadedStates = loadCardStates();
        const { cards: raw, totalMatching } = await fetchCollection(
          (loaded, total) => setStatus(`Loading… ${loaded} / ${total}`),
          (newCards, total) => {
            if (!newCards.length) return;
            const frag = document.createDocumentFragment();
            for (const card of newCards) {
              collectionCache.push(card);
              frag.appendChild(buildCardTile(normalizeApiCard(card), null, preloadedStates));
            }
            grid.appendChild(frag);
            countEl.textContent = ` ${collectionCache.length} / ${total || "?"}`;
          },
        );
        collectionCache = raw;
        syncFavStatesFromApi(raw);
        countEl.textContent = ` ${raw.length} / ${raw.length}`;
        const totalInstances = raw.reduce((s, c) => s + (c.count || 1), 0);
        setStatus(totalInstances > raw.length
          ? `${raw.length} unique · ${totalInstances} total copies`
          : `${raw.length} cards`);
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    }

    function onEsc(e) {
      if (e.key === "Escape") closePanel();
    }

    function openPanel() {
      overlay.style.display = "flex";
      document.addEventListener("keydown", onEsc);
      if (!collectionCache) {
        loadCollection();
      } else {
        renderGrid();
      }
    }

    function closePanel() {
      overlay.style.display = "none";
      document.removeEventListener("keydown", onEsc);
    }

    overlay._open = openPanel;

    document.addEventListener("gcb:favchange", ({ detail }) => {
      if (!collectionCache || overlay.style.display === "none") return;
      const card = collectionCache.find((c) => c.id === detail.cardId && !!c.isShiny === detail.isShiny);
      if (card) {
        card.isFavorited = detail.isFavorited;
        renderGrid();
      }
    });

    document.addEventListener("gcb:carddeleted", ({ detail }) => {
      if (!collectionCache || overlay.style.display === "none") return;
      const idx = collectionCache.findIndex((c) => c.id === detail.cardId && !!c.isShiny === detail.isShiny);
      if (idx !== -1) {
        collectionCache.splice(idx, 1);
        renderGrid();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT & OBSERVERS
  // ═══════════════════════════════════════════════════════════════

  injectStyles();
  const panel = buildPanel();
  buildFab();
  buildHistoryModal();
  buildMythicModal();
  buildBlacklistModal();
  buildCollectionPanel();

  function syncFilterSection() {
    if (isCollectionTabActive()) {
      startDeletionObserver();
      const grid = document.querySelector("#tabs-content-collection .grid");
      if (grid) grid.style.visibility = "hidden";
      applyCollectionDeletions();
      if (grid) grid.style.visibility = "";
      cacheCollectionCardMeta();
      applyCollectionFavStates();
    } else {
      stopDeletionObserver();
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
  const observer = new MutationObserver(
    debounce(() => {
      tryStart();
      updatePackDisplay();
      syncFilterSection();
      tryScrapePack();
    }, 300),
  );
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "data-state"],
  });

  // Re-clamp panel position on window resize so it can't go off-screen
  window.addEventListener("resize", () => {
    const p = DOMCache.get("gcb-panel");
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
    fetchMyPlayerId();
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
      "running:", running,
      "| autoOpen:", prefs.autoOpen,
      "| overlay:", isResultOverlayVisible(),
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
      body: JSON.stringify({ deleteTargets: [{ playerId, isShiny: false, isSigned: false, quantity: 1 }] }),
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
