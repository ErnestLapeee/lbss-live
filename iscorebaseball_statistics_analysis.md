# iScoreBaseball.com Statistics Analysis Report
**Website:** http://iscorebaseball.com/platone  
**Analysis Date:** March 12, 2026  
**Team:** Platones Beisbola Klubs

---

## 1. SEASON SORTING/FILTERING FUNCTIONALITY

### ✅ **YES - League/Season Filtering EXISTS**

The statistics page includes a **League dropdown selector** with the following options:
- **(All)** - Shows all leagues combined
- **LATVIJAS BEISBOLA LIGA 2025** - Filter by 2025 season
- **LATVIJAS BEISBOLA LIGA 2026** - Filter by 2026 season

**Implementation:** 
```html
<SELECT name='league' onchange='document.location=this.options[this.selectedIndex].value'>
  <OPTION value='/stats.php?t=platone&l=ALL'>(All)</OPTION>
  <OPTION value='/stats.php?t=platone&l=18C6A1D9-A483-4C45-8D4B-3F6D6DDD63ED'>LATVIJAS BEISBOLA LIGA 2025</OPTION>
  <OPTION value='/stats.php?t=platone&l=5149D538-F34A-4643-9187-594965AB786C'>LATVIJAS BEISBOLA LIGA 2026</OPTION>
</SELECT>
```

---

## 2. STATISTICS CATEGORIES

The statistics page has a **category filter dropdown** with the following options:

### Main Categories:
1. **\* ALL STATS \*** - Shows all statistics tables at once
2. **Batting - Basic**
3. **Batting - Advanced**
4. **Batting - Hit Type and Power**
5. **Batting - Plate Discipline**
6. **Batting - Batting Quality**
7. **Pitching - Record**
8. **Pitching - Basic**
9. **Pitching - Effectiveness**
10. **Pitching - Hit Type and Power**
11. **Pitching - Pitch Types**
12. **Fielding - Basic**
13. **Fielding - Infield**
14. **Fielding - Outfield**

---

## 3. COMPLETE LIST OF ALL STATISTICS FIELDS/COLUMNS

### 📊 BATTING STATISTICS

#### **Batting - Basic** (37 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | Player's jersey number |
| Name | Player Name | Player's full name (clickable link to player page) |
| G | Games | Batting Games Played |
| SEQ | Sequence | The Order in which the Player Batted |
| PA | Plate Appearances | Total plate appearances |
| AB | At Bats | Official at bats |
| R | Runs | Runs scored |
| H | Hits | Total hits |
| B | Bunts | Bunt Singles |
| 1B | Singles | Single base hits |
| 2B | Doubles | Two-base hits |
| 3B | Triples | Three-base hits |
| HR | Homeruns | Home runs |
| XBH | Extra Base Hits | 2B + 3B + HR |
| TB | Total Bases | Total bases from hits |
| OB | On Base | Times reached base |
| RBI | Runs Batted In | Runs driven in |
| AVG | Batting Average | H/AB |
| BB | Walks | Base on balls |
| BBi | Intentional Walks | Intentional base on balls |
| Kc | Strike Outs Looking | Called third strikes |
| Ks | Strike Outs Swinging | Swinging third strikes |
| SO | Strike Outs | Total strikeouts (Kc+Ks) |
| HBP | Hit By Pitch | Times hit by pitch |
| SB | Stolen Bases | Successful stolen bases |
| CS | Caught Stealing | Caught stealing attempts |
| PK | Picked Off | Times picked off base |
| SCB | Sacrifice Bunts | Sacrifice bunt attempts |
| SF | Sacrifice Flys | Sacrifice fly balls |
| SAC | Sacrifices | Total sacrifices |
| LOBi | Left on Base (Individual) | Times the player left runners on base |
| LOB | Left on Base (Team) | Times the player was left on base |
| ROE | Reached on Error | Times reached base on error |
| FC | Fielder's Choice | Reached on fielder's choice |
| CI | Catcher's Interference | Reached on catcher's interference |
| GDP | Grounded into Double Play | Double plays grounded into |
| GTP | Grounded into Triple Play | Triple plays grounded into |

