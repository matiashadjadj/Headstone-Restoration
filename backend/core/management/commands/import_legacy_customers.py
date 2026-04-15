import csv
import re
from pathlib import Path

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError


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

    # Handles values like "12057.0"
    if value.endswith(".0"):
        value = value[:-2]

    return value


def build_billing_name(row):
    first = clean_string(row.get("Billing First Name"))
    last = clean_string(row.get("Billing Last Name"))
    full_name = f"{first} {last}".strip()
    return re.sub(r"\s+", " ", full_name)


def build_legacy_name(row):
    first = clean_string(row.get("First Name"))
    last = clean_string(row.get("Last Name"))
    full_name = f"{first} {last}".strip()
    return re.sub(r"\s+", " ", full_name)


def normalize_name_for_grouping(name):
    name = clean_string(name).lower()
    return re.sub(r"\s+", " ", name)


def row_completeness_score(row):
    score = 0

    if clean_string(row.get("Billing First Name")):
        score += 1
    if clean_string(row.get("Billing Last Name")):
        score += 1
    if normalize_email(row.get("Email Address")):
        score += 1
    if normalize_phone(row.get("Phone 1")):
        score += 1

    return score


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


def unique_non_empty(values):
    seen = set()
    result = []

    for value in values:
        value = clean_string(value)
        if not value:
            continue
        if value not in seen:
            seen.add(value)
            result.append(value)

    return result


def build_customer_notes(rows, source_name):
    bill_to_ids = unique_non_empty(
        normalize_legacy_id(row.get("Bill To Customer ID")) for row in rows
    )
    legacy_customer_ids = unique_non_empty(
        normalize_legacy_id(row.get("Customer ID")) for row in rows
    )
    linked_properties = unique_non_empty(row.get("Linked Properties") for row in rows)
    subscription_dates = unique_non_empty(
        row.get("Subscription Last Completed") for row in rows
    )
    initial_prices = unique_non_empty(row.get("Initial Price") for row in rows)

    gps_values = []
    seen_gps = set()
    for row in rows:
        lat = clean_string(row.get("Latitude"))
        lng = clean_string(row.get("Longitude"))
        if lat or lng:
            pair = f"{lat},{lng}"
            if pair not in seen_gps:
                seen_gps.add(pair)
                gps_values.append(pair)

    lines = [f"Legacy import from {source_name}"]

    if bill_to_ids:
        lines.append(f"Bill To Customer ID(s): {', '.join(bill_to_ids)}")
    if legacy_customer_ids:
        lines.append(f"Legacy Customer ID(s): {', '.join(legacy_customer_ids)}")
    if linked_properties:
        lines.append(f"Linked Properties: {'; '.join(linked_properties)}")
    if subscription_dates:
        lines.append(f"Subscription Last Completed: {', '.join(subscription_dates)}")
    if initial_prices:
        lines.append(f"Initial Price(s): {', '.join(initial_prices)}")
    if gps_values:
        lines.append(f"GPS Coordinates: {'; '.join(gps_values)}")

    return "\n".join(lines)


class Command(BaseCommand):
    help = "Import legacy customer CSV into Customer records"

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

        # Detect the app label from the command module path.
        # Example: "core.management.commands.import_legacy_customers" -> "core"
        app_label = self.__module__.split(".")[0]
        Customer = apps.get_model(app_label, "Customer")

        groups = {}
        total_rows = 0

        with csv_path.open("r", encoding="utf-8-sig", newline="") as csvfile:
            reader = csv.DictReader(csvfile)

            required_columns = {
                "Customer ID",
                "Last Name",
                "First Name",
                "Linked Properties",
                "Billing First Name",
                "Billing Last Name",
                "Subscription Last Completed",
                "Email Address",
                "Latitude",
                "Longitude",
                "Phone 1",
                "Initial Price",
                "Bill To Customer ID",
            }

            missing_columns = required_columns - set(reader.fieldnames or [])
            if missing_columns:
                missing = ", ".join(sorted(missing_columns))
                raise CommandError(f"Missing required CSV column(s): {missing}")

            for row_number, row in enumerate(reader, start=1):
                total_rows += 1
                group_key = build_group_key(row, row_number)

                row["_row_number"] = row_number
                row["_group_key"] = group_key

                groups.setdefault(group_key, []).append(row)

        total_groups = len(groups)

        self.stdout.write(self.style.SUCCESS(f"CSV loaded: {csv_path}"))
        self.stdout.write(f"Total CSV rows: {total_rows}")
        self.stdout.write(f"Total grouped customers: {total_groups}")

        preview_keys = list(groups.keys())[:10]
        self.stdout.write("")
        self.stdout.write("Preview of first 10 grouped customers:")

        for group_key in preview_keys:
            rows = groups[group_key]
            best_row = max(rows, key=row_completeness_score)

            billing_name = build_billing_name(best_row)
            legacy_name = build_legacy_name(best_row)
            full_name = billing_name or legacy_name or f"Legacy Customer {group_key}"

            email = clean_string(best_row.get("Email Address"))
            phone = clean_string(best_row.get("Phone 1"))

            self.stdout.write(
                f"- {group_key} | name={full_name} | email={email or '(blank)'} "
                f"| phone={phone or '(blank)'} | merged_rows={len(rows)}"
            )

        if dry_run:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Dry run only. No customers were created."))
            return

        created_count = 0

        for group_key, rows in groups.items():
            best_row = max(rows, key=row_completeness_score)

            billing_name = build_billing_name(best_row)
            legacy_name = build_legacy_name(best_row)
            full_name = billing_name or legacy_name or f"Legacy Customer {group_key}"

            email = clean_string(best_row.get("Email Address"))
            phone = clean_string(best_row.get("Phone 1"))
            notes = build_customer_notes(rows, csv_path.name)

            customer = Customer.objects.create(
                full_name=full_name,
                email=email,
                phone=phone,
                notes=notes,
            )

            created_count += 1

            self.stdout.write(
                self.style.SUCCESS(
                    f"Created Customer #{customer.id}: {customer.full_name} "
                    f"(group={group_key}, merged_rows={len(rows)})"
                )
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(f"Import complete. Created {created_count} customer(s).")
        )