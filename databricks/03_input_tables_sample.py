# Databricks notebook source
# MAGIC %md
# MAGIC # Notebook 3 — Show all project tables (small sample)
# MAGIC
# MAGIC **Project:** Buffer Delay Allocation Engine (ANCP, Team T19)
# MAGIC
# MAGIC ## What this notebook does
# MAGIC
# MAGIC Our project has **seven tables**, not one. This notebook loads all of them, picks a small, matching sample, and
# MAGIC saves it two ways: as **tables** you can browse in Databricks, and as **CSV files** you can open in Excel.
# MAGIC
# MAGIC | Table | What it holds | Rows (full) |
# MAGIC |---|---|---|
# MAGIC | `aa_clean_v1.0` | Cleaned flights, one row per flight | 1,641,071 |
# MAGIC | `rotations` | The same flights arranged into aircraft chains | 1,641,071 |
# MAGIC | `rotation_turns` | One row per ground stop between two flights of the same aircraft | 1,045,807 |
# MAGIC | `rotation_breaks` | Places where a chain was cut, with the reason | 93,458 |
# MAGIC | `mtt_sensitivity` | Buffer under three minimum-turnaround assumptions | 1,045,807 |
# MAGIC | `mtt_estimates` | Estimated minimum turnaround per airport and time of day | small |
# MAGIC | `airports_tz` | Airport list with time zones | 137 |
# MAGIC
# MAGIC ## How the sample is chosen
# MAGIC
# MAGIC We take the **busiest few aircraft** (by tail number) and keep only their rows in every table. This way the
# MAGIC samples **line up**: a flight in `aa_clean` can be found in `rotations`, its ground stops in `rotation_turns`,
# MAGIC and so on. The two small tables are copied in full.
# MAGIC
# MAGIC ## Before you run
# MAGIC 1. Upload these files to the Volume folder `processed/`: `rotations.parquet`, `rotation_turns.parquet`,
# MAGIC    `rotation_breaks.parquet`, `mtt_sensitivity.parquet` and `mtt_estimates.csv`
# MAGIC    (and `aa_clean_v1.0.parquet`, if it is not there already).
# MAGIC 2. Make sure `airports_tz.csv` is in `reference/`.
# MAGIC 3. Attach to **Serverless** compute and press **Run all**. It takes a few minutes.
# MAGIC
# MAGIC **Output:** seven tables named `sample_<table>` in `workspace.bufferengine`, and seven CSV files in the
# MAGIC Volume folder `exports/samples/`.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1 — Settings
# MAGIC
# MAGIC Change `N_TAILS` to get a bigger or smaller sample. Each aircraft flies roughly 1,600 times in our 20 months,
# MAGIC so 5 aircraft give about 8,000 flights.

# COMMAND ----------

import os
from pyspark.sql import functions as F

VOLUME    = "/Volumes/workspace/default/bufferengine"
DB        = "workspace.bufferengine"
PROCESSED = f"{VOLUME}/processed"
REFERENCE = f"{VOLUME}/reference"
OUT_DIR   = f"{VOLUME}/exports/samples"

