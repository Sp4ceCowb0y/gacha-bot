# GachaBot

> Tampermonkey userscript for [gacha.miz.to](https://gacha.miz.to) — auto-opens packs and adds a collection filter panel.

**Version:** 1.31 · **Author:** Sp4ceCowb0y

---

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Click the link below to install the script directly from GitHub:

   **[Install GachaBot](https://raw.githubusercontent.com/Sp4ceCowb0y/gacha-bot/master/gacha-bot.user.js)**

3. Tampermonkey will prompt you to confirm the installation — click **Install**.

The script auto-updates from the `master` branch whenever a new version is released.

---

## Features

### Auto-Open

Automatically opens packs one by one without manual clicking.

- Toggle on/off with the switch in the panel
- Waits a randomised delay after each pack result before opening the next (reduces detection risk and mimics human behaviour)
- Detects when the result overlay is already visible and starts immediately
- **Min-packs threshold** — set a minimum number of packs required before the bot opens any; the bot returns to the home screen if your pack count drops below the threshold mid-session

### Pack History

A floating, draggable history window accessible via the **🕓** button in the panel header.

- Automatically captures every pack opened (including manually opened packs)
- Shows each card with its rarity border, country flag, and player name
- Cards auto-deleted by Auto-Delete are stamped with a **DELETED** banner in the history
- Per-card actions directly from the history window:
  - **Favourite** (❤️) — adds the card to your favourites via the site API
  - **Delete** (🗑) — removes the card from your collection via the site API
- Stores up to 500 packs in `localStorage`
- Both the history window and the main panel can be open and visible at the same time

### Auto-Delete

A collapsible panel section for configuring automatic card deletion immediately after a pack is opened.

- Enable/disable with a toggle
- **Rarity rules** — select which rarities to auto-delete (common, uncommon, rare, epic, legendary); toggle between **Include** (delete these) and **Exclude** (delete everything except these) mode
- **Nationality rules** — select which countries to auto-delete; same Include/Exclude toggle
- **Name whitelist** — comma-separated list of player names that are never auto-deleted, regardless of rarity or nationality rules
- Deleted cards are immediately hidden from your collection and stamped in history tiles

### Collection Filter

Shown automatically when you switch to the **Collection** tab.

- **Rarity filter** — toggle buttons for legendary, epic, rare, uncommon, and common
- **Shiny only** — show only shiny cards (correctly excludes legendary shimmer)
- **Favourites cycle** — single button that cycles through three modes:
  - Off — no favourites filter
  - ♥ Only — show only favourited cards
  - ✕ Hide — hide all favourited cards
- **Country filter** — per-country checkboxes with flag icons; **All** and **None** shortcuts
- Auto-loads your full collection by clicking "Load more" until every card is visible, with smooth incremental rendering as each batch arrives
- A card count ("Showing X of Y") updates live as filters change; deleted cards are excluded from the count

---

## Panel UI

- Floating panel fixed to the top-right of the screen, just below the site header
- Fully **draggable** — click and drag the header to reposition it anywhere on screen
- Re-clamps to the visible area on window resize so it can never go off-screen
- Collapse to a small **FAB button** (GachaBot icon) via the ✕ button; click the FAB to reopen

---

## Changelog

Full version history is documented in the script header at the top of [`gacha-bot.user.js`](./gacha-bot.user.js).

---

## Notes

- This script only runs on `https://gacha.miz.to/*`
- All preferences (Auto-Open state, min-pack threshold, filter selections, Auto-Delete config, pack history) are stored in your browser's `localStorage` and persist across sessions
- No data is sent anywhere outside of the site's own API endpoints
