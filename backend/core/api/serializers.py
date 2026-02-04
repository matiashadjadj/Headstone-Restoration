from rest_framework import serializers
from core.models import Service, ServiceAssignment, Photo, Employee


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