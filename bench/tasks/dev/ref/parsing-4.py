import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
import datetime
d = datetime.date.fromisoformat(sys.stdin.read().strip())
print(d.timetuple().tm_yday if VARIANT else d.isoweekday())
