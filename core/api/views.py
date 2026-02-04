from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from core.models import Service, Employee, ServiceAssignment
from core.api.permissions import IsManager
from core.api.serializers import AssignTechnicianSerializer

class AssignTechnicianView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, service_id):
        s = Service.objects.get(id=service_id)

        serializer = AssignTechnicianSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tech_id = serializer.validated_data["technician_id"]
        scheduled_date = serializer.validated_data["scheduled_date"]

        tech = Employee.objects.get(id=tech_id, role=Employee.Role.TECH)

        # if one-tech-per-service v1:
        ServiceAssignment.objects.update_or_create(
            service=s,
            defaults={"employee": tech}
        )

        s.scheduled_date = scheduled_date
        s.status = "scheduled"   # or Service.Status.SCHEDULED if you use TextChoices
        s.save()

        return Response({"ok": True}, status=status.HTTP_200_OK)