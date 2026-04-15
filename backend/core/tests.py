import os
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.contrib.auth.models import User
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from communications.exceptions import EmailDeliveryError
from communications.services import send_email
from core.models import Cemetery, Customer, CustomerSurveyRequest, CustomerSurveySubmission, Employee, EmployeeInvite, Invoice, InvoiceItem, Memorial, Payment, Photo, Plot, Service, ServiceAssignment, ServiceOption, UserProfile


class ImportCustomersCommandTests(TestCase):
    def _write_csv(self, contents):
        temp_file = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
        self.addCleanup(lambda: os.path.exists(temp_file.name) and os.unlink(temp_file.name))
        temp_file.write(contents)
        temp_file.close()
        return temp_file.name

    def test_import_customers_creates_rows_from_csv(self):
        csv_path = self._write_csv(
            "name,email,phone,street,city,state,zip,notes\n"
            "Jane Doe,jane@example.com,555-1111,123 Main St,Albany,NY,12207,VIP\n"
        )

        call_command("import_customers", csv_path)

        customer = Customer.objects.get(email="jane@example.com")
        self.assertEqual(customer.full_name, "Jane Doe")
        self.assertEqual(customer.address_line1, "123 Main St")
        self.assertEqual(customer.postal_code, "12207")
        self.assertEqual(customer.notes, "VIP")

    def test_import_customers_dry_run_does_not_persist(self):
        csv_path = self._write_csv(
            "full_name,email\n"
            "Dry Run Customer,dryrun@example.com\n"
        )

        call_command("import_customers", csv_path, "--dry-run")

        self.assertFalse(Customer.objects.filter(email="dryrun@example.com").exists())

    def test_import_customers_updates_existing_when_enabled(self):
        Customer.objects.create(
            full_name="Jane Doe",
            email="jane@example.com",
            phone="555-0000",
            city="Old City",
        )
        csv_path = self._write_csv(
            "full_name,email,phone,city\n"
            "Jane Doe,jane@example.com,555-9999,New City\n"
        )

        call_command("import_customers", csv_path, "--update-existing")

        customer = Customer.objects.get(email="jane@example.com")
        self.assertEqual(customer.phone, "555-9999")
        self.assertEqual(customer.city, "New City")


class ImportCustomerReportCommandTests(TestCase):
    def _write_csv(self, contents):
        temp_file = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
        self.addCleanup(lambda: os.path.exists(temp_file.name) and os.unlink(temp_file.name))
        temp_file.write(contents)
        temp_file.close()
        return temp_file.name

    def test_import_customer_report_groups_rows_by_bill_to_or_email(self):
        csv_path = self._write_csv(
            "Customer ID,Last Name,First Name,Linked Properties,Billing First Name,Billing Last Name,Subscription Last Completed,Email Address,Latitude,Longitude,Phone 1,Initial Price,Bill To Customer ID\n"
            "12062,Hickman,Alice,,Judi,Hickman,04/17/24,jnjhickman2@msn.com,37.689358,-113.063240,4356914788,110.00,12061\n"
            "12063,John Hickman,Cecil,,Judi,Hickman,04/17/24,jnjhickman2@msn.com,37.690857,-113.064919,4356914788,125.00,12061\n"
        )

        call_command("import_customer_report", csv_path)

        customers = list(Customer.objects.all())
        self.assertEqual(len(customers), 1)
        self.assertEqual(customers[0].full_name, "Judi Hickman")
        self.assertEqual(customers[0].email, "jnjhickman2@msn.com")
        self.assertEqual(customers[0].phone, "(435) 691-4788")
        self.assertIn("Legacy customer IDs: 12062, 12063", customers[0].notes)
        self.assertIn("Legacy bill-to IDs: 12061", customers[0].notes)

    def test_import_customer_report_dry_run_does_not_persist(self):
        csv_path = self._write_csv(
            "Customer ID,Last Name,First Name,Linked Properties,Billing First Name,Billing Last Name,Subscription Last Completed,Email Address,Latitude,Longitude,Phone 1,Initial Price,Bill To Customer ID\n"
            "10002,Brown,Jason,10003,Jason,Brown,-,jasonb@beavercityut.gov,38.273926,-112.641685,4354211008,400.00,\n"
        )

        call_command("import_customer_report", csv_path, "--dry-run")

        self.assertEqual(Customer.objects.count(), 0)


@override_settings(STRIPE_SECRET_KEY="sk_test_dummy", STRIPE_PUBLISHABLE_KEY="pk_test_dummy")
class StripeCheckoutFlowTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            full_name="Sarah Johnson",
            email="sarah.johnson@example.com",
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            status=Invoice.Status.SENT,
            currency="usd",
            total_amount="125.00",
        )
        InvoiceItem.objects.create(
            invoice=self.invoice,
            description="Headstone cleaning",
            quantity="1.00",
            unit_price="125.00",
        )

    def test_lists_customer_invoices_by_email(self):
        response = self.client.get(
            reverse("customer-invoices"),
            {"email": self.customer.email},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], self.invoice.id)
        self.assertEqual(payload[0]["items"][0]["description"], "Headstone cleaning")

    @patch("core.api.views.stripe_client.create_checkout_session")
    def test_creates_checkout_session_and_pending_payment(self, mocked_create_session):
        mocked_create_session.return_value = {
            "id": "cs_test_123",
            "url": "https://checkout.stripe.com/c/pay/cs_test_123",
        }

        response = self.client.post(
            reverse("payments-checkout-session"),
            data={
                "invoice_id": self.invoice.id,
                "customer_email": self.customer.email,
            },
            content_type="application/json",
            HTTP_ORIGIN="http://127.0.0.1:5173",
        )

        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        payment = Payment.objects.get(invoice=self.invoice)
        self.assertEqual(self.invoice.stripe_checkout_session_id, "cs_test_123")
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(response.json()["checkout_url"], "https://checkout.stripe.com/c/pay/cs_test_123")

    @patch("core.api.views.stripe_client.retrieve_checkout_session")
    def test_verifies_checkout_session_and_marks_invoice_paid(self, mocked_retrieve_session):
        self.invoice.stripe_checkout_session_id = "cs_test_paid"
        self.invoice.save(update_fields=["stripe_checkout_session_id", "updated_at"])
        Payment.objects.create(
            invoice=self.invoice,
            provider=Payment.Provider.STRIPE,
            method=Payment.Method.CARD,
            status=Payment.Status.PENDING,
            currency="usd",
            amount="125.00",
            stripe_checkout_session_id="cs_test_paid",
        )

        mocked_retrieve_session.return_value = {
            "id": "cs_test_paid",
            "status": "complete",
            "payment_status": "paid",
            "payment_intent": {
                "id": "pi_123",
                "latest_charge": {
                    "id": "ch_123",
                    "receipt_url": "https://pay.stripe.com/receipts/123",
                },
            },
        }

        response = self.client.get(
            reverse("payments-checkout-session-verify"),
            {"session_id": "cs_test_paid"},
        )

        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        payment = Payment.objects.get(invoice=self.invoice, stripe_checkout_session_id="cs_test_paid")
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertIsNotNone(self.invoice.paid_at)
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(payment.stripe_payment_intent_id, "pi_123")
        self.assertEqual(payment.receipt_url, "https://pay.stripe.com/receipts/123")


