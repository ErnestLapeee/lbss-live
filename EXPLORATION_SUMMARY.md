# iScoreBaseball.com Website Exploration Summary

**Date:** March 12, 2026  
**Website:** http://iscorebaseball.com/platone  
**Team:** Platones Beisbola Klubs

---

## 🎯 QUICK ANSWERS TO YOUR QUESTIONS

### 1. ✅ Season Sorting/Filtering
**YES** - League dropdown filter available with options:
- **(All)** - Combined view
- **LATVIJAS BEISBOLA LIGA 2025**
- **LATVIJAS BEISBOLA LIGA 2026**

### 2. ✅ Complete Statistics Fields
**533 total unique data columns** tracked across 14 different stat tables:
- **Batting:** 138 columns (5 subcategories)
- **Pitching:** 302 columns (5 subcategories)
- **Fielding:** 93 columns (3 subcategories)

### 3. ✅ Hit Location Diagrams
**YES** - Dedicated "Hit Locations" link generates PDF reports with visual baseball diamond diagrams showing where balls were hit.

### 4. ✅ Legend Section
**YES** - Comprehensive legend page at `data.iscoresports.com/legend.php?s=baseball2` with:
- All abbreviation definitions
- Formula explanations (GSc, RC, FIP, QAB)
- Footnotes with detailed methodology

---

## 📊 STATISTICS ORGANIZATION

### Category Filter Dropdown
Users can filter which statistics tables to display:

1. **\* ALL STATS \*** - Shows everything at once
2. **Batting - Basic** - Traditional batting stats (37 columns)
3. **Batting - Advanced** - Sabermetric batting stats (23 columns)
4. **Batting - Hit Type and Power** - Contact quality analysis (21 columns)
5. **Batting - Plate Discipline** - Pitch tracking & discipline (36 columns)
6. **Batting - Batting Quality** - Quality at-bats & pitch counts (21 columns)
7. **Pitching - Record** - Win/loss/save records (21 columns)
8. **Pitching - Basic** - Traditional pitching stats (49 columns)
9. **Pitching - Effectiveness** - Efficiency metrics (42 columns)
10. **Pitching - Hit Type and Power** - Contact allowed analysis (22 columns)
11. **Pitching - Pitch Types** - Detailed pitch type tracking (168 columns!)
12. **Fielding - Basic** - Overall fielding stats (29 columns)
13. **Fielding - Infield** - Position-specific infield stats (38 columns)
14. **Fielding - Outfield** - Position-specific outfield stats (26 columns)

---

## 🔍 NOTABLE ADVANCED FEATURES

### Pitch-by-Pitch Tracking
- **12 pitch types tracked:** Fastball, Curve, Slider, Cutter, Change, Splitter, Knuckle, Dropball, Riseball, Screwball, Dropcurve, Other
- **Speed tracking:** Min, Max, Average for each pitch type
- **Count-specific outcomes:** Stats for every count from 0-0 through 3-2
- **Pitch result tracking:** Strike %, positive/negative/neutral outcomes

### Contact Quality Analysis
- **Hit power classification:** Soft, Medium, Hard
- **Hit type classification:** Ground Ball, Line Drive, Popup, Flyball
- **Percentage breakdowns:** GB%, LD%, PU%, FB%, SH%, MH%, HH%

### Situational Statistics
- **Runners in Scoring Position (RISP):** PA/RSP, AB/RSP, H/RSP, BA/RSP, etc.
- **Leadoff situations:** LOBB, LOH, LOHB, LOK, LOO, etc.
- **First pitch outcomes:** 18 different first-pitch metrics
- **Inherited runners:** IR, IRS tracking for relief pitchers

### Quality Metrics
- **Quality at Bats (QAB):** Three different calculation methods
- **Game Score (GSc):** Pitcher performance scoring system
- **Quality Starts (QS):** Games with GSc > 50
- **Tough Losses (TL):** Quality start but lost
- **Cheap Wins (CW):** Won without quality start
- **Runs Created (RC):** Advanced offensive metric
- **FIP:** Fielding Independent Pitching

### Position-Specific Fielding
**10 positions tracked individually:**
1. Pitcher
2. Catcher
3. First Base
4. Second Base
5. Third Base
6. Shortstop
7. Left Field
8. Center Field
9. Right Field
10. Other

Each position tracks: PO, A, Et, Ef, AP, OP, and FP%

---

## 🎨 WEBSITE LAYOUT

