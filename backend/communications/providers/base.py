from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class EmailPayload:
    subject: str
    text_body: str
    recipient_list: list[str]
    from_email: str
    reply_to: list[str] = field(default_factory=list)
    html_body: str | None = None


@dataclass
class EmailSendResult:
    provider: str
    recipient_count: int
    message_id: str | None = None


class EmailProvider(ABC):
    name = "base"

    @abstractmethod
    def send(self, payload: EmailPayload) -> EmailSendResult:
        raise NotImplementedError
