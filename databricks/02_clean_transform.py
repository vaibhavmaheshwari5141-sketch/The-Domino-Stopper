# Databricks notebook source
# MAGIC %md
# MAGIC # Notebook 2 — Clean and transform
# MAGIC
# MAGIC **Project:** Buffer Delay Allocation Engine (ANCP, Team T19)
# MAGIC
# MAGIC ## What this notebook does
# MAGIC
# MAGIC Notebook 1 brought the raw flights in. This notebook makes them **analysis-ready** without deleting or changing
# MAGIC a single original value. Problems are marked with flag columns instead, so anyone can see what was found and
# MAGIC decide for themselves what to exclude.
# MAGIC
# MAGIC | Step | What happens |
# MAGIC |---|---|
# MAGIC | 1 | Settings |
# MAGIC | 2 | Load the flights and attach each airport's time zone |
# MAGIC | 3 | Convert scheduled times from local clock time to UTC |
# MAGIC | 4 | Give every flight a unique ID |
# MAGIC | 5 | Mark values that are empty *by design* (structural nulls) |
# MAGIC | 6 | Mark data-quality issues (missing aircraft, extreme delays, conflicts, duplicates, outliers) |
# MAGIC | 7 | Label each flight train / validate / test, by date |
# MAGIC | 8 | Add a capped arrival-delay column for modelling |
# MAGIC | 9 | Save the cleaned table |
# MAGIC | 10 | Prove the result matches our published dataset `aa_clean_v1.0` exactly |
# MAGIC | 11 | Data-quality summary |
# MAGIC | 12 | **Export cleaned data to CSV for any date range you choose** |
# MAGIC
# MAGIC **Input:** `workspace.bufferengine.bronze_aa_flights` and `workspace.bufferengine.ref_airports_tz` (from Notebook 1)
# MAGIC
# MAGIC **Output:** table `workspace.bufferengine.silver_aa_clean` (1,641,071 rows, 59 columns) and CSV files in the
# MAGIC Volume's `exports` folder.
# MAGIC
# MAGIC ## Before you run
# MAGIC 1. Run **Notebook 1** first.
# MAGIC 2. Attach to **Serverless** compute and press **Run all**. It takes a few minutes.
# MAGIC 3. To export a different period to CSV, change the two boxes at the top of the notebook and re-run Step 12 only.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1 — Settings
# MAGIC
# MAGIC The two boxes at the top of the notebook control the **CSV export** in Step 12. Everything else is fixed.

# COMMAND ----------

import os

from pyspark.sql import Window
from pyspark.sql import functions as F

VOLUME = "/Volumes/workspace/default/bufferengine"
DB = "workspace.bufferengine"

BRONZE_TABLE = f"{DB}.bronze_aa_flights"
AIRPORTS_TABLE = f"{DB}.ref_airports_tz"
SILVER_TABLE = f"{DB}.silver_aa_clean"
REFERENCE_CLEAN = f"{VOLUME}/processed/aa_clean_v1.0.parquet"   # our published dataset, for the cross-check
EXPORT_DIR = f"{VOLUME}/exports"

EXPECTED_ROWS = 1_641_071

# Period labels, by flight date. The model learns on train, is tuned on validate, and is judged on test.
TRAIN_END = "2025-09-30"
VALIDATE_END = "2025-12-31"

# Thresholds for the data-quality flags (all in minutes unless stated).
EXTREME_DELAY_MIN = 1440          # more than 24 hours late
TAXI_EXTREME_MIN = 180            # taxiing for more than 3 hours
ELAPSED_DIFF_EXTREME_MIN = 180    # flight took 3+ hours more or less than planned
EARLY_DEP_MIN = -60               # left more than an hour early
DISTANCE_MAX_MI = 5000            # miles; no AA domestic route is longer
CAP_QUANTILES = (0.005, 0.995)    # capped delay column: pull in the most extreme 0.5% at each end