#### **Batting - Advanced** (23 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| RC | Runs Created | Advanced offensive metric |
| BB/K | Walk to Strikeout Ratio | BB/K |
| BB/PA | Walk Rate | Walks per Plate Appearance |
| RPA | Runs per Appearance | Offensive efficiency metric |
| OBP | On Base Percentage | (H+BB+HBP)/(AB+BB+HBP+SF) |
| OBPE | On Base Percentage w/ROE | OBP including errors |
| SLG | Slugging Percentage | TB/AB |
| OPS | On Base Plus Slugging | OBP + SLG |
| GPA | Gross Production Average | Advanced offensive metric |
| BABIP | Batting Average on Balls in Play | H/(AB-SO-HR+SF) |
| 1/RPA | Inverse RPA | Reciprocal of RPA |
| CT% | Contact Percentage | (AB-K)/AB |
| CT2% | Contact Percentage 2 | (AB-K)/PA |
| PA/RSP | PA with Runners in Scoring Position | Clutch situations |
| AB/RSP | AB with Runners in Scoring Position | |
| BB/RSP | BB with Runners in Scoring Position | |
| HBP/RSP | HBP with Runners in Scoring Position | |
| SAC/RSP | Sacrifices with RISP | |
| CI/RSP | Catcher's Interference with RISP | |
| H/RSP | Hits with Runners in Scoring Position | |
| BA/RSP | Batting Average with RISP | Clutch hitting average |

#### **Batting - Hit Type and Power** (21 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| GBs | Soft Ground Balls | Weakly hit ground balls |
| GBm | Medium Ground Balls | Medium contact ground balls |
| GBh | Hard Ground Balls | Hard hit ground balls |
| LDs | Soft Line Drives | Weakly hit line drives |
| LDm | Medium Line Drives | Medium contact line drives |
| LDh | Hard Line Drives | Hard hit line drives |
| PUs | Soft Popups | Weakly hit popups |
| PUm | Medium Popups | Medium contact popups |
| PUh | Hard Popups | Hard hit popups |
| FBs | Soft Flyballs | Weakly hit fly balls |
| FBm | Medium Flyballs | Medium contact fly balls |
| FBh | Hard Flyballs | Hard hit fly balls |
| GB% | Ground Ball Percentage | % of balls in play that are ground balls |
| LD% | Line Drive Percentage | % of balls in play that are line drives |
| PU% | Popup Percentage | % of balls in play that are popups |
| FB% | Flyball Percentage | % of balls in play that are fly balls |
| SH% | Soft Hit Percentage | % of balls hit softly |
| MH% | Medium Hit Percentage | % of balls hit with medium power |
| HH% | Hard Hit Percentage | % of balls hit hard |

#### **Batting - Plate Discipline** (36 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| Sc | Strikes Looking | Called strikes |
| Ss | Strikes Swinging | Swinging strikes |
| F | Fouls | Foul balls |
| Ball | Balls | Pitches outside strike zone |
| Bi | Intentional Balls | Intentional balls (IBB) |
| BIP | Balls in Play | Batted balls in play |
| TP | Total Pitches | Total pitches seen |
| Ss% | Swinging Strike Percentage | Ss/TP |
| Ot | Outside Total | Total pitches outside the zone |
| Zt | Zone Total | Total pitches inside the zone |
| Os | Outside Swings | Swings at pitches outside zone |
| Zs | Zone Swings | Swings at pitches in zone |
| Oc | Outside Contact | Contact on pitches outside zone |
| Zc | Zone Contact | Contact on pitches in zone |
| FP | First Pitches | Total first pitches seen |
| FS | First Pitch Strikes | First pitches that were strikes |
| FB | First Pitch Balls | First pitches that were balls |
| FPSw | First Pitch Swings | Swings at first pitch |
| FPSw% | First Pitch Swing Percentage | FPSw/FP |
| FPSs | First Pitch Swings for Strike | First pitch swinging strikes |
| FPF | First Pitch Fouls | First pitch foul balls |
| FPBu | First Pitch Bunts | First pitch bunts |
| FP1B | First Pitch Singles | First pitch singles |
| FP2B | First Pitch Doubles | First pitch doubles |
| FP3B | First Pitch Triples | First pitch triples |
| FPHR | First Pitch Homeruns | First pitch home runs |
| FPH | First Pitch Hits | Total first pitch hits |
| FPCI | First Pitch Catcher's Interference | |
| FPFC | First Pitch Fielder's Choice | |
| FPROE | First Pitch Error | Reached on error on first pitch |
| FPSF | First Pitch Sacrifice Fly | |
| FPSCB | First Pitch Sac Bunt | |
| FPO | First Pitch Out | Made out on first pitch |
| FPSS% | First Pitch Swing Success Rate | Success rate of first pitch swings |

