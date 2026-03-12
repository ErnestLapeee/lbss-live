# Plan: Comprehensive Statistics System (iScore Parity + Season/All-Time Filtering)

**Goal:** Make LBSS statistics as comprehensive as iScore (http://iscorebaseball.com/platone), with **filter by season** and **all-time (all seasons combined)** for both **league/total statistics** and **individual player statistics**. Include hit locations, legend, and all stat categories.

**Reference:** `README_ISCORE_ANALYSIS.md`, `all_statistics_columns.csv`, `iscorebaseball_statistics_analysis.md`, `STATISTICS_TABLE_EXAMPLES.md`.

---

## 1. Scope Summary

| Area | iScore | LBSS today | Target |
|------|--------|------------|--------|
| **Season filter (league stats)** | League dropdown (2025, 2026, All) | Single season required | Season dropdown + **All time** |
| **Season filter (player stats)** | Per-player page can show season | All seasons as table, no filter | Season dropdown + **All time** |
| **Batting** | 5 sub-tables, 138 columns | 1 table, ~25 columns | 5 sub-tables, full column set |
| **Pitching** | 5 sub-tables, 302 columns | 1 table, ~25 columns | 5 sub-tables (pitch types optional later) |
| **Fielding** | 3 sub-tables, 93 columns | 1 table + by-position | 3 sub-tables, position breakdown |
| **Hit locations** | PDF diagram | Spray chart component | Keep/enhance spray chart + legend |
| **Legend** | Full 533+ definitions + formulas | None | New `/stats/legend` page |

---

## 2. Season and All-Time Filtering (Priority 1)

### 2.1 Backend: Support “All time” in stats API

**Current:** All stats endpoints require `seasonId`. No way to get aggregated stats across all seasons.

**Changes:**

- **`GET /api/public/stats/batting`**  
  - **Query:** `seasonId` (optional).  
  - If `seasonId` present: filter `player_season_batting.season_id = seasonId` (current behavior).  
  - If `seasonId` absent or `seasonId=all` (or reserved value): aggregate from `player_season_batting` grouped by `player_id` (and team: e.g. latest team or sum across teams). Return same shape as single-season (totals + recompute AVG, OBP, SLG, OPS, BABIP from totals).

- **`GET /api/public/stats/pitching`**  
  - Same pattern: optional `seasonId`; when “all time”, aggregate `player_season_pitching` by player (and optionally team), recompute ERA, WHIP, FIP, K9, BB9, H9 from totals.

- **`GET /api/public/stats/fielding`**  
  - Optional `seasonId`; when “all time”, aggregate `player_season_fielding` by player (and optionally team), recompute FP%.

- **`GET /api/public/stats/fielding-by-position`**  
  - Optional `seasonId`; when “all time”, aggregate from `player_game_fielding` over all games (no league/season filter).

- **`GET /api/public/stats/leaders`** and **`GET /api/public/stats/pitching-leaders`**  
  - Accept same `seasonId` (optional). For “all time”, use aggregated totals and compute leaders from them (min PA/IP qualifiers optional).

- **`GET /api/public/stats/seasons`**  
  - Unchanged. Frontend will add an “All time” option in the dropdown (no new API).

**Aggregation rules for “all time”:**

- **Batting:** Sum counting stats (PA, AB, H, 2B, 3B, HR, RBI, R, BB, SO, HBP, SB, CS, etc.). Recompute AVG, OBP, SLG, OPS, BABIP from summed AB, PA, H, etc.  
- **Pitching:** Sum IP, H, R, ER, BB, K, etc.; recompute ERA, WHIP, FIP, K9, BB9, H9.  
- **Fielding:** Sum PO, A, E, etc.; recompute FP%.  
- **Team:** For “all time” we can either (a) show one row per player with “All” or latest team, or (b) one row per player-team-season and then collapse by player in UI. Recommendation: (a) one row per player, team = “All” or most recent team for display.

### 2.2 Backend: Player endpoints – season and all-time

**Current:**  
- `GET /:slug/stats` (batting), `/:slug/pitching-stats`, `/:slug/fielding-stats` return **all seasons** for that player (no filter).  
- `/:slug/game-log` and `/:slug/spray-chart` already support optional `seasonId`.

**Changes:**

- **`GET /api/public/players/:slug/stats`**  
  - **Query:** `seasonId` (optional).  
  - If `seasonId` provided: return only that season’s row (single object or array of one).  
  - If `seasonId` absent or `seasonId=all`: return **one “all-time” row** (aggregate of all `player_season_batting` for this player, with computed AVG, OBP, SLG, OPS, BABIP).

- **`GET /api/public/players/:slug/pitching-stats`**  
  - Same: optional `seasonId`; if “all time”, one aggregated row.

- **`GET /api/public/players/:slug/fielding-stats`**  
  - Same: optional `seasonId`; if “all time”, one aggregated row.

- **`GET /api/public/players/:slug/fielding-by-position`**  
  - Optional `seasonId`; when “all time”, aggregate over all games.

- **Game log and spray chart**  
  - Already support `seasonId`; ensure “no seasonId” means all time (current behavior is acceptable).

### 2.3 Frontend: League stats page (`/stats`)

- **Season selector:**  
  - Options: `[ { value: 'all', label: 'All time' }, ...seasons ]`.  
  - When “All time” is selected, call batting/pitching/fielding/leaders **without** `seasonId` (or with `seasonId=all` if you reserve that in API).  
  - When a specific season is selected, pass `seasonId` as now.

- **URL / state:**  
  - Optional: persist selection in query, e.g. `?season=2026` or `?season=all`, so links and refresh keep the filter.

### 2.4 Frontend: Player profile (`/players/[slug]`)

- **Season selector** above the stats tables (batting/pitching/fielding):  
  - Options: “All time” plus list of seasons in which the player has data.  
  - When “All time” is selected: request player stats (batting, pitching, fielding) without `seasonId` and show single aggregated row (or “career” line).  
  - When a season is selected: request with that `seasonId`; show only that season’s row(s) (e.g. one row if one team).  
  - Game log and spray chart: use same season filter (already supported via `seasonId`).

- **Display:**  
  - If “All time”: show one “Career” or “All time” row.  
  - If one season: show that season’s row with season name.  
  - Optional: keep a small “Season-by-season” table when “All time” is selected, so users can still see per-season breakdown.

---

## 3. Statistics Categories and Columns (Priority 2 – Schema + API + UI)

Match iScore’s **category dropdown** and **sub-tables**. Implement in phases: first extend schema and basic aggregation, then add API responses, then UI sub-tables.

### 3.1 Batting – Five sub-tables

| Sub-table | iScore columns | LBSS schema today | Action |
|----------|----------------|-------------------|--------|
| **Basic** | G, PA, AB, R, H, B, 1B, 2B, 3B, HR, XBH, TB, OB, RBI, AVG, BB, BBi, Kc, Ks, SO, HBP, SB, CS, PK, SCB, SF, SAC, LOBi, LOB, ROE, FC, CI, GDP, GTP | Most in `player_season_batting` / game | Add missing: bunt_singles (B), K looking/swinging split (Kc, Ks), PK, LOBi, LOB, ROE, FC, CI, GDP, GTP. XBH/TB/OB computed. |
| **Advanced** | RC, BB/K, BB/PA, RPA, OBP, OBPE, SLG, OPS, GPA, BABIP, 1/RPA, CT%, CT2%, PA/RSP, AB/RSP, …, BA/RSP | OBP, SLG, OPS, BABIP in DB | Add RC, GPA, OBPE; add RISP stats (PA/RSP, AB/RSP, H/RSP, BA/RSP, etc.) from events or new columns. |
| **Hit type & power** | GBs, GBm, GBh, LDs, LDm, LDh, PUs, PUm, PUh, FBs, FBm, FBh, GB%, LD%, … | `game_events`: hit_type, hit_hardness | Add season (and all-time) aggregates: count by (hit_type × hit_hardness), store in new table or compute on read from events. |
| **Plate discipline** | Sc, Ss, F, Ball, BIP, TP, zone/outside, first-pitch stats | Not stored | Requires pitch-level or at-bat-level data. Option A: extend game_events (e.g. pitch sequence, strike/ball flags). Option B: defer to later phase. |
| **Batting quality** | QAB1/2/3, QAB%., P1–P13+ | Not stored | Requires pitch count per PA. Option A: derive from events (pitch_count). Option B: add to finalize-game and store in player_season or new table. |

**Schema additions (batting):**

- **`player_season_batting`** (and game-level if needed):  
  - `bunt_singles`, `strikeouts_looking`, `strikeouts_swinging`, `picked_off`, `left_on_base_individual`, `left_on_base_team`, `reached_on_error`, `fielders_choice`, `catcher_interference`, `grounded_into_double_play`, `grounded_into_triple_play`.  
  - Optional: RISP columns (e.g. `pa_risp`, `ab_risp`, `h_risp`) and/or computed in API from events.
- **New table `player_season_batting_contact`** (or JSON column):  
  - Counts for GBs, GBm, GBh, LDs, LDm, LDh, PUs, PUm, PUh, FBs, FBm, FBh (from `game_events.hit_type`, `hit_hardness`).  
  - Percentages (GB%, LD%, etc.) computed on read.
- **Computed only (no new columns):** XBH, TB, OB, RC, GPA, BB/K, RPA, CT%, etc. in API layer.

**API:**  
- New endpoints or same endpoint with `?category=basic|advanced|hit_type|plate_discipline|quality`.  
- For “all time”, aggregate the same way as in §2.1 (sum by player, recompute rates).

### 3.2 Pitching – Five sub-tables

| Sub-table | iScore columns | LBSS schema today | Action |
|-----------|----------------|-------------------|--------|
| **Record** | W, L, SV, HLD, SVOP, BS, SV%, ST, FIN, CMP, GSc, QS, TL, CW, ShO, GT, GScT | W, L, SV, GS in `player_season_pitching` | Add: HLD, SVOP, BS, CMP, GSc, QS, TL, CW, ShO; compute SV%, GScT. |
| **Basic** | IP, BF, Ball, Str, PIT, R, ER, ERA, FIP, K, Kc, Ks, H, BB, IBB, WHIP, OBP, BAA, BABIP, IR, IRS, LOB, PK, … | Most in DB | Add: holds, save_opportunities, blown_saves, complete_games, game_score, quality_starts, shutouts, inherited_runners, inherited_runners_scored; Kc/Ks if available. |
| **Effectiveness** | GO, AO, GO/AO, FPS%, leadoff stats, 123, pitch-per-inning buckets, PA pitch count | Partly in game (groundOuts, flyOuts) | Add GO/AO; leadoff and 123 from events if possible; pitch buckets optional. |
| **Hit type & power** | GBs–FBh, BIP, GB%, … (allowed) | — | Same as batting: from events (pitcher_id + hit_type/hardness). New table or aggregate on read. |
| **Pitch types** | 12 types × (count, strikes, %, speed min/max/avg), count-specific (0-0 … 3-2) | Not in DB | Large extension (pitch_type, speed per event). Defer to Phase 3 or later. |

**Schema additions (pitching):**

- **`player_season_pitching`:**  
  - `holds`, `save_opportunities`, `blown_saves`, `complete_games`, `game_score`, `quality_starts`, `shutouts`, `inherited_runners`, `inherited_runners_scored`, `strikeouts_looking`, `strikeouts_swinging`.  
  - Optional: `ground_outs`, `air_outs` (if not already) for GO/AO.
- **New table `player_season_pitching_contact`** (or JSON): soft/medium/hard and GB/LD/PU/FB allowed (from events).
- **Pitch types:** New table or columns only if you add pitch-level tracking (Phase 3).

**API:**  
- Same pattern: optional `seasonId` for all-time; optional `category=record|basic|effectiveness|hit_type|pitch_types`.

### 3.3 Fielding – Three sub-tables

| Sub-table | iScore | LBSS today | Action |
|-----------|--------|------------|--------|
| **Basic** | G, PO, A, E, FP%, SBA, CS, DP, TP, PB, etc. | In `player_season_fielding` | Add SBA (stolen base attempts = CS + SB allowed), ensure TP. |
| **Infield** | Per position (P, C, 1B, 2B, 3B, SS) | `fielding-by-position` from game fielding | Expose as “Infield” view: filter position in [1..6], same columns. |
| **Outfield** | LF, CF, RF, Other | Same | “Outfield” view: position in [7,8,9] (+ Other if needed). |

**API:**  
- `GET /fielding?seasonId=&category=basic|infield|outfield` (infield/outfield = filter by position set).  
- All-time: aggregate by player (and optionally position) across all seasons.

### 3.4 Finalize-game and stat computation

- **finalize-game.ts:**  
  - When finalizing a game, compute and write all new batting/pitching/fielding counters (e.g. Kc/Ks, LOBi, ROE, FC, GDP, HLD, BS, QS, GSc, IR, IRS, contact type counts from `game_events`).  
  - For “all time” we do not materialize a separate table; we aggregate from `player_season_*` on read.

- **Backfill:**  
  - You do **not** need to delete or re-add games. Run the one-time backfill to recompute stats from existing events: `pnpm --filter @lbss/api backfill-game-stats` (from repo root; needs `DATABASE_URL` in `.env`). This uses `finalizeGame(id, undefined, { recompute: true })` for every finalized game so new columns (e.g. Phase 2) get populated from `game_events`. If the stats table is empty but leaders show data, try refreshing the page; if it persists, run the backfill.

---

## 4. Hit Locations and Legend (Priority 2)

### 4.1 Hit locations

- **Current:** `SprayChart` component and `GET /api/public/players/:slug/spray-chart?seasonId=` (optional).  
- **Enhancements:**  
  - Use same season/all-time filter as player stats (already supported via `seasonId`).  
  - Optional: team-level “hit locations” page (e.g. `/stats/hit-locations?seasonId=`) that aggregates all team batters’ hit locations for the selected season or all time (new API that returns aggregated coordinates + counts by hit type/hardness).  
  - Keep legend on the page (e.g. green = hit, blue = error, red = out; shape = hit type; size = hardness) as in current component.

### 4.2 Legend page

- **New route:** `/stats/legend` (or `/stats/legend/page`).  
- **Content:**  
  - One section per category (Batting Basic, Batting Advanced, …, Pitching Record, …, Fielding).  
  - For each stat abbreviation: **Abbrev** – **Full name** – **Description / formula** (e.g. AVG = H/AB, OBP = (H+BB+HBP)/(AB+BB+HBP+SF), FIP, GSc, QAB1–3, etc.).  
  - Data source: copy from `all_statistics_columns.csv` and `iscorebaseball_statistics_analysis.md`; optionally store in a JSON/MD file in repo for easy edits.  
- **Link:** Add “Legend” link in the stats page header (and optionally in footer) next to “Hit locations” (if you add a team hit-locations view).

---

## 5. UI Structure (Stats Page and Player Profile)

### 5.1 League stats page (`/stats`)

- **Header:**  
  - **Season:** Dropdown “All time” | “2026” | “2025” | … (from `GET /seasons`).  
  - **Category:** Dropdown “Batting – Basic” | “Batting – Advanced” | … | “Pitching – Record” | … | “Fielding – Basic” | “Infield” | “Outfield”.  
  - **Links:** “Legend”, “Hit locations” (if you add team hit locations).  
- **Content:**  
  - One table per selected category (same as iScore). Columns = that category’s columns; sortable.  
  - Optional: “All stats” view that shows Basic tables for Batting, Pitching, Fielding on one page (or tabs).  
- **Footer rows:** Optional “TOTALS” and “OPPONENT” (if you store opponent stats); otherwise omit.

### 5.2 Player profile (`/players/[slug]`)

- **Season selector:** “All time” | “2026” | “2025” | … (only seasons where player has data).  
- **Tabs:** Batting | Pitching | Fielding | Game log (existing).  
- **Per tab:**  
  - When “All time”: one aggregated row (and optional “Season by season” table below).  
  - When one season: one row (or multiple if multiple teams in same season).  
- **Sub-tables:** If you add Batting Advanced / Hit type / etc., show as sub-tabs or expandable sections (e.g. “Basic” | “Advanced” | “Hit type” under Batting).  
- **Hit locations:** Spray chart with same season/all-time filter; legend in sidebar or below chart.

---

## 6. Implementation Phases

### Phase 1 – Season and all-time filter (no new columns)

1. **API**  
   - Stats routes: make `seasonId` optional; when missing or `all`, aggregate from `player_season_*` by player, recompute rates; return same response shape.  
   - Player routes: add optional `seasonId` to `/:slug/stats`, `/:slug/pitching-stats`, `/:slug/fielding-stats`, `/:slug/fielding-by-position`; when “all time”, return one aggregated row per category.  
2. **Web**  
   - Stats page: add “All time” to season dropdown; when selected, call API without `seasonId`.  
   - Player profile: add season dropdown; when “All time”, call player stats without `seasonId` and show one row; when a season is selected, pass `seasonId` and show that season’s row(s).  
3. **Tests**  
   - Unit tests for aggregation (sums and recomputed AVG, OBP, SLG, OPS, ERA, WHIP, FP%).

### Phase 2 – Batting/Pitching/Fielding Basic + Advanced (schema + finalize + API + UI)

1. **Schema**  
   - Add columns to `player_season_batting` and `player_game_batting` (B, Kc, Ks, PK, LOBi, LOB, ROE, FC, CI, GDP, GTP).  
   - Add columns to `player_season_pitching` (HLD, SVOP, BS, CMP, GSc, QS, ShO, IR, IRS, Kc, Ks, etc.).  
   - Add SBA/TP to fielding if missing.  
2. **Finalize-game**  
   - Compute and persist all new counters from events.  
3. **API**  
   - Extend responses to include new fields; keep “all time” aggregation including these.  
4. **UI**  
   - Add new columns to Basic tables; add “Batting – Advanced” (and similar) with OBP, SLG, OPS, BABIP, RC, GPA, RISP stats).  
