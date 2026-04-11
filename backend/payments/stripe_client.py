import json
from decimal import Decimal, ROUND_HALF_UP
from urllib import error, parse, request

from django.conf import settings


STRIPE_API_BASE = "https://api.stripe.com/v1"


class StripeAPIError(Exception):
    pass


def amount_to_cents(amount: Decimal) -> int:
    normalized = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(normalized * 100)


def _stripe_request(method: str, path: str, payload=None):
    secret_key = getattr(settings, "STRIPE_SECRET_KEY", None)
    if not secret_key:
        raise StripeAPIError("Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env.")

    url = f"{STRIPE_API_BASE}{path}"
    data = None
    if payload:
        encoded = parse.urlencode(payload, doseq=True)
        if method.upper() == "GET":
            url = f"{url}?{encoded}"
        else:
            data = encoded.encode("utf-8")

    req = request.Request(
        url,
        data=data,
        method=method.upper(),
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
            message = payload.get("error", {}).get("message") or body
        except json.JSONDecodeError:
            message = body or str(exc)
        raise StripeAPIError(message) from exc
    except error.URLError as exc:
        raise StripeAPIError(f"Unable to reach Stripe: {exc.reason}") from exc


def create_checkout_session(*, invoice, customer_email: str, success_url: str, cancel_url: str):
    line_items = list(invoice.items.all())
    if line_items:
        payload = []
        for index, item in enumerate(line_items):
            payload.extend(
                [
                    (f"line_items[{index}][price_data][currency]", invoice.currency),
                    (f"line_items[{index}][price_data][unit_amount]", amount_to_cents(item.unit_price)),
                    (f"line_items[{index}][price_data][product_data][name]", item.description),
                    (f"line_items[{index}][quantity]", int(item.quantity)),
                ]
            )
    else:
        description = f"Invoice #{invoice.id}"
        if invoice.service_id and invoice.service:
            description = f"{invoice.service.get_service_type_display()} service"
        payload = [
            ("line_items[0][price_data][currency]", invoice.currency),
            ("line_items[0][price_data][unit_amount]", amount_to_cents(invoice.total_amount)),
            ("line_items[0][price_data][product_data][name]", description),
            ("line_items[0][quantity]", 1),
        ]

    payload.extend(
        [
            ("mode", "payment"),
            ("success_url", success_url),
            ("cancel_url", cancel_url),
            ("customer_email", customer_email),
            ("metadata[invoice_id]", str(invoice.id)),
            ("metadata[customer_email]", customer_email),
        ]
    )
    return _stripe_request("POST", "/checkout/sessions", payload)


def retrieve_checkout_session(session_id: str):
    return _stripe_request(
        "GET",
        f"/checkout/sessions/{session_id}",
        payload=[
            ("expand[]", "payment_intent.latest_charge"),
            ("expand[]", "line_items"),
        ],
    )
