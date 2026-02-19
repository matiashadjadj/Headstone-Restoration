from django.urls import path
from .views import (
    AssignTechnicianView,
    DashboardSummaryView,
    MemorialListView,
    CustomerListView,
    CemeteryListView,
)

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("memorials/", MemorialListView.as_view(), name="memorial-list"),
    path("customers/", CustomerListView.as_view(), name="customer-list"),
    path("cemeteries/", CemeteryListView.as_view(), name="cemetery-list"),
    path("manager/services/<int:service_id>/assign/", AssignTechnicianView.as_view()),
]