### Homepage (`/platone`)
```
┌─────────────────────────────────────────┐
│  [LOGO/HEADER IMAGE]                    │
├──────────┬──────────────────────────────┤
│  MENU    │                              │
│  -----   │                              │
│  Home    │                              │
│  Calendar│     MAIN CONTENT AREA        │
│  Roster  │     (iframe-based)           │
│ >Stats   │                              │
│  Games   │                              │
│  Photos  │                              │
│  Sponsors│                              │
│  Settings│                              │
│  Login   │                              │
│  Logoff  │                              │
└──────────┴──────────────────────────────┘
```

### Statistics Page (`/stats.php?t=platone`)
```
┌────────────────────────────────────────────────────────┐
│ STATS - Platones Beisbola Klubs                       │
├────────────────────────────────────────────────────────┤
│ [Category Filter ▼] [Legend] [Hit Locations] [League▼]│
├────────────────────────────────────────────────────────┤
│                                                        │
│  TABLE 1: Batting - Basic                             │
│  ┌──────────────────────────────────────────────┐    │
│  │ # │Name│G│SEQ│PA│AB│R│H│1B│2B│3B│HR│...│    │    │
│  ├──────────────────────────────────────────────┤    │
│  │ Player rows...                                │    │
│  ├──────────────────────────────────────────────┤    │
│  │ TOTALS row                                    │    │
│  │ OPPONENT row                                  │    │
│  └──────────────────────────────────────────────┘    │
│                                                        │
│  TABLE 2: Batting - Advanced                          │
│  (Similar structure...)                               │
│                                                        │
│  [Additional tables based on filter selection...]     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 📁 FILES CAPTURED

The following HTML files were downloaded for analysis:

1. **platone_homepage.html** - Main homepage structure
2. **platone_stats.html** - Full statistics page (300KB+)
3. **platone_hitlocations.html** - Hit locations PDF data (1.5MB+)
4. **platone_legend.html** - Complete legend with all definitions
5. **platone_player_stats.html** - Individual player statistics page

---

## 🔗 KEY URLS

- **Homepage:** `http://iscorebaseball.com/platone`
- **Statistics:** `http://iscorebaseball.com/stats.php?t=platone`
- **Hit Locations:** `http://iscorebaseball.com/hitlocations.php?t=platone&color=1`
- **Legend:** `http://data.iscoresports.com/legend.php?s=baseball2`
- **Player Stats:** `http://iscorebaseball.com/player_stats.php?t=platone&p=[PLAYER_ID]`
- **Filter by League:** `http://iscorebaseball.com/stats.php?t=platone&l=[LEAGUE_ID]`

---

## 💡 KEY INSIGHTS

### Data Richness
This is an **extremely comprehensive** baseball statistics platform with:
- Professional-level stat tracking (comparable to MLB systems)
- Advanced sabermetrics (OPS, BABIP, FIP, wOBA-style metrics)
- Pitch-by-pitch granularity
- Contact quality analysis
- Situational awareness (RISP, leadoff, inherited runners)

### User Experience
- **Filterable:** Category and league/season filters
- **Sortable:** JavaScript-based table sorting
- **Linked:** Player names link to detailed individual pages
- **Documented:** Comprehensive legend with formulas
- **Visual:** Hit location diagrams in PDF format
- **Comparative:** Team totals vs. opponent totals

### Technical Implementation
- PHP-based web application
- Iframe content loading system
- Client-side table sorting
- PDF generation for reports
- Responsive table design
- Google Analytics tracking

---

## 📋 DELIVERABLES CREATED

1. **iscorebaseball_statistics_analysis.md** - Detailed analysis report with all findings
2. **all_statistics_columns.csv** - Complete CSV list of all 533+ statistics columns
3. **EXPLORATION_SUMMARY.md** - This summary document
4. **Raw HTML files** - All downloaded pages for reference

---

## ✨ STANDOUT FEATURES

1. **Pitch Type Mastery:** Tracks 12 different pitch types with speed data
2. **Count Analysis:** Full breakdown of outcomes at every count (0-0 through 3-2)
3. **Contact Quality:** Soft/Medium/Hard classification for all batted balls
4. **Position Flexibility:** Individual stats for all 10 defensive positions
5. **Clutch Metrics:** Comprehensive RISP (Runners in Scoring Position) tracking
6. **Quality Metrics:** QAB, GSc, QS with customizable definitions
7. **Visual Reports:** Hit location PDF diagrams
8. **Season Filtering:** Multi-year league filtering capability

---

**Analysis Complete**  
All requested information has been documented and organized for easy reference.
