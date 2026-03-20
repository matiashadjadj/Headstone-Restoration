from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse

from core.models import Customer, Invoice, InvoiceItem, Payment


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
