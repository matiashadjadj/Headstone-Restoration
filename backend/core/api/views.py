from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import BasicAuthentication, SessionAuthentication
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from datetime import timedelta
from django.utils import timezone
from django.db import models, transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.csrf import ensure_csrf_cookie
from django.conf import settings
from django.http import Http404
from django.contrib.auth import login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from html import escape
import re
from urllib.parse import urlparse

from communications.exceptions import EmailDeliveryError
from communications.services import resolve_from_email, send_email
from core.models import Service, ServiceOption, Employee, EmployeeInvite, UserProfile, ServiceAssignment, Invoice, Memorial, Customer, Cemetery, Plot, Payment, Photo, CustomerSurveyRequest, CustomerSurveySubmission
from payments import stripe_client
from core.api.serializers import (
    AssignTechnicianSerializer,
    DashboardServiceSerializer,
    RecentServiceSerializer,
    MemorialSummarySerializer,
    MemorialCreateSerializer,
    CustomerSummarySerializer,
    CemeterySummarySerializer,
    CemeteryUpsertSerializer,
    TechnicianSerializer,
    SchedulingServiceSerializer,
    CreateSchedulingServiceSerializer,
    ServiceOptionSerializer,
    ServiceOptionUpsertSerializer,
    PhotoArchiveSerializer,
    PhotoUploadSerializer,
    SendCustomerEmailSerializer,
    CustomerUpsertSerializer,
    EmployeeRoleSerializer,
    EmployeeRoleUpdateSerializer,
    EmployeeCreateSerializer,
    EmployeeInviteSerializer,
    LoginSerializer,
    PasswordSetupSerializer,
    PasswordSetupValidateSerializer,
    SessionUserSerializer,
    UserProfileDetailSerializer,
    UserProfileSerializer,
    CustomerInvoiceSerializer,
    AdminInvoiceSerializer,
    CreateCheckoutSessionSerializer,
    VerifyCheckoutSessionSerializer,
    AdminSendInvoiceSerializer,
    CustomerSurveyDetailSerializer,
    CustomerSurveyRequestCreateSerializer,
    CustomerSurveyRequestSerializer,
    CustomerSurveySubmissionSerializer,
    PublicCustomerSurveySubmissionSerializer,
    PublicSurveyContextSerializer,
)

INVALID_INVITE_MESSAGE = "Invite is invalid or expired."

DEFAULT_INVOICE_SUBJECT = "Invoice #{{invoice_id}} for {{client_name}}"
DEFAULT_INVOICE_BODY = (
    "Hello {{client_name}},\n\n"
    "Your invoice for {{service_name}} is ready.\n"
    "Amount due: {{amount_due}}\n"
    "Due date: {{due_date}}\n\n"
    "Pay securely here:\n"
    "{{payment_link}}\n\n"
    "If you have any questions, reply to this email.\n\n"
    "Best regards,\n"
    "Headstone Restoration"
)

EMAIL_BRAND_LOGO_ICON_PATH = "/static/logo-icon.png"
EMAIL_BRAND_URL_RE = re.compile(r"https?://[^\s<]+")


def resolve_session_user(user, request=None):
    if not user or not user.is_authenticated:
        return None

    employee = getattr(user, "employee", None)
    profile = getattr(user, "profile", None)
    profile_photo_url = ""
    if profile and profile.profile_photo:
        try:
            profile_photo_url = request.build_absolute_uri(profile.profile_photo.url) if request else profile.profile_photo.url
        except Exception:
            profile_photo_url = profile.profile_photo.url
    phone = employee.phone if employee else ""
    if employee:
        if employee.role == Employee.Role.ADMIN:
            frontend_role = "admin"
        elif employee.role == Employee.Role.FRONT_DESK:
            frontend_role = "frontdesk"
        else:
            frontend_role = "employee"
        full_name = employee.full_name or user.get_full_name() or user.username
        payload = {
            "id": user.id,
            "username": user.username,
            "full_name": full_name,
            "email": employee.email or user.email or "",
            "phone": phone or "",
            "profile_photo_url": profile_photo_url,
            "frontend_role": frontend_role,
            "source_role": employee.role,
        }
        return SessionUserSerializer(payload).data

    if user.is_superuser:
        payload = {
            "id": user.id,
            "username": user.username,
            "full_name": user.get_full_name() or user.username,
            "email": user.email or "",
            "phone": phone or "",
            "profile_photo_url": profile_photo_url,
            "frontend_role": "admin",
            "source_role": "admin",
        }
        return SessionUserSerializer(payload).data

    customer = None
    if user.email:
        customer = Customer.objects.filter(email__iexact=user.email).first()
    if customer:
        payload = {
            "id": user.id,
            "username": user.username,
            "full_name": customer.full_name or user.get_full_name() or user.username,
            "email": customer.email or user.email or "",
            "phone": customer.phone or "",
            "profile_photo_url": profile_photo_url,
            "frontend_role": "customer",
            "source_role": "customer",
        }
        return SessionUserSerializer(payload).data

    return None


def render_customer_template(template: str, *, replacements: dict[str, str]) -> str:
    result = template or ""
    for token, value in replacements.items():
        result = result.replace(token, value or "")
    return result


def build_invoice_template_replacements(*, invoice: Invoice, checkout_url: str) -> dict[str, str]:
    customer_name = invoice.customer.full_name or "Client"
    first_name = customer_name.split(" ")[0] if customer_name else "Client"
    service_name = invoice.service.service_type_label if invoice.service_id and invoice.service else "your service"
    due_date = invoice.due_date.isoformat() if invoice.due_date else "Upon receipt"
    return {
        "{{client_name}}": customer_name,
        "{{customer_name}}": customer_name,
        "{{first_name}}": first_name,
        "{{email}}": invoice.customer.email or "",
        "{{invoice_id}}": str(invoice.id),
        "{{amount_due}}": f"${invoice.total_amount:.2f}",
        "{{due_date}}": due_date,
        "{{service_name}}": service_name,
        "{{payment_link}}": checkout_url,
    }


def build_branded_email_html(*, request, text_body: str, cta_url: str = "", cta_label: str = "Open link") -> str:
    icon_url = request.build_absolute_uri(EMAIL_BRAND_LOGO_ICON_PATH)

    safe_body = escape(text_body or "")
    safe_body = EMAIL_BRAND_URL_RE.sub(
        lambda match: f'<a href="{match.group(0)}" style="color:#2563eb;text-decoration:none;word-break:break-word;">{match.group(0)}</a>',
        safe_body,
    )
    safe_body = safe_body.replace("\n", "<br>")

    cta_html = ""
    if cta_url:
        safe_cta_url = escape(cta_url, quote=True)
        safe_cta_label = escape(cta_label or "Open link")
        cta_html = (
            '<div style="margin-top:24px;text-align:center;">'
            f'<a href="{safe_cta_url}" '
            'style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;'
            'padding:12px 20px;border-radius:999px;font-weight:700;letter-spacing:0.01em;">'
            f"{safe_cta_label}"
            "</a>"
            "</div>"
        )

    signature_html = (
        '<table role="presentation" style="margin-top:32px;width:100%;border-collapse:collapse;">'
        '<tr>'
        '<td style="padding-top:20px;border-top:1px solid #e2e8f0;">'
        '<table role="presentation" style="border-collapse:collapse;">'
        '<tr>'
        '<td style="width:48px;padding-right:12px;vertical-align:middle;">'
        f'<img src="{icon_url}" alt="Headstone Restoration" style="display:block;width:40px;height:40px;object-fit:contain;border-radius:12px;" />'
        '</td>'
        '<td style="vertical-align:middle;font-size:13px;line-height:1.5;color:#475569;">'
        '<div style="font-size:14px;font-weight:700;color:#0f172a;">Headstone Restoration</div>'
        '<div>Memorial care and restoration</div>'
        '</td>'
        '</tr>'
        '</table>'
        '</td>'
        '</tr>'
        '</table>'
    )

    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,0.12);">
      <div style="padding:30px 32px 34px;font-size:16px;line-height:1.7;">
        <div style="white-space:normal;">{safe_body}</div>
        {cta_html}
        {signature_html}
      </div>
    </div>
  </body>
