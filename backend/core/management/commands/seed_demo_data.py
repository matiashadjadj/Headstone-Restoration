import random
from datetime import timedelta, date, datetime

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth.models import User

from core.models import (
    Customer,
    Cemetery,
    Plot,
    Memorial,
    Service,
    Employee,
    ServiceAssignment,
    Invoice,
    InvoiceItem,
)


class Command(BaseCommand):
    help = "Seed synthetic demo data so the dashboard has something to render."

    def add_arguments(self, parser):
        parser.add_argument("--customers", type=int, default=8, help="Number of customers")
        parser.add_argument("--services", type=int, default=20, help="Number of services")

    def handle(self, *args, **options):
        if Customer.objects.exists():
            self.stdout.write(self.style.WARNING("Customers already exist; skipping seed to avoid duplicates."))
            return

        num_customers = options["customers"]
        num_services = options["services"]

        # Users / employees
        admin_user, _ = User.objects.get_or_create(username="admin_demo", defaults={"email": "admin@example.com"})
        tech_user, _ = User.objects.get_or_create(username="tech_demo", defaults={"email": "tech@example.com"})
        admin_emp, _ = Employee.objects.get_or_create(user=admin_user, defaults={"full_name": "Alex Admin", "role": Employee.Role.MANAGER})
        tech_emp, _ = Employee.objects.get_or_create(user=tech_user, defaults={"full_name": "Taylor Tech", "role": Employee.Role.TECH})

        cities = [("Ogden", "UT"), ("Salt Lake City", "UT"), ("Provo", "UT"), ("Logan", "UT"), ("Boise", "ID")]
        last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Anderson"]

        # Customers, cemetery, plots, memorials
        cemetery, _ = Cemetery.objects.get_or_create(name="Greenwood Cemetery", city="Ogden", state="UT")
        customers = []
        memorials = []
        for i in range(num_customers):
            ln = random.choice(last_names)
            city, state = random.choice(cities)
            cust = Customer.objects.create(
                full_name=f"{ln} Family",
                email=f"{ln.lower()}@example.com",
                city=city,
                state=state,
            )
            customers.append(cust)

            plot = Plot.objects.create(
                cemetery=cemetery,
                section=random.choice(["A", "B", "C"]),
                row=str(random.randint(1, 20)),
                plot_number=str(random.randint(1, 50)),
            )
            mem = Memorial.objects.create(
                customer=cust,
                plot=plot,
                material=random.choice(list(Memorial.Material.values)),
                inscription_text="In loving memory",
            )
            memorials.append(mem)

        now = timezone.now()
        statuses = [
            Service.Status.SCHEDULED,
            Service.Status.IN_PROGRESS,
            Service.Status.COMPLETED,
            Service.Status.DRAFT,
        ]
        service_types = list(Service.ServiceType.values)

        for i in range(num_services):
            mem = random.choice(memorials)
            status = random.choice(statuses)
            start = now + timedelta(days=random.randint(-7, 14))
            svc = Service.objects.create(
                memorial=mem,
                service_type=random.choice(service_types),
                status=status,
                scheduled_start=start,
                scheduled_date=start.date(),
                completed_date=start.date() if status == Service.Status.COMPLETED else None,
                estimated_minutes=random.choice([60, 90, 120, 180]),
            )
            ServiceAssignment.objects.get_or_create(service=svc, employee=tech_emp, defaults={"role": ServiceAssignment.AssignmentRole.LEAD})

            if status == Service.Status.COMPLETED:
                amount = random.choice([150, 180, 220, 300])
                inv = Invoice.objects.create(
                    customer=mem.customer,
                    service=svc,
                    status=Invoice.Status.PAID,
                    issued_date=date.today() - timedelta(days=3),
                    due_date=date.today() - timedelta(days=1),
                    total_amount=amount,
                )
                InvoiceItem.objects.create(invoice=inv, description="Service fee", quantity=1, unit_price=amount)

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(customers)} customers, {len(memorials)} memorials, {num_services} services."))