5. **Legend**  
   - Add `/stats/legend` page and link from stats header.

### Phase 3 – Hit type & power, contact tables

1. **Schema**  
   - Add `player_season_batting_contact` and `player_season_pitching_contact` (or equivalent) with counts per (hit_type, hit_hardness).  
2. **Finalize-game**  
   - From `game_events` (hit_type, hit_hardness), aggregate per player per game/season.  
3. **API**  
   - New category “Hit type & power” for batting and pitching; support season and all-time.  
4. **UI**  
   - Add “Batting – Hit type & power” and “Pitching – Hit type & power” tables; link from legend.

### Phase 4 – Plate discipline, batting quality (optional)

- Depends on having pitch-level or at-bat pitch-count data.  
- If you add pitch_count (or pitch sequence) to events and persist per-PA, you can compute P1–P13+, first-pitch stats, and eventually QAB.  
- Schema: optional columns or new table; API and UI as additional categories.

### Phase 5 – Pitching effectiveness, pitch types (optional)

- Effectiveness: GO/AO, leadoff, 123, pitch-per-inning from events if available.  
- Pitch types: require storing pitch type (and optionally speed) per pitch; large schema and finalize-game change; can be deferred.

---

## 7. File and Endpoint Checklist

### Backend (packages/api)

- [x] **stats.ts** – `seasonId` optional; all-time aggregation for batting, pitching, fielding, leaders, fielding-by-position.  
- [x] **players.ts** – `seasonId` optional for `/:slug/stats`, `pitching-stats`, `fielding-stats`, `fielding-by-position`; return one all-time row when no season.  
- [x] **Schema** – New columns (Phase 2). Contact stats computed on read from game_events (Phase 3).  
- [x] **finalize-game.ts** – Compute new stats (Phase 2).  
- [x] **Migrations** – Phase 2 columns added (0004).  
- [x] **Batting/Pitching contact** – GET `/batting-contact`, `/pitching-contact` (from game_events hit_type × hit_hardness).  
- [x] **Team hit locations** – GET `/team-hit-locations?seasonId=&teamId=` for team spray chart.