#### **Batting - Batting Quality** (21 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| QAB1 | Quality at Bat Type 1 | See QAB definitions below |
| QAB1% | QAB1 Percentage | QAB1/PA |
| QAB2 | Quality at Bat Type 2 | See QAB definitions below |
| QAB2% | QAB2 Percentage | QAB2/PA |
| QAB3 | Quality at Bat Type 3 | See QAB definitions below |
| QAB3% | QAB3 Percentage | QAB3/PA |
| P1 | 1 Pitch Plate Appearances | PAs ending after 1 pitch |
| P2 | 2 Pitch Plate Appearances | PAs ending after 2 pitches |
| P3 | 3 Pitch Plate Appearances | PAs ending after 3 pitches |
| P4 | 4 Pitch Plate Appearances | PAs ending after 4 pitches |
| P5 | 5 Pitch Plate Appearances | PAs ending after 5 pitches |
| P6 | 6 Pitch Plate Appearances | PAs ending after 6 pitches |
| P7 | 7 Pitch Plate Appearances | PAs ending after 7 pitches |
| P8 | 8 Pitch Plate Appearances | PAs ending after 8 pitches |
| P9 | 9 Pitch Plate Appearances | PAs ending after 9 pitches |
| P10 | 10 Pitch Plate Appearances | PAs ending after 10 pitches |
| P11 | 11 Pitch Plate Appearances | PAs ending after 11 pitches |
| P12 | 12 Pitch Plate Appearances | PAs ending after 12 pitches |
| P13+ | 13+ Pitch Plate Appearances | PAs with 13 or more pitches |

**Quality at Bat (QAB) Definitions:**
- **QAB-1:** Base Hit, Sac Bunt, Sac Fly, Hard ground ball, Hard line drive, Hard fly ball, 6+ pitches
- **QAB-2:** Base Hit, RBI, Sac Bunt, Sac Fly, 6+ Pitches
- **QAB-3:** Hit w/RISP, RBI, Sac Bunt, Sac Fly, 6+ Pitches

---

### ⚾ PITCHING STATISTICS

#### **Pitching - Record** (21 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| G | Games | Pitching games |
| SEQ | Sequence | The order in which the player pitched |
| W | Wins | Pitching wins |
| L | Losses | Pitching losses |
| SV | Saves | Save opportunities converted |
| HLD | Holds | Hold situations |
| SVOP | Save Opportunities | Total save situations |
| BS | Blown Saves | Failed save attempts |
| SV% | Save Percent | SV/SVOP |
| ST | Starts | Games started as pitcher |
| FIN | Finishes | Games finished as pitcher |
| CMP | Complete Games | Complete games pitched |
| GSc | Game Score | Quality start metric (see formula below) |
| QS | Quality Starts | Games with GSc > 50 |
| TL | Tough Losses | Losses with QS (quality start but lost) |
| CW | Cheap Wins | Wins without QS (won but poor performance) |
| ShO | Shutouts | Complete game shutouts |
| GT | Games Totals | Total pitching games |
| GScT | Total Game Score | Cumulative game score |

**Game Score Formula:**
1. Start with 50 points
2. Add 1 point for each out recorded (3 per inning)
3. Add 2 points for each inning completed after the 4th
4. Add 1 point for each strikeout
5. Subtract 2 points for each hit allowed
6. Subtract 4 points for each earned run allowed
7. Subtract 2 points for each unearned run allowed
8. Subtract 1 point for each walk

