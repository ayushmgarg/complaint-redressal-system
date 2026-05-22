# Mr. Civil — Complaint Redressal System

A comprehensive, multi-role complaint management platform built for Indian citizens to report, track, and resolve civic issues — from potholes to broken streetlights.

---

## 🚀 Features

### User Roles
| Role | Capabilities |
|------|-------------|
| **Citizen** | File complaints with photos, track status, rate staff, escalate issues, see nearby complaints |
| **Verifier** | Review open complaints, approve (Verified) or reject with notes |
| **Staff** | Work on assigned complaints, upload progress images |
| **Admin** | Manage all complaints, assign to staff, create team accounts, view staff ratings |

### Core Functionality
- **Multi-role Authentication** — Secure Flask session-based login, no passwords on the frontend
- **Image Upload** — Complaint photos & work-progress images via Supabase Storage (drag & drop)
- **Complaint Workflow** — Open → Verified → Assigned → In Progress → Resolved → Closed
- **Notification System** — Bell icon with unread badge, slide-down panel, auto-poll every 60s
- **Nearby Complaints** — See anonymised complaints in the same pincode
- **Staff Rating** — Citizens rate staff (1–5 stars) per closed complaint
- **Escalation** — Email & Twitter/X escalation for unresolved complaints (3+ days)
- **Feedback System** — Collect satisfaction ratings on closed complaints

---

## 🛠️ Technology Stack

- **Backend**: Python Flask
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Frontend**: HTML, Vanilla CSS (Inter font), Vanilla JavaScript
- **Authentication**: Flask sessions + Werkzeug password hashing
- **Deployment**: Render (free tier via Gunicorn)

---

## 📋 Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd complaint-redressal-system
```

### 2. Create Virtual Environment
```bash
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # macOS/Linux
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` with your values:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SECRET_KEY=your_long_random_secret_key
COMPLAINT_BUCKET=complaint-images
WORK_BUCKET=work-images
ESCALATION_EMAIL=grievance@mrcivil.gov.in
ESCALATION_TWITTER_HANDLE=MrCivilGrievance
```
> ⚠️ Generate a proper SECRET_KEY: `python -c "import secrets; print(secrets.token_hex(32))"`

### 5. Database Setup

**Run `schema.sql` first** (initial tables), then **run `migrations.sql`** for new features:
1. Go to your Supabase project → SQL Editor
2. Paste and run `schema.sql`
3. Paste and run `migrations.sql`

### 6. Create Storage Buckets
In your Supabase dashboard → Storage:
1. Create bucket `complaint-images` (set to **Public**)
2. Create bucket `work-images` (set to **Public**)

### 7. Create Initial Admin
```bash
python -c "from app import create_admin; create_admin('admin@example.com', 'yourpassword', 'System Admin')"
```

### 8. Run Locally
```bash
python app.py
```
Open `http://localhost:5000`

---

## 📁 Project Structure

```
complaint-redressal-system/
├── app.py                 # Flask application (all routes + API)
├── requirements.txt       # Python dependencies
├── schema.sql            # Initial database schema
├── migrations.sql        # Database additions (run after schema.sql)
├── Procfile              # Render/Heroku deployment
├── render.yaml           # Render service configuration
├── .env                  # Your environment variables (never commit this)
├── .env.example          # Environment template
├── .gitignore
├── README.md
├── templates/
│   ├── _base.html        # Base layout (navbar, notifications, modals)
│   ├── login.html        # Login page (split hero, visual role cards)
│   ├── register.html     # 3-step citizen registration
│   ├── user.html         # Citizen dashboard (tabs, nearby, escalation)
│   ├── admin.html        # Admin dashboard (4 tabs, staff ratings)
│   ├── verifier.html     # Verifier dashboard (Open complaints)
│   └── staff.html        # Staff dashboard (assigned complaints)
└── static/
    ├── css/style.css     # Mr. Civil design system (navy/saffron brand)
    ├── js/main.js        # All frontend logic
    └── img/
        └── mr_civil_logo.png
```

---

## 🔄 Complaint Workflow

```
Citizen files → [Open]
    ↓ Verifier approves
[Verified]
    ↓ Admin assigns to staff
[Assigned]
    ↓ Staff starts work
[In Progress]
    ↓ Staff completes
[Resolved]
    ↓ Verifier closes
[Closed] ← Citizen can rate staff & provide feedback
```

---

## 🔧 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Login page (or redirect if logged in) |
| GET | `/register` | Registration page |
| POST | `/register` | Submit registration |
| POST | `/login` | Login (all roles) |
| GET | `/logout` | Logout |
| GET | `/api/me` | Current user info |

### Complaints
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/submit_complaint` | Citizen | Submit new complaint |
| GET | `/get_complaints` | All | Get complaints (filtered by role) |
| POST | `/update_complaint` | Admin | Update status / assign staff |
| GET | `/verifier_complaints` | Verifier | Open complaints for review |
| POST | `/verify_complaint` | Verifier | Verify or reject |
| GET | `/staff_complaints` | Staff | Assigned complaints |
| POST | `/staff_update` | Staff | Update progress + images |

### Team Management
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/admin/create_user` | Admin | Create staff or verifier |
| GET | `/api/get_staff` | Admin | List all staff |
| GET | `/api/get_verifiers` | Admin | List all verifiers |

### New Features
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nearby_complaints` | Complaints in same pincode |
| POST | `/api/rate_staff` | Rate staff (citizen) |
| GET | `/api/staff_rating/<id>` | Staff's ratings (admin) |
| GET | `/api/my_rating?complaint_id=` | Check if already rated |
| GET | `/api/escalation_info` | Get escalation contact info |
| GET | `/notifications` | List user notifications |
| POST | `/api/mark_notification_read` | Mark notifications as read |
| POST | `/feedback` | Submit complaint feedback |

---

## 🚀 Deploy to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repository
4. Render auto-detects `render.yaml` and configures:
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn app:app --workers 2 --timeout 120`
5. Add environment variables in Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SECRET_KEY` (Render can auto-generate this)
   - `ESCALATION_EMAIL`
   - `ESCALATION_TWITTER_HANDLE`

---

## 🔒 Security Notes

- Passwords are hashed with Werkzeug (bcrypt-based), never stored in plaintext
- No credentials or passwords on the frontend — all auth via Flask sessions
- Role-based access control on every API endpoint
- `SECRET_KEY` must be a long random string (not the Supabase key!)
- `.env` is in `.gitignore` — never commit it

---

**Made with ❤️ for better civic governance — Mr. Civil**
