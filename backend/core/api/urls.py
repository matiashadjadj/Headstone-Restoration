from django.urls import path
from .views import (
    AssignTechnicianView,
    DashboardSummaryView,
    MemorialListView,
    CustomerListView,
    CemeteryListView,
    TechnicianListView,
    SchedulingServiceListView,
    SchedulingServiceCreateView,
)

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("memorials/", MemorialListView.as_view(), name="memorial-list"),
    path("customers/", CustomerListView.as_view(), name="customer-list"),
    path("cemeteries/", CemeteryListView.as_view(), name="cemetery-list"),
    path("technicians/", TechnicianListView.as_view(), name="technician-list"),
    path("scheduling/services/", SchedulingServiceListView.as_view(), name="scheduling-service-list"),
    path("scheduling/services/create/", SchedulingServiceCreateView.as_view(), name="scheduling-service-create"),
    path("manager/services/<int:service_id>/assign/", AssignTechnicianView.as_view()),
]
