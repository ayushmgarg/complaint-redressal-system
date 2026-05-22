import os
import random
from uuid import uuid4
from datetime import timedelta, datetime, timezone

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from supabase import create_client
from dotenv import load_dotenv

# ---------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SECRET_KEY   = os.environ.get("SECRET_KEY", "change-this-secret-in-prod")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError("SUPABASE_URL and SUPABASE_KEY must be set as environment variables")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=7)

COMPLAINT_BUCKET = os.environ.get("COMPLAINT_BUCKET", "complaint-images")
WORK_BUCKET      = os.environ.get("WORK_BUCKET", "work-images")

ESCALATION_EMAIL   = os.environ.get("ESCALATION_EMAIL", "grievance@mrcivil.gov.in")
ESCALATION_TWITTER = os.environ.get("ESCALATION_TWITTER_HANDLE", "MrCivilGrievance")

# ---------------------------------------------------------------
# Helpers: File Upload
# ---------------------------------------------------------------

def upload_file_to_supabase(bucket_name: str, dest_path: str, file_bytes: bytes, content_type: str = None) -> str:
    """Upload bytes to Supabase storage and return public URL."""
    try:
        supabase.storage.from_(bucket_name).upload(dest_path, file_bytes)
    except Exception:
        app.logger.exception("Supabase upload failed")
        raise

    try:
        public = supabase.storage.from_(bucket_name).get_public_url(dest_path)
        if isinstance(public, dict):
            return public.get("publicURL") or public.get("public_url") or public.get("publicUrl") or dest_path
        return public
    except Exception:
        app.logger.warning("get_public_url failed; trying signed URL")

    try:
        signed = supabase.storage.from_(bucket_name).create_signed_url(dest_path, 60 * 60 * 24 * 365)
        if isinstance(signed, dict):
            return signed.get("signedURL") or signed.get("signed_url") or signed.get("signedUrl") or dest_path
        return signed
    except Exception:
        app.logger.exception("Failed to create signed URL")
        return dest_path


# ---------------------------------------------------------------
# Helpers: Auth guards
# ---------------------------------------------------------------

def logged_in():
    return "user_id" in session

def is_user():
    return logged_in() and session.get("user_type") == "user"

def is_admin():
    return logged_in() and session.get("user_type") == "admin"

def is_verifier():
    return logged_in() and session.get("user_type") == "verifier"

def is_staff():
    return logged_in() and session.get("user_type") == "staff"

# Keep old names as aliases for backward compat
ensure_user_logged_in     = is_user
ensure_admin_logged_in    = is_admin
ensure_verifier_logged_in = is_verifier
ensure_staff_logged_in    = is_staff

# ---------------------------------------------------------------
# Helpers: Notifications
# ---------------------------------------------------------------

def create_notification(user_id: str, complaint_id: str, message: str):
    """Insert a notification for a user."""
    try:
        supabase.table("notifications").insert({
            "user_id":    user_id,
            "type":       "STATUS_UPDATE",
            "message":    message,
            "payload":    {"complaint_id": complaint_id, "message": message},
            "read":       False,
        }).execute()
    except Exception as e:
        app.logger.error(f"Failed to create notification: {e}")


# ---------------------------------------------------------------
# Helpers: Unique short_id
# ---------------------------------------------------------------

def generate_unique_short_id() -> str:
    """Generate a unique 4-digit string ID not used by any user."""
    for _ in range(100):  # safety limit
        short_id = str(random.randint(1000, 9999))
        try:
            res = supabase.table("users").select("id").eq("short_id", short_id).limit(1).execute()
            if not getattr(res, "data", None):
                return short_id
        except Exception:
            pass
    return str(random.randint(10000, 99999))  # fallback 5-digit


# ---------------------------------------------------------------
# Helpers: Data extraction
# ---------------------------------------------------------------

def _data(res):
    """Extract .data from a Supabase response object or dict."""
    return getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)


# ---------------------------------------------------------------
# Page Routes
# ---------------------------------------------------------------