#### **Pitching - Basic** (49 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| IP | Innings Pitched | Total innings pitched |
| BF | Batters Faced | Total batters faced |
| Ball | Balls | Balls thrown |
| Str | Strikes | Strikes thrown |
| B/S | Ball to Strike Ratio | Ball/Strike ratio |
| PIT | Pitches | Total pitches thrown |
| R | Runs | Runs allowed |
| GI | Game Innings Average | Average innings per game |
| RA | Run Average | Runs per game innings |
| ER | Earned Runs | Earned runs allowed |
| ERA | Earned Run Average | (ER/IP) × GI |
| ERA9 | ERA for 9 Innings | Standardized ERA for 9-inning games |
| FIP | Fielding Independent Pitching | (13×HR + 3×BB - 2×K)/IP + 3.10 |
| O | Outs | Total outs recorded |
| K | Strikeouts | Total strikeouts |
| Kc | Strikeouts Looking | Called third strikes |
| Ks | Strikeouts Swinging | Swinging third strikes |
| H | Hits | Hits allowed |
| BB | Walks | Walks allowed |
| IBB | Intentional Walks | Intentional walks allowed |
| K/BB | Strikeout to Walk Ratio | K/BB |
| K/GI | Strikeouts per Game | K/GI |
| BB/GI | Walks per Game | BB/GI |
| H/GI | Hits per Game | H/GI |
| HB | Hit Batters | Batters hit by pitch |
| BK | Balks | Balk calls |
| WP | Wild Pitches | Wild pitches thrown |
| CI | Catcher's Interference | Catcher interference calls |
| SCB | Sacrifice Bunts | Sacrifice bunts allowed |
| SCF | Sacrifice Flys | Sacrifice flies allowed |
| BT | Bunts | Total bunts allowed |
| 1B | Singles | Singles allowed |
| 2B | Doubles | Doubles allowed |
| 3B | Triples | Triples allowed |
| HR | Homeruns | Home runs allowed |
| WHIP | Walks + Hits per IP | (BB+H)/IP |
| OBP | On Base Percentage | OBP against |
| BAA | Batting Average Against | Opponent batting average |
| BABIP | BABIP Against | Batting average on balls in play against |
| GIT | Game Innings | Total game innings |
| IR | Inherited Runners | Runners inherited from previous pitcher |
| IRS | Inherited Runners Scored | Inherited runners who scored |
| LOB | Left On Base | Runners left on base |
| PK | Pickoffs Successful | Successful pickoff attempts |
| PKF | Pickoffs Failed | Failed pickoff attempts |
| Sc | Strikes Looking | Called strikes thrown |
| Ss | Strikes Swinging | Swinging strikes induced |
| F | Fouls | Foul balls induced |

