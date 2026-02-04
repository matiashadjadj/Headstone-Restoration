from django.urls import path
from .views import AssignTechnicianView

urlpatterns = [
    path("manager/services/<int:service_id>/assign/", AssignTechnicianView.as_view()),
]