# Player Similarity Explorer

An interactive graph-based tool for exploring statistical similarity between football players across attacking, passing, and defensive dimensions. Built with Angular 21 and powered by Euclidean distance on Bayesian-shrinkage-adjusted z-score vectors stratified by position group.

> **Note on data:** The included `data/example.xlsx` file contains randomly generated player data for demonstration purposes. The application is designed to work with real [Wyscout](https://wyscout.com/) XLSX exports, but due to licensing restrictions, actual Wyscout data cannot be shared in this repository. With real data the similarity results become meaningful for scouting and player comparison workflows.

---

## Running Locally

### Prerequisites

- **Node.js** 20+
- **pnpm** (install via `npm install -g pnpm`)

### Setup

```bash
git clone https://github.com/MateuszDropinski/player-similarity-explorer.git
cd player-similarity-explorer
pnpm install
pnpm start
```

The app opens at `http://localhost:4200`.

### Data Setup

Place one or more Wyscout XLSX exports into the `data/` directory. The manifest is generated automatically on `pnpm start` and `pnpm build` via a pre-script that scans `data/` for `.xlsx` files.

If you add or remove files while the dev server is running, regenerate the manifest manually:

```bash
node scripts/generate-manifest.js
```

The XLSX files must follow the standard Wyscout player statistics export format. The required columns are listed in the [Data Format](#data-format-wyscout-xlsx) section below.

### Production Build

```bash
pnpm build
```

Output is written to `dist/player-similarity-explorer/`. The project includes a GitHub Actions workflow that deploys to GitHub Pages on every push to `main`.

---

## How to Use

### Setting a Root Player

The left sidebar shows a searchable, filterable list of all loaded players (excluding goalkeepers). Click a player to set them as the **root node** at the center of the graph. If a graph already exists, you will be asked to confirm before replacing it.

Use the filters at the top of the sidebar:
- **Search** &mdash; filter by name
- **Position** &mdash; filter by position group (CB, FB, DM, CM, AM, W, CF)
- **Min minutes** (header bar) &mdash; exclude players below a minutes threshold from both the list and the graph

### Expanding the Graph

Each node on the diagram has three colored buttons:

| Button | Color | Dimension |
|--------|-------|-----------|
| **A** | Orange | Attacking |
| **P** | Green | Passing |
| **D** | Blue | Defensive |

Clicking a button expands that dimension: the app finds all players in the same position group whose similarity score exceeds the current threshold and adds them as connected nodes. Click the same button again to collapse that expansion and remove unreachable nodes.

### Threshold Controls

The toolbar at the bottom of the diagram shows three threshold inputs (A / P / D) as percentages. When you set a root player, thresholds are automatically calibrated to surface roughly the top 9 most similar players per dimension. You can adjust them manually &mdash; lowering a threshold shows more players, raising it shows fewer. Changing a threshold triggers a full diagram rebuild that preserves your expansion state.

### Selecting and Comparing

- **Click a node** to select it. The right panel shows the player's profile card, per-dimension radar charts, and the top 3 most similar players in each dimension.
- **Select multiple nodes** (up to 4) to see a side-by-side comparison with overlaid radar charts and a stats table. The best value in each metric is highlighted.
- **Click an edge** to see the similarity breakdown: the score, both players' raw metric values, and percentile bars for each metric in that dimension.

### Detail Panel

The right panel adapts to what is selected:

| Selection | Panel Shows |
|-----------|-------------|
| Nothing | Usage instructions |
| 1 node | Player card, radar tabs (A/P/D), top 3 similarities per dimension |
| 2-4 nodes | Multi-player radar overlay, comparison table with best-value highlighting |
| 1 edge | Dimension similarity score, per-metric breakdown with percentile bars |

On narrow viewports the detail panel is hidden behind a toggle button on the right edge.

---

## Statistical Methodology

The similarity computation pipeline has five stages, all executed in a Web Worker off the main thread.

### 1. Derived Metrics

Six composite metrics are computed before any statistical processing. Each combines a volume-per-90 metric with its corresponding accuracy percentage to capture effective output rather than raw volume or raw accuracy alone:

```
derived = (volume_per_90 * accuracy_pct) / 100
```

| Derived Metric | Volume | Accuracy |
|---------------|--------|----------|
| Successful dribbles/90 | Dribbles per 90 | Successful dribbles, % |
| Accurate crosses/90 | Crosses per 90 | Accurate crosses, % |
| Accurate passes/90 | Passes per 90 | Accurate passes, % |
| Accurate progressive passes/90 | Progressive passes per 90 | Accurate progressive passes, % |
| Accurate long passes/90 | Long passes per 90 | Accurate long passes, % |
| Accurate smart passes/90 | Smart passes per 90 | Accurate smart passes, % |

### 2. Position-Group Stratification

All statistical computations (shrinkage, z-scores, percentiles, similarity) are performed **within position groups**, never across them. A centre-back's metrics are compared only to other centre-backs, never to wingers.

Each player's position string from Wyscout (e.g. `"LCMF, RCMF, AMF"`) is parsed into position codes, and each code is mapped to one of seven groups:

| Group | Position Codes |
|-------|---------------|
| **CB** | CB, LCB, RCB |
| **FB** | LB, RB, LWB, RWB |
| **DM** | DMF, LDMF, RDMF |
| **CM** | LCMF, RCMF |
| **AM** | AMF, LAMF, RAMF |
| **W** | LW, RW, LWF, RWF |
| **CF** | CF |

The player's **primary group** is determined by their first listed position code. Goalkeepers are excluded entirely.

### 3. Bayesian Shrinkage

Per-90 statistics from players with low minutes are unreliable. A player with 100 minutes and 2.7 xG/90 is not meaningfully comparable to one with 2500 minutes and the same figure. To address this, every metric value is adjusted via **Bayesian shrinkage toward the position-group mean** before z-score computation:

```
adjusted = w * observed + (1 - w) * group_mean

where w = minutes_played / (minutes_played + 900)
```

The **prior strength of 900 minutes** means:
- At 900 minutes played, the observed value gets 50% weight and the group mean gets 50%
- At 1800 minutes, the observed value gets ~67% weight
- At 450 minutes, the observed value gets ~33% weight
- As minutes approach zero, the player's profile converges to the position-group average

This stabilizes the metric space so that similarity scores are not dominated by noise from small samples.

### 4. Z-Score Normalization

After shrinkage, each metric is z-score normalized **within its position group** using sample standard deviation:

```
z = (value - group_mean) / group_std_dev
```

This transforms all metrics into the same unit-free scale where 0 means group-average and +/- 1 means one standard deviation above/below. Without normalization, metrics measured in different units (e.g. xG/90 ~0.3 vs. passes/90 ~50) would contribute unequally to distance calculations.

The z-scores are then grouped into three **dimension vectors**:

**Attacking (9 metrics):**
`xG/90`, `Shots/90`, `Touches in box/90`, `Progressive runs/90`, `Shot assists/90`, `Deep completions/90`, `Successful dribbles/90`, `Offensive duels/90`, `Fouls suffered/90`

**Passing (10 metrics):**
`xA/90`, `Key passes/90`, `Final third passes/90`, `Penalty area passes/90`, `Through passes/90`, `Accurate passes/90`, `Accurate progressive passes/90`, `Accurate long passes/90`, `Accurate smart passes/90`, `Accurate crosses/90`

**Defensive (5 metrics):**
`PAdj Interceptions`, `PAdj Sliding tackles`, `Defensive duels/90`, `Aerial duels/90`, `Shots blocked/90`

### 5. Euclidean Similarity

Similarity between two players in a given dimension is computed as:

```
distance = sqrt( sum( (z_a[i] - z_b[i])^2 ) )

similarity = 1 / (1 + distance)
```

This produces a score in **(0, 1]** where 1 means identical z-score vectors. Euclidean distance was chosen over cosine similarity because it captures differences in both **profile shape** (which metrics are high/low) and **magnitude** (how extreme the values are). Two players can have the same shape (cosine similarity = 1) but very different magnitudes; Euclidean distance captures that distinction.

### Percentiles and Radar Charts

Independently from the z-score/similarity pipeline, rank-based **percentiles** are computed within each position group for visualization on radar charts. A percentile of 75 means the player ranks above 75% of players in their position group for that metric. Percentiles use the shrinkage-adjusted values, keeping the visualization consistent with the similarity computation.

### Auto-Thresholds

When a root player is selected, the app automatically sets per-dimension thresholds to capture the **top 9 most similar players** in each dimension. It computes similarity against all candidates in the same position group, sorts the scores, and sets the threshold to the 9th-highest score (clamped to the 20%&ndash;99% range). This provides a reasonable starting point that can be adjusted manually.

---

## Data Format (Wyscout XLSX)

The application expects XLSX files matching the standard Wyscout player statistics export. Each file must contain a sheet with the following 44 columns:

| # | Column Name | Type |
|---|------------|------|
| 1 | Player | string |
| 2 | Team | string |
| 3 | Team within selected timeframe | string |
| 4 | Position | string (comma-separated codes) |
| 5 | Age | number |
| 6 | Market value | number |
| 7 | Contract expires | string |
| 8 | Birth country | string |
| 9 | Passport country | string |
| 10 | Foot | string |
| 11 | Height | number |
| 12 | Weight | number |
| 13 | On loan | string ("Yes"/"No") |
| 14 | Matches played | number |
| 15 | Minutes played | number |
| 16 | xG per 90 | number |
| 17 | Shots per 90 | number |
| 18 | Touches in box per 90 | number |
| 19 | Progressive runs per 90 | number |
| 20 | xA per 90 | number |
| 21 | Shot assists per 90 | number |
| 22 | Deep completions per 90 | number |
| 23 | Dribbles per 90 | number |
| 24 | Successful dribbles, % | number |
| 25 | Crosses per 90 | number |
| 26 | Accurate crosses, % | number |
| 27 | Passes per 90 | number |
| 28 | Progressive passes per 90 | number |
| 29 | Key passes per 90 | number |
| 30 | Passes to final third per 90 | number |
| 31 | Passes to penalty area per 90 | number |
| 32 | Through passes per 90 | number |
| 33 | Smart passes per 90 | number |
| 34 | Accurate passes, % | number |
| 35 | Accurate progressive passes, % | number |
| 36 | Long passes per 90 | number |
| 37 | Accurate long passes, % | number |
| 38 | Accurate smart passes, % | number |
| 39 | PAdj Interceptions | number |
| 40 | PAdj Sliding tackles | number |
| 41 | Defensive duels per 90 | number |
| 42 | Aerial duels per 90 | number |
| 43 | Shots blocked per 90 | number |
| 44 | Offensive duels per 90 | number |
| 45 | Fouls suffered per 90 | number |

Multiple XLSX files can be placed in `data/` to combine leagues or seasons. Files with missing columns are skipped with a console warning.

---

## Tech Stack

- **Angular 21** &mdash; signals, standalone components, control flow
- **ng-diagram** &mdash; interactive node/edge canvas with selection, zoom, and pan
- **d3-force** &mdash; force-directed graph layout
- **xlsx** (SheetJS) &mdash; client-side XLSX parsing
- **Web Worker** &mdash; off-main-thread z-score and percentile computation
- **Angular CDK** &mdash; virtual scrolling for the player list
