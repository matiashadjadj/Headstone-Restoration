from pathlib import Path
import os
import dj_database_url 


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")


def env_trimmed(key: str, default: str = "") -> str:
    value = os.environ.get(key, default)
    return value.strip() if isinstance(value, str) else value


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env_trimmed("DEBUG", "0").lower() in {"1", "true", "yes", "on"}

ALLOWED_HOSTS = [
    "headstone-restoration.onrender.com",
    "127.0.0.1",
    "localhost",
]

EXTRA_ALLOWED_HOSTS = [
    host.strip() for host in env_trimmed("ALLOWED_HOSTS", "").split(",") if host.strip()
]
for host in EXTRA_ALLOWED_HOSTS:
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'communications',
    'core',
    'payments',
    'rest_framework',
    'django_extensions'
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}


# Allow frontend dev server to call the API while Django runs on port 8000.
CORS_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://127\.0\.0\.1:\d+$",
    r"^http://localhost:\d+$",
]
CORS_ALLOW_CREDENTIALS = True

# Django CSRF origin checks for browser POSTs from the frontend dev server.
# start.sh may auto-pick ports above 5173, so trust that local range.
CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
] + [
    f"http://127.0.0.1:{port}" for port in range(5173, 5201)
] + [
    f"http://localhost:{port}" for port in range(5173, 5201)
]


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases
DATABASES = {
    'default': dj_database_url.config(
        # Replace this value with your local database's connection string.
        default='postgresql://postgres:postgres@localhost:5432/mysite',
        conn_max_age=600
    )
}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = []


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = '/static/'

# Additional static dirs (app static already discovered via AppDirectoriesFinder)
FRONTEND_STATIC_CANDIDATES = [
    BASE_DIR.parent / "frontend",
    BASE_DIR.parent / "frontent",
]
STATICFILES_DIRS = [
    path
    for path in [
        BASE_DIR / "core" / "static",
        *[path for path in FRONTEND_STATIC_CANDIDATES if path.exists()],
    ]
    if path.exists()
]

if not DEBUG:
    # Tell Django to copy static assets into a path called `staticfiles` (this is specific to Render)
    STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

    # Enable the WhiteNoise storage backend, which compresses static files to reduce disk use
    # and renames the files with unique names for each version to support long-term caching
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")

# Email (defaults are development-friendly and can be overridden by env vars)
# EMAIL_PROVIDER selects the reusable service/provider path. The first
# implementation uses Django's configured email backend, which defaults to the
# console backend locally and can be switched to SMTP or another backend in production.
EMAIL_PROVIDER = env_trimmed("EMAIL_PROVIDER", "django").lower()
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "headstone@restoration.com")
PANEL_FROM_EMAIL = env_trimmed("PANEL_FROM_EMAIL", DEFAULT_FROM_EMAIL)
INVITE_FROM_EMAIL = env_trimmed("INVITE_FROM_EMAIL", DEFAULT_FROM_EMAIL)
EMAIL_DEFAULT_REPLY_TO = env_trimmed("EMAIL_DEFAULT_REPLY_TO", "")
EMAIL_FRONTEND_BASE_URL = env_trimmed("EMAIL_FRONTEND_BASE_URL", "")
INVITE_EXPIRY_HOURS = int(env_trimmed("INVITE_EXPIRY_HOURS", "72") or "72")
CUSTOMER_SURVEY_EXPIRY_DAYS = int(env_trimmed("CUSTOMER_SURVEY_EXPIRY_DAYS", "14") or "14")
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_trimmed("EMAIL_USE_TLS", "1") in {"1", "true", "True", "yes", "YES"}
EMAIL_TIMEOUT = int(env_trimmed("EMAIL_TIMEOUT_SECONDS", "10") or "10")