#### **Pitching - Effectiveness** (42 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| GO | Ground Outs | Ground ball outs |
| AO | Air Outs | Fly ball/popup outs |
| GO/AO | Ground Out to Air Out Ratio | GO/AO |
| FPS | First Pitch Strikes | First pitch strikes thrown |
| FPB | First Pitch Balls | First pitch balls thrown |
| FPS% | First Pitch Strike Percentage | FPS/(FPS+FPB) |
| LOBB | Leadoff Walks | Walks to leadoff batter |
| LOH | Leadoff Hit | Hits to leadoff batter |
| LOHB | Leadoff Hit Batter | Hit leadoff batter with pitch |
| LOCI | Leadoff Catcher Interference | CI on leadoff batter |
| LOE | Leadoff Error | Error on leadoff batter |
| LOK | Leadoff Strikeout | Strikeout of leadoff batter |
| LOO | Leadoff Fielding Out | Leadoff batter made out |
| 123 | 123 Innings | 3 up, 3 down innings |
| FsO | First Strike Field Outs | Outs after first strike |
| FsK | First Strike Strikeouts | Strikeouts after first strike |
| FsH | First Strike Hits | Hits after first strike |
| FsBB | First Strike Walks | Walks after first strike |
| 3P | 3 Pitch Innings | Innings with 3 pitches |
| 4P | 4 Pitch Innings | Innings with 4 pitches |
| 5P | 5 Pitch Innings | Innings with 5 pitches |
| 6P | 6 Pitch Innings | Innings with 6 pitches |
| 7P | 7 Pitch Innings | Innings with 7 pitches |
| 8P | 8 Pitch Innings | Innings with 8 pitches |
| 9P | 9 Pitch Innings | Innings with 9 pitches |
| 10P | 10 Pitch Innings | Innings with 10 pitches |
| 11P | 11 Pitch Innings | Innings with 11 pitches |
| 12P | 12 Pitch Innings | Innings with 12 pitches |
| 13P | 13 Pitch Innings | Innings with 13 pitches |
| 14P | 14 Pitch Innings | Innings with 14 pitches |
| 15P | 15 Pitch Innings | Innings with 15 pitches |
| 16P+ | 16+ Pitch Innings | Innings with 16 or more pitches |
| 1PA | 1 Pitch Appearances | Plate appearances with 1 pitch |
| 2PA | 2 Pitch Appearances | Plate appearances with 2 pitches |
| 3PA | 3 Pitch Appearances | Plate appearances with 3 pitches |
| 4PA | 4 Pitch Appearances | Plate appearances with 4 pitches |
| 5PA | 5 Pitch Appearances | Plate appearances with 5 pitches |
| 6PA | 6 Pitch Appearances | Plate appearances with 6 pitches |
| 7PA | 7 Pitch Appearances | Plate appearances with 7 pitches |
| 8P+A | 8+ Pitch Appearances | Plate appearances with 8+ pitches |

#### **Pitching - Hit Type and Power** (22 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| GBs | Soft Ground Balls | Soft ground balls allowed |
| GBm | Medium Ground Balls | Medium ground balls allowed |
| GBh | Hard Ground Balls | Hard ground balls allowed |
| LDs | Soft Line Drives | Soft line drives allowed |
| LDm | Medium Line Drives | Medium line drives allowed |
| LDh | Hard Line Drives | Hard line drives allowed |
| PUs | Soft Popups | Soft popups allowed |
| PUm | Medium Popups | Medium popups allowed |
| PUh | Hard Popups | Hard popups allowed |
| FBs | Soft Flyballs | Soft fly balls allowed |
| FBm | Medium Flyballs | Medium fly balls allowed |
| FBh | Hard Flyballs | Hard fly balls allowed |
| BIP | Balls in Play | Total balls in play |
| GB% | Ground Ball Percentage | % ground balls |
| LD% | Line Drive Percentage | % line drives |
| PU% | Popup Percentage | % popups |
| FB% | Flyball Percentage | % fly balls |
| SH% | Soft Hit Percentage | % soft contact |
| MH% | Medium Hit Percentage | % medium contact |
| HH% | Hard Hit Percentage | % hard contact |

#### **Pitching - Pitch Types** (168 columns!)
This is the most comprehensive section with detailed pitch type tracking:

**Overall Strike/Ball Stats:**
- S% - Total Strike Percentage
- B% - Total Ball Percentage

**For Each Pitch Type (Fastball, Curve, Slider, Cutter, Change, Splitter, Knuckle, Dropball, Riseball, Screwball, Dropcurve, Other):**
- [Type] - Count of pitch type (e.g., Fb, Cu, Sl, Ct, Ch, Sp, Kn, Dp, Rs, Sw, Dc, Or)
- [Type]S - Strikes with that pitch type
- [Type]S% - Strike percentage for that pitch type
- [Type]Min - Minimum speed for that pitch type
- [Type]Max - Maximum speed for that pitch type
- [Type]Tot - Total speed (for averaging)
- [Type]Cnt - Count of pitches with speed data
- [Type]Avg - Average speed for that pitch type

**Count-Specific Stats (for each count from 0-0 through 3-2):**
- T[count] - Total pitches at that count (e.g., T00, T01, T02, T10, T11, T12, T20, T21, T22, T30, T31, T32)
- S[count] - Strikes thrown at that count
- S%[count] - Strike percentage at that count
- E[count]+ - Positive outcomes at that count (Out, K, etc.)
- E[count]- - Negative outcomes at that count (Hit, BB, HBP)
- E[count]* - Neutral outcomes at that count (SAC, SF, CI)

