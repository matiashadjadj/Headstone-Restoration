from urllib.parse import urlparse

from django.contrib.auth.models import User
from rest_framework import serializers
from core.models import (
    CustomerSurveyRequest,
    CustomerSurveySubmission,
    Service,
    ServiceOption,
    ServiceAssignment,
    Photo,
    Employee,
    EmployeeInvite,
    UserProfile,
    Memorial,
    Customer,
    Cemetery,
    Invoice,
    InvoiceItem,
)


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = [
            "id",
            "status",
            "scheduled_start",
            "estimated_minutes",
            "completed_date",
        ]


class GPSCoordinatesValidationMixin(serializers.Serializer):
    gps_lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    gps_lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    def validate_gps_lat(self, value):
        if value is not None and not (-90 <= value <= 90):
            raise serializers.ValidationError("gps_lat must be between -90 and 90.")
        return value

    def validate_gps_lng(self, value):
        if value is not None and not (-180 <= value <= 180):
            raise serializers.ValidationError("gps_lng must be between -180 and 180.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        gps_lat = attrs.get("gps_lat")
        gps_lng = attrs.get("gps_lng")
        if (gps_lat is None) ^ (gps_lng is None):
            raise serializers.ValidationError("Provide both gps_lat and gps_lng, or leave both empty.")
        return attrs


class AssignTechnicianSerializer(GPSCoordinatesValidationMixin):
    technician_id = serializers.IntegerField()
    scheduled_start = serializers.DateTimeField()
    estimated_minutes = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)
    
    def validate_estimated_minutes(self, value):
        # Prevent accidental multi-day values; adjust as needed
        if value > 24 * 60:
            raise serializers.ValidationError("estimated_minutes must be <= 1440 (24 hours)")
        return value


class ServiceAssignmentSerializer(serializers.ModelSerializer):
    technician = serializers.CharField(source="employee.user.username", read_only=True)

    class Meta:
        model = ServiceAssignment
        fields = ["id", "technician"]


class PhotoUploadSerializer(serializers.Serializer):
    image = serializers.FileField()
    photo_type = serializers.ChoiceField(choices=Photo.PhotoType.choices, required=False, default=Photo.PhotoType.DURING)
    caption = serializers.CharField(max_length=255, required=False, allow_blank=True)


class PhotoArchiveSerializer(serializers.ModelSerializer):
    memorial_name = serializers.CharField(source="memorial.customer.full_name", read_only=True)
    cemetery_name = serializers.CharField(source="memorial.plot.cemetery.name", read_only=True)
    service_id = serializers.IntegerField(read_only=True)
    job_title = serializers.CharField(source="service.service_type_label", read_only=True)
    photo_type_label = serializers.CharField(source="get_photo_type_display", read_only=True)
    image_path = serializers.SerializerMethodField()

    class Meta:
        model = Photo
        fields = [
            "id",
            "memorial_name",
            "cemetery_name",
            "service_id",
            "job_title",
            "photo_type",
            "photo_type_label",
            "caption",
            "image_url",
            "image_path",
            "created_at",
        ]

    def get_image_path(self, obj):
        parsed = urlparse(obj.image_url or "")
        return parsed.path or obj.image_url or ""


