from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_serviceoption_alter_plot_gps_lat_alter_plot_gps_lng_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="employeeinvite",
            name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
