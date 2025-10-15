import os
from uuid import uuid4
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from supabase import create_client
from datetime import timedelta
from dotenv import load_dotenv
import random

# -----------------------------
# Configuration (read from env)
# -----------------------------

load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-secret-in-prod")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError("SUPABASE_URL and SUPABASE_KEY must be set as environment variables")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Flask app
app = Flask(__name__)
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=7)

# Bucket names
COMPLAINT_BUCKET = os.environ.get("COMPLAINT_BUCKET", "complaint-images")
WORK_BUCKET = os.environ.get("WORK_BUCKET", "work-images")

# -----------------------------
# Helper functions
# -----------------------------

def upload_file_to_supabase(bucket_name: str, dest_path: str, file_bytes: bytes, content_type: str = None):
    """Upload bytes to Supabase storage and return a public or signed URL."""
    try:
        res = supabase.storage.from_(bucket_name).upload(dest_path, file_bytes)
    except Exception as e:
        app.logger.exception("Supabase upload failed")
        raise

    # Try to get a public url
    try:
        public = supabase.storage.from_(bucket_name).get_public_url(dest_path)
        if isinstance(public, dict):
            return public.get("publicURL") or public.get("public_url") or public.get("publicUrl")
        return public
    except Exception:
        app.logger.warning("get_public_url failed; trying signed URL")

    # Fallback: create a signed URL
    try:
        signed = supabase.storage.from_(bucket_name).create_signed_url(dest_path, 60 * 60 * 24 * 365)
        if isinstance(signed, dict):
            return signed.get("signedURL") or signed.get("signed_url") or signed.get("signedUrl")
        return signed
    except Exception:
        app.logger.exception("Failed to create signed URL")
        return dest_path


def ensure_user_logged_in():
    return "user_id" in session and session.get("user_type") == "user"


def ensure_admin_logged_in():
    return "user_id" in session and session.get("user_type") == "admin"


def ensure_verifier_logged_in():
    return "user_id" in session and (session.get("user_type") == "verifier" or session.get("user_role") == "verifier")


def ensure_staff_logged_in():
    return "user_id" in session and (session.get("user_type") == "staff" or session.get("user_role") == "staff")


# -----------------------------
# Routes: Pages
# -----------------------------

@app.route("/")
def index():
    return render_template("login.html")


@app.route("/user")
def user_dashboard():
    if not ensure_user_logged_in():
        return redirect(url_for("index"))
    return render_template("user.html")


@app.route("/admin")
def admin_dashboard():
    if not ensure_admin_logged_in():
        return redirect(url_for("index"))
    return render_template("admin.html")


@app.route("/verifier")
def verifier_dashboard():
    if not ensure_verifier_logged_in():
        return redirect(url_for("index"))
    return render_template("verifier.html")


@app.route("/staff")
def staff_dashboard():
    if not ensure_staff_logged_in():
        return redirect(url_for("index"))
    return render_template("staff.html")


# -----------------------------
# API: Register / Login / Logout
# -----------------------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    data = request.get_json() if request.is_json else request.form.to_dict()

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    aadhar = (data.get("aadhar_card") or "").strip()
    phone = (data.get("phone_number") or "").strip()
    first = (data.get("first_name") or "").strip()
    last = (data.get("last_name") or "").strip()

    if not email or not password or not first:
        if request.is_json:
            return jsonify({"success": False, "message": "Missing required fields"}), 400
        return render_template("register.html", error="Missing required fields"), 400

    if len(password) < 6:
        if request.is_json:
            return jsonify({"success": False, "message": "Password must be at least 6 characters"}), 400
        return render_template("register.html", error="Password must be at least 6 characters"), 400

    try:
        exist_q = supabase.table("users").select("id").eq("email", email).limit(1).execute()
        existing = getattr(exist_q, "data", None) or (exist_q.get("data") if isinstance(exist_q, dict) else None)
        if existing and len(existing) > 0:
            msg = "Email already registered"
            if request.is_json:
                return jsonify({"success": False, "message": msg}), 409
            return render_template("register.html", error=msg), 409
    except Exception:
        app.logger.exception("Failed checking existing user")

    pw_hash = generate_password_hash(password)

    payload = {
        "first_name": first,
        "last_name": last,
        "aadhar_card": aadhar,
        "email": email,
        "phone_number": phone,
        "password_hash": pw_hash,
        "user_role": "user"
    }

    try:
        res = supabase.table("users").insert(payload).execute()
        data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
        if request.is_json or ("application/json" in (request.headers.get("Accept") or "")):
            return jsonify({"success": True, "message": "Registration successful", "data": data_out}), 201
        return redirect(url_for("index"))
    except Exception as e:
        app.logger.exception("Registration failed")
        err_msg = str(e)
        if request.is_json or ("application/json" in (request.headers.get("Accept") or "")):
            return jsonify({"success": False, "message": err_msg}), 500
        return render_template("register.html", error=err_msg), 500