### Frontend (apps/web)

- [x] **Stats page** – Season dropdown with “All time”; Legend + Team hit locations links; extended Basic columns. Category dropdown: Batting (Basic / Advanced / Hit type & power), Pitching (Basic / Hit type & power), Fielding (All / Infield / Outfield). URL `?season=all` or `?season=123` persisted.  
- [x] **Player profile** – Stats (batting, pitching, fielding) always show **career (all-time)** without filter; season dropdown applies only to **Game Log** and **Spray Chart**.  
- [x] **Legend page** – New route and content; link from stats header.  
- [x] **Spray chart** – Respects season filter on player profile (game log & spray chart only).  
- [x] **Box scores** – Game detail box score and pitching tabs show extended stats (PA, 2B, 3B, HBP, SF, SAC, SB, CS, Kc, Ks, B, GDP, FC, CI; GSc, Kc, Ks, BF, WP, etc.); AVG/OPS/ERA/WHIP computed for **this game only**.

### Shared

- [ ] **Types** – Extend batting/pitching/fielding types with new fields.  
- [ ] **Stat calculator** – Add formulas for RC, GPA, GSc, QAB (when data exists).

---

## 8. Success Criteria

- Users can select **season** or **All time** on the main **Statistics** page and see league-wide batting, pitching, and fielding tables (and leaders) for that scope.  
- Users can select **season** or **All time** on **Player profile** and see that player’s batting, pitching, fielding, game log, and spray chart for that scope.  
- Statistics layout and categories match iScore’s structure (Basic, Advanced, Hit type, etc.) as phases are implemented.  
- A **Legend** page documents all displayed stat abbreviations and formulas.  
- **Hit locations** (spray chart) respect the same season/all-time filter on the player profile. **Team hit locations** page at `/stats/hit-locations` with season + team selector.

---

## 9. References

- `README_ISCORE_ANALYSIS.md` – Index of iScore analysis.  
- `EXECUTIVE_SUMMARY.md` – Season filter, 533+ columns, hit locations, legend.  
- `all_statistics_columns.csv` – Full column list (Category, Subcategory, Column, Full Name, Description).  
- `iscorebaseball_statistics_analysis.md` – Detailed stat definitions and categories.  
- `STATISTICS_TABLE_EXAMPLES.md` – Table layouts and column lists.  
- Current implementation: `packages/api/src/routes/public/stats.ts`, `packages/api/src/routes/public/players.ts`, `apps/web/src/app/stats/`, `apps/web/src/app/players/[slug]/`, `packages/api/src/db/schema/stats.ts`, `packages/api/src/services/finalize-game.ts`.