@app.route("/")
def index():
    if logged_in():
        t = session.get("user_type")
        if t == "admin":    return redirect(url_for("admin_dashboard"))
        if t == "verifier": return redirect(url_for("verifier_dashboard"))
        if t == "staff":    return redirect(url_for("staff_dashboard"))
        return redirect(url_for("user_dashboard"))
    return render_template("login.html")


@app.route("/user")
def user_dashboard():
    if not is_user():
        return redirect(url_for("index"))
    return render_template("user.html")


@app.route("/admin")
def admin_dashboard():
    if not is_admin():
        return redirect(url_for("index"))
    return render_template("admin.html")


@app.route("/verifier")
def verifier_dashboard():
    if not is_verifier():
        return redirect(url_for("index"))
    return render_template("verifier.html")


@app.route("/staff")
def staff_dashboard():
    if not is_staff():
        return redirect(url_for("index"))
    return render_template("staff.html")


# ---------------------------------------------------------------
# API: Who am I?
# ---------------------------------------------------------------

@app.route("/api/me")
def api_me():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    user_id   = session.get("user_id")
    user_type = session.get("user_type")
    email     = session.get("email")

    # Try to get first_name from DB
    first_name = session.get("first_name", "")
    if not first_name:
        try:
            if user_type == "admin":
                r = supabase.table("admins").select("name, last_name").eq("id", user_id).limit(1).execute()
                d = _data(r)
                if d:
                    first_name = d[0].get("name") or ""
            else:
                r = supabase.table("users").select("first_name, last_name, short_id").eq("id", user_id).limit(1).execute()
                d = _data(r)
                if d:
                    first_name = d[0].get("first_name") or ""
                    session["first_name"] = first_name
        except Exception:
            pass

    return jsonify({
        "success":    True,
        "user_id":    user_id,
        "user_type":  user_type,
        "email":      email,
        "first_name": first_name,
    })


# ---------------------------------------------------------------
# API: Register
# ---------------------------------------------------------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    data = request.get_json() if request.is_json else request.form.to_dict()

    email    = (data.get("email") or "").strip().lower()
    password =  data.get("password") or ""
    aadhar   = (data.get("aadhar_card") or "").strip()
    phone    = (data.get("phone_number") or "").strip()
    first    = (data.get("first_name") or "").strip()
    last     = (data.get("last_name") or "").strip()

    def err(msg, code=400):
        if request.is_json:
            return jsonify({"success": False, "message": msg}), code
        return render_template("register.html", error=msg), code

    if not email or not password or not first:
        return err("Missing required fields")
    if len(password) < 6:
        return err("Password must be at least 6 characters")

    try:
        exist = _data(supabase.table("users").select("id").eq("email", email).limit(1).execute())
        if exist and len(exist) > 0:
            return err("Email already registered", 409)
    except Exception:
        app.logger.exception("Failed checking existing user")

    pw_hash = generate_password_hash(password)
    payload = {
        "first_name":    first,
        "last_name":     last,
        "aadhar_card":   aadhar,
        "email":         email,
        "phone_number":  phone,
        "password_hash": pw_hash,
        "user_role":     "user",
    }

    try:
        res = supabase.table("users").insert(payload).execute()
        data_out = _data(res)
        if request.is_json:
            return jsonify({"success": True, "message": "Registration successful", "data": data_out}), 201
        return redirect(url_for("index"))
    except Exception as e:
        app.logger.exception("Registration failed")
        return err(str(e), 500)


# ---------------------------------------------------------------
# API: Login
# ---------------------------------------------------------------

