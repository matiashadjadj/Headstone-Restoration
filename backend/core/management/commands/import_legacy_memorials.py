import csv
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError

from core.models import Cemetery, Customer, Memorial, Plot

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


def build_memorial_notes(row):
    lines = ["Legacy memorial import"]

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
    help = "Import legacy memorials and plots from CSV"

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


        cemetery = Cemetery.objects.filter(name="Legacy Imported Cemetery").first()
        if cemetery is None:
            raise CommandError(
                "Could not find the default cemetery named 'Legacy Imported Cemetery'. "
                "Create it first in admin or shell."
            )

        customer_lookup = {}
        memorial_counts = {}
        plot_lookup = {}

        total_rows = 0
        matched_customers = 0
        created_plots = 0
        created_memorials = 0


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
                        # optional fallback only
                        customer_lookup.setdefault(f"legacy_customer:{value}", customer)


        with csv_path.open("r", encoding="utf-8-sig", newline="") as csvfile:
            reader = csv.DictReader(csvfile)

            required_columns = {
                "Customer ID",
                "Linked Properties",
                "Billing First Name",
                "Billing Last Name",
                "Email Address",
                "Latitude",
                "Longitude",
                "Phone 1",
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
                    self.stdout.write(
                        self.style.WARNING(
                            f"Skipping row {row_number}: could not match customer for key {group_key}"
                        )
                    )
                    continue

                matched_customers += 1


                lat = parse_decimal(row.get("Latitude"))
                lng = parse_decimal(row.get("Longitude"))

                if lat is not None and lng is not None:
                    plot_key = f"gps:{lat}|{lng}"
                else:
                    plot_key = f"row:{row_number}"

                plot = plot_lookup.get(plot_key)

                if plot is None:
                    if lat is not None and lng is not None:
                        section_value = "legacy_gps"
                        row_value = str(lat)
                        plot_number_value = str(lng)
                    else:
                        section_value = "legacy_row"
                        row_value = ""
                        plot_number_value = str(row_number)

                    if dry_run:
                        plot = f"DRYRUN:{plot_key}"
                    else:
                        plot, _created = Plot.objects.get_or_create(
                            cemetery=cemetery,
                            section=section_value,
                            row=row_value,
                            plot_number=plot_number_value,
                            defaults={
                                "gps_lat": lat,
                                "gps_lng": lng,
                                "access_notes": f"Legacy imported plot from row {row_number}",
                            },
                        )

                    plot_lookup[plot_key] = plot
                    created_plots += 1


                current_count = memorial_counts.get(customer.id, 0) + 1
                memorial_counts[customer.id] = current_count

                if current_count == 1:
                    memorial_name = customer.full_name
                else:
                    memorial_name = f"{customer.full_name} #{current_count}"


                notes = build_memorial_notes(row)

                if dry_run:
                    self.stdout.write(
                        f"DRY RUN row {row_number}: "
                        f"customer_id={customer.id} | customer={customer.full_name} "
                        f"| memorial={memorial_name} | plot_key={plot_key} | group_key={group_key}"
                    )
                else:
                    Memorial.objects.create(
                        customer=customer,
                        plot=plot,
                        name=memorial_name,
                        material=Memorial.Material.OTHER,
                        notes=notes,
                    )

                created_memorials += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Total CSV rows processed: {total_rows}"))
        self.stdout.write(self.style.SUCCESS(f"Rows matched to customers: {matched_customers}"))
        self.stdout.write(self.style.SUCCESS(f"Plots created: {created_plots}"))
        self.stdout.write(self.style.SUCCESS(f"Memorials created: {created_memorials}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run only. No plots or memorials were saved."))
        else:
            self.stdout.write(self.style.SUCCESS("Memorial import complete."))