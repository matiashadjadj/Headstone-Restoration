from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_userprofile"),
    ]

    operations = [
        migrations.AlterField(
            model_name="employee",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("front_desk", "Front Desk"),
                    ("manager", "Manager"),
                    ("tech", "Technician"),
                    ("other", "Other"),
                ],
                default="tech",
                max_length=30,
            ),
        ),
    ]
