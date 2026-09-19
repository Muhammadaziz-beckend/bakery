from django.db import models


class DataTimeCUAbstract(models.Model):
    create_dt = models.DateTimeField("Дата создания", auto_now_add=True)
    update_dt = models.DateTimeField("Дата обновления", auto_now=True)

    class Meta:
        abstract = True


class ParentalOrganization(models.Model):

    organization = models.ForeignKey(
        "organization.Organization",
        models.CASCADE,
        related_name='%(class)s_set',
        verbose_name="Организация",
    )

    class Meta:
        abstract = True