class DashboardServiceSerializer(serializers.ModelSerializer):
    memorial_name = serializers.CharField(source="memorial.customer.full_name", read_only=True)
    cemetery_name = serializers.CharField(source="memorial.plot.cemetery.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Service
        fields = [
            "id",
            "memorial_name",
            "cemetery_name",
            "scheduled_start",
            "status",
            "status_display",
        ]


class RecentServiceSerializer(serializers.ModelSerializer):
    memorial_name = serializers.CharField(source="memorial.customer.full_name", read_only=True)
    cemetery_name = serializers.CharField(source="memorial.plot.cemetery.name", read_only=True)
    completed_date = serializers.DateField(read_only=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, source="invoices__total_amount", read_only=True)

    class Meta:
        model = Service
        fields = ["id", "memorial_name", "cemetery_name", "completed_date", "amount"]


class MemorialSummarySerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(read_only=True)
    cemetery_id = serializers.IntegerField(source="plot.cemetery_id", read_only=True)
    cemetery = serializers.CharField(source="plot.cemetery.name", read_only=True)
    customer = serializers.CharField(source="customer.full_name", read_only=True)
    section = serializers.CharField(source="plot.section", read_only=True)
    row = serializers.CharField(source="plot.row", read_only=True)
    plot_number = serializers.CharField(source="plot.plot_number", read_only=True)
    material = serializers.CharField(read_only=True)
    last_service_status = serializers.CharField(read_only=True)
    last_service_date = serializers.DateField(read_only=True)

    class Meta:
        model = Memorial
        fields = [
            "id",
            "customer_id",
            "customer",
            "cemetery_id",
            "cemetery",
            "section",
            "row",
            "plot_number",
            "material",
            "last_service_status",
            "last_service_date",
        ]


class MemorialCreateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(min_value=1)
    cemetery_id = serializers.IntegerField(min_value=1)
    section = serializers.CharField(max_length=50)
    row = serializers.CharField(max_length=50)
    plot_number = serializers.CharField(max_length=50)
    material = serializers.ChoiceField(choices=Memorial.Material.choices, required=False, default=Memorial.Material.OTHER)
    inscription_text = serializers.CharField(required=False, allow_blank=True)
    condition_summary = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_section(self, value):
        return value.strip()

    def validate_row(self, value):
        return value.strip()

    def validate_plot_number(self, value):
        return value.strip()


class CustomerSummarySerializer(serializers.ModelSerializer):
    memorials_count = serializers.IntegerField(read_only=True)
    last_contact = serializers.DateField(read_only=True)

    class Meta:
        model = Customer
        fields = ["id", "full_name", "email", "phone", "memorials_count", "last_contact"]


class CemeterySummarySerializer(serializers.ModelSerializer):
    memorials_count = serializers.IntegerField(read_only=True)
    active_services = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cemetery
        fields = ["id", "name", "city", "memorials_count", "active_services"]


class CemeteryUpsertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cemetery
        fields = [
            "name",
            "address",
            "city",
            "state",
            "contact_name",
            "contact_phone",
            "contact_email",
            "notes",
        ]

    def validate_name(self, value):
        return value.strip()


class TechnicianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ["id", "full_name", "email", "phone"]


class SchedulingServiceSerializer(serializers.ModelSerializer):
    memorial_name = serializers.CharField(source="memorial.customer.full_name", read_only=True)
    cemetery_name = serializers.CharField(source="memorial.plot.cemetery.name", read_only=True)
    section = serializers.CharField(source="memorial.plot.section", read_only=True)
    row = serializers.CharField(source="memorial.plot.row", read_only=True)
    plot_number = serializers.CharField(source="memorial.plot.plot_number", read_only=True)
    access_notes = serializers.CharField(source="memorial.plot.access_notes", read_only=True)
    internal_notes = serializers.CharField(read_only=True)
    service_type_label = serializers.CharField(read_only=True)
    service_option_id = serializers.IntegerField(read_only=True)
    technician_id = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    gps_lat = serializers.DecimalField(source="memorial.plot.gps_lat", max_digits=9, decimal_places=6, read_only=True)
    gps_lng = serializers.DecimalField(source="memorial.plot.gps_lng", max_digits=9, decimal_places=6, read_only=True)
    survey_status = serializers.SerializerMethodField()
    survey_sent_at = serializers.SerializerMethodField()
    survey_submitted_at = serializers.SerializerMethodField()
    survey_expires_at = serializers.SerializerMethodField()
    customer_locating_notes = serializers.SerializerMethodField()
    customer_extra_notes = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "service_type",
            "service_type_label",
            "service_option_id",
            "status",
            "scheduled_start",
            "estimated_minutes",
            "memorial_name",
            "cemetery_name",
            "section",
            "row",
            "plot_number",
            "access_notes",
            "internal_notes",
            "technician_id",
            "technician_name",
            "price",
            "gps_lat",
            "gps_lng",
            "survey_status",
            "survey_sent_at",
            "survey_submitted_at",
            "survey_expires_at",
            "customer_locating_notes",
            "customer_extra_notes",
        ]

    def get_technician_id(self, obj):
        assignment = obj.assignments.select_related("employee").first()
        return assignment.employee_id if assignment else None

    def get_technician_name(self, obj):
        assignment = obj.assignments.select_related("employee").first()
        return assignment.employee.full_name if assignment else None

    def get_price(self, obj):
        raw = getattr(obj, "price", None)
        if raw is None:
            return None
        return float(raw)

    def get_survey_status(self, obj):
        survey_request = getattr(obj, "survey_request", None)
        return survey_request.status if survey_request else "not_sent"

    def get_survey_sent_at(self, obj):
        survey_request = getattr(obj, "survey_request", None)
        return survey_request.sent_at if survey_request else None

    def get_survey_submitted_at(self, obj):
        survey_request = getattr(obj, "survey_request", None)
        return survey_request.submitted_at if survey_request else None

    def get_survey_expires_at(self, obj):
        survey_request = getattr(obj, "survey_request", None)
        return survey_request.expires_at if survey_request else None

    def get_customer_locating_notes(self, obj):
        survey_request = getattr(obj, "survey_request", None)
        submission = getattr(survey_request, "submission", None) if survey_request else None
        return submission.locating_notes if submission else ""

    def get_customer_extra_notes(self, obj):
        survey_request = getattr(obj, "survey_request", None)
        submission = getattr(survey_request, "submission", None) if survey_request else None
        return submission.extra_notes if submission else ""


