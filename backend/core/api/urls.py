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
    SendCustomerEmailView,
    CustomerManageListCreateView,
    CustomerManageDetailView,
    EmployeeRoleListView,
    EmployeeRoleDetailView,
    EmployeeCreateView,
)

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("memorials/", MemorialListView.as_view(), name="memorial-list"),
    path("customers/", CustomerListView.as_view(), name="customer-list"),
    path("cemeteries/", CemeteryListView.as_view(), name="cemetery-list"),
    path("technicians/", TechnicianListView.as_view(), name="technician-list"),
    path("scheduling/services/", SchedulingServiceListView.as_view(), name="scheduling-service-list"),
    path("scheduling/services/create/", SchedulingServiceCreateView.as_view(), name="scheduling-service-create"),
    path("emails/send/", SendCustomerEmailView.as_view(), name="emails-send"),
    path("manage/customers/", CustomerManageListCreateView.as_view(), name="manage-customers"),
    path("manage/customers/<int:customer_id>/", CustomerManageDetailView.as_view(), name="manage-customer-detail"),
    path("manage/employees/", EmployeeRoleListView.as_view(), name="manage-employees"),
    path("manage/employees/create/", EmployeeCreateView.as_view(), name="manage-employees-create"),
    path("manage/employees/<int:employee_id>/", EmployeeRoleDetailView.as_view(), name="manage-employee-detail"),
    path("manager/services/<int:service_id>/assign/", AssignTechnicianView.as_view()),
]
