# Databricks notebooks

Two PySpark notebooks that rebuild the cleaned dataset inside Databricks, from the raw BTS files to the CSV export.

| Notebook | Reads | Writes | Runtime |
|---|---|---|---|
| `01_import_raw_bts.py` | 20 raw zips in the Volume's `raw/` folder | `workspace.bufferengine.bronze_aa_flights`, `workspace.bufferengine.ref_airports_tz` | about 10 to 15 min |
| `02_clean_transform.py` | the two tables above | `workspace.bufferengine.silver_aa_clean`, CSV files in `exports/` | a few minutes |

Both notebooks check themselves: Notebook 1 compares its table with the local base table row by row, and
Notebook 2 compares its table with the published `aa_clean_v1.0.parquet` row by row across all 59 columns.

## One-time setup

1. **Volume contents.** In Catalog → workspace → default → Volumes → bufferengine you need:
   - `raw/` with the 20 files `bts_ontime_2025_01.zip` to `bts_ontime_2026_08.zip`
   - `reference/airports_tz.csv`
   - `interim/aa_base_2025_2026.parquet` (optional, for Notebook 1's cross-check)
   - `processed/aa_clean_v1.0.parquet` (optional, for Notebook 2's cross-check)
2. **Import the notebooks.** Workspace → your `bufferengine` folder → ⋮ (or Create) → **Import** → choose
   `01_import_raw_bts.py`, then repeat for `02_clean_transform.py`. Each appears as a notebook.
3. **Run.** Open Notebook 1, choose **Serverless** in the *Connect* menu, press **Run all**. When it finishes,
   do the same for Notebook 2.

The schema `workspace.bufferengine` is created by Notebook 1; you do not need to create it yourself.

## Exporting a CSV for another period

At the top of Notebook 2 there are two boxes: **Export from** and **Export to** (format `YYYY-MM-DD`, default
January 2026). Change them and run **Step 12** only. The file appears in `exports/` as
`aa_clean_<from>_to_<to>.csv`. Click it in the Catalog and choose **Download**.

One month is roughly 70,000 to 90,000 rows. Excel opens at most 1,048,576 rows; the cell warns you if a period is
larger than that.

## Walkthrough for the professor

A suggested order, about 10 minutes.

1. **The raw material** (Catalog → Volume → `raw/`). Twenty monthly files straight from BTS, all US airlines,
   11.7 million flights.
2. **Notebook 1, Steps 3 and 4.** We keep 43 of 109 columns, convert text to proper types, and count every
   value that fails to convert (there are none). Only one filter is applied: American Airlines.
3. **Notebook 1, Step 5.** The numbers add up: 11,730,351 flights in, 1,641,071 American Airlines flights saved.
4. **Notebook 1, Step 7.** The Databricks import is identical to the local pipeline, row by row.
5. **Notebook 2, Step 3.** Converting local clock times to UTC, including overnight flights and both daylight-saving
   changes. Point out the spring-forward correction: Spark and pandas handle the missing hour differently, and
   the notebook makes them agree.
6. **Notebook 2, Steps 5 and 6.** Structural nulls versus real data-quality issues. Nothing is deleted; problems
   become flags.
7. **Notebook 2, Step 8.** The capped delay column, with limits learned from the train period only, to avoid
   leaking test information.
8. **Notebook 2, Step 10.** The Databricks result is identical to the published dataset `aa_clean_v1.0`.
9. **Notebook 2, Step 12.** Change the dates live, export a month, open the CSV.

## If something fails

Copy the error message from the failing cell. The most likely causes on Free Edition are a missing file in the
Volume, or the daily compute quota being used up (wait until the next day).