# The CSV export period. Change these boxes at the top of the notebook, then re-run Step 12.
dbutils.widgets.text("export_start", "2026-01-01", "1. Export from (YYYY-MM-DD)")
dbutils.widgets.text("export_end", "2026-01-31", "2. Export to (YYYY-MM-DD)")

spark.conf.set("spark.sql.session.timeZone", "UTC")   # all timestamps in UTC

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2 — Load the flights and attach time zones
# MAGIC
# MAGIC Each flight gets two extra columns: the time zone of the airport it leaves from and of the airport it lands at.

# COMMAND ----------

bronze = spark.table(BRONZE_TABLE)
tz = spark.table(AIRPORTS_TABLE).select("iata", "timezone")

df = (bronze
      .join(F.broadcast(tz.withColumnRenamed("iata", "Origin").withColumnRenamed("timezone", "origin_tz")),
            "Origin", "left")
      .join(F.broadcast(tz.withColumnRenamed("iata", "Dest").withColumnRenamed("timezone", "dest_tz")),
            "Dest", "left"))

n_base = bronze.count()
no_tz = df.filter(F.col("origin_tz").isNull() | F.col("dest_tz").isNull()).count()
print(f"Flights loaded: {n_base:,}")
print(f"Flights with an airport missing its time zone: {no_tz}")
assert no_tz == 0

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3 — Convert scheduled times to UTC
# MAGIC
# MAGIC BTS gives times as local clock times, like `0705` in Dallas. To compare flights at different airports, and to
# MAGIC measure how long an aircraft sits on the ground between flights, we need a single clock: UTC.
# MAGIC
# MAGIC Three details make this harder than it looks:
# MAGIC
# MAGIC 1. **BTS does not say which day a flight arrives.** A red-eye leaving Los Angeles at 23:00 lands in New York the
# MAGIC    next morning. We assume the arrival is on the departure date; if that puts it *before* departure in UTC, we
# MAGIC    move it forward one day (and check a second time, for very long flights).
# MAGIC 2. **Clocks go back in November.** 01:30 happens twice that night. We take the first one (daylight time),
# MAGIC    the same rule our local pipeline uses.
# MAGIC 3. **Clocks go forward in March.** 02:30 never happens that night. Spark's default moves such a time forward by
# MAGIC    the full hour (to 03:30); our local pipeline moves it to the first valid moment (03:00). The function below
# MAGIC    corrects for this so both give the same answer. (US clock changes are always one hour, at 02:00.)

# COMMAND ----------

def local_to_utc(local_ts, tz_col):
    """Convert a local clock time at an airport into UTC, matching the local pipeline's daylight-saving rules."""
    utc = F.to_utc_timestamp(local_ts, F.col(tz_col))
    round_trip = F.from_utc_timestamp(utc, F.col(tz_col))
    # If converting back does not give the same clock time, the time fell in the spring-forward gap.
    # Use the first valid moment after the gap instead (e.g. 02:30 -> 03:00).
    in_gap = round_trip != local_ts
    return F.when(in_gap, F.to_utc_timestamp(F.date_trunc("hour", round_trip), F.col(tz_col))).otherwise(utc)


def at_minutes(date_col, minutes_col, extra_days=0):
    """A local timestamp: the given date, plus some days, plus some minutes after midnight."""
    seconds = F.unix_timestamp(F.to_timestamp(date_col)) + (F.col(minutes_col) + extra_days * 1440) * 60
    return F.timestamp_seconds(seconds)


# Departure: flight date + scheduled departure minutes, converted at the origin airport.
df = df.withColumn("crs_dep_utc", local_to_utc(at_minutes("FlightDate", "crs_dep_min"), "origin_tz"))

# Arrival: first assume the same day; if that lands before departure, try the next day, then the day after.
df = df.withColumn("_arr0", local_to_utc(at_minutes("FlightDate", "crs_arr_min"), "dest_tz"))
df = df.withColumn("_off1", F.when(F.col("_arr0") < F.col("crs_dep_utc"), 1).otherwise(0))
df = df.withColumn("_arr1", F.when(F.col("_off1") == 1,
                                   local_to_utc(at_minutes("FlightDate", "crs_arr_min", 1), "dest_tz"))
                             .otherwise(F.col("_arr0")))
