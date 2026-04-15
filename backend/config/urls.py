from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.shortcuts import redirect
from django.views.generic import RedirectView

urlpatterns = [
    # Serve the bundled frontend (static) from the root for same-origin API calls.
    path("", RedirectView.as_view(url="/static/index.html", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/", include("core.api.urls")),
    path("", include("core.urls")),
]


def spa_redirect(request, role, spa_path=""):
    parts = [role.strip("/")]
    if spa_path:
        parts.append(spa_path.lstrip("/"))
    normalized = "/" + "/".join(parts)
    return redirect(f"/static/index.html#{normalized}")


# Allow direct loads and browser refreshes on the hash-routed app sections.
urlpatterns += [
    re_path(r"^(frontdesk|employee|customer)(?:/(?P<spa_path>.*))?$", spa_redirect),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