</html>"""


def get_employee_invite_or_404(token: str) -> EmployeeInvite:
    invite = get_object_or_404(
        EmployeeInvite.objects.select_related("employee", "user"),
        token=token,
    )
    if not invite.is_active:
        raise Http404
    return invite


def build_frontend_invite_url(request, token: str) -> str:
    configured_base = (getattr(settings, "EMAIL_FRONTEND_BASE_URL", "") or "").rstrip("/")
    if configured_base.endswith(".html"):
        return f"{configured_base}?invite={token}#/setup-password"
    if configured_base:
        return f"{configured_base}/index.html?invite={token}#/setup-password"
    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin:
        try:
            origin_host = urlparse(origin).netloc
        except Exception:
            origin_host = ""
        request_host = request.get_host()
        if origin_host and origin_host != request_host:
            return f"{origin}/index.html?invite={token}#/setup-password"
    base = request.build_absolute_uri("/static/index.html")
    return f"{base}?invite={token}#/setup-password"


def build_frontend_survey_url(request, token: str) -> str:
    configured_base = (getattr(settings, "EMAIL_FRONTEND_BASE_URL", "") or "").rstrip("/")
    if configured_base.endswith(".html"):
        return f"{configured_base}#/survey/{token}"
    if configured_base:
        return f"{configured_base}/index.html#/survey/{token}"
    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin:
        try:
            origin_host = urlparse(origin).netloc
        except Exception:
            origin_host = ""
        request_host = request.get_host()
        if origin_host and origin_host != request_host:
            return f"{origin}/index.html#/survey/{token}"
    base = request.build_absolute_uri("/static/index.html")
    return f"{base}#/survey/{token}"


def send_customer_survey_email(request, survey_request: CustomerSurveyRequest) -> str:
    service = survey_request.service
    customer = service.memorial.customer
    survey_url = build_frontend_survey_url(request, survey_request.token)
    service_name = service.service_type_label or "service"
    cemetery_name = service.memorial.plot.cemetery.name if service.memorial_id else ""
    greeting_name = customer.full_name or "there"

    send_email(
        subject=f"Complete your {service_name} survey",
        text_body=(
            f"Hello {greeting_name},\n\n"
            f"We created your {service_name} job"
            f"{f' for {cemetery_name}' if cemetery_name else ''}.\n"
            f"Please complete this survey so we can confirm the memorial location and details:\n\n"
            f"{survey_url}\n\n"
            f"This link expires in {getattr(settings, 'CUSTOMER_SURVEY_EXPIRY_DAYS', 14)} days."
        ),
        html_body=build_branded_email_html(
            request=request,
            text_body=(
                f"Hello {greeting_name},\n\n"
                f"We created your {service_name} job"
                f"{f' for {cemetery_name}' if cemetery_name else ''}.\n"
                f"Please complete this survey so we can confirm the memorial location and details:\n\n"
                f"{survey_url}\n\n"
                f"This link expires in {getattr(settings, 'CUSTOMER_SURVEY_EXPIRY_DAYS', 14)} days."
            ),
            cta_url=survey_url,
            cta_label="Open survey"
        ),
        recipient_list=[customer.email],
        purpose="panel",
        reply_to=[settings.EMAIL_DEFAULT_REPLY_TO] if getattr(settings, "EMAIL_DEFAULT_REPLY_TO", "") else [],
        metadata={
            "flow": "customer_survey",
            "customer_id": customer.id,
            "service_id": service.id,
            "survey_request_id": survey_request.id,
        },
    )
    return survey_url


def create_placeholder_memorial(customer: Customer) -> Memorial:
    placeholder_cemetery = Cemetery.objects.create(
        name=f"Survey Pending - {customer.full_name or f'Customer {customer.id}'}",
    )
    placeholder_plot = Plot.objects.create(
        cemetery=placeholder_cemetery,
        section="TBD",
        row="TBD",
        plot_number=f"pending-{customer.id}",
    )
    return Memorial.objects.create(customer=customer, plot=placeholder_plot)


def apply_manual_job_details(
    memorial: Memorial,
    *,
    cemetery_name: str,
    cemetery_address: str,
    section: str,
    row: str,
    plot_number: str,
    gps_lat,
    gps_lng,
    locating_notes: str,
):
    current_plot = memorial.plot
    cemetery = current_plot.cemetery
    cleaned_cemetery_name = (cemetery_name or "").strip()
    cleaned_cemetery_address = (cemetery_address or "").strip()
    cleaned_section = (section or current_plot.section or "").strip()
    cleaned_row = (row or current_plot.row or "").strip()
    cleaned_plot_number = (plot_number or current_plot.plot_number or "").strip()
    cleaned_locating_notes = (locating_notes or "").strip()

    if cleaned_cemetery_name:
        matched_cemetery = Cemetery.objects.filter(name__iexact=cleaned_cemetery_name).order_by("id").first()
        if matched_cemetery:
            cemetery = matched_cemetery
        else:
            cemetery = Cemetery.objects.create(name=cleaned_cemetery_name, address=cleaned_cemetery_address)
    if cleaned_cemetery_address and cemetery.address != cleaned_cemetery_address:
        cemetery.address = cleaned_cemetery_address
        cemetery.save(update_fields=["address", "updated_at"])

    target_plot = Plot.objects.filter(
        cemetery=cemetery,
        section=cleaned_section,
        row=cleaned_row,
        plot_number=cleaned_plot_number,
    ).first()
    if not target_plot:
        target_plot = current_plot

    plot_updates = []
    if target_plot.cemetery_id != cemetery.id:
        target_plot.cemetery = cemetery
        plot_updates.append("cemetery")
    if target_plot.section != cleaned_section:
        target_plot.section = cleaned_section
        plot_updates.append("section")
    if target_plot.row != cleaned_row:
        target_plot.row = cleaned_row
        plot_updates.append("row")
    if target_plot.plot_number != cleaned_plot_number:
        target_plot.plot_number = cleaned_plot_number
        plot_updates.append("plot_number")
    if gps_lat is not None and target_plot.gps_lat != gps_lat:
        target_plot.gps_lat = gps_lat
        plot_updates.append("gps_lat")
    if gps_lng is not None and target_plot.gps_lng != gps_lng:
        target_plot.gps_lng = gps_lng
        plot_updates.append("gps_lng")
    if cleaned_locating_notes and target_plot.access_notes != cleaned_locating_notes:
        target_plot.access_notes = cleaned_locating_notes
        plot_updates.append("access_notes")
    if plot_updates:
        target_plot.save(update_fields=[*plot_updates, "updated_at"])

    if memorial.plot_id != target_plot.id:
        memorial.plot = target_plot
        memorial.save(update_fields=["plot", "updated_at"])


def get_customer_survey_request_by_token_or_404(token: str) -> CustomerSurveyRequest:
    survey_request = get_object_or_404(
        CustomerSurveyRequest.objects.select_related(
            "service__memorial__customer",
            "service__memorial__plot__cemetery",
        ),
        token=token,
    )
    if survey_request.status == "expired":
        raise Http404
    return survey_request


def revoke_active_employee_invites(employee: Employee) -> int:
    return EmployeeInvite.objects.filter(
        employee=employee,
        used_at__isnull=True,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).update(revoked_at=timezone.now(), updated_at=timezone.now())


def create_employee_invite(*, employee: Employee, user: User, invited_email: str, created_by: User | None = None) -> EmployeeInvite:
    revoke_active_employee_invites(employee)
    return EmployeeInvite.objects.create(
        employee=employee,
        user=user,
        invited_email=invited_email,
        created_by=created_by,
    )


def send_employee_invite_email(request, invite: EmployeeInvite) -> str:
    invite_url = build_frontend_invite_url(request, invite.token)
    send_email(
        subject="Set up your Headstone Restoration account",
        text_body=(
            f"Hello {invite.employee.full_name},\n\n"
            f"You have been invited to Headstone Restoration as a {invite.employee.get_role_display()}.\n"
            f"Use this link to set your password and activate your account:\n\n"
            f"{invite_url}\n\n"
            f"This setup link expires in {getattr(settings, 'INVITE_EXPIRY_HOURS', 72)} hours."
        ),
        html_body=build_branded_email_html(
            request=request,
            text_body=(
                f"Hello {invite.employee.full_name},\n\n"
                f"You have been invited to Headstone Restoration as a {invite.employee.get_role_display()}.\n"
                f"Use this link to set your password and activate your account:\n\n"
                f"{invite_url}\n\n"
                f"This setup link expires in {getattr(settings, 'INVITE_EXPIRY_HOURS', 72)} hours."
            ),
            cta_url=invite_url,
            cta_label="Set password"
        ),
        recipient_list=[invite.invited_email],
        purpose="invite",
        reply_to=[settings.EMAIL_DEFAULT_REPLY_TO] if getattr(settings, "EMAIL_DEFAULT_REPLY_TO", "") else [],
        metadata={
            "flow": "employee_invite",
            "employee_id": invite.employee_id,
            "invite_id": invite.id,
        },
    )
    return invite_url


def get_or_create_user_profile(user: User) -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def get_customer_for_user(user: User):
    if getattr(user, "employee", None):
        return None
    if user.email:
        return Customer.objects.filter(email__iexact=user.email).first()
    return None


def serialize_user_profile(request, user: User):
    profile = get_or_create_user_profile(user)
    employee = getattr(user, "employee", None)
    customer = get_customer_for_user(user)
    full_name = (
        (employee.full_name if employee else "")
        or (customer.full_name if customer else "")
        or user.get_full_name()
        or user.username
    )
    email = (
        (employee.email if employee else "")
        or (customer.email if customer else "")
        or user.email
        or ""
    )
    phone = (
        (employee.phone if employee else "")
        or (customer.phone if customer else "")
        or ""
    )
    photo_url = ""
    if profile.profile_photo:
        try:
            photo_url = request.build_absolute_uri(profile.profile_photo.url)
        except Exception:
            photo_url = profile.profile_photo.url
    return UserProfileDetailSerializer(
        {
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "date_of_birth": profile.date_of_birth,
            "address_line1": profile.address_line1,
            "address_line2": profile.address_line2,
            "city": profile.city,
            "state": profile.state,
            "postal_code": profile.postal_code,
            "bio": profile.bio,
            "profile_photo_url": photo_url,
        }
    ).data


def scheduling_services_queryset():
    return (
        Service.objects.select_related(
            "memorial__customer",
            "memorial__plot__cemetery",
            "survey_request",
            "survey_request__submission",
        )
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


def resolve_service_type(service_option):
    if not service_option:
        return Service.ServiceType.OTHER
    if service_option.legacy_key in {
        Service.ServiceType.CLEANING,
        Service.ServiceType.RESET,
        Service.ServiceType.LEVELING,
        Service.ServiceType.REPAIR,
        Service.ServiceType.ENGRAVING,
        Service.ServiceType.OTHER,
    }:
        return service_option.legacy_key
    return Service.ServiceType.OTHER


def serialize_customer_survey_detail(request, service: Service) -> dict:
    survey_request = getattr(service, "survey_request", None)
    submission = getattr(survey_request, "submission", None) if survey_request else None
    public_url = build_frontend_survey_url(request, survey_request.token) if survey_request else ""
    return CustomerSurveyDetailSerializer(
        {
            "request": survey_request,
            "public_url": public_url,
            "service": service,
            "submission": submission,
        },
        context={"request": request},
    ).data


def sync_survey_submission_to_service_records(service: Service, submission: CustomerSurveySubmission):
    customer = service.memorial.customer
    memorial = service.memorial
    current_plot = memorial.plot
    current_cemetery = current_plot.cemetery

    customer_updates = []
    if submission.customer_name and submission.customer_name != customer.full_name:
        customer.full_name = submission.customer_name
        customer_updates.append("full_name")
    if submission.email and submission.email != customer.email:
        customer.email = submission.email
        customer_updates.append("email")
    if submission.phone and submission.phone != customer.phone:
        customer.phone = submission.phone
        customer_updates.append("phone")
    if customer_updates:
        customer.save(update_fields=[*customer_updates, "updated_at"])

    cemetery = current_cemetery
    cemetery_name = (submission.cemetery_name or "").strip()
    cemetery_address = (submission.cemetery_address or "").strip()
    if cemetery_name:
        matched_cemetery = Cemetery.objects.filter(name__iexact=cemetery_name).order_by("id").first()
        if matched_cemetery:
            cemetery = matched_cemetery
        else:
            cemetery = Cemetery.objects.create(name=cemetery_name, address=cemetery_address)
    if cemetery_address and cemetery.address != cemetery_address:
        cemetery.address = cemetery_address
        cemetery.save(update_fields=["address", "updated_at"])

    section = (submission.section or current_plot.section or "").strip()
    row = (submission.row or current_plot.row or "").strip()
    plot_number = (submission.plot_number or current_plot.plot_number or "").strip()
    grave_number = (submission.grave_number or "").strip()
    locating_notes = (submission.locating_notes or "").strip()
    access_notes_parts = [part for part in [locating_notes, f"Grave number: {grave_number}" if grave_number else ""] if part]
    access_notes = "\n".join(access_notes_parts)

    target_plot = Plot.objects.filter(
        cemetery=cemetery,
        section=section,
        row=row,
        plot_number=plot_number,
    ).first()
    if not target_plot:
        if current_plot.cemetery_id == cemetery.id:
            target_plot = current_plot
        else:
            target_plot = Plot.objects.create(
                cemetery=cemetery,
                section=section,
                row=row,
                plot_number=plot_number,
            )

    plot_updates = []
    if target_plot.cemetery_id != cemetery.id:
        target_plot.cemetery = cemetery
        plot_updates.append("cemetery")
    if target_plot.section != section:
        target_plot.section = section
        plot_updates.append("section")
    if target_plot.row != row:
        target_plot.row = row
        plot_updates.append("row")
    if target_plot.plot_number != plot_number:
        target_plot.plot_number = plot_number
        plot_updates.append("plot_number")
    if submission.gps_lat is not None and target_plot.gps_lat != submission.gps_lat:
        target_plot.gps_lat = submission.gps_lat
        plot_updates.append("gps_lat")
    if submission.gps_lng is not None and target_plot.gps_lng != submission.gps_lng:
        target_plot.gps_lng = submission.gps_lng
        plot_updates.append("gps_lng")
    if access_notes and target_plot.access_notes != access_notes:
        target_plot.access_notes = access_notes
        plot_updates.append("access_notes")
    if plot_updates:
        target_plot.save(update_fields=[*plot_updates, "updated_at"])

    if memorial.plot_id != target_plot.id:
        memorial.plot = target_plot
        memorial.save(update_fields=["plot", "updated_at"])


@method_decorator(csrf_exempt, name="dispatch")
@method_decorator(ensure_csrf_cookie, name="dispatch")
class AuthLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identifier = serializer.validated_data["email"].strip()
        password = serializer.validated_data["password"]

        candidates = User.objects.filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier)
        ).distinct()
        matches = []

        for candidate in candidates:
            if candidate.check_password(password):
                session_user = resolve_session_user(candidate, request)
                if session_user:
                    matches.append((candidate, session_user))

        if not matches:
            return Response({"detail": "Invalid username/email or password."}, status=status.HTTP_400_BAD_REQUEST)

        if len(matches) > 1:
            return Response(
                {"detail": "Multiple accounts match this login. Use a unique username or email for each account."},
                status=status.HTTP_409_CONFLICT,
            )

        user, session_user = matches[0]
        login(request, user)
        return Response({"authenticated": True, "user": session_user}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class AuthLogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False}, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AuthSessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        session_user = resolve_session_user(request.user, request)
        if not session_user:
            return Response({"authenticated": False, "user": None}, status=status.HTTP_200_OK)
        return Response({"authenticated": True, "user": session_user}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class PasswordSetupView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = PasswordSetupValidateSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            invite = get_employee_invite_or_404(serializer.validated_data["token"])
        except Http404:
            return Response({"detail": INVALID_INVITE_MESSAGE}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "ok": True,
                "invite": {
                    "full_name": invite.employee.full_name,
                    "email": invite.invited_email,
                    "role": invite.employee.role,
                    "expires_at": invite.expires_at,
                },
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = PasswordSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invite = get_employee_invite_or_404(serializer.validated_data["token"])
        except Http404:
            return Response({"detail": INVALID_INVITE_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(serializer.validated_data["password"], invite.user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        invite.user.set_password(serializer.validated_data["password"])
        invite.user.save(update_fields=["password"])
        invite.used_at = timezone.now()
        invite.save(update_fields=["used_at", "updated_at"])
        login(request, invite.user)

        return Response(
            {"ok": True, "user": resolve_session_user(invite.user, request)},
            status=status.HTTP_200_OK,
        )


class UserProfileView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        return Response(serialize_user_profile(request, request.user), status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = UserProfileSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        profile = get_or_create_user_profile(user)
        employee = getattr(user, "employee", None)
        customer = get_customer_for_user(user)
        data = serializer.validated_data

        if "full_name" in data:
            full_name = data["full_name"].strip()
            if employee:
                employee.full_name = full_name
                employee.save(update_fields=["full_name", "updated_at"])
            elif customer:
                customer.full_name = full_name
                customer.save(update_fields=["full_name", "updated_at"])
            else:
                parts = full_name.split(" ", 1)
                user.first_name = parts[0] if parts else ""
                user.last_name = parts[1] if len(parts) > 1 else ""

        if "email" in data:
            email = data["email"].strip()
            previous_email = user.email
            user.email = email
            if employee:
                employee.email = email
                employee.save(update_fields=["email", "updated_at"])
            if customer and (not previous_email or customer.email.lower() == previous_email.lower()):
                customer.email = email
                customer.save(update_fields=["email", "updated_at"])

        if "phone" in data:
            phone = data["phone"].strip()
            if employee:
                employee.phone = phone
                employee.save(update_fields=["phone", "updated_at"])
            if customer:
                customer.phone = phone
                customer.save(update_fields=["phone", "updated_at"])

        user.save()

        profile.date_of_birth = data.get("date_of_birth", profile.date_of_birth)
        profile.address_line1 = data.get("address_line1", profile.address_line1)
        profile.address_line2 = data.get("address_line2", profile.address_line2)
        profile.city = data.get("city", profile.city)
        profile.state = data.get("state", profile.state)
        profile.postal_code = data.get("postal_code", profile.postal_code)
        profile.bio = data.get("bio", profile.bio)

        if data.get("remove_profile_photo"):
            if profile.profile_photo:
                profile.profile_photo.delete(save=False)
            profile.profile_photo = ""
        elif "profile_photo" in data:
            if profile.profile_photo:
                profile.profile_photo.delete(save=False)
            profile.profile_photo = data["profile_photo"]

        profile.save()
        return Response(serialize_user_profile(request, user), status=status.HTTP_200_OK)


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


@method_decorator(csrf_exempt, name="dispatch")
class ServiceSurveyDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request, service_id):
        service = get_object_or_404(scheduling_services_queryset(), id=service_id)
        return Response(serialize_customer_survey_detail(request, service), status=status.HTTP_200_OK)

    def post(self, request, service_id):
        service = get_object_or_404(scheduling_services_queryset(), id=service_id)
        serializer = CustomerSurveyRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = service.memorial.customer
        if not (customer.email or "").strip():
            return Response({"detail": "Selected customer does not have an email address for the survey."}, status=status.HTTP_400_BAD_REQUEST)

        survey_request = getattr(service, "survey_request", None)
        expires_in_days = serializer.validated_data.get("expires_in_days")
        next_expiry = timezone.now() + timedelta(days=expires_in_days) if expires_in_days else None

        if survey_request and survey_request.submitted_at:
            payload = serialize_customer_survey_detail(request, service)
            return Response(
                {
                    "ok": True,
                    "detail": "Survey has already been submitted for this job.",
                    **payload,
                },
                status=status.HTTP_200_OK,
            )

        try:
            if survey_request:
                survey_request.token = ""
                survey_request.sent_at = timezone.now()
                survey_request.expires_at = next_expiry or (
                    timezone.now() + timedelta(days=getattr(settings, "CUSTOMER_SURVEY_EXPIRY_DAYS", 14))
                )
                survey_request.save()
            else:
                survey_request = CustomerSurveyRequest.objects.create(
                    service=service,
                    expires_at=next_expiry,
                )
            send_customer_survey_email(request, survey_request)
        except EmailDeliveryError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        service = scheduling_services_queryset().get(id=service.id)
        payload = serialize_customer_survey_detail(request, service)
        return Response({"ok": True, "detail": f"Survey sent to {customer.email}.", **payload}, status=status.HTTP_201_CREATED)


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
        employee = getattr(request.user, "employee", None) if getattr(request.user, "is_authenticated", False) else None
        services = scheduling_services_queryset()
        if employee and employee.role not in {Employee.Role.ADMIN, Employee.Role.FRONT_DESK}:
            services = (
                services
                .filter(assignments__employee=employee)
                .filter(status__in=[Service.Status.DRAFT, Service.Status.SCHEDULED, Service.Status.IN_PROGRESS, Service.Status.COMPLETED])
                .distinct()
                .order_by(
                    models.Case(
                        models.When(status=Service.Status.COMPLETED, then=1),
                        default=0,
                        output_field=models.IntegerField(),
                    ),
                    models.F("scheduled_start").asc(nulls_last=True),
                    models.F("completed_date").desc(nulls_last=True),
                    "-created_at",
                )
            )
        else:
            services = (
                services
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

        memorial_id = serializer.validated_data.get("memorial_id")
        customer_id = serializer.validated_data.get("customer_id")
        customer = None
        if memorial_id:
            memorial = get_object_or_404(Memorial, id=memorial_id)
            if customer_id and memorial.customer_id != customer_id:
                return Response({"detail": "Selected memorial does not belong to the selected customer."}, status=status.HTTP_400_BAD_REQUEST)
            customer = memorial.customer
        else:
            customer = get_object_or_404(Customer, id=customer_id)
            memorial_qs = Memorial.objects.filter(customer=customer).order_by("id")
            memorial_count = memorial_qs.count()
            if memorial_count > 1:
                return Response({"detail": "Select which memorial to use for this customer."}, status=status.HTTP_400_BAD_REQUEST)
            memorial = None
            if memorial_count == 1:
                memorial = memorial_qs.first()

        send_survey_email = serializer.validated_data.get("send_survey_email", False)
        cemetery_name = serializer.validated_data.get("cemetery_name", "")
        cemetery_address = serializer.validated_data.get("cemetery_address", "")
        section = serializer.validated_data.get("section", "")
        row = serializer.validated_data.get("row", "")
        plot_number = serializer.validated_data.get("plot_number", "")
        locating_notes = serializer.validated_data.get("locating_notes", "")
        customer_notes = serializer.validated_data.get("customer_notes", "")
        if memorial is None and not send_survey_email and not any(
            (value or "").strip() for value in [cemetery_name, section, row, plot_number, locating_notes]
        ):
            return Response({"detail": "Enter cemetery/location details manually or choose survey email."}, status=status.HTTP_400_BAD_REQUEST)
        if send_survey_email and not (customer.email or "").strip():
            return Response({"detail": "Selected customer does not have an email address for the survey."}, status=status.HTTP_400_BAD_REQUEST)

        service_option = None
        service_option_id = serializer.validated_data.get("service_option_id")
        if service_option_id:
            service_option = get_object_or_404(ServiceOption, id=service_option_id, is_active=True)

        service_type = serializer.validated_data.get("service_type")
        if service_option:
            service_type = resolve_service_type(service_option)
        if not service_type:
            service_type = Service.ServiceType.OTHER
        initial_price = serializer.validated_data.get("initial_price")
        gps_lat = serializer.validated_data.get("gps_lat")
        gps_lng = serializer.validated_data.get("gps_lng")

        try:
            with transaction.atomic():
                if memorial is None:
                    memorial = create_placeholder_memorial(customer)

                if not send_survey_email:
                    apply_manual_job_details(
                        memorial,
                        cemetery_name=cemetery_name,
                        cemetery_address=cemetery_address,
                        section=section,
                        row=row,
                        plot_number=plot_number,
                        gps_lat=gps_lat,
                        gps_lng=gps_lng,
                        locating_notes=locating_notes,
                    )
                elif gps_lat is not None and gps_lng is not None:
                    plot = memorial.plot
                    plot.gps_lat = gps_lat
                    plot.gps_lng = gps_lng
                    plot.save(update_fields=["gps_lat", "gps_lng", "updated_at"])

                service = Service.objects.create(
                    memorial=memorial,
                    service_option=service_option,
                    service_type=service_type,
                    status=Service.Status.DRAFT,
                    internal_notes=(customer_notes or "").strip(),
                )
                set_service_price(service, initial_price)
                survey_payload = None
                if send_survey_email:
                    survey_request = CustomerSurveyRequest.objects.create(service=service)
                    send_customer_survey_email(request, survey_request)
        except EmailDeliveryError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        service = scheduling_services_queryset().get(id=service.id)
        payload = SchedulingServiceSerializer(service).data
        if send_survey_email:
            survey_payload = serialize_customer_survey_detail(request, service)
        return Response(
            {
                "ok": True,
                "detail": (
                    f"Job created and survey sent to {customer.email}."
                    if send_survey_email
                    else "Job created. Customer details were entered manually."
                ),
                "service": payload,
                "survey": survey_payload,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class CompleteServiceView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [SessionAuthentication, BasicAuthentication]

    def post(self, request, service_id):
        service = get_object_or_404(Service, id=service_id)
        employee = getattr(request.user, "employee", None) if getattr(request.user, "is_authenticated", False) else None
        if employee and employee.role not in {Employee.Role.ADMIN, Employee.Role.FRONT_DESK}:
            assigned = ServiceAssignment.objects.filter(service=service, employee=employee).exists()
            if not assigned:
                return Response({"detail": "You can only complete services assigned to you."}, status=status.HTTP_403_FORBIDDEN)
        old_status = service.status
        service.status = Service.Status.COMPLETED
        service.completed_date = timezone.localdate()
        service.save(update_fields=["status", "completed_date", "updated_at"])

        if old_status != Service.Status.COMPLETED:
            service.status_history.create(
                old_status=old_status,
                new_status=Service.Status.COMPLETED,
                changed_by=employee,
            )

        payload = SchedulingServiceSerializer(
            scheduling_services_queryset()
            .filter(id=service.id)
            .first()
            or service
        ).data
        return Response({"ok": True, "service": payload}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class ServicePhotoUploadView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, service_id):
        service = get_object_or_404(
            Service.objects.select_related("memorial__customer", "memorial__plot__cemetery"),
            id=service_id,
        )
        employee = getattr(request.user, "employee", None) if getattr(request.user, "is_authenticated", False) else None
        if employee and employee.role not in {Employee.Role.ADMIN, Employee.Role.FRONT_DESK}:
            assigned = ServiceAssignment.objects.filter(service=service, employee=employee).exists()
            if not assigned:
                return Response({"detail": "You can only upload photos for services assigned to you."}, status=status.HTTP_403_FORBIDDEN)

        serializer = PhotoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        image = serializer.validated_data["image"]
        photo_type = serializer.validated_data["photo_type"]
        caption = serializer.validated_data.get("caption", "")
        upload_path = default_storage.save(f"service_photos/{service.id}/{image.name}", image)
        image_url = request.build_absolute_uri(default_storage.url(upload_path))
        photo = Photo.objects.create(
            memorial=service.memorial,
            service=service,
            uploaded_by=employee,
            photo_type=photo_type,
            image_url=image_url,
            caption=caption,
        )

        return Response({"ok": True, "photo": PhotoArchiveSerializer(photo).data}, status=status.HTTP_201_CREATED)


class PhotoArchiveListView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, BasicAuthentication]

    def get(self, request):
        employee = getattr(request.user, "employee", None) if getattr(request.user, "is_authenticated", False) else None
        photos = Photo.objects.select_related("memorial__customer", "memorial__plot__cemetery", "service")
        if request.user.is_superuser:
            pass
        elif employee and employee.role not in {Employee.Role.ADMIN, Employee.Role.FRONT_DESK}:
            photos = photos.filter(uploaded_by=employee)
        elif not employee:
            customer = Customer.objects.filter(email__iexact=(request.user.email or "").strip()).first()
            if customer:
                photos = photos.filter(memorial__customer=customer)
            else:
                return Response([], status=status.HTTP_200_OK)
        photos = photos.order_by("-created_at")
        return Response(PhotoArchiveSerializer(photos, many=True).data)


class ServiceOptionListCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        include_inactive = request.query_params.get("include_inactive") in {"1", "true", "True"}
        qs = ServiceOption.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return Response(ServiceOptionSerializer(qs.order_by("sort_order", "name"), many=True).data)

    def post(self, request):
        serializer = ServiceOptionUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        option = serializer.save()
        return Response({"service_option": ServiceOptionSerializer(option).data}, status=status.HTTP_201_CREATED)


class ServiceOptionDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def patch(self, request, service_option_id):
        option = get_object_or_404(ServiceOption, id=service_option_id)
        serializer = ServiceOptionUpsertSerializer(option, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        option = serializer.save()
        return Response({"service_option": ServiceOptionSerializer(option).data}, status=status.HTTP_200_OK)

    def delete(self, request, service_option_id):
        option = get_object_or_404(ServiceOption, id=service_option_id)
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name="dispatch")
class SendCustomerEmailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    @staticmethod
    def _render_template(template: str, *, full_name: str = "", email: str = "") -> str:
        return render_customer_template(template, replacements={
            "{{client_name}}": full_name or "Client",
            "{{customer_name}}": full_name or "Client",
            "{{first_name}}": full_name.split(" ")[0] if full_name else "Client",
            "{{email}}": email or "",
        })

    def post(self, request):
        serializer = SendCustomerEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer_ids = serializer.validated_data.get("customer_ids") or []
        manual_recipients = serializer.validated_data.get("recipients") or []
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

        from_email = resolve_from_email(purpose="panel")
        sent = []
        skipped = []
        failed = []
        seen_emails = set()
        recipients = []

        for customer_id in customer_ids:
            customer = customers[customer_id]
            recipients.append(
                {
                    "customer_id": customer.id,
                    "name": customer.full_name,
                    "email": customer.email or "",
                    "source": "customer",
                }
            )

        for recipient in manual_recipients:
            recipients.append(
                {
                    "customer_id": recipient.get("customer_id"),
                    "name": recipient.get("name", ""),
                    "email": recipient["email"],
                    "source": "manual",
                }
            )

        for recipient in recipients:
            raw_email = recipient["email"].strip().lower()
            if not raw_email:
                skipped.append({
                    "customer_id": recipient.get("customer_id"),
                    "name": recipient.get("name") or "",
                    "reason": "missing_email",
                })
                continue
            if raw_email in seen_emails:
                skipped.append({
                    "customer_id": recipient.get("customer_id"),
                    "name": recipient.get("name") or "",
                    "email": raw_email,
                    "reason": "duplicate_email",
                })
                continue
            seen_emails.add(raw_email)

            rendered_subject = self._render_template(
                subject_template,
                full_name=recipient.get("name", ""),
                email=raw_email,
            )
            rendered_body = self._render_template(
                body_template,
                full_name=recipient.get("name", ""),
                email=raw_email,
            )
            try:
                send_email(
                    subject=rendered_subject,
                    text_body=rendered_body,
                    html_body=build_branded_email_html(
                        request=request,
                        text_body=rendered_body,
                    ),
                    from_email=from_email,
                    recipient_list=[raw_email],
                    purpose="panel",
                    reply_to=[settings.EMAIL_DEFAULT_REPLY_TO] if getattr(settings, "EMAIL_DEFAULT_REPLY_TO", "") else [],
                    metadata={
                        "flow": "customer_panel",
                        "customer_id": recipient.get("customer_id"),
                        "source": recipient.get("source"),
                    },
                )
                sent.append(
                    {
                        "customer_id": recipient.get("customer_id"),
                        "name": recipient.get("name") or "",
                        "email": raw_email,
                    }
                )
            except EmailDeliveryError as exc:
                failed.append({
                    "customer_id": recipient.get("customer_id"),
                    "name": recipient.get("name") or "",
                    "email": raw_email,
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
class CustomerInvoiceListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        email = (request.query_params.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "email is required."}, status=status.HTTP_400_BAD_REQUEST)

        customer = get_object_or_404(Customer, email__iexact=email)
        invoices = (
            Invoice.objects.filter(customer=customer)
            .prefetch_related("items")
            .order_by(
                models.Case(
                    models.When(status=Invoice.Status.PAID, then=1),
                    default=0,
                    output_field=models.IntegerField(),
                ),
                "-issued_date",
                "-created_at",
            )
        )
        return Response(CustomerInvoiceSerializer(invoices, many=True).data)


@method_decorator(csrf_exempt, name="dispatch")
class PublicSurveyDetailView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get(self, request, token):
        try:
            survey_request = get_customer_survey_request_by_token_or_404(token)
        except Http404:
            return Response({"detail": "Survey link is invalid or expired."}, status=status.HTTP_404_NOT_FOUND)

        service = survey_request.service
        payload = PublicSurveyContextSerializer(
            {
                "service_id": service.id,
                "service_name": service.service_type_label,
                "memorial_name": service.memorial.customer.full_name if service.memorial_id else "",
                "cemetery_name": service.memorial.plot.cemetery.name if service.memorial_id else "",
                "status": survey_request.status,
                "expires_at": survey_request.expires_at,
                "submitted_at": survey_request.submitted_at,
            }
        ).data
        return Response(payload, status=status.HTTP_200_OK)

    def post(self, request, token):
        try:
            survey_request = get_customer_survey_request_by_token_or_404(token)
        except Http404:
            return Response({"detail": "Survey link is invalid or expired."}, status=status.HTTP_404_NOT_FOUND)

        if survey_request.submitted_at or hasattr(survey_request, "submission"):
            return Response({"detail": "This survey has already been submitted."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PublicCustomerSurveySubmissionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            submission = serializer.save(survey_request=survey_request)
            sync_survey_submission_to_service_records(survey_request.service, submission)
            survey_request.submitted_at = timezone.now()
            survey_request.save(update_fields=["submitted_at", "updated_at"])

        return Response(
            {
                "ok": True,
                "status": survey_request.status,
                "submitted_at": survey_request.submitted_at,
                "submission": CustomerSurveySubmissionSerializer(submission, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class AdminInvoiceListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        invoices = (
            Invoice.objects.select_related("customer", "service__memorial__plot__cemetery")
            .prefetch_related("items")
            .order_by(
                models.Case(
                    models.When(status=Invoice.Status.PAID, then=2),
                    models.When(status=Invoice.Status.SENT, then=1),
                    default=0,
                    output_field=models.IntegerField(),
                ),
                "due_date",
                "-issued_date",
                "-created_at",
            )
        )
        return Response(AdminInvoiceSerializer(invoices, many=True).data)


@method_decorator(csrf_exempt, name="dispatch")
class AdminInvoiceSendView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def post(self, request, invoice_id):
        invoice = get_object_or_404(
            Invoice.objects.select_related("customer", "service__memorial__plot__cemetery").prefetch_related("items"),
            id=invoice_id,
        )
        serializer = AdminSendInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not invoice.customer.email:
            return Response({"detail": "This customer does not have an email address."}, status=status.HTTP_400_BAD_REQUEST)
        if invoice.status == Invoice.Status.PAID:
            return Response({"detail": "This invoice has already been paid."}, status=status.HTTP_400_BAD_REQUEST)
        if invoice.total_amount <= 0:
            return Response({"detail": "Invoice total must be greater than zero before sending."}, status=status.HTTP_400_BAD_REQUEST)

        if "notes" in serializer.validated_data:
            invoice.notes = serializer.validated_data.get("notes", "")
        if "due_date" in serializer.validated_data:
            invoice.due_date = serializer.validated_data.get("due_date")
        if not invoice.issued_date:
            invoice.issued_date = timezone.localdate()
        invoice.status = Invoice.Status.SENT

        try:
            session = _create_checkout_session_for_invoice(
                request,
                invoice=invoice,
                customer_email=invoice.customer.email,
            )
        except stripe_client.StripeAPIError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        checkout_url = session.get("url", "")
        replacements = build_invoice_template_replacements(invoice=invoice, checkout_url=checkout_url)
        subject_template = serializer.validated_data.get("subject") or DEFAULT_INVOICE_SUBJECT
        body_template = serializer.validated_data.get("body") or DEFAULT_INVOICE_BODY
        rendered_subject = render_customer_template(subject_template, replacements=replacements)
        rendered_body = render_customer_template(body_template, replacements=replacements)
        from_email = resolve_from_email(purpose="panel")

        try:
            send_email(
                subject=rendered_subject,
                text_body=rendered_body,
                html_body=build_branded_email_html(
                    request=request,
                    text_body=rendered_body,
                    cta_url=checkout_url,
                    cta_label="Open payment link"
                ),
                from_email=from_email,
                recipient_list=[invoice.customer.email],
                purpose="panel",
                reply_to=[settings.EMAIL_DEFAULT_REPLY_TO] if getattr(settings, "EMAIL_DEFAULT_REPLY_TO", "") else [],
                metadata={
                    "flow": "invoice_send",
                    "invoice_id": invoice.id,
                    "stripe_checkout_session_id": session.get("id", ""),
                },
            )
        except EmailDeliveryError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        invoice.save(update_fields=["status", "issued_date", "due_date", "notes", "updated_at"])
        return Response(
            {
                "ok": True,
                "invoice": AdminInvoiceSerializer(invoice).data,
                "checkout_url": checkout_url,
                "sent_to": invoice.customer.email,
                "subject": rendered_subject,
            },
            status=status.HTTP_200_OK,
        )


def _build_checkout_urls(request):
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin:
        base = origin
    else:
        base = request.build_absolute_uri("/static/index.html").split("/static/index.html", 1)[0]

    success_url = f"{base}/static/index.html?checkout=success&session_id={{CHECKOUT_SESSION_ID}}#/customer/settings"
    cancel_url = f"{base}/static/index.html?checkout=canceled#/customer/settings"

    if origin:
        success_url = f"{origin}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}#/customer/settings"
        cancel_url = f"{origin}/?checkout=canceled#/customer/settings"

    return success_url, cancel_url


def _create_checkout_session_for_invoice(request, *, invoice: Invoice, customer_email: str):
    success_url, cancel_url = _build_checkout_urls(request)
    session = stripe_client.create_checkout_session(
        invoice=invoice,
        customer_email=customer_email,
        success_url=success_url,
        cancel_url=cancel_url,
    )

    invoice.stripe_checkout_session_id = session.get("id", "")
    invoice.save(update_fields=["stripe_checkout_session_id", "updated_at"])
    Payment.objects.update_or_create(
        invoice=invoice,
        stripe_checkout_session_id=session.get("id", ""),
        defaults={
            "provider": Payment.Provider.STRIPE,
            "method": Payment.Method.CARD,
            "status": Payment.Status.PENDING,
            "currency": invoice.currency,
            "amount": invoice.total_amount,
        },
    )
    return session


def _sync_checkout_session(session, invoice: Invoice):
    payment_intent = session.get("payment_intent")
    payment_intent_id = payment_intent["id"] if isinstance(payment_intent, dict) else (payment_intent or "")
    latest_charge = payment_intent.get("latest_charge") if isinstance(payment_intent, dict) else None
    charge_id = latest_charge.get("id", "") if isinstance(latest_charge, dict) else ""
    receipt_url = latest_charge.get("receipt_url", "") if isinstance(latest_charge, dict) else ""
    session_id = session.get("id", "")
    payment_status = session.get("payment_status", "")

    payment, _ = Payment.objects.get_or_create(
        invoice=invoice,
        stripe_checkout_session_id=session_id,
        defaults={
            "provider": Payment.Provider.STRIPE,
            "method": Payment.Method.CARD,
            "status": Payment.Status.PENDING,
            "currency": invoice.currency,
            "amount": invoice.total_amount,
        },
    )

    payment.stripe_payment_intent_id = payment_intent_id
    payment.stripe_charge_id = charge_id
    payment.receipt_url = receipt_url
    payment.amount = invoice.total_amount
    payment.currency = invoice.currency
    invoice.stripe_checkout_session_id = session_id
    invoice.stripe_payment_intent_id = payment_intent_id

    if payment_status == "paid":
        now = timezone.now()
        payment.status = Payment.Status.SUCCEEDED
        payment.succeeded_at = payment.succeeded_at or now
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = invoice.paid_at or now
    elif session.get("status") == "expired":
        payment.status = Payment.Status.CANCELED
    else:
        payment.status = Payment.Status.PENDING

    payment.save(
        update_fields=[
            "stripe_payment_intent_id",
            "stripe_charge_id",
            "receipt_url",
            "amount",
            "currency",
            "status",
            "succeeded_at",
            "updated_at",
        ]
    )
    invoice.save(
        update_fields=[
            "stripe_checkout_session_id",
            "stripe_payment_intent_id",
            "status",
            "paid_at",
            "updated_at",
        ]
    )
    return payment


@method_decorator(csrf_exempt, name="dispatch")
class CreateCheckoutSessionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def post(self, request):
        serializer = CreateCheckoutSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        invoice = get_object_or_404(
            Invoice.objects.select_related("customer", "service").prefetch_related("items"),
            id=serializer.validated_data["invoice_id"],
            customer__email__iexact=serializer.validated_data["customer_email"],
        )

        if invoice.status == Invoice.Status.PAID:
            return Response({"detail": "This invoice has already been paid."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = _create_checkout_session_for_invoice(
                request,
                invoice=invoice,
                customer_email=serializer.validated_data["customer_email"],
            )
        except stripe_client.StripeAPIError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                "ok": True,
                "checkout_url": session.get("url"),
                "session_id": session.get("id"),
                "publishable_key_configured": bool(getattr(settings, "STRIPE_PUBLISHABLE_KEY", "")),
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class VerifyCheckoutSessionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        serializer = VerifyCheckoutSessionSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        session_id = serializer.validated_data["session_id"]

        invoice = get_object_or_404(Invoice, stripe_checkout_session_id=session_id)

        try:
            session = stripe_client.retrieve_checkout_session(session_id)
        except stripe_client.StripeAPIError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        payment = _sync_checkout_session(session, invoice)
        return Response(
            {
                "ok": True,
                "invoice": CustomerInvoiceSerializer(invoice).data,
                "payment": {
                    "status": payment.status,
                    "receipt_url": payment.receipt_url,
                },
            }
        )


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
        serializer = EmployeeRoleUpdateSerializer(data=request.data, context={"employee": employee})
        serializer.is_valid(raise_exception=True)
        user = employee.user
        employee_fields = []
        user_fields = []

        if "username" in serializer.validated_data:
            user.username = serializer.validated_data["username"]
            user_fields.append("username")
        if "email" in serializer.validated_data:
            email = serializer.validated_data["email"]
            user.email = email
            employee.email = email
            user_fields.append("email")
            employee_fields.append("email")
        if "full_name" in serializer.validated_data:
            employee.full_name = serializer.validated_data["full_name"]
            employee_fields.append("full_name")
        if "phone" in serializer.validated_data:
            employee.phone = serializer.validated_data["phone"]
            employee_fields.append("phone")
        if "role" in serializer.validated_data:
            employee.role = serializer.validated_data["role"]
            employee_fields.append("role")
        if "is_active" in serializer.validated_data:
            employee.is_active = serializer.validated_data["is_active"]
            employee_fields.append("is_active")
        if user_fields:
            user.save(update_fields=[*user_fields])
        employee.save(update_fields=[*dict.fromkeys([*employee_fields, "updated_at"])])
        return Response({"ok": True, "employee": EmployeeRoleSerializer(employee).data}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class EmployeeCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def post(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data.get("role", Employee.Role.TECH)
        send_invite = serializer.validated_data.get("send_invite", True)
        invite = None
        invite_url = None

        with transaction.atomic():
            user = User.objects.create_user(
                username=serializer.validated_data["username"],
                email=serializer.validated_data["email"],
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
            employee = Employee.objects.create(
                user=user,
                full_name=serializer.validated_data["full_name"],
                email=serializer.validated_data["email"],
                phone=serializer.validated_data.get("phone", ""),
                role=role,
                is_active=True,
            )
            if send_invite:
                invite = create_employee_invite(
                    employee=employee,
                    user=user,
                    invited_email=serializer.validated_data["email"],
                    created_by=request.user if getattr(request.user, "is_authenticated", False) else None,
                )

        if invite:
            try:
                invite_url = send_employee_invite_email(request, invite)
            except EmailDeliveryError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                "ok": True,
                "employee": EmployeeRoleSerializer(employee).data,
                "invite_sent": bool(invite),
                "invite": EmployeeInviteSerializer(invite).data if invite else None,
                "invite_url": invite_url,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class EmployeeInviteResendView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def post(self, request, employee_id):
        employee = get_object_or_404(Employee.objects.select_related("user"), id=employee_id)
        if employee.user.has_usable_password():
            return Response(
                {"detail": "Employee already activated their account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invited_email = (employee.email or employee.user.email or "").strip()
        if not invited_email:
            return Response(
                {"detail": "Employee must have an email address before sending an invite."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invite = create_employee_invite(
            employee=employee,
            user=employee.user,
            invited_email=invited_email,
            created_by=request.user if getattr(request.user, "is_authenticated", False) else None,
        )
        try:
            invite_url = send_employee_invite_email(request, invite)
        except EmailDeliveryError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(
            {
                "ok": True,
                "employee": EmployeeRoleSerializer(employee).data,
                "invite": EmployeeInviteSerializer(invite).data,
                "invite_url": invite_url,
            },
            status=status.HTTP_200_OK,
        )


class DashboardSummaryView(APIView):
    """
    Lightweight dashboard endpoint consumed by the static frontend.
    Uses AllowAny so the demo can load without auth; tighten in production.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        today = now.date()
        employee = getattr(request.user, "employee", None) if getattr(request.user, "is_authenticated", False) else None

        base_qs = (
            Service.objects.select_related(
                "memorial__customer",
                "memorial__plot__cemetery",
            )
        )

        if employee and employee.role not in {Employee.Role.ADMIN, Employee.Role.FRONT_DESK}:
            base_qs = base_qs.filter(assignments__employee=employee).distinct()

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

        total_revenue = (
            Invoice.objects.filter(service__in=base_qs, service__status=Service.Status.COMPLETED)
            .aggregate(total=Sum("total_amount"))["total"] or 0
        )
        projected_revenue = (
            Invoice.objects.filter(
                service__in=base_qs,
                service__status__in=[Service.Status.SCHEDULED, Service.Status.IN_PROGRESS],
            )
            .aggregate(total=Sum("total_amount"))["total"] or 0
        )

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
                "projected_revenue": float(projected_revenue),
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