@app.route("/login", methods=["POST"])
def login():
    """Login endpoint supporting multiple roles"""
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    login_type = data.get("login_type") or "user"

    if not email or not password:
        return jsonify({"success": False, "message": "Missing credentials"}), 400

    # Handle based on login_type
    if login_type == "admin":
        try:
            admin_q = supabase.table("admins").select("*").eq("email", email).limit(1).execute()
            admin_data = getattr(admin_q, "data", None) or (admin_q.get("data") if isinstance(admin_q, dict) else None)
            if admin_data and len(admin_data) > 0:
                admin = admin_data[0]
                if check_password_hash(admin.get("password_hash"), password):
                    session.permanent = True
                    session["user_id"] = admin.get("id")
                    session["user_type"] = "admin"
                    session["email"] = admin.get("email")
                    return jsonify({"success": True, "user_type": "admin"})
                else:
                    return jsonify({"success": False, "message": "Invalid credentials"}), 401
            else:
                return jsonify({"success": False, "message": "Admin not found"}), 404
        except Exception:
            app.logger.exception("Admin lookup failed")
            return jsonify({"success": False, "message": "Internal error"}), 500
    
    else:
        # Login as user, verifier, or staff (all from users table)
        try:
            user_q = supabase.table("users").select("*").eq("email", email).limit(1).execute()
            user_data = getattr(user_q, "data", None) or (user_q.get("data") if isinstance(user_q, dict) else None)
            if user_data and len(user_data) > 0:
                user = user_data[0]
                if check_password_hash(user.get("password_hash"), password):
                    user_role = user.get("user_role", "user")
                    
                    # Validate role matches login_type
                    if login_type != "user" and user_role != login_type:
                        return jsonify({"success": False, "message": f"This account is not a {login_type}"}), 403
                    
                    session.permanent = True
                    session["user_id"] = user.get("id")
                    session["user_type"] = user_role
                    session["user_role"] = user_role
                    session["email"] = user.get("email")
                    return jsonify({"success": True, "user_type": user_role})
                else:
                    return jsonify({"success": False, "message": "Invalid credentials"}), 401
            else:
                return jsonify({"success": False, "message": "User not found"}), 404
        except Exception:
            app.logger.exception("User lookup failed")
            return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/logout", methods=["GET"])   
def logout():
    """Clear the session and redirect to login page"""
    session.clear()
    if request.headers.get("Accept") == "application/json":
        return jsonify({"success": True})
    return redirect(url_for("index"))


# -----------------------------
# API: Complaint create / read / update
# -----------------------------

