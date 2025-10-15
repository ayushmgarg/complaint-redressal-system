# test_upload.py
from dotenv import load_dotenv
load_dotenv()
import os
from supabase import create_client
from uuid import uuid4

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
BUCKET = os.environ.get("COMPLAINT_BUCKET") or "complaint-image"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

data = b"hello supabase storage test"
dest = f"test_uploads/{uuid4().hex}_test.txt"

try:
    print("Uploading to bucket:", BUCKET)
    res = supabase.storage.from_(BUCKET).upload(dest, data)
    print("Upload result:", res)
    # try public URL
    pub = supabase.storage.from_(BUCKET).get_public_url(dest)
    print("Public URL:", pub)
except Exception as e:
    print("Upload failed:", e)