@method_decorator(csrf_exempt, name="dispatch")
class MemorialManageListCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

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
            .order_by("customer__full_name", "plot__cemetery__name", "plot__section", "plot__row", "plot__plot_number")
        )
        return Response(MemorialSummarySerializer(qs, many=True).data)

    def post(self, request):
        serializer = MemorialCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = get_object_or_404(Customer, id=serializer.validated_data["customer_id"])
        cemetery = get_object_or_404(Cemetery, id=serializer.validated_data["cemetery_id"])

        with transaction.atomic():
            plot, _ = Plot.objects.get_or_create(
                cemetery=cemetery,
                section=serializer.validated_data["section"],
                row=serializer.validated_data["row"],
                plot_number=serializer.validated_data["plot_number"],
            )
            memorial = Memorial.objects.create(
                customer=customer,
                plot=plot,
                material=serializer.validated_data.get("material", Memorial.Material.OTHER),
                inscription_text=serializer.validated_data.get("inscription_text", ""),
                condition_summary=serializer.validated_data.get("condition_summary", ""),
                notes=serializer.validated_data.get("notes", ""),
            )

        memorial_payload = (
            Memorial.objects.filter(id=memorial.id)
            .select_related("customer", "plot__cemetery")
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
            .first()
        )
        return Response(
            {"ok": True, "memorial": MemorialSummarySerializer(memorial_payload).data},
            status=status.HTTP_201_CREATED,
        )


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


