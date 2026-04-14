# iScoreBaseball.com - Statistics Table Examples

This document shows the actual structure and appearance of the statistics tables.

---

## 📊 BATTING - BASIC TABLE

**Columns (37 total):**
```
# | Name | G | SEQ | PA | AB | R | H | B | 1B | 2B | 3B | HR | XBH | TB | OB | RBI | AVG | BB | BBi | Kc | Ks | SO | HBP | SB | CS | PK | SCB | SF | SAC | LOBi | LOB | ROE | FC | CI | GDP | GTP
```

**Example Data Row:**
```
0 | Andris Millers | 9 | 65 | 23 | 19 | 8 | 8 | - | 5 | 3 | - | - | 3 | 11 | 12 | 9 | 0.421 | 4 | - | 2 | - | 2 | - | 21 | - | - | - | - | - | 6 | 3 | - | - | - | - | -
```

**Footer Rows:**
- **TOTALS** - Team cumulative statistics
- **OPPONENT** - Opponent cumulative statistics

---

## 📊 BATTING - ADVANCED TABLE

**Columns (23 total):**
```
# | Name | RC | BB/K | BB/PA | RPA | OBP | OBPE | SLG | OPS | GPA | BABIP | 1/RPA | CT% | CT2% | PA/RSP | AB/RSP | BB/RSP | HBP/RSP | SAC/RSP | CI/RSP | H/RSP | BA/RSP
```

**Example Data Row:**
```
0 | Andris Millers | 7.9 | 2.000 | 0.174 | 0.739 | 0.522 | 0.565 | 0.579 | 1.101 | 0.380 | 0.471 | 1.353 | 0.895 | 0.739 | 14 | 11 | 2 | - | - | - | 5 | 0.455
```

---

## 📊 BATTING - HIT TYPE AND POWER TABLE

**Columns (21 total):**
```
# | Name | GBs | GBm | GBh | LDs | LDm | LDh | PUs | PUm | PUh | FBs | FBm | FBh | GB% | LD% | PU% | FB% | SH% | MH% | HH%
```

**Legend:**
- **GB** = Ground Ball (s=soft, m=medium, h=hard)
- **LD** = Line Drive (s=soft, m=medium, h=hard)
- **PU** = Popup (s=soft, m=medium, h=hard)
- **FB** = Flyball (s=soft, m=medium, h=hard)
- **Percentages** show distribution of hit types and power

---

## 📊 BATTING - PLATE DISCIPLINE TABLE

**Columns (36 total):**
```
# | Name | Sc | Ss | F | Ball | Bi | BIP | TP | Ss% | Ot | Zt | Os | Zs | Oc | Zc | FP | FS | FB | FPSw | FPSw% | FPSs | FPF | FPBu | FP1B | FP2B | FP3B | FPHR | FPH | FPCI | FPFC | FPROE | FPSF | FPSCB | FPO | FPSS%
```

**Key Metrics:**
- **Strike tracking:** Sc (looking), Ss (swinging), F (fouls)
- **Zone tracking:** Ot (outside total), Zt (zone total), Os/Zs (swings), Oc/Zc (contact)
- **First pitch:** 18 different first-pitch outcome metrics

---

## 📊 BATTING - BATTING QUALITY TABLE

**Columns (21 total):**
```
# | Name | QAB1 | QAB1% | QAB2 | QAB2% | QAB3 | QAB3% | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 | P10 | P11 | P12 | P13+
```

**Quality at Bat Definitions:**
- **QAB1:** Base Hit OR Sac OR Hard contact OR 6+ pitches
- **QAB2:** Base Hit OR RBI OR Sac OR 6+ pitches
- **QAB3:** Hit w/RISP OR RBI OR Sac OR 6+ pitches

**Pitch Count Distribution:** P1 through P13+ shows plate appearance length

---

## ⚾ PITCHING - RECORD TABLE

**Columns (21 total):**
```
# | Name | G | SEQ | W | L | SV | HLD | SVOP | BS | SV% | ST | FIN | CMP | GSc | QS | TL | CW | ShO | GT | GScT
```

**Key Metrics:**
- **Record:** W-L, SV, BS
- **Roles:** ST (starts), FIN (finishes), CMP (complete games)
- **Quality:** GSc (game score), QS (quality starts), TL (tough losses), CW (cheap wins)

---

## ⚾ PITCHING - BASIC TABLE

