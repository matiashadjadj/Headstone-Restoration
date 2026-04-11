import logging

from django.conf import settings

from communications.exceptions import EmailDeliveryError
from communications.providers import DjangoEmailProvider
from communications.providers.base import EmailPayload, EmailSendResult

logger = logging.getLogger(__name__)

PROVIDER_MAP = {
    "django": DjangoEmailProvider,
}


def resolve_from_email(*, purpose: str = "default", fallback: str | None = None) -> str:
    if purpose == "panel":
        configured = getattr(settings, "PANEL_FROM_EMAIL", "")
        if configured:
            return configured
    if purpose == "invite":
        configured = getattr(settings, "INVITE_FROM_EMAIL", "")
        if configured:
            return configured
    if fallback:
        return fallback
    return getattr(settings, "DEFAULT_FROM_EMAIL", "headstone@restoration.com")


def get_email_provider():
    provider_name = str(getattr(settings, "EMAIL_PROVIDER", "django") or "django").strip().lower()
    provider_class = PROVIDER_MAP.get(provider_name)
    if not provider_class:
        raise EmailDeliveryError(
            f"Unsupported EMAIL_PROVIDER '{provider_name}'. Supported values: {', '.join(sorted(PROVIDER_MAP))}."
        )
    return provider_class()


def send_email(
    *,
    subject: str,
    text_body: str,
    recipient_list: list[str],
    from_email: str | None = None,
    reply_to: list[str] | None = None,
    html_body: str | None = None,
    purpose: str = "default",
    metadata: dict | None = None,
) -> EmailSendResult:
    cleaned_recipients = [value.strip() for value in recipient_list if isinstance(value, str) and value.strip()]
    if not cleaned_recipients:
        raise EmailDeliveryError("recipient_list must contain at least one email address.")

    resolved_from_email = resolve_from_email(purpose=purpose, fallback=from_email)
    payload = EmailPayload(
        subject=(subject or "").strip(),
        text_body=text_body or "",
        recipient_list=cleaned_recipients,
        from_email=resolved_from_email,
        reply_to=[value.strip() for value in (reply_to or []) if isinstance(value, str) and value.strip()],
        html_body=html_body,
    )

    provider = get_email_provider()
    logger.info(
        "Sending outbound email.",
        extra={
            "email_provider": provider.name,
            "email_purpose": purpose,
            "recipient_count": len(payload.recipient_list),
            "metadata": metadata or {},
        },
    )

    try:
        result = provider.send(payload)
    except EmailDeliveryError:
        logger.exception(
            "Outbound email delivery failed.",
            extra={
                "email_provider": provider.name,
                "email_purpose": purpose,
                "recipient_count": len(payload.recipient_list),
                "metadata": metadata or {},
            },
        )
        raise

    logger.info(
        "Outbound email delivered.",
        extra={
            "email_provider": result.provider,
            "email_purpose": purpose,
            "recipient_count": result.recipient_count,
            "metadata": metadata or {},
        },
    )
    return result