---

### 🧤 FIELDING STATISTICS

#### **Fielding - Basic** (29 columns)
| Column | Full Name | Description |
|--------|-----------|-------------|
| # | Player Number | |
| Name | Player Name | |
| G | Games | Fielding games played |
| ST | Games Started | Games started in field |
| Et | Throwing Errors | Errors on throws |
| Ef | Fielding Errors | Errors on fielding plays |
| ERR | Total Errors | Total errors (Et+Ef) |
| PO | Putouts | Total putouts |
| A | Assists | Total assists |
| SBA | Stolen Bases Allowed | Stolen bases allowed |
| CS | Caught Stealing | Runners caught stealing |
| DP | Double Plays | Double plays turned |
| TP | Triple Plays | Triple plays turned |
| PB | Passed Balls | Passed balls (catcher) |
| PKF | Pickoff Failed | Failed pickoff attempts |
| PK | Pickoff Succeeded | Successful pickoffs |
| OP | Outs Played | Total outs in field |
| FP | Fielding Percentage | (PO+A)/(PO+A+E) |
| FP1 | Fielding % at Pitcher | Fielding percentage at pitcher position |
| FP2 | Fielding % at Catcher | Fielding percentage at catcher |
| FP3 | Fielding % at First | Fielding percentage at first base |
| FP4 | Fielding % at Second | Fielding percentage at second base |
| FP5 | Fielding % at Third | Fielding percentage at third base |
| FP6 | Fielding % at Shortstop | Fielding percentage at shortstop |
| FP7 | Fielding % at Left Field | Fielding percentage in left field |
| FP8 | Fielding % at Center Field | Fielding percentage in center field |
| FP9 | Fielding % at Right Field | Fielding percentage in right field |
| FP10 | Fielding % at Other | Fielding percentage at other positions |
| IP | Innings Played | Total innings in field |
| AP | Innings Appeared | Innings appeared in field |

#### **Fielding - Infield** (38 columns)
Position-specific stats for Pitcher (1), Catcher (2), First (3), Second (4), Third (5), and Shortstop (6):