**Columns (49 total):**
```
# | Name | IP | BF | Ball | Str | B/S | PIT | R | GI | RA | ER | ERA | ERA9 | FIP | O | K | Kc | Ks | H | BB | IBB | K/BB | K/GI | BB/GI | H/GI | HB | BK | WP | CI | SCB | SCF | BT | 1B | 2B | 3B | HR | WHIP | OBP | BAA | BABIP | GIT | IR | IRS | LOB | PK | PKF | Sc | Ss | F
```

**Key Metrics:**
- **Volume:** IP, BF, PIT (pitches)
- **Results:** ERA, WHIP, K/BB, BAA
- **Advanced:** FIP, BABIP
- **Relief:** IR (inherited runners), IRS (inherited runners scored)

---

## ⚾ PITCHING - EFFECTIVENESS TABLE

**Columns (42 total):**
```
# | Name | GO | AO | GO/AO | FPS | FPB | FPS% | LOBB | LOH | LOHB | LOCI | LOE | LOK | LOO | 123 | FsO | FsK | FsH | FsBB | 3P | 4P | 5P | 6P | 7P | 8P | 9P | 10P | 11P | 12P | 13P | 14P | 15P | 16P+ | 1PA | 2PA | 3PA | 4PA | 5PA | 6PA | 7PA | 8P+A
```

**Key Metrics:**
- **Batted ball:** GO/AO ratio
- **First pitch:** FPS% (first pitch strike percentage)
- **Leadoff:** LOBB, LOH, LOK, LOO (leadoff outcomes)
- **Efficiency:** 123 innings (3 up, 3 down)
- **Pitch counts:** Innings by pitch count (3P through 16P+)
- **Plate appearances:** By pitch count (1PA through 8P+A)

---

## ⚾ PITCHING - PITCH TYPES TABLE

**Columns (168 total!) - Most comprehensive table**

### Pitch Types Tracked (12 types):
1. **Fb** - Fastball
2. **Cu** - Curveball
3. **Sl** - Slider
4. **Ct** - Cutter
5. **Ch** - Changeup
6. **Sp** - Splitter
7. **Kn** - Knuckleball
8. **Dp** - Dropball
9. **Rs** - Riseball
10. **Sw** - Screwball
11. **Dc** - Dropcurve
12. **Or** - Other

### For Each Pitch Type (7 columns × 12 types = 84 columns):
- **[Type]** - Count
- **[Type]S** - Strikes
- **[Type]S%** - Strike percentage
- **[Type]Min** - Minimum speed
- **[Type]Max** - Maximum speed
- **[Type]Tot** - Total speed
- **[Type]Cnt** - Speed count
- **[Type]Avg** - Average speed

### Count-Specific Stats (12 counts × 6 columns = 72 columns):
For counts: 0-0, 0-1, 0-2, 1-0, 1-1, 1-2, 2-0, 2-1, 2-2, 3-0, 3-1, 3-2

Each count has:
- **T[count]** - Total pitches at count
- **S[count]** - Strikes at count
- **S%[count]** - Strike percentage
- **E[count]+** - Positive outcome (Out, K, etc.)
- **E[count]-** - Negative outcome (Hit, BB, HBP)
- **E[count]*** - Neutral outcome (SAC, SF, CI)

**Example:** T00, S00, S%00, E00+, E00-, E00* = 0-0 count statistics

---

## 🧤 FIELDING - BASIC TABLE

**Columns (29 total):**
```
# | Name | G | ST | Et | Ef | ERR | PO | A | SBA | CS | DP | TP | PB | PKF | PK | OP | FP | FP1 | FP2 | FP3 | FP4 | FP5 | FP6 | FP7 | FP8 | FP9 | FP10 | IP | AP
```

**Position Fielding Percentages:**
- FP1 = Pitcher
- FP2 = Catcher
- FP3 = First Base
- FP4 = Second Base
- FP5 = Third Base
- FP6 = Shortstop
- FP7 = Left Field
- FP8 = Center Field
- FP9 = Right Field
- FP10 = Other

---

## 🧤 FIELDING - INFIELD TABLE

**Columns (38 total):**
```
# | Name | PO1 | A1 | Et1 | Ef1 | AP1 | OP1 | PO2 | A2 | Et2 | Ef2 | AP2 | OP2 | PO3 | A3 | Et3 | Ef3 | AP3 | OP3 | PO4 | A4 | Et4 | Ef4 | AP4 | OP4 | PO5 | A5 | Et5 | Ef5 | AP5 | OP5 | PO6 | A6 | Et6 | Ef6 | AP6 | OP6
```

