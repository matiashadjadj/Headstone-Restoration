from django.urls import path, include
from .views import dashboard

urlpatterns = [
    path("dashboard/", dashboard, name="dashboard"),
    path("api-auth/", include("rest_framework.urls")),
    path("api/", include("core.api.urls")),
]
