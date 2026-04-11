from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_employeeinvite_revoked_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="photo",
            name="uploaded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="uploaded_photos",
                to="core.employee",
            ),
        ),
    ]
