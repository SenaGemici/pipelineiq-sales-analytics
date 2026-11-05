# PipelineIQ · From CRM Data to Sales Decisions

**English** · [Türkçe](README.tr.md)

An end-to-end data analysis case study that **cleans, analyzes and turns the CRM data of a B2B software company into sales
decisions**: data preparation in Python, SQL analysis with DuckDB, a logistic regression win-probability model, forecast
backtesting, Jupyter notebooks, a Power BI package, and a web app that presents the results.

> **About the data:** All data is synthetic. [`pipeline/generate_raw.py`](pipeline/generate_raw.py) generates the CRM export
> of a fictional company selling enterprise software in Turkey, using a fixed seed (6,658 opportunity rows, 22,035 stage
> transitions, 85 companies, 30 sales reps, 7 products; January 2025 – October 2026). Companies, people and products are
> fictional. Problems common in real CRM data (duplicate records, spelling variants, mixed date formats, missing fields) and
> business patterns (channel quality differences, team structure, diminishing returns of discounts, forgotten deals) were
> added **deliberately**. The skill this project demonstrates is not "discovering" these patterns, but measuring them with the
> right methods, avoiding misinterpretation (confounding, censoring, data leakage, small samples) and turning them into decisions.
>
> The web app, the notebooks and the generated insight texts are in Turkish; code, SQL and identifiers are in English.

## Business problem

Sales leadership needs reliable answers to three questions:

1. **How much revenue can we expect in the coming period?** Can we trust the CRM's "weighted pipeline" number?
2. **Where and why do we lose deals?** Which channel, which stage, which discount policy?
3. **Who on the team is really performing well?** What should bonus and coaching decisions be based on?

## Findings and recommendations

| # | Finding | Recommendation |
|---|---|---|
| 1 | **The CRM's standard forecast overstates revenue by ~3×.** The stage-weighted pipeline predicts $2.37M for the next 120 days; the win model predicts $0.80M. Backtested over the past 10 months, the standard method's mean absolute error is **174%**, the model's **26%**. | Plan revenue with the model forecast; repeat the backtest every month. |
| 2 | **58% of open deals are stalled.** 420 of 724 open deals have been in their current stage longer than 90% of the deals that ever left that stage ($3.57M of pipeline). The model gives them an average 8% chance of closing within 120 days, versus 24% for active deals. | Give reps two weeks to update or close stalled deals with a loss reason. |
| 3 | **Referrals bring 2.5× the revenue per deal of outbound** ($2,165 vs $863). Win rate is 36% vs 15%; median sales cycle 26 vs 42 days. Average deal size is similar across channels: the difference comes from channel quality. | Launch a customer referral program; focus outbound on better-targeted accounts. |
| 4 | **Discounts above 15% do not raise the win rate; they only reduce revenue.** For deals in negotiation, the expected revenue per list-price dollar peaks in the 10–15% band (74%) and drops to 59% at 20%+. | Cap discounts at 15% with approval above it; run an A/B test before changing policy (the analysis is observational). |
| 5 | **The weakest funnel step is Proposal → Negotiation (64%).** The main loss reasons at this stage are price (36%) and competitor (27%). | Build a value story (ROI, reference customers) and competitor comparison for the proposal stage. |
| 6 | **Raw win rate ranks sales reps incorrectly.** Reps working mostly cold outbound look unfairly weak on raw win rate; adjusting for the product × channel mix moves reps by up to 5 places. 7 reps have confidence intervals entirely below the company average. | Base bonus and coaching decisions on the mix-adjusted index and confidence intervals. |

The insight texts are not hard-coded: [`pipeline/analyze.py`](pipeline/analyze.py) computes the numbers on every run and
generates the texts from them; if the data changes, the findings change.

## Method

```text
generate_raw.py ──► data/raw/ ──► build_dataset.py ──► data/clean/ ──┬──► analysis/sql/*.sql (DuckDB) ──┐
 (synthetic CRM       (dirty         (pandas: cleaning,    (clean        │                                  ├──► analyze.py ──► lib/generated/analysis.ts (web app)
  export)              data)          validation, profile)  tables)      └──► analytics.py (model, backtest) ┘              └──► data/analysis/*.csv
                                                                                                                         export_powerbi.py ──► data/powerbi/ (star schema)
```

### 1. Data preparation ([`build_dataset.py`](pipeline/build_dataset.py))

Every step is logged with the number of rows it affected; the app's **Data Preparation** screen shows this log.

| Type | Step | Rows |
| --- | --- | --- |
| Fix | Exact duplicate rows removed | 45 |
| Fix | `DD.MM.YYYY` dates converted to ISO; discounts such as `%12,5` converted to numbers | 490 + 190 |
| Fix | Product and rep names matched to master tables (case, missing spaces, extra whitespace) | 304 |
| Fix | Lead source, sector and city spellings unified (`Referral` → `Referans`, `Teknolji` → `Teknoloji`, `İST` → `İstanbul`); the most frequent spelling is the reference, typos are matched by similarity | 299 |
| Fix | Duplicate companies merged (`LODOS LOJİSTİK AS` = `Lodos Lojistik A.Ş.`): legal suffixes, case and punctuation ignored, missing fields filled from the duplicate, deals moved to the surviving record | 4 companies |
| Fix | Creation dates falling after the close date recovered from the first stage-history entry (cross-table repair) | 16 |
| Flag | Records missing company, lead source, won amount or loss reason (never imputed; sent to the Data Quality screen) | 895 |
| Derive | Stage probabilities (historical win rate of deals that reached each stage) and per-stage stall thresholds (P90) | — |

