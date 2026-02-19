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
