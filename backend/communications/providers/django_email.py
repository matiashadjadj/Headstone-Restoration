import logging

from django.core.mail import EmailMultiAlternatives

from communications.exceptions import EmailDeliveryError
from communications.providers.base import EmailPayload, EmailProvider, EmailSendResult

logger = logging.getLogger(__name__)


class DjangoEmailProvider(EmailProvider):
    name = "django"

    def send(self, payload: EmailPayload) -> EmailSendResult:
        message = EmailMultiAlternatives(
            subject=payload.subject,
            body=payload.text_body,
            from_email=payload.from_email,
            to=payload.recipient_list,
            reply_to=payload.reply_to,
        )
        if payload.html_body:
            message.attach_alternative(payload.html_body, "text/html")

        try:
            sent_count = message.send(fail_silently=False)
        except Exception as exc:  # pragma: no cover - backend-specific runtime failures
            logger.exception("Email backend send failed.")
            raise EmailDeliveryError(str(exc)) from exc

        if sent_count < 1:
            raise EmailDeliveryError("Configured email backend did not accept the message.")

        return EmailSendResult(
            provider=self.name,
            recipient_count=len(payload.recipient_list),
        )