class CreateSchedulingServiceSerializer(GPSCoordinatesValidationMixin):
    customer_id = serializers.IntegerField(required=False)
    memorial_id = serializers.IntegerField(required=False)
    service_option_id = serializers.IntegerField(required=False)
    service_type = serializers.ChoiceField(choices=Service.ServiceType.choices, required=False)
    send_survey_email = serializers.BooleanField(required=False, default=False)
    initial_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)
    cemetery_name = serializers.CharField(required=False, allow_blank=True)
    cemetery_address = serializers.CharField(required=False, allow_blank=True)
    section = serializers.CharField(required=False, allow_blank=True)
    row = serializers.CharField(required=False, allow_blank=True)
    plot_number = serializers.CharField(required=False, allow_blank=True)
    locating_notes = serializers.CharField(required=False, allow_blank=True)
    customer_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("customer_id") and not attrs.get("memorial_id"):
            raise serializers.ValidationError("Select a customer.")
        if not attrs.get("service_option_id") and not attrs.get("service_type"):
            raise serializers.ValidationError("Select a service option.")
        return attrs


class ServiceOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceOption
        fields = ["id", "name", "legacy_key", "is_active", "sort_order"]
        read_only_fields = ["legacy_key"]


class ServiceOptionUpsertSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceOption
        fields = ["name", "is_active", "sort_order"]

    def validate_name(self, value):
        qs = ServiceOption.objects.filter(name__iexact=value.strip())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A service option with this name already exists.")
        return value.strip()


class EmailRecipientSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    customer_id = serializers.IntegerField(min_value=1, required=False)


class SendCustomerEmailSerializer(serializers.Serializer):
    customer_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        required=False,
    )
    recipients = EmailRecipientSerializer(many=True, required=False)
    subject = serializers.CharField(max_length=200)
    body = serializers.CharField()

    def validate(self, attrs):
        customer_ids = attrs.get("customer_ids") or []
        recipients = attrs.get("recipients") or []
        if not customer_ids and not recipients:
            raise serializers.ValidationError("Provide at least one recipient.")
        return attrs


class CustomerUpsertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "full_name",
            "email",
            "phone",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "notes",
        ]


class EmployeeRoleSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Employee
        fields = ["id", "username", "full_name", "email", "phone", "role", "is_active"]


class EmployeeRoleUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, required=False)
    full_name = serializers.CharField(max_length=255, required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Employee.Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_username(self, value):
        employee = self.context.get("employee")
        qs = User.objects.filter(username=value)
        if employee:
            qs = qs.exclude(id=employee.user_id)
        if qs.exists():
            raise serializers.ValidationError("Username already exists.")
        return value

    def validate_email(self, value):
        employee = self.context.get("employee")
        qs = User.objects.filter(email__iexact=value)
        if employee:
            qs = qs.exclude(id=employee.user_id)
        if qs.exists():
            raise serializers.ValidationError("Email already exists.")
        return value

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        return attrs


class EmployeeCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Employee.Role.choices, required=False)
    send_invite = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already exists.")
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128)

    def validate_email(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter your email or username.")
        return value


class SessionUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.CharField(allow_blank=True)
    email = serializers.EmailField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    profile_photo_url = serializers.CharField(allow_blank=True)
    frontend_role = serializers.ChoiceField(choices=["admin", "frontdesk", "employee", "customer"])
    source_role = serializers.CharField(allow_blank=True)


class UserProfileSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    address_line1 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    address_line2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=50, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True)
    profile_photo = serializers.FileField(required=False, allow_null=True)
    remove_profile_photo = serializers.BooleanField(required=False)

    def validate_email(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if value and User.objects.filter(email__iexact=value).exclude(id=getattr(user, "id", None)).exists():
            raise serializers.ValidationError("Email already exists.")
        return value


class UserProfileDetailSerializer(serializers.Serializer):
    full_name = serializers.CharField()
    email = serializers.EmailField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    date_of_birth = serializers.DateField(allow_null=True)
    address_line1 = serializers.CharField(allow_blank=True)
    address_line2 = serializers.CharField(allow_blank=True)
    city = serializers.CharField(allow_blank=True)
    state = serializers.CharField(allow_blank=True)
    postal_code = serializers.CharField(allow_blank=True)
    bio = serializers.CharField(allow_blank=True)
    profile_photo_url = serializers.CharField(allow_blank=True)


class EmployeeInviteSerializer(serializers.ModelSerializer):
    employee = EmployeeRoleSerializer(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = EmployeeInvite
        fields = ["id", "invited_email", "expires_at", "used_at", "revoked_at", "is_active", "employee"]


class PasswordSetupValidateSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class PasswordSetupSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)
    password = serializers.CharField(max_length=128)
    password_confirm = serializers.CharField(max_length=128)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return attrs


class InvoiceItemSerializer(serializers.ModelSerializer):
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceItem
        fields = ["id", "description", "quantity", "unit_price", "line_total"]

    def get_line_total(self, obj):
        return float(obj.line_total())


class CustomerInvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    service_type = serializers.CharField(source="service.service_type", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "customer_name",
            "status",
            "issued_date",
            "due_date",
            "currency",
            "total_amount",
            "paid_at",
            "notes",
            "service_type",
            "items",
        ]


class AdminInvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    memorial_name = serializers.CharField(source="service.memorial.customer.full_name", read_only=True)
    cemetery_name = serializers.CharField(source="service.memorial.plot.cemetery.name", read_only=True)
    service_name = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "customer_name",
            "customer_email",
            "status",
            "issued_date",
            "due_date",
            "currency",
            "total_amount",
            "paid_at",
            "notes",
            "service_name",
            "memorial_name",
            "cemetery_name",
            "stripe_checkout_session_id",
            "items",
        ]

    def get_service_name(self, obj):
        if obj.service_id and obj.service:
            return obj.service.service_type_label
        return "General invoice"


class CreateCheckoutSessionSerializer(serializers.Serializer):
    invoice_id = serializers.IntegerField(min_value=1)
    customer_email = serializers.EmailField()


class VerifyCheckoutSessionSerializer(serializers.Serializer):
    session_id = serializers.CharField(max_length=255)


class AdminSendInvoiceSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255, required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class CustomerSurveyRequestSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    submission_id = serializers.IntegerField(source="submission.id", read_only=True)

    class Meta:
        model = CustomerSurveyRequest
        fields = [
            "id",
            "token",
            "status",
            "sent_at",
            "expires_at",
            "submitted_at",
            "submission_id",
        ]


class CustomerSurveySubmissionSerializer(GPSCoordinatesValidationMixin, serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = CustomerSurveySubmission
        fields = [
            "id",
            "customer_name",
            "email",
            "phone",
            "cemetery_name",
            "cemetery_address",
            "section",
            "row",
            "plot_number",
            "grave_number",
            "gps_lat",
            "gps_lng",
            "locating_notes",
            "extra_notes",
            "photo",
            "photo_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["photo_url", "created_at", "updated_at"]
        extra_kwargs = {
            "customer_name": {"required": True},
        }

    def get_photo_url(self, obj):
        if not obj.photo:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url
        except Exception:
            return obj.photo.url


class CustomerSurveyDetailSerializer(serializers.Serializer):
    request = CustomerSurveyRequestSerializer(allow_null=True)
    public_url = serializers.CharField(allow_blank=True)
    service = SchedulingServiceSerializer()
    submission = CustomerSurveySubmissionSerializer(allow_null=True)


class CustomerSurveyRequestCreateSerializer(serializers.Serializer):
    expires_in_days = serializers.IntegerField(min_value=1, max_value=90, required=False)


class PublicSurveyContextSerializer(serializers.Serializer):
    service_id = serializers.IntegerField()
    service_name = serializers.CharField()
    memorial_name = serializers.CharField(allow_blank=True)
    cemetery_name = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    expires_at = serializers.DateTimeField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)


class PublicCustomerSurveySubmissionSerializer(CustomerSurveySubmissionSerializer):
    photo = serializers.FileField(required=False, allow_null=True)

    class Meta(CustomerSurveySubmissionSerializer.Meta):
        read_only_fields = ["photo_url", "created_at", "updated_at"]