@app.route("/login", methods=["POST"])
def login():
    data       = request.get_json() or {}
    email      = (data.get("email") or "").strip().lower()
    password   =  data.get("password") or ""
    login_type =  data.get("login_type") or "user"

    if not email or not password:
        return jsonify({"success": False, "message": "Missing credentials"}), 400

    if login_type == "admin":
        try:
            admin_q = supabase.table("admins").select("*").eq("email", email).limit(1).execute()
            admins  = _data(admin_q)
            if not admins:
                return jsonify({"success": False, "message": "Admin not found"}), 404
            admin = admins[0]
            if not check_password_hash(admin.get("password_hash", ""), password):
                return jsonify({"success": False, "message": "Invalid credentials"}), 401
            session.permanent = True
            session["user_id"]    = admin.get("id")
            session["user_type"]  = "admin"
            session["email"]      = admin.get("email")
            session["first_name"] = admin.get("name") or "Admin"
            return jsonify({"success": True, "user_type": "admin"})
        except Exception:
            app.logger.exception("Admin login failed")
            return jsonify({"success": False, "message": "Internal error"}), 500

    else:
        try:
            user_q = supabase.table("users").select("*").eq("email", email).limit(1).execute()
            users  = _data(user_q)
            if not users:
                return jsonify({"success": False, "message": "User not found"}), 404
            user = users[0]
            if not check_password_hash(user.get("password_hash", ""), password):
                return jsonify({"success": False, "message": "Invalid credentials"}), 401
            user_role = user.get("user_role", "user")
            if login_type != "user" and user_role != login_type:
                return jsonify({"success": False, "message": f"This account is not registered as {login_type}"}), 403
            session.permanent = True
            session["user_id"]    = user.get("id")
            session["user_type"]  = user_role
            session["email"]      = user.get("email")
            session["first_name"] = user.get("first_name") or ""
            return jsonify({"success": True, "user_type": user_role})
        except Exception:
            app.logger.exception("User login failed")
            return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Logout
# ---------------------------------------------------------------

@app.route("/logout")
def logout():
    session.clear()
    if request.headers.get("Accept") == "application/json":
        return jsonify({"success": True})
    return redirect(url_for("index"))


# ---------------------------------------------------------------
# API: Complaints — Submit
# ---------------------------------------------------------------

@app.route("/submit_complaint", methods=["POST"])
def submit_complaint():
    if not is_user():
        return jsonify({"success": False, "message": "Not authenticated"}), 401

    user_id     = session.get("user_id")
    title       = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    city        = request.form.get("city", "").strip()
    pincode     = request.form.get("pincode", "").strip()
    landmark    = request.form.get("landmark", "").strip()

    if not title or not description or not city or not pincode:
        return jsonify({"success": False, "message": "Missing required fields"}), 400

    public_urls  = []
    upload_errors = []
    for f in request.files.getlist("complaint_images") or []:
        if f and f.filename:
            fname     = secure_filename(f.filename)
            dest_path = f"{user_id}/{uuid4().hex}_{fname}"
            try:
                pub_url = upload_file_to_supabase(COMPLAINT_BUCKET, dest_path, f.read(), f.content_type)
                public_urls.append(pub_url)
            except Exception as e:
                app.logger.exception("Failed uploading complaint image")
                upload_errors.append(str(e))

    if upload_errors:
        return jsonify({"success": False, "message": "Failed to upload one or more images", "errors": upload_errors}), 500

    payload = {
        "user_id":           user_id,
        "title":             title,
        "description":       description,
        "city":              city,
        "pincode":           pincode,
        "landmark":          landmark,
        "status":            "Open",
        "complaint_images":  public_urls,
    }

    try:
        res      = supabase.table("complaints").insert(payload).execute()
        data_out = _data(res)
        return jsonify({"success": True, "data": data_out}), 201
    except Exception:
        app.logger.exception("Failed to create complaint")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Complaints — List
# ---------------------------------------------------------------

SELECT_FULL = """
    *,
    creator:user_id(id, first_name, last_name, email, phone_number),
    assignee:assigned_to(id, first_name, last_name, short_id)
"""

@app.route("/get_complaints")
def get_complaints():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        user_type = session.get("user_type")
        if user_type == "admin":
            res = supabase.table("complaints").select(SELECT_FULL).order("created_at", desc=True).execute()
        else:
            res = supabase.table("complaints").select(SELECT_FULL).eq("user_id", session["user_id"]).order("created_at", desc=True).execute()
        return jsonify({"success": True, "data": _data(res) or []})
    except Exception:
        app.logger.exception("Failed to list complaints")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Nearby complaints (public info only, anonymised)
# ---------------------------------------------------------------

