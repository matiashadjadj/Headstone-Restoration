from django.db import models
from django.utils import timezone


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# -----------------------
# Core domain
# -----------------------

class Customer(TimestampedModel):
    full_name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.full_name


class Cemetery(TimestampedModel):
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    contact_name = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.name


class Plot(TimestampedModel):
    cemetery = models.ForeignKey(Cemetery, on_delete=models.CASCADE, related_name="plots")

    # typical cemetery location fields
    section = models.CharField(max_length=50, blank=True)
    row = models.CharField(max_length=50, blank=True)
    plot_number = models.CharField(max_length=50, blank=True)

    # optional precise location
    gps_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gps_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    access_notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["cemetery", "section", "row", "plot_number"],
                name="uniq_plot_per_cemetery_location",
            )
        ]

    def __str__(self) -> str:
        parts = [p for p in [self.section, self.row, self.plot_number] if p]
        loc = " / ".join(parts) if parts else "(no location fields)"
        return f"{self.cemetery.name} - {loc}"


class Memorial(TimestampedModel):
    class Material(models.TextChoices):
        GRANITE = "granite", "Granite"
        MARBLE = "marble", "Marble"
        LIMESTONE = "limestone", "Limestone"
        SANDSTONE = "sandstone", "Sandstone"
        BRONZE = "bronze", "Bronze"
        OTHER = "other", "Other"

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="memorials")
    plot = models.ForeignKey(Plot, on_delete=models.PROTECT, related_name="memorials")

    material = models.CharField(max_length=50, choices=Material.choices, default=Material.OTHER)
    inscription_text = models.TextField(blank=True)
    condition_summary = models.TextField(blank=True)
    install_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"Memorial #{self.id} ({self.customer.full_name})"


# -----------------------
# Staff & assignments
# -----------------------

class Employee(TimestampedModel):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        TECH = "tech", "Technician"
        OTHER = "other", "Other"

    full_name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=30, choices=Role.choices, default=Role.TECH)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.full_name


# -----------------------
# Services / work tracking
# -----------------------

class Service(TimestampedModel):
    class ServiceType(models.TextChoices):
        CLEANING = "cleaning", "Cleaning"
        RESET = "reset", "Reset"
        LEVELING = "leveling", "Leveling"
        REPAIR = "repair", "Repair"
        ENGRAVING = "engraving", "Engraving"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        CANCELED = "canceled", "Canceled"

    memorial = models.ForeignKey(Memorial, on_delete=models.CASCADE, related_name="services")

    service_type = models.CharField(max_length=30, choices=ServiceType.choices, default=ServiceType.OTHER)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DRAFT)

    scheduled_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)

    # optional cost tracking (can also be computed from invoice items)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    internal_notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"Service #{self.id} - {self.get_service_type_display()} ({self.get_status_display()})"


class ServiceStatusHistory(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="status_history")
    old_status = models.CharField(max_length=30, blank=True)
    new_status = models.CharField(max_length=30)
    changed_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="status_changes")
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self) -> str:
        return f"Service #{self.service_id}: {self.old_status} -> {self.new_status}"


class ServiceAssignment(TimestampedModel):
    class AssignmentRole(models.TextChoices):
        LEAD = "lead", "Lead"
        HELPER = "helper", "Helper"
        OTHER = "other", "Other"

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="assignments")
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="assignments")
    role = models.CharField(max_length=20, choices=AssignmentRole.choices, default=AssignmentRole.OTHER)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["service", "employee"],
                name="uniq_employee_per_service",
            )
        ]

    def __str__(self) -> str:
        return f"{self.employee.full_name} on Service #{self.service_id}"


class Photo(TimestampedModel):
    class PhotoType(models.TextChoices):
        BEFORE = "before", "Before"
        DURING = "during", "During"
        AFTER = "after", "After"
        OTHER = "other", "Other"

    memorial = models.ForeignKey(Memorial, on_delete=models.CASCADE, related_name="photos")
    service = models.ForeignKey(Service, on_delete=models.SET_NULL, null=True, blank=True, related_name="photos")

    photo_type = models.CharField(max_length=20, choices=PhotoType.choices, default=PhotoType.OTHER)

    # If you use Supabase Storage, you typically store a public URL or a path/key.
    image_url = models.URLField(max_length=500)
    caption = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return f"{self.get_photo_type_display()} photo for Memorial #{self.memorial_id}"


# -----------------------
# Billing (phase 1 if needed)
# -----------------------


class Invoice(TimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PAID = "paid", "Paid"
        VOID = "void", "Void"

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="invoices")
    service = models.ForeignKey(Service, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    issued_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)

    # Money
    currency = models.CharField(max_length=3, default="usd")  # Stripe uses lowercase currency codes, but storing "usd" is fine
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    paid_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    # Stripe references (NO card data)
    stripe_customer_id = models.CharField(max_length=255, blank=True)
    stripe_checkout_session_id = models.CharField(max_length=255, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return f"Invoice #{self.id} ({self.customer.full_name})"


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    def line_total(self):
        return self.quantity * self.unit_price

    def __str__(self) -> str:
        return f"Item for Invoice #{self.invoice_id}: {self.description}"


class Payment(TimestampedModel):
    """
    Represents a payment attempt/record.
    For Stripe, store provider IDs (session/payment_intent/charge), status, amount.
    For manual payments (cash/check), store method + reference/notes.
    """
    class Provider(models.TextChoices):
        STRIPE = "stripe", "Stripe"
        MANUAL = "manual", "Manual"

    class Status(models.TextChoices):
        REQUIRES_ACTION = "requires_action", "Requires action"
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"
        REFUNDED = "refunded", "Refunded"

    class Method(models.TextChoices):
        CARD = "card", "Card"
        CASH = "cash", "Cash"
        CHECK = "check", "Check"
        ACH = "ach", "ACH"
        OTHER = "other", "Other"

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")

    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.STRIPE)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CARD)

    currency = models.CharField(max_length=3, default="usd")
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    # Stripe IDs / references (safe to store)
    stripe_checkout_session_id = models.CharField(max_length=255, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True)
    stripe_charge_id = models.CharField(max_length=255, blank=True)

    # Optional bookkeeping
    receipt_url = models.URLField(max_length=500, blank=True)
    provider_reference = models.CharField(max_length=255, blank=True)  # e.g., check #, manual reference
    notes = models.TextField(blank=True)

    succeeded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["stripe_payment_intent_id"]),
            models.Index(fields=["stripe_checkout_session_id"]),
        ]

    def __str__(self) -> str:
        return f"Payment #{self.id} for Invoice #{self.invoice_id} ({self.status})"
