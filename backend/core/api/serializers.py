from django.contrib.auth.models import User
from rest_framework import serializers
from core.models import Service, ServiceAssignment, Photo, Employee, Memorial, Customer, Cemetery


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


class AssignTechnicianSerializer(serializers.Serializer):
    technician_id = serializers.IntegerField()
    scheduled_start = serializers.DateTimeField()
    estimated_minutes = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)
    gps_lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    gps_lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    
    def validate_estimated_minutes(self, value):
        # Prevent accidental multi-day values; adjust as needed
        if value > 24 * 60:
            raise serializers.ValidationError("estimated_minutes must be <= 1440 (24 hours)")
        return value

    def validate(self, attrs):
        gps_lat = attrs.get("gps_lat")
        gps_lng = attrs.get("gps_lng")
        if (gps_lat is None) ^ (gps_lng is None):
            raise serializers.ValidationError("Provide both gps_lat and gps_lng, or leave both empty.")
        return attrs


class ServiceAssignmentSerializer(serializers.ModelSerializer):
    technician = serializers.CharField(source="employee.user.username", read_only=True)

    class Meta:
        model = ServiceAssignment
        fields = ["id", "technician"]


class AfterPhotoUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ["image"]  # or whatever your file field is named


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
    cemetery = serializers.CharField(source="plot.cemetery.name", read_only=True)
    customer = serializers.CharField(source="customer.full_name", read_only=True)
    last_service_status = serializers.CharField(read_only=True)
    last_service_date = serializers.DateField(read_only=True)

    class Meta:
        model = Memorial
        fields = ["id", "customer", "cemetery", "last_service_status", "last_service_date"]


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


class TechnicianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ["id", "full_name", "email", "phone"]


class SchedulingServiceSerializer(serializers.ModelSerializer):
    memorial_name = serializers.CharField(source="memorial.customer.full_name", read_only=True)
    cemetery_name = serializers.CharField(source="memorial.plot.cemetery.name", read_only=True)
    technician_id = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    gps_lat = serializers.DecimalField(source="memorial.plot.gps_lat", max_digits=9, decimal_places=6, read_only=True)
    gps_lng = serializers.DecimalField(source="memorial.plot.gps_lng", max_digits=9, decimal_places=6, read_only=True)

    class Meta:
        model = Service
        fields = [
            "id",
            "service_type",
            "status",
            "scheduled_start",
            "estimated_minutes",
            "memorial_name",
            "cemetery_name",
            "technician_id",
            "technician_name",
            "price",
            "gps_lat",
            "gps_lng",
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


class CreateSchedulingServiceSerializer(serializers.Serializer):
    memorial_id = serializers.IntegerField()
    service_type = serializers.ChoiceField(choices=Service.ServiceType.choices, required=False)
    initial_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)


class SendCustomerEmailSerializer(serializers.Serializer):
    customer_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    subject = serializers.CharField(max_length=200)
    body = serializers.CharField()


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
    role = serializers.ChoiceField(choices=Employee.Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        return attrs


class EmployeeCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128)
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Employee.Role.choices, required=False)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value