@app.route("/api/nearby_complaints")
def nearby_complaints():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401

    pincode = request.args.get("pincode", "").strip()
    city    = request.args.get("city", "").strip()

    if not pincode and not city:
        return jsonify({"success": True, "data": []})

    try:
        q = supabase.table("complaints").select(
            "id, title, city, pincode, landmark, status, created_at"
        )
        current_id = session.get("user_id")

        if pincode:
            q = q.eq("pincode", pincode)
        elif city:
            q = q.ilike("city", f"%{city}%")

        # Exclude the current user's complaints
        q   = q.neq("user_id", current_id)
        res = q.order("created_at", desc=True).limit(10).execute()
        return jsonify({"success": True, "data": _data(res) or []})
    except Exception:
        app.logger.exception("Failed to fetch nearby complaints")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Admin — Update complaint (FIXED: assignment always runs)
# ---------------------------------------------------------------

@app.route("/update_complaint", methods=["POST"])
def update_complaint():
    if not is_admin():
        return jsonify({"success": False, "message": "Not authorized"}), 403

    complaint_id = request.form.get("complaint_id", "").strip()
    status       = request.form.get("status", "").strip()
    assigned_to  = request.form.get("assigned_to", "").strip()

    if not complaint_id:
        return jsonify({"success": False, "message": "complaint_id required"}), 400

    update_payload = {}
    if status:
        update_payload["status"] = status
    if assigned_to:
        update_payload["assigned_to"] = assigned_to

    # Upload work images
    for f in request.files.getlist("work_images") or []:
        if f and f.filename:
            fname     = secure_filename(f.filename)
            dest_path = f"admin_{session['user_id']}/{uuid4().hex}_{fname}"
            try:
                pub_url = upload_file_to_supabase(WORK_BUCKET, dest_path, f.read(), f.content_type)
                # Append to existing work_images
                cur    = supabase.table("complaints").select("work_images").eq("id", complaint_id).limit(1).execute()
                cur_d  = _data(cur)
                existing = (cur_d[0].get("work_images") or []) if cur_d else []
                update_payload["work_images"] = existing + [pub_url]
            except Exception:
                app.logger.exception("Failed uploading admin work image")

    try:
        supabase.table("complaints").update(update_payload).eq("id", complaint_id).execute()

        # Log status change
        if status:
            supabase.table("complaint_status_logs").insert({
                "complaint_id": complaint_id,
                "status":       status,
                "created_by":   session.get("user_id"),
            }).execute()

        # FIXED: Staff assignment always runs (not inside image upload block)
        if assigned_to:
            try:
                supabase.table("staff_assignments").insert({
                    "complaint_id": complaint_id,
                    "staff_id":     assigned_to,
                    "assigned_by":  session.get("user_id"),
                }).execute()
            except Exception:
                app.logger.warning("staff_assignments insert failed (may already exist)")

            # Notify staff member
            try:
                c_res  = supabase.table("complaints").select("title").eq("id", complaint_id).limit(1).execute()
                c_data = _data(c_res)
                if c_data:
                    title = c_data[0].get("title", "")
                    create_notification(
                        assigned_to, complaint_id,
                        f"You have been assigned complaint: '{title[:40]}'"
                    )
            except Exception:
                app.logger.warning("Failed to notify assigned staff")

        # Notify citizen of status change
        if status:
            try:
                c_res  = supabase.table("complaints").select("user_id, title").eq("id", complaint_id).limit(1).execute()
                c_data = _data(c_res)
                if c_data:
                    create_notification(
                        c_data[0]["user_id"], complaint_id,
                        f"Your complaint '{c_data[0].get('title','')[:30]}' status updated to '{status}'"
                    )
            except Exception:
                app.logger.warning("Failed to notify citizen of status change")

        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to update complaint")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Admin — Create staff / verifier (FIXED: short_id in payload)
# ---------------------------------------------------------------

