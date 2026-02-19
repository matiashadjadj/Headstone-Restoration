from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.utils import timezone
from django.db import models
from django.db.models import Q, Sum

from core.models import Service, Employee, ServiceAssignment, Invoice, Memorial, Customer, Cemetery
from core.api.permissions import IsManager
from core.api.serializers import (
    AssignTechnicianSerializer,
    DashboardServiceSerializer,
    RecentServiceSerializer,
    MemorialSummarySerializer,
    CustomerSummarySerializer,
    CemeterySummarySerializer,
)

class AssignTechnicianView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, service_id):
        s = Service.objects.get(id=service_id)

        serializer = AssignTechnicianSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tech_id = serializer.validated_data["technician_id"]
        scheduled_start = serializer.validated_data["scheduled_start"]
        estimated_minutes = serializer.validated_data["estimated_minutes"]

        tech = Employee.objects.get(id=tech_id, role=Employee.Role.TECH)

        # if one-tech-per-service v1:
        ServiceAssignment.objects.update_or_create(
            service=s,
            defaults={"employee": tech}
        )

        s.scheduled_start = scheduled_start
        s.estimated_minutes = estimated_minutes
        s.scheduled_date = scheduled_start.date()
        s.status = Service.Status.SCHEDULED
        s.save()

        return Response({"ok": True}, status=status.HTTP_200_OK)


class DashboardSummaryView(APIView):
    """
    Lightweight dashboard endpoint consumed by the static frontend.
    Uses AllowAny so the demo can load without auth; tighten in production.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        today = now.date()

        base_qs = (
            Service.objects.select_related(
                "memorial__customer",
                "memorial__plot__cemetery",
            )
        )

        active_qs = base_qs.filter(
            status__in=[Service.Status.SCHEDULED, Service.Status.IN_PROGRESS]
        )

        upcoming_qs = active_qs.order_by("scheduled_start", "created_at")[:5]

        completed_count = base_qs.filter(status=Service.Status.COMPLETED).count()
        total_services = base_qs.count()

        scheduled_today = active_qs.filter(
            Q(scheduled_start__date=today) | Q(scheduled_date=today)
        ).count()

        crew_count = (
            ServiceAssignment.objects.filter(service__in=active_qs)
            .values("employee_id")
            .distinct()
            .count()
        )

        total_revenue = Invoice.objects.aggregate(total=Sum("total_amount"))["total"] or 0

        recent_completed_qs = (
            base_qs.filter(status=Service.Status.COMPLETED)
            .order_by(models.F("completed_date").desc(nulls_last=True), "-created_at")[:5]
            .annotate(amount=models.Subquery(
                Invoice.objects.filter(service=models.OuterRef("pk"))
                .order_by("-issued_date", "-created_at")
                .values("total_amount")[:1]
            ))
        )

        completion_rate = 0.0
        if total_services:
            completion_rate = round((completed_count / total_services) * 100, 1)

        data = {
            "summary": {
                "total_revenue": float(total_revenue),
                "active_services": active_qs.count(),
                "services_today": scheduled_today,
                "crews_active": crew_count,
                "completion_rate": completion_rate,
            },
            "upcoming_services": DashboardServiceSerializer(upcoming_qs, many=True).data,
            "recent_completed": RecentServiceSerializer(recent_completed_qs, many=True).data,
        }

        return Response(data, status=status.HTTP_200_OK)


class MemorialListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            Memorial.objects.select_related("customer", "plot__cemetery")
            .annotate(
                last_service_status=models.Subquery(
                    Service.objects.filter(memorial=models.OuterRef("pk"))
                    .order_by("-completed_date", "-created_at")
                    .values("status")[:1]
                ),
                last_service_date=models.Subquery(
                    Service.objects.filter(memorial=models.OuterRef("pk"))
                    .order_by("-completed_date", "-created_at")
                    .values("completed_date")[:1]
                ),
            )
            .order_by("customer__full_name")
        )
        return Response(MemorialSummarySerializer(qs, many=True).data)


class CustomerListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            Customer.objects.annotate(
                memorials_count=models.Count("memorials", distinct=True),
                last_contact=models.Max("memorials__services__completed_date"),
            )
            .order_by("full_name")
        )
        return Response(CustomerSummarySerializer(qs, many=True).data)


class CemeteryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            Cemetery.objects.annotate(
                memorials_count=models.Count("plots__memorials", distinct=True),
                active_services=models.Count(
                    "plots__memorials__services",
                    filter=models.Q(plots__memorials__services__status__in=[Service.Status.SCHEDULED, Service.Status.IN_PROGRESS]),
                    distinct=True,
                ),
            )
            .order_by("name")
        )
        return Response(CemeterySummarySerializer(qs, many=True).data)
