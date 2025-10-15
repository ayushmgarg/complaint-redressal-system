# check_buckets.py
from dotenv import load_dotenv
load_dotenv()
import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("Set SUPABASE_URL and SUPABASE_KEY in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

try:
    res = supabase.storage.list_buckets()
    # different supabase versions return different shapes:
    buckets = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None) or res
    print("Buckets in project:")
    for b in buckets:
        # each b typically has 'name'
        name = b.get("name") if isinstance(b, dict) else getattr(b, "name", str(b))
        print(" -", name)
except Exception as e:
    print("Failed to list buckets:", e)
