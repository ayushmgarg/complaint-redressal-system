# Complaint Redressal System

A comprehensive web-based complaint management system built with Supabase, designed to streamline the process of filing, tracking, and resolving public complaints. Now there won't be any more turning a deaf ear to your precious grievances.

## 🚀 Features

### User Roles
- **Citizens**: File complaints with images, track status, provide feedback
- **Verifiers**: Review and verify submitted complaints
- **Staff**: Work on assigned complaints, upload progress images
- **Admins**: Manage all complaints, assign tasks, oversee system

### Core Functionality
- **Multi-role Authentication**: Secure login system for different user types
- **Image Upload**: Support for complaint and work progress images via Supabase Storage
- **Real-time Status Tracking**: Track complaint progress from submission to resolution
- **Notification System**: Keep users informed about complaint updates
- **Feedback System**: Collect user satisfaction ratings
- **Responsive Design**: Mobile-friendly interface with Bootstrap

## 🛠️ Technology Stack

- **Backend**: Python Flask
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Frontend**: HTML, CSS, JavaScript, Bootstrap 5
- **Authentication**: Flask Sessions with Werkzeug password hashing
- **Environment Management**: python-dotenv

## 📋 Prerequisites

- Python 3.8 or higher
- Supabase account and project
- Git (for version control)

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd se_project_complaint_redressal
```

### 2. Create Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Environment Configuration
1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_service_role_key
   SECRET_KEY=your_flask_secret_key
   ```

### 5. Database Setup
1. Run the SQL schema in your Supabase project:
   ```bash
   # Execute the contents of schema.sql in your Supabase SQL editor
   ```

2. Create storage buckets in Supabase:
   - `complaint-images` (for complaint attachments)
   - `work-images` (for work progress photos)

### 6. Create Initial Admin User
```bash
python -c "
from app import create_admin
create_admin('admin@example.com', 'admin123', 'System Admin')
"
```

### 7. Run the Application
```bash
python app.py
```

The application will be available at `http://localhost:5000`

## 📁 Project Structure

```
se_project_complaint_redressal/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── schema.sql            # Database schema
├── .env                  # Environment variables (not in repo)
├── .env.example          # Environment template
├── .gitignore           # Git ignore rules
├── README.md            # This file
├── addV.py              # Utility to add verifiers/staff
├── check_buckets.py     # Utility to check Supabase buckets
├── test_upload.py       # Test file upload functionality
├── templates/           # HTML templates
│   ├── _base.html       # Base template
│   ├── login.html       # Login page
│   ├── register.html    # Registration page
│   ├── user.html        # User dashboard
│   ├── admin.html       # Admin dashboard
│   ├── verifier.html    # Verifier dashboard
│   └── staff.html       # Staff dashboard
└── static/              # Static assets
    ├── css/
    │   └── style.css    # Custom styles
    └── js/
        └── main.js      # Frontend JavaScript
```

## 🔧 API Endpoints

### Authentication
- `POST /register` - User registration
- `POST /login` - User login (supports multiple roles)
- `GET /logout` - User logout

### Complaints
- `POST /submit_complaint` - Submit new complaint
- `GET /get_complaints` - Get user's complaints (or all for admin)
- `POST /update_complaint` - Update complaint (admin only)
- `POST /verify_complaint` - Verify complaint (verifier only)
- `POST /staff_update` - Update complaint progress (staff only)

### Other
- `POST /feedback` - Submit feedback
- `GET /notifications` - Get user notifications

## 👥 User Roles & Permissions

### Citizen (User)
- Register and login
- Submit complaints with images
- Track complaint status
- Provide feedback on resolved complaints

### Verifier
- Login to verifier dashboard
- View submitted complaints
- Verify or reject complaints
- Add verification notes

### Staff
- Login to staff dashboard
- View assigned complaints
- Update complaint status
- Upload work progress images

### Admin
- Access to all complaints
- Assign complaints to staff
- Update complaint status
- Manage system users

## 🔒 Security Features

- Password hashing using Werkzeug
- Session-based authentication
- Role-based access control
- Input validation and sanitization
- Secure file upload handling
- Environment variable protection

## 🚀 Deployment

### Using Docker (Recommended)
```bash
# Build the image
docker build -t complaint-system .

# Run the container
docker run -p 5000:5000 --env-file .env complaint-system
```

### Manual Deployment
1. Set up a production WSGI server (Gunicorn recommended)
2. Configure reverse proxy (Nginx)
3. Set up SSL certificates
4. Configure environment variables
5. Set up monitoring and logging

## 🧪 Testing

### Run Utility Scripts
```bash
# Check Supabase connection and buckets
python check_buckets.py

# Test file upload functionality
python test_upload.py

# Add verifier/staff users
python addV.py
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) section
2. Create a new issue with detailed description
3. Contact the development team

## 🔄 Version History

- **v1.0.0** - Initial release with core functionality
- **v1.1.0** - Added multi-role authentication
- **v1.2.0** - Enhanced UI and mobile responsiveness

## 🙏 Acknowledgments

- Bootstrap team for the UI framework
- Supabase team for the backend infrastructure
- Flask community for the web framework
- All contributors and testers

---

**Made with ❤️ for better governance and citizen services**
