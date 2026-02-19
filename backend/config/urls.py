from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.views.generic import RedirectView
from django.templatetags.static import static

urlpatterns = [
    # Serve the bundled frontend (static) from the root for same-origin API calls.
    path("", RedirectView.as_view(url="/static/index.html", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/", include("core.api.urls")),
    path("", include("core.urls")),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
