from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.authentication import BasicAuthentication
from django.utils import timezone
from django.db import models, transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth.models import User

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
    SendCustomerEmailSerializer,
    CustomerUpsertSerializer,
    EmployeeRoleSerializer,
    EmployeeRoleUpdateSerializer,
    EmployeeCreateSerializer,
)


def scheduling_services_queryset():
    return (
        Service.objects.select_related("memorial__customer", "memorial__plot__cemetery")
        .prefetch_related("assignments__employee")
        .annotate(
            price=models.Subquery(
                Invoice.objects.filter(service=models.OuterRef("pk"))
                .order_by("-issued_date", "-created_at")
                .values("total_amount")[:1]
            )
        )
    )


def set_service_price(service, amount):
    if amount is None:
        return

    invoice = (
        Invoice.objects.filter(service=service)
        .order_by("-issued_date", "-created_at")
        .first()
    )
    if invoice:
        invoice.total_amount = amount
        if not invoice.issued_date:
            invoice.issued_date = timezone.localdate()
        if not invoice.customer_id:
            invoice.customer = service.memorial.customer
        invoice.save(update_fields=["total_amount", "issued_date", "customer", "updated_at"])
        return

    Invoice.objects.create(
        customer=service.memorial.customer,
        service=service,
        status=Invoice.Status.DRAFT,
        currency="usd",
        issued_date=timezone.localdate(),
        total_amount=amount,
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
        price = serializer.validated_data.get("price")
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
        set_service_price(s, price)

        if gps_lat is not None and gps_lng is not None:
            plot = s.memorial.plot
            plot.gps_lat = gps_lat
            plot.gps_lng = gps_lng
            plot.save(update_fields=["gps_lat", "gps_lng", "updated_at"])

        payload = SchedulingServiceSerializer(
            scheduling_services_queryset()
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
            scheduling_services_queryset()
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
        initial_price = serializer.validated_data.get("initial_price")

        service = Service.objects.create(
            memorial=memorial,
            service_type=service_type,
            status=Service.Status.DRAFT,
        )
        set_service_price(service, initial_price)
        payload = SchedulingServiceSerializer(
            scheduling_services_queryset()
            .get(id=service.id)
        ).data
        return Response({"ok": True, "service": payload}, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name="dispatch")
class SendCustomerEmailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    @staticmethod
    def _render_template(template: str, customer: Customer) -> str:
        full_name = customer.full_name or ""
        first_name = full_name.split(" ")[0] if full_name else "Client"
        replacements = {
            "{{client_name}}": full_name or "Client",
            "{{customer_name}}": full_name or "Client",
            "{{first_name}}": first_name,
            "{{email}}": customer.email or "",
        }
        result = template
        for token, value in replacements.items():
            result = result.replace(token, value)
        return result

    def post(self, request):
        serializer = SendCustomerEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer_ids = serializer.validated_data["customer_ids"]
        subject_template = serializer.validated_data["subject"]
        body_template = serializer.validated_data["body"]

        customers = {
            c.id: c for c in Customer.objects.filter(id__in=customer_ids)
        }

        missing_ids = [cid for cid in customer_ids if cid not in customers]
        if missing_ids:
            return Response(
                {"detail": f"Unknown customer IDs: {missing_ids}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "headstone@restoration.com")
        sent = []
        skipped = []
        failed = []

        for customer_id in customer_ids:
            customer = customers[customer_id]
            if not customer.email:
                skipped.append({"customer_id": customer.id, "name": customer.full_name, "reason": "missing_email"})
                continue

            rendered_subject = self._render_template(subject_template, customer)
            rendered_body = self._render_template(body_template, customer)
            try:
                send_mail(
                    subject=rendered_subject,
                    message=rendered_body,
                    from_email=from_email,
                    recipient_list=[customer.email],
                    fail_silently=False,
                )
                sent.append({"customer_id": customer.id, "name": customer.full_name, "email": customer.email})
            except Exception as exc:  # pragma: no cover - defensive for SMTP runtime failures
                failed.append({
                    "customer_id": customer.id,
                    "name": customer.full_name,
                    "email": customer.email,
                    "error": str(exc),
                })

        return Response(
            {
                "ok": len(failed) == 0,
                "from_email": from_email,
                "sent_count": len(sent),
                "skipped_count": len(skipped),
                "failed_count": len(failed),
                "sent": sent,
                "skipped": skipped,
                "failed": failed,
            },
            status=status.HTTP_200_OK if len(failed) == 0 else status.HTTP_207_MULTI_STATUS,
        )


@method_decorator(csrf_exempt, name="dispatch")
class CustomerManageListCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        qs = (
            Customer.objects.annotate(
                memorials_count=models.Count("memorials", distinct=True),
                last_contact=models.Max("memorials__services__completed_date"),
            )
            .order_by("full_name")
        )
        return Response(CustomerSummarySerializer(qs, many=True).data)

    def post(self, request):
        serializer = CustomerUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()
        customer_payload = (
            Customer.objects.filter(id=customer.id)
            .annotate(
                memorials_count=models.Count("memorials", distinct=True),
                last_contact=models.Max("memorials__services__completed_date"),
            )
            .first()
        )
        return Response(
            {"ok": True, "customer": CustomerSummarySerializer(customer_payload).data},
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class CustomerManageDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def patch(self, request, customer_id):
        customer = get_object_or_404(Customer, id=customer_id)
        serializer = CustomerUpsertSerializer(customer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()
        customer_payload = (
            Customer.objects.filter(id=customer.id)
            .annotate(
                memorials_count=models.Count("memorials", distinct=True),
                last_contact=models.Max("memorials__services__completed_date"),
            )
            .first()
        )
        return Response(
            {"ok": True, "customer": CustomerSummarySerializer(customer_payload).data},
            status=status.HTTP_200_OK,
        )

    def delete(self, request, customer_id):
        customer = get_object_or_404(Customer, id=customer_id)
        customer.delete()
        return Response({"ok": True}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class EmployeeRoleListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        employees = Employee.objects.select_related("user").order_by("full_name")
        return Response(EmployeeRoleSerializer(employees, many=True).data)


@method_decorator(csrf_exempt, name="dispatch")
class EmployeeRoleDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def patch(self, request, employee_id):
        employee = get_object_or_404(Employee, id=employee_id)
        serializer = EmployeeRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if "role" in serializer.validated_data:
            employee.role = serializer.validated_data["role"]
        if "is_active" in serializer.validated_data:
            employee.is_active = serializer.validated_data["is_active"]
        employee.save(update_fields=["role", "is_active", "updated_at"])
        return Response({"ok": True, "employee": EmployeeRoleSerializer(employee).data}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class EmployeeCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def post(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data.get("role", Employee.Role.TECH)

        with transaction.atomic():
            user = User.objects.create_user(
                username=serializer.validated_data["username"],
                password=serializer.validated_data["password"],
            )
            employee = Employee.objects.create(
                user=user,
                full_name=serializer.validated_data["full_name"],
                email=serializer.validated_data.get("email", ""),
                phone=serializer.validated_data.get("phone", ""),
                role=role,
                is_active=True,
            )

        return Response({"ok": True, "employee": EmployeeRoleSerializer(employee).data}, status=status.HTTP_201_CREATED)


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
