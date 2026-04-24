# GachaBot

A single-file Tampermonkey userscript for [gacha.miz.to](https://gacha.miz.to) — automates pack opening, filters collection, and auto-deletes unwanted cards.

## Stack

- Language: Vanilla JavaScript (ES2020+)
- Runtime: Tampermonkey browser extension
- Target site: `https://gacha.miz.to/*`
- No build step — plain `.js` file, runs directly in the browser

## Project Structure

Single file: `gacha-bot.user.js`

The script header (`// ==UserScript==`) controls Tampermonkey metadata:
- `@version` — must be bumped on every release or auto-update won't trigger; use `X.Y-beta` on `dev`, strip the `-beta` suffix on the release branch
- `@updateURL` / `@downloadURL` — point to `dev` on the `dev` branch, must be changed to `master` on `release/X.Y` and `master`
- Install link in README points to `master` (stable)

## Features

Derived from the changelog — know these before editing:

| Feature | Since | Description |
|---------|-------|-------------|
| Auto-open bot | v1.0 | Polls for the pack-result overlay, clicks through packs with random delays; draggable floating panel with FAB collapse |
| Min-packs threshold | v1.3 | "Open only if ≥ X packs" stepper; bot returns to home when pack count drops below threshold mid-session |
| Collection filter panel | v1.1 | Rarity buttons, shiny-only toggle, per-country checkboxes + All/None. Auto-clicks pagination until full collection loads |
| Favourites filter | v1.24–v1.25 | Cycles off → ♥ Only → ✕ Hide via a single button (`favsMode`: `off`\|`only`\|`hide`) |
| Pack history panel | v1.5, v1.30 | Draggable floating panel (not full-screen overlay); captures every auto-opened and manually opened pack via MutationObserver; per-card fav/delete; up to 500 packs in localStorage |
| Auto-Delete panel | v1.27 | Collapsible panel; configure rarities + nationalities to auto-delete on pull; name whitelist always takes precedence; deletions stamped into `gcb-collection-deleted` immediately |
| Remember Deleted blacklist | v1.34 | When enabled, cards deleted matching configured rarities are stored in `gcb-blacklist` and auto-deleted whenever repulled, independently of rarity/nationality rules |

## Branch Workflow

- `dev` — active development, `@updateURL` tracks this
- `release/X.Y` — release candidate branch (PR target before merging to master)
- `master` — stable, auto-update source for end users

### Release Steps

1. Finish work on `dev`, commit and push
2. Merge `dev` → `release/X.Y` (create branch if needed), then in the release branch:
   - Strip `-beta` from `@version` (e.g. `1.35-beta` → `1.35`)
   - Change `@updateURL` and `@downloadURL` from `dev` to `master`
   - **Merge `master` into `release/X.Y`** (`git merge master`) and resolve the `@version` conflict (keep the new version). This prevents merge conflicts when the PR lands on master.
   - Commit and push
3. Merge `release/X.Y` → `master` via a PR (using GitHub MCP `create_pull_request`)
4. After PR is merged, pull master locally and push any pending local changes
5. Create a GitHub Release via the REST API — read the token from `~/.claude/settings.json`, build the JSON body with Python to avoid shell escaping issues, then POST with curl:
   ```bash
   TOKEN=$(py -c "import json, os; d=json.load(open(os.path.join(os.path.expanduser('~'), '.claude', 'settings.json'))); print(d['mcpServers']['github']['env']['GITHUB_PERSONAL_ACCESS_TOKEN'])")
   BODY=$(py -c "import json; print(json.dumps({'tag_name':'vX.Y','target_commitish':'master','name':'vX.Y','body':'<changelog>','draft':False,'prerelease':False}))")
   curl -s -X POST -H "Authorization: token $TOKEN" -H "Content-Type: application/json" \
     https://api.github.com/repos/Sp4ceCowb0y/gacha-bot/releases -d "$BODY"
   ```
   Changelog content comes from the `// CHANGELOG` block at the top of `gacha-bot.user.js`
6. Switch back to `dev`, bump `@version` to the next version with `-beta` suffix (e.g. `1.35` → `1.36-beta`), and commit

## Key Conventions

- Changelog is maintained **inside the script header** at the top of `gacha-bot.user.js`, not externally
- Each changelog entry: `v{version} {type}: {description}` — keep concise, one line per change
- All user preferences stored in `localStorage` (Auto-Open state, filters, pack history, blacklist)
- No external data — only communicates with `gacha.miz.to` API endpoints
- Pack history capped at 500 entries in localStorage

## Architecture Notes

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `gcb-collection-deleted` | Set of deleted player IDs — stamped on every Collection tab activation |
| `gcb-deleted-instances` | Per-pull deletion state, keyed by `${packTimestamp}_${cardId}` — same player in a different pack is unaffected |
| `gcb-blacklist` | "Remember Deleted" entries; auto-delete on repull regardless of rarity/nationality rules |
| `gcb-card-states` | Fav/delete state per card (legacy; fav truth-of-record is now the native button class `bg-[#78350f]`) |
| Pack history | Up to 500 packs stored in localStorage |

### React / Next.js Site Constraints

- **Never remove React-managed DOM nodes.** Calling `.remove()` on a React fiber node causes `removeChild` crashes later. Instead, stamp `data-gcb-deleted="true"` on the wrapper and hide it with CSS (`[data-gcb-deleted="true"] { display:none }`).
- The site uses **Next.js App Router** with React Server Components. Client-side React Query invalidation has no effect on server components; use `router.refresh()` for soft RSC re-fetch, or click the native fav/delete buttons so React handles state itself.
- Radix UI is used for modals/portals — overlays may be in a Radix portal detached from the main tree.

### CSS Performance

- Avoid injecting CSS `:has()` rules dynamically. Firefox re-evaluates every `:has()` rule on every DOM mutation — during `loadAllCards()` this caused ~5 × 10-second LongTasks (~70% CPU in style invalidation). Use attribute selectors (`[data-gcb-deleted="true"]`) instead, which have no relative-selector invalidation cost.

### Site API Endpoints

| Method | Endpoint | Auth | Request Body | Purpose |
|--------|----------|------|--------------|---------|
| `GET` | `/api/me` | cookie | — | Current user profile |
| `GET` | `/api/collection` | cookie | query: `limit` (always returns 60), pagination via `cursorPlayerId`+`cursorSortRank`+`cursorVariantSort` from previous `nextCursor` | Paginated collection; response has `entries`, `favorites`, `totalMatching`, `nextCursor` |
| `DELETE` | `/api/collection` | cookie | `{ deleteTargets: [{ playerId: number, isShiny: boolean, isSigned: boolean, quantity: number }] }` | Delete card(s) from collection; response: `{ success: true }` |
| `GET` | `/api/favorites` | cookie | — | All favourited cards |
| `POST` | `/api/favorites` | cookie | `{ playerId: number, isShiny: boolean, isSigned: boolean, isFavorite: boolean }` | Set favourite state; `isFavorite` is the desired target state. Returns `{ isFavorite: bool }` |
| `POST` | `/api/packs/open` | cookie | — (no body) | Open a pack; returns `{ cards, isShinyPack, isSignedPack }` |

### `/api/collection` Response Shape (verified live)

```json
{
  "entries": [
    {
      "card": {
        "id": 652457,
        "instanceId": "collection:11274238:0:false",
        "username": "...",
        "countryCode": "US",
        "title": "...",
        "followerCount": 0,
        "followerRank": 0,
        "rarity": "common",
        "isShiny": false,
        "isSigned": false
      },
      "count": 1,
      "shinyCount": 0
    }
  ],
  "favorites": ["11274238:0:false"],
  "stats": {},
  "bulkDeleteStats": {},
  "totalMatching": 123,
  "nextCursor": { "playerId": 652457, "sortRank": 0, "variantSort": 0 }
}
```

**Key differences from old docs:**
- Top-level key is `entries` (not `cards`); each entry is `{ card, count, shinyCount }`
- Card fields: `username` (not `name`), `countryCode` (not `nationality`); NO `isFavorited` field
- `favorites` is a full string array `"playerId:shinyVariant:isSigned"` returned on every page — derive `isFavorited` by checking if `instanceId.replace("collection:", "")` is in the Set
- **Pagination**: `offset` and JSON `cursor` query params are both silently ignored. Pass `nextCursor` fields as individual params: `cursorPlayerId`, `cursorSortRank`, `cursorVariantSort`. Stop when `nextCursor` is absent or entries is empty.
- **Each entry is aggregated per card template** — `count` reflects the actual number of copies owned (not always 1). Use `entry.count` directly; no client-side grouping needed.
- Cards are sorted by follower count descending — first page is always mythic/legendary

### Card instanceId Formats

Two different formats depending on context — do NOT mix them up:

| Context | Format | Example |
|---------|--------|---------|
| Pack open response | `"{packId}:{position}"` | `"4878581:0"` through `"4878581:4"` |
| Collection response | `"collection:{ownerId}:{shinyVariant}:{isSigned}"` | `"collection:11274238:0:false"` |

### Collection Card DOM Structure

Each card in the collection grid is:
```
div.relative.flex.justify-center        ← card wrapper
  a[href*="/view/"]                     ← card image link (/view/{ownerId}/{cardId}-{copyNum})
  button[title="Favorite/Unfavorite"]   ← fav, bottom-left; active state: class includes bg-[#78350f]
  button[title="Copy share link"]       ← share, bottom-center (NEW — don't confuse with fav/delete)
  button[title="Delete"]                ← delete, bottom-right; only non-faved in normal mode, ALL in bulk delete
```

### Bulk Delete Mode

- Toggled by a "Bulk Delete" button in the collection tab — **client-side only**
- In bulk delete mode, `button[title="Delete"]` becomes visible on all cards including favourited ones
- Rarity sub-buttons that appear in bulk delete mode are pure client-side filters — no API calls

### Known Site Selector Gotchas

- Pagination button was renamed from **"Load more"** to **"Show next N"** — check for both or use a more stable selector
- The ✨ shiny badge `div` is **outside** the `<a>` tag in the current card layout; `isShiny()` keys on `rounded-md` class, not shimmer duration
- Native delete confirm changed from a Yes/No Radix portal to an **inline "Delete 1 copy / No" overlay** — prefer `button[title="Delete"]` for the native delete button
- Native fav button: use `button[title="Favorite"]` / `button[title="Unfavorite"]` — the old `button[class*="left-0.5"]` positional selector is broken; `left-0.5` is absent from the compiled CSS as of the v1.36 fix
- Native fav state: `bg-[#78350f]` (or `bg-[#78350F]`) class on the fav button — check case-insensitively with `.toLowerCase().includes("78350f")`
- Native delete button: `button[title="Delete"]` is the only selector; `right-0.5` fallback was removed in v1.36 (class no longer compiled by the site)
- **Pack overlay fav button has NO `title` attribute** — it uses emoji text `🤍` (unfaved) / `🧡` (faved), positioned at `-top-1 -right-1` on the card. Cannot use `button[title="Favorite"]` inside the overlay. Note: the bot never clicks overlay fav buttons — history-panel fav/delete clicks the native collection card buttons (`button[title="Favorite/Unfavorite"]`), not the overlay ones.
- **Share link button** (`button[title="Copy share link"]`) is a third sibling on every collection card. Selector logic that iterates card children must not mistake it for fav or delete.
- **Favourites filter — bot vs site are independent** — the site now shows a simple `❤️ Favorites(N)` toggle instead of the old 3-state button. The bot's `#gcb-favs` button (`favsMode`: `off → only → hide`) is its own independent filter in the GachaBot panel and does not interact with the site's native filter — no mismatch issue.

## Testing on Live Site (Claude Workflow)

gacha.miz.to is fully auth-gated and Cloudflare-protected. Headless browsers (fresh profiles, curl, etc.) are blocked or see no feature DOM. To test selectors, feature behavior, or the live DOM from Claude:

### Two-Step Cookie Injection Workflow

1. **Extract cookies** from your default Firefox profile into a Playwright-compatible JSON:
   ```bash
   py ~/.claude/scripts/extract-session-cookie.py gacha.miz.to
   ```
   Reads directly from the default Firefox profile. Outputs a JSON array ready for `page.context().addCookies([...])`.
   (`py` launcher required on Windows — `python3` is blocked by an AppX stub)

2. **Inject** into the headless `playwright-firefox` session via `browser_run_code`:
   ```js
   // inside browser_run_code tool call
   const cookies = [/* paste extract-session-cookie.py output */];
   await page.context().addCookies(cookies);
   await page.reload();
   ```
   Then `browser_snapshot` / `browser_take_screenshot` to verify login state.

### Why Not CDP?

Firefox's `--remote-debugging-port=9222` exposes **Firefox Remote Debugging Protocol (RDP)**, not Chrome DevTools Protocol (CDP). `@playwright/mcp --cdp-endpoint` is CDP-only — it expects `/json/version` which returns 404 on Firefox. The CDP MCP entry **cannot connect to Firefox**; use cookie injection into headless `playwright-firefox` instead.

### Notes

- `extract-session-cookie.py` reads directly from your default Firefox profile — no sync step needed.
- Cookie injection works at the Playwright API level (not JS `document.cookie`) so HttpOnly cookies are injected correctly.
- Reading the default profile's `cookies.sqlite` in read-only mode (`?mode=ro`) is safe even while Firefox is open.

## When Writing Code

- No transpilation — write standard ES2020+ that browsers support natively
- No `import`/`export` — everything is in one IIFE or top-level scope
- Tampermonkey `@grant none` — no GM_ APIs used, standard DOM/fetch only
- Always bump `@version` when making changes intended for release
- Add a changelog entry for every user-facing change
- Test manually in browser — no automated test suite