@method_decorator(csrf_exempt, name="dispatch")
class CemeteryManageListCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]

    def get(self, request):
        qs = (
            Cemetery.objects.annotate(
                memorials_count=models.Count("plots__memorials", distinct=True),
                active_services=models.Count(
                    "plots__memorials__services",
                    filter=models.Q(
                        plots__memorials__services__status__in=[
                            Service.Status.DRAFT,
                            Service.Status.SCHEDULED,
                            Service.Status.IN_PROGRESS,
                        ]
                    ),
                    distinct=True,
                ),
            )
            .order_by("name")
        )
        return Response(CemeterySummarySerializer(qs, many=True).data)

    def post(self, request):
        serializer = CemeteryUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cemetery = serializer.save()
        cemetery_payload = (
            Cemetery.objects.filter(id=cemetery.id)
            .annotate(
                memorials_count=models.Count("plots__memorials", distinct=True),
                active_services=models.Count(
                    "plots__memorials__services",
                    filter=models.Q(
                        plots__memorials__services__status__in=[
                            Service.Status.DRAFT,
                            Service.Status.SCHEDULED,
                            Service.Status.IN_PROGRESS,
                        ]
                    ),
                    distinct=True,
                ),
            )
            .first()
        )
        return Response(
            {"ok": True, "cemetery": CemeterySummarySerializer(cemetery_payload).data},
            status=status.HTTP_201_CREATED,
        )