@app.route("/admin/create_user", methods=["POST"])
def admin_create_user():
    if not is_admin():
        return jsonify({"success": False, "message": "Not authorized"}), 403

    data       = request.get_json() or {}
    email      = (data.get("email") or "").strip().lower()
    password   =  data.get("password") or ""
    role       =  data.get("user_role") or "staff"
    first_name = (data.get("first_name") or "").strip()
    last_name  = (data.get("last_name") or "").strip()

    if not email or not password or role not in ["staff", "verifier"]:
        return jsonify({"success": False, "message": "Invalid input provided"}), 400
    if len(password) < 6:
        return jsonify({"success": False, "message": "Password must be at least 6 characters"}), 400

    exist = _data(supabase.table("users").select("id").eq("email", email).limit(1).execute())
    if exist:
        return jsonify({"success": False, "message": "User with this email already exists"}), 409

    # FIXED: generate short_id once and include in payload
    short_id = generate_unique_short_id()
    pw_hash  = generate_password_hash(password)

    payload = {
        "email":         email,
        "password_hash": pw_hash,
        "first_name":    first_name or role.capitalize(),
        "last_name":     last_name,
        "user_role":     role,
        "short_id":      short_id,
        "created_by":    session.get("user_id"),
    }

    try:
        supabase.table("users").insert(payload).execute()
        return jsonify({
            "success":  True,
            "message":  f"{role.capitalize()} created successfully",
            "short_id": short_id,
        })
    except Exception as e:
        app.logger.exception("Admin failed to create user")
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------
# API: Admin — Get staff list
# ---------------------------------------------------------------

@app.route("/api/get_staff")
def get_staff():
    if not is_admin():
        return jsonify({"success": False, "message": "Not authorized"}), 403
    try:
        res = supabase.table("users").select("id, first_name, last_name, short_id, email").eq("user_role", "staff").execute()
        return jsonify({"success": True, "data": _data(res) or []})
    except Exception as e:
        app.logger.exception("Failed to get staff list")
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------
# API: Admin — Get verifier list
# ---------------------------------------------------------------

@app.route("/api/get_verifiers")
def get_verifiers():
    if not is_admin():
        return jsonify({"success": False, "message": "Not authorized"}), 403
    try:
        res = supabase.table("users").select("id, first_name, last_name, short_id, email").eq("user_role", "verifier").execute()
        return jsonify({"success": True, "data": _data(res) or []})
    except Exception as e:
        app.logger.exception("Failed to get verifier list")
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------
# API: Admin — Staff rating overview
# ---------------------------------------------------------------

@app.route("/api/staff_rating/<staff_id>")
def get_staff_rating(staff_id):
    if not is_admin():
        return jsonify({"success": False, "message": "Not authorized"}), 403
    try:
        res = supabase.table("staff_ratings").select("rating, comments, created_at").eq("staff_id", staff_id).execute()
        ratings = _data(res) or []
        avg = round(sum(r["rating"] for r in ratings) / len(ratings), 2) if ratings else None
        return jsonify({"success": True, "data": ratings, "average": avg, "count": len(ratings)})
    except Exception as e:
        app.logger.exception("Failed to get staff rating")
        return jsonify({"success": False, "message": str(e)}), 500


# ---------------------------------------------------------------
# API: Verifier — List complaints (FIXED: shows Open not Resolved)
# ---------------------------------------------------------------

@app.route("/verifier_complaints")
def verifier_complaints():
    if not is_verifier():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        # FIXED: verifiers review Open complaints (before admin assigns)
        res = supabase.table("complaints").select(
            "*, creator:user_id(first_name, last_name, phone_number)"
        ).eq("status", "Open").order("created_at", desc=True).execute()
        return jsonify({"success": True, "data": _data(res) or []})
    except Exception as e:
        app.logger.exception("Failed to list verifier complaints")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Verifier — Verify / reject complaint
# ---------------------------------------------------------------

