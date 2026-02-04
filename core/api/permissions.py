from rest_framework.permissions import BasePermission
from core.models import Employee, ServiceAssignment


class IsManager(BasePermission):
    """
    Allows access only to managers.
    """

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        try:
            employee = Employee.objects.get(user=request.user)
        except Employee.DoesNotExist:
            return False

        return employee.role == Employee.Role.MANAGER


class IsTechnician(BasePermission):
    """
    Allows access only to technicians.
    """

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        try:
            employee = Employee.objects.get(user=request.user)
        except Employee.DoesNotExist:
            return False

        return employee.role == Employee.Role.TECH


class IsAssignedTechnician(BasePermission):
    """
    Technician can only act on services assigned to them.
    Assumes the view has `service_id` in kwargs.
    """

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        service_id = view.kwargs.get("service_id")
        if not service_id:
            return False

        try:
            employee = Employee.objects.get(user=request.user)
        except Employee.DoesNotExist:
            return False

        return ServiceAssignment.objects.filter(
            service_id=service_id,
            employee=employee
        ).exists()