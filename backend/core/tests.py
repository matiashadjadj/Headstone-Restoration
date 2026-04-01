from unittest.mock import patch

from django.core import mail
from django.contrib.auth.models import User
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from communications.exceptions import EmailDeliveryError
from communications.services import send_email
from core.models import Cemetery, Customer, Employee, EmployeeInvite, Invoice, InvoiceItem, Memorial, Payment, Photo, Plot, Service, ServiceAssignment, ServiceOption, UserProfile


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
        self.assertEqual(payload["invite"]["invited_email"], "crew-resend-two@example.com")

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


class SchedulingServiceCreateTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(full_name="Chris Customer", email="chris@example.com")
        self.cemetery = Cemetery.objects.create(name="Oak Rest Cemetery")
        self.plot = Plot.objects.create(cemetery=self.cemetery, section="A", row="2", plot_number="14")
        self.memorial = Memorial.objects.create(customer=self.customer, plot=self.plot)

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