@app.route("/verify_complaint", methods=["POST"])
def verify_complaint():
    if not is_verifier():
        return jsonify({"success": False, "message": "Not authorized"}), 403

    data               = request.get_json() or {}
    complaint_id       = data.get("complaint_id", "").strip()
    new_status         = data.get("verification_status", "")
    notes              = data.get("verification_notes", "")

    if not complaint_id or new_status not in ["Verified", "Rejected"]:
        return jsonify({"success": False, "message": "Invalid input (status must be Verified or Rejected)"}), 400
    if new_status == "Rejected" and not notes:
        return jsonify({"success": False, "message": "Notes are required to reject a complaint"}), 400

    try:
        supabase.table("complaints").update({"status": new_status}).eq("id", complaint_id).execute()
        supabase.table("complaint_status_logs").insert({
            "complaint_id": complaint_id,
            "status":       new_status,
            "notes":        notes,
            "created_by":   session.get("user_id"),
        }).execute()

        # Notify citizen
        c_res  = supabase.table("complaints").select("user_id, title").eq("id", complaint_id).limit(1).execute()
        c_data = _data(c_res)
        if c_data:
            action = "verified and forwarded for assignment" if new_status == "Verified" else "rejected"
            create_notification(
                c_data[0]["user_id"], complaint_id,
                f"Your complaint '{c_data[0].get('title','')[:30]}' has been {action}."
            )

        return jsonify({"success": True})
    except Exception as e:
        app.logger.exception("Failed to verify complaint")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Staff — List assigned complaints
# ---------------------------------------------------------------

@app.route("/staff_complaints")
def staff_complaints():
    if not is_staff():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        res = supabase.table("complaints").select(
            "*, creator:user_id(id, first_name, last_name, email, phone_number)"
        ).eq("assigned_to", session["user_id"]).order("created_at", desc=True).execute()
        return jsonify({"success": True, "data": _data(res) or []})
    except Exception:
        app.logger.exception("Failed to list staff complaints")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Staff — Update progress
# ---------------------------------------------------------------

@app.route("/staff_update", methods=["POST"])
def staff_update():
    if not is_staff():
        return jsonify({"success": False, "message": "Not authorized"}), 403

    complaint_id = request.form.get("complaint_id", "").strip()
    status       = request.form.get("status", "").strip()

    if not complaint_id:
        return jsonify({"success": False, "message": "complaint_id required"}), 400

    public_urls = []
    for f in request.files.getlist("work_images") or []:
        if f and f.filename:
            fname     = secure_filename(f.filename)
            dest_path = f"staff_{session['user_id']}/{uuid4().hex}_{fname}"
            try:
                pub_url = upload_file_to_supabase(WORK_BUCKET, dest_path, f.read(), f.content_type)
                public_urls.append(pub_url)
            except Exception:
                app.logger.exception("Failed uploading work image")

    try:
        update_payload = {}
        if status:
            update_payload["status"] = status
        if public_urls:
            cur    = supabase.table("complaints").select("work_images").eq("id", complaint_id).limit(1).execute()
            cur_d  = _data(cur)
            existing = (cur_d[0].get("work_images") or []) if cur_d else []
            update_payload["work_images"] = existing + public_urls

        if update_payload:
            supabase.table("complaints").update(update_payload).eq("id", complaint_id).execute()

        # Log
        supabase.table("complaint_status_logs").insert({
            "complaint_id": complaint_id,
            "status":       status or "In Progress",
            "created_by":   session.get("user_id"),
        }).execute()

        # Notify citizen
        c_res  = supabase.table("complaints").select("user_id, title").eq("id", complaint_id).limit(1).execute()
        c_data = _data(c_res)
        if c_data and status:
            create_notification(
                c_data[0]["user_id"], complaint_id,
                f"Your complaint '{c_data[0].get('title','')[:30]}' has been updated to '{status}'."
            )

        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to update by staff")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Notifications — List
# ---------------------------------------------------------------

@app.route("/notifications")
def list_notifications():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        res = supabase.table("notifications").select("*").eq("user_id", session["user_id"]).order("created_at", desc=True).limit(30).execute()
        data_out = _data(res) or []
        unread   = sum(1 for n in data_out if not n.get("read"))
        return jsonify({"success": True, "data": data_out, "unread_count": unread})
    except Exception:
        app.logger.exception("Failed to list notifications")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Notifications — Mark read
# ---------------------------------------------------------------

@app.route("/api/mark_notification_read", methods=["POST"])
def mark_notification_read():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    data          = request.get_json() or {}
    notification_id = data.get("notification_id")
    mark_all      = data.get("all", False)

    try:
        q = supabase.table("notifications").update({"read": True, "read_at": "now()"}).eq("user_id", session["user_id"])
        if not mark_all and notification_id:
            q = q.eq("id", notification_id)
        q.execute()
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to mark notification read")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Feedback
# ---------------------------------------------------------------

