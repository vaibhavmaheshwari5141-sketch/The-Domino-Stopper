# Databricks notebook source
# MAGIC %md
# MAGIC # Notebook 1 — Import raw BTS flight data
# MAGIC
# MAGIC **Project:** Buffer Delay Allocation Engine (ANCP, Team T19)
# MAGIC
# MAGIC ## What this notebook does
# MAGIC
# MAGIC The US Bureau of Transportation Statistics (BTS) publishes one zip file per month with every domestic flight
# MAGIC flown by every large US airline. This notebook turns those raw files into one clean, typed table of
# MAGIC **American Airlines** flights that the next notebook can work with.
# MAGIC
# MAGIC | Step | What happens |
# MAGIC |---|---|
# MAGIC | 1 | Settings and table names |
# MAGIC | 2 | Check that all 20 monthly zip files are in the Volume |
# MAGIC | 3 | Define the 43 columns we keep and the data type of each |
# MAGIC | 4 | For each month: unzip, read, keep American Airlines, convert types, save |
# MAGIC | 5 | Check the row counts add up |
# MAGIC | 6 | Load the airport time-zone reference table |
# MAGIC | 7 | Prove the result matches our local pipeline exactly |
# MAGIC | 8 | First look at the data |
# MAGIC
# MAGIC **Input:** `/Volumes/workspace/default/bufferengine/raw/bts_ontime_YYYY_MM.zip` (20 files, Jan 2025 to Aug 2026)
# MAGIC
# MAGIC **Output:** table `workspace.bufferengine.bronze_aa_flights` (1,641,071 rows) and `workspace.bufferengine.ref_airports_tz`
# MAGIC
# MAGIC ## Before you run
# MAGIC 1. Attach to **Serverless** compute (the *Connect* menu, top right).
# MAGIC 2. Make sure the 20 zip files are in the `raw` folder of the Volume.
# MAGIC 3. Press **Run all**. A full run takes roughly 10 to 15 minutes.
# MAGIC
# MAGIC > **The golden rule:** we only *filter to American Airlines* here. No other row is removed and no value is changed
# MAGIC > apart from converting text to the right data type. Any value that fails to convert is counted and reported.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1 — Settings
# MAGIC
# MAGIC Everything that might change lives in this one cell, so the rest of the notebook never needs editing.

# COMMAND ----------

import os
import re
import shutil
import zipfile

from pyspark.sql import functions as F

# Where the files live (a Unity Catalog Volume) and where the tables go (catalog.schema).
VOLUME = "/Volumes/workspace/default/bufferengine"
DB = "workspace.bufferengine"

RAW_DIR = f"{VOLUME}/raw"                  # the 20 monthly zip files
TMP_DIR = f"{VOLUME}/_tmp_extract"         # scratch space: one month is unzipped here at a time, then deleted
REFERENCE_CSV = f"{VOLUME}/reference/airports_tz.csv"
LOCAL_BASE_PARQUET = f"{VOLUME}/interim/aa_base_2025_2026.parquet"   # output of our local pipeline, for the cross-check

BRONZE_TABLE = f"{DB}.bronze_aa_flights"
AIRPORTS_TABLE = f"{DB}.ref_airports_tz"

CARRIER = "AA"                       # American Airlines
EXPECTED_ALL_CARRIER_ROWS = 11_730_351
EXPECTED_AA_ROWS = 1_641_071

# All times are handled in UTC. Without this, Spark would display times in the workspace's own time zone.
spark.conf.set("spark.sql.session.timeZone", "UTC")