@override_settings(
    EMAIL_PROVIDER="django",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="default@example.com",
    PANEL_FROM_EMAIL="panel@example.com",
)
class EmailServiceTests(TestCase):
    def test_send_email_uses_reusable_django_provider(self):
        result = send_email(
            subject="Project update",
            text_body="Everything is on schedule.",
            recipient_list=["customer@example.com"],
            purpose="panel",
        )

        self.assertEqual(result.provider, "django")
        self.assertEqual(result.recipient_count, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].from_email, "panel@example.com")
        self.assertEqual(mail.outbox[0].to, ["customer@example.com"])

    @override_settings(EMAIL_PROVIDER="unsupported")
    def test_send_email_rejects_unknown_provider(self):
        with self.assertRaises(EmailDeliveryError):
            send_email(
                subject="Project update",
                text_body="Everything is on schedule.",
                recipient_list=["customer@example.com"],
            )


@override_settings(
    EMAIL_PROVIDER="django",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="default@example.com",
    PANEL_FROM_EMAIL="panel@example.com",
)
class SendCustomerEmailViewTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            full_name="Sarah Johnson",
            email="sarah@example.com",
        )
        self.customer_missing_email = Customer.objects.create(
            full_name="No Email Customer",
            email="",
        )

    def test_email_panel_sends_via_shared_service(self):
        response = self.client.post(
            reverse("emails-send"),
            data={
                "customer_ids": [self.customer.id],
                "subject": "Hello {{first_name}}",
                "body": "Emailing {{email}}",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["from_email"], "panel@example.com")
        self.assertEqual(payload["sent_count"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Hello Sarah")
        self.assertEqual(mail.outbox[0].body, "Emailing sarah@example.com")

    def test_email_panel_sends_to_manual_recipients(self):
        response = self.client.post(
            reverse("emails-send"),
            data={
                "recipients": [
                    {"email": "manual@example.com", "name": "Manual Recipient"},
                ],
                "subject": "Hello {{client_name}}",
                "body": "Emailing {{email}}",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["sent_count"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Hello Manual Recipient")
        self.assertEqual(mail.outbox[0].body, "Emailing manual@example.com")

    def test_email_panel_deduplicates_customer_and_manual_recipients(self):
        response = self.client.post(
            reverse("emails-send"),
            data={
                "customer_ids": [self.customer.id],
                "recipients": [
                    {"email": "sarah@example.com", "name": "Sarah Duplicate"},
                ],
                "subject": "Hello",
                "body": "Testing",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["sent_count"], 1)
        self.assertEqual(payload["skipped_count"], 1)
        self.assertEqual(payload["skipped"][0]["reason"], "duplicate_email")

    @patch("core.api.views.send_email")
    def test_email_panel_reports_partial_failures(self, mocked_send_email):
        def side_effect(**kwargs):
            if kwargs["recipient_list"] == ["sarah@example.com"]:
                raise EmailDeliveryError("SMTP unavailable")
            return None

        mocked_send_email.side_effect = side_effect

        response = self.client.post(
            reverse("emails-send"),
            data={
                "customer_ids": [self.customer.id, self.customer_missing_email.id],
                "subject": "Hello",
                "body": "Testing",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 207)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["sent_count"], 0)
        self.assertEqual(payload["skipped_count"], 1)
        self.assertEqual(payload["failed_count"], 1)
        self.assertEqual(payload["failed"][0]["error"], "SMTP unavailable")


@override_settings(
    EMAIL_PROVIDER="django",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="default@example.com",
    PANEL_FROM_EMAIL="panel@example.com",
)
class CustomerSurveyFlowTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            full_name="Mary Plotter",
            email="mary@example.com",
            phone="555-111-2222",
        )
        self.cemetery = Cemetery.objects.create(
            name="Oak Hill Cemetery",
            address="123 Cemetery Rd",
        )
        self.plot = Plot.objects.create(
            cemetery=self.cemetery,
            section="A",
            row="2",
            plot_number="14",
        )
        self.memorial = Memorial.objects.create(
            customer=self.customer,
            plot=self.plot,
        )
        self.service_option, _ = ServiceOption.objects.get_or_create(name="Cleaning")
        self.service = Service.objects.create(
            memorial=self.memorial,
            service_option=self.service_option,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.DRAFT,
        )

    def test_staff_can_generate_customer_survey_link(self):
        response = self.client.post(
            reverse("manage-service-survey", args=[self.service.id]),
            data={},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["request"]["status"], "pending")
        self.assertIn("/survey/", payload["public_url"])
        self.assertTrue(CustomerSurveyRequest.objects.filter(service=self.service).exists())
        self.assertEqual(payload["detail"], "Survey sent to mary@example.com.")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["mary@example.com"])

    def test_public_submission_updates_official_records(self):
        survey_request = CustomerSurveyRequest.objects.create(service=self.service)

        response = self.client.post(
            reverse("public-survey-detail", args=[survey_request.token]),
            data={
                "customer_name": "Mary Plotter",
                "email": "mary.updated@example.com",
                "phone": "555-333-4444",
                "cemetery_name": "Oak Hill North",
                "cemetery_address": "500 New Address",
                "section": "B",
                "row": "9",
                "plot_number": "77",
                "grave_number": "12",
                "gps_lat": "35.467560",
                "gps_lng": "-97.516426",
                "locating_notes": "Near the large oak tree.",
                "extra_notes": "Please call when onsite.",
            },
        )

        self.assertEqual(response.status_code, 201)
        survey_request.refresh_from_db()
        submission = CustomerSurveySubmission.objects.get(survey_request=survey_request)
        self.customer.refresh_from_db()
        self.plot.refresh_from_db()
        self.memorial.refresh_from_db()
        synced_cemetery = Cemetery.objects.get(name="Oak Hill North")
        synced_plot = self.memorial.plot

        self.assertEqual(survey_request.status, "submitted")
        self.assertEqual(submission.cemetery_name, "Oak Hill North")
        self.assertEqual(self.customer.email, "mary.updated@example.com")
        self.assertEqual(self.customer.phone, "555-333-4444")
        self.assertEqual(self.customer.full_name, "Mary Plotter")
        self.assertEqual(synced_cemetery.address, "500 New Address")
        self.assertEqual(synced_plot.cemetery_id, synced_cemetery.id)
        self.assertEqual(synced_plot.section, "B")
        self.assertEqual(synced_plot.row, "9")
        self.assertEqual(synced_plot.plot_number, "77")
        self.assertEqual(str(synced_plot.gps_lat), "35.467560")
        self.assertEqual(str(synced_plot.gps_lng), "-97.516426")
        self.assertIn("Near the large oak tree.", synced_plot.access_notes)
        self.assertIn("Grave number: 12", synced_plot.access_notes)

    def test_public_submission_rejects_out_of_range_gps(self):
        survey_request = CustomerSurveyRequest.objects.create(service=self.service)

        response = self.client.post(
            reverse("public-survey-detail", args=[survey_request.token]),
            data={
                "customer_name": "Mary Plotter",
                "gps_lat": "120.000000",
                "gps_lng": "-97.516426",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("gps_lat", response.json())


@override_settings(
    EMAIL_PROVIDER="django",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="default@example.com",
    PANEL_FROM_EMAIL="billing@example.com",
)
class AdminInvoiceSendViewTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            full_name="Samuel Client",
            email="samuel@example.com",
        )
        self.cemetery = Cemetery.objects.create(name="Oak Rest Cemetery")
        self.plot = Plot.objects.create(cemetery=self.cemetery, section="B", row="3", plot_number="10")
        self.memorial = Memorial.objects.create(customer=self.customer, plot=self.plot)
        self.service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.COMPLETED,
            completed_date=timezone.localdate(),
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            service=self.service,
            total_amount="125.00",
            status=Invoice.Status.DRAFT,
        )
        InvoiceItem.objects.create(
            invoice=self.invoice,
            description="Headstone cleaning",
            quantity="1.00",
            unit_price="125.00",
        )

    def test_admin_can_list_invoices(self):
        response = self.client.get(reverse("manage-invoices"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], self.invoice.id)
        self.assertEqual(payload[0]["customer_email"], "samuel@example.com")
        self.assertEqual(payload[0]["service_name"], "Cleaning")

    @patch("core.api.views.stripe_client.create_checkout_session")
    def test_admin_can_send_personalized_invoice_email(self, mocked_create_checkout_session):
        mocked_create_checkout_session.return_value = {
            "id": "cs_test_invoice_send",
            "url": "https://checkout.stripe.com/c/pay/cs_test_invoice_send",
        }

        response = self.client.post(
            reverse("manage-invoice-send", args=[self.invoice.id]),
            data={
                "subject": "Invoice {{invoice_id}} for {{first_name}}",
                "body": "Hello {{client_name}}, pay here: {{payment_link}}. Due {{due_date}}.",
                "due_date": "2026-04-15",
                "notes": "Net 14",
            },
            content_type="application/json",
            HTTP_ORIGIN="http://127.0.0.1:5173",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["sent_to"], "samuel@example.com")
        self.assertEqual(payload["checkout_url"], "https://checkout.stripe.com/c/pay/cs_test_invoice_send")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].from_email, "billing@example.com")
        self.assertEqual(mail.outbox[0].subject, f"Invoice {self.invoice.id} for Samuel")
        self.assertIn("https://checkout.stripe.com/c/pay/cs_test_invoice_send", mail.outbox[0].body)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.SENT)
        self.assertEqual(str(self.invoice.due_date), "2026-04-15")
        self.assertEqual(self.invoice.notes, "Net 14")
        payment = Payment.objects.get(invoice=self.invoice, stripe_checkout_session_id="cs_test_invoice_send")
        self.assertEqual(payment.status, Payment.Status.PENDING)


class AuthSessionTests(TestCase):
    def test_login_maps_manager_employee_to_employee_layout(self):
        user = User.objects.create_user(username="manager_demo", password="secret123", email="manager@example.com")
        Employee.objects.create(
            user=user,
            full_name="Morgan Manager",
            email="manager@example.com",
            role=Employee.Role.MANAGER,
        )

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "manager@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["authenticated"])
        self.assertEqual(payload["user"]["frontend_role"], "employee")
        self.assertEqual(payload["user"]["source_role"], Employee.Role.MANAGER)

    def test_login_maps_technician_employee_to_employee_layout(self):
        user = User.objects.create_user(username="tech_demo", password="secret123", email="tech@example.com")
        Employee.objects.create(
            user=user,
            full_name="Taylor Tech",
            email="tech@example.com",
            role=Employee.Role.TECH,
        )

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "tech@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["frontend_role"], "employee")

    def test_login_maps_front_desk_employee_to_frontdesk_layout(self):
        user = User.objects.create_user(username="desk_demo", password="secret123", email="desk@example.com")
        Employee.objects.create(
            user=user,
            full_name="Fran Front Desk",
            email="desk@example.com",
            role=Employee.Role.FRONT_DESK,
        )

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "desk@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["frontend_role"], "frontdesk")

    def test_login_accepts_username_and_returns_matching_employee_role(self):
        user = User.objects.create_user(username="crew_demo", password="secret123", email="crew@example.com")
        Employee.objects.create(
            user=user,
            full_name="Casey Crew",
            email="crew@example.com",
            role=Employee.Role.TECH,
        )

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "crew_demo", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["username"], "crew_demo")
        self.assertEqual(payload["user"]["frontend_role"], "employee")

    def test_login_maps_customer_by_matching_email(self):
        Customer.objects.create(full_name="Cora Customer", email="cora@example.com")
        User.objects.create_user(username="cora_user", password="secret123", email="cora@example.com")

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "cora@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["frontend_role"], "customer")
        self.assertEqual(payload["user"]["source_role"], "customer")

    def test_login_rejects_unmapped_user(self):
        User.objects.create_user(username="orphan_user", password="secret123", email="orphan@example.com")

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "orphan@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_login_rejects_staff_user_without_employee_mapping(self):
        User.objects.create_user(
            username="staff_only",
            password="secret123",
            email="staff@example.com",
            is_staff=True,
        )

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "staff@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_session_returns_unauthenticated_without_login(self):
        response = self.client.get(reverse("auth-session"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"authenticated": False, "user": None})

    def test_login_rejects_duplicate_staff_accounts_without_employee_mapping(self):
        User.objects.create_user(username="dup_admin_1", password="secret123", email="dup@example.com", is_staff=True)
        User.objects.create_user(username="dup_admin_2", password="secret123", email="dup@example.com", is_staff=True)

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "dup@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_login_rejects_ambiguous_identifier_when_multiple_accounts_match_credentials(self):
        admin_user = User.objects.create_user(
            username="shared_admin",
            password="secret123",
            email="shared@example.com",
            is_superuser=True,
            is_staff=True,
        )
        User.objects.create_user(username="shared@example.com", password="secret123", email="other@example.com")
        Employee.objects.create(
            user=admin_user,
            full_name="Shared Admin",
            email="shared@example.com",
            role=Employee.Role.ADMIN,
        )
        Customer.objects.create(full_name="Shared Customer", email="other@example.com")
        User.objects.create_user(
            username="Shared@Example.com",
            password="secret123",
            email="other@example.com",
        )

        response = self.client.post(
            reverse("auth-login"),
            data={"email": "shared@example.com", "password": "secret123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)

    def test_admin_can_create_employee_invite_and_send_setup_email(self):
        response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_member",
                "full_name": "Crew Member",
                "email": "crew@example.com",
                "phone": "555-1000",
                "role": Employee.Role.TECH,
            },
            content_type="application/json",
            HTTP_ORIGIN="http://127.0.0.1:5173",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        invite = EmployeeInvite.objects.get(invited_email="crew@example.com")
        user = User.objects.get(username="crew_member")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(payload["employee"]["email"], "crew@example.com")
        self.assertIn("?invite=", payload["invite_url"])
        self.assertIn("#/setup-password", payload["invite_url"])
        self.assertIn("/index.html", payload["invite_url"])
        self.assertTrue(payload["invite_sent"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(invite.token, mail.outbox[0].body)

    @override_settings(EMAIL_FRONTEND_BASE_URL="https://app.example.com")
    def test_admin_create_employee_invite_uses_configured_frontend_base_url(self):
        response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_member_two",
                "full_name": "Crew Member Two",
                "email": "crew2@example.com",
                "phone": "555-1001",
                "role": Employee.Role.TECH,
            },
            content_type="application/json",
            HTTP_ORIGIN="http://127.0.0.1:5173",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["invite_url"].startswith("https://app.example.com/index.html?invite="))

    def test_admin_can_create_employee_without_sending_invite(self):
        response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_member_no_invite",
                "full_name": "Crew Member No Invite",
                "email": "crew-no-invite@example.com",
                "phone": "555-1002",
                "role": Employee.Role.TECH,
                "send_invite": False,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertFalse(payload["invite_sent"])
        self.assertIsNone(payload["invite"])
        self.assertIsNone(payload["invite_url"])
        self.assertEqual(EmployeeInvite.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    @patch("core.api.views.send_employee_invite_email")
    def test_admin_create_employee_reports_invite_email_failure(self, mocked_send_invite_email):
        mocked_send_invite_email.side_effect = EmailDeliveryError("SMTP authentication failed")

        response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_member_fail",
                "full_name": "Crew Member Fail",
                "email": "crew-fail@example.com",
                "phone": "555-1009",
                "role": Employee.Role.TECH,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "SMTP authentication failed")


    def test_admin_can_update_employee_details(self):
        user = User.objects.create_user(username="crew_old", email="old@example.com")
        employee = Employee.objects.create(
            user=user,
            full_name="Old Name",
            email="old@example.com",
            phone="555-0100",
            role=Employee.Role.TECH,
            is_active=True,
        )

        response = self.client.patch(
            reverse("manage-employee-detail", args=[employee.id]),
            data={
                "username": "crew_new",
                "full_name": "Updated Name",
                "email": "new@example.com",
                "phone": "555-0101",
                "role": Employee.Role.MANAGER,
                "is_active": False,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        employee.refresh_from_db()
        self.assertEqual(user.username, "crew_new")
        self.assertEqual(user.email, "new@example.com")
        self.assertEqual(employee.full_name, "Updated Name")
        self.assertEqual(employee.email, "new@example.com")
        self.assertEqual(employee.phone, "555-0101")
        self.assertEqual(employee.role, Employee.Role.MANAGER)
        self.assertFalse(employee.is_active)

    def test_employee_can_set_password_from_invite(self):
        user = User.objects.create_user(username="invitee_user", email="invitee@example.com")
        user.set_unusable_password()
        user.save(update_fields=["password"])
        employee = Employee.objects.create(
            user=user,
            full_name="Invitee User",
            email="invitee@example.com",
            role=Employee.Role.TECH,
        )
        invite = EmployeeInvite.objects.create(
            employee=employee,
            user=user,
            invited_email="invitee@example.com",
        )

        response = self.client.post(
            reverse("auth-password-setup"),
            data={
                "token": invite.token,
                "password": "welcome123",
                "password_confirm": "welcome123",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        invite.refresh_from_db()
        user.refresh_from_db()
        self.assertIsNotNone(invite.used_at)
        self.assertTrue(user.check_password("welcome123"))
        self.assertEqual(response.json()["user"]["frontend_role"], "employee")

    def test_password_setup_get_rejects_expired_token(self):
        user = User.objects.create_user(username="expired_user", email="expired@example.com")
        user.set_unusable_password()
        user.save(update_fields=["password"])
        employee = Employee.objects.create(
            user=user,
            full_name="Expired Invite User",
            email="expired@example.com",
            role=Employee.Role.TECH,
        )
        invite = EmployeeInvite.objects.create(
            employee=employee,
            user=user,
            invited_email="expired@example.com",
        )
        invite.expires_at = timezone.now() - timezone.timedelta(minutes=5)
        invite.save(update_fields=["expires_at", "updated_at"])

        response = self.client.get(
            reverse("auth-password-setup"),
            {"token": invite.token},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Invite is invalid or expired.")

    def test_password_setup_post_rejects_invalid_token(self):
        response = self.client.post(
            reverse("auth-password-setup"),
            data={
                "token": "not-a-real-token",
                "password": "welcome123",
                "password_confirm": "welcome123",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Invite is invalid or expired.")

    def test_password_setup_rejects_revoked_token_after_resend(self):
        response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_resend",
                "full_name": "Crew Resend",
                "email": "crew-resend@example.com",
                "phone": "555-1003",
                "role": Employee.Role.TECH,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        employee_id = response.json()["employee"]["id"]
        first_invite = EmployeeInvite.objects.get(employee_id=employee_id)

        resend_response = self.client.post(
            reverse("manage-employee-invite-resend", args=[employee_id]),
            content_type="application/json",
        )

        self.assertEqual(resend_response.status_code, 200)
        first_invite.refresh_from_db()
        self.assertIsNotNone(first_invite.revoked_at)
        second_invite = EmployeeInvite.objects.filter(employee_id=employee_id).exclude(id=first_invite.id).get()
        self.assertNotEqual(first_invite.token, second_invite.token)

        old_token_response = self.client.post(
            reverse("auth-password-setup"),
            data={
                "token": first_invite.token,
                "password": "welcome123",
                "password_confirm": "welcome123",
            },
            content_type="application/json",
        )
        new_token_response = self.client.get(
            reverse("auth-password-setup"),
            {"token": second_invite.token},
        )

        self.assertEqual(old_token_response.status_code, 400)
        self.assertEqual(old_token_response.json()["detail"], "Invite is invalid or expired.")
        self.assertEqual(new_token_response.status_code, 200)

    def test_admin_can_resend_employee_invite(self):
        create_response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_member_resend",
                "full_name": "Crew Member Resend",
                "email": "crew-resend-two@example.com",
                "phone": "555-1004",
                "role": Employee.Role.TECH,
            },
            content_type="application/json",
        )
        employee_id = create_response.json()["employee"]["id"]

        response = self.client.post(
            reverse("manage-employee-invite-resend", args=[employee_id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("?invite=", payload["invite_url"])
        self.assertIn("#/setup-password", payload["invite_url"])
        self.assertIn("/static/index.html", payload["invite_url"])
        self.assertEqual(payload["invite"]["invited_email"], "crew-resend-two@example.com")

    @patch("core.api.views.send_employee_invite_email")
    def test_resend_invite_reports_email_failure(self, mocked_send_invite_email):
        create_response = self.client.post(
            reverse("manage-employees-create"),
            data={
                "username": "crew_member_resend_fail",
                "full_name": "Crew Member Resend Fail",
                "email": "crew-resend-fail@example.com",
                "phone": "555-1010",
                "role": Employee.Role.TECH,
                "send_invite": False,
            },
            content_type="application/json",
        )
        employee_id = create_response.json()["employee"]["id"]
        mocked_send_invite_email.side_effect = EmailDeliveryError("SMTP authentication failed")

        response = self.client.post(
            reverse("manage-employee-invite-resend", args=[employee_id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "SMTP authentication failed")

    def test_resend_invite_rejects_activated_employee(self):
        user = User.objects.create_user(username="active_user", email="active@example.com", password="welcome123")
        employee = Employee.objects.create(
            user=user,
            full_name="Active User",
            email="active@example.com",
            role=Employee.Role.TECH,
        )

        response = self.client.post(
            reverse("manage-employee-invite-resend", args=[employee.id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Employee already activated their account.")

    def test_profile_endpoint_reads_and_updates_employee_profile(self):
        user = User.objects.create_user(username="profile_user", password="secret123", email="profile@example.com")
        Employee.objects.create(
            user=user,
            full_name="Profile User",
            email="profile@example.com",
            phone="555-1111",
            role=Employee.Role.TECH,
        )
        self.client.force_login(user)

        get_response = self.client.get(reverse("auth-profile"))
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["full_name"], "Profile User")

        photo = SimpleUploadedFile("avatar.png", b"fake-image-bytes", content_type="image/png")
        patch_response = self.client.generic(
            "PATCH",
            reverse("auth-profile"),
            encode_multipart(
                BOUNDARY,
                {
                    "full_name": "Updated User",
                    "email": "updated@example.com",
                    "phone": "555-2222",
                    "date_of_birth": "1990-05-10",
                    "city": "Boston",
                    "bio": "Field tech",
                    "profile_photo": photo,
                },
            ),
            content_type=MULTIPART_CONTENT,
        )

        self.assertEqual(patch_response.status_code, 200)
        user.refresh_from_db()
        employee = user.employee
        employee.refresh_from_db()
        profile = UserProfile.objects.get(user=user)
        self.assertEqual(user.email, "updated@example.com")
        self.assertEqual(employee.full_name, "Updated User")
        self.assertEqual(employee.phone, "555-2222")
        self.assertEqual(str(profile.date_of_birth), "1990-05-10")
        self.assertEqual(profile.city, "Boston")
        self.assertTrue(profile.profile_photo.name.startswith("profile_photos/"))


class ServiceOptionTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(full_name="Casey Client", email="casey@example.com")
        self.cemetery = Cemetery.objects.create(name="Greenwood")
        self.plot = Plot.objects.create(cemetery=self.cemetery, section="A", row="1", plot_number="12")
        self.memorial = Memorial.objects.create(customer=self.customer, plot=self.plot)

    def test_can_create_service_option_from_manage_endpoint(self):
        response = self.client.post(
            reverse("manage-service-options"),
            data={"name": "Bronze Reset", "sort_order": 15, "is_active": True},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["service_option"]
        self.assertEqual(payload["name"], "Bronze Reset")
        self.assertTrue(ServiceOption.objects.filter(name="Bronze Reset").exists())

    def test_create_service_uses_service_option(self):
        option = ServiceOption.objects.create(name="Bronze Reset", sort_order=15)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={"memorial_id": self.memorial.id, "service_option_id": option.id, "initial_price": "85.00"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        service = Service.objects.get(id=response.json()["service"]["id"])
        self.assertEqual(service.service_option_id, option.id)
        self.assertEqual(response.json()["service"]["service_type_label"], "Bronze Reset")


class MemorialManageTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(full_name="Casey Client", email="casey@example.com")
        self.cemetery = Cemetery.objects.create(name="Greenwood", city="Boston")

    def test_can_create_memorial_from_manage_endpoint(self):
        response = self.client.post(
            reverse("manage-memorials"),
            data={
                "customer_id": self.customer.id,
                "cemetery_id": self.cemetery.id,
                "section": "A",
                "row": "2",
                "plot_number": "14",
                "material": Memorial.Material.GRANITE,
                "notes": "North side marker",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["memorial"]
        self.assertEqual(payload["customer"], "Casey Client")
        self.assertEqual(payload["cemetery"], "Greenwood")
        self.assertEqual(payload["section"], "A")
        self.assertEqual(payload["plot_number"], "14")
        memorial = Memorial.objects.get(id=payload["id"])
        self.assertEqual(memorial.material, Memorial.Material.GRANITE)
        self.assertEqual(memorial.notes, "North side marker")

    def test_manage_memorials_list_returns_created_memorial(self):
        plot = Plot.objects.create(cemetery=self.cemetery, section="A", row="2", plot_number="14")
        Memorial.objects.create(customer=self.customer, plot=plot, material=Memorial.Material.MARBLE)

        response = self.client.get(reverse("manage-memorials"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["customer"], "Casey Client")
        self.assertEqual(payload[0]["material"], Memorial.Material.MARBLE)


class CemeteryManageTests(TestCase):
    def test_can_create_cemetery_from_manage_endpoint(self):
        response = self.client.post(
            reverse("manage-cemeteries"),
            data={
                "name": "Evergreen Memorial Park",
                "city": "Boston",
                "state": "MA",
                "address": "123 Main St",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["cemetery"]
        self.assertEqual(payload["name"], "Evergreen Memorial Park")
        self.assertEqual(payload["city"], "Boston")
        self.assertTrue(Cemetery.objects.filter(name="Evergreen Memorial Park").exists())

    def test_manage_cemeteries_list_returns_created_cemetery(self):
        Cemetery.objects.create(name="Greenwood", city="Boston")

        response = self.client.get(reverse("manage-cemeteries"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["name"], "Greenwood")


@override_settings(
    EMAIL_PROVIDER="django",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="default@example.com",
    PANEL_FROM_EMAIL="panel@example.com",
)
class SchedulingServiceCreateTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(full_name="Chris Customer", email="chris@example.com")
        self.cemetery = Cemetery.objects.create(name="Oak Rest Cemetery")
        self.plot = Plot.objects.create(cemetery=self.cemetery, section="A", row="2", plot_number="14")
        self.memorial = Memorial.objects.create(customer=self.customer, plot=self.plot)

    def test_create_service_from_customer_with_single_memorial(self):
        option = ServiceOption.objects.create(name="Bronze Reset", sort_order=15)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={"customer_id": self.customer.id, "service_option_id": option.id, "initial_price": "85.00"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        service = Service.objects.get(id=response.json()["service"]["id"])
        self.assertEqual(service.memorial_id, self.memorial.id)
        self.assertEqual(service.service_option_id, option.id)
        self.assertFalse(CustomerSurveyRequest.objects.filter(service=service).exists())
        self.assertEqual(response.json()["service"]["survey_status"], "not_sent")
        self.assertEqual(response.json()["detail"], "Job created. Customer details were entered manually.")
        self.assertEqual(len(mail.outbox), 0)

    def test_create_service_can_send_survey_email_when_requested(self):
        option = ServiceOption.objects.create(name="Bronze Reset", sort_order=15)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={"customer_id": self.customer.id, "service_option_id": option.id, "send_survey_email": True},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        service = Service.objects.get(id=response.json()["service"]["id"])
        survey_request = CustomerSurveyRequest.objects.get(service=service)
        self.assertEqual(response.json()["survey"]["request"]["id"], survey_request.id)
        self.assertEqual(response.json()["service"]["survey_status"], "pending")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["chris@example.com"])
        self.assertIn(survey_request.token, mail.outbox[0].body)

    def test_create_service_requires_customer_email_when_survey_send_is_requested(self):
        self.customer.email = ""
        self.customer.save(update_fields=["email", "updated_at"])
        option = ServiceOption.objects.create(name="Bronze Reset", sort_order=15)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={"customer_id": self.customer.id, "service_option_id": option.id, "send_survey_email": True},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Selected customer does not have an email address for the survey.")
        self.assertEqual(Service.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_create_service_from_customer_with_multiple_memorials_requires_selection(self):
        option = ServiceOption.objects.create(name="Bronze Reset", sort_order=15)
        second_plot = Plot.objects.create(cemetery=self.cemetery, section="A", row="2", plot_number="15")
        Memorial.objects.create(customer=self.customer, plot=second_plot)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={"customer_id": self.customer.id, "service_option_id": option.id, "initial_price": "85.00"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Select which memorial to use for this customer.")

    def test_create_service_from_customer_without_memorial_requires_manual_details_or_survey(self):
        customer = Customer.objects.create(full_name="Taylor New", email="taylor@example.com")
        option = ServiceOption.objects.create(name="Survey Cleaning", sort_order=5)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={"customer_id": customer.id, "service_option_id": option.id},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Enter cemetery/location details manually or choose survey email.")

    def test_create_service_from_customer_without_memorial_can_create_manual_location(self):
        customer = Customer.objects.create(full_name="Taylor New", email="taylor@example.com")
        option = ServiceOption.objects.create(name="Survey Cleaning", sort_order=5)

        response = self.client.post(
            reverse("scheduling-service-create"),
            data={
                "customer_id": customer.id,
                "service_option_id": option.id,
                "cemetery_name": "Maple Grove",
                "cemetery_address": "44 Stone Rd",
                "section": "B",
                "row": "7",
                "plot_number": "21",
                "locating_notes": "Behind the chapel",
                "customer_notes": "Family requested extra care",
                "gps_lat": "40.712776",
                "gps_lng": "-74.005974",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        service = Service.objects.get(id=response.json()["service"]["id"])
        memorial = service.memorial
        plot = memorial.plot
        self.assertEqual(memorial.customer_id, customer.id)
        self.assertEqual(plot.cemetery.name, "Maple Grove")
        self.assertEqual(plot.cemetery.address, "44 Stone Rd")
        self.assertEqual(plot.section, "B")
        self.assertEqual(plot.row, "7")
        self.assertEqual(plot.plot_number, "21")
        self.assertEqual(str(plot.gps_lat), "40.712776")
        self.assertEqual(str(plot.gps_lng), "-74.005974")
        self.assertEqual(plot.access_notes, "Behind the chapel")
        self.assertEqual(service.internal_notes, "Family requested extra care")
        self.assertEqual(response.json()["service"]["survey_status"], "not_sent")
        self.assertEqual(len(mail.outbox), 0)

    def test_assign_endpoint_reassigns_service_to_different_technician(self):
        original_user = User.objects.create_user(
            username="original_tech",
            password="secret123",
            email="original-tech@example.com",
        )
        original_tech = Employee.objects.create(
            user=original_user,
            full_name="Original Tech",
            email="original-tech@example.com",
            role=Employee.Role.TECH,
        )
        replacement_user = User.objects.create_user(
            username="replacement_tech",
            password="secret123",
            email="replacement-tech@example.com",
        )
        replacement_tech = Employee.objects.create(
            user=replacement_user,
            full_name="Replacement Tech",
            email="replacement-tech@example.com",
            role=Employee.Role.TECH,
        )
        service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=1),
            estimated_minutes=90,
        )
        ServiceAssignment.objects.create(service=service, employee=original_tech)
        scheduled_start = timezone.now() + timezone.timedelta(days=2)

        response = self.client.post(
            f"/api/manager/services/{service.id}/assign/",
            data={
                "technician_id": replacement_tech.id,
                "scheduled_start": scheduled_start.isoformat(),
                "estimated_minutes": 120,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        service.refresh_from_db()
        assignment = ServiceAssignment.objects.get(service=service)
        payload = response.json()["service"]
        self.assertEqual(ServiceAssignment.objects.filter(service=service).count(), 1)
        self.assertEqual(assignment.employee_id, replacement_tech.id)
        self.assertEqual(service.estimated_minutes, 120)
        self.assertEqual(service.status, Service.Status.SCHEDULED)
        self.assertEqual(payload["technician_id"], replacement_tech.id)
        self.assertEqual(payload["technician_name"], replacement_tech.full_name)

    def test_create_service_persists_valid_gps_coordinates(self):
        response = self.client.post(
            reverse("scheduling-service-create"),
            data={
                "memorial_id": self.memorial.id,
                "service_type": Service.ServiceType.CLEANING,
                "initial_price": "150.00",
                "gps_lat": "40.712776",
                "gps_lng": "-74.005974",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.plot.refresh_from_db()
        payload = response.json()["service"]
        self.assertEqual(str(self.plot.gps_lat), "40.712776")
        self.assertEqual(str(self.plot.gps_lng), "-74.005974")
        self.assertEqual(payload["gps_lat"], "40.712776")
        self.assertEqual(payload["gps_lng"], "-74.005974")

    def test_admin_can_mark_service_complete(self):
        service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.SCHEDULED,
            scheduled_date="2026-03-25",
        )

        response = self.client.post(
            reverse("service-complete", args=[service.id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        service.refresh_from_db()
        self.assertEqual(service.status, Service.Status.COMPLETED)
        self.assertIsNotNone(service.completed_date)

    def test_employee_scheduling_list_only_returns_assigned_jobs(self):
        tech_user = User.objects.create_user(username="assigned_tech", password="secret123", email="assigned-tech@example.com")
        tech_employee = Employee.objects.create(
            user=tech_user,
            full_name="Assigned Tech",
            email="assigned-tech@example.com",
            role=Employee.Role.TECH,
        )
        other_user = User.objects.create_user(username="other_assigned_tech", password="secret123", email="other-assigned-tech@example.com")
        other_employee = Employee.objects.create(
            user=other_user,
            full_name="Other Assigned Tech",
            email="other-assigned-tech@example.com",
            role=Employee.Role.TECH,
        )
        visible_service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=1),
        )
        hidden_service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.REPAIR,
            status=Service.Status.IN_PROGRESS,
            scheduled_start=timezone.now() + timezone.timedelta(days=2),
        )
        ServiceAssignment.objects.create(service=visible_service, employee=tech_employee)
        ServiceAssignment.objects.create(service=hidden_service, employee=other_employee)

        self.client.force_login(tech_user)
        response = self.client.get(reverse("scheduling-service-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], visible_service.id)

    def test_employee_scheduling_list_includes_completed_assigned_jobs(self):
        tech_user = User.objects.create_user(username="history_tech", password="secret123", email="history-tech@example.com")
        tech_employee = Employee.objects.create(
            user=tech_user,
            full_name="History Tech",
            email="history-tech@example.com",
            role=Employee.Role.TECH,
        )
        future_service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=1),
        )
        past_service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.REPAIR,
            status=Service.Status.COMPLETED,
            completed_date=timezone.localdate(),
        )
        ServiceAssignment.objects.create(service=future_service, employee=tech_employee)
        ServiceAssignment.objects.create(service=past_service, employee=tech_employee)

        self.client.force_login(tech_user)
        response = self.client.get(reverse("scheduling-service-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([item["id"] for item in payload], [future_service.id, past_service.id])

    def test_employee_can_mark_assigned_service_complete(self):
        tech_user = User.objects.create_user(username="complete_tech", password="secret123", email="complete-tech@example.com")
        tech_employee = Employee.objects.create(
            user=tech_user,
            full_name="Complete Tech",
            email="complete-tech@example.com",
            role=Employee.Role.TECH,
        )
        service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=1),
        )
        ServiceAssignment.objects.create(service=service, employee=tech_employee)

        self.client.force_login(tech_user)
        response = self.client.post(
            reverse("service-complete", args=[service.id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        service.refresh_from_db()
        self.assertEqual(service.status, Service.Status.COMPLETED)

    def test_employee_cannot_mark_unassigned_service_complete(self):
        tech_user = User.objects.create_user(username="blocked_tech", password="secret123", email="blocked-tech@example.com")
        Employee.objects.create(
            user=tech_user,
            full_name="Blocked Tech",
            email="blocked-tech@example.com",
            role=Employee.Role.TECH,
        )
        other_user = User.objects.create_user(username="service_owner", password="secret123", email="service-owner@example.com")
        other_employee = Employee.objects.create(
            user=other_user,
            full_name="Service Owner",
            email="service-owner@example.com",
            role=Employee.Role.TECH,
        )
        service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=1),
        )
        ServiceAssignment.objects.create(service=service, employee=other_employee)

        self.client.force_login(tech_user)
        response = self.client.post(
            reverse("service-complete", args=[service.id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        service.refresh_from_db()
        self.assertEqual(service.status, Service.Status.SCHEDULED)

    def test_employee_can_upload_photo_for_assigned_service(self):
        tech_user = User.objects.create_user(username="photo_tech", password="secret123", email="photo-tech@example.com")
        tech_employee = Employee.objects.create(
            user=tech_user,
            full_name="Photo Tech",
            email="photo-tech@example.com",
            role=Employee.Role.TECH,
        )
        service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.IN_PROGRESS,
        )
        ServiceAssignment.objects.create(service=service, employee=tech_employee)
        upload = SimpleUploadedFile(
            "job-photo.jpg",
            (
                b"\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00"
                b"\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00"
                b"\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b"
            ),
            content_type="image/gif",
        )

        self.client.force_login(tech_user)
        response = self.client.post(
            reverse("service-photo-upload", args=[service.id]),
            data={"image": upload, "photo_type": Photo.PhotoType.DURING, "caption": "Before polish"},
        )

        self.assertEqual(response.status_code, 201)
        photo = Photo.objects.get(service=service)
        self.assertEqual(photo.caption, "Before polish")
        self.assertIn("/media/service_photos/", photo.image_url)

    def test_employee_cannot_upload_photo_for_unassigned_service(self):
        tech_user = User.objects.create_user(username="blocked_photo_tech", password="secret123", email="blocked-photo-tech@example.com")
        Employee.objects.create(
            user=tech_user,
            full_name="Blocked Photo Tech",
            email="blocked-photo-tech@example.com",
            role=Employee.Role.TECH,
        )
        other_user = User.objects.create_user(username="photo_owner", password="secret123", email="photo-owner@example.com")
        other_employee = Employee.objects.create(
            user=other_user,
            full_name="Photo Owner",
            email="photo-owner@example.com",
            role=Employee.Role.TECH,
        )
        service = Service.objects.create(
            memorial=self.memorial,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.IN_PROGRESS,
        )
        ServiceAssignment.objects.create(service=service, employee=other_employee)
        upload = SimpleUploadedFile(
            "blocked-job-photo.jpg",
            (
                b"\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00"
                b"\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00"
                b"\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b"
            ),
            content_type="image/gif",
        )

        self.client.force_login(tech_user)
        response = self.client.post(
            reverse("service-photo-upload", args=[service.id]),
            data={"image": upload, "photo_type": Photo.PhotoType.DURING},
        )

        self.assertEqual(response.status_code, 403)
    def test_create_service_rejects_partial_gps_coordinates(self):
        response = self.client.post(
            reverse("scheduling-service-create"),
            data={
                "memorial_id": self.memorial.id,
                "gps_lat": "40.712776",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Provide both gps_lat and gps_lng", response.json()["non_field_errors"][0])

    def test_create_service_rejects_out_of_range_gps_coordinates(self):
        response = self.client.post(
            reverse("scheduling-service-create"),
            data={
                "memorial_id": self.memorial.id,
                "gps_lat": "91.000000",
                "gps_lng": "-74.005974",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("between -90 and 90", response.json()["gps_lat"][0])


class PhotoArchiveTests(TestCase):
    def test_archive_lists_uploaded_photos(self):
        customer = Customer.objects.create(full_name="Photo Customer", email="photo-customer@example.com")
        cemetery = Cemetery.objects.create(name="Photo Cemetery")
        plot = Plot.objects.create(cemetery=cemetery, section="A", row="1", plot_number="4")
        memorial = Memorial.objects.create(customer=customer, plot=plot)
        service = Service.objects.create(memorial=memorial, service_type=Service.ServiceType.CLEANING)
        Photo.objects.create(
            memorial=memorial,
            service=service,
            photo_type=Photo.PhotoType.AFTER,
            image_url="http://testserver/media/service_photos/example.jpg",
            caption="Finished work",
        )

        response = self.client.get(reverse("photo-archive-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["caption"], "Finished work")
        self.assertEqual(payload[0]["memorial_name"], "Photo Customer")

    def test_employee_archive_only_lists_photos_uploaded_by_that_employee(self):
        customer = Customer.objects.create(full_name="Photo Customer", email="photo-customer@example.com")
        cemetery = Cemetery.objects.create(name="Photo Cemetery")
        plot = Plot.objects.create(cemetery=cemetery, section="A", row="1", plot_number="4")
        memorial = Memorial.objects.create(customer=customer, plot=plot)
        service = Service.objects.create(memorial=memorial, service_type=Service.ServiceType.CLEANING)

        user_one = User.objects.create_user(username="photo_tech_one", password="secret123", email="one@example.com")
        employee_one = Employee.objects.create(
            user=user_one,
            full_name="Photo Tech One",
            email="one@example.com",
            role=Employee.Role.TECH,
        )
        user_two = User.objects.create_user(username="photo_tech_two", password="secret123", email="two@example.com")
        employee_two = Employee.objects.create(
            user=user_two,
            full_name="Photo Tech Two",
            email="two@example.com",
            role=Employee.Role.TECH,
        )

        Photo.objects.create(
            memorial=memorial,
            service=service,
            uploaded_by=employee_one,
            photo_type=Photo.PhotoType.AFTER,
            image_url="http://testserver/media/service_photos/example-one.jpg",
            caption="Uploaded by one",
        )
        Photo.objects.create(
            memorial=memorial,
            service=service,
            uploaded_by=employee_two,
            photo_type=Photo.PhotoType.BEFORE,
            image_url="http://testserver/media/service_photos/example-two.jpg",
            caption="Uploaded by two",
        )

        self.client.force_login(user_one)
        response = self.client.get(reverse("photo-archive-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["caption"], "Uploaded by one")


class DashboardSummaryTests(TestCase):
    def test_total_revenue_uses_completed_jobs_and_projected_uses_scheduled_jobs(self):
        customer = Customer.objects.create(full_name="Revenue Customer", email="revenue@example.com")
        cemetery = Cemetery.objects.create(name="Revenue Cemetery")
        plot = Plot.objects.create(cemetery=cemetery, section="A", row="1", plot_number="1")
        memorial = Memorial.objects.create(customer=customer, plot=plot)

        completed_service = Service.objects.create(memorial=memorial, status=Service.Status.COMPLETED)
        scheduled_service = Service.objects.create(memorial=memorial, status=Service.Status.SCHEDULED)
        in_progress_service = Service.objects.create(memorial=memorial, status=Service.Status.IN_PROGRESS)

        Invoice.objects.create(customer=customer, service=completed_service, total_amount="100.00")
        Invoice.objects.create(customer=customer, service=scheduled_service, total_amount="50.00")
        Invoice.objects.create(customer=customer, service=in_progress_service, total_amount="25.00")

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, 200)
        summary = response.json()["summary"]
        self.assertEqual(summary["total_revenue"], 100.0)
        self.assertEqual(summary["projected_revenue"], 75.0)

    def test_employee_dashboard_only_returns_assigned_services(self):
        user = User.objects.create_user(username="tech_dashboard", password="secret123", email="techdash@example.com")
        employee = Employee.objects.create(
            user=user,
            full_name="Taylor Tech",
            email="techdash@example.com",
            role=Employee.Role.TECH,
        )
        other_user = User.objects.create_user(username="other_tech", password="secret123", email="othertech@example.com")
        other_employee = Employee.objects.create(
            user=other_user,
            full_name="Other Tech",
            email="othertech@example.com",
            role=Employee.Role.TECH,
        )

        customer = Customer.objects.create(full_name="Assigned Customer", email="assigned@example.com")
        cemetery = Cemetery.objects.create(name="Assigned Cemetery")
        plot = Plot.objects.create(cemetery=cemetery, section="B", row="2", plot_number="7")
        memorial = Memorial.objects.create(customer=customer, plot=plot)

        assigned_service = Service.objects.create(
            memorial=memorial,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=1),
        )
        completed_service = Service.objects.create(
            memorial=memorial,
            status=Service.Status.COMPLETED,
            completed_date=timezone.localdate(),
        )
        other_service = Service.objects.create(
            memorial=memorial,
            status=Service.Status.SCHEDULED,
            scheduled_start=timezone.now() + timezone.timedelta(days=2),
        )

        ServiceAssignment.objects.create(service=assigned_service, employee=employee)
        ServiceAssignment.objects.create(service=completed_service, employee=employee)
        ServiceAssignment.objects.create(service=other_service, employee=other_employee)
        Invoice.objects.create(customer=customer, service=completed_service, total_amount="80.00")
        Invoice.objects.create(customer=customer, service=other_service, total_amount="90.00")

        self.client.force_login(user)
        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["active_services"], 1)
        self.assertEqual(payload["summary"]["services_today"], 0)
        self.assertEqual(payload["summary"]["total_revenue"], 80.0)
        self.assertEqual(payload["summary"]["projected_revenue"], 0.0)
        self.assertEqual(len(payload["upcoming_services"]), 1)
        self.assertEqual(payload["upcoming_services"][0]["id"], assigned_service.id)
        self.assertEqual(len(payload["recent_completed"]), 1)
        self.assertEqual(payload["recent_completed"][0]["id"], completed_service.id)


class CustomerHistoryViewTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            full_name="Margaret Hill",
            email="margaret@example.com",
            phone="555-1100",
        )
        self.cemetery = Cemetery.objects.create(name="Oak Ridge")
        self.plot = Plot.objects.create(cemetery=self.cemetery, section="A", row="2", plot_number="17")
        self.memorial = Memorial.objects.create(
            customer=self.customer,
            plot=self.plot,
            name="Hill Family Stone",
        )
        self.service_option, _ = ServiceOption.objects.get_or_create(name="Cleaning")
        self.service = Service.objects.create(
            memorial=self.memorial,
            service_option=self.service_option,
            service_type=Service.ServiceType.CLEANING,
            status=Service.Status.COMPLETED,
            scheduled_start=timezone.now() - timedelta(days=2),
            completed_date=timezone.localdate() - timedelta(days=1),
        )
        self.survey_request = CustomerSurveyRequest.objects.create(
            service=self.service,
            sent_at=timezone.now() - timedelta(days=3),
        )
        CustomerSurveySubmission.objects.create(
            survey_request=self.survey_request,
            customer_name=self.customer.full_name,
            email=self.customer.email,
            phone=self.customer.phone,
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            service=self.service,
            status=Invoice.Status.PAID,
            issued_date=timezone.localdate() - timedelta(days=1),
            total_amount="245.00",
            paid_at=timezone.now() - timedelta(hours=6),
        )
        Payment.objects.create(
            invoice=self.invoice,
            provider=Payment.Provider.MANUAL,
            method=Payment.Method.CHECK,
            status=Payment.Status.SUCCEEDED,
            currency="usd",
            amount="245.00",
            succeeded_at=timezone.now() - timedelta(hours=5),
        )
        Photo.objects.create(
            memorial=self.memorial,
            service=self.service,
            photo_type=Photo.PhotoType.AFTER,
            image_url="https://example.com/after.jpg",
            caption="Completed restoration",
        )

    def test_returns_customer_history_timeline(self):
        response = self.client.get(reverse("manage-customer-history", args=[self.customer.id]))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["customer"]["id"], self.customer.id)
        self.assertGreaterEqual(len(payload["history"]), 8)

        occurred_values = [entry["occurred_at"] for entry in payload["history"]]
        self.assertEqual(occurred_values, sorted(occurred_values, reverse=True))

        event_kinds = {entry["kind"] for entry in payload["history"]}
        self.assertIn("customer_created", event_kinds)
        self.assertIn("memorial_created", event_kinds)
        self.assertIn("service_created", event_kinds)
        self.assertIn("service_scheduled", event_kinds)
        self.assertIn("service_completed", event_kinds)
        self.assertIn("survey_sent", event_kinds)
        self.assertIn("survey_submitted", event_kinds)
        self.assertIn("invoice_issued", event_kinds)
        self.assertIn("invoice_paid", event_kinds)
        self.assertIn("payment", event_kinds)
        self.assertIn("photo_uploaded", event_kinds)