N_TAILS = 5   # how many aircraft to include in the sample

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {DB}")
os.makedirs(OUT_DIR, exist_ok=True)
print(f"Sample will contain the {N_TAILS} busiest aircraft.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2 — Load the seven tables
# MAGIC
# MAGIC The five large tables are Parquet files, a compact format that keeps column types. The two small ones are CSV.
# MAGIC A missing file stops the notebook with a clear message instead of a confusing error later.

# COMMAND ----------

def need(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Missing file: {path}. Upload it to the Volume first (see 'Before you run').")
    return path

tables = {
    "aa_clean":        spark.read.parquet(need(f"{PROCESSED}/aa_clean_v1.0.parquet")),
    "rotations":       spark.read.parquet(need(f"{PROCESSED}/rotations.parquet")),
    "rotation_turns":  spark.read.parquet(need(f"{PROCESSED}/rotation_turns.parquet")),
    "rotation_breaks": spark.read.parquet(need(f"{PROCESSED}/rotation_breaks.parquet")),
    "mtt_sensitivity": spark.read.parquet(need(f"{PROCESSED}/mtt_sensitivity.parquet")),
    "mtt_estimates":   spark.read.csv(need(f"{PROCESSED}/mtt_estimates.csv"), header=True, inferSchema=True),
    "airports_tz":     spark.read.csv(need(f"{REFERENCE}/airports_tz.csv"), header=True, inferSchema=True),
}

# Full row counts, so we can show "sample vs full" at the end.
full_counts = {name: df.count() for name, df in tables.items()}
for name, n in full_counts.items():
    print(f"{name:18s} {n:>10,} rows  |  {len(tables[name].columns)} columns")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3 — Pick the aircraft
# MAGIC
# MAGIC We count flights per tail number in `rotations` and keep the busiest `N_TAILS`. Every table is then filtered
# MAGIC to these same aircraft.

# COMMAND ----------

top_tails = (tables["rotations"]
             .where(F.col("tail_number").isNotNull())
             .groupBy("tail_number").count()
             .orderBy(F.desc("count"), "tail_number")        # tail_number breaks ties, so the choice is repeatable
             .limit(N_TAILS))
display(top_tails)

TAILS = [r["tail_number"] for r in top_tails.collect()]
print("Aircraft in the sample:", TAILS)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4 — Cut each table down to those aircraft
# MAGIC
# MAGIC * `aa_clean` uses the original BTS column name `Tail_Number`; the other tables use `tail_number`.
# MAGIC * `mtt_sensitivity` has no tail column. It is linked to `rotation_turns` by `turn_id`, so we keep the turns
# MAGIC   that belong to our aircraft (a *semi join*: keep matching rows, add no columns).
# MAGIC * `mtt_estimates` and `airports_tz` are small lookup tables, so they are kept whole.

# COMMAND ----------

samples = {}
samples["aa_clean"]        = tables["aa_clean"].where(F.col("Tail_Number").isin(TAILS))
samples["rotations"]       = tables["rotations"].where(F.col("tail_number").isin(TAILS))
samples["rotation_turns"]  = tables["rotation_turns"].where(F.col("tail_number").isin(TAILS))
samples["rotation_breaks"] = tables["rotation_breaks"].where(F.col("tail_number").isin(TAILS))
samples["mtt_sensitivity"] = tables["mtt_sensitivity"].join(
    samples["rotation_turns"].select("turn_id"), on="turn_id", how="left_semi")
samples["mtt_estimates"]   = tables["mtt_estimates"]
samples["airports_tz"]     = tables["airports_tz"]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5 — Save as tables and as CSV
# MAGIC
# MAGIC * **Tables** go to `workspace.bufferengine.sample_<name>`. Find them in Catalog → workspace → bufferengine.
# MAGIC * **CSV files** go to the Volume folder `exports/samples/`. The samples are small, so we collect each one and
# MAGIC   write a single plain CSV file that Excel opens directly.

# COMMAND ----------

report = []
for name, df in samples.items():
    table = f"{DB}.sample_{name}"
    df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(table)

    saved = spark.table(table)
    csv_path = f"{OUT_DIR}/{name}_sample.csv"
    saved.toPandas().to_csv(csv_path, index=False)

    report.append((name, full_counts[name], saved.count(), len(saved.columns),
                   round(os.path.getsize(csv_path) / 1e6, 2)))

display(spark.createDataFrame(report, ["table", "rows_full", "rows_sample", "columns", "csv_size_mb"]))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6 — Check the samples line up
# MAGIC
# MAGIC Three quick checks that the tables really describe the same aircraft:
# MAGIC 1. Every flight in `aa_clean` is also in `rotations` (matched on `flight_id`).
# MAGIC 2. Every ground stop in `rotation_turns` has its flight IDs in `rotations`.
# MAGIC 3. Every row of `mtt_sensitivity` matches a row of `rotation_turns`.

# COMMAND ----------

s = {name: spark.table(f"{DB}.sample_{name}") for name in samples}

flights_missing = s["aa_clean"].join(s["rotations"], on="flight_id", how="left_anti").count()
turns_missing   = (s["rotation_turns"]
                   .join(s["rotations"].select(F.col("flight_id").alias("inbound_flight_id")),
                         on="inbound_flight_id", how="left_anti").count())
sens_missing    = s["mtt_sensitivity"].join(s["rotation_turns"].select("turn_id"), on="turn_id", how="left_anti").count()

print(f"aa_clean flights not found in rotations : {flights_missing}")
print(f"turns whose inbound flight is missing   : {turns_missing}")
print(f"sensitivity rows without a turn         : {sens_missing}")
assert flights_missing == 0 and turns_missing == 0 and sens_missing == 0, "Samples do not line up"
print("\nOK: the sample tables are consistent with each other.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7 — Look at the files
# MAGIC
# MAGIC Download any CSV from Catalog → workspace → default → Volumes → bufferengine → exports → samples, or open a
# MAGIC table from Catalog → workspace → bufferengine. A quick preview of one table:

# COMMAND ----------

display(s["rotation_turns"].orderBy("tail_number", "outbound_sched_dep_local").limit(20))
