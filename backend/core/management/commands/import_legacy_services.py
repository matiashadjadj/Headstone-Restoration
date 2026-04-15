import csv
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from core.models import Customer, Memorial, Service


def clean_string(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_email(value):
    return clean_string(value).lower()


def normalize_phone(value):
    value = clean_string(value)
    return re.sub(r"\D", "", value)


def normalize_legacy_id(value):
    value = clean_string(value)
    if not value:
        return ""
    if value.endswith(".0"):
        value = value[:-2]
    return value


def build_billing_name(row):
    first = clean_string(row.get("Billing First Name"))
    last = clean_string(row.get("Billing Last Name"))
    full_name = f"{first} {last}".strip()
    return re.sub(r"\s+", " ", full_name)


def normalize_name_for_grouping(name):
    name = clean_string(name).lower()
    return re.sub(r"\s+", " ", name)


def build_group_key(row, row_number):
    bill_to_customer_id = normalize_legacy_id(row.get("Bill To Customer ID"))
    email = normalize_email(row.get("Email Address"))
    billing_name = normalize_name_for_grouping(build_billing_name(row))
    phone = normalize_phone(row.get("Phone 1"))

    if bill_to_customer_id:
        return f"billto:{bill_to_customer_id}"
    if email:
        return f"email:{email}"
    if billing_name and phone:
        return f"namephone:{billing_name}|{phone}"
    return f"row:{row_number}"


def parse_decimal(value):
    value = clean_string(value)
    if not value:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return None


def parse_legacy_date(value):
    value = clean_string(value)
    if not value:
        return None

    formats = [
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y-%m-%d",
        "%m-%d-%Y",
        "%m-%d-%y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    return None


def build_service_notes(row):
    lines = ["Legacy service import"]

    customer_id = normalize_legacy_id(row.get("Customer ID"))
    bill_to_customer_id = normalize_legacy_id(row.get("Bill To Customer ID"))
    linked_properties = clean_string(row.get("Linked Properties"))
    subscription_last_completed = clean_string(row.get("Subscription Last Completed"))
    initial_price = clean_string(row.get("Initial Price"))
    latitude = clean_string(row.get("Latitude"))
    longitude = clean_string(row.get("Longitude"))

    if customer_id:
        lines.append(f"Legacy Customer ID: {customer_id}")
    if bill_to_customer_id:
        lines.append(f"Bill To Customer ID: {bill_to_customer_id}")
    if linked_properties:
        lines.append(f"Linked Properties: {linked_properties}")
    if subscription_last_completed:
        lines.append(f"Subscription Last Completed: {subscription_last_completed}")
    if initial_price:
        lines.append(f"Initial Price: {initial_price}")
    if latitude or longitude:
        lines.append(f"GPS: {latitude},{longitude}")

    return "\n".join(lines)


class Command(BaseCommand):
    help = "Import legacy services from CSV and link them to imported memorials"

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            type=str,
            default="data/Customer Data.csv",
            help="Path to the legacy customer CSV file",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the import without saving records",
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv"])
        dry_run = options["dry_run"]

        if not csv_path.exists():
            raise CommandError(f"CSV file not found: {csv_path}")

        customer_lookup = {}
        memorial_counts = {}

        total_rows = 0
        matched_customers = 0
        matched_memorials = 0
        created_services = 0
        skipped_rows = 0

        # Rebuild customer lookup from notes created during customer import
        for customer in Customer.objects.all():
            notes = customer.notes or ""

            for line in notes.splitlines():
                line = line.strip()

                if line.startswith("Bill To Customer ID(s):"):
                    values = line.split(":", 1)[1].strip()
                    for value in [v.strip() for v in values.split(",") if v.strip()]:
                        customer_lookup[f"billto:{value}"] = customer

                elif line.startswith("Legacy Customer ID(s):"):
                    values = line.split(":", 1)[1].strip()
                    for value in [v.strip() for v in values.split(",") if v.strip()]:
                        customer_lookup.setdefault(f"legacy_customer:{value}", customer)

        with csv_path.open("r", encoding="utf-8-sig", newline="") as csvfile:
            reader = csv.DictReader(csvfile)

            required_columns = {
                "Customer ID",
                "Billing First Name",
                "Billing Last Name",
                "Email Address",
                "Phone 1",
                "Initial Price",
                "Subscription Last Completed",
                "Bill To Customer ID",
            }

            missing_columns = required_columns - set(reader.fieldnames or [])
            if missing_columns:
                missing = ", ".join(sorted(missing_columns))
                raise CommandError(f"Missing required CSV column(s): {missing}")

            for row_number, row in enumerate(reader, start=1):
                total_rows += 1

                group_key = build_group_key(row, row_number)
                customer = customer_lookup.get(group_key)

                if customer is None:
                    legacy_customer_id = normalize_legacy_id(row.get("Customer ID"))
                    if legacy_customer_id:
                        customer = customer_lookup.get(f"legacy_customer:{legacy_customer_id}")

                if customer is None:
                    skipped_rows += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Skipping row {row_number}: could not match customer for key {group_key}"
                        )
                    )
                    continue

                matched_customers += 1

                current_count = memorial_counts.get(customer.id, 0) + 1
                memorial_counts[customer.id] = current_count

                if current_count == 1:
                    memorial_name = customer.full_name
                else:
                    memorial_name = f"{customer.full_name} #{current_count}"

                memorial = Memorial.objects.filter(
                    customer=customer,
                    name=memorial_name,
                ).first()

                if memorial is None:
                    skipped_rows += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Skipping row {row_number}: could not find memorial "
                            f"'{memorial_name}' for customer_id={customer.id}"
                        )
                    )
                    continue

                matched_memorials += 1

                completed_date = parse_legacy_date(row.get("Subscription Last Completed"))
                actual_cost = parse_decimal(row.get("Initial Price"))
                notes = build_service_notes(row)

                if completed_date:
                    status = Service.Status.COMPLETED
                else:
                    status = Service.Status.DRAFT

                if dry_run:
                    self.stdout.write(
                        f"DRY RUN row {row_number}: "
                        f"customer_id={customer.id} | memorial_id={memorial.id} "
                        f"| memorial={memorial.name} | status={status} "
                        f"| completed_date={completed_date} | actual_cost={actual_cost}"
                    )
                else:
                    Service.objects.create(
                        memorial=memorial,
                        service_type=Service.ServiceType.OTHER,
                        status=status,
                        completed_date=completed_date,
                        actual_cost=actual_cost,
                        internal_notes=notes,
                    )

                created_services += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Total CSV rows processed: {total_rows}"))
        self.stdout.write(self.style.SUCCESS(f"Rows matched to customers: {matched_customers}"))
        self.stdout.write(self.style.SUCCESS(f"Rows matched to memorials: {matched_memorials}"))
        self.stdout.write(self.style.SUCCESS(f"Services created: {created_services}"))
        self.stdout.write(self.style.SUCCESS(f"Rows skipped: {skipped_rows}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run only. No services were saved."))
        else:
            self.stdout.write(self.style.SUCCESS("Service import complete."))