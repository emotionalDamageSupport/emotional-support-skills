# Example

A two-task MR in Russian, with a tracker URL pattern from `issue-tracker.md` (`https://tracker.example.com/<KEY>`). The domain is made up; the shape is what matters.

**Title**

```
SHOP-412 SHOP-415 fix: [Cart] Дата доставки в итоге заказа и иконки товаров в подсказке «+N»
```

**Description**

```markdown
## [SHOP-412](https://tracker.example.com/SHOP-412) — дата доставки на день раньше

В итоге заказа дата доставки показывалась на день раньше (14 Oct вместо 15 Oct при окне доставки до 15 Oct, 00:00).

Причина — `subMilliseconds(window.end, 1)` в `formatDeliveryRange`: остался с тех пор, когда конец окна хранился включительно.

- Убран сдвиг: подставляется `window.end`, как на странице заказа.
- Если начало и конец окна в один день, по-прежнему показывается одна дата.

## [SHOP-415](https://tracker.example.com/SHOP-415) — нет иконок в подсказке «+N»

`ItemList` из ui-kit рендерит подсказку как `renderItem={(item) => item}`, иконку туда не передать.

- Новый `CartItemsList` (`entities/cart/components`): первая позиция с иконкой и бейдж `+N`, в подсказке у каждой позиции своя иконка.
- Подключён в итоге заказа и в мини-корзине.

```diff
 <OrderSummary>
-  <ItemList items={names} />
+  <CartItemsList items={items} />
```

## Что не вошло

- Поддержка `renderItem` в самом `ItemList` — отдельной задачей в ui-kit; после неё `CartItemsList` можно удалить.

## Что проверить

- Заказ с окном доставки, заканчивающимся в 00:00: в итоге «14 Oct - 15 Oct».
- Наведение на «+N» в итоге заказа и в мини-корзине: у каждой позиции иконка слева.

## Замечания

- `yarn test related` зелёный (12 тестов). В браузере и на мобильных не проверялось.

## Blast radius

**Door:** two-way — только отображение, данные и контракты не меняются, откат ревертом.
**Radius:** screen

- Окно «10:00 → 00:00 следующего дня» теперь показывается двумя датами, а не одной — так же, как на странице заказа.
- `CartItemsList` используется в двух местах; ширина подсказки на мобильных может отличаться от прежней.
```