@app.route("/submit_complaint", methods=["POST"])
def submit_complaint():
    """Submit a new complaint with images"""
    if not ensure_user_logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401

    user_id = session.get("user_id")
    title = request.form.get("title")
    description = request.form.get("description")
    city = request.form.get("city")
    pincode = request.form.get("pincode")
    landmark = request.form.get("landmark")

    uploaded_files = request.files.getlist("complaint_images")
    public_urls = []
    upload_errors = []

    for f in uploaded_files or []:
        if f and f.filename:
            fname = secure_filename(f.filename)
            dest_path = f"{user_id}/{uuid4().hex}_{fname}"
            try:
                file_bytes = f.read()
                pub_url = upload_file_to_supabase(COMPLAINT_BUCKET, dest_path, file_bytes, f.content_type)
                public_urls.append(pub_url)
            except Exception as e:
                app.logger.exception("Failed uploading complaint image")
                upload_errors.append(str(e))

    if upload_errors:
        return jsonify({"success": False, "message": "Failed to upload one or more images", "errors": upload_errors}), 500

    payload = {
        "user_id": user_id,
        "title": title,
        "description": description,
        "city": city,
        "pincode": pincode,
        "landmark": landmark,
        "status": "Open",
        "complaint_images": public_urls
    }

    try:
        res = supabase.table("complaints").insert(payload).execute()
        data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
        if data_out:
            return jsonify({"success": True, "data": data_out}), 201
        return jsonify({"success": True, "message": "Complaint submitted"}), 201
    except Exception:
        app.logger.exception("Failed to create complaint")
        return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/get_complaints", methods=["GET"])
def get_complaints():
    if not ("user_id" in session):
        return jsonify({"success": False, "message": "Not authenticated"}), 401

    if session.get("user_type") == "admin":
        try:
            select_query = """
                *,
                creator:user_id(id, first_name, last_name, email, phone_number),
                assignee:assigned_to(id, first_name, last_name)
            """
            res = supabase.table("complaints").select(select_query).order("created_at", desc=True).execute()
            data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
            return jsonify({"success": True, "data": data_out})
        except Exception:
            app.logger.exception("Failed to list complaints for admin")
            return jsonify({"success": False, "message": "Internal error"}), 500
    else:
        try:
            res = supabase.table("complaints").select(select_query).eq("user_id", session.get("user_id")).order("created_at", desc=True).execute()
            data_out = getattr(res, "data", [])
            return jsonify({"success": True, "data": data_out})
        except Exception as e:
            app.logger.exception("Failed to list user's complaints: " + str(e))
            return jsonify({"success": False, "message": "Internal error"}), 500

@app.route("/admin/create_user", methods=["POST"])
def admin_create_user():
    if not ensure_admin_logged_in():
        return jsonify({"success": False, "message": "Not authorized"}), 403

    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("user_role") or "staff"
    first_name = data.get("first_name") or "Staff"

    short_id = generate_unique_short_id()

    pw_hash = generate_password_hash(password)
    payload = {
        "email": email,
        "password_hash": pw_hash,
        "first_name": first_name,
        "user_role": role,
        "short_id": short_id 
    }

    if not email or not password or role not in ["staff", "verifier"]:
        return jsonify({"success": False, "message": "Invalid input provided."}), 400

    # Check if user already exists
    exist_q = supabase.table("users").select("id").eq("email", email).limit(1).execute()
    if getattr(exist_q, "data", None):
        return jsonify({"success": False, "message": "User with this email already exists."}), 409

    pw_hash = generate_password_hash(password)
    payload = {
        "email": email,
        "password_hash": pw_hash,
        "first_name": first_name,
        "user_role": role
    }

    try:
        supabase.table("users").insert(payload).execute()
        return jsonify({"success": True, "message": f"{role.capitalize()} created successfully."})
    except Exception as e:
        app.logger.exception("Admin failed to create user")
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/api/get_staff")
def get_staff():
    if not ensure_admin_logged_in():
        return jsonify({"success": False, "message": "Not authorized"}), 403
    
    try:
        res = supabase.table("users").select("id, first_name, last_name, short_id").eq("user_role", "staff").execute()
        staff_list = getattr(res, "data", [])
        return jsonify({"success": True, "data": staff_list})
    except Exception as e:
        app.logger.exception("Failed to get staff list")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/verifier_complaints", methods=["GET"])  
def verifier_complaints():
    if not ensure_verifier_logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        res = supabase.table("complaints").select("*, users:users(id,first_name,last_name,email,phone_number)").in_("status", ["Open"]).order("created_at", desc=True).execute()
        data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
        return jsonify({"success": True, "data": data_out})
    except Exception:
        app.logger.exception("Failed to list verifier complaints")
        return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/staff_complaints", methods=["GET"])  
