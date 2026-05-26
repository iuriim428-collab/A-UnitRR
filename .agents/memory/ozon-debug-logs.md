---
name: Ozon debug logs
description: В ozon-api.ts остались временные console.log — нужно убрать
---

## Правило
В `artifacts/api-server/src/routes/ozon-api.ts` есть debug-логи (saleOp и первая операция), добавленные при отладке.

**Why:** Добавили для диагностики парсинга операций Ozon API. Ozon API работает корректно (200 OK, 1207 операций), логи больше не нужны.

**How to apply:** Удалить `console.log` / `req.log.debug` строки про saleOp и first operation из ozon-api.ts перед следующей сессией или релизом.