@app.route("/feedback", methods=["POST"])
def submit_feedback():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    data = request.get_json() or {}
    try:
        supabase.table("feedbacks").insert({
            "complaint_id": data.get("complaint_id"),
            "rating":       data.get("rating"),
            "comments":     data.get("comments"),
            "created_by":   session.get("user_id"),
        }).execute()
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to submit feedback")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Staff Rating (citizen rates staff)
# ---------------------------------------------------------------

@app.route("/api/rate_staff", methods=["POST"])
def rate_staff():
    if not is_user():
        return jsonify({"success": False, "message": "Not authenticated"}), 401

    data         = request.get_json() or {}
    complaint_id = data.get("complaint_id", "").strip()
    rating       = data.get("rating")
    comments     = data.get("comments", "").strip()

    if not complaint_id or not rating:
        return jsonify({"success": False, "message": "complaint_id and rating required"}), 400
    try:
        rating = int(rating)
        if not 1 <= rating <= 5:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Rating must be an integer 1–5"}), 400

    # Verify the complaint belongs to this user and is Closed
    try:
        c_res  = supabase.table("complaints").select("id, user_id, status, assigned_to").eq("id", complaint_id).limit(1).execute()
        c_data = _data(c_res)
        if not c_data:
            return jsonify({"success": False, "message": "Complaint not found"}), 404
        complaint = c_data[0]
        if complaint["user_id"] != session["user_id"]:
            return jsonify({"success": False, "message": "Not your complaint"}), 403
        if complaint["status"] not in ["Closed", "Resolved"]:
            return jsonify({"success": False, "message": "Can only rate closed/resolved complaints"}), 400
        staff_id = complaint.get("assigned_to")
        if not staff_id:
            return jsonify({"success": False, "message": "No staff assigned to this complaint"}), 400
    except Exception:
        app.logger.exception("Failed to verify complaint for rating")
        return jsonify({"success": False, "message": "Internal error"}), 500

    try:
        supabase.table("staff_ratings").insert({
            "complaint_id": complaint_id,
            "staff_id":     staff_id,
            "citizen_id":   session["user_id"],
            "rating":       rating,
            "comments":     comments,
        }).execute()
        return jsonify({"success": True, "message": "Rating submitted"})
    except Exception as e:
        err_str = str(e)
        if "unique" in err_str.lower() or "duplicate" in err_str.lower():
            return jsonify({"success": False, "message": "You have already rated this complaint"}), 409
        app.logger.exception("Failed to submit staff rating")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Get my rating for a complaint
# ---------------------------------------------------------------

@app.route("/api/my_rating")
def my_rating():
    if not logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    complaint_id = request.args.get("complaint_id", "").strip()
    if not complaint_id:
        return jsonify({"success": True, "data": None})
    try:
        res    = supabase.table("staff_ratings").select("rating, comments").eq("complaint_id", complaint_id).eq("citizen_id", session["user_id"]).limit(1).execute()
        data_out = _data(res)
        return jsonify({"success": True, "data": data_out[0] if data_out else None})
    except Exception:
        app.logger.exception("Failed to get my rating")
        return jsonify({"success": False, "message": "Internal error"}), 500


# ---------------------------------------------------------------
# API: Escalation info
# ---------------------------------------------------------------

@app.route("/api/escalation_info")
def escalation_info():
    return jsonify({
        "success": True,
        "email":   ESCALATION_EMAIL,
        "twitter": ESCALATION_TWITTER,
    })


# ---------------------------------------------------------------
# Utility: Create admin (run from CLI)
# ---------------------------------------------------------------

def create_admin(email: str, password: str, name: str = None):
    """Create an admin account. Run from CLI:
       python -c "from app import create_admin; create_admin('admin@example.com','password123','Admin Name')"
    """
    pw_hash = generate_password_hash(password)
    payload = {"email": email.lower(), "password_hash": pw_hash, "name": name}
    try:
        res = supabase.table("admins").insert(payload).execute()
        print("Admin created:", _data(res))
        return _data(res)
    except Exception as e:
        print("Failed:", e)
        return None


# ---------------------------------------------------------------
# Run
# ---------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)