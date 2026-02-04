from django.contrib import admin

from . import models


class TimestampedReadonlyMixin:
    """Adds created/updated fields as read-only where present."""

    readonly_fields = ("created_at", "updated_at")


# --- Inline classes ---

class InvoiceItemInline(admin.TabularInline):
    model = models.InvoiceItem
    extra = 0


class ServiceAssignmentInline(admin.TabularInline):
    model = models.ServiceAssignment
    extra = 0


class ServiceStatusHistoryInline(admin.TabularInline):
    model = models.ServiceStatusHistory
    extra = 0
    readonly_fields = ("old_status", "new_status", "changed_by", "changed_at")
    can_delete = False


class PhotoInline(admin.TabularInline):
    model = models.Photo
    extra = 0


# --- Model admin classes ---

@admin.register(models.Customer)
class CustomerAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("full_name", "email", "phone", "city", "state")
    search_fields = ("full_name", "email", "phone", "city", "state")
    list_filter = ("state",)


@admin.register(models.Cemetery)
class CemeteryAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("name", "city", "state", "contact_name", "contact_phone")
    search_fields = ("name", "city", "state", "contact_name")
    list_filter = ("state",)


@admin.register(models.Plot)
class PlotAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("cemetery", "section", "row", "plot_number")
    search_fields = ("cemetery__name", "section", "row", "plot_number")
    list_filter = ("cemetery",)


@admin.register(models.Memorial)
class MemorialAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("id", "customer", "plot", "material", "install_date")
    search_fields = ("customer__full_name", "plot__cemetery__name", "inscription_text")
    list_filter = ("material",)
    inlines = [PhotoInline]


@admin.register(models.Employee)
class EmployeeAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("full_name", "email", "phone", "role", "is_active")
    list_filter = ("role", "is_active")
    search_fields = ("full_name", "email", "phone")


@admin.register(models.Service)
class ServiceAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "memorial",
        "service_type",
        "status",
        "scheduled_date",
        "completed_date",
    )
    list_filter = ("service_type", "status")
    search_fields = ("memorial__customer__full_name", "internal_notes")
    inlines = [ServiceAssignmentInline, ServiceStatusHistoryInline, PhotoInline]


@admin.register(models.ServiceStatusHistory)
class ServiceStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("service", "old_status", "new_status", "changed_by", "changed_at")
    list_filter = ("new_status",)
    search_fields = ("service__id", "changed_by__full_name")
    readonly_fields = ("old_status", "new_status", "changed_by", "changed_at")


@admin.register(models.ServiceAssignment)
class ServiceAssignmentAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("service", "employee", "role")
    list_filter = ("role",)
    search_fields = ("service__id", "employee__full_name")


@admin.register(models.Photo)
class PhotoAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("id", "memorial", "service", "photo_type", "caption")
    list_filter = ("photo_type",)
    search_fields = ("caption", "memorial__id", "service__id")


@admin.register(models.Invoice)
class InvoiceAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("id", "customer", "service", "status", "issued_date", "due_date", "total_amount")
    list_filter = ("status",)
    search_fields = ("customer__full_name", "service__id")
    inlines = [InvoiceItemInline]


@admin.register(models.InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    list_display = ("invoice", "description", "quantity", "unit_price")
    search_fields = ("invoice__id", "description")


@admin.register(models.Payment)
class PaymentAdmin(TimestampedReadonlyMixin, admin.ModelAdmin):
    list_display = ("id", "invoice", "provider", "status", "method", "amount", "currency", "succeeded_at")
    list_filter = ("provider", "status", "method")
    search_fields = ("invoice__id", "invoice__customer__full_name", "provider_reference")