# Create our own schema so our tables are not mixed in with tutorial tables in `default`.
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {DB}")
print(f"Tables will be written to: {DB}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2 — Check the raw files are present
# MAGIC
# MAGIC We expect exactly 20 files named `bts_ontime_YYYY_MM.zip`. If any are missing, we stop here rather than build
# MAGIC an incomplete table.

# COMMAND ----------

zip_files = sorted(f for f in os.listdir(RAW_DIR) if re.fullmatch(r"bts_ontime_\d{4}_\d{2}\.zip", f))

print(f"Found {len(zip_files)} monthly files:")
for f in zip_files:
    size_mb = os.path.getsize(f"{RAW_DIR}/{f}") / 1e6
    print(f"  {f}   {size_mb:5.1f} MB")

assert len(zip_files) == 20, f"Expected 20 monthly files, found {len(zip_files)}. Upload the missing months first."

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3 — The columns we keep, and their types
# MAGIC
# MAGIC Each BTS file has 109 columns. We keep the **43** we need for scheduling, building aircraft chains and measuring
# MAGIC delay. Keeping only what we need is also good data practice: we do not hold data we have no use for.
# MAGIC
# MAGIC BTS writes every value as text, so each column is converted to its proper type. We use `try_cast`, which returns
# MAGIC an empty value instead of crashing when a value cannot be converted. Those failures are **counted**, not hidden.

# COMMAND ----------

# Column name -> Spark data type, in the order they appear in the output table.
BASE_COLUMNS = {
    # When the flight was scheduled
    "Year": "smallint", "Quarter": "tinyint", "Month": "tinyint", "DayofMonth": "tinyint",
    "DayOfWeek": "tinyint", "FlightDate": "date",
    # Who flew it, and which aircraft
    "Reporting_Airline": "string", "Tail_Number": "string", "Flight_Number_Reporting_Airline": "int",
    # Where from
    "OriginAirportID": "int", "Origin": "string", "OriginCityName": "string", "OriginState": "string",
    # Where to
    "DestAirportID": "int", "Dest": "string", "DestCityName": "string", "DestState": "string",
    # Departure: planned time, actual time, delay
    "CRSDepTime": "smallint", "DepTime": "smallint", "DepDelay": "double", "DepDel15": "tinyint",
    "DepTimeBlk": "string", "TaxiOut": "double", "WheelsOff": "smallint",
    # Arrival: planned time, actual time, delay
    "WheelsOn": "smallint", "TaxiIn": "double", "CRSArrTime": "smallint", "ArrTime": "smallint",
    "ArrDelay": "double", "ArrDelayMinutes": "double", "ArrDel15": "tinyint",
    # Cancellations and diversions
    "Cancelled": "tinyint", "CancellationCode": "string", "Diverted": "tinyint",
    # Flight length
    "CRSElapsedTime": "double", "ActualElapsedTime": "double", "AirTime": "double", "Distance": "double",
    # Why the flight was late (filled in by BTS only for flights 15+ minutes late)
    "CarrierDelay": "double", "WeatherDelay": "double", "NASDelay": "double",
    "SecurityDelay": "double", "LateAircraftDelay": "double",
}
print(f"Keeping {len(BASE_COLUMNS)} columns")


def cast_expr(col, typ):
    """Spark SQL that turns one raw text column into its proper type. Blank text becomes an empty value (null)."""
    raw = f"nullif(trim(`{col}`), '')"
    if col == "Tail_Number":
        # Aircraft registration: tidy it so the same aircraft always matches itself (e.g. ' n123aa' -> 'N123AA').
        return F.expr(f"nullif(upper(trim(`{col}`)), '')").alias(col)
    if typ == "string":
        return F.expr(raw).alias(col)
    if typ in ("date", "double"):
        return F.expr(f"try_cast({raw} as {typ})").alias(col)
    # Whole-number columns: BTS writes some of them as '1.00', so convert to a decimal number first.
    return F.expr(f"try_cast(try_cast({raw} as double) as {typ})").alias(col)


def hhmm_to_minutes(col):
    """Convert a time written as hhmm (e.g. 705 = 07:05) into minutes after midnight (425).

    2400 means midnight at the END of the day, so it becomes 1440 and sorts after 23:59. Impossible values become null.
    """
    c = F.col(col)
    hours, mins = F.expr(f"`{col}` div 100"), c % 100
    invalid = c.isNull() | (c < 0) | (mins >= 60) | ((hours >= 24) & (c != 2400))
    return F.when(invalid, F.lit(None)).otherwise(hours * 60 + mins).cast("smallint")


def failed_cast_counter(col, typ):
    """Counts AA rows where a value was present in the raw text but could not be converted."""
    if typ == "string":
        return None
    target = "date" if typ == "date" else "double"
    failed = F.expr(f"nullif(trim(`{col}`), '') is not null and try_cast(trim(`{col}`) as {target}) is null")
    return F.sum(F.when(F.col("_is_aa") & failed, 1).otherwise(0)).alias(col)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4 — Import each month
# MAGIC
# MAGIC For each of the 20 months we:
# MAGIC 1. **Unzip** the file into a scratch folder (Spark cannot read inside a zip file directly).
# MAGIC 2. **Read** the CSV with every column as text, so nothing is silently misread on the way in.
# MAGIC 3. **Count** all rows, the American Airlines rows, and any values that fail to convert, in one pass.
# MAGIC 4. **Keep** American Airlines rows and our 43 columns, convert the types, and add two helper columns.
# MAGIC 5. **Append** the month to the bronze table, then delete the unzipped file to save storage.
# MAGIC
# MAGIC Working one month at a time keeps storage low: an unzipped month is about 240 MB.

# COMMAND ----------

spark.sql(f"DROP TABLE IF EXISTS {BRONZE_TABLE}")    # start clean, so running the notebook twice gives the same result
os.makedirs(TMP_DIR, exist_ok=True)

import_log = []

for i, zip_name in enumerate(zip_files):
    # 1. Unzip this month's CSV into the scratch folder.
    with zipfile.ZipFile(f"{RAW_DIR}/{zip_name}") as zf:
        member = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        csv_path = f"{TMP_DIR}/{zip_name.replace('.zip', '.csv')}"
        with zf.open(member) as src, open(csv_path, "wb") as dst:
            shutil.copyfileobj(src, dst, length=16 * 1024 * 1024)

    # 2. Read the CSV with every column as text.
    raw = spark.read.option("header", "true").option("quote", '"').option("escape", '"').csv(csv_path)
    missing = [c for c in BASE_COLUMNS if c not in raw.columns]
    assert not missing, f"{zip_name}: columns missing from the BTS file: {missing}"
    raw = raw.withColumn("_is_aa", F.trim("Reporting_Airline") == CARRIER)

    # 3. One pass to count everything we want to report.
    counters = [c for c in (failed_cast_counter(col, typ) for col, typ in BASE_COLUMNS.items()) if c is not None]
    stats = raw.agg(F.count("*").alias("_all"), F.sum(F.col("_is_aa").cast("int")).alias("_aa"), *counters).first()
    failures = {c: stats[c] for c in BASE_COLUMNS if BASE_COLUMNS[c] != "string" and stats[c]}

    # 4. Keep American Airlines, keep our 43 columns with proper types, add minutes-after-midnight helpers.
    aa = (raw.filter("_is_aa")
             .select(*[cast_expr(c, t) for c, t in BASE_COLUMNS.items()])
             .withColumn("crs_dep_min", hhmm_to_minutes("CRSDepTime"))
             .withColumn("crs_arr_min", hhmm_to_minutes("CRSArrTime")))

    # 5. Save this month, then remove the unzipped file.
    aa.write.mode("append").saveAsTable(BRONZE_TABLE)
    os.remove(csv_path)

    import_log.append((zip_name, int(stats["_all"]), int(stats["_aa"]), int(sum(failures.values())),
                       "; ".join(f"{k}={v}" for k, v in failures.items())))
    print(f"[{i + 1:2d}/20] {zip_name}: {stats['_all']:>9,} rows, {stats['_aa']:>7,} American Airlines, "
          f"conversion failures: {sum(failures.values())}")

shutil.rmtree(TMP_DIR, ignore_errors=True)
print("Import finished.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5 — Do the numbers add up?
# MAGIC
# MAGIC Three checks:
# MAGIC * The 20 files hold **11,730,351** flights from all airlines.
# MAGIC * Of those, **1,641,071** are American Airlines.
# MAGIC * The table we saved holds exactly that many rows, so nothing was lost while saving.

# COMMAND ----------

log_df = spark.createDataFrame(import_log, "file string, rows_all_airlines long, rows_american long, "
                                           "conversion_failures long, failure_detail string")
display(log_df)

totals = log_df.agg(F.sum("rows_all_airlines").alias("all"), F.sum("rows_american").alias("aa"),
                    F.sum("conversion_failures").alias("fails")).first()
saved = spark.table(BRONZE_TABLE).count()

print(f"All airlines, all months : {totals['all']:>12,}   (expected {EXPECTED_ALL_CARRIER_ROWS:,})")
print(f"American Airlines        : {totals['aa']:>12,}   (expected {EXPECTED_AA_ROWS:,})")
print(f"Rows saved in the table  : {saved:>12,}")
print(f"Values that failed to convert: {totals['fails']}")

assert totals["all"] == EXPECTED_ALL_CARRIER_ROWS, "All-airline row count differs from the expected figure"
assert totals["aa"] == EXPECTED_AA_ROWS, "American Airlines row count differs from the expected figure"
assert saved == totals["aa"], "Rows were lost or duplicated while saving"
print("\nAll counts match.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6 — Airport time-zone reference
# MAGIC
# MAGIC BTS records every time on the **local clock** of the airport. A flight leaving Dallas at 08:00 and one leaving
# MAGIC Phoenix at 08:00 did not leave at the same moment. To compare times across airports, the next notebook converts
# MAGIC everything to UTC, and for that it needs each airport's time zone.
# MAGIC
# MAGIC This small table (137 airports) was built from public airport coordinates; see `docs/fit_gap.md` in the repository.

# COMMAND ----------

airports = (spark.read.option("header", "true").csv(REFERENCE_CSV)
            .select("iata", "name", F.col("lat").cast("double"), F.col("lon").cast("double"),
                    "timezone", "coord_source"))
airports.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(AIRPORTS_TABLE)

# Every airport in the flight data must have a time zone, or its times cannot be converted.
used = (spark.table(BRONZE_TABLE).select(F.col("Origin").alias("iata"))
        .union(spark.table(BRONZE_TABLE).select(F.col("Dest").alias("iata"))).distinct())
unmatched = used.join(spark.table(AIRPORTS_TABLE), "iata", "left_anti").count()

print(f"Airports in the reference table: {spark.table(AIRPORTS_TABLE).count()}")
print(f"Airports used by flights       : {used.count()}")
print(f"Airports with no time zone     : {unmatched}")
assert unmatched == 0, "Some airports have no time zone"
display(spark.table(AIRPORTS_TABLE).orderBy("iata").limit(10))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7 — Does this match our local pipeline exactly?
# MAGIC
# MAGIC The same import was first built locally (in Python with DuckDB) and saved as `aa_base_2025_2026.parquet`.
# MAGIC Here we compare the two **row by row, across all 45 columns**. If both directions show zero differing rows,
# MAGIC the Databricks version and the local version are identical.
# MAGIC
# MAGIC This step is skipped if the local file has not been uploaded to `interim/` in the Volume.

# COMMAND ----------

if os.path.exists(LOCAL_BASE_PARQUET):
    bronze = spark.table(BRONZE_TABLE)
    local = spark.read.parquet(LOCAL_BASE_PARQUET).select(*bronze.columns)
    # Align types so the comparison is about values, not about how each tool stores them.
    local = local.select(*[F.col(c).cast(t) for c, t in bronze.dtypes])

    only_in_databricks = bronze.exceptAll(local).count()
    only_in_local = local.exceptAll(bronze).count()

    print(f"Rows in Databricks table : {bronze.count():,}")
    print(f"Rows in local file       : {local.count():,}")
    print(f"Rows only in Databricks  : {only_in_databricks}")
    print(f"Rows only in local       : {only_in_local}")
    assert only_in_databricks == 0 and only_in_local == 0, "The two versions differ; inspect before continuing"
    print("\nIdentical: the Databricks import reproduces the local pipeline exactly.")
else:
    print(f"Skipped: {LOCAL_BASE_PARQUET} not found.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8 — First look at the data

# COMMAND ----------

bronze = spark.table(BRONZE_TABLE)

# Flights per month, with cancellations and the share arriving 15+ minutes late.
monthly = (bronze.groupBy(F.date_format("FlightDate", "yyyy-MM").alias("month"))
           .agg(F.count("*").alias("flights"),
                F.sum("Cancelled").alias("cancelled"),
                F.round(100 * F.avg("ArrDel15"), 1).alias("pct_arriving_late"))
           .orderBy("month"))
display(monthly)

# COMMAND ----------

# Size of the dataset at a glance.
display(bronze.agg(
    F.count("*").alias("flights"),
    F.countDistinct("Tail_Number").alias("aircraft"),
    F.countDistinct("Origin").alias("origin_airports"),
    F.min("FlightDate").alias("first_date"),
    F.max("FlightDate").alias("last_date"),
))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done
# MAGIC
# MAGIC `bronze_aa_flights` now holds every American Airlines flight from January 2025 to August 2026, typed and checked.
# MAGIC
# MAGIC **Next:** run **Notebook 2 — Clean and transform**.
