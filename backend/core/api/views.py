from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.authentication import BasicAuthentication
from django.utils import timezone
from django.db import models
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from core.models import Service, Employee, ServiceAssignment, Invoice, Memorial, Customer, Cemetery
from core.api.serializers import (
    AssignTechnicianSerializer,
    DashboardServiceSerializer,
    RecentServiceSerializer,
    MemorialSummarySerializer,
    CustomerSummarySerializer,
    CemeterySummarySerializer,
    TechnicianSerializer,
    SchedulingServiceSerializer,
    CreateSchedulingServiceSerializer,
)

@method_decorator(csrf_exempt, name="dispatch")
class AssignTechnicianView(APIView):
    # Keep open in this demo app; tighten permissions for production.
    authentication_classes = [BasicAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, service_id):
        s = get_object_or_404(Service.objects.select_related("memorial__plot"), id=service_id)

        serializer = AssignTechnicianSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tech_id = serializer.validated_data["technician_id"]
        scheduled_start = serializer.validated_data["scheduled_start"]
        estimated_minutes = serializer.validated_data["estimated_minutes"]
        gps_lat = serializer.validated_data.get("gps_lat")
        gps_lng = serializer.validated_data.get("gps_lng")

        tech = get_object_or_404(Employee, id=tech_id, role=Employee.Role.TECH, is_active=True)

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

        if gps_lat is not None and gps_lng is not None:
            plot = s.memorial.plot
            plot.gps_lat = gps_lat
            plot.gps_lng = gps_lng
            plot.save(update_fields=["gps_lat", "gps_lng", "updated_at"])

        payload = SchedulingServiceSerializer(
            Service.objects.select_related("memorial__customer", "memorial__plot__cemetery")
            .prefetch_related("assignments__employee")
            .get(id=s.id)
        ).data
        return Response({"ok": True, "service": payload}, status=status.HTTP_200_OK)


class TechnicianListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        techs = (
            Employee.objects.filter(role=Employee.Role.TECH, is_active=True)
            .order_by("full_name")
        )
        return Response(TechnicianSerializer(techs, many=True).data)


class SchedulingServiceListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        services = (
            Service.objects.select_related("memorial__customer", "memorial__plot__cemetery")
            .prefetch_related("assignments__employee")
            .filter(status__in=[Service.Status.DRAFT, Service.Status.SCHEDULED, Service.Status.IN_PROGRESS])
            .order_by(
                models.F("scheduled_start").asc(nulls_last=True),
                "-created_at",
            )
        )
        return Response(SchedulingServiceSerializer(services, many=True).data)


class SchedulingServiceCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def post(self, request):
        serializer = CreateSchedulingServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        memorial = get_object_or_404(Memorial, id=serializer.validated_data["memorial_id"])
        service_type = serializer.validated_data.get("service_type", Service.ServiceType.OTHER)

        service = Service.objects.create(
            memorial=memorial,
            service_type=service_type,
            status=Service.Status.DRAFT,
        )
        payload = SchedulingServiceSerializer(
            Service.objects.select_related("memorial__customer", "memorial__plot__cemetery")
            .prefetch_related("assignments__employee")
            .get(id=service.id)
        ).data
        return Response({"ok": True, "service": payload}, status=status.HTTP_201_CREATED)


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

        upcoming_qs = (
            active_qs
            .filter(scheduled_start__isnull=False)
            .order_by("scheduled_start", "created_at")[:5]
        )

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