def staff_complaints():
    if not ensure_staff_logged_in():
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        res = supabase.table("complaints").select("*, users:users(id,first_name,last_name,email,phone_number)").eq("assigned_to", session.get("user_id")).order("created_at", desc=True).execute()
        data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
        return jsonify({"success": True, "data": data_out})
    except Exception:
        app.logger.exception("Failed to list staff complaints")
        return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/verify_complaint", methods=["POST"])  
def verify_complaint():
    if not ensure_verifier_logged_in():
        return jsonify({"success": False, "message": "Not authorized"}), 403
    complaint_id = request.json.get("complaint_id") if request.is_json else request.form.get("complaint_id")
    verification_status = request.json.get("verification_status") if request.is_json else request.form.get("verification_status")
    notes = request.json.get("verification_notes") if request.is_json else request.form.get("verification_notes")
    if not complaint_id or verification_status not in ["Verified", "Rejected"]:
        return jsonify({"success": False, "message": "Invalid input"}), 400
    try:
        new_status = "Verified" if verification_status == "Verified" else "Rejected"
        supabase.table("complaints").update({"status": new_status}).eq("id", complaint_id).execute()
        supabase.table("complaint_status_logs").insert({
            "complaint_id": complaint_id,
            "status": new_status,
            "notes": notes,
            "created_by": session.get("user_id")
        }).execute()
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to verify complaint")
        return jsonify({"success": False, "message": "Internal error"}), 500

def create_notification(user_id, complaint_id, message):
    try:
        supabase.table("notifications").insert({
            "user_id": user_id,
            "type": "STATUS_UPDATE",
            "payload": {"complaint_id": complaint_id, "message": message}
        }).execute()
    except Exception as e:
        app.logger.error(f"Failed to create notification: {e}")

@app.route("/staff_update", methods=["POST"])  
def staff_update():
    if not ensure_staff_logged_in():
        return jsonify({"success": False, "message": "Not authorized"}), 403
    complaint_id = request.form.get("complaint_id")
    status = request.form.get("status")
    uploaded_files = request.files.getlist("work_images")
    public_urls = []
    for f in uploaded_files or []:
        if f and f.filename:
            fname = secure_filename(f.filename)
            dest_path = f"staff_{session.get('user_id')}/{uuid4().hex}_{fname}"
            try:
                file_bytes = f.read()
                pub_url = upload_file_to_supabase(WORK_BUCKET, dest_path, file_bytes, f.content_type)
                public_urls.append(pub_url)
            except Exception:
                app.logger.exception("Failed uploading work image")
    try:
        update_payload = {}
        complaint_q = supabase.table("complaints").select("user_id, title").eq("id", complaint_id).limit(1).execute()
        complaint_data = getattr(complaint_q, "data", [])
        if complaint_data:
            user_to_notify = complaint_data[0]['user_id']
            complaint_title = complaint_data[0]['title']
            message = f"Your complaint '{complaint_title[:20]}...' has been updated to '{status}'."
            create_notification(user_to_notify, complaint_id, message)
        if status:
            update_payload["status"] = status
        if public_urls:
            cur = supabase.table("complaints").select("work_images").eq("id", complaint_id).limit(1).execute()
            cur_data = getattr(cur, "data", None) or (cur.get("data") if isinstance(cur, dict) else None)
            existing = cur_data[0].get("work_images") if cur_data and len(cur_data) > 0 else []
            update_payload["work_images"] = (existing or []) + public_urls
        if update_payload:
            supabase.table("complaints").update(update_payload).eq("id", complaint_id).execute()
        supabase.table("complaint_status_logs").insert({
            "complaint_id": complaint_id,
            "status": status or "In Progress",
            "created_by": session.get("user_id")
        
        }).execute()
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to update by staff")
        return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/update_complaint", methods=["POST"])  