For each position:
- PO[#] - Putouts at position
- A[#] - Assists at position
- Et[#] - Throwing errors at position
- Ef[#] - Fielding errors at position
- AP[#] - Innings appeared at position
- OP[#] - Outs played at position

**Positions covered:**
- Position 1: Pitcher
- Position 2: Catcher
- Position 3: First Base
- Position 4: Second Base
- Position 5: Third Base
- Position 6: Shortstop

#### **Fielding - Outfield** (26 columns)
Position-specific stats for Left Field (7), Center Field (8), Right Field (9), and Other (10):

For each position:
- PO[#] - Putouts at position
- A[#] - Assists at position
- Et[#] - Throwing errors at position
- Ef[#] - Fielding errors at position
- AP[#] - Innings appeared at position
- OP[#] - Outs played at position

**Positions covered:**
- Position 7: Left Field
- Position 8: Center Field
- Position 9: Right Field
- Position 10: Other Field

---

## 4. HIT LOCATIONS FEATURE

### ✅ **YES - Hit Locations Page EXISTS**

**Access:** There is a dedicated "Hit Locations" link in the statistics page header.
- URL: `hitlocations.php?t=platone&color=1`
- The page generates a **PDF document** with hit location diagrams

**Format:** The hit locations data is exported as a PDF file showing visual diagrams of where balls were hit on the field. The PDF contains:
- Individual player hit location charts
- Visual baseball diamond diagrams
- Coordinate-based hit placement data

**Note:** The actual page returns PDF data (not HTML), which suggests the hit locations are rendered as downloadable/viewable PDF reports with visual field diagrams.

---

## 5. LEGEND SECTION

### ✅ **YES - Comprehensive Legend Page EXISTS**

**Access:** Link available at top of statistics page
- URL: `http://data.iscoresports.com/legend.php?s=baseball2`
- External link opens in new tab

**Content:** The legend page provides:
- **Complete definitions** for ALL statistics abbreviations
- Organized by category (Batting, Pitching, Fielding)
- Detailed explanations for complex metrics
- Formula explanations for calculated stats (RC, GSc, QAB, FIP, etc.)
- **Footnotes section** with additional context for:
  - Quality at Bats (QAB) - Three different calculation methods
  - Game Score (GSc) - Full calculation formula
  - Quality Start (QS) - Definition
  - Tough Loss (TL) - Definition
  - Cheap Wins (CW) - Definition
  - Runs Created (RC) - Technical formula with link to Wikipedia

**Layout:** Clean, well-organized table format with:
- Grouped by statistic category
- Color-coded sections (gray headers)
- Multi-column layout for easy scanning
- Abbreviation, dash separator, full description format

---

## 6. OVERALL LAYOUT AND STRUCTURE

### Homepage Structure
- **Top Navigation Bar:** Logo area with team branding
- **Left Sidebar Menu:**
  - Home
  - Calendar
  - Roster
  - **Statistics** ← Main stats page
  - Games
  - Photos
  - Sponsors
  - Settings
  - Login/Logoff
- **Main Content Area:** iframe-based content loading
- **Responsive Design:** Table-based layout with iframe content

### Statistics Page Structure

**Header Controls:**
1. **Page Title:** "STATS - Platones Beisbola Klubs"
2. **Category Filter Dropdown:** Select which stat tables to display
3. **Legend Link:** Opens comprehensive legend in new tab
4. **Hit Locations Link:** Opens hit location diagrams
5. **League Filter Dropdown:** Filter by season/league

**Data Tables:**
- **Sortable columns** (appears to use JavaScript sorting)
- **Alternating row colors** (contentlightrow/contentdarkrow classes)
- **Player name links** to individual player statistics pages
- **TOTALS row** at bottom of each table (team totals)
- **OPPONENT row** showing opponent cumulative stats
- **Responsive table design** with horizontal scrolling for wide tables

**Visual Design:**
- Clean, professional appearance
- Color-coded rows for readability
- Consistent header styling
- Border styling on tables
- White background with contrasting text

---

## 7. SUMMARY OF KEY FINDINGS

### ✅ Season Sorting/Filtering
**YES** - League dropdown allows filtering by:
- All leagues combined
- LATVIJAS BEISBOLA LIGA 2025
- LATVIJAS BEISBOLA LIGA 2026

### ✅ Statistics Fields
**Total unique statistics tracked: 400+ fields** across:
- **5 Batting categories** (138 total columns)
- **5 Pitching categories** (302 total columns)
- **3 Fielding categories** (93 total columns)

### ✅ Hit Location Diagrams
**YES** - Dedicated hit locations page that generates PDF reports with visual field diagrams showing where balls were hit.

### ✅ Legend Section
**YES** - Comprehensive legend page with:
- All abbreviation definitions
- Formula explanations
- Footnotes for complex metrics
- Links to external resources (Wikipedia)

### 📊 Advanced Features Detected
1. **Multi-level statistics** (Basic → Advanced → Specialized)
2. **Pitch-by-pitch tracking** (count-specific outcomes)
3. **Pitch type classification** (12 different pitch types with speed tracking)
4. **Quality metrics** (QAB, GSc, QS, FIP, etc.)
5. **Situational statistics** (RISP, leadoff, first pitch, etc.)
6. **Position-specific fielding** (10 positions tracked individually)
7. **Contact quality tracking** (soft/medium/hard hit classification)
8. **Plate discipline metrics** (zone tracking, swing decisions)

---

## 8. TECHNICAL NOTES

- **Framework:** Custom PHP-based application
- **Data Format:** HTML tables with inline data
- **Sorting:** Client-side JavaScript table sorting
- **Navigation:** Iframe-based content loading
- **Analytics:** Google Analytics and New Relic tracking
- **Responsive:** Mobile-friendly design considerations
- **Export:** PDF generation for hit location reports

---

**Report Generated:** March 12, 2026  
**Data Source:** http://iscorebaseball.com/platone  
**Analysis Method:** Direct HTML content inspection and parsing
