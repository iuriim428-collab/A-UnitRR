---
name: YM billing API
description: Почему billing/transactions не работает с ACMA-токеном и откуда брать комиссию
---

## Правило

`GET /v2/campaigns/{campaignId}/billing/transactions` возвращает **404** при ACMA/IAM-токене. Нужен OAuth (y0_Ag...).

**Why:** YM billing API требует другой тип авторизации. С фейковым токеном этот endpoint даёт 401 (endpoint существует), а с реальным ACMA — 404 (доступ запрещён для этого типа токена).

## Правильный источник комиссии

`POST /v2/campaigns/{id}/stats/orders` — ответ содержит `order.commissions[].actual` с типом `AGENCY`. Это реальная начисленная сумма в рублях по каждому заказу. Парсер уже читает её в `ozonCommission`.

**How to apply:** Не пытаться использовать billing/transactions с ACMA-токеном. Использовать commissions[].actual из stats/orders как основной источник комиссии.

## Параметры billing endpoint (если понадобится с OAuth)

- Правильные имена параметров: `fromDate` и `toDate` (не `dateFrom`/`dateTo`)
- Формат: `YYYY-MM-DD` (не ISO datetime с timezone)
- URL: `/v2/campaigns/{campaignId}/billing/transactions`
