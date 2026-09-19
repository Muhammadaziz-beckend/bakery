from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.signals import pre_save, post_delete
from django.dispatch import receiver
from django.db import models

from ..models import TransactionItemIngredient, Ingredient


@receiver(pre_save, sender=TransactionItemIngredient)
def sync_warehouse_on_item_save(
    sender,
    instance: TransactionItemIngredient,
    raw,
    **kwargs,
):
    if raw:
        return

    with transaction.atomic():
        # блокируем строку ингредиента на время пересчёта — защита от гонки
        ingredient = Ingredient.objects.select_for_update().get(
            pk=instance.ingredient_id
        )

        if instance.pk is None:
            # новая позиция прихода — на склад идёт всё count целиком
            delta = instance.count
        else:
            # позицию редактируют — берём разницу с тем, что было в БД
            old_count = (
                TransactionItemIngredient.objects.filter(pk=instance.pk)
                .values_list("count", flat=True)
                .first()
            ) or 0
            delta = instance.count - old_count

        if delta:
            if ingredient.count_in_warehouse + delta < 0:
                # уменьшают count позиции прихода, а сырьё из неё уже частично
                # израсходовано — уводить склад в минус нельзя
                raise ValidationError(
                    {
                        "count": (
                            f"Нельзя уменьшить количество: сырьё уже частично "
                            f"израсходовано (на складе {ingredient.count_in_warehouse})."
                        )
                    }
                )
            ingredient.count_in_warehouse += delta
            ingredient.save(update_fields=["count_in_warehouse"])

        instance.old_count = instance.count
        instance.is_plus = True


@receiver(post_delete, sender=TransactionItemIngredient)
def revert_warehouse_on_item_delete(
    sender,
    instance: TransactionItemIngredient,
    **kwargs,
):
    if not instance.is_plus:
        return
    with transaction.atomic():
        ingredient = Ingredient.objects.select_for_update().get(
            pk=instance.ingredient_id
        )
        if ingredient.count_in_warehouse < instance.count:
            # часть этого прихода уже израсходована (производство и т.п.) —
            # безусловное вычитание увело бы склад в минус
            raise ValidationError(
                {
                    "count": (
                        f"Нельзя удалить приход: сырьё уже частично израсходовано "
                        f"(на складе {ingredient.count_in_warehouse}, "
                        f"в этом приходе было {instance.count})."
                    )
                }
            )
        Ingredient.objects.filter(pk=instance.ingredient_id).update(
            count_in_warehouse=models.F("count_in_warehouse") - instance.count
        )