After cleaning, 14 integrity checks run (unique IDs, date consistency, stage history ↔ current stage, cross-table references,
unique company names). The only issue deliberately left open is "deals without a company"; it is fixed inside the app.

### 2. SQL analysis ([`analysis/sql/`](analysis/sql))

Each file answers one business question and runs on the clean CSVs with DuckDB: funnel, channel performance, stage durations,
waiting time vs. progression, loss reasons, mix-adjusted rep performance (with Wilson confidence intervals), discount effect,
product and sales cycle, monthly trend. Uses window functions (`lead`, `lag`, `first_value`), CTEs and percentile functions.

### 3. Win-probability model ([`analytics.py`](pipeline/analytics.py), [notebook 02](notebooks/02_kazanma_modeli.ipynb))

- **Model:** Logistic regression (one-hot encoding + standardization + L2). Features: current stage, days in stage, deal age,
  lead source, product, rep, region, sector, company size, proposal discount.
- **Training rows:** Each deal produces a checkpoint at 0, 7, 14, 30… days in every stage it visited, so the model learns to
  tell a deal that just entered a stage from one that has been waiting for months.
- **Target: "won within the next 120 days".** Training only on resolved deals with the target "eventually won" creates
  **censoring bias**: deals that were forgotten and never closed never enter training, so the model cannot recognize them.
  With a fixed-horizon target these deals enter training as "not won"; the notebook compares both approaches on stalled
  deals (the censored model gives them more than twice the probability).
- **Feature decision:** The "has discount" flag was dropped because it carries the same information as the late stages in
  94% of rows (multicollinearity); the loss in discrimination is negligible, and the coefficients become stable and interpretable.
- **Validation:** Time-based split (trained before 1 March 2026, tested after). ROC AUC **0.747** (stage rate 0.668),
  Brier **0.175** (0.191). The calibration plot follows the diagonal, so probabilities can be converted into revenue.

### 4. Forecast backtest ([notebook 03](notebooks/03_tahmin_geriye_donuk_test.ipynb))

At the start of every month from October 2025 to July 2026: the deals open on that day are reconstructed from stage history,
the model is trained **only on data known on that day**, and the next 120 days of revenue are forecast with three methods and
compared with what actually happened. To prevent leakage, each forecast only uses fields known on that date.

| Method | Mean absolute error | Mean bias |
|---|---|---|
| Stage probability (CRM standard) | 174% | +174% |
| Overall win rate | 68% | +68% |
| **Win model** | **26%** | +26% |

### 5. Sales rep performance

The raw win rate measures not only a rep's skill but also which channel their deals come from (correlation between outbound
share and raw win rate: −0.31). For every deal, the company rate in the same product × channel group is taken as "expected";
mix-adjusted index = actual wins / expected wins (the correlation drops to 0.05). Uncertainty is shown with Wilson 95%
confidence intervals.

## Limitations

- The data is synthetic; the patterns exist by design. What should be evaluated is the correctness of the methods.
- The discount analysis is observational: deals with high discounts may already be hard deals. Causality requires an experiment.
- The model is linear and does not fully capture non-linear effects such as the diminishing returns of discounts. Because
  checkpoints produce several rows per deal, coefficient standard errors look narrower than they are (not a problem for forecasting).
- The model also has a positive bias (+26%); having little training data in the first months is one reason. It should be monitored.

## Project structure

| Path | Contents |
| --- | --- |
| [`pipeline/`](pipeline) | `generate_raw.py` (synthetic data) → `build_dataset.py` (cleaning) → `analyze.py` (SQL + model + insights) → `export_powerbi.py`; shared library `analytics.py` |
| [`analysis/sql/`](analysis/sql) | One DuckDB query per business question |
| [`notebooks/`](notebooks) | 01 exploratory analysis · 02 win model · 03 forecast and backtest (with outputs, in Turkish) |
| [`data/`](data) | `raw/` (dirty) · `clean/` (clean) · `analysis/` (analysis results) · [`powerbi/`](data/powerbi) (star schema, DAX measures, setup guide) |
| `app/`, `components/`, `lib/` | Web app (Next.js, TypeScript, Recharts) |

## Reproduce

```bash
pip install -r pipeline/requirements.txt
python pipeline/generate_raw.py      # raw data (fixed seed: identical every run)
python pipeline/build_dataset.py     # cleaning, validation, app data
python pipeline/analyze.py           # SQL analysis, model, backtest, insights
python pipeline/export_powerbi.py    # Power BI tables

npm install && npm run dev           # web app: http://localhost:3000
node --test scripts/check-data.mjs   # data, cleaning, metric and analysis consistency tests
```

## Web app

| Section | Screens |
| --- | --- |
| **Analysis** | Findings & Recommendations · Funnel & Channels · Sales Forecast (backtest, calibration, odds ratios, open-deal scores) · Team Performance (confidence intervals, mix-adjusted index, discount effect) · Sales Cycle |
| **Data** | Data Preparation (raw data profile, cleaning log, integrity checks) · Data Quality (7 rules, per-record score, inline fixes) |
| **CRM** | Pipeline · Opportunities (6-stage Kanban) · Companies · Settings |

The analysis screens are reports computed from the base data; the CRM screens are live (edits are stored in the browser and
tagged with the data version). `check-data.mjs` also tests that the amounts computed by the app and the definition of a stalled
deal match the Python analysis layer exactly.

> The browser tests `scripts/check-dashboard.mjs` and `scripts/check-crm.mjs` were written for the earlier demo data and need
> to be updated.