**Pattern:** For each infield position (1-6):
- PO[#] = Putouts
- A[#] = Assists
- Et[#] = Throwing errors
- Ef[#] = Fielding errors
- AP[#] = Innings appeared
- OP[#] = Outs played

---

## 🧤 FIELDING - OUTFIELD TABLE

**Columns (26 total):**
```
# | Name | PO7 | A7 | Et7 | Ef7 | AP7 | OP7 | PO8 | A8 | Et8 | Ef8 | AP8 | OP8 | PO9 | A9 | Et9 | Ef9 | AP9 | OP9 | PO10 | A10 | Et10 | Ef10 | AP10 | OP10
```

**Pattern:** For each outfield position (7-10):
- PO[#] = Putouts
- A[#] = Assists
- Et[#] = Throwing errors
- Ef[#] = Fielding errors
- AP[#] = Innings appeared
- OP[#] = Outs played

---

## 🎯 HIT LOCATIONS PAGE

**URL:** `hitlocations.php?t=platone&color=1`

**Format:** PDF document with visual diagrams

**Content:**
- Baseball diamond diagrams
- Individual player hit location charts
- Coordinate-based hit placement visualization
- Color-coded hit types

**File Size:** ~1.5MB (extensive graphical data)

---

## 📖 LEGEND PAGE

**URL:** `data.iscoresports.com/legend.php?s=baseball2`

**Structure:**
- Organized by category (Batting, Pitching, Fielding)
- Each stat has: Abbreviation | Dash | Full Description
- Color-coded sections with gray headers
- Multi-column layout for easy scanning

**Special Sections:**
1. **Batting - Basic** (37 definitions)
2. **Batting - Advanced** (23 definitions)
3. **Batting - Hit Type and Power** (21 definitions)
4. **Batting - Plate Discipline** (36 definitions)
5. **Batting - Batting Quality** (21 definitions)
6. **Pitching - Record** (21 definitions)
7. **Pitching - Basic** (49 definitions)
8. **Pitching - Effectiveness** (42 definitions)
9. **Pitching - Hit Type and Power** (22 definitions)
10. **Pitching - Pitch Types** (168 definitions)
11. **Fielding - Basic** (29 definitions)
12. **Fielding - Infield** (38 definitions)
13. **Fielding - Outfield** (26 definitions)

**Footnotes Section:**
- Quality at Bats (QAB) - Three calculation methods explained
- Game Score (GSc) - 7-step formula
- Quality Start (QS) - Definition (GSc > 50)
- Tough Loss (TL) - Loss with QS
- Cheap Wins (CW) - Win without QS
- Runs Created (RC) - Technical formula with Wikipedia link

---

## 🎨 TABLE STYLING

### Visual Design
- **Header row:** Dark background with white text
- **Data rows:** Alternating light/dark for readability
  - `contentlightrow` - Light background
  - `contentdarkrow` - Darker background
- **Footer rows:** 
  - TOTALS - Team statistics
  - OPPONENT - Opponent statistics
- **Borders:** 1px solid black borders
- **Alignment:** 
  - Numbers: center-aligned
  - Names: left-aligned
  - Headers: centered

### Interactive Features
- **Sortable columns** - Click header to sort
- **Clickable player names** - Links to individual player pages
- **Hover effects** - Visual feedback on menu items
- **Responsive tables** - Horizontal scroll for wide tables

---

## 📱 RESPONSIVE BEHAVIOR

### Desktop View
- Full width tables
- All columns visible
- Sidebar navigation always visible

### Mobile/Narrow View
- Horizontal scrolling enabled
- Table structure maintained
- Menu collapses or stacks

---

## 🔢 DATA FORMATTING

### Number Formats
- **Integers:** Games, counts (e.g., "9", "23", "65")
- **Decimals (3 places):** Averages, percentages (e.g., "0.421", "0.522")
- **Dash (-):** No data or not applicable
- **Percentages:** Some shown as decimals (0.421), others as percentages (43.5)

### Special Indicators
- **Bold text** in headers
- **Nowrap** on player names to prevent line breaks
- **Data-enhance='false'** attribute on cells (jQuery Mobile compatibility)

---

## 🔗 NAVIGATION FLOW

```
Homepage (platone)
    │
    ├─> Statistics (stats.php)
    │       │
    │       ├─> Filter by Category (dropdown)
    │       ├─> Filter by League/Season (dropdown)
    │       ├─> Hit Locations (hitlocations.php) → PDF
    │       ├─> Legend (legend.php) → Definitions
    │       └─> Player Name (player_stats.php) → Individual stats
    │
    ├─> Calendar
    ├─> Roster
    ├─> Games
    ├─> Photos
    └─> Sponsors
```

---

## 📊 TABLE COMPARISON

| Table Name | Columns | Key Focus | Complexity |
|------------|---------|-----------|------------|
| Batting - Basic | 37 | Traditional stats | ⭐⭐ |
| Batting - Advanced | 23 | Sabermetrics | ⭐⭐⭐ |
| Batting - Hit Type | 21 | Contact quality | ⭐⭐⭐ |
| Batting - Plate Discipline | 36 | Pitch tracking | ⭐⭐⭐⭐ |
| Batting - Quality | 21 | QAB & pitch counts | ⭐⭐⭐ |
| Pitching - Record | 21 | W-L-SV records | ⭐⭐ |
| Pitching - Basic | 49 | Traditional pitching | ⭐⭐⭐ |
| Pitching - Effectiveness | 42 | Efficiency metrics | ⭐⭐⭐⭐ |
| Pitching - Hit Type | 22 | Contact allowed | ⭐⭐⭐ |
| Pitching - Pitch Types | 168 | Pitch arsenal analysis | ⭐⭐⭐⭐⭐ |
| Fielding - Basic | 29 | Overall defense | ⭐⭐ |
| Fielding - Infield | 38 | Infield positions | ⭐⭐⭐ |
| Fielding - Outfield | 26 | Outfield positions | ⭐⭐⭐ |

---

## 🎯 MOST USEFUL STATS BY ROLE

### For Hitters
**Must-see:** AVG, OBP, SLG, OPS, HR, RBI, BB, SO
**Advanced:** BABIP, RC, wRC, QAB%, BA/RSP
**Discipline:** BB/K, CT%, Ss%, Zone contact rates
**Power:** HH%, XBH, TB, ISO

### For Pitchers
**Must-see:** W-L, ERA, WHIP, K, BB, IP, SV
**Advanced:** FIP, BAA, BABIP, K/BB, K/9
**Effectiveness:** FPS%, GO/AO, 123 innings, QS
**Arsenal:** Pitch type distribution, strike %, speed averages

### For Fielders
**Must-see:** FP%, PO, A, E, DP
**Position-specific:** FP1-FP10 by position
**Catcher-specific:** CS%, PB, SBA, PK
**Range:** OP (outs played), AP (innings appeared)

---

## 💡 UNIQUE FEATURES

### 1. Opponent Comparison
Every table includes:
- Team TOTALS row
- OPPONENT row for direct comparison

### 2. Multi-Level Filtering
- Category filter (which tables to show)
- League filter (which season/league)
- Column sorting (click to sort)

### 3. Comprehensive Linking
- Player names → Individual player pages
- Legend link → Full definitions
- Hit Locations → Visual diagrams

### 4. Professional-Grade Metrics
- MLB-level statistics
- Sabermetric analysis
- Pitch-by-pitch granularity
- Contact quality tracking

---

## 📈 DATA COMPLETENESS

### What's Tracked
✅ Every pitch (type, speed, location, count, outcome)  
✅ Every batted ball (type, power, location, result)  
✅ Every defensive play (position, type, outcome)  
✅ Every baserunning event (SB, CS, PK)  
✅ Every situational context (RISP, leadoff, inherited)  

### What's NOT Tracked
❌ Individual game logs (not visible in main stats view)  
❌ Historical trends over time  
❌ Head-to-head matchups  
❌ Weather/field conditions  
❌ Video/replay links  

---

## 🚀 POWER USER TIPS

1. **Use "ALL STATS" view** to see everything at once
2. **Filter by league** to isolate specific seasons
3. **Click player names** for detailed individual breakdowns
4. **Check OPPONENT row** for context on team performance
5. **Reference Legend** for unfamiliar abbreviations
6. **Download Hit Locations** for visual analysis
7. **Sort columns** to find leaders in specific categories

---

**Last Updated:** March 12, 2026  
**Website:** http://iscorebaseball.com/platone  
**Status:** Fully explored and documented