df = df.withColumn("_off2", F.when(F.col("_arr1") < F.col("crs_dep_utc"), F.col("_off1") + 1).otherwise(F.col("_off1")))
df = df.withColumn("crs_arr_utc", F.when(F.col("_off2") == 2,
                                         local_to_utc(at_minutes("FlightDate", "crs_arr_min", 2), "dest_tz"))
                                   .otherwise(F.col("_arr1")))

# Planned flight time as implied by the UTC times; used in Step 6 to check against BTS's own figure.
df = df.withColumn("_block_min_utc",
                   (F.unix_timestamp("crs_arr_utc") - F.unix_timestamp("crs_dep_utc")) / 60)

display(df.filter(F.col("_off2") > 0)
          .select("FlightDate", "Origin", "Dest", "CRSDepTime", "CRSArrTime", "crs_dep_utc", "crs_arr_utc")
          .limit(5))
print("Above: examples of overnight flights, whose arrival was moved to the next day.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4 — A unique ID for every flight
# MAGIC
# MAGIC `flight_id` combines date, flight number, origin, destination and scheduled departure, for example
# MAGIC `20250101-1234-DFW-ORD-0705`. It lets later tables join back to this one safely.

# COMMAND ----------

df = df.withColumn("flight_id", F.concat_ws("-",
    F.date_format("FlightDate", "yyyyMMdd"),
    F.col("Flight_Number_Reporting_Airline").cast("string"),
    F.col("Origin"), F.col("Dest"),
    F.lpad(F.col("CRSDepTime").cast("string"), 4, "0")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5 — Structural nulls: empty by design, not missing
# MAGIC
# MAGIC Most empty values in this data mean *the event never happened*:
# MAGIC * a **cancelled** flight has no departure, arrival or delay;
# MAGIC * a **diverted** flight has no arrival at its planned destination;
# MAGIC * the five **delay-cause** columns are filled in by BTS only for flights 15 or more minutes late.
# MAGIC
# MAGIC Filling these in would invent events: a zero in `CarrierDelay` for an on-time flight claims a measurement that
# MAGIC was never taken. So we **leave them empty and flag them**.

# COMMAND ----------

cancelled = F.col("Cancelled") == 1
diverted = F.col("Diverted") == 1

df = (df
      .withColumn("is_operated", ~(cancelled | diverted))
      .withColumn("struct_null_cancelled", cancelled)
      .withColumn("struct_null_diverted", diverted & ~cancelled)
      .withColumn("struct_null_delay_cause",
                  ~(F.col("is_operated") & F.coalesce(F.col("ArrDelay") >= 15, F.lit(False)))))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6 — Data-quality flags
# MAGIC
# MAGIC Each flag marks rows worth a second look. **Nothing is deleted.**
# MAGIC
# MAGIC | Flag | Marks a flight when... |
# MAGIC |---|---|
# MAGIC | `dq_missing_tail` | we do not know which aircraft flew |
# MAGIC | `dq_extreme_delay_24h` | it left or arrived more than 24 hours late (real events, kept) |
# MAGIC | `dq_time_conflict` | its recorded times disagree with each other |
# MAGIC | `dq_duplicate_key` | another row describes the same flight |
# MAGIC | `dq_outlier_other` | it has an unusual but possible value (very long taxi, very early departure, odd duration) |

# COMMAND ----------

def flag(condition):
    """Turn a condition into a clean true/false flag. A comparison with an empty value counts as false."""
    return F.coalesce(condition, F.lit(False))


# Time conflicts: five separate checks, combined into one flag.
time_checks = {
    "UTC flight time differs from BTS planned flight time":
        flag(F.abs(F.col("_block_min_utc") - F.col("CRSElapsedTime")) >= 0.5),
    "Airborne time longer than total flight time":
        flag(F.col("AirTime") > F.col("ActualElapsedTime")),
    "15-minute late flag disagrees with the delay":
        F.col("ArrDel15").isNotNull() & F.col("ArrDelay").isNotNull()
        & (F.col("ArrDel15") != (F.col("ArrDelay") >= 15).cast("int")),
    "Flight operated but has no arrival delay":
        F.col("is_operated") & F.col("ArrDelay").isNull(),
    "Cancelled flight has an arrival time":
        cancelled & F.col("ArrTime").isNotNull(),
}

# Other outliers: unusual but physically possible.
outlier_checks = {
    f"Taxiing over {TAXI_EXTREME_MIN} minutes":
        flag((F.col("TaxiOut") > TAXI_EXTREME_MIN) | (F.col("TaxiIn") > TAXI_EXTREME_MIN)),
    f"Left more than {abs(EARLY_DEP_MIN)} minutes early":
        flag(F.col("DepDelay") < EARLY_DEP_MIN),
    f"Flight time off plan by over {ELAPSED_DIFF_EXTREME_MIN} minutes":
        flag(F.abs(F.col("ActualElapsedTime") - F.col("CRSElapsedTime")) > ELAPSED_DIFF_EXTREME_MIN),
    f"Distance zero, negative or over {DISTANCE_MAX_MI} miles":
        flag((F.col("Distance") <= 0) | (F.col("Distance") > DISTANCE_MAX_MI)),
}

duplicate_key = ["FlightDate", "Flight_Number_Reporting_Airline", "Origin", "Dest", "CRSDepTime"]


def any_of(conditions):
    out = F.lit(False)
    for c in conditions:
        out = out | c
    return out


df = (df
      .withColumn("dq_missing_tail", F.col("Tail_Number").isNull())
      .withColumn("dq_extreme_delay_24h",
                  flag((F.col("DepDelay") > EXTREME_DELAY_MIN) | (F.col("ArrDelay") > EXTREME_DELAY_MIN)))
      .withColumn("dq_time_conflict", any_of(time_checks.values()))
      .withColumn("dq_duplicate_key", F.count("*").over(Window.partitionBy(*duplicate_key)) > 1)
      .withColumn("dq_outlier_other", any_of(outlier_checks.values())))

# How many flights each individual check caught.
check_counts = df.agg(*[F.sum(c.cast("int")).alias(name)
                        for name, c in {**time_checks, **outlier_checks}.items()]).first().asDict()
display(spark.createDataFrame([(k, int(v)) for k, v in check_counts.items()], "check string, flights long"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7 — Train, validate and test periods
# MAGIC
# MAGIC Split **by date**, never at random. A model must always be judged on a period *later* than the one it learned
# MAGIC from, just as it would be used in real life.
# MAGIC
# MAGIC | Period | Dates |
# MAGIC |---|---|
# MAGIC | train | 1 Jan 2025 to 30 Sep 2025 |
# MAGIC | validate | 1 Oct 2025 to 31 Dec 2025 |
# MAGIC | test | 1 Jan 2026 to 31 Aug 2026 |

# COMMAND ----------

df = df.withColumn("split",
    F.when(F.col("FlightDate") <= F.lit(TRAIN_END).cast("date"), "train")
     .when(F.col("FlightDate") <= F.lit(VALIDATE_END).cast("date"), "validate")
     .otherwise("test"))

display(df.groupBy("split").agg(F.count("*").alias("flights"),
                                F.min("FlightDate").alias("from"), F.max("FlightDate").alias("to"))
          .orderBy("from"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8 — Capped arrival delay, for modelling
# MAGIC
# MAGIC A few flights are many hours late. Those are real and stay in `ArrDelay` untouched. Some models, though, are
# MAGIC thrown off by a handful of huge values, so we add a **separate** column where the most extreme 0.5% at each end
# MAGIC is pulled in to a limit.
# MAGIC
# MAGIC The limits are worked out from the **train period only**. Using later data to set them would leak information
# MAGIC about the test period into the model.

# COMMAND ----------

train_operated = df.filter((F.col("split") == "train") & F.col("is_operated") & F.col("ArrDelay").isNotNull())
cap_low, cap_high = train_operated.select(
    F.percentile("ArrDelay", F.lit(CAP_QUANTILES[0])),
    F.percentile("ArrDelay", F.lit(CAP_QUANTILES[1]))).first()
print(f"Capping limits from train-period flights: {cap_low} to {cap_high} minutes")

df = df.withColumn("arr_delay_min_capped",
                   F.when(F.col("ArrDelay").isNull(), F.lit(None).cast("double"))
                    .otherwise(F.least(F.greatest(F.col("ArrDelay"), F.lit(cap_low)), F.lit(cap_high))))

n_capped = df.filter((F.col("ArrDelay") < cap_low) | (F.col("ArrDelay") > cap_high)).count()
print(f"Flights whose delay is capped in the new column: {n_capped:,}  (ArrDelay itself is unchanged)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 9 — Save the cleaned table
# MAGIC
# MAGIC The final table keeps the 45 columns from Notebook 1 exactly as they were, and adds 14 new ones.

# COMMAND ----------

NEW_COLUMNS = [
    "flight_id", "is_operated", "struct_null_cancelled", "struct_null_diverted", "struct_null_delay_cause",
    "dq_missing_tail", "dq_extreme_delay_24h", "dq_time_conflict", "dq_duplicate_key", "dq_outlier_other",
    "crs_dep_utc", "crs_arr_utc", "split", "arr_delay_min_capped",
]
silver = df.select(*bronze.columns, *NEW_COLUMNS)

silver.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(SILVER_TABLE)

saved = spark.table(SILVER_TABLE)
n_saved = saved.count()
print(f"Saved {SILVER_TABLE}: {n_saved:,} rows x {len(saved.columns)} columns")
assert n_saved == EXPECTED_ROWS == n_base, "Rows were added or lost during cleaning"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 10 — Does this match our published dataset exactly?
# MAGIC
# MAGIC The cleaned dataset `aa_clean_v1.0` was first produced locally and published with a checksum (tag `data-v1.0`).
# MAGIC Here we compare it with the Databricks result **row by row, across all 59 columns**. Zero differing rows in both
# MAGIC directions means the Databricks pipeline reproduces the published dataset exactly.
# MAGIC
# MAGIC This step is skipped if `aa_clean_v1.0.parquet` has not been uploaded to `processed/` in the Volume.

# COMMAND ----------

if os.path.exists(REFERENCE_CLEAN):
    ours = spark.table(SILVER_TABLE)
    published = spark.read.parquet(REFERENCE_CLEAN)
    published = published.select(*[F.col(c).cast(t) for c, t in ours.dtypes])   # compare values, not storage types

    only_ours = ours.exceptAll(published).count()
    only_published = published.exceptAll(ours).count()
    print(f"Rows only in Databricks        : {only_ours}")
    print(f"Rows only in published dataset : {only_published}")

    if only_ours or only_published:
        # Show which columns differ, to make any mismatch easy to investigate.
        j = ours.alias("a").join(published.alias("b"), "flight_id")
        diffs = j.agg(*[F.sum((~F.col(f"a.{c}").eqNullSafe(F.col(f"b.{c}"))).cast("int")).alias(c)
                        for c in ours.columns if c != "flight_id"]).first().asDict()
        print("Columns with differences:", {k: v for k, v in diffs.items() if v})
        raise AssertionError("Databricks result differs from the published dataset")
    print("\nIdentical: Databricks reproduces the published dataset aa_clean_v1.0 exactly.")
else:
    print(f"Skipped: {REFERENCE_CLEAN} not found.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 11 — Data-quality summary
# MAGIC
# MAGIC How many flights each flag marks. These are the same figures reported in the D2 audit report.

# COMMAND ----------

flags = ["struct_null_cancelled", "struct_null_diverted", "struct_null_delay_cause", "dq_missing_tail",
         "dq_extreme_delay_24h", "dq_time_conflict", "dq_duplicate_key", "dq_outlier_other"]
row = saved.agg(*[F.sum(F.col(c).cast("int")).alias(c) for c in flags]).first()
summary = spark.createDataFrame(
    [(c, int(row[c]), round(100 * row[c] / n_saved, 4)) for c in flags],
    "flag string, flights long, pct_of_all_flights double")
display(summary)

# Late-arrival rate and cancellations by month: a quick sense check of the cleaned data.
display(saved.groupBy(F.date_format("FlightDate", "yyyy-MM").alias("month"), "split")
             .agg(F.count("*").alias("flights"),
                  F.round(100 * F.avg(F.col("struct_null_cancelled").cast("int")), 2).alias("pct_cancelled"),
                  F.round(100 * F.avg("ArrDel15"), 1).alias("pct_arriving_late"))
             .orderBy("month"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 12 — Export cleaned data to CSV
# MAGIC
# MAGIC **To export a different period:** change *Export from* and *Export to* in the boxes at the top of the notebook,
# MAGIC then run **this cell only**.
# MAGIC
# MAGIC The file is written to the Volume's `exports` folder. To download it: **Catalog → workspace → default →
# MAGIC bufferengine → exports**, click the file, then **Download**.
# MAGIC
# MAGIC Notes:
# MAGIC * One month is about 70,000 to 90,000 flights (roughly 30 MB).
# MAGIC * Excel opens at most **1,048,576 rows**. The cell warns you if the period is larger than that.
# MAGIC * Empty cells in the CSV are the structural nulls from Step 5. They are not errors.

# COMMAND ----------

from datetime import date

start = date.fromisoformat(dbutils.widgets.get("export_start").strip())
end = date.fromisoformat(dbutils.widgets.get("export_end").strip())
assert start <= end, "'Export from' must be on or before 'Export to'"

export = (spark.table(SILVER_TABLE)
          .filter(F.col("FlightDate").between(F.lit(start.isoformat()).cast("date"), F.lit(end.isoformat()).cast("date")))
          .orderBy("FlightDate", "crs_dep_utc", "flight_id"))
n_rows = export.count()
print(f"Period {start} to {end}: {n_rows:,} flights")
assert n_rows > 0, "No flights in this period. The data covers 2025-01-01 to 2026-08-31."
if n_rows > 1_048_576:
    print("WARNING: more rows than Excel can open. The file will still be complete, but Excel will cut it off.")

# Spark writes a folder of part files; we write a single part, then move it to a clear file name.
file_name = f"aa_clean_{start.isoformat()}_to_{end.isoformat()}.csv"
staging = f"{EXPORT_DIR}/_staging_{start.isoformat()}_{end.isoformat()}"
(export.coalesce(1).write.mode("overwrite")
       .option("header", "true")
       .option("dateFormat", "yyyy-MM-dd")
       .option("timestampFormat", "yyyy-MM-dd HH:mm:ss")
       .csv(staging))

part = [f.path for f in dbutils.fs.ls(staging) if f.name.startswith("part-") and f.name.endswith(".csv")][0]
dbutils.fs.mv(part, f"{EXPORT_DIR}/{file_name}")
dbutils.fs.rm(staging, True)

size_mb = os.path.getsize(f"{EXPORT_DIR}/{file_name}") / 1e6
print(f"Written: {EXPORT_DIR}/{file_name}  ({size_mb:.1f} MB)")
display(export.limit(10))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done
# MAGIC
# MAGIC * `silver_aa_clean` holds all 1,641,071 flights, cleaned and flagged, identical to the published `aa_clean_v1.0`.
# MAGIC * The CSV for your chosen period is in the Volume's `exports` folder.
# MAGIC
# MAGIC Nothing was deleted at any point. Every problem is a flag, so the choice of what to exclude stays with the analysis.