def update_complaint():
    """Admin-only endpoint to update complaint"""
    if not ensure_admin_logged_in():
        return jsonify({"success": False, "message": "Not authorized"}), 403

    complaint_id = request.form.get("complaint_id")
    status = request.form.get("status")
    assigned_to = request.form.get("assigned_to")

    uploaded_files = request.files.getlist("work_images")
    public_urls = []
    for f in uploaded_files or []:
        if f and f.filename:
            fname = secure_filename(f.filename)
            dest_path = f"admin_{session.get('user_id')}/{uuid4().hex}_{fname}"
            try:
                file_bytes = f.read()
                pub_url = upload_file_to_supabase(WORK_BUCKET, dest_path, file_bytes, f.content_type)
                public_urls.append(pub_url)
            except Exception:
                app.logger.exception("Failed uploading work image")

    update_payload = {"updated_at": "now()"}
    if status:
        update_payload["status"] = status
    if assigned_to:
        update_payload["assigned_to"] = assigned_to
    if public_urls:
        try:
            supabase.table("complaints").update(update_payload).eq("id", complaint_id).execute()
            if assigned_to:
                supabase.table("staff_assignments").insert({
                    "complaint_id": complaint_id,
                    "staff_id": assigned_to,
                    "assigned_by": session.get("user_id") # Log which admin did it
                }).execute()
            cur = supabase.table("complaints").select("work_images").eq("id", complaint_id).limit(1).execute()
            cur_data = getattr(cur, "data", None) or (cur.get("data") if isinstance(cur, dict) else None)
            existing = cur_data[0].get("work_images") if cur_data and len(cur_data) > 0 else []
            new_images = (existing or []) + public_urls
            update_payload["work_images"] = new_images
            
        except Exception:
            app.logger.exception("Failed to fetch existing work_images")
            update_payload["work_images"] = public_urls

    try:
        res = supabase.table("complaints").update(update_payload).eq("id", complaint_id).execute()
        data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
        
        # Log status change
        if status:
            supabase.table("complaint_status_logs").insert({
                "complaint_id": complaint_id,
                "status": status,
                "created_by": session.get("user_id")
            }).execute()
        
        return jsonify({"success": True, "data": data_out})
    except Exception:
        app.logger.exception("Failed to update complaint")
        return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/feedback", methods=["POST"])  
def submit_feedback():
    if not ("user_id" in session):
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    data = request.get_json() or {}
    try:
        supabase.table("feedbacks").insert({
            "complaint_id": data.get("complaint_id"),
            "rating": data.get("rating"),
            "comments": data.get("comments"),
            "created_by": session.get("user_id")
        }).execute()
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Failed to submit feedback")
        return jsonify({"success": False, "message": "Internal error"}), 500


@app.route("/notifications", methods=["GET"])  
def list_notifications():
    if not ("user_id" in session):
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    try:
        res = supabase.table("notifications").select("*").eq("user_id", session.get("user_id")).order("created_at", desc=True).execute()
        data_out = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
        return jsonify({"success": True, "data": data_out})
    except Exception:
        app.logger.exception("Failed to list notifications")
        return jsonify({"success": False, "message": "Internal error"}), 500


# -----------------------------
# Utility: create admin manually
# -----------------------------

def create_admin(email: str, password: str, name: str = None):
    pw_hash = generate_password_hash(password)
    payload = {"email": email.lower(), "password_hash": pw_hash, "name": name}
    try:
        res = supabase.table("admins").insert(payload).execute()
        return getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None)
    except Exception:
        app.logger.exception("Failed to create admin")
        return None

#-----------------------------
#id: 4 digit random  for field staff and verifier
#-----------------------------
def generate_unique_short_id():
    """Generates a 4-digit ID and ensures it's unique in the users table."""
    while True:
        short_id = str(random.randint(1000, 9999))
        try:
            res = supabase.table("users").select("id").eq("short_id", short_id).limit(1).execute()
            if not getattr(res, "data", None):
                return short_id # It's unique
        except Exception:
            # If the query fails, it's safer to just generate a new one
            pass


# -----------------------------
# Run
# -----------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)