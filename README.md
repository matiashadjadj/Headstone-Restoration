# Headstone Restoration

## Project Overview

Headstone Restoration is a headstone restoration service. This app is the company's internal workflow tool for managing customers, cemeteries, memorials, restoration jobs, scheduling, employee access, invoices, communication, and photo archives.

The project is organized as:

- `backend/`: Django application with REST API endpoints, authentication, employee invite flow, service scheduling, payment hooks, email delivery, and static hosting for the frontend
- `frontend/`: React-based single-page interface served as static assets by Django
- `render.yaml`: Render deployment configuration for the production web service and PostgreSQL database

Live deployment:

- `https://headstone-restoration.onrender.com`

### Core Features

- Customer, cemetery, memorial, and plot management
- Service scheduling and technician assignment
- Role-based application areas for admin, front desk, employee, and customer views
- Photo archive and service photo uploads
- Employee account invites and password setup flow
- Invoice and Stripe checkout endpoints
- Customer email and survey support

## Setup Instructions

### Prerequisites

- Python 3.12+
- `pip`
- A virtual environment
- PostgreSQL for full local backend functionality, unless you point `DATABASE_URL` at another supported database

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd Headstone-Restoration
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

For the backend application, install the backend requirements:

```bash
pip install -r backend/requirements.txt
```

Note: there is also a large top-level `requirements.txt`, but the deploy configuration and backend app use `backend/requirements.txt`.

### 4. Configure environment variables

Create or update `backend/.env` with the values needed for your local environment.

Minimum variables to check:

```env
DJANGO_SECRET_KEY=change-me
DEBUG=1
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mysite
```

Optional integrations:

```env
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
EMAIL_PROVIDER=django
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DEFAULT_FROM_EMAIL=headstone@restoration.com
PANEL_FROM_EMAIL=headstone@restoration.com
INVITE_FROM_EMAIL=headstone@restoration.com
EMAIL_DEFAULT_REPLY_TO=
EMAIL_FRONTEND_BASE_URL=
INVITE_EXPIRY_HOURS=72
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=1
EMAIL_TIMEOUT_SECONDS=10
```

### 5. Run migrations

```bash
cd backend
python3 manage.py migrate
```

### 6. Start the app

Recommended local startup:

```bash
./start.sh
```

This script:

- activates the virtual environment if it exists in `backend/venv` or the repo-level `venv`
- runs migrations by default
- starts Django on an available local port
- serves the frontend through Django at `/static/index.html`

After startup, open:

- App entrypoint: `http://127.0.0.1:8000/static/index.html`
- API root prefix: `http://127.0.0.1:8000/api/`

If port `8000` is already in use, `start.sh` can auto-select another open backend port.

### Production Notes

Deployment is configured for Render using:

- `render.yaml`
- `build.sh`

The production service:

- installs dependencies
- collects static files
- runs migrations
- starts Django with Gunicorn/Uvicorn

Production URL:

- `https://headstone-restoration.onrender.com`

## Team Member Contributions

- Matias: backend development, database and data model design, API work, authentication and employee invite flows, deployment configuration, created and developed core application features, and overall application integration
- Mitchell: frontend development, UI/workflow updates, and general project assistance during development

## Known Issues

- Automated test coverage still needs improvement. The backend currently does not have a meaningful pytest suite, so more tests should be added for API endpoints and internal workflow logic.
- The UI and internal workflows can continue to be refined as we get feedback. Areas like scheduling, reporting, and role-based dashboards can be improved further based on staff feedback.
- Error handling and form validation can be expanded in some areas to make the internal tool more consistent and easier for staff to use.

