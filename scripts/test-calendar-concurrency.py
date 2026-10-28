#!/usr/bin/env python3
"""Run committing pgTAP tests only in this project's local Supabase container.

Uses Python's standard library and the image's psql/timeout: no npm install,
host psql, passwords, remote URL, or network authentication configuration.
Run after `supabase db reset` and `supabase test db`; CI does the same.
"""

from pathlib import Path
import re
import subprocess
import uuid


ROOT = Path(__file__).resolve().parents[1]
project = re.search(r'^project_id = "([a-zA-Z0-9_-]+)"$',
                    (ROOT / "supabase/config.toml").read_text(), re.MULTILINE)
if project is None:
    raise SystemExit("Missing local Supabase project_id")
CONTAINER = "supabase_db_" + project[1]
PSQL = ["docker", "exec", "-i", CONTAINER, "timeout", "90", "psql",
        "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"]
UNIT = "ee301002-0000-4000-8000-000000000001"
run_id = "sd301_" + uuid.uuid4().hex


def sql(query):
    result = subprocess.run(PSQL, input=query, text=True, capture_output=True, timeout=100)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


had_dblink = sql("select exists(select 1 from pg_extension where extname='dblink');").strip() == "t"
had_pgtap = sql("select exists(select 1 from pg_extension where extname='pgtap');").strip() == "t"
try:
    sql("create extension if not exists pgtap with schema extensions;")
    source = (ROOT / "supabase/tests-concurrency/0014_calendar_blocks_concurrency.test.sql").read_text()
    source = source.replace("sd301_concurrency_a", run_id + "_a").replace("sd301_concurrency_b", run_id + "_b")
    output = sql(source)
    print(output, end="")
    # psql exits zero for failed TAP assertions. Require the exact complete plan,
    # sequential successful assertions, and no skips, TODOs or bailout.
    plans = re.findall(r"^1\.\.(\d+)$", output, re.MULTILINE)
    numbers = [int(n) for n in re.findall(r"^ok (\d+)(?:\s|$)", output, re.MULTILINE)]
    if (len(plans) != 1 or numbers != list(range(1, int(plans[0]) + 1))
            or re.search(r"^(?:not ok|Bail out!)|#\s*(?:SKIP|TODO)\b", output, re.MULTILINE | re.IGNORECASE)):
        raise RuntimeError("Incomplete or failing concurrency TAP output")
    print(f"PASS: {plans[0]} concurrency assertions")
finally:
    # Covers SQL errors/timeouts as well as TAP failures. Only terminate workers
    # tagged with this invocation's random id, never another developer's sessions.
    sql(f"""
      select pg_terminate_backend(pid) from pg_stat_activity
      where application_name in ('{run_id}_a', '{run_id}_b');
      set lock_timeout = '5s';
      delete from public.units where id = '{UNIT}';
    """)
    if not had_dblink:
        sql("drop extension if exists dblink;")
    if not had_pgtap:
        sql("drop extension if exists pgtap;")
    if sql(f"select count(*) from public.calendar_blocks where unit_id = '{UNIT}';").strip() != "0":
        raise RuntimeError("Concurrency fixture cleanup failed")
